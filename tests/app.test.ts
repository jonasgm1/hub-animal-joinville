import { describe, it, expect } from "vitest";
import { memoryDb } from "./sqlite";
import { handle } from "../src/app";
import { seed, syncCatalog, listed, raw } from "../src/db";
import {
  type Env,
  type Table,
  localUTC,
  matchService,
  Problem,
  validateEntry,
} from "../src/model";
import { maintenance } from "../src/maintenance";
import { monitorSources } from "../src/collect";
import { readFileSync } from "node:fs";
const origin = "https://local.example";
function setup() {
  const { db, sql } = memoryDb();
  const env: Env = { DB: db };
  return {
    db,
    sql,
    call: (path: string, init: RequestInit = {}) =>
      handle(new Request(origin + path, init), env),
  };
}
const tables: Table[] = ["organizations", "services", "events"];
// Forces syncCatalog to run again, as a new version of data/seed.json would.
const forget = (sql: ReturnType<typeof memoryDb>["sql"]) =>
  sql.prepare("DELETE FROM settings WHERE key LIKE 'catalog-%'").run();

describe("Catálogo semanal (data/seed.json)", () => {
  it("todas as entradas são válidas, únicas e apontam para organizações existentes", () => {
    for (const t of tables) {
      const slugs = seed[t].map((e) => e.slug);
      expect(new Set(slugs).size, t).toBe(slugs.length);
      for (const e of seed[t])
        expect(() => validateEntry(t, e), e.slug).not.toThrow();
    }
    const orgs = new Set(seed.organizations.map((o) => o.slug));
    for (const e of [...seed.services, ...seed.events])
      if (e.organization) expect(orgs.has(e.organization), e.slug).toBe(true);
  });
  it("sincroniza uma vez, atualiza edições, arquiva removidos e preserva a coleta", async () => {
    const { db, sql, call } = setup();
    await call("/");
    expect(await listed(db, "services")).toHaveLength(seed.services.length);
    const castracao = seed.services.find((e) => e.slug === "castracao")!;
    expect(
      matchService(
        castracao,
        new URLSearchParams("q=castracao&acesso=criterios"),
      ),
    ).toBe(true);
    const revision = (slug: string) =>
      sql.prepare("SELECT revision FROM services WHERE slug=?").get(slug)
        ?.revision;
    const [edited, removed] = seed.services;
    const first = revision(edited.slug);
    forget(sql);
    await syncCatalog(db);
    expect(revision(edited.slug)).toBe(first);

    sql
      .prepare("INSERT INTO sources(id,url,kind) VALUES('x','x','reference')")
      .run();
    sql
      .prepare(
        "INSERT INTO events(slug,data,source_id,identity,ends_at,status,actor,updated_at) VALUES('coletado','{}','x','id','2999-01-01','published','coleta-automatica','x')",
      )
      .run();
    const all = seed.services;
    try {
      seed.services = [
        { ...edited, title: "Título revisado" },
        ...all.slice(2),
      ];
      forget(sql);
      await syncCatalog(db);
      expect(
        JSON.parse((await raw(db, "services", edited.slug))!.data).title,
      ).toBe("Título revisado");
      expect((await raw(db, "services", removed.slug))!.status).toBe(
        "archived",
      );
      expect((await raw(db, "events", "coletado"))!.status).toBe("published");
      seed.services = all;
      forget(sql);
      await syncCatalog(db);
      expect((await raw(db, "services", removed.slug))!.status).toBe(
        "published",
      );
      expect(
        JSON.parse((await raw(db, "services", edited.slug))!.data).title,
      ).toBe(edited.title);
    } finally {
      seed.services = all;
    }
  });
  it("mantém texto do catálogo escapado", async () => {
    const e = seed.services[0];
    const original = e.description;
    e.description = "Texto <b>literal</b>";
    try {
      const { call } = setup();
      const html = await (await call("/servicos/" + e.slug)).text();
      expect(html).toContain("&lt;b&gt;literal&lt;/b&gt;");
    } finally {
      e.description = original;
    }
  });
});

