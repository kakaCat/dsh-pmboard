/**
 * 归档清单受控补录测试（REQ-261004183621-de3f t3 / FR-4）。
 *
 * 语义四条：只追加、幂等（不改写盘）、状态守卫、不碰冷侧（产物与合并去向逐字不变）。
 */
import { makeTestStore } from './application/harness.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { toUseCaseDeps, stubDocFile } from './helpers/tool-deps.js'
import { amendArchiveManifest } from '../src/application/use-cases/AmendArchiveManifest.js'
import type { RequirementRecord, RequirementStatus } from '../src/shared/protocol.js'

const W = 'session-abc-123'
const OTHER = 'session-other-9'
const DIR = 'docs/requirements/REQ-abc123'
let root: string
let store: ReturnType<typeof makeTestStore>

const deps = () => toUseCaseDeps({ store, now: () => Date.now(), workspaceRoot: root } as never)

async function seed(status: RequirementStatus = 'archived', withArchive = true, sourceSessionId = W): Promise<void> {
  const r = {
    id: 'REQ-abc123', title: '需求', description: '', status, blocked: false, category: 'feature',
    sourceSessionId, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [{ status, at: 1, by: { kind: 'human' } }],
    ...(withArchive
      ? {
        archive: {
          dir: DIR,
          docs: [
            { kind: 'requirement', path: DIR + '/requirement.md' },
            { kind: 'plan', path: DIR + '/decomposition.md' },
            { kind: 'verification', path: DIR + '/verification.md' },
          ],
          mergedInto: ['docs/architecture/project-manual.md'],
          indexEntry: '归档清单对账',
          submittedAt: 1,
          submittedBy: { kind: 'agent', sessionId: W },
        },
      }
      : {}),
  } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

const call = (args: unknown, agent = W) => amendArchiveManifest(deps(), args, { agent: { id: agent } })

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pm-archive-amend-'))
  store = makeTestStore()
  stubDocFile(DIR + '/verification.md', root, '# 验收材料（别动我）\n')
})
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

describe('T9 追加', () => {
  it('补 3 条：docs +3、amendments +1、评论 +1、状态仍 archived', async () => {
    await seed()
    const out = await call({
      requirement_id: 'REQ-abc123',
      docs: [
        { kind: 'notes', path: DIR + '/tasks/t-1.md' },
        { kind: 'notes', path: DIR + '/evidence/gates.txt' },
        { kind: 'notes', path: DIR + '/tests/test-evidence.md' },
      ],
      reason: '归档后发现这三份没进清单',
    })
    expect(out.appended.length).toBe(3)
    expect(out.skipped).toEqual([])
    const rec = store.peekAll()[0]!
    expect(rec.archive?.docs.length).toBe(6)
    expect(rec.archive?.amendments?.length).toBe(1)
    expect(rec.archive?.amendments?.[0]?.reason).toContain('归档后发现')
    expect(rec.comments.some(c => c.body.includes('[归档·补录]'))).toBe(true)
    expect(rec.status).toBe('archived')
  })

  it('对账字段的 listed 同步为新清单（不留下自相矛盾的数据）', async () => {
    await seed()
    // 造一份带对账结果的记录（直接改台账：本用例只关心"补录后 listed 是否跟上"）
    const rec = store.peekAll()[0]!
    rec.archive!.reconcile = {
      gate: 'enforce', listed: rec.archive!.docs.map(d => d.path), exempted: [], unlisted: [],
      acknowledged: [], at: 1,
    }
    await call({ requirement_id: 'REQ-abc123', docs: [{ kind: 'notes', path: DIR + '/evidence/x.txt' }], reason: '补一份证据' })
    const after = store.peekAll()[0]!
    expect(after.archive?.reconcile?.listed).toContain(DIR + '/evidence/x.txt')
    expect(after.archive?.reconcile?.listed.length).toBe(after.archive?.docs.length)
  })
})

describe('T10 幂等', () => {
  it('同批再调 → 全 skipped；amendments 不增；台账修订号不变', async () => {
    await seed()
    const batch = { requirement_id: 'REQ-abc123', docs: [{ kind: 'notes' as const, path: DIR + '/evidence/x.txt' }], reason: '补一份证据' }
    const first = await call(batch)
    expect(first.appended.length).toBe(1)
    const revisionBefore = (await store.head()).revision
    const commentsBefore = store.peekAll()[0]!.comments.length
    const second = await call(batch)
    expect(second.appended).toEqual([])
    expect(second.skipped).toEqual([{ path: DIR + '/evidence/x.txt', reason: 'already-listed' }])
    expect((await store.head()).revision).toBe(revisionBefore)
    expect(store.peekAll()[0]!.comments.length).toBe(commentsBefore)
    expect(store.peekAll()[0]!.archive?.amendments?.length).toBe(1)
  })
})

describe('T11 守卫', () => {
  it('非归档态 → 拒（REQBOARD_BAD_STATUS）', async () => {
    await seed('implementing')
    await expect(call({ requirement_id: 'REQ-abc123', docs: [{ kind: 'notes', path: DIR + '/x.md' }], reason: 'r' }))
      .rejects.toThrow(/只有已归档/)
  })

  it('尚未提交归档材料 → 拒并指明先做什么', async () => {
    await seed('archived', false)
    await expect(call({ requirement_id: 'REQ-abc123', docs: [{ kind: 'notes', path: DIR + '/x.md' }], reason: 'r' }))
      .rejects.toThrow(/尚未提交归档材料/)
  })

  it('非本窗口需求 → 拒（REQBOARD_NOT_BOUND_TO_WINDOW）', async () => {
    await seed('archived', true, OTHER)
    await expect(call({ requirement_id: 'REQ-abc123', docs: [{ kind: 'notes', path: DIR + '/x.md' }], reason: 'r' }))
      .rejects.toThrow(/不是本窗口的需求/)
  })

  it('reason 为空 / docs 为空 / kind 非法 → 分别拒', async () => {
    await seed()
    await expect(call({ requirement_id: 'REQ-abc123', docs: [{ kind: 'notes', path: DIR + '/x.md' }], reason: '' })).rejects.toThrow(/reason 不能为空/)
    await expect(call({ requirement_id: 'REQ-abc123', docs: [], reason: 'r' })).rejects.toThrow(/docs 必须是非空数组/)
    await expect(call({ requirement_id: 'REQ-abc123', docs: [{ kind: 'bogus', path: DIR + '/x.md' }], reason: 'r' })).rejects.toThrow(/kind 必须是/)
  })
})

describe('T12 不碰冷侧', () => {
  it('补录前后：verification.md 逐字不变、merged_into 与索引条目不变', async () => {
    await seed()
    const fileBefore = readFileSync(join(root, DIR + '/verification.md'), 'utf8')
    const recBefore = store.peekAll()[0]!
    const mergedBefore = [...(recBefore.archive?.mergedInto ?? [])]
    const indexBefore = recBefore.archive?.indexEntry
    await call({ requirement_id: 'REQ-abc123', docs: [{ kind: 'notes', path: DIR + '/evidence/gates.txt' }], reason: '补一份证据' })
    expect(readFileSync(join(root, DIR + '/verification.md'), 'utf8')).toBe(fileBefore)
    const recAfter = store.peekAll()[0]!
    expect(recAfter.archive?.mergedInto).toEqual(mergedBefore)
    expect(recAfter.archive?.indexEntry).toBe(indexBefore)
    expect(recAfter.archive?.manualUpdates).toBeUndefined()
  })
})
