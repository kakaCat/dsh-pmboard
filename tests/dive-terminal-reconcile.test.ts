// serves: FR-9
/**
 * 终态收手：预防 + 存量对账（REQ-261004065652-5c1c · t4 / TC-10）。
 *
 * ## 复现的现场
 *
 * 2026-10-03 台账实测：3 条需求已 `archived`，却仍是 `armed + active + paused` ——
 * 自动意图与需求状态自相矛盾。
 *
 * ## 本文件钉住的两件事 + 一条**诚实的边界**
 *
 * ① **预防半边（真正有效的那半）**：需求走进终态的那一刻收回自动意图，两条入口共用一份实现。
 *    必须在"那一刻"做——落成终态后存储层就判它为**冷侧只读**，再也写不动 `dive`。
 * ② **对账半边只负责响亮报告**：存量终态记录同样受冷侧只读保护、写不进去；
 *    对账把它们逐条点名报出（`skippedCold`），由人裁定是否放宽豁免——不静默跳过、也不偷偷放宽防线。
 *
 * ⚠️ 这与设计文档 §FR-9「对账改写存量」的措辞**不一致**：实测发现冷侧只读（人工裁定 2026-10-02）
 * 覆盖**全部终态**（含 `done`），不是设计时以为的"可改写"。已在任务汇报里如实登记为偏离。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { FakeShardFs, seedShard } from './reqboard/fake-shard-fs.js'
import { RequirementShardRepository } from '../src/repositories/RequirementShardRepository.js'
import { ShardedRequirementStore } from '../src/repositories/ShardedRequirementStore.js'
import { reconcileTerminalDive } from '../src/application/internal/reconcile-terminal-dive.js'
import { disarmDiveOnTerminal } from '../src/application/internal/terminal-disarm.js'
import type { CommentRecord, RequirementDive, RequirementRecord } from '../src/shared/protocol.js'

const ROOT = '/data/reqboard'

function req(id: string, status: RequirementRecord['status'], over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id, title: '需求 ' + id, description: '', status, blocked: false,
    comments: [], version: 1, createdAt: 100, updatedAt: 100,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    dive: { activation: 'armed', phase: 'active', roundsInStage: 0, driverHealth: { state: 'paused', reason: 'advance-fail', since: 1, attempts: 1 } },
    ...over,
  } as unknown as RequirementRecord
}

async function store(seed: readonly RequirementRecord[]) {
  const fs = new FakeShardFs()
  const repo = new RequirementShardRepository({ fs, now: () => 1_000, onWarn: () => { /* 本文件不关心 */ } })
  for (const record of seed) await seedShard(repo, ROOT, { record })
  await repo.writeMeta(ROOT, { schemaVersion: 10, revision: 1 })
  const s = new ShardedRequirementStore({ root: ROOT, repository: repo, now: () => 2_000, onWarn: () => { /* 同上 */ } })
  await s.listSummaries() // 建索引
  return s
}

const warns: string[] = []
const runReconcile = (s: ShardedRequirementStore) =>
  reconcileTerminalDive({
    store: s, now: () => 2_000,
    logger: { info: () => { /* 本文件不关心 */ }, warn: (m) => warns.push(m) },
  })

