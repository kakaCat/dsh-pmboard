/**
 * 归档清单对账测试（REQ-261004183621-de3f t2）。
 *
 * 锁死四件事：① 三分类集合不交；② 未列未豁免**未被声明** → 拒绝且零写入；
 * ③ 声明的合法性（覆盖不全 / 路径不在未列集合 / 空理由分别拒）；④ warn 闸门回到旧语义。
 *
 * REQ-261006201841-944d（FR-1/FR-2）契约升级：归档目标改判**事实**——`merged_into` 与
 * `manual_updates[].path` 的 `#` 前路径都必须**真实落盘且非空**，锚点必须命中该文档真实标题。
 * 夹具据此把两份目标文档真 stub 出来，锚点**由 `listHeadingAnchors` 从同一份正文算出**
 * （不硬编码 slug 规则——中文与全角标点会让手写 slug 静默失配）。
 */
import { makeTestStore } from './application/harness.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineArchiveSubmitTool, stubDocFile } from './helpers/tool-deps.js'
import { listHeadingAnchors } from '../src/domain/knowledge/slug.js'
import type { RequirementRecord, RequirementStatus } from '../src/shared/protocol.js'

const W = 'session-abc-123'
const DIR = 'docs/requirements/REQ-abc123'
/** 合并去向 + 说明书更新点目标（同一份：feature 类白名单内的 architecture 文档）。 */
const MANUAL_DOC = 'docs/architecture/project-manual.md'
const MANUAL_MD = '# 项目说明书\n\n## 收尾门\n\n收尾门三条硬约束：对账三分类与闸门。\n'
/** 锚点由写入端/读侧同一实现算出（`headingAnchor` 经过 `listHeadingAnchors`）。 */
const MANUAL_ANCHOR = listHeadingAnchors(MANUAL_MD).map(h => h.anchor)[listHeadingAnchors(MANUAL_MD).length - 1]!
let root: string
let store: ReturnType<typeof makeTestStore>

function makeTool(extra: Record<string, unknown> = {}) {
  const deps = { store, now: () => Date.now(), workspaceRoot: root, ...extra } as never
  return defineArchiveSubmitTool(deps) as { execute: (a: unknown, e: unknown) => Promise<any> }
}

const run = (tool: { execute: (a: unknown, e: unknown) => Promise<any> }, args: unknown) =>
  tool.execute(args, { agent: { id: W } })

async function seed(status: RequirementStatus = 'archived'): Promise<void> {
  const r = {
    id: 'REQ-abc123', title: '需求', description: '', status, blocked: false, category: 'feature',
    sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [{ status, at: 1, by: { kind: 'human' } }],
  } as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

/** 造 fixture 目录：3 份必列 + 4 份豁免 + 2 份未列；另把归档目标文档真落盘。 */
function plantFixture(): void {
  for (const p of ['requirement.md', 'decomposition.md', 'verification.md']) stubDocFile(DIR + '/' + p, root)
  for (const p of ['rtm-design.yml', 'rtm-implementing/t-1.yml', 'queue.json', 'state/x.json']) stubDocFile(DIR + '/' + p, root)
  for (const p of ['tasks/t-1.md', 'evidence/x.txt']) stubDocFile(DIR + '/' + p, root)
  // FR-1/FR-2：合并去向与说明书更新点的目标必须存在且非空，锚点必须真实存在
  stubDocFile(MANUAL_DOC, root, MANUAL_MD)
}

const baseArchive = {
  dir: DIR,
  docs: [
    { kind: 'requirement', path: DIR + '/requirement.md' },
    { kind: 'plan', path: DIR + '/decomposition.md' },
    { kind: 'verification', path: DIR + '/verification.md' },
  ],
  merged_into: [MANUAL_DOC],
  index_entry: '归档清单改为对账口径',
  manual_updates: [{ path: MANUAL_DOC + '#' + MANUAL_ANCHOR, summary: '对账三分类与闸门' }],
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pm-archive-reconcile-'))
  store = makeTestStore()
  plantFixture()
})
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

