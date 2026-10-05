/**
 * 知识层领域模型测试（REQ-261001110934-3766 t1 / design/data-model.md）。
 *
 * 锁四件事：
 *  ① 索引行语法**唯一口径**：合法行 parse→render 往返相等；非法行**抛错并带行号**；
 *  ② 预算**结构化溢出**：8,001 字符 / 201 行必须返回 KbOverflow，绝不静默裁剪；
 *  ③ id 两式与锚点：`kb-0007` / `kb-conventions-c-01` 认，`kb-x` / `kb-7` 判非法；
 *     写入端与读取端用同一 slug 函数（防「索引指 #c-1、页面叫 #c-01」这类静默失效）；
 *  ④ 条目文档：扁平标量头往返相等；嵌套/未知字段/缺必填一律抛错（响亮失败）。
 *
 * @module dsh-pmboard/tests/kb-domain
 */
import { describe, it, expect } from 'vitest'
import {
  KB_INDEX_LINE_RE,
  isEntryId,
  isKnownId,
  isSectionId,
  parseIndexDoc,
  parseIndexLine,
  renderIndexLine,
  sectionId,
  splitSectionId,
} from '../src/domain/knowledge/index-line.js'
import {
  KB_LIMITS,
  checkIndexBudget,
  checkIndexChars,
  checkIndexLines,
  checkPageBudget,
  countLines,
  describeOverflow,
} from '../src/domain/knowledge/budget.js'
import { headingAnchor, listHeadingAnchors, sliceSection, slugify, uniqueSlug } from '../src/domain/knowledge/slug.js'
import {
  addDays,
  defaultExpires,
  isExpired,
  isIsoDate,
  parseEntryDoc,
  renderEntryDoc,
  validateEntryDoc,
} from '../src/domain/knowledge/entry.js'
import type { KbEntryMeta } from '../src/domain/knowledge/types.js'

const OK_LINE = '- kb-0007 · decision · 知识层不做向量检索 · → entries/kb-0007.md'

describe('索引行语法', () => {
  it('合法行 parse → render 往返相等', () => {
    const row = parseIndexLine(OK_LINE, 12)
    expect(row).toEqual({
      id: 'kb-0007',
      kind: 'decision',
      oneLiner: '知识层不做向量检索',
      pointer: 'entries/kb-0007.md',
    })
    expect(renderIndexLine(row)).toBe(OK_LINE)
  })

  it('页面小节行同样往返（锚点式指针）', () => {
    const line = '- kb-conventions-c-01 · standard · 层边界只许向内 · → conventions.md#c-01'
    expect(renderIndexLine(parseIndexLine(line, 3))).toBe(line)
  })

  it('缺 `→` 的非法行：抛错且**带行号**', () => {
    expect(() => parseIndexLine('- kb-0007 · decision · 少了箭头 · entries/kb-0007.md', 42)).toThrowError(/第 42 行/)
  })

  it('one_liner 含 `·` 的行：语法不匹配 → 抛错', () => {
    expect(() => parseIndexLine('- kb-0007 · decision · 含·分隔符 · → entries/kb-0007.md', 7)).toThrowError(/第 7 行/)
  })

  it('整行超 200 字符：抛错并报实际长度（不截断）', () => {
    const long = '- kb-0007 · decision · ' + 'x'.repeat(200) + ' · → entries/kb-0007.md'
    expect(long.length).toBeGreaterThan(KB_LIMITS.indexLineMax)
    expect(() => parseIndexLine(long, 9)).toThrowError(new RegExp('第 9 行'))
  })

  it('长相像 id 但不属于任何存储（kb-a-b）：解析处即拒绝，并带行号', () => {
    expect(() => parseIndexLine('- kb-a-b · decision · 伪 id · → entries/kb-a-b.md', 5)).toThrowError(/不属于任何存储/)
  })

  it('renderIndexLine 拒绝非法 kind / 空指针', () => {
    expect(() => renderIndexLine({ id: 'kb-0007', kind: 'nope' as never, oneLiner: 'x', pointer: 'p' })).toThrowError()
    expect(() => renderIndexLine({ id: 'kb-0007', kind: 'decision', oneLiner: 'x', pointer: ' ' })).toThrowError()
  })
})

describe('id 形态与存储映射', () => {
  it('两式认、两式拒', () => {
    expect(isEntryId('kb-0007')).toBe(true)
    expect(isEntryId('kb-7')).toBe(false)
    expect(isSectionId('kb-conventions-c-01')).toBe(true)
    expect(isSectionId('kb-x')).toBe(false)
    expect(isKnownId('kb-code-map-src-domain')).toBe(true)
    expect(isKnownId('kb-nope-abc')).toBe(false)
  })

  it('小节 id ↔ 页面 + 锚点（写入端与校验端同源）', () => {
    expect(splitSectionId('kb-conventions-c-01')).toEqual({ page: 'conventions', anchor: 'c-01' })
    expect(splitSectionId('kb-code-map-src-domain')).toEqual({ page: 'code-map', anchor: 'src-domain' })
    expect(sectionId('tokens', 'colors')).toBe('kb-tokens-colors')
    expect(splitSectionId('kb-0007')).toBeUndefined()
  })
})

