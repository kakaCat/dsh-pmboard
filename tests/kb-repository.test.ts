/**
 * 知识层文件适配器测试（REQ-261001110934-3766 t2）。
 *
 * 锁四件事（对应 t2 验收）：
 *  ① `kb-<页面>-<锚点>` 取**该小节**（不吞兄弟节）；`kb-NNNN` 取**整文件**；缺失 → undefined（不抛）；
 *  ② `appendEntry` **幂等**：同源（req + kind）重复提交 → 条目覆盖、索引行不重复；
 *  ③ 新条目落到**正确分节**，且不侵入生成区（`kb:generated` 标记）；
 *  ④ 索引不存在 / 追加 map 类 → **响亮失败**并给修复指引。
 *
 * @module dsh-pmboard/tests/kb-repository
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { KnowledgeRepository, upsertIndexRow } from '../src/adapters/KnowledgeRepository.js'
import { KB_PATHS, KB_PAGE_PATHS, entryPath } from '../src/domain/knowledge/types.js'

const SECTIONS = ['架构', '规范', '前端令牌', '决策', '坑', '契约', '术语', '代码地图', '待写']

function indexDoc(rows: Record<string, string[]>): string {
  const lines = ['# 项目知识索引', '', '> 一句话摘要', '']
  for (const s of SECTIONS) {
    lines.push('## ' + s, '')
    if (s === '代码地图') lines.push(KB_PATHS.generatedBegin)
    for (const r of rows[s] ?? []) lines.push(r)
    if (s === '代码地图') lines.push(KB_PATHS.generatedEnd)
    lines.push('')
  }
  return lines.join('\n')
}

const ENTRY_1 = [
  '---',
  'id: kb-0001',
  'kind: decision',
  'status: active',
  'title: 知识层不做向量检索',
  'one_liner: 20 万 token 以下整装更便宜',
  'applies_when: 有人提议引入向量库时',
  'pointer: docs/requirements/REQ-261001110934-3766/requirement.md#边界',
  'updated: 2026-10-01',
  'expires: 2027-03-30',
  'req: REQ-261001110934-3766',
  '---',
  '',
  '## 结论',
  '不做。',
].join('\n')

const CONVENTIONS = [
  '# 规范',
  '',
  '### C-01 层边界只许向内 #c-01',
  '- 一句话：domain 不得 import 外层。',
  '- 校验：`npx vitest run tests/layer-boundary.test.ts`',
  '',
  '### C-02 单文件不超过 400 行 #c-02',
  '- 一句话：宿主单文件 ≤400 行。',
  '- 校验：`npx vitest run tests/layer-boundary.test.ts`',
].join('\n')

let root: string

function repo(): KnowledgeRepository {
  return new KnowledgeRepository(new FileDocRepository({ workspaceRoot: root }))
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kb-repo-'))
  mkdirSync(join(root, 'docs/knowledge/entries'), { recursive: true })
  writeFileSync(join(root, KB_PATHS.index), indexDoc({
    决策: ['- kb-0001 · decision · 20 万 token 以下整装更便宜 · → entries/kb-0001.md'],
    代码地图: ['- kb-code-map-src · map · 模块级地图 · → code-map.md'],
  }), 'utf8')
  writeFileSync(join(root, KB_PAGE_PATHS.conventions), CONVENTIONS, 'utf8')
  writeFileSync(join(root, entryPath('kb-0001')), ENTRY_1, 'utf8')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('读取：整文件 / 页面小节 / 缺失', () => {
  it('kb-NNNN 取整文件', async () => {
    const text = await repo().readEntry('kb-0001')
    expect(text).toContain('id: kb-0001')
    expect(text).toContain('## 结论')
  })

  it('kb-<页面>-<锚点> 只取该小节（不吞兄弟节）', async () => {
    const text = await repo().readEntry('kb-conventions-c-01')
    expect(text).toContain('C-01 层边界只许向内')
    expect(text).not.toContain('C-02')
  })

  it('未知 id / 锚点不存在 → undefined（不抛）', async () => {
    const r = repo()
    expect(await r.readEntry('kb-nope-x')).toBeUndefined()
    expect(await r.readEntry('kb-conventions-nope')).toBeUndefined()
    expect(await r.readEntry('kb-9999')).toBeUndefined()
  })

  it('readIndex / readEntries / listArtifacts 的读数', async () => {
    const r = repo()
    expect(await r.indexExists()).toBe(true)
    const idx = await r.readIndex()
    expect(idx.chars).toBeGreaterThan(0)
    expect(idx.overflows).toEqual([])
    const { rows, issues } = await r.readEntries()
    expect(issues).toEqual([])
    expect(rows.map((x) => x.id)).toEqual(['kb-0001', 'kb-code-map-src'])
    const roles = (await r.listArtifacts()).map((a) => a.role)
    expect(roles).toContain('index')
    expect(roles).toContain('page')
    expect(roles).toContain('entry')
  })

  it('索引不存在 → readIndex 返回空结果（注入侧据此保持老行为）', async () => {
    rmSync(join(root, KB_PATHS.index))
    const r = repo()
    expect(await r.indexExists()).toBe(false)
    expect(await r.readIndex()).toEqual({ text: '', chars: 0, lines: 0, overflows: [] })
    expect(await r.readEntries()).toEqual({ rows: [], issues: [] })
  })
})

describe('写入：幂等与分节落位', () => {
  const draft = {
    kind: 'pitfall' as const,
    title: '压缩式恢复会丢上下文',
    oneLiner: '回档包必须带原文指针',
    appliesWhen: '设计回档/续跑机制时',
    pointer: 'docs/requirements/REQ-261001110934-3766/design/use-cases.md#uc-5',
    updated: '2026-10-01',
    req: 'REQ-261001110934-3766',
    body: ['## 结论', '摘要不能是唯一副本。', '', '## 适用条件', '任何回档', '', '## 证据', 'codex resume issue', '', '## 失效条件', '原文可全量重放', '', '## 相关', 'kb-0007'].join('\n'),
  }

  it('首次追加：分配 kb-0002、落到「坑」节、条目文件可读回', async () => {
    const r = repo()
    const res = await r.appendEntry(draft)
    expect(res.id).toBe('kb-0002')
    const text = readFileSync(join(root, KB_PATHS.index), 'utf8')
    const pit = text.slice(text.indexOf('## 坑'), text.indexOf('## 契约'))
    expect(pit).toContain('- kb-0002 · pitfall · 回档包必须带原文指针 · → entries/kb-0002.md')
    expect(await r.readEntry('kb-0002')).toContain('压缩式恢复会丢上下文')
  })

  it('重复追加同源（req + kind）：复用 id、索引行不重复、条目被覆盖', async () => {
    const r = repo()
    const first = await r.appendEntry(draft)
    const second = await r.appendEntry({ ...draft, oneLiner: '回档包必须留原文指针', body: draft.body.replace('摘要不能是唯一副本。', '摘要不能是唯一副本（复核后定稿）。') })
    expect(second.id).toBe(first.id)
    const text = readFileSync(join(root, KB_PATHS.index), 'utf8')
    expect(text.split('\n').filter((l) => l.startsWith('- kb-0002 ·'))).toHaveLength(1)
    expect(await r.readEntry('kb-0002')).toContain('复核后定稿')
  })

  it('生成区边界：map 行只能落在 kb:generated:end 之后（不挤进机器区）', async () => {
    const text = readFileSync(join(root, KB_PATHS.index), 'utf8')
    const next = upsertIndexRow(text, { id: 'kb-code-map-new', kind: 'map', oneLiner: '新生成的模块地图', pointer: 'code-map.md#src-domain' })
    const genEnd = next.indexOf(KB_PATHS.generatedEnd)
    const row = next.indexOf('- kb-code-map-new · map · 新生成的模块地图')
    expect(genEnd).toBeGreaterThan(-1)
    expect(row).toBeGreaterThan(genEnd)
    // 手写行（非 map）落各自分节，且不改动机器区内容
    const withPit = upsertIndexRow(next, { id: 'kb-0002', kind: 'pitfall', oneLiner: '回档包必须带原文指针', pointer: 'entries/kb-0002.md' })
    expect(withPit).toContain('- kb-code-map-new · map · 新生成的模块地图')
  })

  it('map 类 / 索引缺失 → 响亮失败并给修复指引', async () => {
    const r = repo()
    await expect(r.appendEntry({ ...draft, kind: 'map' })).rejects.toThrowError(/生成器/)
    rmSync(join(root, KB_PATHS.index))
    await expect(r.appendEntry(draft)).rejects.toThrowError(/kb-build\.mts --write/)
  })

  // REQ-261006123819-3af3 FR-4 根因②：坏 one_liner 必须在**写条目文件之前**被拦下。
  // 修前顺序是「先落 entries/<id>.md、再算索引行」→ 索引那步抛错时条目文件已落盘，
  // 留下「条目在、索引没有」的孤儿（kb-0043/kb-0048 就是这么长出来的）。
  it('one_liner 非法 → 抛错，且**条目文件不落盘**（不再产生孤儿）', async () => {
    const r = repo()
    await expect(r.appendEntry({ ...draft, oneLiner: '含 → 或 · 的结论' })).rejects.toThrowError(/一句话结论非法/)
    expect(existsSync(join(root, entryPath('kb-0002')))).toBe(false)
    const text = readFileSync(join(root, KB_PATHS.index), 'utf8')
    expect(text).not.toContain('kb-0002')
  })

  it('one_liner 超 140 字符 → 同样在落盘前被拦下', async () => {
    const r = repo()
    await expect(r.appendEntry({ ...draft, oneLiner: '长'.repeat(141) })).rejects.toThrowError(/一句话结论非法/)
    expect(existsSync(join(root, entryPath('kb-0002')))).toBe(false)
  })
})

describe('upsertIndexRow 边界', () => {
  it('同 id 原位替换（不追加）', () => {
    const text = indexDoc({ 决策: ['- kb-0001 · decision · 旧结论 · → entries/kb-0001.md'] })
    const next = upsertIndexRow(text, { id: 'kb-0001', kind: 'decision', oneLiner: '新结论', pointer: 'entries/kb-0001.md' })
    expect(next.split('\n').filter((l) => l.startsWith('- kb-0001 ·'))).toHaveLength(1)
    expect(next).toContain('· 新结论 ·')
  })

  it('分节不存在 → 抛错并列出全部合法分节', () => {
    expect(() => upsertIndexRow('# 空文档', { id: 'kb-0001', kind: 'decision', oneLiner: 'x', pointer: 'p' }))
      .toThrowError(/缺少分节「决策」/)
  })
})
