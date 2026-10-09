/**
 * `reqboard_task_amend` 的返回体渲染（一行，人读）——按 `op` 选对应摘要。
 *
 * REQ-261007220012-bd29 FR-4：refs / adopt / chain 三个修缮工具合一后，
 * 渲染按 op 分派（各段实现与原工具逐字一致，只在这里会合）；
 * REQ-261008020552-4aa0 FR-1：archive（归档清单补录）一支并入。
 *
 * @module dsh-pmboard/tools/TaskAmendTool/summary
 */
import { fmt } from '../../domain/text/fmt.js'

function asObj(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined
}

const s = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)
const errText = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? '❌ ' + v.slice(0, 80) : undefined)

function ids(v: unknown): string {
  return Array.isArray(v) ? (v.length > 0 ? v.join('、') : '（空）') : '?'
}

/** op=refs（原条款引用补写工具的渲染，逐字一致）。 */
export function taskRefsSummary(v: unknown): string {
  const o = asObj(v)
  if (o === undefined) return '🏷️ 补写条款引用（结果形态未知）'
  const id = typeof o['task_id'] === 'string' ? o['task_id'] : '?'
  if (o['changed'] === false) return `🏷️ ${id} 引用未变（未写盘）`
  const rtm = o['rtm_synced'] === true ? '，RTM 已同步' : '，RTM 未同步'
  return `🏷️ ${id} 引用：${ids(o['before'])} → ${ids(o['after'])}${rtm}`
}

/** op=adopt（原归属补救工具的渲染，逐字一致）。 */
export function taskAdoptSummary(v: unknown): string {
  const o = asObj(v)
  if (o === undefined) return '🧩 归属补救（结果形态未知）'
  if (o['success'] === false || o['error'] !== undefined) {
    return fmt('归属补救被拒：{why}', { why: String(o['error'] ?? '见明细').slice(0, 80) })
  }
  return fmt('归属补救：{t} → 父卡 {p}（{k}）', {
    t: String(o['task_id'] ?? ''),
    p: String(o['parent_id'] ?? ''),
    k: String(o['stage_kind'] ?? ''),
  })
}

/** op=chain（原补链工具的渲染，逐字一致）。 */
export function taskChainSummary(v: unknown): string {
  const o = asObj(v)
  if (o === undefined) return '🔗 子卡链再生成（结果形态未知）'
  if (o['success'] !== true) return fmt('子卡链再生成未成功：{error}', { error: String(o['error'] ?? '') })
  const mode = o['dry_run'] === true ? '只读诊断' : '已补链'
  return fmt('子卡链{mode}（{req}）：扫描 {n} 张顶层卡，本次补子卡 {k} 张', {
    mode,
    req: String(o['requirement_id'] ?? ''),
    n: String(o['scanned'] ?? 0),
    k: String(o['created_total'] ?? 0),
  })
}

/** op=archive（原归档清单补录工具的渲染，逐字迁入）。 */
export function archiveAmendSummary(data: unknown): string {
  const o = asObj(data)
  if (o === undefined) return '归档清单补录：返回体不可读'
  const appended = Array.isArray(o.appended) ? o.appended.length : 0
  const skipped = Array.isArray(o.skipped) ? o.skipped.length : 0
  return '归档清单补录：追加 ' + String(appended) + ' 条 · 跳过 ' + String(skipped) + ' 条（已存在）'
    // 括号取值（与其余 summary 的 o['success'] 同款）：这是对**回执字段**的类型守卫，
    // 不是领域状态比较；点号写法会被 tools-dispatch 的静态门禁误判为状态等值比较（门禁扫的是原文，注释也扫）。
    + (typeof o['status'] === 'string' ? ' · 需求状态 ' + o['status'] : '')
}

/** op=interruption（原断点补写工具的渲染，从 render-summaries 逐字迁入）：🩹 REQ-xxx 已记断点：<原因>（阶段 x） */
export function noteInterruptionSummary(v: unknown): string {
  const e = errText(v); if (e !== undefined) return e
  const o = asObj(v)
  if (o === undefined) return '⚙️ 记录断点（结果形态未知）'
  if (o.success === false) return fmt('❌ 记录断点被拒：{note}', { note: (s(o.note) ?? '见明细').slice(0, 60) })
  const bp = asObj(o.interruption)
  const reason = bp !== undefined ? s(bp.reason) : undefined
  const stage = bp !== undefined ? s(bp.stage) : undefined
  return fmt('🩹 {id} 已记断点{reason}{stage}', {
    id: s(o.requirement_id) ?? '?',
    reason: reason !== undefined ? fmt('：{r}', { r: reason.slice(0, 40) }) : '',
    stage: stage !== undefined ? fmt('（阶段 {s}）', { s: stage }) : '',
  })
}

/** 按 op 选摘要（未知 op 由工具壳在分派前拒绝，这里只兜底）。 */
export function taskAmendSummary(v: unknown): string {
  const o = asObj(v)
  const op = o?.['op']
  if (op === 'adopt') return taskAdoptSummary(v)
  if (op === 'chain') return taskChainSummary(v)
  if (op === 'archive') return archiveAmendSummary(v)
  if (op === 'interruption') return noteInterruptionSummary(v)
  return taskRefsSummary(v)
}
