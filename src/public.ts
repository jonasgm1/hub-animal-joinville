import { listed, raw } from "./db";
import { monitorSources } from "./collect";
import {
  esc,
  heading as pageHeading,
  link,
  type View as PublicView,
} from "./html";
import {
  categories,
  costs,
  dateLabel,
  eventTypes,
  matchService,
  paths,
  safeUrl,
  type Entry,
  type Env,
  type Table,
} from "./model";

const sectionNames: Record<Table, string> = {
  services: "Serviços",
  organizations: "Organizações",
  events: "Agenda",
};
const collate = new Intl.Collator("pt-BR", { sensitivity: "base" });
const clock = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});
const day = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
});
const month = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  month: "short",
});

const castrationGuide =
  "<p>Projeto parceiro: " +
  link(
    "https://castracaojoinville.pages.dev/",
    "Castração Gratuita Joinville",
  ) +
  ", guia passo a passo para pedir a castração gratuita na cidade.</p>";
const href = (table: Table, e: Entry) =>
  "/" + paths[table] + "/" + encodeURIComponent(e.slug);
const tag = (label?: string) =>
  label ? `<span class="tag">${esc(label)}</span>` : "";
const empty = (text: string) => `<p class="empty">${esc(text)}</p>`;
const unique = (items: string[]) =>
  [...new Set(items)].filter(Boolean).sort(collate.compare);

function sectionHeading(title: string, more = "") {
  return `<div class="section-head"><h2>${esc(title)}</h2>${more}</div>`;
}
function menu(
  label: string,
  name: string,
  pairs: string[][],
  query: URLSearchParams,
) {
  return `<label>${esc(label)}<select name="${esc(name)}"><option value="">Todos</option>${pairs
    .map(
      ([value, title]) =>
        `<option value="${esc(value)}"${query.get(name) === value ? " selected" : ""}>${esc(title)}</option>`,
    )
    .join("")}</select></label>`;
}
const choices = (items: string[]) => items.map((x) => [x, x]);
function serviceList(services: Entry[]) {
  return `<ul class="list">${services
    .map(
      (e) => `<li class="row"><div class="meta">${esc(e.category)}</div>
    <h3>${link(href("services", e), e.title)}</h3><p>${esc(e.description)}</p>
    <div class="row-info">${tag(costs[e.cost || ""])}<span class="meta">${esc(e.audience)}</span></div></li>`,
    )
    .join("")}</ul>`;
}
function eventList(events: Entry[]) {
  return `<ul class="list">${events
    .map((e) => {
      const start = new Date(e.start!),
        end = new Date(e.end!);
      const endText =
        dateLabel(e.start!) === dateLabel(e.end!)
          ? clock.format(end)
          : dateLabel(e.end!, true);
      return `<li class="row event-row"><div class="calendar-day" aria-hidden="true"><b>${esc(day.format(start))}</b><span>${esc(month.format(start).replace(".", ""))}</span></div>
      <div><p class="meta">${esc(e.type)}</p><h3>${link(href("events", e), e.title)}</h3>
      <p><time datetime="${esc(e.start)}">${esc(dateLabel(e.start!, true))}</time> até <time datetime="${esc(e.end)}">${esc(endText)}</time></p>
      <p class="meta">${esc(e.location)}</p></div></li>`;
    })
    .join("")}</ul>`;
}

