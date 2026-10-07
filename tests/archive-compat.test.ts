/**
 * 迁移与兼容测试（REQ-261004183621-de3f t6）。
 *
 * 四件事：① 存量归档记录（无对账字段）照样能读能渲染；② 缺省闸门 = enforce（不写配置的老行为变了，
 * 但**由本需求的人工闸门批准**）；③ warn 回退时老字段（unlisted_files / warning）语义不变；
 * ④ 对存量记录补录不崩、不伪造对账结果。
 */
import { makeTestStore } from './application/harness.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineArchiveSubmitTool, stubDocFile, toUseCaseDeps } from './helpers/tool-deps.js'
import { amendArchiveManifest } from '../src/application/use-cases/AmendArchiveManifest.js'
import { archiveReconcileLine, renderArchiveSection } from '../src/client/views/verification.ts'
import { listHeadingAnchors } from '../src/domain/knowledge/slug.js'
import type { RequirementRecord, RequirementStatus } from '../src/shared/protocol.js'
// 看板渲染器吃的是**客户端视图类型**（`src/client/types.ts`），与协议类型同形但非同一份声明
// （当前只在 VerificationItem.status 的枚举宽度上有差）——渲染断言按视图类型声明。
import type { RequirementRecord as ClientRequirementRecord } from '../src/client/types.js'

const W = 'session-abc-123'
const DIR = 'docs/requirements/REQ-abc123'
/**
 * 合并去向 + 说明书更新点目标（REQ-261006201841-944d FR-1/FR-2）：目标文档必须**真实落盘且非空**，
 * 锚点必须命中该文档真实标题。锚点由 `listHeadingAnchors`（写入端/读侧同一实现）算出，不手写 slug。
 */
const MANUAL_DOC = 'docs/architecture/project-manual.md'
const MANUAL_MD = '# 项目说明书\n\n## 收尾门\n\n收尾门三条硬约束：对账三分类与闸门。\n'
const MANUAL_ANCHOR = listHeadingAnchors(MANUAL_MD).map(h => h.anchor)[listHeadingAnchors(MANUAL_MD).length - 1]!
let root: string
let store: ReturnType<typeof makeTestStore>

function tool(extra: Record<string, unknown> = {}) {
  return defineArchiveSubmitTool({ store, now: () => Date.now(), workspaceRoot: root, ...extra } as never) as
    { execute: (a: unknown, e: unknown) => Promise<any> }
}
const run = (t: { execute: (a: unknown, e: unknown) => Promise<any> }, args: unknown) =>
  t.execute(args, { agent: { id: W } })

/** 存量记录：**没有** reconcile / amendments 字段（本功能上线前归档的形态）。 */
async function seedLegacy(status: RequirementStatus = 'archived'): Promise<void> {
  const r = {
    id: 'REQ-abc123', title: '需求', description: '', status, blocked: false, category: 'feature',
    sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [{ status, at: 1, by: { kind: 'human' } }],
    archive: {
      dir: DIR,
      docs: [
        { kind: 'requirement', path: DIR + '/requirement.md' },
        { kind: 'plan', path: DIR + '/decomposition.md' },
        { kind: 'verification', path: DIR + '/verification.md' },
      ],
      mergedInto: ['docs/architecture/project-manual.md'],
      indexEntry: '存量归档记录',
      submittedAt: 1,
      submittedBy: { kind: 'agent', sessionId: W },
    },
  } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

const baseArchive = {
  dir: DIR,
  docs: [
    { kind: 'requirement', path: DIR + '/requirement.md' },
    { kind: 'plan', path: DIR + '/decomposition.md' },
    { kind: 'verification', path: DIR + '/verification.md' },
  ],
  merged_into: [MANUAL_DOC],
  index_entry: 'x',
  manual_updates: [{ path: MANUAL_DOC + '#' + MANUAL_ANCHOR, summary: '对账口径' }],
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pm-archive-compat-'))
  store = makeTestStore()
  for (const p of ['requirement.md', 'decomposition.md', 'verification.md', 'tasks/t-1.md']) stubDocFile(DIR + '/' + p, root)
  // FR-1/FR-2：合并去向与说明书更新点的目标必须存在且非空，锚点必须真实存在
  stubDocFile(MANUAL_DOC, root, MANUAL_MD)
})
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

