// A small D1 shim over node:sqlite with the repository's migrations applied,
// for tests that run the Worker's handlers against a real database.

import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export function d1() {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync("migrations").sort()) db.exec(readFileSync(`migrations/${f}`, "utf8"));
  const statement = (sql: string, args: unknown[] = []) => ({
    sql,
    args,
    bind: (...a: unknown[]) => statement(sql, a),
    async first<T>() {
      return (db.prepare(sql).get(...(args as any[])) as T) ?? null;
    },
    async all<T>() {
      return { results: db.prepare(sql).all(...(args as any[])) as T[] };
    },
    async run() {
      const r = db.prepare(sql).run(...(args as any[]));
      return { meta: { changes: Number(r.changes) } };
    },
  });
  return {
    raw: db,
    prepare: (sql: string) => statement(sql),
    async batch(list: ReturnType<typeof statement>[]) {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of list) out.push(await s.run());
        db.exec("COMMIT");
        return out;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
}
