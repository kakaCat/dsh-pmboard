/**
 * 冷侧写豁免（REQ-261002161439-277d t8 / 人工裁定 2026-10-02）。
 *
 * ## 为什么需要它
 *
 * 分片存储把 `archived` / `done` 判为**冷侧只读**（`REQBOARD_COLD_IMMUTABLE`），
 * 而 `reqboard_submit(kind=archive)` 的语义恰恰是「给**已归档/已完成**的需求备归档材料」——
 * 两者直接冲突：切换后归档提交会失效。旧单册台账不区分冷热、一律可写，所以这条路径一直通着。
 *
 * 裁定（见 `notes/t8-progress.md` §14.2）：**冷侧豁免「归档材料」这一类写**，其余仍只读。
 *
 * ## 判据为什么是"改了什么"而不是"谁在写"
 *
 * 豁免与否不能只看调用方是谁（工具层可被绕过），要看**这次变更到底动了哪些字段**：
 * 只有"归档材料及其随行簿记"变了，才放行；只要碰了别的字段（标题、产物、计划、验收、状态……），
 * 照旧抛 `REQBOARD_COLD_IMMUTABLE`。
 *
 * 这也是为什么两处实现的冷侧检查都必须**挪到变更器跑完之后**——`fn` 只改本地 draft 克隆、
 * 无落盘副作用，放到后面才能知道"改了什么"。
 *
 * 纯函数、零依赖（domain 硬约束：不 import 上层）；入参收结构化最小投影。
 *
 * @module dsh-pmboard/domain/requirement/ColdWrite
 */

type AnyRecord = Record<string, unknown>

/**
 * 冷侧写豁免的键集。
 *
 * 这三项一起构成"**归档收尾**"这一族写（人工裁定 2026-10-02，两条）：
 * - `archive`：归档材料本体；
 * - `archivePath`：材料补齐时同时写的归档落章路径（`SubmitArchive` 在 `status==='archived'` 时写）；
 * - `artifacts`：**archive 产物的登记**（`SubmitArchive` 的**第二次** mutate 只做这件事）；
 * - `comments`：归档材料的**随行留痕**（与材料在同一次 `mutate` 里写）。
 * - `updatedAt` / `updatedBy` / `version` / `docSyncPending`：存储自管或时间戳类标量。
 *
 * **不在**表里的（写冷侧仍被拒）：`title` / `description` / `status` / `plan` /
 * `verification` / `dive` / `tokenUsage` / `blocked` / `category` 及任何其它字段。
 */
export const COLD_WRITE_EXEMPT_KEYS: readonly string[] = [
  'archive', 'archivePath', 'artifacts', 'comments',
  'updatedAt', 'updatedBy', 'version', 'docSyncPending',
]

/**
 * 豁免的**触发键**：冷侧唯一可写场景是"归档收尾"（备材料 / 登记 archive 产物），
 * 所以豁免必须由这两个里**至少一个真的发生变化**来触发。
 *
 * 这一条让「归档收尾」与「独立的 `appendComment`」**天然可分**，且**不需要给端口加任何意图标记**：
 *   * 归档收尾：`archive`（或第二次 mutate 的 `artifacts`）变了 ⇒ 触发 ⇒ 随行的评论一并放行；
 *   * `appendComment`：只动 `comments`、两个触发键都没变 ⇒ **不触发** ⇒ 冷侧照旧拒
 *     （`store-contract.test.ts` 那条断言不变）。
 */
export const COLD_WRITE_TRIGGER_KEYS: readonly string[] = ['archive', 'artifacts']

/**
 * 这次变更是否属于冷侧豁免（"触发了归档收尾，且除随行簿记外没动别的，且状态未变"）。
 *
 * 状态必须是**不变**的：状态一变就不是"备材料"，而是流程推进——那要走状态机、不能在冷侧悄悄发生。
 *
 * 比较用 `JSON.stringify`：两侧都是同一条记录（`before` 与它的克隆 draft），键序一致。
 * 这一点与写侧 `canonical()` 的"键序无关"不同，是本豁免刻意接受的前提——若将来 draft 的键序
 * 会漂移，本函数会倾向于**更严**（判成非豁免 → 拒写），不会误放行。
 */
export function isColdWriteExempt(before: AnyRecord, draft: AnyRecord): boolean {
  if (before.status !== draft.status) return false
  const keys = new Set<string>([...Object.keys(before), ...Object.keys(draft)])
  let triggered = false
  for (const key of keys) {
    const changed = JSON.stringify(before[key]) !== JSON.stringify(draft[key])
    if (COLD_WRITE_TRIGGER_KEYS.includes(key)) {
      if (changed) triggered = true
      continue
    }
    if (!changed) continue
    if (COLD_WRITE_EXEMPT_KEYS.includes(key)) continue
    return false
  }
  return triggered
}
