import initial from "../data/seed.json";
import {
  type Entry,
  type Table,
  type Row,
  Problem,
  fingerprint,
  now,
  validateEntry,
} from "./model";
export const seed = initial as Record<Table, Entry[]>;
export const source = (db: D1Database, url: string, kind = "reference") =>
  db
    .prepare(
      "INSERT INTO sources(id,url,kind) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING",
    )
    .bind(url, url, kind);
export function insert(
  db: D1Database,
  t: Table,
  e: Entry,
  actor: string,
  guard?: string,
) {
  const cols = ["slug", "data", "source_id", "status", "actor", "updated_at"];
  const values: (string | null)[] = [
    e.slug,
    JSON.stringify(e),
    e.sourceUrl,
    "published",
    actor,
    now(),
  ];
  if (t !== "organizations") {
    cols.push("organization_id");
    values.push(e.organization || null);
  }
  if (t === "events") {
    cols.push("identity", "ends_at");
    values.push(fingerprint(e), e.end!);
  }
  const where = guard
    ? " WHERE EXISTS(SELECT 1 FROM submissions WHERE id=? AND status='pending')"
    : "";
  return db
    .prepare(
      "INSERT INTO " +
        t +
        "(" +
        cols.join(",") +
        ") SELECT " +
        values.map(() => "?").join(",") +
        where,
    )
    .bind(...values, ...(guard ? [guard] : []));
}
export async function seedIfNew(db: D1Database) {
  if (await db.prepare("SELECT 1 FROM settings WHERE key='seed-v1'").first())
    return;
  const stmts: D1PreparedStatement[] = [];
  for (const t of ["organizations", "services", "events"] as const) {
    for (const e of seed[t]) {
      validateEntry(t, e);
      stmts.push(
        source(db, e.sourceUrl),
        insert(db, t, e, "curadoria-inicial"),
      );
    }
  }
  stmts.push(
    db.prepare("INSERT INTO settings(key,value) VALUES('seed-v1','1')"),
  );
  try {
    await db.batch(stmts);
  } catch (err) {
    if (
      !(await db.prepare("SELECT 1 FROM settings WHERE key='seed-v1'").first())
    )
      throw err;
  }
}
export const raw = (db: D1Database, t: Table, slug: string) =>
  db
    .prepare("SELECT * FROM " + t + " WHERE slug=?")
    .bind(slug)
    .first<Row>();
export async function listed(db: D1Database, t: Table, archived = false) {
  const qry =
    t === "events"
      ? archived
        ? "ends_at<=? AND (status='published' OR (status='archived' AND actor='agenda'))"
        : "status='published' AND ends_at>?"
      : "status='published'";
  const stmt = db.prepare(
    "SELECT data FROM " +
      t +
      " WHERE " +
      qry +
      " ORDER BY " +
      (t === "events"
        ? "json_extract(data,'$.start') " + (archived ? "DESC" : "ASC")
        : "json_extract(data,'$.title') COLLATE NOCASE"),
  );
  return (
    await (t === "events" ? stmt.bind(now()) : stmt).all<{ data: string }>()
  ).results.map((r) => JSON.parse(r.data) as Entry);
}
export function update(
  db: D1Database,
  t: Table,
  e: Entry,
  status: string,
  rev: number,
  actor: string,
) {
  const cols = ["data", "source_id", "status", "actor", "updated_at"];
  const vals: (string | null)[] = [
    JSON.stringify(e),
    e.sourceUrl,
    status,
    actor,
    now(),
  ];
  if (t !== "organizations") {
    cols.push("organization_id");
    vals.push(e.organization || null);
  }
  if (t === "events") {
    cols.push("identity", "ends_at");
    vals.push(fingerprint(e), e.end!);
  }
  return db
    .prepare(
      "UPDATE " +
        t +
        " SET " +
        cols.map((c) => c + "=?").join(",") +
        ",revision=revision+1 WHERE slug=? AND revision=?",
    )
    .bind(...vals, e.slug, rev);
}
export async function save(
  db: D1Database,
  t: Table,
  e: Entry,
  rev: number,
  actor: string,
  status = "published",
) {
  validateEntry(t, e);
  try {
    const [, r] = await db.batch([
      source(db, e.sourceUrl),
      rev ? update(db, t, e, status, rev, actor) : insert(db, t, e, actor),
    ]);
    if (!r.meta.changes)
      throw new Problem(409, "O registro foi alterado. Reabra a versão atual.");
  } catch (err) {
    if (String(err).includes("UNIQUE"))
      throw new Problem(
        409,
        "Já existe um registro com essa identificação ou ocorrência.",
      );
    throw err;
  }
}
export async function moderate(
  db: D1Database,
  id: string,
  approve: boolean,
  actor: string,
) {
  const pending = await db
    .prepare("SELECT data FROM submissions WHERE id=? AND status='pending'")
    .bind(id)
    .first<{ data: string }>();
  if (!pending) throw new Problem(409, "O envio já foi analisado ou expirou.");
  const e: Entry = JSON.parse(pending.data);
  e.verifiedAt = now().slice(0, 10);
  const stmts = [];
  if (approve) {
    validateEntry("events", e);
    if (e.end! <= now()) throw new Problem(422, "O evento já terminou.");
    stmts.push(source(db, e.sourceUrl), insert(db, "events", e, actor, id));
  }
  stmts.push(
    db
      .prepare(
        "UPDATE submissions SET status=?,sender=NULL,private_contact=NULL,reviewer=?,reviewed_at=? WHERE id=? AND status='pending'",
      )
      .bind(approve ? "approved" : "rejected", actor, now(), id),
  );
  try {
    const rs = await db.batch(stmts);
    if (!rs.at(-1)?.meta.changes)
      throw new Problem(409, "O envio já foi analisado.");
  } catch (err) {
    if (String(err).includes("UNIQUE"))
      throw new Problem(
        409,
        "Essa ocorrência já consta na agenda. Confira antes de rejeitar a duplicata.",
      );
    throw err;
  }
}
