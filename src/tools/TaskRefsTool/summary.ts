/**
 * `reqboard_task_refs` 的返回体渲染（一行，人读）。
 *
 * 与 `tools/render-summaries.ts` 分开放：那个文件被多处共用、体积已大，本工具自带一份小渲染，
 * 避免为一行文案去改共享文件（也更不容易和别的窗口冲突）。
 *
 * @module dsh-pmboard/tools/TaskRefsTool/summary
 */
function asObj(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined
}

function ids(v: unknown): string {
  return Array.isArray(v) ? (v.length > 0 ? v.join('、') : '（空）') : '?'
}

export function taskRefsSummary(v: unknown): string {
  const o = asObj(v)
  if (o === undefined) return '🏷️ 补写条款引用（结果形态未知）'
  const id = typeof o['task_id'] === 'string' ? o['task_id'] : '?'
  if (o['changed'] === false) return `🏷️ ${id} 引用未变（未写盘）`
  const rtm = o['rtm_synced'] === true ? '，RTM 已同步' : '，RTM 未同步'
  return `🏷️ ${id} 引用：${ids(o['before'])} → ${ids(o['after'])}${rtm}`
}