describe('预算：结构化溢出而非静默裁剪', () => {
  it('8,000 字符过、8,001 字符溢出', () => {
    expect(checkIndexChars('x'.repeat(KB_LIMITS.indexMaxChars))).toBeUndefined()
    const over = checkIndexChars('x'.repeat(KB_LIMITS.indexMaxChars + 1))
    expect(over).toEqual({ reason: 'index-chars', actual: 8_001, limit: 8_000, unit: 'chars' })
    expect(describeOverflow(over!)).toContain('8001')
  })

  it('200 行过、201 行溢出（末尾换行不算多一行）', () => {
    const lines200 = Array.from({ length: 200 }, () => 'l').join('\n')
    expect(countLines(lines200)).toBe(200)
    expect(checkIndexLines(lines200)).toBeUndefined()
    const lines201 = lines200 + '\nl'
    expect(checkIndexLines(lines201)).toEqual({ reason: 'index-lines', actual: 201, limit: 200, unit: 'lines' })
  })

  it('同时超字符与超行：两条溢出都报', () => {
    const text = Array.from({ length: 201 }, () => 'x'.repeat(50)).join('\n')
    const overflows = checkIndexBudget(text)
    expect(overflows.map((o) => o.reason).sort()).toEqual(['index-chars', 'index-lines'])
  })

  it('页面预算只管行数', () => {
    expect(checkPageBudget('a\nb')).toBeUndefined()
    expect(checkPageBudget(Array.from({ length: 201 }, () => 'l').join('\n'))?.reason).toBe('page-lines')
  })
})

describe('整档解析：问题一次报全（带行号）', () => {
  const HEAD = ['# 索引', '## 架构', '## 规范', '## 前端令牌', '## 决策', '## 坑', '## 契约', '## 术语', '## 代码地图', '## 待写']
  /** 按分节造文档（行必须落在 `## 节` 之下——否则会掉进「待写」自由文本区，不再按索引行校验）。 */
  const doc = (bySection: Record<string, string[]>): string => {
    const lines = ['# 索引']
    for (const s of HEAD.slice(1)) {
      lines.push(s)
      for (const r of bySection[s.replace('## ', '')] ?? []) lines.push(r)
    }
    return lines.join('\n')
  }

  it('干净文档：零问题', () => {
    const r = parseIndexDoc(doc({ 决策: [OK_LINE] }))
    expect(r.issues).toEqual([])
    expect(r.rows).toHaveLength(1)
  })

  it('重复 id / 语法非法 / 未知分节 / 顺序错乱 / 缺分节 / 节与 kind 不匹配：各自报码', () => {
    const bad = [
      '# 索引',
      '## 决策',
      OK_LINE,
      '- kb-0007 · pitfall · 重复 id 的第二行 · → entries/kb-0007.md',
      '- kb-0008 decision 缺分隔符 · → entries/kb-0008.md',
      '## 架构',
      '## 不存在节',
      '## 规范',
      '- kb-0009 · contract · 放错节的契约 · → entries/kb-0009.md',
    ].join('\n')
    const codes = parseIndexDoc(bad).issues.map((i) => i.code)
    expect(codes).toContain('dup-id')
    expect(codes).toContain('line-syntax')
    expect(codes).toContain('section-order')
    expect(codes).toContain('section-unknown')
    expect(codes).toContain('kind-section-mismatch')
    expect(codes).toContain('section-missing')
    expect(parseIndexDoc(bad).issues.find((i) => i.code === 'line-syntax')?.line).toBe(5)
  })

  it('「待写」节是自由文本：`- 缺口` 不算非法行；其余分节的非法行仍报错', () => {
    const withPending = doc({ 待写: ['- 《需求流水线》：六阶段状态机与五道人工门'] })
    expect(parseIndexDoc(withPending).issues).toEqual([])
    const badInKindSection = doc({ 决策: ['- 缺少分隔符的行'] })
    expect(parseIndexDoc(badInKindSection).issues.map((i) => i.code)).toContain('line-syntax')
  })

  it('正则与解析器同源（防止有人改正则不改解析）', () => {
    expect(KB_INDEX_LINE_RE.test(OK_LINE)).toBe(true)
    expect(KB_INDEX_LINE_RE.test('- kb-0007 decision x → y')).toBe(false)
  })
})