describe('TC-10·对账 · 终态在冷侧只读，逐条响亮报出', () => {
  it('done + armed → 进 skippedCold（点名 + 码）、零写入、响亮告警', async () => {
    warns.length = 0
    const s = await store([req('REQ-000001', 'done')])
    const before = (await s.head()).revision
    const res = await runReconcile(s)

    expect(res.reconciled).toEqual([])
    expect(res.skippedCold).toEqual([{ id: 'REQ-000001', code: 'REQBOARD_COLD_IMMUTABLE' }])
    expect((await s.head()).revision, '写被拒 ⇒ 台账零变化').toBe(before)
    expect((await s.get('REQ-000001'))?.dive?.activation).toBe('armed')
    expect(warns.join(' ')).toContain('冷侧只读')
    expect(warns.join(' '), '必须点名到具体需求，人才知道该裁定谁').toContain('REQ-000001')
  })

  it('archived + armed → 同样进 skippedCold（冷侧判据按**状态**，与目录无关）', async () => {
    warns.length = 0
    const s = await store([req('REQ-000004', 'archived')])
    const res = await runReconcile(s)
    expect(res.skippedCold.map((x) => x.id)).toEqual(['REQ-000004'])
  })

  it('幂等：第二次运行零写入（revision 不变）', async () => {
    const s = await store([req('REQ-000001', 'done')])
    await runReconcile(s)
    const before = (await s.head()).revision
    const second = await runReconcile(s)
    expect(second.reconciled).toEqual([])
    expect(second.skippedCold.map((x) => x.id)).toEqual(['REQ-000001'])
    expect((await s.head()).revision, '幂等：不该有任何写入').toBe(before)
  })

  it('在跑的需求（implementing + armed）一个字都不动', async () => {
    const s = await store([req('REQ-000002', 'implementing', { dive: { activation: 'armed', phase: 'active', roundsInStage: 3 } })])
    const before = (await s.head()).revision
    const res = await runReconcile(s)
    expect(res.reconciled).toEqual([])
    expect(res.skippedCold).toEqual([])
    expect((await s.get('REQ-000002'))?.dive?.activation).toBe('armed')
    expect((await s.head()).revision).toBe(before)
  })

  it('已是 disarmed 的终态需求 → 连 mutate 都不进（零写入）', async () => {
    const s = await store([req('REQ-000003', 'done', { dive: { activation: 'disarmed', phase: 'idle', roundsInStage: 0 } })])
    const before = (await s.head()).revision
    const res = await runReconcile(s)
    expect(res.reconciled).toEqual([])
    expect(res.skippedCold).toEqual([])
    expect((await s.head()).revision).toBe(before)
  })
})

describe('FR-9·预防半边 · 走进终态那一刻收手', () => {
  const draft = (dive: RequirementDive) => ({ dive, comments: [] as CommentRecord[] })
  let n = 0
  const commentId = () => 'c-test-' + (n += 1)

  it('终态 + armed → 收手并留下 armed → disarmed 迁移痕', () => {
    const d = draft({ activation: 'armed', phase: 'active', roundsInStage: 0 })
    expect(disarmDiveOnTerminal(d, { to: 'archived', at: 5, commentId })).toBe(true)
    expect(d.dive.activation).toBe('disarmed')
    expect(d.comments.map((c) => c.body).join('\n')).toContain('armed → disarmed')
    expect(d.comments.map((c) => c.body).join('\n')).toContain('archived')
  })

  it('三种终态都收手（done / archived / canceled）', () => {
    for (const to of ['done', 'archived', 'canceled']) {
      const d = draft({ activation: 'armed', phase: 'active', roundsInStage: 0 })
      expect(disarmDiveOnTerminal(d, { to, at: 5, commentId }), to).toBe(true)
    }
  })

  it('非终态 → 零改动（不许顺手把在跑的需求关掉）', () => {
    const d = draft({ activation: 'armed', phase: 'active', roundsInStage: 0 })
    expect(disarmDiveOnTerminal(d, { to: 'implementing', at: 5, commentId })).toBe(false)
    expect(d.dive.activation).toBe('armed')
    expect(d.comments).toHaveLength(0)
  })

  it('已是 disarmed → 零改动（幂等，不重复留痕）', () => {
    const d = draft({ activation: 'disarmed', phase: 'idle', roundsInStage: 0 })
    expect(disarmDiveOnTerminal(d, { to: 'archived', at: 5, commentId })).toBe(false)
    expect(d.comments).toHaveLength(0)
  })

  it('两条入口共用同一实现（静态断言：防"一边改了一边没改"的真相漂移）', () => {
    const read = (rel: string): string => readFileSync(fileURLToPath(new URL('../' + rel, import.meta.url)), 'utf8')
    const tool = read('src/application/use-cases/MoveRequirement.ts')
    const board = read('src/http/routers/requirements.ts')
    for (const [label, text] of [['工具路径', tool], ['看板路径', board]] as const) {
      expect(text, label + ' 必须调用公共收手实现').toContain('disarmDiveOnTerminal(')
      expect(text, label + ' 不得自己再写一份 transitionDive(disarm-terminal)')
        .not.toContain("event: 'disarm-terminal'")
    }
  })
})
