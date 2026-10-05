/**
 * 行内 Markdown 的**显示层**转换（REQ-261004222448-292a · 2026-10-05 渲染变形修复）。
 *
 * ## 为什么只能在渲染层做
 *
 * 页面铺的是**文档 / 台账原文**（需求文档节选、汇报摘要、验收单条目、对话消息……）。
 * 这些原文按 Markdown 写作，抽取到页面时标记还在：`**一句话**：…`、`` `innerHTML` ``、
 * `- 第一条`、`| 列 | 列 |`——原样铺出来就像"页面坏了"。
 *
 * 但服务端的契约要求摘要**必须是原文子串**（有用例断言 `arch.includes(summary[0])`），
 * 所以**一个字都不许在服务端改**。于是转换只能发生在 DOM 之前的最后一跳：这里。
 *
 * ## 三条纪律
 *
 *  ① **先转义再替换**：入参先过 `esc()`，再对**已转义**的串做标记替换。反过来（先替换后转义）
 *     会把我们自己插入的 `<b>` 一起转义掉，而"先替换后转义"的变体（信任原文）就是 XSS。
 *     给对话面板留的 `mdInlineEscaped` 是同一实现——它接的是**别人已经转义过**的串
 *     （检索高亮的 `<mark>` 已经插进去了），故它自己**不再转义**，只做替换。
 *  ② **只剥标记 / 只换标签，不改字**：`**x**` → `<b>x</b>`，`` `x` `` → `<code>x</code>`，
 *     行首 `#` / `> ` / `- ` / `|` 是**结构标记**（照原型渲染成标题 / 引文 / 列表 / 表格行），
 *     正文里的字一个不增不减。
 *  ③ **只出内联级元素**：产物可能落在 `<p>` / `<td>` / `<div>` 里（trunk 的摘要行就是 `<p>`），
 *     所以一律用 `<span>`（靠 CSS 的 `display` 决定块/内联），不产出 `<div>`（块级元素塞进 `<p>`
 *     会被浏览器提前闭合，整块版式错位）。
 *
 * ## 不做什么
 *
 *  · 不解析嵌套/引用式语法（`[a][b]`、HTML 块、围栏代码块）——本仓的正文来源不需要；
 *  · 不产出链接（`[text](url)`）：原文里的 URL 是**证据**，不是给人点的入口（点开正文走
 *    `data-open-doc` 那条链），把它变成 `<a>` 会让"点得开"与"点不开"混在一起；
 *  · 不做**多行** Markdown 的块级重建：只逐行看行首标记，不与前后行发生关系（除了把
 *    相邻的 `| … |` 行各渲染成一行——表格的分隔行 `|---|---|` 直接丢掉）。
 *
 * @module dsh-pmboard/client/render/md-inline
 */
import { esc } from '../html.js'

/* ────────────────────────────────────────────────────────────── 行首标记 */

/** 标题：`# ~ ######` + 空格（CommonMark 的 0~3 个前导空格也认）。 */
const RE_HEADING = /^ {0,3}(#{1,6})\s+(.*)$/
/** 无序列表：`- ` / `* ` / `+ `。 */
const RE_BULLET = /^(\s*)[-*+]\s+(\S.*)$/
/** 有序列表：`1. ` / `1) `（数字最多三位，后面必须跟空格——免得把 `2026.10` 这种当列表）。 */
const RE_ORDERED = /^(\s*)(\d{1,3})[.)]\s+(\S.*)$/
/**
 * 引文：`> ` / `>`（**注意**：`>` 在转义后是 `&gt;`——本模块的入参是**已转义**的串，
 * 所以这里两种写法都得认。只认字面量 `>` 会让这一支永远匹配不上：引文标记反而原样露出来）。
 */
const RE_QUOTE = /^(\s*)(?:&gt;|>)\s?(.*)$/
/** 表格行：整行被 `|` 夹住（**必须**首尾都是 `|`——`cmd | grep x` 这类不是表格）。 */
const RE_TABLE_ROW = /^\s*\|(.*)\|\s*$/
/** 表格分隔行：`|---|---|`（只由 `-` / `:` 组成）——它是排版标记，不是内容，直接不渲染。 */
const RE_TABLE_SEP = /^:?-{2,}:?$/
/**
 * 围栏代码块的行（` ``` ` / ` ```ts ` / `~~~`）。
 *
 * 为什么单独判它：抽取出来的是**逐行**原文，一条代码围栏会**落单**（它的正文在别的行里，
 * 甚至被摘录预算切掉了）。留一个孤零零的 ` ``` ` 在页面上就是"又露出标记了"。
 * 剥掉它**不丢字**：围栏本身不是内容（它的正文另外成行渲染）。
 */