async function home(db: D1Database): Promise<PublicView> {
  const [services, events] = await Promise.all([
    listed(db, "services"),
    listed(db, "events"),
  ]);
  const find = (slug: string) => services.find((e) => e.slug === slug);
  const preferred = ["castracao", "adotar-no-cbea", "cadastro-de-protetores"]
    .map(find)
    .filter((e): e is Entry => !!e);
  const featured = [
    ...new Map([...preferred, ...services].map((e) => [e.slug, e])).values(),
  ].slice(0, 3);
  const urgent = [
    "socorro-animal-de-rua",
    "socorro-animal-silvestre",
    "denunciar-maus-tratos",
  ]
    .map(find)
    .filter((e): e is Entry => !!e);
  return {
    title: "Proteção animal em Joinville",
    description:
      "Encontre serviços de proteção animal, contatos oficiais, feiras de adoção e organizações de Joinville, Santa Catarina.",
    body: `<div class="hero"><section class="finder"><p class="eyebrow">Proteção animal · Joinville, SC</p><h1>De que ajuda seu animal precisa?</h1>
      <p>Encontre o serviço, confira quem pode solicitar e fale diretamente com quem atende.</p>
      <form class="searchbar" action="/servicos" role="search"><label><span class="sr-only">Buscar serviços</span><input type="search" name="q" placeholder="Ex.: castração, resgate, adoção" maxlength="200"></label><button>Buscar</button></form></section>
      <aside class="urgent"><h2>Precisa de ajuda agora?</h2><p>Escolha a situação para ver o canal e o horário de atendimento.</p>
      <ul>${urgent.map((e) => `<li>${link(href("services", e), e.title)}</li>`).join("") || '<li><a href="/servicos">Consultar o diretório</a></li>'}</ul></aside></div>
      <section class="home-block">${sectionHeading("Encontrar por assunto")}<ul class="categories">${categories.map((c) => `<li>${link(c === "Feiras e campanhas" ? "/agenda" : "/servicos?categoria=" + encodeURIComponent(c), c)}</li>`).join("")}</ul></section>
      <div class="columns"><section>${sectionHeading("Serviços em destaque", link("/servicos", "Ver todos os serviços"))}${featured.length ? serviceList(featured) : empty("Nenhum serviço verificado até o momento.")}</section>
      <section>${sectionHeading("Próximas feiras e campanhas", link("/agenda", "Ver agenda"))}${events.length ? eventList(events.slice(0, 3)) : empty("Nenhum evento confirmado para as próximas datas.")}</section></div>
      <section class="community"><h2>Quem atua em Joinville</h2><p>Consulte órgãos públicos, ONGs e grupos voluntários, com seus projetos e contatos divulgados.</p>${link("/organizacoes", "Conhecer as organizações")} · ${link("/sobre", "Sobre o projeto")}${castrationGuide}</section>`,
  };
}

async function servicesView(
  db: D1Database,
  query: URLSearchParams,
): Promise<PublicView> {
  const all = await listed(db, "services");
  const entries = all.filter((e) => matchService(e, query));
  const relatedCategory = query.get("categoria");
  const relatedSlug =
    relatedCategory === "Vacinação"
      ? "cadastro-de-protetores"
      : relatedCategory === "Atendimento veterinário gratuito"
        ? "socorro-animal-de-rua"
        : "";
  const related =
    !entries.length && relatedSlug
      ? all.find((e) => e.slug === relatedSlug)
      : undefined;
  return {
    title: "Diretório de serviços",
    description:
      "Busque por necessidade, público, espécie ou condição de acesso em Joinville.",
    body: `
    ${pageHeading("Diretório de serviços", "Confira os critérios e o canal de solicitação de cada atendimento em Joinville.")}
    <form action="/servicos" role="search"><div class="searchbar"><label>Palavra-chave<input type="search" name="q" value="${esc(query.get("q") || "")}" placeholder="Serviço ou necessidade" maxlength="200"></label><button>Buscar</button></div>
    <div class="filters">${menu("Categoria", "categoria", choices(categories), query)}${menu("Espécie", "especie", choices(unique(all.flatMap((e) => e.species || []))), query)}
    ${menu("Condição de acesso", "acesso", Object.entries(costs), query)}${menu("Público", "publico", choices(unique(all.map((e) => e.audience || ""))), query)}
    <button>Aplicar filtros</button>${link("/servicos", "Limpar filtros")}</div></form>
    <section>${sectionHeading(entries.length === 1 ? "1 serviço encontrado" : entries.length + " serviços encontrados")}
    ${entries.length ? serviceList(entries) : empty("Nenhum serviço corresponde a esta seleção. Tente outra palavra ou remova um filtro.")}
    ${related ? "<h3>Programa relacionado</h3><p>Consulte os limites de atendimento deste programa.</p>" + serviceList([related]) : ""}</section>`,
  };
}