describe('T1 三分类', () => {
  it('已列/豁免/未列集合不交，且并集 = 目录内文件（含 ack 声明后）', async () => {
    await seed()
    const tool = makeTool()
    const out = await run(tool, {
      ...baseArchive,
      unlisted_ack: [
        { path: DIR + '/tasks/t-1.md', reason: '任务卡由台账渲染，不入清单' },
        { path: DIR + '/evidence/x.txt', reason: '临时调试产物' },
      ],
    })
    const rec = out.reconcile
    // REQ-261006201841-944d t4（归档渲染物落盘，与本卡同一需求链的上游产出）：
    // 本次归档的结论文件 `archive.md` 由用例**自己补登**进清单（不命中豁免表，不补登就会
    // "自己渲染的文件把自己挡住"），故「已列」= 调用方 docs 3 份 + archive.md 1 份 = 4。
    expect(rec.listed.length).toBe(4)
    expect(rec.listed).toContain(DIR + '/archive.md')
    expect(rec.exempted.map((e: { rule: string }) => e.rule).sort()).toEqual(['ledger-mirror', 'rtm-dir', 'rtm-reports', 'runtime-state'])
    expect(rec.unlisted.length).toBe(2)
    expect(rec.acknowledged.length).toBe(2)
    // 不交
    const listed = new Set(rec.listed)
    for (const e of rec.exempted) expect(listed.has(e.path)).toBe(false)
    for (const u of rec.unlisted) expect(listed.has(u)).toBe(false)
    // 并集 = 目录内 9 份文件 + 补登的 archive.md（t4 的集合口径：listed ∪ exempted ∪ unlisted
    // = 遍历全集 ∪ {archive.md}——archive.md 两个方向都不落「未列」）
    expect(listed.size + rec.exempted.length + rec.unlisted.length).toBe(10)
  })
})

describe('T4 未列即拒（enforce）', () => {
  it('有未列且未声明 → 拒绝，且台账零改动', async () => {
    await seed()
    const tool = makeTool()
    await expect(run(tool, baseArchive)).rejects.toThrow(/既未列入清单、也未声明豁免/)
    expect(store.peekAll()[0]!.archive).toBeUndefined()
    expect(store.peekAll()[0]!.comments.length).toBe(0)
  })

  it('拒绝信息给出两种处置方式（响亮）', async () => {
    await seed()
    const tool = makeTool()
    let msg = ''
    try { await run(tool, baseArchive) } catch (e) { msg = (e as Error).message }
    expect(msg).toContain('unlisted_ack')
    expect(msg).toContain('加进 docs 清单')
    expect(msg).toContain('tasks/t-1.md')
  })
})

describe('T5/T6 声明的合法性', () => {
  it('覆盖不全 → 拒，并指出缺处置的文件', async () => {
    await seed()
    const tool = makeTool()
    await expect(run(tool, {
      ...baseArchive,
      unlisted_ack: [{ path: DIR + '/evidence/x.txt', reason: '临时产物' }],
    })).rejects.toThrow(/tasks\/t-1\.md/)
  })

  it('声明了不在未列集合里的路径 → 拒（不能凭空豁免）', async () => {
    await seed()
    const tool = makeTool()
    await expect(run(tool, {
      ...baseArchive,
      unlisted_ack: [
        { path: DIR + '/evidence/x.txt', reason: '临时产物' },
        { path: DIR + '/rtm-design.yml', reason: '这条已命中豁免，不该出现在 ack 里' },
      ],
    })).rejects.toThrow(/并不在未列集合里/)
  })

  it('空理由 → 拒（豁免必须写理由）', async () => {
    await seed()
    const tool = makeTool()
    await expect(run(tool, {
      ...baseArchive,
      unlisted_ack: [{ path: DIR + '/evidence/x.txt', reason: '' }],
    })).rejects.toThrow(/reason 不能为空/)
  })
})

describe('T7 声明齐 → 通过并留痕', () => {
  it('归档成功；对账结果落记录、摘要进评论', async () => {
    await seed()
    const tool = makeTool()
    const out = await run(tool, {
      ...baseArchive,
      unlisted_ack: [
        { path: DIR + '/tasks/t-1.md', reason: '任务卡由台账渲染' },
        { path: DIR + '/evidence/x.txt', reason: '临时调试产物' },
      ],
    })
    expect(out.success).toBe(true)
    const rec = store.peekAll()[0]!
    expect(rec.archive?.reconcile?.gate).toBe('enforce')
    expect(rec.archive?.reconcile?.acknowledged.map(a => a.reason)).toContain('任务卡由台账渲染')
    const body = rec.comments.map(c => c.body).join('\n')
    // 已列 4 = 调用方 3 份 + 补登的结论文件 archive.md（REQ-261006201841-944d t4）
    expect(body).toContain('清单对账：已列 4 · 豁免 4 · 未列 2（闸门=enforce）')
    expect(body).toContain('已声明不收：')
  })
})

describe('T8 warn 闸门（回退语义）', () => {
  it('未列但不声明也放行；reconcile.gate=warn；warning 仍在', async () => {
    await seed()
    const tool = makeTool({ archiveUnlistedGate: 'warn' })
    const out = await run(tool, baseArchive)
    expect(out.success).toBe(true)
    expect(out.reconcile.gate).toBe('warn')
    expect(out.unlisted_files.length).toBe(2)
    expect(String(out.warning)).toContain('未列入归档清单')
    expect(store.peekAll()[0]!.archive?.reconcile?.gate).toBe('warn')
  })
})
