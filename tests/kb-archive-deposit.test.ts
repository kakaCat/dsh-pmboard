/**
 * 归档即沉淀测试（REQ-261001110934-3766 t7）。
 *
 * 锁四件事（对应 t7 验收）：
 *  ① 归档提交后：索引对应分节 +1 行、`entries/kb-NNNN.md` 生成、front-matter 字段齐全；
 *  ② **幂等**：同源（req + kind）重复提交 → 复用 id、索引行不重复（条目内容更新）；
 *  ③ **响亮**：`index_entry` 为空 → 沿用既有拒绝，且 `docs/knowledge/` 零变化；
 *  ④ 未装配知识层 / 索引不存在 → **不阻断归档**（老部署行为不变），原因如实写进归档评论。
 *
 * @module dsh-pmboard/tests/kb-archive-deposit
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KnowledgeRepository } from '../src/adapters/KnowledgeRepository.js'
import { defineSubmitTool } from '../src/tools/index.js'
import { toUseCaseDeps } from './helpers/tool-deps.js'
import { KB_PATHS, entryPath } from '../src/domain/knowledge/types.js'
import { parseEntryDoc } from '../src/domain/knowledge/entry.js'
import { buildDepositDraft, depositArchiveKnowledge } from '../src/application/use-cases/DepositKnowledge.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const W = 'session-kb-001'
const SECTIONS = ['架构', '规范', '前端令牌', '决策', '坑', '契约', '术语', '代码地图', '待写']

function indexSkeleton(): string {
  const lines = ['# 项目知识索引', '', '> 摘要', '']
  for (const s of SECTIONS) {
    lines.push('## ' + s, '', KB_PATHS.generatedBegin, KB_PATHS.generatedEnd, '')
  }
  return lines.join('\n')
}

let dir: string
let store: ReturnType<typeof makeTestStore>

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'kb-deposit-'))
  store = makeTestStore()
  // 归档材料必须真实落盘（否则既有 openable 校验先拒）
  mkdirSync(join(dir, 'docs/requirements/REQ-abc123'), { recursive: true })
  for (const f of ['requirement.md', 'plan.md', 'verification.md', 'retro.md']) {
    writeFileSync(join(dir, 'docs/requirements/REQ-abc123', f), '# ' + f + '\n内容\n', 'utf8')
  }
  const r = {
    id: 'REQ-abc123', title: '知识层需求', description: '', status: 'archived', blocked: false, category: 'feature',
    sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [{ status: 'archived', at: 1, by: { kind: 'human' } }],
  } as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
})

afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

function deps(withKnowledge: boolean) {
  const d = toUseCaseDeps({ store, now: () => Date.now(), workspaceRoot: dir } as never)
  if (withKnowledge) d.knowledge = new KnowledgeRepository(d.docs)
  return d
}

const archiveArgs = (over: Record<string, unknown> = {}) => ({
  dir: 'docs/requirements/REQ-abc123',
  docs: [
    { kind: 'requirement', path: 'docs/requirements/REQ-abc123/requirement.md' },
    { kind: 'plan', path: 'docs/requirements/REQ-abc123/plan.md' },
    { kind: 'verification', path: 'docs/requirements/REQ-abc123/verification.md' },
  ],
  merged_into: ['docs/architecture/project-manual.md'],
  index_entry: '知识层让新窗口少花一个数量级的 token 就能认识项目',
  manual_updates: [{ path: 'docs/architecture/project-manual.md', section: '知识层', summary: '多了知识层入口' }],
  // REQ-261004183621-de3f FR-2：目录内有 retro.md 但清单只收三件 → 显式声明不收
  // （这条用例考的是归档沉淀，不是清单闸门；闸门本身另有 archive-reconcile 用例专测）
  unlisted_ack: [{ path: 'docs/requirements/REQ-abc123/retro.md', reason: '本用例无复盘，夹具有意不收' }],
  ...over,
})

/** 知识层产物快照（用于断言「零变化」）。 */
function kbSnapshot(): string {
  const idx = existsSync(join(dir, KB_PATHS.index)) ? readFileSync(join(dir, KB_PATHS.index), 'utf8') : '(无索引)'
  const entries = existsSync(join(dir, KB_PATHS.entriesDir))
    ? require('node:fs').readdirSync(join(dir, KB_PATHS.entriesDir)).sort().join(',')
    : '(无条目目录)'
  return idx + '||' + entries
}

