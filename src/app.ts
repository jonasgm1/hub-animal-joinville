import { type Env, Problem, tables, paths } from "./model";
import { esc, heading, type View } from "./html";
import { listed, syncCatalog } from "./db";
import { publicView } from "./public";
import { maintenance } from "./maintenance";
import compiled from "aj:assets";
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'none'; base-uri 'none'; img-src 'self' data:; style-src 'self'; form-action 'self'; frame-ancestors 'none'",
};
function html(v: View, url: URL, status = 200) {
  const canonical = esc(url.origin + url.pathname),
    title = esc(v.title + " · Hub Animal Joinville"),
    desc = esc(v.description || v.title);
  const head =
    `<meta name="description" content="${desc}"><link rel="canonical" href="${canonical}"><meta property="og:locale" content="pt_BR"><meta property="og:type" content="website"><meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:url" content="${canonical}">` +
    (status >= 400 ? '<meta name="robots" content="noindex">' : "") +
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
const synced = new WeakSet<D1Database>();
// A bad catalog or an unavailable database must not take the site down: keep serving what D1 has.
async function ensureCatalog(db: D1Database) {
  if (synced.has(db)) return;
  try {
    await syncCatalog(db);
    synced.add(db);
  } catch (err) {
    console.error("Falha ao sincronizar o catálogo", err);
  }
}
export async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url),
    path = url.pathname;
  try {
    if (req.method === "HEAD") {
      const get = await handle(
        new Request(req.url, { headers: req.headers }),
        env,
      );
      return new Response(null, get);
    }
    if (req.method !== "GET") throw new Problem(405, "Método não disponível.");
    if (compiled.assets[path]) {
      const a = compiled.assets[path];
      return textResponse(a.body, a.type);
    }
    if (env.PUBLIC_ORIGIN) url.host = new URL(env.PUBLIC_ORIGIN).host;
    if (path === "/robots.txt")
      return textResponse(
        "User-agent: *\nAllow: /\nSitemap: " + url.origin + "/sitemap.xml\n",
        "text/plain",
      );
    if (!env.DB)
      throw new Problem(
        503,
        "O diretório aguarda a conexão com o banco de dados.",
      );
    await ensureCatalog(env.DB);
    if (path === "/sitemap.xml") {
      const routes = ["/", "/servicos", "/agenda", "/organizacoes", "/sobre"];
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
  fetch: (req: Request, env: Env) => handle(req, env),
  scheduled: (_c: ScheduledController, env: Env, ctx: ExecutionContext) =>
    ctx.waitUntil(ensureCatalog(env.DB).then(() => maintenance(env.DB))),
};
