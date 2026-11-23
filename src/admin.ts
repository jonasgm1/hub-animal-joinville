import {
  type Env,
  type Entry,
  type Row,
  type Table,
  Problem,
  isTable,
  tables,
  field,
  now,
} from "./model";
import {
  esc,
  link,
  post,
  heading,
  hidden,
  editor,
  names,
  type View,
} from "./html";
import { fromForm } from "./fields";
import { listed, raw, save, moderate } from "./db";
import { maintenance } from "./maintenance";
const back = link("/admin", "Voltar à administração");
const editPath = (t: Table, id: string) => "/admin/editar/" + t + "/" + id;
const redirect = () =>
  new Response(null, {
    status: 303,
    headers: { Location: "/admin?concluido=1" },
  });
function revision(f: FormData) {
  const v = field(f, "revision", 12, true);
  if (!/^\d+$/.test(v)) throw new Problem(422, "Versão inválida.");
  return Number(v);
}
export async function adminAction(
  req: Request,
  env: Env,
  f: FormData,
  user: string,
  ctx: Pick<ExecutionContext, "waitUntil">,
) {
  const path = new URL(req.url).pathname;
  if (path === "/admin/verificar") {
    ctx.waitUntil(maintenance(env.DB));
    return redirect();
  }
  if (path === "/admin/moderar") {
    const decision = field(f, "decision");
    if (!["aprovar", "rejeitar"].includes(decision))
      throw new Problem(422, "Decisão inválida.");
    await moderate(env.DB, field(f, "id"), decision === "aprovar", user);
    return redirect();
  }
  if (path === "/admin/observacao") {
    const r = await env.DB.prepare(
      "UPDATE source_observations SET status='reviewed',reviewer=?,reviewed_at=? WHERE id=? AND status='pending'",
    )
      .bind(user, now(), field(f, "id"))
      .run();
    if (!r.meta.changes) throw new Problem(409, "Observação já tratada.");
    return redirect();
  }
  const t = field(f, "table"),
    slug = field(f, "slug");
  if (!isTable(t)) throw new Problem(404, "Registro desconhecido.");
  const rev = revision(f);
  if (path === "/admin/salvar") {
    await save(env.DB, t, fromForm(t, f, slug || undefined), rev, user);
    return redirect();
  }
  if (path === "/admin/arquivar" || path === "/admin/restaurar") {
    let record: { data: string; status: string } | null;
    if (path.endsWith("/restaurar"))
      record = await env.DB.prepare(
        "SELECT data,status FROM change_history WHERE entity=? AND slug=? AND id=?",
      )
        .bind(t, slug, field(f, "version"))
        .first();
    else record = await raw(env.DB, t, slug);
    if (!record) throw new Problem(404, "Registro ou versão desconhecida.");
    await save(
      env.DB,
      t,
      JSON.parse(record.data),
      rev,
      user,
      path.endsWith("/arquivar") ? "archived" : record.status,
    );
    return redirect();
  }
  throw new Problem(404, "Operação desconhecida.");
}
export async function adminView(env: Env, url: URL): Promise<View> {
  const db = env.DB,
    parts = url.pathname.split("/"),
    t = parts[3],
    slug = parts[4];
  if (parts[2] === "editar" && isTable(t)) {
    const r = slug ? await raw(db, t, slug) : null;
    if (slug && !r) throw new Problem(404, "Registro desconhecido.");
    const e = r ? (JSON.parse(r.data) as Entry) : {};
    const ids =
      hidden("table", t) +
      hidden("slug", slug || "") +
      hidden("revision", r?.revision || 0);
    const history = slug
      ? (
          await db
            .prepare(
              "SELECT id,revision,status,actor,changed_at FROM change_history WHERE entity=? AND slug=? ORDER BY revision DESC",
            )
            .bind(t, slug)
            .all<{
              id: number;
              revision: number;
              status: string;
              actor: string;
              changed_at: string;
            }>()
        ).results
      : [];
    const title = (r ? "Editar" : "Cadastrar") + " · " + names[t];
    return {
      title,
      body:
        back +
        heading(title) +
        post(
          "/admin/salvar",
          ids +
            editor(t, e, await listed(db, "organizations")) +
            "<button>Salvar e publicar</button>",
        ) +
        (r
          ? post(
              "/admin/arquivar",
              ids + '<button class="secondary">Arquivar registro</button>',
            )
          : "") +
        "<h2>Histórico de versões</h2>" +
        history
          .map(
            (h) =>
              "<p>" +
              esc(h.changed_at) +
              " · " +
              esc(h.actor) +
              " · v" +
              h.revision +
              " · " +
              esc(h.status) +
              "</p>" +
              (h.revision === r?.revision
                ? ""
                : post(
                    "/admin/restaurar",
                    ids +
                      hidden("version", h.id) +
                      '<button class="secondary">Restaurar versão ' +
                      h.revision +
                      "</button>",
                  )),
          )
          .join(""),
    };
  }
  if (parts[2]) throw new Problem(404, "Página desconhecida.");
  const q = (
    await db
      .prepare(
        "SELECT id,data,sender,private_contact FROM submissions WHERE status='pending' ORDER BY created_at",
      )
      .all<{
        id: string;
        data: string;
        sender: string;
        private_contact: string;
      }>()
  ).results;
  const obs = (
    await db
      .prepare(
        "SELECT id,url,context FROM source_observations WHERE status='pending' ORDER BY observed_at LIMIT 100",
      )
      .all<{ id: string; url: string; context: string }>()
  ).results;
  const runs = (
    await db
      .prepare(
        "SELECT source_id,started_at,status,summary FROM scrape_runs ORDER BY started_at DESC LIMIT 20",
      )
      .all<{
        source_id: string;
        started_at: string;
        status: string;
        summary: string;
      }>()
  ).results;
  let body =
    heading("Administração") +
    (url.searchParams.has("concluido")
      ? '<p class="notice" role="status">Solicitação registrada.</p>'
      : "") +
    "<section><h2>Eventos para moderação</h2>";
  for (const r of q) {
    const e: Entry = JSON.parse(r.data);
    body +=
      '<article class="row"><div><h3>' +
      esc(e.title) +
      "</h3><p>" +
      [e.type, e.start, e.end, e.location, e.organizer, e.contact]
        .map(esc)
        .join(" · ") +
      "</p><p>" +
      esc(e.description) +
      "</p><p>" +
      link(e.sourceUrl, "Conferir publicação original") +
      "</p><p>" +
      (r.private_contact
        ? "Responsável privado · " +
          esc(r.sender) +
          " · " +
          esc(r.private_contact)
        : "Rascunho da coleta automática. Confira data, horário e local na publicação original antes de aprovar.") +
      "</p>" +
      post(
        "/admin/moderar",
        hidden("id", r.id) +
          '<button name="decision" value="aprovar">Aprovar e publicar</button> <button class="secondary" name="decision" value="rejeitar">Rejeitar</button>',
      ) +
      "</div></article>";
  }
  body +=
    (q.length ? "" : "<p>Nenhum envio pendente.</p>") +
    "</section><section><h2>Alterações e descobertas</h2>";
  for (const o of obs)
    body +=
      "<details><summary>" +
      esc(o.context.slice(0, 120)) +
      "</summary><p>" +
      esc(o.context) +
      "</p>" +
      link(o.url, "Conferir fonte") +
      post(
        "/admin/observacao",
        hidden("id", o.id) + "<button>Marcar como revisada</button>",
      ) +
      "</details>";
  body +=
    (obs.length ? "" : "<p>Nenhuma observação pendente.</p>") +
    "<p>Confira a fonte, cadastre ou edite o registro correspondente e marque a observação como revisada.</p></section>";
  for (const table of tables) {
    const rows = (
      await db
        .prepare(
          "SELECT slug,data,status,revision FROM " + table + " ORDER BY slug",
        )
        .all<Row>()
    ).results;
    body +=
      "<section><h2>" +
      names[table] +
      "</h2>" +
      link(editPath(table, ""), "Cadastrar registro") +
      "<ul>" +
      rows
        .map(
          (r) =>
            "<li>" +
            link(editPath(table, r.slug), JSON.parse(r.data).title) +
            " · " +
            (r.status === "published" ? "publicado" : "arquivado") +
            "</li>",
        )
        .join("") +
      "</ul></section>";
  }
  body +=
    "<section><h2>Verificações das fontes</h2>" +
    post("/admin/verificar", "<button>Verificar fontes agora</button>") +
    runs
      .map(
        (r) =>
          "<p>" +
          [r.started_at, r.status, r.summary].map(esc).join(" · ") +
          " " +
          link(r.source_id, "Fonte") +
          "</p>",
      )
      .join("") +
    "</section>";
  return { title: "Administração", body };
}
