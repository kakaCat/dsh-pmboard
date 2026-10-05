/**
 * 计划文档依赖表 ↔ tasks 数组 一致性检查（REQ-261003222428-3556 FR-3）。
 *
 * 为什么需要：2026-10-03 实测——agent 提交计划时在 decomposition.md 的依赖表里写了
 * t2→t1，tasks 数组却漏传 depends_on（字段可选，静默通过），落库后父卡并行开工、
 * 顺序语义丢失，且被误判为「落库丢依赖」的系统 bug 排查了一轮。
 * 文档与数组不一致时**回执点名警告**（不拒：纯文档卡天然无依赖，格式也由人手写）。
 *
 * 提取口径（保守）：首列是任务 key 的表格行里，**其余单元格**按分隔符拆出的任务 key
 * 都算文档声明的依赖；只比较「文档声明了、数组却全空」这一种最危险形态。
 *
 * @module dsh-pmboard/application/internal/plan-deps-check
 */
import type { PlanTask } from '../../shared/protocol.js'

/**
 * 从计划文档提取「key → 文档声明的依赖 key 集」。
 * 识别 markdown 表格行：首列单元格是任务 key；其余单元格按 `,、，/空格` 拆分后
 * 命中任务 key 的 token 记为一条依赖声明。分隔行（---）与表头自然不命中（首列非 key）。
 */
export function docDependencyRefs(docText: string, keys: ReadonlySet<string>): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const line of docText.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) continue
    const cells = trimmed.split('|').map((c) => c.trim()).filter((c) => c.length > 0)
    if (cells.length < 2 || !keys.has(cells[0]!)) continue
    const owner = cells[0]!
    for (const cell of cells.slice(1)) {
      for (const token of cell.split(/[,、，/\s]+/)) {
        if (token.length > 0 && token !== owner && keys.has(token)) {
          const list = out.get(owner) ?? []
          if (!list.includes(token)) list.push(token)
          out.set(owner, list)
        }
      }
    }
  }
  return out
}

/**
 * 一致性警告：文档依赖表声明了依赖、但 tasks 数组对应 key 的 dependsOn 为空 → 逐条点名。
 * 空文档（读不到/无表格）→ 空数组（没依据就不说话，不误报）。
 */
export function planDependencyWarnings(docText: string, tasks: readonly PlanTask[]): string[] {
  if (tasks.length === 0 || docText.trim().length === 0) return []
  const keys = new Set(tasks.map((t) => t.key))
  const docRefs = docDependencyRefs(docText, keys)
  const warnings: string[] = []
  for (const t of tasks) {
    const declared = docRefs.get(t.key) ?? []
    if (declared.length === 0) continue
    if ((t.dependsOn ?? []).length > 0) continue
    warnings.push(
      `${t.key}：计划文档依赖表声明了依赖（${declared.join('、')}），但 tasks 数组的 depends_on 为空`
      + '——疑似漏传 depends_on 字段（落库后该卡会与上游并行开工、顺序语义丢失）；'
      + '如确有依赖请重交计划补上，如无依赖请把文档依赖表改成「-」',
    )
  }
  return warnings
}
