/**
 * L2 用例级单测 · 存量引用回填器（REQ-261002164800-d8f2 · t6 / serves: FR-5）。
 *
 * 修前形态：全仓 590 张卡有 531 张 `requirementRefs` 为空（90%），而**没有任何回填路径**——
 * 唯一写入口（reqboard_task_amend）要一张一张手点。
 *
 * 本文件锁四条口径：dry-run 不写盘、候选分类正确、apply 后复核读数为 0、restore 能按 before 还原。
 * 另锁一条边界：归档需求只报告不回填。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeHarness, req } from '../application/harness.js'
import { applyBackfill, checkBackfill, planBackfill, restoreBackfill } from '../../src/application/internal/backfill-task-refs.js'

const REQ_A = 'REQ-0000c1'
const REQ_ARCHIVED = 'REQ-0000c2'
const WINDOW = 'session-w-001'

const REQUIREMENT_MD = ['# 需求', '', '- **FR-1: 甲条**：第一件事', ''].join('\n')
/** 覆盖表只写 t1 —— t2 的卡因此"无来源"（不是候选）。 */
const DECOMPOSITION_MD = [
  '| 需求条款 | 条款内容 | 接收任务 |',
  '|---------|---------|---------|',
  '| FR-1 | 甲条 | t1 |',
  '',
].join('\n')

/** 造一张最小任务卡（v9 队列口径）。 */
function card(id: string, requirementId: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    id, requirementId, title, description: '', phase: 'implement', side: 'backend',
    dependsOn: [], scope: { apis: [], tables: [], files: [] },
    acceptance: 'npx vitest run 全绿', implementation: '改 src/x.ts', context: '',
    status: 'todo', blocked: false, executions: [], statusHistory: [], comments: [], version: 1,
    createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'agent', sessionId: WINDOW }, updatedBy: { kind: 'agent', sessionId: WINDOW },
    ...extra,
  } as never
}

/**
 * RTM 同步按 `docs.workspaceRoot()` 落盘——指到临时目录，避免夹具需求在**真实仓库**里
 * 写出 `docs/requirements/REQ-test-…/rtm-*.yml`（实测踩过一次）。
 */
