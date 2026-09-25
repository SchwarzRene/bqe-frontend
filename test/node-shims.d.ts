// The flow test runs under Node (vitest), not in the Worker, and uses two of
// its built-ins. Declared here rather than pulling in all of @types/node,
// whose globals clash with @cloudflare/workers-types.
declare module "node:fs" {
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: "utf8"): string;
}
declare module "node:sqlite" {
  interface Statement {
    get(...args: any[]): any;
    all(...args: any[]): any[];
    run(...args: any[]): { changes: number | bigint };
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): Statement;
  }
}
