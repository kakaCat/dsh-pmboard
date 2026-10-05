/**
 * 摘要分页的**共享助手**（REQ-261002161439-277d · t4）。
 *
 * 抽出来的两个理由：
 * 1. **排序键属端口契约**（`updatedAt` 降序、同刻 `id` 升序，见 `application/ports.ts` 的
 *    `listSummaries` 文档）——内存替身与分片实现必须用**同一份**实现，否则"契约"会在两处漂移，
 *    而漂移的症状是"分页偶尔跳页/重页"，最难查；
 * 2. 分片实现自己的单文件行数门禁（≤400 行）需要把这块挪出去。
 *
 * 游标是**不透明**的：格式只对本文件与消费它的实现有意义，调用方（含客户端）不得解析。
 *
 * @module dsh-pmboard/repositories/shardPaging
 */

/** 摘要分页游标前缀（本仓分片/内存两实现的共同格式；DB 适配器可自定）。 */
const CURSOR_PREFIX = 'idx:'

/** 生成游标（`offset` = 下一页起始下标）。 */
export function encodeSummaryCursor(offset: number): string {
  return CURSOR_PREFIX + String(offset)
}

/**
 * 解析游标：`undefined` = 第一页（返回 0）；解析不出来（越界/伪造/过期）返回 `null`
 * ——调用方据此返回**空页**而不是抛错（看板不该因一个坏游标整页报错）。
 */
export function decodeSummaryCursor(cursor: string | undefined): number | null {
  if (cursor === undefined) return 0
  if (!cursor.startsWith(CURSOR_PREFIX)) return null
  const n = Number(cursor.slice(CURSOR_PREFIX.length))
  return Number.isInteger(n) && n >= 0 ? n : null
}

/**
 * 排序契约：`updatedAt` 降序，同一时刻按 `id` 升序（稳定，分页才有意义）。
 *
 * 泛型只要求这两个字段——摘要与完整记录都能排，避免"排记录时再抄一份比较函数"
 * （抄出来的那份就是第二份真相）。
 */
export function compareSummaryOrder<T extends { readonly updatedAt: number; readonly id: string }>(a: T, b: T): number {
  if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