const RE_FENCE = /^\s*(?:`{3,}|~{3,})\s*[A-Za-z0-9_+-]*\s*$/

/* ────────────────────────────────────────────────────────────── 行内标记 */

/**
 * 行内标记 → 标签（输入**必须已经是转义过的**）。
 *
 * 顺序：先 `**粗**` 再 `` `code` ``。反过来的话，`` `**x**` `` 会先被包成 `<code>`，
 * 之后 `**` 仍会被替换——两处都会命中同一段文本，谁先谁后只影响"代码里的星号算不算粗体"，
 * 这里选"算"（代码片段里的星号多数是 Markdown 残留，显示成粗体比露出星号可读）。
 */
function inlineMarkup(s: string): string {
  return s
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
}

/**
 * 一行的渲染结果。
 *  - `block` = 该行被渲染成块级形态（自带换行）；
 *  - `dropped` = 该行是**纯标记**（如落单的代码围栏），不渲染任何内容，但它两边该断开
 *    （否则上一行会与下一行粘成一句）。
 */
interface LinePart { html: string; block: boolean; dropped?: boolean }

/**
 * 单行渲染。行首标记优先于行内标记（标题里也可能有 `**`，两者都要处理）。
 *
 * 为什么每一类都判"整行形状"而不是"包含即算"：正文里出现一个 `#` 或 `-` 是常事
 * （路径、命令、负数），把包含当标记会把正文改坏——而**改坏正文比露出标记严重得多**。
 */
function renderLine(line: string): LinePart {
  // 落单的代码围栏：整行只有反引号/波浪号（+ 语言标记）→ 它是排版标记，不渲染
  if (RE_FENCE.test(line)) return { block: false, dropped: true, html: '' }
  const heading = RE_HEADING.exec(line)
  if (heading !== null) {
    return { block: true, html: '<span class="dsh-pm-md-h">' + inlineMarkup(heading[2]) + '</span>' }
  }
  const quote = RE_QUOTE.exec(line)
  if (quote !== null) {
    return { block: true, html: '<span class="dsh-pm-md-quote">' + inlineMarkup(quote[2]) + '</span>' }
  }
  const row = RE_TABLE_ROW.exec(line)
  if (row !== null) {
    const cells = row[1].split('|').map(c => c.trim())
    // 分隔行（|---|:--:|）是排版标记：不渲染，也不留空行
    if (cells.length > 0 && cells.every(c => RE_TABLE_SEP.test(c))) return { block: true, html: '' }
    if (cells.length >= 2) {
      return {
        block: true,
        html: '<span class="dsh-pm-md-row">'
          + cells.map(c => '<span class="dsh-pm-md-cell">' + inlineMarkup(c) + '</span>').join('')
          + '</span>',
      }
    }
  }
  const ordered = RE_ORDERED.exec(line)
  if (ordered !== null) {
    // 序号照原文显示（**不改字**）：只把它挪到缩进外的悬挂位，样式上与正文分开
    return {
      block: true,
      html: '<span class="dsh-pm-md-oli"><span class="dsh-pm-md-num">' + ordered[2] + '.</span> '
        + inlineMarkup(ordered[3]) + '</span>',
    }
  }
  const bullet = RE_BULLET.exec(line)
  if (bullet !== null) {
    // `- ` 换成 `•`（CSS 伪元素出的字形），原文里的 `-` 标记不落到页面上
    return { block: true, html: '<span class="dsh-pm-md-li">' + inlineMarkup(bullet[2]) + '</span>' }
  }
  return { block: false, html: inlineMarkup(line) }
}

/* ────────────────────────────────────────────────────────────── 对外两个入口 */

/**
 * 已转义文本 → 显示层 HTML（**不再转义**，调用方负责先把不可信文本过 `esc()`）。
 *
 * 用途只有一个：对话面板的检索高亮——它的 `<mark>` 是插在**转义之后**的串里的，
 * 若在这里再转一次，`<mark>` 会变成 `&lt;mark&gt;`（高亮消失，页面上多出一堆标签字面量）。
 */
export function mdInlineEscaped(text: string): string {
  const lines = text.split('\n')
  const parts = lines.map(renderLine)
  let out = ''
  for (let i = 0; i < parts.length; i += 1) {
    out += parts[i].html
    // 只在**两个都是普通行**之间补 `<br>`：块级行自带换行，再补一个会多出一整行空白；
    // 被丢掉的那行（dropped）自己不再补——否则围栏前后会各补一个，多出一整行空白
    if (i < parts.length - 1 && !parts[i].block && !parts[i].dropped && !parts[i + 1].block) out += '<br>'
  }
  return out
}

/**
 * 任意文本 → 显示层 HTML（**先转义，再替换**；这是页面铺原文的默认入口）。
 *
 * 没有任何标记时输出与 `esc(text)` **逐字节相同**——这条性质被测试与既有断言依赖
 * （对话检索的高亮用例断言 `highlightDialogueText('<i>', '') === '&lt;i&gt;'`）。
 */
export function mdInline(text: unknown): string {
  return mdInlineEscaped(esc(text))
}

/** 我们**自己**插入的那几种标签（`mdPlain` 只剥这些；剥完剩下的字符就是"人看到的字"）。 */
const OWN_TAGS = /<\/?(?:b|code|mark)(?:\s[^>]*)?>|<span class="dsh-pm-md-[a-z]+">|<\/span>|<br\s*\/?>/g

/**
 * 任意文本 → **纯文本**（标记剥掉、标签去掉）：给 `title` / tooltip 用。
 *
 * 为什么不能直接把 `mdInline` 的产物塞进 `title`：属性里出现 `<b>` 会**原样显示**成尖括号字面量
 * （tooltip 不做 HTML 解析）。全文要给出去、又只能是文本时走这里。
 * 安全性：输入先过 `esc()`，`OWN_TAGS` 只会命中我们自己插入的标签——原文里的 `<img>` 早已是 `&lt;img&gt;`。
 */
export function mdPlain(text: unknown): string {
  return mdInlineEscaped(esc(text)).replace(OWN_TAGS, ' ').replace(/\s{2,}/g, ' ').trim()
}
