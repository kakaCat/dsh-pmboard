/**
 * 锚点与切节（REQ-261001110934-3766 t1 / design/data-model.md「id 形态与存储映射」）。
 *
 * 为什么把「锚点规则」放在 domain 单点：写入端（归档沉淀 / 生成器）与读取端（reqboard_kb 按 id 取正文）
 * 必须**用同一函数算锚点**，否则会出现「索引指向 #c-01、页面里却叫 #c-1」这类静默失效
 * ——本次实测踩过的同类坑是 Aider 的 mentions 误入缓存 key。
 *
 * 锚点规则（三级回落，全部确定性）：
 *   ① 标题末尾显式 `#anchor`（如 `## 颜色 #colors`）→ 直接用它；
 *   ② 标题第一个词是 ASCII 标识符（如 `### C-01 层边界…`）→ 用它 slugify；
 *   ③ 否则整条标题 slugify（允许中文）。
 *
 * @module dsh-pmboard/domain/knowledge/slug
 */

/** 允许出现在 slug 里的字符：小写字母、数字、连字符与中文。 */
const SLUG_DROP_RE = /[^a-z0-9\u4e00-\u9fff-]+/g

/** 文本 → slug（小写、非法字符转 `-`、折叠重复、去首尾）。空结果回落 `section`。 */
export function slugify(text: string): string {
  const out = text
    .trim()
    .toLowerCase()
    .replace(SLUG_DROP_RE, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  return out.length > 0 ? out : 'section'
}

/** 标题里的显式锚点（`… #anchor`）——取最后一个 `#` 段，且必须是合法 slug 字符集。 */
function explicitAnchor(heading: string): string | undefined {
  const m = /#([A-Za-z0-9\u4e00-\u9fff][A-Za-z0-9\u4e00-\u9fff._-]*)\s*$/.exec(heading)
  if (m === null) return undefined
  const raw = m[1]!
  // 标题整体就是 `# 颜色` 这种（只有一个 #）不算显式锚点
  if (heading.trim().startsWith('#' + raw)) return undefined
  return slugify(raw.replace(/\./g, '-'))
}

/** 标题 → 锚点（规则见模块头）。 */
export function headingAnchor(heading: string): string {
  const text = heading.replace(/^#+\s*/, '').trim()
  const explicit = explicitAnchor(text)
  if (explicit !== undefined) return explicit
  const first = text.split(/\s+/)[0] ?? ''
  if (/^[A-Za-z][A-Za-z0-9._-]*$/.test(first)) return slugify(first.replace(/\./g, '-'))
  return slugify(text)
}

/** 在已占用集合里取唯一 slug（重名 → `-2`、`-3`…）。 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(base)) return base
  let n = 2
  while (used.has(base + '-' + String(n))) n += 1
  return base + '-' + String(n)
}

/** 文档里的全部标题锚点（供死链检查与去重）。 */
export interface HeadingRef {
  readonly anchor: string
  readonly level: number
  readonly title: string
  readonly line: number
}

/** 抽出 `#` 开头标题的锚点列表（跳过代码围栏内的 `#` 注释行）。 */
export function listHeadingAnchors(md: string): readonly HeadingRef[] {
  const out: HeadingRef[] = []
  let inFence = false
  const lines = md.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = /^(#{1,6})\s+(.*)$/.exec(line)
    if (m === null) continue
    const level = m[1]!.length
    const title = m[2]!.replace(/\s*#\S+\s*$/, '').trim()
    out.push({ anchor: headingAnchor(m[2]!), level, title, line: i + 1 })
  }
  return out
}

/**
 * 按锚点切出一个小节：**含该标题行**，到下一个层级不更深的标题为止（不含）。
 * 含标题行是刻意的：工具把这段直接回给 Agent 时，读者需要知道"这是什么节"。
 * 找不到 → undefined（调用方据此报死链，而不是返回空串假装成功）。
 */
export function sliceSection(md: string, anchor: string): string | undefined {
  const target = listHeadingAnchors(md).find((h) => h.anchor === anchor)
  if (target === undefined) return undefined
  const lines = md.split('\n')
  const body: string[] = [lines[target.line - 1]!]
  // 标题在第 target.line 行（1-based）→ 正文从数组下标 target.line 开始
  for (let i = target.line; i < lines.length; i += 1) {
    const m = /^(#{1,6})\s+/.exec(lines[i]!)
    if (m !== null && m[1]!.length <= target.level) break
    body.push(lines[i]!)
  }
  while (body.length > 1 && body[body.length - 1]!.trim().length === 0) body.pop()
  return body.join('\n')
}
