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
import { declaredFiles } from './conflict-check.js'

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

/**
 * 零交集依赖边的点名（2026-10-06 缺口 4 之三）——**只点名、不拒**，与上面同构。
 *
 * 为什么需要：`depends_on` 是自由文本的语义声明，落库后就是**硬串行**（上游没完下游不动）。
 * 而计划里的依赖边有一类很贵的手滑——把本可并行的卡串成链（"顺手都依赖一下 t1"），
 * 成本是整轮 wall-clock，且没有任何判据会红。本函数用唯一可得的客观量（两端 implementation
 * 里声明的文件路径，`declaredFiles`）做交集：**零交集 = 这条边在文件面上没有任何证据**，
 * 于是点名要理由（写进 `tasks[].dep_reasons` = 作者已复核过这条边），而不是替作者判它错。
 *
 * 诚实的边界（为什么**两端都得有声明的路径**才点名）：`declaredFiles` 是文本抽取器，抽不到
 * 就等于"没有证据"——一端抽空时交集必空，此时点名会把「implementation 没写路径」误报成
 * 「伪依赖」。与 conflict-check 的诚实边界同口径：**没依据就不说话**。代价如实登记：
 * 路径没写进 implementation 的计划，本判据查不出（想让它查得出，先把落点写进 implementation）。
 *
 * 理由的读法：`PlanTask.dep_reasons`（`{ 上游 key: 一句话 }`，主拼 snake、兼容 camel `depReasons`）。
 * 有理由 = 不点名（不再判理由写得好不好——那是复核人读文档时的判断，机器再判一次只会逼人写套话）。
 */
export function zeroOverlapDependencyWarnings(tasks: readonly PlanTask[]): string[] {
  if (tasks.length === 0) return []
  const byKey = new Map(tasks.map((t) => [t.key, t]))
  const filesOf = new Map(tasks.map((t) => [t.key, declaredFiles(t.implementation ?? '')]))
  const warnings: string[] = []
  for (const t of tasks) {
    const mine = filesOf.get(t.key) ?? []
    if (mine.length === 0) continue
    for (const dep of t.dependsOn ?? []) {
      const up = byKey.get(dep)
      if (up === undefined) continue // 悬空依赖另有判据（checkPlanTaskReferences），这里不抢报
      const theirs = filesOf.get(dep) ?? []
      if (theirs.length === 0) continue // 上游没声明路径 → 没有证据，不误报（见上「诚实的边界」）
      if (mine.some((f) => theirs.includes(f))) continue // 有交集 = 这条边在文件面上站得住
      if ((t.dep_reasons ?? {})[dep] !== undefined) continue // 已给语义理由 → 作者复核过，放行
      warnings.push(
        `${t.key} → ${dep}：两端声明文件零交集（${t.key}: ${mine.join(',')} / ${dep}: ${theirs.join(',')}）`
        + '——疑似伪依赖（可并行的卡被串成链，落库后是硬串行）；确需串行请在 tasks[] 的 dep_reasons 里'
        // REQ-261008020552-4aa0 FR-4：写法细则从 schema 描述下沉到本回执（细则之家，只追加；
        // 折进同一段模板串，不新增拼接计数——消息卫生棘轮）。
        + `给 ${dep} 写一句语义理由（例：「${dep} 重建队列文件，${t.key} 读它，虽无同名文件但有时序约束」）；写法：key=理由，用半角等号或冒号分隔（snake dep_reasons / camel depReasons 两种拼法都认，合并取并集）`,
      )
    }
  }
  return warnings
}
