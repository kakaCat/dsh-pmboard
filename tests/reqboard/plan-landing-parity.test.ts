/**
 * L2 用例级单测 · 批准即落库的**唯一实现**（REQ-261002164800-d8f2 · t3 / serves: FR-1, FR-3, FR-6, FR-7）。
 *
 * 修前形态（实测 REQ-261002161439-277d 16:30:40）：计划里有一张**纯文档卡**（天然不接任何 FR）⇒
 * 批准路径的「每张卡都要有 FR 引用」硬门禁把**整批**拒掉 —— 0 张卡落库、需求停在拆分态。
 * 本文件锁住修复后的三件事：
 *   ① 11 张卡（其中 t7 无 FR）**全部落库**，不再整批拒绝；
 *   ② 缺引用的卡只被**点名**（unrefed=['t7'] + warning），其余卡从文档覆盖表拿到引用；
 *   ③ 返回体的覆盖度读数取自**真实任务记录**（covers_frs 非空且等于卡上 refs，修前恒空）。
 */
import { describe, it, expect } from 'vitest'
import { landApprovedPlan } from '../../src/application/internal/approved-plan-landing.js'
import type { PlanTask } from '../../src/shared/protocol.js'
import { makeHarness, req } from '../application/harness.js'

const REQ_ID = 'REQ-0000a1'
const WINDOW = 'session-w-001'

/** 需求文档：两条根编号（覆盖门禁要求「每条都有落点」）。 */
const REQUIREMENT_MD = [
  '# 需求',
  '',
  '- **FR-1: 甲条**：第一件事',
  '- **FR-2: 乙条**：第二件事',
  '',
].join('\n')

/** 计划文档的覆盖对照表：FR-1 接 t1..t6、FR-2 接 t8..t11；**t7 故意不写**（纯文档卡）。 */
const DECOMPOSITION_MD = [
  '# 拆分计划',
  '',
  '| 需求条款 | 条款内容 | 接收任务 |',
  '|---------|---------|---------|',
  '| FR-1 | 甲条 | t1、t2、t3、t4、t5、t6 |',
  '| FR-2 | 乙条 | t8、t9、t10、t11 |',
  '',
].join('\n')

/** 11 张卡：t7 是文档/维护卡（无人给它 FR），其余由覆盖表给出引用。 */
function planTasks(): PlanTask[] {
  return Array.from({ length: 11 }, (_, i) => {
    const key = 't' + (i + 1)
    return {
      key,
      title: key === 't7' ? '文档同步（无 FR 落点）' : '实现 ' + key,
      phase: 'implement' as const,
      side: 'backend' as const,
      dependsOn: key === 't1' ? [] : ['t1'],
      acceptance: 'npx vitest run 全绿',
      implementation: '改 src/domain/x.ts',
    }
  })
}

function seed() {
  const h = makeHarness()
  h.seedRequirementSync(req({
    id: REQ_ID,
    status: 'decomposing',
    category: 'feature',
    sourceSessionId: WINDOW,
    artifacts: [{
      stage: 'decomposing', kind: 'decomposition',
      path: 'docs/requirements/' + REQ_ID + '/decomposition.md',
      registeredAt: 1, registeredBy: { kind: 'agent', sessionId: WINDOW },
    } as never],
    plan: {
      path: 'docs/requirements/' + REQ_ID + '/decomposition.md',
      summary: '把活拆成 11 张卡',
      tasks: planTasks(),
      submittedAt: h.clock.t,
      submittedBy: { kind: 'agent', sessionId: WINDOW },
      approvedAt: h.clock.t,
      approvedBy: { kind: 'human', sessionId: WINDOW },
    },
  }))
  h.docs.put('docs/requirements/' + REQ_ID + '/requirement.md', REQUIREMENT_MD)
  h.docs.put('docs/requirements/' + REQ_ID + '/decomposition.md', DECOMPOSITION_MD)
  return h
}