describe("Site somente leitura", () => {
  it("serve as páginas públicas e recusa qualquer escrita", async () => {
    const { call } = setup();
    for (const path of [
      "/",
      "/servicos",
      "/agenda",
      "/organizacoes",
      "/sobre",
      "/privacidade",
    ]) {
      const res = await call(path);
      expect(res.status, path).toBe(200);
      expect(await res.text(), path).not.toContain("enviar-evento");
    }
    expect((await call("/enviar-evento")).status).toBe(404);
    expect((await call("/admin")).status).toBe(404);
    expect(
      (await call("/agenda", { method: "POST", body: "x=1" })).status,
    ).toBe(405);
    const head = await call("/agenda", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
  });
  it("converte horário de Joinville e rejeita datas impossíveis", () => {
    expect(() => localUTC("2027-02-30T10:00")).toThrow(Problem);
    expect(localUTC("2027-01-01T23:50")).toBe("2027-01-02T02:50:00.000Z");
  });
});

describe("Coleta automática", () => {
  it("arquiva vencidos e protege o catálogo se o portal de origem falhar", async () => {
    const { db, sql, call } = setup();
    await call("/");
    sql
      .prepare(
        "UPDATE events SET ends_at='2000-01-01T00:00:00.000Z', revision=revision+1",
      )
      .run();
    await maintenance(db, async () => new Response("", { status: 503 }));
    expect(await listed(db, "events")).toHaveLength(0);
    expect(await listed(db, "events", true)).toHaveLength(seed.events.length);
    expect(
      sql
        .prepare("SELECT count(*) AS n FROM scrape_runs WHERE status='failed'")
        .get()?.n,
    ).toBe(monitorSources.length);
    expect(await listed(db, "services")).toHaveLength(seed.services.length);
    expect(await (await call("/sobre")).text()).toContain("falhou em");
  });
  it("publica notícia nova com selo de coleta automática, sem duplicar", async () => {
    const { db, call } = setup();
    await call("/");
    const day = new Date(Date.now() + 10 * 86400000);
    const ddmm = day.getUTCDate() + "/" + (day.getUTCMonth() + 1);
    const article =
      "https://www.joinville.sc.gov.br/noticias/cbea-promove-feira-de-adocao-teste/";
    const fixture = (name: string) =>
      readFileSync(new URL("./fixtures/" + name, import.meta.url), "utf8");
    const page = (s: string, type = "text/html") =>
      new Response(s, {
        headers: { "content-type": type + "; charset=utf-8" },
      });
    const network = async (url: string) => {
      if (url.endsWith("/robots.txt"))
        return page(fixture("pmj-robots.txt"), "text/plain");
      if (url.includes("/servicos/")) return page(fixture("pmj-carta.html"));
      if (url === article)
        return page(
          `<head><meta property="article:published_time" content="${new Date().toISOString()}"></head><main><h1>CBEA promove feira de adoção de teste</h1><article><p>O Centro de Bem-Estar Animal (CBEA) promove feira de adoção na próxima sexta-feira (${ddmm}). O evento ocorre das 9h às 13h, na Praça de Teste (rua do Príncipe, 100 – Centro).</p></article></main>`,
        );
      return page(
        `<main><h1>Buscando em Notícias</h1><a href="${article}">CBEA promove feira de adoção de teste</a></main>`,
      );
    };
    await maintenance(db, network as typeof fetch);
    await maintenance(db, network as typeof fetch);
    const found = (await listed(db, "events")).filter((e) => e.automatic);
    expect(found).toHaveLength(1);
    expect(await (await call("/agenda")).text()).toContain(
      "CBEA promove feira de adoção de teste",
    );
    const detail = await (await call("/agenda/" + found[0].slug)).text();
    expect(detail).toContain("Coletado automaticamente");
    expect(detail).toContain(article);
  });
});
