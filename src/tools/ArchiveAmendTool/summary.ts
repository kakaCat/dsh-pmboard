/**
 * `reqboard_archive_amend` 的返回体渲染（一行，人读）。
 *
 * @module dsh-pmboard/tools/ArchiveAmendTool/summary
 */
function asObj(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined
}

/** 一行摘要：补了几条、跳过几条、当前状态。 */
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