describe('批准即落库 · 无落点卡不再拖垮整批（FR-1 / FR-6）', () => {
  it('11 张卡全部落库，含 1 张无 FR 的文档卡', async () => {
    const h = seed()
    await h.seedSettled()
    const out = await landApprovedPlan(h.deps, {
      requirementId: REQ_ID, windowKey: WINDOW, nowTs: h.clock.t, source: 'confirm',
    })
    expect(out.createdCount).toBe(11) // 修前：0（抛 REQBOARD_PLAN_REFS_MISSING）
    expect(await h.tasksOf(REQ_ID)).toHaveLength(11)
    expect(out.alreadyLanded).toBe(0)
  })

  it('无落点的卡被点名（unrefed + warning），不是静默落库', async () => {
    const h = seed()
    await h.seedSettled()
    const out = await landApprovedPlan(h.deps, {
      requirementId: REQ_ID, windowKey: WINDOW, nowTs: h.clock.t, source: 'confirm',
    })
    expect(out.unrefed).toEqual(['t7'])
    expect(out.warning).toContain('t7')
    expect(out.warning).toContain('没有需求条款落点')
  })

  it('幂等：再落一次不造幽灵卡，如实报 alreadyLanded', async () => {
    const h = seed()
    await h.seedSettled()
    await landApprovedPlan(h.deps, { requirementId: REQ_ID, windowKey: WINDOW, nowTs: h.clock.t, source: 'confirm' })
    const again = await landApprovedPlan(h.deps, { requirementId: REQ_ID, windowKey: WINDOW, nowTs: h.clock.t, source: 'confirm' })
    expect(again.createdCount).toBe(0)
    expect(again.alreadyLanded).toBe(11)
  })
})

describe('批准即落库 · 引用来自文档覆盖表（FR-3）', () => {
  it('文档表写过的 key 都拿到引用，没写的保持为空', async () => {
    const h = seed()
    await h.seedSettled()
    await landApprovedPlan(h.deps, { requirementId: REQ_ID, windowKey: WINDOW, nowTs: h.clock.t, source: 'confirm' })
    const tasks = await h.tasksOf(REQ_ID)
    const refsByTitle = new Map(tasks.map(t => [t.title, t.requirementRefs ?? []]))
    expect(refsByTitle.get('实现 t1')).toEqual(['FR-1'])
    expect(refsByTitle.get('实现 t6')).toEqual(['FR-1'])
    expect(refsByTitle.get('实现 t8')).toEqual(['FR-2'])
    expect(refsByTitle.get('实现 t11')).toEqual(['FR-2'])
    expect(refsByTitle.get('文档同步（无 FR 落点）')).toEqual([])
  })

  it('来源可观测：文档兜底记 doc，没来源记 none', async () => {
    const h = seed()
    await h.seedSettled()
    const out = await landApprovedPlan(h.deps, {
      requirementId: REQ_ID, windowKey: WINDOW, nowTs: h.clock.t, source: 'confirm',
    })
    expect(out.sources.get('t1')).toBe('doc')
    expect(out.sources.get('t7')).toBe('none')
  })
})

describe('批准即落库 · 覆盖度读数取自真实记录（FR-7）', () => {
  it('task_coverage 的 covers_frs 非空且等于卡上 refs（修前：恒空数组）', async () => {
    const h = seed()
    await h.seedSettled()
    const out = await landApprovedPlan(h.deps, {
      requirementId: REQ_ID, windowKey: WINDOW, nowTs: h.clock.t, source: 'confirm',
    })
    const tasks = await h.tasksOf(REQ_ID)
    const ids = new Set(tasks.map(t => t.id))
    expect(out.rtm).toBeDefined()
    const rows = out.rtm!.task_coverage.filter(r => ids.has(r.task_id))
    expect(rows).toHaveLength(11)
    const t1 = tasks.find(t => t.title === '实现 t1')!
    const row = rows.find(r => r.task_id === t1.id)!
    expect(row.covers_frs).toEqual(t1.requirementRefs)
    expect(row.covers_frs.length).toBeGreaterThan(0)
  })
})

describe('批准即落库 · 硬门仍在（每个 FR 必须有落点）', () => {
  it('需求里有 FR 没人接 → 抛覆盖缺口，一张卡都不落', async () => {
    const h = seed()
    await h.seedSettled()
    // 覆盖表只写 FR-1 → FR-2 无人接收（硬门仍在，不因"卡级放行"而松）
    h.docs.put('docs/requirements/' + REQ_ID + '/decomposition.md', [
      '| 需求条款 | 条款内容 | 接收任务 |',
      '|---------|---------|---------|',
      '| FR-1 | 甲条 | t1 |',
      '',
    ].join('\n'))
    await expect(landApprovedPlan(h.deps, {
      requirementId: REQ_ID, windowKey: WINDOW, nowTs: h.clock.t, source: 'confirm',
    })).rejects.toThrow(/FR-2/)
    expect(await h.tasksOf(REQ_ID)).toHaveLength(0)
  })
})
