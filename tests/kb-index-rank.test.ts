/**
 * INDEX 降权排序测试（REQ-261006201841-944d t7 / FR-4）。
 *
 * 锁四件事：
 *  ① **降权**：同一分节内按 `(可判定 ? 0 : 1, id)` 排——可判定的条目行号更小、不可判定者沉底；
 *  ② **零字符增量**：排序只是行序变化，不新增字符、不重写任何一行（比对新旧行集合即可证明）；
 *  ③ **文法不变**：排序后每行仍匹配 `KB_INDEX_LINE_RE`、整档 `parseIndexDoc` 零 issues（K2 不因排序变红）；
 *  ④ **不越界**：只重排 `kb-NNNN` 条目行，页面小节行（`kb-conventions-*`）的人工顺序一字不动；
 *     读不到条目正文（文件缺失 / 无「## 失效条件」小节）→ 按**不可判定**处理（宁可沉底，不装可判定）。
 *
 * 判定口径与 K14 同源：`isDecidableInvalidation` + 只读条目正文的「## 失效条件」小节。
 * 断言走 `appendEntry`（真实写入路径）而不是内部排序函数：排序是写入路径的一步，
 * 公开边界（`upsertIndexRow`）的形状不变。
 *
 * @module dsh-pmboard/tests/kb-index-rank
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { KnowledgeRepository } from '../src/adapters/KnowledgeRepository.js'
import { KB_INDEX_LINE_RE, parseIndexDoc } from '../src/domain/knowledge/index-line.js'
import { KB_PATHS, entryPath } from '../src/domain/knowledge/types.js'
import type { KbEntryDraft } from '../src/application/ports.js'

const SECTIONS = ['架构', '规范', '前端令牌', '决策', '坑', '契约', '术语', '代码地图', '待写']

/** 索引骨架（固定九节；`rows` 按分节注入）。 */
function indexDoc(rows: Record<string, string[]>): string {
  const lines = ['# 项目知识索引', '', '> 一句话摘要', '']
  for (const s of SECTIONS) {
    lines.push('## ' + s, '')
    for (const r of rows[s] ?? []) lines.push(r)
    lines.push('')
  }
  return lines.join('\n')
}

/** 索引行（decision · 决策节）。 */
const indexRow = (id: string, oneLiner: string): string =>
  '- ' + id + ' · decision · ' + oneLiner + ' · → entries/' + id + '.md'

/** 条目文件正文（最小可用：front-matter + 五节；失效条件按入参写）。 */
function entryText(id: string, title: string, invalidation: string): string {
  return [
    '---',
    'id: ' + id,
    'kind: decision',
    'status: active',
    'title: ' + title,
    'one_liner: ' + title,
    'applies_when: 同类需求再次出现时',
    'pointer: docs/architecture/project-manual.md',
    'updated: 2026-10-06',
    'expires: 2027-04-04',
    '---',
    '',
    '## 结论',
    title,
    '',
    '## 适用条件',
    '同类需求再次出现时',
    '',
    '## 证据',
    '归档目录：docs/requirements/REQ-x',
    '',
    '## 失效条件',
    invalidation,
    '',
    '## 相关',
    'docs/architecture/project-manual.md',
  ].join('\n')
}

/** 写死的模板句（不可判定态）。 */
const TEMPLATE = '相关实现被重构、或该结论被新条目 supersede 时'
/** 含反引号锚点（可判定态）。 */
const ANCHORED = '`src/adapters/KnowledgeRepository.ts` 被改名或删除时'

/** 某索引行在文档里的行号（0-based；找不到 → -1）。 */
function lineOf(text: string, id: string): number {
  return text.split('\n').findIndex((l) => l.startsWith('- ' + id + ' ·'))
}

let root: string

function repo(): KnowledgeRepository {
  return new KnowledgeRepository(new FileDocRepository({ workspaceRoot: root }))
}

function writeIndex(rows: Record<string, string[]>): void {
  writeFileSync(join(root, KB_PATHS.index), indexDoc(rows), 'utf8')
}

function writeEntry(id: string, oneLiner: string, invalidation: string): void {
  writeFileSync(join(root, entryPath(id)), entryText(id, oneLiner, invalidation), 'utf8')
}

/** 索引（写入后）文本。 */
function indexText(): string {
  return readFileSync(join(root, KB_PATHS.index), 'utf8')
}