async function agendaView(
  db: D1Database,
  query: URLSearchParams,
  archived: boolean,
): Promise<PublicView> {
  const type = query.get("tipo");
  const events = (await listed(db, "events", archived)).filter(
    (e) =>
      (!type || e.type === type) &&
      (!archived || Date.parse(e.end!) <= Date.now()),
  );
  const path = archived ? "/agenda/arquivo" : "/agenda";
  const title = archived ? "Arquivo da agenda" : "Agenda de feiras e campanhas";
  return {
    title,
    body: `${pageHeading(title, archived ? "Consulte os eventos encerrados em Joinville." : "Datas divulgadas pelos organizadores. Os horários são de Joinville.")}
    <div class="actions">${link(archived ? "/agenda" : "/agenda/arquivo", archived ? "Voltar à agenda" : "Ver eventos encerrados")}</div>
    <form class="filters" action="${path}">${menu("Tipo de evento", "tipo", choices(eventTypes), query)}<button>Filtrar eventos</button></form>
    <section>${sectionHeading(archived ? "Eventos encerrados" : "Próximos eventos")}${events.length ? eventList(events) : empty(archived ? "Nenhum evento encerrado nesta seleção." : "Nenhum evento confirmado nesta seleção. Consulte a agenda novamente mais tarde.")}</section>`,
  };
}

async function organizationsView(db: D1Database): Promise<PublicView> {
  const entries = await listed(db, "organizations");
  return {
    title: "Diretório de organizações",
    body: `${pageHeading("Organizações", "ONGs, grupos voluntários e órgãos públicos que atuam na proteção animal em Joinville.")}
    <section>${sectionHeading(entries.length === 1 ? "1 organização" : entries.length + " organizações")}
    ${entries.length ? `<ul class="list">${entries.map((e) => `<li class="row"><div class="meta">${esc(e.area || "")}</div><h3>${link(href("organizations", e), e.title)}</h3><p>${esc(e.description)}</p></li>`).join("")}</ul>` : empty("Nenhuma organização verificada até o momento.")}</section>`,
  };
}

