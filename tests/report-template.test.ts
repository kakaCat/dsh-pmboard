// serves: FR-13, FR-2, FR-14, FR-15
/**
 * 模板两节与抽取端别名（REQ-261004222448-292a · 任务卡 t-5d795a · 设计 test-cases.md 的 T-22）。
 *
 * 这份用例钉的是**一条容易静默失效的链**：模板里写了节 → 抽取端认得那个节名 → 页面才有内容。
 * 三处任何一处断掉都不会报错，只会让"实现思路 / 关键技术方案"永远少一半：
 *   ① `templates/design/*.md` 与 `templates/brainstorming/*.md` 必须含
 *      `## 关键决策与取舍` 与 `## 技术方案与亮点`（FR-13 写的两个节名；REQ-261005105032-3b02 t14 起
 *      允许节名带行尾 serves 装饰——线上设计门禁要求每个 H2 都带 serves，模板必须照它写得出合规文档）；
 *   ② **真实形状**的标题必须能被写死的节名命中——设计模板那一节的标题是
 *      ``## 目标与总体方案 `serves: FR-1` ``，而抽取端写死的节名是「架构」：
 *      靠的是 `TRUNK_SECTION_ALIASES` 的别名表。这条是防"有人把别名表删了"的机械钉子；
 *   ③ 反过来，**缺节标本仍须返回缺节**（别名表不许放宽成"包含 / 以节名结尾"，抽错节比抽不到更坏）。
 *
 * 为什么夹具直接读磁盘上的模板而不是抄一份：抄一份就再也测不到"模板被人改了标题"
 * ——而本用例存在的全部理由就是盯住模板与抽取端这一对。
 *
 * @module dsh-pmboard/tests/report-template
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import {
  TRUNK_SECTION_ALIASES,
  TRUNK_SECTION_NAMES,
  assembleTrunk,
  extractSection,
  findSection,
  matchesSectionName,
} from '../src/application/query/QueryTrunk.js'
import { renderTrunkPanel } from '../src/client/views/panels/trunk.js'
import type { TrunkResponse } from '../src/shared/protocol.js'

/** 卡上写死的两个节名（字面量与抽取端共用同一份；比对前剥 serves 装饰，节名本身仍逐字相等）。 */
const DECISION_HEADING = '关键决策与取舍'
const HIGHLIGHT_HEADING = '技术方案与亮点'

const DESIGN_DIR_URL = new URL('../templates/design/', import.meta.url)
const BRAINSTORMING_DIR_URL = new URL('../templates/brainstorming/', import.meta.url)

const tmpl = (dirUrl: URL, name: string): string => readFileSync(new URL(name, dirUrl), 'utf8')

/**
 * 模板里所有二级标题的**节名**（剥掉行尾 serves 装饰后再比）。
 *
 * 为什么不再逐字节比整行（REQ-261005105032-3b02 t14 / FR-10）：模板的职责是「照它写出来的文档
 * 能过线上门禁」，而线上设计门禁要求**每个 H2 及以上章节都带 serves**——8 份 `templates/design/*.md`
 * 因此都补上了 serves 尾巴（模板与门禁口径分叉正是 D-5 家族，本需求要消灭的就是它）。
 * 断言的**意图不变**：仍然断言「关键决策与取舍」「技术方案与亮点」这两个 H2 真在模板里，
 * 只是允许它带 serves 装饰。
 */
function h2Headings(md: string): string[] {
  return md.split(/\r?\n/).filter(l => l.startsWith('## ')).map(l => stripServesDecoration(l.slice(3)))
}

