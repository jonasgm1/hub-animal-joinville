import { parseHTML } from "linkedom/worker";
import robotsParser from "robots-parser";
import registry from "../data/sources.json" with { type: "json" };
import { type Entry, localUTC, slugify } from "./model";

export interface MonitorSource {
  id: string;
  kind: "events" | "service";
  url: string;
}
interface Observation {
  url: string;
  context: string;
  published?: string;
  draft?: Entry;
}
type FetchPage = (url: string, init: RequestInit) => Promise<Response>;

const publisher = "https://www.joinville.sc.gov.br";
const robotsUrl = publisher + "/robots.txt";
const agent = "AnimalJoinville";
const pageLimit = 700 * 1024;
export const monitorSources: MonitorSource[] = registry.map(
  ({ id, kind, url }) => {
    if (
      (kind !== "events" && kind !== "service") ||
      new URL(url).origin !== publisher
    ) {
      throw new Error("Fonte fora do catálogo municipal.");
    }
    return { id, kind, url };
  },
);

const clean = (value: string) =>
  value.replace(/\s+/gu, " ").normalize("NFC").trim();
const fold = (value: string) =>
  clean(value).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

async function download(
  url: string,
  fetcher: FetchPage,
  type: "text/html" | "text/plain",
) {
  const max = type === "text/plain" ? 64 * 1024 : pageLimit;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetcher(url, {
      redirect: "manual",
      credentials: "omit",
      signal: controller.signal,
      headers: { "user-agent": agent + "/1.0", accept: type },
    });
    if (response.status !== 200 || (response.url && response.url !== url)) {
      await response.body?.cancel();
      throw new Error(
        "Fonte indisponível ou redirecionada (HTTP " + response.status + ").",
      );
    }
    const mime = response.headers
      .get("content-type")
      ?.split(";")[0]
      .trim()
      .toLowerCase();
    if (
      mime !== type ||
      Number(response.headers.get("content-length")) > max ||
      !response.body
    ) {
      await response.body?.cancel();
      throw new Error("Tipo ou tamanho da resposta fora do esperado.");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    let html = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > max) {
          await reader.cancel();
          throw new Error("Fonte excedeu o limite de leitura.");
        }
        html += decoder.decode(value, { stream: true });
      }
      return html + decoder.decode();
    } finally {
      reader.releaseLock();
    }
  } finally {
    clearTimeout(timer);
  }
}

function contentRoot(html: string) {
  const { document } = parseHTML(html);
  const main =
    document.querySelector("main") ?? document.querySelector('[role="main"]');
  if (!main) throw new Error("Estrutura alterada: conteúdo principal ausente.");
  for (const element of main.querySelectorAll(
    'script,style,noscript,iframe,nav,[role="navigation"],[hidden]',
  ))
    element.remove();
  return main;
}

const text = (fragment: string) =>
  clean(
    fragment
      .replace(/<[^>]*>/g, " ")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&"),
  );