/** 沉淀一张 decision 卡（可判定 / 不可判定由 invalidation 决定）。 */
function draftOf(oneLiner: string, invalidation: string): KbEntryDraft {
  return {
    kind: 'decision',
    title: oneLiner,
    oneLiner,
    appliesWhen: '同类需求再次出现时',
    pointer: 'docs/architecture/project-manual.md',
    updated: '2026-10-06',
    body: ['## 结论', oneLiner, '', '## 失效条件', invalidation].join('\n'),
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kb-index-rank-'))
  mkdirSync(join(root, 'docs/knowledge/entries'), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('写入路径：appendEntry 后的 INDEX 降权排序', () => {
  it('① 可判定条目浮到最前，其余按 id 沉底（分节顺序即降权结果）', async () => {
    // 三条存量条目都没落文件 → 一律按不可判定处理
    writeIndex({ 决策: [indexRow('kb-0003', '丙结论'), indexRow('kb-0001', '甲结论'), indexRow('kb-0002', '乙结论')] })
    const res = await repo().appendEntry(draftOf('丁结论', ANCHORED))
    expect(res.id).toBe('kb-0004')
    const next = indexText()
    expect(lineOf(next, 'kb-0004')).toBeLessThan(lineOf(next, 'kb-0001'))
    expect(lineOf(next, 'kb-0001')).toBeLessThan(lineOf(next, 'kb-0002'))
    expect(lineOf(next, 'kb-0002')).toBeLessThan(lineOf(next, 'kb-0003'))
    // 整档 = 「可判定在前 + 其余按 id」的期望文档
    expect(next).toBe(indexDoc({
      决策: [
        indexRow('kb-0004', '丁结论'),
        indexRow('kb-0001', '甲结论'),
        indexRow('kb-0002', '乙结论'),
        indexRow('kb-0003', '丙结论'),
      ],
    }))
  })

  it('② 零字符增量：只换行、不改行内容（新旧行集合 = 旧集合 + 新行）', async () => {
    writeIndex({ 决策: [indexRow('kb-0001', '甲结论'), indexRow('kb-0002', '乙结论')] })
    writeEntry('kb-0001', '甲结论', TEMPLATE) // 不可判定
    writeEntry('kb-0002', '乙结论', ANCHORED) // 可判定
    const before = indexText()
    const res = await repo().appendEntry(draftOf('丁结论', ANCHORED))
    expect(res.id).toBe('kb-0003')
    const next = indexText()
    // 排序后：kb-0002 / kb-0003（可判定，按 id）→ kb-0001（不可判定沉底）
    expect(lineOf(next, 'kb-0002')).toBeLessThan(lineOf(next, 'kb-0003'))
    expect(lineOf(next, 'kb-0003')).toBeLessThan(lineOf(next, 'kb-0001'))
    // ② 只有一条新增行；其余行一条都没被改写（字符增量 = 那一行 + 换行）
    const newLine = indexRow('kb-0003', '丁结论')
    const beforeLines = before.split('\n')
    const afterLines = next.split('\n')
    expect([...afterLines].sort()).toEqual([...beforeLines, newLine].sort())
    expect(next.length).toBe(before.length + newLine.length + 1)
  })

  it('③ 文法不变：全部行仍匹配 KB_INDEX_LINE_RE，整档解析零 issues', async () => {
    writeIndex({ 决策: [indexRow('kb-0002', '乙结论'), indexRow('kb-0001', '甲结论')] })
    await repo().appendEntry(draftOf('丙结论', ANCHORED))
    const next = indexText()
    for (const line of next.split('\n').filter((l) => l.startsWith('- '))) {
      expect(KB_INDEX_LINE_RE.test(line), line).toBe(true)
    }
    expect(parseIndexDoc(next).issues).toEqual([])
  })

  it('④ 只重排 kb-NNNN 条目行：页面小节行（kb-conventions-*）顺序一字不动', async () => {
    const conventions = [
      '- kb-conventions-c01 · standard · 层边界只许向内 · → conventions.md#c-01',
      '- kb-conventions-c-11 · standard · 发版前必须构建 · → conventions.md#c-11',
    ]
    writeIndex({ 规范: conventions, 决策: [indexRow('kb-0001', '甲结论')] })
    const before = indexText()
    await repo().appendEntry(draftOf('乙结论', ANCHORED))
    const next = indexText()
    const sectionOf = (t: string): string => {
      const lines = t.split('\n')
      return lines.slice(lines.indexOf('## 规范'), lines.indexOf('## 前端令牌')).join('\n')
    }
    expect(sectionOf(next)).toBe(sectionOf(before))
    expect(sectionOf(next).indexOf('kb-conventions-c01')).toBeLessThan(sectionOf(next).indexOf('kb-conventions-c-11'))
  })

  it('④ 条目文件读不到（无正文可判）→ 按不可判定沉底，不装可判定', async () => {
    // kb-0001 有索引行但**没有条目文件**（坏索引的极端情形）
    writeIndex({ 决策: [indexRow('kb-0001', '甲结论')] })
    const res = await repo().appendEntry(draftOf('新结论', ANCHORED))
    expect(res.id).toBe('kb-0002')
    const next = indexText()
    expect(lineOf(next, 'kb-0002')).toBeLessThan(lineOf(next, 'kb-0001'))
  })

  it('存量可判定条目留在前、新来的不可判定条目沉底（不会把好的挤下去）', async () => {
    writeIndex({ 决策: [indexRow('kb-0001', '甲结论')] })
    writeEntry('kb-0001', '甲结论', ANCHORED)
    const res = await repo().appendEntry(draftOf('模板句结论', TEMPLATE))
    expect(res.id).toBe('kb-0002')
    const next = indexText()
    expect(lineOf(next, 'kb-0001')).toBeLessThan(lineOf(next, 'kb-0002'))
  })
})
