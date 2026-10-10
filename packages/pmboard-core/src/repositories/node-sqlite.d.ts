/**
 * `node:sqlite` 的最小类型声明（REQ-261004103330-005f FR-7）。
 *
 * 为什么需要它：本仓 devDependencies 锁的是 `@types/node@20.x`，而 `node:sqlite` 是
 * Node 22.5+ 才加入的内置模块——**20.x 的类型里没有它**，直接 `import ... from 'node:sqlite'`
 * 会以 TS2307 撞类型门（本项目有"tsc 错误数不得高于基线"的硬门禁）。
 *
 * 只声明**我们真正用到**的那几个成员（`DatabaseSync` / `StatementSync` 的 exec/prepare/run/get/all/close），
 * 不做完整镜像：多余的声明会让人以为有别的能力可用。
 *
 * 何时可以删：把 `@types/node` 升到自带 `sqlite.d.ts` 的版本（≥22）之后——届时本文件会与官方
 * 声明冲突（重复声明同一模块），删掉即可，实现代码不用改。
 */
declare module 'node:sqlite' {
  /** 查询结果行：`node:sqlite` 返回的是 null-prototype 对象，只当普通字典用。 */
  export type SqliteRow = Record<string, unknown>

  export interface StatementSync {
    all(...params: unknown[]): SqliteRow[]
    get(...params: unknown[]): SqliteRow | undefined
    run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint }
  }

  export class DatabaseSync {
    constructor(path: string, options?: { open?: boolean; readOnly?: boolean })
    /** 执行多条语句（DDL/PRAGMA/事务控制）。 */
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
}
