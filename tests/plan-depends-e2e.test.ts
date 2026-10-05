/**
 * 依赖链端到端 + doc↔tasks 一致性警告 + 构建指纹（REQ-261003222428-3556 FR-3 / t3）。
 *
 * 背景（定性修正后）：「depends_on 落库丢失」真相是 agent 两次漏传字段（2026-10-03 实锤），
 * 链路本身是对的。本文件锁三件事：
 *  ① 带 depends_on 批准落库 → 父卡 dependsOn **逐环成链且为真实任务 id**（防未来真回归）；
 *  ② 文档依赖表声明了依赖而 tasks 数组全空 → 提交侧点名警告（漏传防线，不拒）；
 *  ③ status 回执带 plugin_build（陈旧构建可见化），且工具 schema 已声明（三方同源纪律）。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { landApprovedPlan } from '../src/application/internal/approved-plan-landing.js'
import { planDependencyWarnings, docDependencyRefs } from '../src/application/internal/plan-deps-check.js'
import { setBuildStamp, getBuildStamp } from '../src/shared/build-stamp.js'
import { queryState } from '../src/application/query/QueryState.js'
import { defineStatusTool } from '../src/tools/index.js'
import type { PlanTask } from '../src/shared/protocol.js'
import { makeHarness, req } from './application/harness.js'

const REQ_ID = 'REQ-0000d3'
const WINDOW = 'session-w-d3'

const REQUIREMENT_MD = [
  '# 需求',
  '',
  '- **FR-1: 甲条**：第一件事',
  '- **FR-2: 乙条**：第二件事',
  '',
].join('\n')

const DECOMPOSITION_MD = [
  '# 拆分计划',
  '',
  '| 需求条款 | 条款内容 | 接收任务 |',
  '|---------|---------|---------|',
  '| FR-1 | 甲条 | t1、t2 |',
  '| FR-2 | 乙条 | t3 |',
  '',
].join('\n')

/** t1 → t2 → t3 链式依赖（与「漏传」形态相反：这次真的带了）。 */
function chainTasks(): PlanTask[] {
  return [
    { key: 't1', title: '第一张', phase: 'implement', side: 'backend', dependsOn: [], acceptance: 'npx vitest run a 通过', implementation: '改 a' },
    { key: 't2', title: '第二张', phase: 'implement', side: 'backend', dependsOn: ['t1'], acceptance: 'npx vitest run b 通过', implementation: '改 b' },
    { key: 't3', title: '第三张', phase: 'implement', side: 'backend', dependsOn: ['t2'], acceptance: 'npx vitest run c 通过', implementation: '改 c' },
  ]
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
      summary: '三张链式卡',
      tasks: chainTasks(),
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

describe('FR-3 ① 带 depends_on 批准落库 → 父卡依赖逐环成链（真实 id）', () => {
  it('t1→t2→t3 落库后 dependsOn 逐环引用前一张的真实 id', async () => {
    const h = seed()
    await h.seedSettled()
    const out = await landApprovedPlan(h.deps, {
      requirementId: REQ_ID, windowKey: WINDOW, nowTs: h.clock.t, source: 'confirm',
    })
    expect(out.createdCount).toBe(3)

    const tasks = await h.taskStore.listByRequirement(REQ_ID)
    const parents = tasks.filter((t) => t.parentId === undefined)
    expect(parents).toHaveLength(3)
    const byTitle = new Map(parents.map((p) => [p.title, p]))
    const p1 = byTitle.get('第一张')!
    const p2 = byTitle.get('第二张')!
    const p3 = byTitle.get('第三张')!
    // 逐环成链：p1 无依赖；p2 依赖 p1 的真实 id；p3 依赖 p2 的真实 id（不是计划 key 字面量）
    expect(p1.dependsOn).toEqual([])
    expect(p2.dependsOn).toEqual([p1.id])
    expect(p3.dependsOn).toEqual([p2.id])
    expect(p2.dependsOn[0]).toMatch(/^t-/)
    expect(p3.dependsOn[0]).toMatch(/^t-/)
  })
})

describe('FR-3 ② doc↔tasks 依赖一致性警告（漏传防线）', () => {
  const DOC = [
    '# 拆分计划',
    '',
    '| key | 标题 | phase | side | depends_on |',
    '|-----|------|-------|------|-----------|',
    '| t1 | 第一张 | implement | backend | - |',
    '| t2 | 第二张 | implement | backend | t1 |',
    '',
  ].join('\n')

  it('文档依赖表声明 t2→t1 而 tasks 数组全空 → 点名 t2（漏传形态，正是 2026-10-03 事故）', () => {
    const tasks: PlanTask[] = [
      { key: 't1', title: '第一张', dependsOn: [] } as PlanTask,
      { key: 't2', title: '第二张', dependsOn: [] } as PlanTask,
    ]
    const warnings = planDependencyWarnings(DOC, tasks)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('t2')
    expect(warnings[0]).toContain('t1')
  })

  it('数组带了依赖 → 无警告；文档无依赖声明 → 无警告（不误报）', () => {
    const withDeps: PlanTask[] = [
      { key: 't1', title: '第一张', dependsOn: [] } as PlanTask,
      { key: 't2', title: '第二张', dependsOn: ['t1'] } as PlanTask,
    ]
    expect(planDependencyWarnings(DOC, withDeps)).toEqual([])
    expect(planDependencyWarnings('# 无表格文档', withDeps)).toEqual([])
    // 提取器本身：分隔行/表头不误判
    const refs = docDependencyRefs(DOC, new Set(['t1', 't2']))
    expect(refs.get('t2')).toEqual(['t1'])
    expect(refs.has('t1')).toBe(false)
  })
})

describe('FR-3 ③ 构建指纹进 status 回执（schema 先声明）', () => {
  afterEach(() => { setBuildStamp('') })

  it('盖章后 queryState 回执含 plugin_build；StatusTool 输出 schema 已声明该键', async () => {
    setBuildStamp('abc123def456')
    expect(getBuildStamp()).toBe('abc123def456')

    const h = makeHarness()
    await h.seedSettled()
    const out = await queryState(h.deps, {}, { agent: { id: 'session-d3' } }) as Record<string, unknown>
    expect(out.plugin_build).toBe('abc123def456')

    // schema 三方同源：声明键里必须有 plugin_build（漏声明 = 下次漂移）
    const tool = defineStatusTool({} as never) as unknown as {
      output: { schema: { properties: Record<string, unknown> } }
    }
    expect(Object.keys(tool.output.schema.properties)).toContain('plugin_build')
  })
})
