import { createRemoteJWKSet, jwtVerify } from "jose";
import { type Env, Problem, field } from "./model";
const keys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function identity(req: Request, env: Env) {
  if (
    !env.ACCESS_TEAM ||
    !env.ACCESS_AUD ||
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM)
  )
    throw new Problem(
      403,
      "O acesso administrativo exige identificação pelo Cloudflare Access.",
    );
  const token = req.headers.get("cf-access-jwt-assertion");
  if (!token)
    throw new Problem(
      403,
      "Entre pelo endereço protegido pelo Cloudflare Access.",
    );
  const key =
    keys.get(env.ACCESS_TEAM) ||
    createRemoteJWKSet(new URL(env.ACCESS_TEAM + "/cdn-cgi/access/certs"));
  keys.set(env.ACCESS_TEAM, key);
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: env.ACCESS_TEAM,
      audience: env.ACCESS_AUD,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub", "email"],
    });
    if (
      typeof payload.email === "string" &&
      (await env.DB.prepare(
        "SELECT 1 FROM admin_users WHERE email=? AND active=1",
      )
        .bind(payload.email)
        .first())
    )
      return payload.email.toLowerCase();
  } catch {
    /* Access rejects unavailable or invalid identity assertions. */
  }
  throw new Problem(403, "Esta conta não tem acesso à moderação.");
}
export async function readForm(req: Request) {
  if (req.headers.get("Origin") !== new URL(req.url).origin)
    throw new Problem(403, "A origem da solicitação é inválida.");
  if (
    !/^application\/x-www-form-urlencoded(?:;|$)/i.test(
      req.headers.get("content-type") || "",
    )
  )
    throw new Problem(415, "Envie os dados pelo formulário.");
  const reader = req.body?.getReader();
  if (!reader) throw new Problem(400, "Formulário vazio.");
  let len = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    len += value.length;
    if (len > 32768) {
      await reader.cancel();
      throw new Problem(413, "O envio ultrapassou o limite de tamanho.");
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(len);
  let i = 0;
  for (const p of parts) {
    bytes.set(p, i);
    i += p.length;
  }
  const f = new FormData();
  for (const [k, v] of new URLSearchParams(new TextDecoder().decode(bytes))) {
    if (f.has(k)) throw new Problem(422, "Campo duplicado.");
    f.set(k, v);
  }
  return f;
}
export async function verifyHuman(req: Request, f: FormData, env: Env) {
  if (!env.TURNSTILE_SECRET || !env.TURNSTILE_SITE_KEY)
    throw new Problem(
      503,
      "O recebimento de eventos aguarda a configuração da proteção contra spam.",
    );
  const response = field(f, "cf-turnstile-response", 2048, true);
  const result = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response }),
      signal: AbortSignal.timeout(7000),
    },
  )
    .then(
      (r) =>
        r.json() as Promise<{
          success: boolean;
          hostname: string;
          action: string;
        }>,
    )
    .catch(() => null);
  if (!result)
    throw new Problem(
      503,
      "A verificação antispam está indisponível. Tente de novo.",
    );
  if (
    !result.success ||
    result.hostname !== new URL(req.url).hostname ||
    result.action !== "enviar_evento"
  )
    throw new Problem(422, "Conclua novamente a verificação antispam.");
}
export async function rateLimit(req: Request, env: Env) {
  if (!env.RATE_SECRET)
    throw new Problem(503, "O recebimento de eventos aguarda configuração.");
  const window = Math.floor(Date.now() / 3600000);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.RATE_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(
      window + "|" + (req.headers.get("CF-Connecting-IP") || "local"),
    ),
  );
  const bucket = Array.from(new Uint8Array(bytes), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
  const r = await env.DB.prepare(
    "INSERT INTO rate_limits(bucket,hits,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1 WHERE hits<6",
  )
    .bind(bucket, new Date((window + 1) * 3600000).toISOString())
    .run();
  if (!r.meta.changes)
    throw new Problem(429, "Limite de envios atingido. Tente na próxima hora.");
}
