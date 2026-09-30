/**
 * 验收单任务投影（REQ-260930183951-eb6c FR-1）。
 *
 * 为什么单独成模块：投影散落一次，字段就会静默丢一次——本需求立项的直接成因正是
 * `SubmitVerification` 内联投影只取 `{id,title,acceptance}`，**丢掉 `parentId`**，
 * 于是 `AcceptanceSheetSpec.buildSheet` 的 domain 侧二次过滤（`parentId === undefined`）
 * 恒等通过、成为死代码（"双保险"只有一层是真的）。
 *
 * 现在投影是**唯一实现**：谁要把队列任务喂给 buildSheet，都得走 `toSheetTasks`。
 *
 * 纯函数、零 I/O。
 *
 * @module dsh-pmboard/application/internal/sheet-tasks
 */
import type { TaskRecord } from '../../shared/protocol.js'

/** `buildSheet` 的 tasks 入参形状（对齐 domain `SheetTaskLike` 的最小子集）。 */
export interface SheetTaskInput {
  id: string
  title: string
  acceptance: string
  /** 有值 = 子卡：buildSheet 只收顶层父卡，子卡验收由父卡项覆盖。 */
  parentId?: string
}

/**
 * 队列任务 → 验收单任务投影。
 *
 * - 顺序与输入一致（验收项顺序即人读顺序）；
 * - `status === 'canceled'` 剔除（既有语义）；
 * - `parentId` 为空串 / 缺省 → **不写该键**（顶层卡只有一种形态，避免 `''` 与 `undefined` 两态）；
 * - `acceptance` 缺省补空串（domain 侧按「交付完成」兜底文案展示）。
 */
export function toSheetTasks(tasks: readonly TaskRecord[]): SheetTaskInput[] {
  const out: SheetTaskInput[] = []
  for (const t of tasks) {
    if (t.status === 'canceled') continue
    // 空串与 undefined 归一：两者都表示"顶层卡"。
    const parentId = typeof t.parentId === 'string' && t.parentId.length > 0 ? t.parentId : undefined
    out.push({
      id: t.id,
      title: t.title,
      acceptance: t.acceptance ?? '',
      ...(parentId !== undefined ? { parentId } : {}),
    })
  }
  return out
}