// Regex instead of a DOM: the search page is ~400 KB and a DOM parse costs ~50 ms of Worker CPU.
function fairLinks(html: string) {
  const start = html.search(/<main[\s>]/i),
    end = html.lastIndexOf("</main>");
  if (start < 0 || end < start)
    throw new Error("Estrutura alterada: conteúdo principal ausente.");
  const main = html.slice(start, end);
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(main)?.[1] || "";
  if (!fold(text(h1)).includes("noticias")) {
    throw new Error("Estrutura alterada: lista de notícias ausente.");
  }
  let listings = 0;
  const urls = new Set<string>();
  for (const [, href, label] of main.matchAll(
    /<a\s[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const url = URL.parse(href.replace(/&amp;/g, "&"), publisher);
    if (
      !url ||
      url.origin !== publisher ||
      url.username ||
      url.password ||
      !/^\/noticias\/[a-z0-9-]+\/$/.test(url.pathname) ||
      url.search ||
      url.hash
    )
      continue;
    listings++;
    const title = fold(text(label));
    if (
      /\b(feira|feirinha|mutirao|campanha|petfolia|vacinacao)\b/.test(title) &&
      /\b(adocao|cbea|animais|animal|caes|gatos|castracao|pets)\b/.test(title)
    )
      urls.add(url.href);
  }
  if (
    !listings &&
    !/nenhum resultado|nenhuma noticia encontrada/.test(fold(text(main)))
  ) {
    throw new Error("Estrutura alterada: links das notícias ausentes.");
  }
  return [...urls].slice(0, 6);
}

const weekdays = [
  "domingo",
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
];
const months = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const pad = (n: number | string) => String(n).padStart(2, "0");

// The announced day, read relative to the publication date in Joinville time (YYYY-MM-DD).
export function announcedDay(body: string, published: string) {
  const t = fold(body);
  const p = new Date(Date.parse(published) - 3 * 3600000);
  const base = Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate());
  const scan = (days: number, ok: (d: Date) => boolean) => {
    for (let i = 0; i <= days; i++) {
      const d = new Date(base + i * 86400000);
      if (ok(d)) return d.toISOString().slice(0, 10);
    }
  };
  const w = new RegExp(
    String.raw`\b(?:neste|nesta|proximo|proxima)\s+(${weekdays.join("|")})(?:-feira)?(?:\s*\((\d{1,2})(?:/(\d{1,2}))?\))?`,
  ).exec(t);
  if (w) {
    const [, name, day, month] = w;
    return scan(day ? 62 : 13, (d) =>
      day
        ? d.getUTCDate() === +day && (!month || d.getUTCMonth() + 1 === +month)
        : d.getUTCDay() === weekdays.indexOf(name),
    );
  }
  const numeric = /\b(\d{1,2})\/(\d{1,2})\b/.exec(t);
  const spelled = new RegExp(
    String.raw`\b(\d{1,2})o? de (${months.join("|")})\b`,
  ).exec(t);
  const [day, month] = numeric
    ? [+numeric[1], +numeric[2]]
    : spelled
      ? [+spelled[1], months.indexOf(spelled[2]) + 1]
      : [0, 0];
  if (!day || month < 1 || month > 12) return undefined;
  return scan(
    120,
    (d) => d.getUTCDate() === day && d.getUTCMonth() + 1 === month,
  );
}

// A moderation draft, only when the day, the hours and an address-like place are all stated.
export function draftEvent(
  title: string,
  body: string,
  url: string,
  published: string,
): Entry | undefined {
  const day = announcedDay(body, published);
  const t = fold(body);
  const hours =
    /\bdas?\s+(\d{1,2})h(\d{2})?\s*(?:as|a|ate)\s+(\d{1,2})h(\d{2})?/.exec(t);
  const place =
    /\b(?:no|na|nos|nas)\s+([^.;:]{3,160}?\((?:rua|r\.|avenida|av\.|rodovia|estrada|praça|praca|travessa|servidão)\s[^)]{2,120}\))/iu.exec(
      body.slice(hours?.index ?? 0),
    );
  if (!day || !hours || !place) return undefined;
  let start, end;
  try {
    start = localUTC(day + "T" + pad(hours[1]) + ":" + pad(hours[2] || 0));
    end = localUTC(day + "T" + pad(hours[3]) + ":" + pad(hours[4] || 0));
  } catch {
    return undefined;
  }
  if (end <= start) return undefined;
  const kind = fold(title + " " + body.slice(0, 400));
  const cbea = /\bcbea\b|centro de bem-estar animal/.test(t);
  return {
    slug: slugify(title).slice(0, 70).replace(/-$/, "") + "-" + day,
    title: title.slice(0, 160),
    description: (
      body.match(/^.{40,300}?[.!](?=\s|$)/u)?.[0] || body.slice(0, 300)
    ).trim(),
    sourceUrl: url,
    verifiedAt: published.slice(0, 10),
    type:
      /\bfeira\b/.test(kind) && kind.includes("adocao")
        ? "Feira de adoção"
        : /\bmutirao\b/.test(kind)
          ? "Mutirão"
          : "Campanha",
    start,
    end,
    location: clean(place[1]).slice(0, 280) + ", Joinville/SC",
    organizer: cbea
      ? "Centro de Bem-Estar Animal (CBEA)"
      : "Prefeitura de Joinville",
    ...(cbea ? { organization: "cbea" } : {}),
    contact: url,
  };
}