function phoneMarkup(value: string, whatsapp = false) {
  const match =
    /^\s*(?:\+?55\s*)?\(?([1-9]\d)\)?[\s.-]*(\d{4,5})[\s.-]*(\d{4})\s*$/.exec(
      value,
    );
  if (match)
    return link(
      (whatsapp ? "https://wa.me/55" : "tel:+55") + match.slice(1).join(""),
      value,
    );
  if (!whatsapp && /^\d{3}$/.test(value)) return link("tel:" + value, value);
  return esc(value);
}
function publicContact(value: string) {
  if (safeUrl(value)) return link(value, value);
  if (/^[\w.!%+-]+@[\w.-]+\.[a-z]{2,}$/i.test(value))
    return link("mailto:" + value, value);
  return phoneMarkup(value);
}
function term(name: string, content: string) {
  return content ? `<dt>${esc(name)}</dt><dd>${content}</dd>` : "";
}
function contactDetails(e: Entry, table: Table) {
  const fields = [
    term("Horário", esc(e.hours || "")),
    term("Local", esc(e.location || e.address || "")),
    term("Telefone", e.phone ? phoneMarkup(e.phone) : ""),
    term("WhatsApp", e.whatsapp ? phoneMarkup(e.whatsapp, true) : ""),
    term("E-mail", e.email ? publicContact(e.email) : ""),
    term(
      table === "services" ? "Canal de solicitação" : "Site",
      e.website && safeUrl(e.website)
        ? link(
            e.website,
            table === "services"
              ? "Abrir canal de atendimento"
              : "Acessar o site",
          )
        : "",
    ),
    term(
      "Rede social",
      e.social && safeUrl(e.social)
        ? link(e.social, "Abrir perfil público")
        : "",
    ),
    term(
      "Contato público do evento",
      e.contact ? publicContact(e.contact) : "",
    ),
  ].join("");
  return fields
    ? `<section class="contact-box"><h2>Contatos e atendimento</h2><dl>${fields}</dl></section>`
    : "";
}
function evidence(e: Entry) {
  const status = e.automatic
    ? "Coletado automaticamente de notícia da Prefeitura · confira a publicação original"
    : e.cost === "incerto"
      ? "Fonte consultada · Gratuidade sem confirmação"
      : "Informações conferidas na fonte";
  const host = safeUrl(e.sourceUrl) ? new URL(e.sourceUrl).hostname : "";
  return `<section class="evidence"><h2>Fonte e verificação</h2><p>${tag(status)}</p>
    <p>${e.automatic ? "Coletado em" : "Última verificação em"} <time datetime="${esc(e.verifiedAt)}">${esc(dateLabel(e.verifiedAt))}</time>.</p>
    ${host ? `<p>${link(e.sourceUrl, "Consultar publicação original em " + host)}</p>` : ""}</section>`;
}
function paragraph(title: string, value?: string) {
  return value
    ? `<section><h2>${esc(title)}</h2><p>${esc(value)}</p></section>`
    : "";
}
async function detail(
  db: D1Database,
  t: Table,
  slug: string,
  url: URL,
): Promise<PublicView | null> {
  const row = await raw(db, t, slug);
  if (!row) return null;
  const e = JSON.parse(row.data) as Entry;
  const ended = t === "events" && Date.parse(e.end!) <= Date.now();
  if (
    row.status !== "published" &&
    !(ended && (row as typeof row & { actor?: string }).actor === "agenda")
  )
    return null;
  const orgRow = e.organization
    ? await raw(db, "organizations", e.organization)
    : null;
  const org: Entry | null =
    orgRow?.status === "published" ? JSON.parse(orgRow.data) : null;
  let body = `<nav class="crumb" aria-label="Caminho da página">${link("/", "Início")} / ${link("/" + paths[t], sectionNames[t])}</nav>
    <article class="detail"><header class="page-head"><p class="eyebrow">${esc(e.category || e.type || e.area || sectionNames[t])}</p><h1>${esc(e.title)}</h1><p>${esc(e.description)}</p></header>`;
  const page: PublicView = {
    title: e.title,
    description: e.description,
    body: "",
  };
  if (t === "services") {
    body += `<p>${tag(costs[e.cost || ""])}</p>${paragraph("Quem pode solicitar", e.eligibility)}${paragraph("Como solicitar", e.steps)}
      ${contactDetails(e, t)}${paragraph("Documentos e informações", e.documents)}
      <dl>${term("Espécies", esc(e.species?.join(", ") || ""))}${term("Responsável", org ? link(href("organizations", org), org.title) : "")}</dl>${e.category === "Castração" ? castrationGuide : ""}`;
  } else if (t === "events") {
    const address = href("events", e);
    const permalink = new URL(address, url.origin).href;
    body += `${ended ? empty("Evento encerrado.") : ""}<section><h2>Quando acontece</h2><dl>
      ${term("Início", `<time datetime="${esc(e.start)}">${esc(dateLabel(e.start!, true))}</time>`)}
      ${term("Término", `<time datetime="${esc(e.end)}">${esc(dateLabel(e.end!, true))}</time>`)}
      ${term("Organização", org ? link(href("organizations", org), e.organizer || org.title) : esc(e.organizer || ""))}</dl></section>
      ${contactDetails(e, t)}<section><h2>Compartilhar evento</h2><div class="actions">
      ${link("https://wa.me/?text=" + encodeURIComponent(e.title + " " + permalink), "Enviar pelo WhatsApp")}
      ${link("mailto:?subject=" + encodeURIComponent(e.title) + "&body=" + encodeURIComponent(permalink), "Enviar por e-mail")}</div></section>`;
    page.structured = {
      "@context": "https://schema.org",
      "@type": "Event",
      name: e.title,
      description: e.description,
      startDate: e.start,
      endDate: e.end,
      url: permalink,
      location: { "@type": "Place", name: e.location, address: e.location },
      organizer: { "@type": "Organization", name: e.organizer },
    };
  } else {
    const [services, events] = await Promise.all([
      listed(db, "services"),
      listed(db, "events"),
    ]);
    const orgServices = services.filter((s) => s.organization === e.slug);
    const orgEvents = events.filter((s) => s.organization === e.slug);
    body += `${contactDetails(e, t)}${paragraph("Projetos e campanhas", e.projects)}${paragraph("Voluntariado", e.volunteering)}
      ${orgServices.length ? "<section><h2>Serviços da organização</h2>" + serviceList(orgServices) + "</section>" : ""}
      ${orgEvents.length ? "<section><h2>Próximos eventos</h2>" + eventList(orgEvents) + "</section>" : ""}`;
  }
  page.body = body + evidence(e) + "</article>";
  return page;
}

