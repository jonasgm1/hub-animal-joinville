import { describe, it, expect, vi } from "vitest";
import { memoryDb } from "./sqlite";
import { handle } from "../src/app";
import { seedIfNew, seed, save, raw, listed } from "../src/db";
import { type Env, localUTC, matchService, Problem } from "../src/model";
import { maintenance } from "../src/maintenance";
import { monitorSources } from "../src/collect";
import { readFileSync } from "node:fs";
import { verifyHuman, identity } from "../src/security";
const origin = "https://local.example",
  ctx = { waitUntil: () => {} };
const deps = {
  authenticate: async () => "editor@example.test",
  challenge: async () => {},
};
const next = new Date(Date.now() + 35 * 86400000).toISOString().slice(0, 10);
const fields = {
  title: "Feira local de teste",
  description: "Evento controlado para teste.",
  type: "Feira de adoção",
  start: next + "T10:00",
  end: next + "T14:00",
  location: "Local de teste, Joinville",
  organizer: "Organização de teste",
  contact: "publico@example.test",
  sourceUrl: "https://example.test/fonte",
  joinville: "sim",
  sender: "Responsável de teste",
  private_contact: "privado@example.test",
};
function request(path: string, body?: Record<string, string>) {
  return new Request(
    origin + path,
    body
      ? {
          method: "POST",
          headers: { Origin: origin },
          body: new URLSearchParams(body),
        }
      : {},
  );
}
function setup() {
  const { db, sql } = memoryDb();
  const env: Env = { DB: db, RATE_SECRET: "fixture" };
  return {
    db,
    sql,
    env,
    call: (path: string, body?: Record<string, string>) =>
      handle(request(path, body), env, ctx, deps),
  };
}
describe("Diretório e moderação", () => {
  it("importa a curadoria uma vez e mantém critérios junto ao programa", async () => {
    const { db } = setup();
    await seedIfNew(db);
    await seedIfNew(db);
    expect(await listed(db, "services")).toHaveLength(seed.services.length);
    const e = seed.services.find((e) => e.slug === "castracao")!;
    expect(
      matchService(e, new URLSearchParams("q=castracao&acesso=criterios")),
    ).toBe(true);
    expect(matchService(e, new URLSearchParams("acesso=aberto"))).toBe(false);
    expect(e.eligibility).toContain("5%");
  });
  it("envia, bloqueia duplicata, aprova em transação e remove o contato privado", async () => {
    const { call, db, sql } = setup();
    expect((await call("/enviar-evento", fields)).status).toBe(303);
    expect((await call("/enviar-evento", fields)).status).toBe(409);
    const row = sql.prepare("SELECT id FROM submissions").get()!;
    expect(await (await call("/agenda")).text()).not.toContain(fields.title);
    expect(
      (
        await call("/admin/moderar", {
          id: String(row.id),
          decision: "aprovar",
        })
      ).status,
    ).toBe(303);
    expect(
      (
        await call("/admin/moderar", {
          id: String(row.id),
          decision: "aprovar",
        })
      ).status,
    ).toBe(409);
    const ev = (await listed(db, "events")).find(
      (r) => r.title === fields.title,
    )!;
    expect(ev).toBeDefined();
    const page = await (await call("/agenda/" + ev.slug)).text();
    expect(page).toContain(fields.title);
    expect(page).not.toContain(fields.private_contact);
    expect(
      sql.prepare("SELECT private_contact FROM submissions").get()
        ?.private_contact,
    ).toBeNull();
  });
  it("rejeita, limpa contato e mantém o evento privado", async () => {
    const { call, sql } = setup();
    await call("/enviar-evento", fields);
    const row = sql.prepare("SELECT id FROM submissions").get()!;
    await call("/admin/moderar", { id: String(row.id), decision: "rejeitar" });
    expect(
      sql.prepare("SELECT status,sender FROM submissions").get(),
    ).toMatchObject({ status: "rejected", sender: null });
    expect(await (await call("/agenda")).text()).not.toContain(fields.title);
  });
  it("preserva a versão nova quando há edição concorrente e restaura pelo histórico", async () => {
    const { db, call, sql } = setup();
    await seedIfNew(db);
    const e = { ...seed.services[0], title: "Edição conferida" };
    await save(db, "services", e, 1, "editor");
    await expect(save(db, "services", e, 1, "outro")).rejects.toMatchObject({
      status: 409,
    });
    const version = sql
      .prepare(
        "SELECT id FROM change_history WHERE entity='services' AND slug=? AND revision=1",
      )
      .get(e.slug)!.id;
    const res = await call("/admin/restaurar", {
      table: "services",
      slug: e.slug,
      revision: "2",
      version: String(version),
    });
    expect(res.status).toBe(303);
    expect(JSON.parse((await raw(db, "services", e.slug))!.data).title).toBe(
      seed.services[0].title,
    );
  });
  it("arquiva vencidos e protege o catálogo se o portal de origem falhar", async () => {
    const { db, sql } = setup();
    await seedIfNew(db);
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
  });
  it("transforma notícia nova em rascunho pendente, sem publicar nem duplicar", async () => {
    const { db, sql, call } = setup();
    await seedIfNew(db);
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
    const rows = sql
      .prepare("SELECT id,sender,private_contact FROM submissions")
      .all();
    expect(rows).toEqual([
      { id: rows[0].id, sender: "Coleta automática", private_contact: null },
    ]);
    expect(await (await call("/agenda")).text()).not.toContain(
      "feira de adoção de teste",
    );
    expect(await (await call("/admin")).text()).toContain(
      "Rascunho da coleta automática",
    );
    await call("/admin/moderar", {
      id: String(rows[0].id),
      decision: "aprovar",
    });
    expect(await (await call("/agenda")).text()).toContain(
      "CBEA promove feira de adoção de teste",
    );
  });
  it("bloqueia origem divergente, links inseguros, datas impossíveis e tentativas em excesso", async () => {
    const { env, call } = setup();
    expect(() => localUTC("2027-02-30T10:00")).toThrow(Problem);
    expect(localUTC("2027-01-01T23:50")).toBe("2027-01-02T02:50:00.000Z");
    const r = request("/enviar-evento", fields);
    r.headers.set("Origin", "https://alheio.example");
    expect((await handle(r, env, ctx, deps)).status).toBe(403);
    expect(
      (
        await call("/enviar-evento", {
          ...fields,
          sourceUrl: "data:text/plain,invalido",
        })
      ).status,
    ).toBe(422);
    for (let i = 0; i < 6; i++)
      await call("/enviar-evento", { ...fields, title: "Evento " + i });
    expect((await call("/enviar-evento", fields)).status).toBe(429);
  });
  it("falha fechada para admin e verifica ação e domínio do Turnstile", async () => {
    const { env } = setup();
    expect((await handle(request("/admin"), env, ctx)).status).toBe(403);
    await expect(
      identity(request("/admin"), {
        ...env,
        ACCESS_TEAM: "https://test.cloudflareaccess.com",
        ACCESS_AUD: "teste",
      }),
    ).rejects.toMatchObject({ status: 403 });
    const form = new FormData();
    form.set("cf-turnstile-response", "fixture");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          hostname: "outro.example",
          action: "enviar_evento",
        }),
      ),
    );
    try {
      await expect(
        verifyHuman(request("/"), form, {
          ...env,
          TURNSTILE_SECRET: "teste",
          TURNSTILE_SITE_KEY: "teste",
        }),
      ).rejects.toMatchObject({ status: 422 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("mantém texto submetido escapado na moderação", async () => {
    const { call } = setup();
    await call("/enviar-evento", {
      ...fields,
      description: "Texto <b>literal</b>",
    });
    expect(await (await call("/admin")).text()).toContain(
      "&lt;b&gt;literal&lt;/b&gt;",
    );
  });
});