/** 剥掉行尾 serves 装饰（仓里既有的三种写法：HTML 注释 / 反引号 / 括号）。 */
function stripServesDecoration(raw: string): string {
  return raw
    .replace(/(?:\s*<!--[\s\S]*?-->)+$/g, '')
    .replace(/\s*`\s*serves\s*[:：][^`]*`\s*$/i, '')
    .replace(/\s*[（(]\s*serves\s*[:：][^）)]*[）)]\s*$/i, '')
    .trim()
}

const mdFiles = (dirUrl: URL): string[] => readdirSync(dirUrl).filter(n => n.endsWith('.md')).sort()

const ARCH_TEMPLATE = tmpl(DESIGN_DIR_URL, 'architecture.md')
const FEATURE_TEMPLATE = tmpl(BRAINSTORMING_DIR_URL, 'feature.md')

const countOf = (hay: string, needle: string): number => hay.split(needle).length - 1

/* ══════════════════════════════════════════════ T-22 两节在模板里 */

describe('T-22 · 模板两节（FR-13）', () => {
  it('T-22 · design/*.md 与 brainstorming/*.md 都含「关键决策与取舍」「技术方案与亮点」两个 H2（允许行尾 serves 装饰）', () => {
    const designFiles = mdFiles(DESIGN_DIR_URL)
    const brainstormingFiles = mdFiles(BRAINSTORMING_DIR_URL)
    // 防空断言：两个目录都得有模板可比（目录改名 / 清空时这条要红，而不是跳过）
    expect(designFiles.length).toBeGreaterThanOrEqual(6)
    expect(brainstormingFiles.length).toBeGreaterThanOrEqual(6)

    for (const [dirUrl, names] of [[DESIGN_DIR_URL, designFiles], [BRAINSTORMING_DIR_URL, brainstormingFiles]] as const) {
      for (const name of names) {
        const heads = h2Headings(tmpl(dirUrl, name))
        expect(heads, name + ' 缺「' + DECISION_HEADING + '」节').toContain(DECISION_HEADING)
        expect(heads, name + ' 缺「' + HIGHLIGHT_HEADING + '」节').toContain(HIGHLIGHT_HEADING)
      }
    }
  })

  it('T-22 · 两节是模板里**真在的节**（不是混在正文里的字样）：抽取端能抽到非空正文', () => {
    for (const name of mdFiles(DESIGN_DIR_URL)) {
      const md = tmpl(DESIGN_DIR_URL, name)
      const decision = extractSection(md, DECISION_HEADING)
      const highlight = extractSection(md, HIGHLIGHT_HEADING)
      expect(decision, name + ' 的「关键决策与取舍」抽不到（只有字样、没有节）').toBeDefined()
      expect(highlight, name + ' 的「技术方案与亮点」抽不到（只有字样、没有节）').toBeDefined()
      expect((decision ?? '').trim().length, name + ' 的该节是空的（模板没给填写指引）').toBeGreaterThan(0)
      expect((highlight ?? '').trim().length, name + ' 的该节是空的（模板没给填写指引）').toBeGreaterThan(0)
    }
  })

  it('T-22 · 需求模板的「技术方案与亮点」写清「设计模式写不出就写未使用」（不硬凑的口径在模板里）', () => {
    const section = extractSection(ARCH_TEMPLATE, HIGHLIGHT_HEADING) ?? ''
    expect(section).toContain('设计模式')
    expect(section).toContain('未使用')
    expect(section).toContain('可核验')
  })
})

/* ══════════════════════════════════════════════ 真实标题形状 → 写死节名（别名表） */

describe('T-22 · 抽取端必须命中「模板真实形状」的标题（别名表钉子）', () => {
  it('T-22 · 别名表在：写死节名「架构」≡「目标与总体方案」（删了别名表这条就红）', () => {
    expect(TRUNK_SECTION_NAMES.architecture).toBe('架构')
    expect(TRUNK_SECTION_ALIASES['架构'], '别名表被删/被改：设计模板里没有叫「架构」的二级标题').toContain('目标与总体方案')
  })

  it('T-22 · 真实模板标题带 serves 装饰（整行严格相等永远匹配不上，所以要剥装饰）', () => {
    // 模板真实形状：`## 目标与总体方案 \`serves: FR-1\``
    expect(ARCH_TEMPLATE).toContain('## 目标与总体方案 `serves: FR-1`')
    expect(ARCH_TEMPLATE).not.toContain('## 架构') // 模板里根本没有「架构」这个二级标题

    const hit = findSection(ARCH_TEMPLATE, TRUNK_SECTION_NAMES.architecture)
    expect(hit, '抽取端认不出设计模板的真实标题').toBeDefined()
    expect(hit?.rawTitle).toBe('目标与总体方案 `serves: FR-1`') // 命中的是那一行原文（可人工核对）
    expect(hit?.title).toBe('目标与总体方案') // 剥掉 serves 装饰后的节名
    expect(hit?.level).toBe(2)
    expect((hit?.text ?? '').trim().length).toBeGreaterThan(0)
    // 抽到的正文必须逐字来自模板（不是拼出来的）
    expect(ARCH_TEMPLATE).toContain((hit?.text ?? '').split('\n')[0])
  })

  it('T-22 · 判据不许放宽：H1 与「模块改动地图」都不算「架构」（抽错节比抽不到更坏）', () => {
    // 文档标题 `# 架构设计（REQ-x）` 以「架构」开头——H1 只认全等，不许被当成一节抽走
    expect(matchesSectionName('架构设计（REQ-x）', '架构', 1)).toBe(false)
    expect(matchesSectionName('架构', '架构', 1)).toBe(true)
    // 「模块改动地图」既不是别名也不以节名开头 → 不命中
    expect(matchesSectionName('模块改动地图 `serves: FR-1`', '架构')).toBe(false)
    // 真实模板的 H1 不是命中点：findSection 落到的是那个 H2
    const hit = findSection(ARCH_TEMPLATE, TRUNK_SECTION_NAMES.architecture)
    expect(hit?.rawTitle.startsWith('目标与总体方案')).toBe(true)
  })
})

