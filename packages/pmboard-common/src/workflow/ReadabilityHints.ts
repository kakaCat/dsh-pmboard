/**
 * 人读性提示（2026-10-01 人读纪律的机械兜底）：产文档写给人看——
 * 开头三件套（TL;DR + ASCII 图 + 总览表）缺哪样提示哪样。
 *
 * **软门禁**：只提示、不阻断（与追溯断链告警同构）；提交响应里带
 * readability_warnings，agent 可读可改，人不因缺图被卡流程。
 *
 * 纯函数、零 I/O。固定文案为字面量（无拼接，见 tests/message-hygiene.test.ts）。
 *
 * @module dsh-pmboard/domain/workflow/ReadabilityHints
 */

/**
 * 围栏代码块（```...```）正文抽取——ASCII 流程图只认代码块内的箭头，防散文误判；
 * ```mermaid 标记块跳过（禁令：mermaid 不算 ASCII 图）。
 */
function fencedBlocks(text: string): string[] {
  const out: string[] = []
  const re = /```(\w*)[^\n]*\n([\s\S]*?)```/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if ((m[1] ?? '').toLowerCase() === 'mermaid') continue
    out.push(m[2] ?? '')
  }
  return out
}

/** 是否有 ASCII 图：盒画字符（全文罕见于散文）或代码块内的箭头/方框。 */
function hasAsciiDiagram(text: string): boolean {
  const stripped = text.replace(/<!--[\s\S]*?-->/g, '')
  if (/[─━│┃┌┍┐┑└┕┘┙├┤┬┴┼═║╔╗╚╝▶▼◀▲►▽◄]/.test(stripped)) return true
  return fencedBlocks(stripped).some(b => /[-=]{2,}>|<[-=]{2,}|\+[-=]{2,}\+/.test(b))
}

/** 是否有 markdown 表格（表头行 + 分隔行）。 */
function hasTable(text: string): boolean {
  return /\n[ \t]*\|[^\n]+\|[ \t]*\n[ \t]*\|[ :|-]+\|/.test(text)
}

/** 是否有 TL;DR 开头（节标题或加粗行均可）。 */
function hasTldr(text: string): boolean {
  return /^(?:#{1,6}\s*|\*\*)TL;?DR/im.test(text)
}

/**
 * 人读性体检：缺 TL;DR / 缺 ASCII 图 / 缺表格各给一条可操作提示（空数组 = 全齐）。
 * 提示带修复锚点（人读纪律 + 模板），不是空话。
 * （无占位符的固定文案直接写字面量——message-hygiene 禁的是拼接，不是字面量。）
 */
export function readabilityHints(docText: string): string[] {
  const hints: string[] = []
  if (!hasTldr(docText)) hints.push('缺 TL;DR：文档开头加 3 行以内的一句话总结（是什么/为什么/得到什么），人 10 秒读完再决定看不看细节')
  if (!hasAsciiDiagram(docText)) hints.push('缺 ASCII 图：开头或核心节加一张字符画（svgbob 风格 + - | > < ^ v，围栏代码块内；禁用 mermaid），流程/结构看图比读段落快')
  if (!hasTable(docText)) hints.push('缺表格：并列 ≥3 项且每项有多个属性的内容（功能点/角色/改动清单）用表格，不用 ①②③ 内联枚举')
  return hints
}
