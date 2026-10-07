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
import { planDependencyWarnings, docDependencyRefs, zeroOverlapDependencyWarnings } from '../src/application/internal/plan-deps-check.js'
import { submitPlanArtifact } from '../src/application/use-cases/SubmitArtifact.js'
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
  // requirement_refs 显式写在卡上（2026-10-06 收敛：覆盖门禁只认卡上 refs，文档覆盖对照表不再是依据）
  return [
    { key: 't1', title: '第一张', phase: 'implement', side: 'backend', dependsOn: [], acceptance: 'npx vitest run a 通过', implementation: '改 a', requirement_refs: ['FR-1'] },
    { key: 't2', title: '第二张', phase: 'implement', side: 'backend', dependsOn: ['t1'], acceptance: 'npx vitest run b 通过', implementation: '改 b', requirement_refs: ['FR-1'] },
    { key: 't3', title: '第三张', phase: 'implement', side: 'backend', dependsOn: ['t2'], acceptance: 'npx vitest run c 通过', implementation: '改 c', requirement_refs: ['FR-2'] },
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

describe('FR-3 ③ 零交集依赖边：没写理由 → 点名建议；写了理由 → 放行（2026-10-06 缺口 4 之三）', () => {
  /** 上游 t2 改队列文件、下游 t4 改 API 文件——**零交集**，可能就是伪依赖（本可并行却被串成链）。 */
  const zeroOverlap: PlanTask[] = [
    { key: 't2', title: '重建队列文件', implementation: '改 packages/queue/src/store.ts' } as PlanTask,
    { key: 't4', title: '读队列', dependsOn: ['t2'], implementation: '改 packages/api/src/read.ts' } as PlanTask,
  ]

  it('零交集且无 dep_reasons → 逐边点名（含两端各自声明的文件与修复示例）', () => {
    const w = zeroOverlapDependencyWarnings(zeroOverlap)
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('t4 → t2')
    expect(w[0]).toContain('零交集')
    expect(w[0]).toContain('疑似伪依赖')
    expect(w[0]).toContain('packages/api/src/read.ts')
    expect(w[0]).toContain('dep_reasons')
  })

  it('写了语义理由 → 不点名（凭据 = 作者已复核过这条边）', () => {
    const withReason = zeroOverlap.map(t => t.key === 't4'
      ? { ...t, dep_reasons: { t2: 't2 重建队列文件，t4 读它，虽无同名文件但有时序约束' } }
      : t)
    expect(zeroOverlapDependencyWarnings(withReason)).toEqual([])
  })

  it('两端有交集 → 这条边在文件面上站得住；一端没声明路径 → 没依据不误报（诚实边界）', () => {
    const overlap: PlanTask[] = [
      { key: 't2', title: '上游', implementation: '改 packages/queue/src/store.ts' } as PlanTask,
      { key: 't4', title: '下游', dependsOn: ['t2'], implementation: '改 packages/queue/src/store.ts 的另一处' } as PlanTask,
    ]
    expect(zeroOverlapDependencyWarnings(overlap)).toEqual([])
    const noPath: PlanTask[] = [
      { key: 't2', title: '上游', implementation: '重命名一个符号' } as PlanTask,
      { key: 't4', title: '下游', dependsOn: ['t2'], implementation: '改 packages/api/src/read.ts' } as PlanTask,
    ]
    expect(zeroOverlapDependencyWarnings(noPath)).toEqual([])
  })

  // REQ-261007095750-9f48 FR-2：口径扩根前，含 src 的 implementation 抽不出任何路径 ⇒
  // 零交集建议对这条边"看都不看"（沉默 ≠ 通过）。本条的可证伪点：去掉 PATH_RE 的 src 根后必须红。
  it('src 落点同样参与零交集判定：src↔src 零交集 → 点名；src 有交集 → 不点名', () => {
    const srcZero: PlanTask[] = [
      { key: 't8', title: '改冲突门', implementation: '改 src/application/internal/conflict-check.ts' } as PlanTask,
      { key: 't9', title: '改容量门', dependsOn: ['t8'], implementation: '改 src/domain/task/Footprint.ts' } as PlanTask,
    ]
    const w = zeroOverlapDependencyWarnings(srcZero)
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('t9 → t8')
    expect(w[0]).toContain('src/domain/task/Footprint.ts')
    const srcOverlap: PlanTask[] = [
      { key: 't8', title: '改冲突门', implementation: '改 src/application/internal/conflict-check.ts' } as PlanTask,
      { key: 't9', title: '也改冲突门', dependsOn: ['t8'], implementation: '改 src/application/internal/conflict-check.ts 的另一处' } as PlanTask,
    ]
    expect(zeroOverlapDependencyWarnings(srcOverlap)).toEqual([])
  })

  it('接线：submitPlanArtifact 把同一条点名放进既有的 dependency_warnings 键（不新开键）', async () => {
    const h = makeHarness()
    h.seedRequirementSync(req({ id: REQ_ID, status: 'decomposing', category: 'feature', sourceSessionId: WINDOW }))
    await h.seedSettled()
    const path = 'docs/requirements/' + REQ_ID + '/plan.md'
    h.docs.put(path, [
      '# 拆分计划（夹具）',
      '',
      '| 计划 key | 标题 | 依赖 | 工作量 | 验收标准 |',
      '|---|---|---|---|---|',
      '| t2 | 重建队列文件 | — | M | 跑 npx vitest run 全绿 |',
      '| t4 | 读队列 | t2 | M | 跑 npx vitest run 全绿 |',
      '',
    ].join('\n'))
    const tasks = [
      { key: 't2', title: '重建队列文件', phase: 'implement', side: 'backend', acceptance: '跑 npx vitest run 全绿', implementation: '改 packages/queue/src/store.ts' },
      { key: 't4', title: '读队列', phase: 'implement', side: 'backend', depends_on: ['t2'], acceptance: '跑 npx vitest run 全绿', implementation: '改 packages/api/src/read.ts' },
    ]
    const out1 = await submitPlanArtifact(h.deps, { path, summary: '零交集边', tasks }, { agent: { id: WINDOW } }) as { dependency_warnings?: string[] }
    expect(out1.dependency_warnings?.[0]).toContain('零交集')

    // 补一句语义理由重交 → 同一条边不再点名（其余键位不变）
    const withReason = tasks.map(t => t.key === 't4'
      ? { ...t, dep_reasons: ['t2=上游重建队列文件，本卡读它，虽无同名文件但有时序约束'] }
      : t)
    const out2 = await submitPlanArtifact(h.deps, { path, summary: '零交集边（已给理由）', tasks: withReason }, { agent: { id: WINDOW } }) as { dependency_warnings?: string[] }
    expect(out2.dependency_warnings).toBeUndefined()
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
