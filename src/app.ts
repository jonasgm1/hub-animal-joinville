import {
  type Env,
  Problem,
  fingerprint,
  field,
  now,
  tables,
  paths,
} from "./model";
import { esc, heading, submissionForm, type View } from "./html";
import { listed, seedIfNew } from "./db";
import { identity, readForm, rateLimit, verifyHuman } from "./security";
import { fromForm } from "./fields";
import { adminAction, adminView } from "./admin";
import { publicView } from "./public";
import { maintenance } from "./maintenance";
import compiled from "aj:assets";
type Dependencies = {
  authenticate: typeof identity;
  challenge: typeof verifyHuman;
};
const production: Dependencies = {
  authenticate: identity,
  challenge: verifyHuman,
};
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'none'; base-uri 'none'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; img-src 'self' data:; style-src 'self'; form-action 'self'; frame-ancestors 'none'",
};
function html(v: View, url: URL, status = 200) {
  const canonical = esc(url.origin + url.pathname),
    title = esc(v.title + " · Animal Joinville"),
    desc = esc(v.description || v.title);
  const head =
    `<meta name="description" content="${desc}"><link rel="canonical" href="${canonical}"><meta property="og:locale" content="pt_BR"><meta property="og:type" content="website"><meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:url" content="${canonical}">` +
    (url.pathname.startsWith("/admin") || status >= 400
      ? '<meta name="robots" content="noindex">'
      : "") +
    (v.structured
      ? `<script type="application/ld+json">${JSON.stringify(v.structured).replaceAll("<", "\\u003c")}</script>`
      : "");
  const body = compiled.shell
    .replace("AJ_TITLE", () => title)
    .replace(/<meta name="aj-head"\s*\/?>/, () => head)
    .replace('<div id="aj-content"></div>', () => v.body);
  return new Response(body, {
    status,
    headers: {
      ...securityHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
function textResponse(body: string, type: string) {
  return new Response(body, {
    headers: { ...securityHeaders, "Content-Type": type + "; charset=utf-8" },
  });
}
const initialized = new WeakMap<D1Database, Promise<void>>();
export async function handle(
  req: Request,
  env: Env,
  ctx: Pick<ExecutionContext, "waitUntil">,
  deps = production,
): Promise<Response> {
  const url = new URL(req.url),
    path = url.pathname;
  try {
    if (!["GET", "POST", "HEAD"].includes(req.method))
      throw new Problem(405, "Método não disponível.");
    if (req.method === "HEAD") {
      const get = await handle(
        new Request(req.url, { headers: req.headers }),
        env,
        ctx,
        deps,
      );
      return new Response(null, get);
    }
    if (req.method === "GET" && compiled.assets[path]) {
      const a = compiled.assets[path];
      return textResponse(a.body, a.type);
    }
    if (env.PUBLIC_ORIGIN) url.host = new URL(env.PUBLIC_ORIGIN).host;
    if (path === "/robots.txt")
      return textResponse(
        "User-agent: *\nDisallow: /admin\nSitemap: " +
          url.origin +
          "/sitemap.xml\n",
        "text/plain",
      );
    const admin = path === "/admin" || path.startsWith("/admin/");
    const user = admin ? await deps.authenticate(req, env) : null;
    if (!env.DB)
      throw new Problem(
        503,
        "O diretório aguarda a conexão com o banco de dados.",
      );
    if (!initialized.has(env.DB))
      initialized.set(
        env.DB,
        seedIfNew(env.DB).catch((err) => {
          initialized.delete(env.DB);
          throw err;
        }),
      );
    await initialized.get(env.DB);
    if (req.method === "POST") {
      const f = await readForm(req);
      if (user) return await adminAction(req, env, f, user, ctx);
      if (path !== "/enviar-evento")
        throw new Problem(404, "Página desconhecida.");
      const e = fromForm("events", f, undefined, true);
      const sender = field(f, "sender", 160, true),
        contact = field(f, "private_contact", 254, true);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact))
        throw new Problem(422, "Informe um e-mail válido para a moderação.");
      await rateLimit(req, env);
      await deps.challenge(req, f, env);
      const id = fingerprint(e);
      const r = await env.DB.prepare(
        "INSERT INTO submissions(id,identity,data,sender,private_contact,created_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM events WHERE identity=?) ON CONFLICT DO NOTHING",
      )
        .bind(
          crypto.randomUUID(),
          id,
          JSON.stringify(e),
          sender,
          contact,
          now(),
          id,
        )
        .run();
      if (!r.meta.changes)
        throw new Problem(409, "Essa ocorrência já foi enviada ou publicada.");
      return new Response(null, {
        status: 303,
        headers: { Location: "/envio-recebido" },
      });
    }
    if (user) return html(await adminView(env, url), url);
    if (path === "/sitemap.xml") {
      const routes = [
        "/",
        "/servicos",
        "/agenda",
        "/organizacoes",
        "/sobre",
        "/enviar-evento",
      ];
      for (const t of tables) {
        for (const e of await listed(env.DB, t))
          routes.push("/" + paths[t] + "/" + e.slug);
      }
      return textResponse(
        '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
          routes
            .map((p) => "<url><loc>" + esc(url.origin + p) + "</loc></url>")
            .join("") +
          "</urlset>",
        "application/xml",
      );
    }
    if (path === "/enviar-evento")
      return html(
        {
          title: "Enviar evento",
          body: submissionForm(
            env.TURNSTILE_SECRET && env.RATE_SECRET
              ? env.TURNSTILE_SITE_KEY
              : undefined,
          ),
        },
        url,
      );
    if (path === "/envio-recebido")
      return html(
        {
          title: "Envio recebido",
          body:
            heading(
              "Evento enviado para análise",
              "A equipe vai conferir os dados e a publicação original.",
            ) + '<a href="/agenda">Consultar a agenda</a>',
        },
        url,
      );
    const view = await publicView(env, url);
    if (view) return html(view, url);
    throw new Problem(404, "Página não encontrada.");
  } catch (err) {
    const status = err instanceof Problem ? err.status : 500;
    const msg =
      err instanceof Problem
        ? err.message
        : "Não foi possível carregar esta página. Tente novamente em instantes.";
    return html(
      {
        title: msg,
        body: heading(msg) + '<p><a href="/">Voltar ao início</a></p>',
      },
      url,
      status,
    );
  }
}
export default {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) =>
    handle(req, env, ctx),
  scheduled: (_c: ScheduledController, env: Env, ctx: ExecutionContext) =>
    ctx.waitUntil(seedIfNew(env.DB).then(() => maintenance(env.DB))),
};
