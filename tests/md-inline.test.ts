/**
 * 行内 Markdown 转换用例（REQ-261004222448-292a · 2026-10-05 渲染变形修复①）。
 *
 * 这一层是**显示层**：页面铺的是文档 / 台账原文，标记不能露在页面上，但**字一个不许改**
 * （服务端契约要求摘要是原文子串）。所以用例钉两件事：
 *  ① 标记被换成了标签（`**x**`→`<b>`、`` `x` ``→`<code>`、行首标记→标题/引文/列表/表格行）；
 *  ② **先转义再替换**——原文里的 `<script>` 只能是字面量，不能变成标签（XSS 防线在这一层）。
 *
 * 另有一条"零改写"性质：没有标记时输出与 `esc()` **逐字节相同**——既有断言
 * 和"渲染不改写原文"的用例都靠它（对话检索的 highlightDialogueText 已随 t7 删除）。
 *
 * @module dsh-pmboard/tests/md-inline
 */
import { describe, expect, it } from 'vitest'
import { mdInline, mdInlineEscaped } from '../src/client/render/md-inline.ts'
import { esc } from '../src/client/html.ts'

const countOf = (hay: string, needle: string): number => hay.split(needle).length - 1

describe('md-inline · 行内标记', () => {
  it('`**x**` → `<b>x</b>`（线上真实那一句）', () => {
    const out = mdInline('**一句话**：需求详情页 = **工作汇报**。')
    expect(out).toBe('<b>一句话</b>：需求详情页 = <b>工作汇报</b>。')
    expect(out).not.toContain('**')
  })

  it('行内 code：`` `x` `` → `<code>x</code>`', () => {
    expect(mdInline('先读 `/state`，再 `GET /requirements/:id`')).toBe(
      '先读 <code>/state</code>，再 <code>GET /requirements/:id</code>',
    )
  })

  it('先转义再替换：原文里的标签只能是字面量（XSS 防线）', () => {
    const out = mdInline('**<script>alert(1)</script>**')
    expect(out).not.toContain('<script')
    expect(out).toContain('&lt;script&gt;')
    // 转义后的内容仍然被加粗（说明替换发生在转义之后，而不是把标签一起转义掉）
    expect(out).toBe('<b>&lt;script&gt;alert(1)&lt;/script&gt;</b>')
    // 单双引号 / & 同样被转义（属性注入面）
    expect(mdInline('**" onmouseover="x** & y')).toContain('&quot;')
    expect(mdInline('**" onmouseover="x** & y')).toContain('&amp;')
  })

  it('行内 code 里的标签同样只出字面量', () => {
    expect(mdInline('看 `<img src=x onerror=boom()>`')).toBe('看 <code>&lt;img src=x onerror=boom()&gt;</code>')
  })

  it('零改写：没有标记时与 esc() 逐字节相同（既有断言依赖）', () => {
    for (const t of ['普通一句话', '<i>', 'a & b', '引号 "x" 与 \'y\'', '**只有左半边']) {
      expect(mdInline(t), t).toBe(mdInlineEscaped(esc(t)))
    }
    expect(mdInline('<i>')).toBe('&lt;i&gt;')
  })
})

describe('md-inline · 行首标记', () => {
  it('标题：`#` / `##` 标记剥掉，内容成标题行', () => {
    expect(mdInline('# 验收（accepting）')).toBe('<span class="dsh-pm-md-h">验收（accepting）</span>')
    expect(mdInline('### 轻档')).not.toContain('#')
    // 行内标记与行首标记同时在场：两者都要处理
    expect(mdInline('## **要点**：x')).toBe('<span class="dsh-pm-md-h"><b>要点</b>：x</span>')
  })

  it('无序列表：`- ` / `* ` 变成列表行（页面上不出现裸的 `- `）', () => {
    const out = mdInline('- 第一项\n- 第二项\n* 第三项')
    expect(countOf(out, 'dsh-pm-md-li')).toBe(3)
    expect(out).toContain('第一项')
    expect(out).toContain('第三项')
    expect(out).not.toContain('- 第一项')
    expect(out).not.toContain('* 第三项')
  })

  it('有序列表：序号照原文留字，只挪到悬挂位', () => {
    const out = mdInline('1. **不做成"一份报告"**：不加封面\n2. **不做测评证据展示**')
    expect(countOf(out, 'dsh-pm-md-oli')).toBe(2)
    expect(countOf(out, 'dsh-pm-md-num')).toBe(2)
    expect(out).toContain('<span class="dsh-pm-md-num">1.</span>')
    expect(out).toContain('<b>不做成&quot;一份报告&quot;</b>')
  })

  it('引文：`> ` 剥掉，成引文行', () => {
    const out = mdInline('> 本节于实施期回填（2026-10-05）')
    expect(out).toBe('<span class="dsh-pm-md-quote">本节于实施期回填（2026-10-05）</span>')
  })

  it('表格行：整行被 `|` 夹住才当表格；`cmd | grep x` 不动', () => {
    const out = mdInline('| 取舍点 | 否掉了什么 | 为什么 |')
    expect(countOf(out, 'dsh-pm-md-cell')).toBe(3)
    expect(out).toContain('取舍点')
    expect(out).not.toContain('|')
    // 不是"包含管道符就算"：命令行里的管道符照原样（判据是**整行**首尾都是 |）
    expect(mdInline('命令 pnpm test | grep 绿')).toBe('命令 pnpm test | grep 绿')
  })

  it('落单的代码围栏（``` / ```ts）不渲染（它不是内容，正文另外成行）', () => {
    expect(mdInline('```')).toBe('')
    expect(mdInline('```ts')).toBe('')
    expect(mdInline('~~~')).toBe('')
    // 围栏两边该断开（否则上一行会与下一行粘成一句），但只补一个 <br>
    expect(mdInline('改成三层：\n```\n契约在 interfaces.md')).toBe('改成三层：<br>契约在 interfaces.md')
    expect(mdInline('```\n普通行')).toBe('普通行')
  })

  it('表格分隔行（|---|---|）不渲染成内容', () => {
    const out = mdInline('| 列 | 列 |\n|---|---|\n| a | b |')
    expect(out).not.toContain('---')
    expect(countOf(out, 'dsh-pm-md-row')).toBe(2)
  })
})

describe('md-inline · 多行与边界', () => {
  it('普通多行：行与行之间补 `<br>`（不把多行挤成一行）', () => {
    expect(mdInline('第一行\n第二行')).toBe('第一行<br>第二行')
  })

  it('块级行自带换行，不在它旁边再补 `<br>`（否则多出一整行空白）', () => {
    const out = mdInline('- 甲\n普通行')
    expect(out).not.toContain('<br>')
    const out2 = mdInline('普通行\n- 甲')
    expect(out2).not.toContain('<br>')
  })

  it('空串 / undefined / 数字：不抛，且不产出多余标签', () => {
    expect(mdInline('')).toBe('')
    expect(mdInline(undefined)).toBe('')
    expect(mdInline(12)).toBe('12')
  })

  it('未闭合的标记不硬凑（宁可留字面量，也不猜）', () => {
    expect(mdInline('**没闭合')).toBe('**没闭合')
    expect(mdInline('`没闭合')).toBe('`没闭合')
  })

  it('mdInlineEscaped 不再转义（对话检索的 `<mark>` 必须活着）', () => {
    const marked = '<mark class="dsh-pm-dialogue-hit" data-dialogue-hit="1">入</mark>'
    expect(mdInlineEscaped(marked + ' **粗**')).toBe(marked + ' <b>粗</b>')
  })
})
