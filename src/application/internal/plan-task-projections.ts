/**
 * 计划文档任务表 → 卡投影（REQ-261005105032-3b02 FR-5 / t13）——**纯函数、零 IO、只取数不判定**。
 *
 * 为什么要它：`TaskRecord.prototypeRefs` / `decisionRefs` 的写侧在**台账**，而阶段门时序判据这一刻
 * 只有 `docs` 与 `req`（任务集不在 `contentGatesForMove(docs, req, from, to)` 的签名里，§10 #46 明令
 * 不动调用点签名）⇒ 计划文档的任务表是这一刻**唯一**可读的卡投影（`templates/decomposing/decomposition.md`
 * 的任务表列就是本函数认的列）。
 *
 * 它**只回答"这张卡申报了什么"**：判定仍归既有单点——覆盖对照 / UI 卡锚点走
 * `assertClauseCoverageGate`（`content-gate-wiring`），两维覆盖度走 `CoverageChecker`。
 * 投影形状取 RTM 侧的宽容视图 `TraceabilityTaskLike`（台账 / RTM 两种拼法它都认，见 coverage-calculator
 * 的模块头），免得本处再定义第三种卡形状。
 *
 * @module dsh-pmboard/application/internal/plan-task-projections
 */
import { collectIds, type ParsedDoc } from './content-gates.js'
import { planKeysIn } from './content-trace.js'
import type { TraceabilityTaskLike } from '../../../vendor/reqboard/src/rtm/coverage-calculator.js'

/** 列名容忍：同一张表在模板、人手写版与 RTM 生成版式下叫法不同，取第一个命中者（大小写不敏感）。 */
function headerIndex(header: readonly string[], names: readonly string[]): number {
  for (const name of names) {
    const i = header.findIndex(h => h.toLowerCase().includes(name.toLowerCase()))
    if (i >= 0) return i
  }
  return -1
}

/** 根条款编号形态（`影响 FR` / 覆盖条款列里只认这些；`D-3` 之类下游编号另有其列）。 */
const ROOT_CLAUSE_RE = /^(?:FR|BUG|RF|SP|DOC|CH)-\d+$/
const DECISION_ID_RE = /^D-\d+$/

/**
 * 一张卡的投影：两维覆盖度的宽容视图 + `key`（锚点维按它点名）。
 * 为什么交叠而不是新造第三种卡形状：字段全部是既有消费者已经在读的名字（见 `planTaskProjections` 注释）。
 */
export type PlanTaskProjection = TraceabilityTaskLike & { key: string }

/** 占位符（`—` / `-`）与"没写"同义：留空让门禁报「缺锚点」，而不是把占位符当成一条锚点。 */
function anchorsIn(cell: string): string[] {
  return cell.length > 0 && !cell.startsWith('—') && cell !== '-' ? [cell] : []
}

/**
 * 计划文档 → 卡投影数组（一张表一行可含多个计划 key ⇒ 展开成多张卡）。
 *
 * 两张表都会被读到，这是刻意的：任务表（`计划 key` + `端侧` + `原型锚点` + `关联 D-x` + `覆盖条款`）
 * 与覆盖对照表（`接收任务` + `需求条款`）各自带一半信息，键与引用都按 `planKeysIn` 认（计划 key 的
 * 词法只有那一处真相）。
 *
 * 为什么键要**同时**写 `id` 与 `key`：两条消费者的取键字段不同——两维覆盖度走 `id`
 * （`TraceabilityTaskLike`），UI 卡锚点维走 `key`（`planTaskAnchorViews`）。只写一个的后果实测过：
 * `assertClauseCoverageGate` 读不到 `key` 就回落成**按行号编的 `k1`**，拒绝消息点名的是一张不存在的卡。
 * 同一个键写两遍不是两份真相，而是同一份值的两个字段名（两个上游口径的命名差）。
 */
export function planTaskProjections(doc: ParsedDoc): PlanTaskProjection[] {
  const out: PlanTaskProjection[] = []
  for (const table of doc.tables) {
    const iKey = headerIndex(table.header, ['计划 key', '计划key', '计划键', '接收任务', '任务 id', '任务'])
    const iSide = headerIndex(table.header, ['端侧', 'side'])
    const iAnchor = table.header.findIndex(h => /原型|prototype/i.test(h))
    const iDecision = headerIndex(table.header, ['关联 d-x', 'd-x', '裁定'])
    const iRefs = headerIndex(table.header, ['覆盖条款', '需求条款', '需求编号', '根编号'])
    // 与卡无关的表（如「编号口径」表）：既没有端侧，也没有锚点 / 裁定 / 条款列 → 整张跳过。
    if (iKey < 0 || (iSide < 0 && iAnchor < 0 && iDecision < 0 && iRefs < 0)) continue

    for (const row of table.rows) {
      const cell = (i: number): string => (i >= 0 ? (row[i] ?? '').trim() : '')
      const keys = planKeysIn(cell(iKey))
      if (keys.length === 0) continue
      const side = cell(iSide)
      const refs = collectIds(cell(iRefs)).filter(id => ROOT_CLAUSE_RE.test(id))
      const decisions = collectIds(cell(iDecision)).filter(id => DECISION_ID_RE.test(id))
      const anchors = anchorsIn(cell(iAnchor))
      for (const key of keys) {
        out.push({
          id: key,
          key,
          ...(side.length > 0 ? { side } : {}),
          ...(refs.length > 0 ? { requirementRefs: refs } : {}),
          ...(decisions.length > 0 ? { decisionRefs: decisions } : {}),
          ...(anchors.length > 0 ? { prototypeRefs: anchors } : {}),
        })
      }
    }
  }
  return out
}
