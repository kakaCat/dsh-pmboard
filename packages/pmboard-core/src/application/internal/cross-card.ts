/**
 * 运行期跨卡覆盖兜底（REQ-4842fe t9 / FR-10 次防线）。
 *
 * 子卡产出文件若其 mtime 落在**同需求另一张在跑父卡**的子卡执行窗口内 → 判跨卡覆盖，
 * 该子卡失败并停链，交人仲裁（不自动改文件）。
 *
 * 诚实边界：mtime 只证明"文件被改过"，不证明"内容正确"——本检查防静默覆盖，
 * 不替代人工 review。
 *
 * @module dsh-pmboard/application/internal/cross-card
 */
export interface CrossCardViewTask {
  id: string
  parentId?: string
  status: string
  executions?: ReadonlyArray<{ startedAt: number; endedAt?: number; outcome: string }>
}

export interface CrossCardConflict {
  file: string
  otherParentId: string
  otherSubtaskId: string
}

/**
 * 检测跨卡覆盖。windowEnd 用当前时刻（在跑的执行窗口尚未结束）。
 *
 * `myWindow`（REQ-261003222428-3556 FR-2）：检查方自己的执行窗口。
 * 批内真并行引入后，**我自己开工后的落盘** mtime 必然落在并行对方的窗口内——
 * 先由我自己的窗口解释（我写的，不是覆盖），解释不了才判（别人写的）。
 * 排除判据 = mtime **严格晚于**我的开工时刻（开工前的文件不是我写的，不误放行）。
 * 串行语义不变：串行下我的写本就落在我的窗口内，排除规则不改变任何既有判定。
 */
export function detectCrossCardOverwrite(
  tasks: readonly CrossCardViewTask[],
  myParentId: string,
  files: readonly string[],
  mtimeOf: (file: string) => number | undefined,
  now: number,
  myWindow?: { startedAt: number; endedAt?: number },
): CrossCardConflict | undefined {
  const otherParents = new Set(
    tasks.filter((t) => t.parentId === undefined && t.status === 'in_progress' && t.id !== myParentId).map((t) => t.id),
  )
  if (otherParents.size === 0) return undefined
  for (const other of tasks) {
    if (other.parentId === undefined || !otherParents.has(other.parentId)) continue
    for (const exec of other.executions ?? []) {
      const end = exec.endedAt ?? now
      for (const file of files) {
        const mtime = mtimeOf(file)
        if (mtime === undefined) continue
        // FR-2：mtime 由我自己的执行窗口解释得了（我自己写的）→ 不是跨卡覆盖。
        // 边界用**严格大于** startedAt：mtime ≤ 开工时刻的文件是开工前就在那儿的
        // （不可能是「我写的」），落在别人窗口里仍要判——串行既有语义逐字保留。
        if (myWindow !== undefined && mtime > myWindow.startedAt && mtime <= (myWindow.endedAt ?? now)) continue
        if (mtime >= exec.startedAt && mtime <= end) {
          return { file, otherParentId: other.parentId, otherSubtaskId: other.id }
        }
      }
    }
  }
  return undefined
}