describe('落地：归档 → 条目 + 索引行', () => {
  it('归档提交后生成 entries/kb-0001.md 并在「决策」节登记一行', async () => {
    mkdirSync(join(dir, 'docs/knowledge'), { recursive: true })
    writeFileSync(join(dir, KB_PATHS.index), indexSkeleton(), 'utf8')
    const tool = defineSubmitTool(deps(true))
    const out = await tool.execute({ kind: 'archive', ...archiveArgs() }, { agent: { id: W } } as never) as never as Record<string, unknown>
    expect(String(out['error'] ?? '')).toBe('') // 不报错（成功路径）
    const entry = readFileSync(join(dir, entryPath('kb-0001')), 'utf8')
    expect(entry).toContain('id: kb-0001')
    expect(entry).toContain('kind: decision')       // 无 retro → 决策
    expect(entry).toContain('one_liner: 知识层让新窗口少花一个数量级的 token 就能认识项目')
    expect(entry).toContain('req: REQ-abc123')
    expect(entry).toContain('## 结论')
    expect(entry).toContain('## 失效条件')
    const idx = readFileSync(join(dir, KB_PATHS.index), 'utf8')
    const section = idx.slice(idx.indexOf('## 决策'), idx.indexOf('## 坑'))
    expect(section).toContain('- kb-0001 · decision · 知识层让新窗口少花一个数量级的 token 就能认识项目 · → entries/kb-0001.md')
  })

  it('同源重复提交幂等：id 复用、索引行不重复', async () => {
    mkdirSync(join(dir, 'docs/knowledge'), { recursive: true })
    writeFileSync(join(dir, KB_PATHS.index), indexSkeleton(), 'utf8')
    const tool = defineSubmitTool(deps(true))
    await tool.execute({ kind: 'archive', ...archiveArgs() }, { agent: { id: W } } as never)
    await tool.execute({ kind: 'archive', ...archiveArgs({ index_entry: '第二版结论（同源覆盖）' }) }, { agent: { id: W } } as never)
    const idx = readFileSync(join(dir, KB_PATHS.index), 'utf8')
    expect(idx.split('\n').filter((l) => l.startsWith('- kb-0001 ·'))).toHaveLength(1)
    expect(idx).toContain('第二版结论（同源覆盖）')
    expect(existsSync(join(dir, entryPath('kb-0002')))).toBe(false)
  })

  it('index_entry 为空 → 既有拒绝，且知识层零变化', async () => {
    mkdirSync(join(dir, 'docs/knowledge'), { recursive: true })
    writeFileSync(join(dir, KB_PATHS.index), indexSkeleton(), 'utf8')
    const before = kbSnapshot()
    const tool = defineSubmitTool(deps(true))
    await expect(tool.execute({ kind: 'archive', ...archiveArgs({ index_entry: '' }) }, { agent: { id: W } } as never))
      .rejects.toThrowError(/索引条目/)
    expect(kbSnapshot()).toBe(before)
  })

  it('未装配知识层 → 不阻断归档，评论里如实写「未沉淀」', async () => {
    const tool = defineSubmitTool(deps(false))
    const out = await tool.execute({ kind: 'archive', ...archiveArgs() }, { agent: { id: W } } as never) as never as Record<string, unknown>
    expect(String(out['error'] ?? '')).toBe('')
    const comments = store.peekAll()[0]!.comments
    const last = comments.at(-1)?.body ?? ''
    expect(last).toContain('说明书更新：docs/architecture/project-manual.md')
    expect(last).toContain('知识层：未沉淀')
  })
})

