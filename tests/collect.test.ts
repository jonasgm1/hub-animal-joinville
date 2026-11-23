import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  announcedDay,
  draftEvent,
  monitorSources,
  observe,
} from "../src/collect";

const fixture = (name: string) =>
  readFileSync(new URL("./fixtures/" + name, import.meta.url), "utf8");
const [events, service] = monitorSources;
const robots = fixture("pmj-robots.txt");
const search = fixture("pmj-busca.html");
const letter = fixture("pmj-carta.html");
const articleUrl =
  "https://www.joinville.sc.gov.br/noticias/cbea-realiza-feira-de-adocao-de-caes-filhotes-e-adultos-neste-domingo-em-joinville/";
const listing = `<main><h1>Buscando em Notícias</h1><p><a href="${articleUrl}">Feira de adoção</a></p></main>`;
const article =
  "<main><h1>Feira de adoção</h1><article><p>A agenda traz uma feira de adoção de animais de Joinville em 18/10, das 9h às 13h. A data final deve ser conferida com o organizador.</p></article></main>";
const html = (s: string) =>
  new Response(s, { headers: { "content-type": "text/html; charset=utf-8" } });
function route(changes: Record<string, () => Response> = {}) {
  return vi.fn(async (url: string, init: RequestInit) => {
    expect(init.redirect).toBe("manual");
    if (changes[url]) return changes[url]();
    if (url.endsWith("/robots.txt"))
      return new Response(robots, {
        headers: { "content-type": "text/plain" },
      });
    if (url === service.url) return html(letter);
    if (url === events.url) return html(search);
    if (url === articleUrl) return html(article);
    throw Error("Solicitação inesperada.");
  });
}
const robotsUrl = "https://www.joinville.sc.gov.br/robots.txt";

describe("Coleta municipal", () => {
  it("seleciona anúncios de animais, lê a notícia e separa datas mencionadas da confirmação", async () => {
    const network = route();
    const observations = await observe(events, network);
    expect(network.mock.calls.map(([url]) => url)).toEqual([
      robotsUrl,
      events.url,
      articleUrl,
    ]);
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({ url: articleUrl });
    expect(observations[0].context).toContain(
      "Datas mencionadas no texto: 18/10",
    );
    expect(observations[0].context).toContain("9h, 13h");
  });
  it("ignora destinos externos e descarta links repetidos dentro da edição", async () => {
    const page = listing.replace(
      "</main>",
      `<a href="${articleUrl}">Feira de adoção</a><a href="https://example.org/noticias/feira/">Feira de adoção</a></main>`,
    );
    expect(
      await observe(events, route({ [events.url]: () => html(page) })),
    ).toHaveLength(1);
  });
  it("normaliza espaços, preserva o telefone e identifica edição de condições da carta", async () => {
    const initial = await observe(service, route());
    expect(initial[0].context).toContain("(47) 98880-1911");
    expect(initial).toEqual(
      await observe(
        service,
        route({
          [service.url]: () =>
            html(letter.replace("pode fazer", "pode   fazer")),
        }),
      ),
    );
    expect(initial).not.toEqual(
      await observe(
        service,
        route({
          [service.url]: () =>
            html(letter.replace("valor aplicável", "novo critério")),
        }),
      ),
    );
  });
  it("recusa destino não cadastrado antes da rede", async () => {
    const network = route();
    await expect(
      observe({ ...service, url: "https://outro.example/servicos/" }, network),
    ).rejects.toThrow("catálogo");
    expect(network).not.toHaveBeenCalled();
  });
  it("respeita bloqueio específico de agente e não lê conteúdo em seguida", async () => {
    const network = route({
      [robotsUrl]: () =>
        new Response(
          "User-agent: *\nAllow: /\n\nUser-agent: AnimalJoinville\nDisallow: /",
          { headers: { "content-type": "text/plain" } },
        ),
    });
    await expect(observe(service, network)).rejects.toThrow("bloqueada");
    expect(network).toHaveBeenCalledTimes(1);
  });
  it("recusa robots ilegível ou indisponível", async () => {
    for (const response of [
      new Response("temporário", { status: 503 }),
      new Response("Portal indisponível", {
        headers: { "content-type": "text/plain" },
      }),
    ]) {
      const network = route({ [robotsUrl]: () => response });
      await expect(observe(service, network)).rejects.toThrow();
      expect(network).toHaveBeenCalledTimes(1);
    }
  });
  it("rejeita redirecionamentos e o excesso de bytes no fluxo", async () => {
    await expect(
      observe(
        service,
        route({
          [service.url]: () => Response.redirect("https://example.org", 302),
        }),
      ),
    ).rejects.toThrow("302");
    await expect(
      observe(
        service,
        route({ [service.url]: () => html("a".repeat(717_000)) }),
      ),
    ).rejects.toThrow("limite");
  });
  it("interrompe execução se a listagem ou uma carta perder seções esperadas", async () => {
    for (const source of [service, events]) {
      const changed =
        source.kind === "events"
          ? "<main><h1>Notícias</h1></main>"
          : "<main><h1>Serviços</h1><article>Conteúdo inesperado</article></main>";
      await expect(
        observe(source, route({ [source.url]: () => html(changed) })),
      ).rejects.toThrow("Estrutura alterada");
    }
  });
  it("reconhece pesquisa sem resultados como uma coleta válida", async () => {
    const empty =
      "<main><h1>Buscando em Notícias</h1><p>Nenhum resultado encontrado.</p></main>";
    expect(
      await observe(events, route({ [events.url]: () => html(empty) })),
    ).toEqual([]);
  });
  it("falha sem retornar resultados parciais se a fonte individual falhar", async () => {
    await expect(
      observe(
        events,
        route({ [articleUrl]: () => new Response("", { status: 429 }) }),
      ),
    ).rejects.toThrow("429");
  });
});