async function describe(
  html: string,
  url: string,
  kind: MonitorSource["kind"],
): Promise<Observation> {
  const main = contentRoot(html);
  const title = clean(main.querySelector("h1")?.textContent || "");
  const article =
    main.querySelector("article") ??
    main.querySelector('[itemprop="articleBody"]');
  if (!title || !article)
    throw new Error("Estrutura alterada: título ou artigo ausente.");
  const body = clean(article.innerText);
  const headings = fold(
    Array.from(article.querySelectorAll("h2,h3"), (h) => h.textContent).join(
      " ",
    ),
  );
  if (
    body.length < 80 ||
    (kind === "service" &&
      (!headings.includes("quem pode") || !headings.includes("quanto custa")))
  ) {
    throw new Error("Estrutura alterada: faltam seções essenciais.");
  }
  const links = Array.from(article.querySelectorAll("a[href]"), (a) =>
    a.getAttribute("href"),
  ).join("\n");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode([title, body, links].join("\n")),
  );
  const checksum = Array.from(new Uint8Array(digest), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
  const fields = [title.slice(0, 240)];
  if (kind === "service") {
    const revision = body.match(
      /Última atualização:\s*(\d{2}\/\d{2}\/\d{4}(?:\s+às\s+\d\d:\d\d)?)/iu,
    )?.[1];
    if (revision) fields.push("Revisão indicada na carta: " + revision);
    const phones = [...new Set(body.match(/\(\d{2}\)\s*\d{4,5}[- ]\d{4}/g))];
    if (phones.length)
      fields.push("Telefones encontrados: " + phones.join(", "));
  } else {
    const announced = body.match(/\b\d{1,2}\/\d{1,2}(?:\/\d{4})?\b/g);
    const hours = body.match(/\b\d{1,2}h(?:\d{2})?\b/gi);
    if (announced)
      fields.push(
        "Datas mencionadas no texto: " +
          [...new Set(announced)].slice(0, 8).join(", "),
      );
    if (hours)
      fields.push(
        "Horários mencionados no texto: " +
          [...new Set(hours)].slice(0, 8).join(", "),
      );
  }
  fields.push("Impressão digital da fonte: " + checksum);
  if (kind === "service") return { url, context: fields.join("\n") };
  const stamp =
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i.exec(
      html,
    )?.[1];
  const published =
    stamp && Number.isFinite(Date.parse(stamp))
      ? new Date(stamp).toISOString()
      : undefined;
  if (published) fields.splice(1, 0, "Publicada em: " + published.slice(0, 10));
  return {
    url,
    context: fields.join("\n"),
    published,
    draft: published ? draftEvent(title, body, url, published) : undefined,
  };
}

export async function observe(
  source: MonitorSource,
  fetcher: FetchPage = fetch,
): Promise<Observation[]> {
  const known = monitorSources.find(
    (s) => s.id === source.id && s.url === source.url && s.kind === source.kind,
  );
  if (!known) throw new Error("Fonte fora do catálogo municipal.");
  const rules = await download(robotsUrl, fetcher, "text/plain");
  if (!/^\s*user-agent\s*:/im.test(rules))
    throw new Error("Diretrizes robots.txt inválidas.");
  const policy = robotsParser(robotsUrl, rules);
  const delay = policy.getCrawlDelay(agent) ?? 0;
  if (delay > 10)
    throw new Error("Intervalo de coleta da origem exige revisão.");
  const page = async (url: string) => {
    if (policy.isAllowed(url, agent) !== true)
      throw new Error("Consulta bloqueada por robots.txt.");
    if (delay > 0)
      await new Promise((resolve) => setTimeout(resolve, delay * 1000));
    return download(url, fetcher, "text/html");
  };
  const html = await page(known.url);
  if (known.kind === "service")
    return [await describe(html, known.url, known.kind)];
  const found = [];
  for (const url of fairLinks(html))
    found.push(await describe(await page(url), url, known.kind));
  return found;
}