describe('内容组装与直调（纯函数 + 用例）', () => {
  it('docKinds 含 retro → kind=pitfall（坑，而不是决策）', () => {
    const d = buildDepositDraft({
      requirementId: 'REQ-x', requirementTitle: '标题', indexEntry: '一句话',
      mergedInto: ['docs/architecture/project-manual.md'], dir: 'docs/requirements/REQ-x',
      docKinds: ['requirement', 'verification', 'retro'], archivedOn: '2026-10-01', hasRetro: true,
    })
    expect(d.kind).toBe('pitfall')
    expect(d.pointer).toBe('docs/architecture/project-manual.md')
    expect(d.updated).toBe('2026-10-01')
    for (const s of ['## 结论', '## 适用条件', '## 证据', '## 失效条件', '## 相关']) expect(d.body).toContain(s)
  })

  it('无合并去向 → 指针落到归档目录（不留空指针）', () => {
    const d = buildDepositDraft({
      requirementId: 'REQ-x', requirementTitle: '标题', indexEntry: '一句话',
      mergedInto: [], dir: 'docs/requirements/REQ-x', docKinds: [], archivedOn: '2026-10-01', hasRetro: false,
    })
    expect(d.pointer).toBe('docs/requirements/REQ-x/verification.md')
  })

  it('索引不存在 → skipped（不抛、不阻断）', async () => {
    const r = await depositArchiveKnowledge(deps(true), {
      requirementId: 'REQ-x', requirementTitle: 't', indexEntry: '一句话', mergedInto: [],
      dir: 'docs/requirements/REQ-x', docKinds: [], archivedOn: '2026-10-01', hasRetro: false,
    })
    expect(r.deposited).toBe(false)
    expect(r.reason ?? '').toMatch(/知识索引不存在/)
  })

  // REQ-261006123819-3af3 FR-4 根因①：沉淀路径必须**先清洗非法字符再截断**
  // （与 operations.ts 的 entryToIndexRow 同源）。原来直接 slice，`·`/`→` 原样进 one_liner，
  // 索引行语法校验当场失败 → 条目落盘、索引没写 → K5 孤儿（kb-0043/kb-0048 的成因）。
  it('根因①：indexEntry 含 · / → 或超 140 字符 → oneLiner 先清洗再截断', () => {
    const d = buildDepositDraft({
      requirementId: 'REQ-x', requirementTitle: '标题',
      indexEntry: '把 → 换成 · 的结论'.repeat(20), // 含两种非法字符，且远超 140
      mergedInto: [], dir: 'docs/requirements/REQ-x', docKinds: [], archivedOn: '2026-10-01', hasRetro: false,
    })
    expect(d.oneLiner.length).toBeLessThanOrEqual(140)
    expect(d.oneLiner).not.toMatch(/[·→\n]/)
    expect(d.oneLiner.trim().length).toBeGreaterThan(0)
  })

  it('根因①端到端：非法字符的 index_entry → 条目与索引行同刻写上（不是孤儿）', async () => {
    mkdirSync(join(dir, 'docs/knowledge'), { recursive: true })
    writeFileSync(join(dir, KB_PATHS.index), indexSkeleton(), 'utf8')
    const tool = defineSubmitTool(deps(true))
    const out = await tool.execute(
      { kind: 'archive', ...archiveArgs({ index_entry: '含 · 与 → 的一句话'.repeat(12) }) },
      { agent: { id: W } } as never,
    ) as never as Record<string, unknown>
    expect(String(out['error'] ?? '')).toBe('')
    const entry = readFileSync(join(dir, entryPath('kb-0001')), 'utf8')
    // 用解析器取回真实值（YAML 对首尾空白会加引号，别拿原始行数长度当判据）
    const oneLiner = parseEntryDoc(entry).meta.oneLiner
    expect(oneLiner.length).toBeLessThanOrEqual(140)
    expect(oneLiner).not.toMatch(/[·→]/)
    // 关键：索引里必须有这一行——条目落盘而索引没有，就是本次要根除的孤儿
    expect(readFileSync(join(dir, KB_PATHS.index), 'utf8'))
      .toContain('- kb-0001 · decision · ' + oneLiner + ' · → entries/kb-0001.md')
  })
})