const tempDirs: string[] = []
afterEach(() => { for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

function seed() {
  const h = makeHarness()
  const root = mkdtempSync(join(tmpdir(), 'pmboard-backfill-'))
  tempDirs.push(root)
  h.docs.workspaceRoot = () => root
  h.seedRequirementSync(
    req({
      id: REQ_A, status: 'implementing', category: 'feature', sourceSessionId: WINDOW,
      artifacts: [{ stage: 'decomposing', kind: 'decomposition', path: 'docs/requirements/' + REQ_A + '/decomposition.md', registeredAt: 1, registeredBy: { kind: 'agent', sessionId: WINDOW } } as never],
      plan: {
        path: 'docs/requirements/' + REQ_A + '/decomposition.md', summary: '两张卡',
        tasks: [
          { key: 't1', title: '甲卡', phase: 'implement' as const, side: 'backend' as const, dependsOn: [], acceptance: 'npx vitest run 全绿', implementation: '改 src/a.ts' },
          { key: 't2', title: '乙卡', phase: 'implement' as const, side: 'backend' as const, dependsOn: ['t1'], acceptance: 'npx vitest run 全绿', implementation: '改 src/b.ts' },
        ],
        submittedAt: 1, submittedBy: { kind: 'agent', sessionId: WINDOW },
        approvedAt: 1, approvedBy: { kind: 'human' },
      },
    }))
  h.seedRequirementSync(req({ id: REQ_ARCHIVED, status: 'archived', category: 'feature', sourceSessionId: WINDOW }))
  h.docs.put('docs/requirements/' + REQ_A + '/requirement.md', REQUIREMENT_MD)
  h.docs.put('docs/requirements/' + REQ_A + '/decomposition.md', DECOMPOSITION_MD)
  return h
}

/** 播种"历史卡"：空引用的父卡、已有引用的卡、子卡，以及归档需求上的空引用卡。 */
async function seedHistoricalCards(h: ReturnType<typeof seed>) {
  await h.addTasks(REQ_A, [
    card('t-a1', REQ_A, '甲卡'),                                  // 空引用 + 覆盖表有 t1 → 候选
    card('t-a2', REQ_A, '乙卡'),                                  // 空引用 + 覆盖表没写 t2 → 无来源
    card('t-a3', REQ_A, '丙卡', { requirementRefs: ['FR-1'] }),   // 已有引用 → 跳过
    card('t-a4', REQ_A, '丁卡', { parentId: 't-a1' }),            // 子卡 → 跳过
  ])
  await h.addTasks(REQ_ARCHIVED, [card('t-b1', REQ_ARCHIVED, '归档卡')])
}

describe('回填器 · dry-run 只算不写（FR-5）', () => {
  it('候选 / 无来源 / 跳过三类分得清，且一个字节都不写盘', async () => {
    const h = seed()
    await h.seedSettled()
    await seedHistoricalCards(h)
    const seqBefore = h.queueRepo.writeSeqOf(REQ_A)

    const plan = await planBackfill(h.deps)
    expect(plan.dry_run).toBe(true)
    const a = plan.requirements.find(p => p.requirement_id === REQ_A)!
    expect(a.candidates.map(c => c.task_id)).toEqual(['t-a1'])
    expect(a.candidates[0]!.refs).toEqual(['FR-1'])
    expect(a.candidates[0]!.before).toEqual([])
    expect(a.unresolved.map(u => u.task_id)).toEqual(['t-a2'])
    expect(a.skipped.map(s => s.task_id).sort()).toEqual(['t-a3', 't-a4'])

    const archived = plan.requirements.find(p => p.requirement_id === REQ_ARCHIVED)!
    expect(archived.candidates).toHaveLength(0)
    expect(archived.skipped.some(s => s.why.includes('归档'))).toBe(true)

    expect(plan.totals).toMatchObject({ candidates: 1, unresolved: 1, applied: 0 })
    expect(h.queueRepo.writeSeqOf(REQ_A)).toBe(seqBefore) // dry-run 零写盘
  })
})

describe('回填器 · apply 与复核（FR-5）', () => {
  it('apply 后候选卡拿到引用，复核读数为 0；二次 apply 不再写', async () => {
    const h = seed()
    await h.seedSettled()
    await seedHistoricalCards(h)
    const plan = await planBackfill(h.deps)

    const applied = await applyBackfill(h.deps, plan)
    expect(applied.totals.applied).toBe(1)
    expect((await h.tasksOf(REQ_A)).find(t => t.id === 't-a1')!.requirementRefs).toEqual(['FR-1'])

    // 复核：没有"空引用且文档表有来源"的卡了
    expect((await checkBackfill(h.deps)).empty_with_doc_coverage).toBe(0)

    // 幂等：再算一次已经没有候选
    const second = await planBackfill(h.deps)
    expect(second.totals.candidates).toBe(0)
    const appliedAgain = await applyBackfill(h.deps, second)
    expect(appliedAgain.totals.applied).toBe(0)
  })

  it('refill 不覆写已有引用（丙卡保持原样）', async () => {
    const h = seed()
    await h.seedSettled()
    await seedHistoricalCards(h)
    await applyBackfill(h.deps, await planBackfill(h.deps))
    expect((await h.tasksOf(REQ_A)).find(t => t.id === 't-a3')!.requirementRefs).toEqual(['FR-1'])
  })
})

describe('回填器 · restore 有退路（FR-5）', () => {
  it('按报告里的 before 还原', async () => {
    const h = seed()
    await h.seedSettled()
    await seedHistoricalCards(h)
    const applied = await applyBackfill(h.deps, await planBackfill(h.deps))
    expect((await h.tasksOf(REQ_A)).find(t => t.id === 't-a1')!.requirementRefs).toEqual(['FR-1'])

    const { restored } = await restoreBackfill(h.deps, applied)
    expect(restored).toBe(1)
    expect((await h.tasksOf(REQ_A)).find(t => t.id === 't-a1')!.requirementRefs ?? []).toEqual([])
  })
})