describe('存量记录（无新字段）', () => {
  it('看板渲染不崩，且显示「未对账」而非 0', () => {
    const req = store.peekAll()[0] ?? undefined
    void req
    const legacy = {
      id: 'REQ-abc123', title: '需求', description: '', status: 'archived', category: 'feature',
      comments: [], version: 1, createdAt: 1, updatedAt: 1,
      createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
      archive: {
        dir: DIR, docs: [], mergedInto: [], indexEntry: '存量', submittedAt: 1,
        submittedBy: { kind: 'agent', sessionId: W },
      },
    } as unknown as ClientRequirementRecord
    expect(archiveReconcileLine(legacy)).toContain('未对账')
    expect(renderArchiveSection(legacy)).toContain('未对账（本功能上线前归档）')
  })

  /**
   * 向后兼容**不得回退**（REQ-261006201841-944d FR-2）：新契约把 `manual_updates[].path` 收紧为
   * `路径#锚点`、废弃 `section`，但**旧形态的存量台账**（path 无 `#`、有 section）必须仍渲染出
   * section 文本——存量不追溯，读侧信息只多不少。这条断言钉住读侧回落，禁止被顺手删掉。
   */
  it('旧形态 manual_updates（path 无 #、有 section）→ 读侧仍渲染出 section 文本', () => {
    const legacy = {
      id: 'REQ-abc123', title: '需求', description: '', status: 'archived', category: 'feature',
      comments: [], version: 1, createdAt: 1, updatedAt: 1,
      createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
      archive: {
        dir: DIR, docs: [], mergedInto: [], indexEntry: '存量', submittedAt: 1,
        submittedBy: { kind: 'agent', sessionId: W },
        manualUpdates: [{ path: MANUAL_DOC, section: '收尾门', summary: '旧形态台账的更新点' }],
      },
    } as unknown as ClientRequirementRecord
    const html = renderArchiveSection(legacy)
    expect(html).toContain('（旧：收尾门）')
    expect(html).toContain('旧形态台账的更新点')
  })

  it('对存量记录补录：追加成功，且**不伪造**对账结果（reconcile 仍缺省）', async () => {
    await seedLegacy()
    const out = await amendArchiveManifest(
      toUseCaseDeps({ store, now: () => Date.now(), workspaceRoot: root } as never),
      { requirement_id: 'REQ-abc123', docs: [{ kind: 'notes', path: DIR + '/tasks/t-1.md' }], reason: '补一份任务卡' },
      { agent: { id: W } },
    )
    expect(out.appended.length).toBe(1)
    const rec = store.peekAll()[0]!
    expect(rec.archive?.amendments?.length).toBe(1)
    expect(rec.archive?.reconcile).toBeUndefined()
  })
})

describe('闸门缺省与回退', () => {
  it('缺省（不配置）= enforce：未列未声明 → 拒（行为变更，由人工闸门批准）', async () => {
    await seedLegacy()
    await expect(run(tool(), baseArchive)).rejects.toThrow(/既未列入清单、也未声明豁免/)
  })

  it('warn 回退：不拒，且老字段 unlisted_files / warning 语义不变', async () => {
    await seedLegacy()
    const out = await run(tool({ archiveUnlistedGate: 'warn' }), baseArchive)
    expect(out.success).toBe(true)
    expect(out.unlisted_files).toEqual([DIR + '/tasks/t-1.md'])
    expect(String(out.warning)).toContain('未列入归档清单')
    expect(out.reconcile.gate).toBe('warn')
  })

  it('warn 模式下声明豁免同样被记录（信息只多不少）', async () => {
    await seedLegacy()
    const out = await run(tool({ archiveUnlistedGate: 'warn' }), {
      ...baseArchive,
      unlisted_ack: [{ path: DIR + '/tasks/t-1.md', reason: '任务卡由台账渲染' }],
    })
    expect(out.reconcile.acknowledged.length).toBe(1)
    expect(out.unlisted_files).toEqual([DIR + '/tasks/t-1.md']) // 事实仍在（未进清单）
  })
})