/* ══════════════════════════════════════════════ 真模板走完整链 + 缺节标本 */

/** 用**磁盘上的真模板**当文档喂抽取（设计模板 + 需求模板的真实形状）。 */
function assembleFromTemplates(): TrunkResponse {
  return assembleTrunk({
    requirementId: 'REQ-261004222448-292a',
    docs: {
      requirementPath: 'docs/requirements/REQ-tmpl/requirement.md',
      requirementText: FEATURE_TEMPLATE,
      designDir: 'docs/requirements/REQ-tmpl/design',
      designDocs: [{ path: 'docs/requirements/REQ-tmpl/design/architecture.md', text: ARCH_TEMPLATE }],
    },
    ledger: { comments: [], tasks: [] },
  })
}

describe('T-22 · 真实模板 → 抽取 → 渲染（两节的内容真的到得了页面）', () => {
  it('T-22 · 真模板走完整链：FR-13 两节与别名节都不是缺节，摘要逐字来自模板', () => {
    const resp = assembleFromTemplates()
    const byKey = new Map(resp.items.map(i => [i.key, i]))
    const allTemplateText = FEATURE_TEMPLATE + '\n' + ARCH_TEMPLATE

    // 别名节（approach ← 「目标与总体方案」）与 FR-13 两节都必须有内容：
    // 少了任何一条，页面就会显示「文档未提供该节」——这正是被别名表/模板改动打出的红。
    for (const key of ['approach', 'decision', 'tech', 'highlight'] as const) {
      const item = byKey.get(key)
      expect(item?.missing, key + ' 被判成缺节（模板真实标题没被认出来？）').toBeUndefined()
      expect(item?.summary.length, key + ' 没有摘要').toBeGreaterThan(0)
      for (const line of item?.summary ?? []) {
        expect(allTemplateText, key + ' 的摘要不是模板原文：' + line).toContain(line)
      }
    }

    const html = renderTrunkPanel(resp)
    for (const key of ['approach', 'decision', 'tech'] as const) {
      const start = html.indexOf('data-trunk-item="' + key + '"')
      const block = html.slice(start, html.indexOf('</section>', start))
      expect(block).not.toContain('文档未提供该节')
      expect(countOf(block, 'data-summary-line="1"')).toBeGreaterThan(0)
    }
    // 两个来源标都在（模板来源 + 本节新增），人一眼看出这条内容新在哪
    expect(html).toContain('data-source="new-section"')
  })

  it('T-22 · 未填写的模板正文不算证据：无证据的条目一律进 data-evid="no"（机械关系）', () => {
    const resp = assembleFromTemplates()
    const highlights = resp.items.find(i => i.key === 'highlight')?.highlights ?? []
    const noEvidence = highlights.filter(h => h.evidence.length === 0)
    const html = renderTrunkPanel(resp)
    expect(countOf(html, 'data-evid="no"')).toBe(noEvidence.length)
    // 有证据的那几条才允许出现在正常亮点容器里
    const withList = html.slice(html.indexOf('data-hl-list="with-evidence"'), html.indexOf('data-hl-group="no-evidence"'))
    expect(countOf(withList, 'data-hl="with-evidence"')).toBe(highlights.length - noEvidence.length)
  })

  it('T-22 · 缺节标本仍返回缺节：模板被换掉五个写死节名时，页面照实说「文档未提供该节」', () => {
    const resp = assembleTrunk({
      requirementId: 'REQ-261004222448-292a',
      docs: {
        requirementPath: 'docs/requirements/REQ-tmpl/requirement.md',
        requirementText: ['# 缺节样例', '', '## TL;DR', '', '一句话。', ''].join('\n'),
        designDir: 'docs/requirements/REQ-tmpl/design',
        designDocs: [{ path: 'docs/requirements/REQ-tmpl/design/architecture.md', text: ['# 设计', '', '## 模块改动地图', '', '正文', ''].join('\n') }],
      },
      ledger: { comments: [], tasks: [] },
    })
    for (const item of resp.items) {
      expect(item.missing, item.key + '：文档没有该节却判成有内容').toBe('doc-section-missing')
      expect(item.summary).toEqual([])
    }
    const html = renderTrunkPanel(resp)
    expect(countOf(html, '文档未提供该节')).toBe(7)
    expect(countOf(html, 'data-summary-line="1"')).toBe(0)
  })
})