async function about(db: D1Database): Promise<PublicView> {
  const { results } = await db
    .prepare(
      "SELECT source_id,status,finished_at FROM scrape_runs r WHERE started_at=(SELECT max(started_at) FROM scrape_runs WHERE source_id=r.source_id)",
    )
    .all<{ source_id: string; status: string; finished_at: string | null }>();
  const runs = monitorSources
    .map((s) => {
      const r = results.find((r) => r.source_id === s.url);
      const state = !r
        ? "ainda sem execução"
        : r.status === "ok"
          ? "concluída em " + dateLabel(r.finished_at!, true)
          : r.status === "failed"
            ? "falhou em " + dateLabel(r.finished_at!, true)
            : "em andamento";
      return `<li>${link(s.url, s.title)}: ${esc(state)}</li>`;
    })
    .join("");
  return {
    title: "Sobre o projeto",
    body: `<article class="detail">${pageHeading("Sobre o Hub Animal Joinville", "Um diretório independente para quem busca ajuda com animais em Joinville, Santa Catarina.")}
    ${paragraph("De onde vêm as informações", "Cada serviço, organização e evento tem uma publicação de referência e a data em que foi conferido. A gratuidade, os documentos e os limites de atendimento aparecem na ficha do serviço.")}
    ${paragraph("Como a agenda é atualizada", "Uma vez por semana a equipe revisa as publicações das ONGs, protetores e órgãos públicos e atualiza a agenda. Além disso, duas vezes por dia uma rotina automática lê as notícias públicas da Prefeitura de Joinville sobre feiras de adoção, mutirões e campanhas; quando a notícia traz dia, horário e local, o evento entra na agenda com o selo de coleta automática e o link da notícia original. Eventos encerrados ficam no arquivo.")}
    <section><h2>Última busca automática por fonte</h2><ul>${runs}</ul></section>${castrationGuide}
    <p class="actions">${link("/privacidade", "Consultar o aviso de privacidade")}</p></article>`,
  };
}

export async function publicView(
  env: Env,
  url: URL,
): Promise<PublicView | null> {
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path === "/") return home(env.DB);
  if (path === "/servicos") return servicesView(env.DB, url.searchParams);
  if (path === "/agenda" || path === "/agenda/arquivo")
    return agendaView(env.DB, url.searchParams, path.endsWith("/arquivo"));
  if (path === "/organizacoes") return organizationsView(env.DB);
  if (path === "/sobre") return about(env.DB);
  if (path === "/privacidade")
    return {
      title: "Privacidade",
      body: `<article class="detail">${pageHeading("Privacidade", "A consulta ao diretório é aberta e dispensa cadastro.")}
    ${paragraph("Dados coletados", "O site não tem formulários, cadastro nem cookies próprios. A Cloudflare, que hospeda o site, processa os registros técnicos de acesso necessários ao funcionamento e à segurança.")}
    ${paragraph("Contatos publicados", "Os contatos exibidos são os divulgados publicamente pelos próprios órgãos, organizações e organizadores de eventos, com link para a publicação de origem.")}
    <h2>Denúncias de maus-tratos</h2><p>Encaminhe o relato e as informações pessoais diretamente ao canal oficial indicado no ${link("/servicos?categoria=" + encodeURIComponent("Denúncias de maus-tratos"), "diretório de serviços")}.</p></article>`,
    };
  const match =
    /^\/(servicos|agenda|organizacoes)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path);
  if (!match) return null;
  const t = (Object.keys(paths) as Table[]).find((t) => paths[t] === match[1]);
  return t ? detail(env.DB, t, match[2], url) : null;
}
