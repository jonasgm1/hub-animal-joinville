import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
export function memoryDb() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync("migrations/0001_initial.sql", "utf8"));
  class Statement {
    constructor(
      readonly query: string,
      readonly args: SQLInputValue[] = [],
    ) {}
    bind(...args: SQLInputValue[]) {
      return new Statement(this.query, args);
    }
    async first() {
      return sql.prepare(this.query).get(...this.args) ?? null;
    }
    async all() {
      return { results: sql.prepare(this.query).all(...this.args) };
    }
    async run() {
      return { meta: sql.prepare(this.query).run(...this.args) };
    }
  }
  const db = {
    prepare: (q: string) => new Statement(q),
    async batch(statements: Statement[]) {
      sql.exec("BEGIN");
      try {
        const results = await Promise.all(statements.map((s) => s.run()));
        sql.exec("COMMIT");
        return results;
      } catch (err) {
        sql.exec("ROLLBACK");
        throw err;
      }
    },
  };
  return { db: db as unknown as D1Database, sql };
}
