import initial from "../data/seed.json";
import {
  type Entry,
  type Table,
  type Row,
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
const columns = (t: Table, e: Entry) => {
  const c: Record<string, string | null> = {
    data: JSON.stringify(e),
    source_id: e.sourceUrl,
  };
  if (t !== "organizations") c.organization_id = e.organization || null;
  if (t === "events") {
    c.identity = fingerprint(e);
    c.ends_at = e.end!;
  }
  return c;
};
// OR IGNORE: a repeated slug or event occurrence (title, start, place) is skipped, never an error.
export function insert(db: D1Database, t: Table, e: Entry, actor: string) {
  const c = { slug: e.slug, ...columns(t, e) };
  const keys = Object.keys(c);
  return db
    .prepare(
      "INSERT OR IGNORE INTO " +
        t +
        "(" +
        keys.join(",") +
        ",status,actor,updated_at) VALUES(" +
        keys.map(() => "?").join(",") +
        ",'published',?,?)",
    )
    .bind(...Object.values(c), actor, now());
}
const curator = "curadoria";
let hash = 0;
const catalogText = JSON.stringify(initial);
for (let i = 0; i < catalogText.length; i++)
  hash = (Math.imul(hash, 31) + catalogText.charCodeAt(i)) | 0;
const catalogVersion =
  "catalog-" + (hash >>> 0).toString(16) + "-" + catalogText.length;
// Mirrors data/seed.json into D1 once per catalog version: new entries are inserted,
// edited ones updated, removed ones archived. Records from the collector are left alone.
export async function syncCatalog(db: D1Database) {
  if (
    await db
      .prepare("SELECT 1 FROM settings WHERE key=?")
      .bind(catalogVersion)
      .first()
  )
    return;
  const stmts: D1PreparedStatement[] = [];
  const at = now();
  for (const t of ["organizations", "services", "events"] as const) {
    for (const e of seed[t]) {
      validateEntry(t, e);
      const c = columns(t, e);
      stmts.push(
        source(db, e.sourceUrl),
        db
          .prepare(
            "UPDATE OR IGNORE " +
              t +
              " SET " +
              Object.keys(c)
                .map((k) => k + "=?")
                .join(",") +
              ",status='published',actor=?,updated_at=?,revision=revision+1 WHERE slug=? AND actor IN('curadoria','curadoria-inicial','curadoria-removido','agenda') AND (data<>? OR actor='curadoria-removido')",
          )
          .bind(...Object.values(c), curator, at, e.slug, c.data),
        insert(db, t, e, curator),
      );
    }
    stmts.push(
      db
        .prepare(
          "UPDATE " +
            t +
            " SET status='archived',actor='curadoria-removido',revision=revision+1,updated_at=? WHERE status='published' AND actor IN('curadoria','curadoria-inicial') AND slug NOT IN (SELECT value FROM json_each(?))",
        )
        .bind(at, JSON.stringify(seed[t].map((e) => e.slug))),
    );
  }
  stmts.push(
    db.prepare(
      "DELETE FROM settings WHERE key LIKE 'catalog-%' OR key='seed-v1'",
    ),
    db
      .prepare("INSERT INTO settings(key,value) VALUES(?,?)")
      .bind(catalogVersion, at),
  );
  await db.batch(stmts);
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