describe("Rascunhos de eventos a partir das notícias", () => {
  const body =
    "Neste domingo, o Centro de Bem-Estar Animal (CBEA) de Joinville realiza mais uma feira de adoção. O evento vai ocorrer das 9h às 13h, no hall de entrada da Arena Joinville (rua Inácio Bastos, 1.084 – Bucarein). Os animais são castrados.";
  it("calcula o dia anunciado a partir da data de publicação", () => {
    expect(announcedDay(body, "2026-08-06T20:52:35Z")).toBe("2026-08-09");
    expect(
      announcedDay(
        "no próximo sábado (22/8), das 8h às 16h",
        "2026-08-17T15:00:00Z",
      ),
    ).toBe("2026-08-22");
    expect(
      announcedDay("A feira será em 5 de janeiro.", "2026-12-20T15:00:00Z"),
    ).toBe("2027-01-05");
    expect(announcedDay("Sem data no texto.", "2026-08-06T20:52:35Z")).toBe(
      undefined,
    );
  });
  it("monta rascunho com horário de Joinville, local e fonte", () => {
    const d = draftEvent(
      "CBEA realiza feira de adoção neste domingo",
      body,
      articleUrl,
      "2026-08-06T20:52:35.000Z",
    )!;
    expect(d).toMatchObject({
      type: "Feira de adoção",
      start: "2026-08-09T12:00:00.000Z",
      end: "2026-08-09T16:00:00.000Z",
      organization: "cbea",
      sourceUrl: articleUrl,
      contact: articleUrl,
    });
    expect(d.location).toContain("Arena Joinville (rua Inácio Bastos");
  });
  it("não cria rascunho sem horário ou local explícito", () => {
    expect(
      draftEvent(
        "Feira de adoção",
        body.replace("das 9h às 13h", "pela manhã"),
        articleUrl,
        "2026-08-06T20:52:35.000Z",
      ),
    ).toBeUndefined();
    expect(
      draftEvent(
        "Feira de adoção",
        body.replace(/\(rua[^)]*\)/, ""),
        articleUrl,
        "2026-08-06T20:52:35.000Z",
      ),
    ).toBeUndefined();
  });
  it("anexa data de publicação e rascunho à observação da notícia", async () => {
    const page = `<html><head><meta property="article:published_time" content="2026-10-15T15:00:00+00:00" /></head><body><main><h1>CBEA realiza feira de adoção</h1><article><p>${body}</p></article></main></body></html>`;
    const [o] = await observe(
      events,
      route({ [articleUrl]: () => html(page) }),
    );
    expect(o.published).toBe("2026-10-15T15:00:00.000Z");
    expect(o.context).toContain("Publicada em: 2026-10-15");
    expect(o.draft?.start).toBe("2026-10-18T12:00:00.000Z");
  });
});