describe('锚点与切节', () => {
  it('显式 #anchor、ASCII 首词、中文标题三种回落', () => {
    expect(headingAnchor('## 颜色 #colors')).toBe('colors')
    expect(headingAnchor('### C-01 层边界只许向内')).toBe('c-01')
    expect(headingAnchor('## 前端令牌')).toBe('前端令牌')
    expect(slugify('C-01')).toBe('c-01')
  })

  it('重名标题：uniqueSlug 产出 -2/-3', () => {
    expect(uniqueSlug('colors', [])).toBe('colors')
    expect(uniqueSlug('colors', ['colors'])).toBe('colors-2')
    expect(uniqueSlug('colors', ['colors', 'colors-2'])).toBe('colors-3')
  })

  it('切节只取该节、不吞兄弟节；找不到返回 undefined（不假装成功）', () => {
    const md = [
      '# 页',
      '## 颜色 #colors',
      '- #ffffff',
      '',
      '## 变量 #vars',
      '- --x: 1',
      '### 变量子节',
      '- 更深',
      '## 断点 #breakpoints',
      '- 1180px',
    ].join('\n')
    const colors = sliceSection(md, 'colors')
    expect(colors).toContain('#ffffff')
    expect(colors).not.toContain('--x')
    const vars = sliceSection(md, 'vars')
    expect(vars).toContain('--x: 1')
    expect(vars).toContain('更深')
    expect(vars).not.toContain('1180px')
    expect(sliceSection(md, 'nope')).toBeUndefined()
  })

  it('代码围栏里的 # 不算标题', () => {
    const md = ['## 真标题 #real', '```', '# 注释不是标题', '```'].join('\n')
    expect(listHeadingAnchors(md).map((h) => h.anchor)).toEqual(['real'])
  })
})

describe('条目文档：扁平标量头', () => {
  const meta: KbEntryMeta = {
    id: 'kb-0007',
    kind: 'decision',
    status: 'active',
    title: '知识层不做向量检索',
    oneLiner: '20 万 token 以下整装更便宜',
    appliesWhen: '有人提议引入 embedding/向量库/RAG 时',
    pointer: 'docs/requirements/REQ-261001110934-3766/requirement.md#边界',
    supersedes: 'kb-0003',
    updated: '2026-10-01',
    expires: '2027-03-30',
    req: 'REQ-261001110934-3766',
  }
  const body = ['## 结论', '不做。', '', '## 适用条件', '引入向量检索前', '', '## 证据', '见 requirement.md', '', '## 失效条件', '知识层超过 20 万 token', '', '## 相关', 'kb-0004'].join('\n')

  it('render → parse 往返相等（含需要引号的字段）', () => {
    const text = renderEntryDoc(meta, body)
    const parsed = parseEntryDoc(text)
    expect(parsed.meta).toEqual(meta)
    expect(parsed.body).toBe(body)
  })

  it('含 `: ` 与 `#` 的值：渲染时加引号、解析后还原', () => {
    const tricky: KbEntryMeta = { ...meta, appliesWhen: '校验：npx vitest run tests/x.test.ts # 见说明' }
    const parsed = parseEntryDoc(renderEntryDoc(tricky, body))
    expect(parsed.meta.appliesWhen).toBe(tricky.appliesWhen)
  })

  it('缺必填 / 未知字段 / 嵌套结构 / 非法枚举 一律抛错', () => {
    const base = renderEntryDoc(meta, body)
    expect(() => parseEntryDoc(base.replace(/^status: .*$/m, ''))).toThrowError(/缺少必填字段：status/)
    expect(() => parseEntryDoc(base.replace('kind: decision', 'kind: decision\nnested:\n  a: 1'))).toThrowError(/不支持嵌套|字段未知/)
    expect(() => parseEntryDoc(base.replace('kind: decision', 'kind: nope'))).toThrowError(/kind 非法/)
    expect(() => parseEntryDoc(base.replace('id: kb-0007', 'id: kb-7'))).toThrowError(/kb-NNNN/)
    expect(() => parseEntryDoc(base.replace('updated: 2026-10-01', 'updated: 2026-13-01'))).toThrowError(/updated 非法/)
    expect(() => parseEntryDoc('没有头部的正文')).toThrowError(/front-matter/)
  })

  it('validateEntryDoc：过期标 stale、缺小节报文件级问题', () => {
    const issues = validateEntryDoc(renderEntryDoc({ ...meta, expires: '2026-01-01' }, '## 结论\n只有结论'), '2026-10-01')
    const codes = issues.map((i) => i.code)
    expect(codes).toContain('entry-stale')
    expect(codes).toContain('entry-body-section')
  })

  it('日期纯函数：addDays / defaultExpires / isExpired / isIsoDate（不读系统时间）', () => {
    expect(addDays('2026-10-01', 180)).toBe('2027-03-30')
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
    expect(defaultExpires('2026-10-01')).toBe('2027-03-30')
    expect(isExpired('2026-01-01', '2026-10-01')).toBe(true)
    expect(isExpired('2027-01-01', '2026-10-01')).toBe(false)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('2026-02-28')).toBe(true)
  })
})
