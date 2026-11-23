import { monitorSources, observe } from "./collect";
import { source } from "./db";
import { fingerprint, now } from "./model";
export async function digest(text: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}
export async function maintenance(
  db: D1Database,
  fetcher: typeof fetch = fetch,
) {
  const at = now(),
    owner = crypto.randomUUID(),
    cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  await db.batch([
    db
      .prepare(
        "UPDATE events SET status='archived',actor='agenda',revision=revision+1,updated_at=? WHERE status='published' AND ends_at<=?",
      )
      .bind(at, at),
    db
      .prepare(
        "UPDATE submissions SET status='expired',sender=NULL,private_contact=NULL,reviewed_at=? WHERE status='pending' AND created_at<?",
      )
      .bind(at, cutoff),
    db.prepare("DELETE FROM rate_limits WHERE expires_at<=?").bind(at),
    db
      .prepare("DELETE FROM scrape_runs WHERE started_at<?")
      .bind(new Date(Date.now() - 90 * 86400000).toISOString()),
  ]);
  const lock = await db
    .prepare(
      "INSERT INTO settings(key,value) VALUES('monitor-lock',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE substr(settings.value,1,24)<?",
    )
    .bind(new Date(Date.now() + 5 * 60000).toISOString() + owner, at)
    .run();
  if (!lock.meta.changes) return;
  try {
    for (const s of monitorSources) {
      const id = crypto.randomUUID();
      await db.batch([
        source(db, s.url, s.kind),
        db
          .prepare(
            "INSERT INTO scrape_runs(id,source_id,started_at,status) VALUES(?,?,?,'running')",
          )
          .bind(id, s.url, now()),
      ]);
      try {
        const candidates = await observe(s, fetcher);
        const stmts = [];
        for (const c of candidates) {
          const hash = await digest(c.context);
          const prior = await db
            .prepare(
              "SELECT digest FROM source_observations WHERE source_id=? AND url=? ORDER BY observed_at DESC,id DESC LIMIT 1",
            )
            .bind(s.url, c.url)
            .first<{ digest: string }>();
          if (prior?.digest === hash) continue;
          const draft = c.draft && c.draft.end! > now() ? c.draft : undefined;
          if (draft) {
            const identity = fingerprint(draft);
            stmts.push(
              db
                .prepare(
                  "INSERT INTO submissions(id,identity,data,sender,created_at) SELECT ?,?,?,'Coleta automática',? WHERE NOT EXISTS(SELECT 1 FROM events WHERE identity=?) AND NOT EXISTS(SELECT 1 FROM submissions WHERE identity=?)",
                )
                .bind(
                  crypto.randomUUID(),
                  identity,
                  JSON.stringify(draft),
                  now(),
                  identity,
                  identity,
                ),
            );
          }
          const stale =
            c.published && Date.parse(c.published) < Date.now() - 21 * 86400000;
          stmts.push(
            db
              .prepare(
                "INSERT INTO source_observations(id,source_id,url,digest,context,observed_at,status) VALUES(?,?,?,?,?,?,?)",
              )
              .bind(
                crypto.randomUUID(),
                s.url,
                c.url,
                hash,
                c.context,
                now(),
                s.kind === "service"
                  ? prior
                    ? "pending"
                    : "baseline"
                  : draft
                    ? "drafted"
                    : stale
                      ? "stale"
                      : "pending",
              ),
          );
        }
        stmts.push(
          db
            .prepare(
              "UPDATE scrape_runs SET status='ok',finished_at=?,summary=? WHERE id=?",
            )
            .bind(now(), stmts.length + " observações novas", id),
        );
        await db.batch(stmts);
      } catch (e) {
        const message =
          e instanceof Error ? e.message.slice(0, 180) : "Falha de leitura";
        await db
          .prepare(
            "UPDATE scrape_runs SET status='failed',finished_at=?,summary=? WHERE id=?",
          )
          .bind(now(), message, id)
          .run();
      }
    }
  } finally {
    await db
      .prepare(
        "DELETE FROM settings WHERE key='monitor-lock' AND substr(value,25)=?",
      )
      .bind(owner)
      .run();
  }
}
