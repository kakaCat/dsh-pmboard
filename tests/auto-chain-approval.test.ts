/**
 * 批准计划后的零点击主链测试（REQ-4842fe t10 / design/test-cases.md §4.1/4.2/7.1）。
 *
 * 口径：批准计划（唯一人工动作）之后**不再调用任何人工工具**，需求应一路自动推进到
 * accepting；全程不出现「确认拆分清单」弹框；批准弹框文案含自动开跑说明。
 */
import { describe, it, expect } from 'vitest'
import { askConfirm } from '../src/application/use-cases/AskConfirm.js'
import { DEFAULT_CONFIRM_OPTIONS } from '../src/domain/text/labels.js'
import { pmHeader } from '../src/domain/text/pm-badge.js'
import type { JobStartSpec, WorkflowRunner, WorkflowRunOutcome } from '../src/application/ports.js'
import { makeHarness, req } from './application/harness.js'

const FILE = 'src/domain/x.ts'
const exec = { agent: { id: 'session-w-001' } }
/** 延迟 jobs 夹具捕获的投递参数（每次 seed() 清空）。 */
const dispatched: JobStartSpec[] = []

class OkRunner implements WorkflowRunner {
  async start(_i: unknown): Promise<WorkflowRunOutcome> {
    return { ok: true, value: { ok: true, output: JSON.stringify({ filesChanged: [FILE], completed: ['子卡完成'] }) } }
  }
}

function seed() {
  const h = makeHarness()
  h.docs.put(FILE, 'x')
  h.seedRequirementSync(req({
    id: 'REQ-000001',
    // 2026-09-21 阶段门裁定（w-2105d331 代录）：拆分计划归 decomposing，批准门在 decomposing→implementing
    status: 'decomposing',
    category: 'feature',
    sourceSessionId: 'session-w-001',
    // 拆分计划产物（真实流程中由 reqboard_submit(kind=plan) 登记，批准门落章它）
    artifacts: [{
      stage: 'decomposing', kind: 'decomposition',
      path: 'docs/requirements/REQ-000001/decomposition.md',
      registeredAt: 1, registeredBy: { kind: 'agent', sessionId: 'session-w-001' },
    } as never],
    plan: {
      path: 'docs/requirements/REQ-000001/decomposition.md',
      summary: '把长任务拆短',
      tasks: [{
        key: 't1', title: '实现子卡层', phase: 'implement', side: 'backend', dependsOn: [],
        acceptance: '跑 pnpm vitest 看到全绿', implementation: '改 src/domain/x.ts 与 packages/x/src/y.ts',
      }],
      submittedAt: h.clock.t,
      submittedBy: { kind: 'agent', sessionId: 'session-w-001' },
    },
  }))
  // 任务不 seed（v9 / B-5）："此刻没有任务"= 没有队列文件，由各用例显式断言（不静默省略）。
  h.deps.workflow = new OkRunner()
  // BUG-4 改法①（design/fix-design.md「BUG-4」第 1 行）：给 seed() 加**延迟 jobs 夹具**——
  // `start` 捕获 spec 不跑（模式见 concurrency-matrix.test.ts:90 / advance-dispatch-owner.test.ts:21）。
  // 定性：**有意前移**——批准**同一调用内**已 `advanceRequirement()` 并经 `deps.jobs.start` 投递；
  // 夹具缺 jobs 时会落到「无后台任务端口」的同步兼容路径，把整条链跑在批准那一次调用里（这正是本用例
  // 原期望 `implementing` 却实得 `accepting` 的来路）。延迟夹具把「链何时开跑」这一跳留在测试手里。
  dispatched.length = 0
  h.deps.jobs = {
    available: () => true,
    get: async () => null,
    start: async (spec: JobStartSpec) => { dispatched.push(spec); return 'job-' + dispatched.length },
  }
  h.questions.answers = [{ selected: [DEFAULT_CONFIRM_OPTIONS[0] as string] }]
  return h
}

describe('批准计划 → 自动拆分并跑完链到 accepting（4.1 / 4.2 / 7.1）', () => {
  /**
   * 触发者口径（BUG-4 设计节第 1 行；定性：**有意前移**）：
   * 批准计划这一跳**已在同一调用内**带上链启动者 —— `confirm-settle.ts` 落库成功后置 `req.autoRun = true`，
   * 紧接着 `await advanceRequirement(deps, …)`；生产（宿主 `ctx.jobs` 在位）走 `deps.jobs.start` **异步投递**。
   *
   * 本用例据此把 jobs 端口做成**延迟执行**（见 `seed()`）：批准调用返回时=落库 + `implementing` + `autoRun=true`，
   * 投递的那份 spec 已被捕获；手跑 `spec.run()` 等价于生产后台 job 真正开跑 → 链自己跑到 `accepting`。
   * 「谁触发」不再是测试外部模拟的未知触发者，而是**真实投递路径**；其余断言（无人再点任何人工工具即跑到
   * accepting、子卡链全 done、父卡 done、弹框只出现一次）**一条不放宽**。
   */
  it('批准后自动拆分类跑完 → 需求 accepting（v9：触发者由外部模拟，生产为看板继续/会话唤醒）', async () => {
    const h = seed()
    await h.seedSettled()
    const out = await askConfirm(h.deps, {
      requirement_id: 'REQ-000001', target: 'plan', question: '批准拆分计划进入拆分？',
    }, exec) as { confirmed?: boolean; note?: string }

    expect(out.confirmed).toBe(true)
    const afterApprove = (await h.store.get('REQ-000001'))!
    expect(afterApprove.status).toBe('implementing')   // 批准本身的终态（落库 + 进实施 + autoRun）
    expect(afterApprove.autoRun).toBe(true)

    // 触发者 = 批准调用内经 `deps.jobs.start` 投递的后台 job（本夹具延迟执行，spec 已捕获）。
    // 此后**不再调用任何人工工具**，链应自己跑到 accepting。
    expect(dispatched).toHaveLength(1)
    await dispatched[0]!.run(new AbortController().signal)

    const requirement = (await h.store.get('REQ-000001'))!
    expect(requirement.status).toBe('accepting')

    // 拆分落库：父卡 + 子卡（feature = dev→integrate→review→test）
    const justTasks = await h.tasksOf('REQ-000001')
    const parents = justTasks.filter(t => t.parentId === undefined)
    expect(parents).toHaveLength(1)
    const subs = justTasks.filter(t => t.parentId === parents[0]!.id)
    expect(subs.map(s => s.stageKind)).toEqual(['dev', 'integrate', 'review', 'test'])
    expect(subs.every(s => s.status === 'done')).toBe(true)
    expect(parents[0]!.status).toBe('done')
  })

  it('批准弹框文案含「自动拆分并立即开跑」说明（7.1）', async () => {
    const h = seed()
    await h.seedSettled()
    await askConfirm(h.deps, { requirement_id: 'REQ-000001', target: 'plan', question: '批准拆分计划进入拆分？' }, exec)
    const asked = h.questions.asked[0]!
    expect(asked.question).toContain('自动拆分')
    expect(asked.question).toContain('立即开跑')
  })

  it('4.2 全程不出现「确认拆分清单」弹框（只有一次批准弹框）', async () => {
    const h = seed()
    await h.seedSettled()
    await askConfirm(h.deps, { requirement_id: 'REQ-000001', target: 'plan', question: '批准拆分计划进入拆分？' }, exec)
    expect(h.questions.asked).toHaveLength(1)
    expect(h.questions.asked[0]!.header).toBe(pmHeader('确认'))
  })

  it('decomposition 产物由批准门自动落章（门合并留痕）', async () => {
    const h = seed()
    await h.seedSettled()
    await askConfirm(h.deps, { requirement_id: 'REQ-000001', target: 'plan', question: '批准？' }, exec)
    const art = ((await h.store.get('REQ-000001'))!.artifacts ?? []).find(a => a.kind === 'decomposition')
    expect(art?.confirmedAt).toBeDefined()
    expect((await h.store.get('REQ-000001'))!.comments.some(c => c.body.includes('门合并'))).toBe(true)
  })
})


describe('REQ-84bea5：断链修复回归测试', () => {
  it('①修复验证：RTM 覆盖（FR-1）+ plan.tasks 无 refs → 批准成功（双源合并生效）', async () => {
    const h = makeHarness()
    h.clock.t = 1000
    
    // 设置 requirement.md（含 FR-1）
    h.docs.put('docs/requirements/REQ-000002/requirement.md', `## 功能需求\n\n- **FR-1** 需求条款\n`)
    
    // 设置 decomposition.md（RTM 表覆盖 FR-1）
    h.docs.put('docs/requirements/REQ-000002/decomposition.md', `
## 拆分计划

| 任务编号 | 任务标题 | 根编号 |
|---------|---------|-------|
| t1      | 实现    | FR-1  |
`)
    
    h.seedRequirementSync(req({
      id: 'REQ-000002',
      status: 'decomposing',
      artifacts: [
        {
          stage: 'decomposing', kind: 'requirement',
          path: 'docs/requirements/REQ-000002/requirement.md',
          registeredAt: 1, registeredBy: { kind: 'agent', sessionId: 'session-w-001' },
          confirmedAt: 1, confirmedBy: { kind: 'human', sessionId: 'session-w-001' },
        } as never,
        {
          stage: 'decomposing', kind: 'decomposition',
          path: 'docs/requirements/REQ-000002/decomposition.md',
          registeredAt: 1, registeredBy: { kind: 'agent', sessionId: 'session-w-001' },
        } as never
      ],
      plan: {
        path: 'docs/requirements/REQ-000002/decomposition.md',
        summary: '测试双源合并',
        tasks: [{
          key: 't1', title: '实现', phase: 'implement', side: 'backend', dependsOn: [],
          acceptance: '编译通过', implementation: '改代码',
          // 关键：plan.tasks 不含 requirement_refs，只有 RTM 覆盖
        }],
        submittedAt: h.clock.t,
        submittedBy: { kind: 'agent', sessionId: 'session-w-001' },
      },
    }))
    await h.seedSettled()
    // 任务不 seed（v9 / B-5）：本用例要证明的是"从无任务开始批准也能落库"，由下方断言保证。
    expect(h.queueExists('REQ-000002')).toBe(false)
    h.deps.workflow = new OkRunner()
    h.questions.answers = [{ selected: [DEFAULT_CONFIRM_OPTIONS[0] as string] }]
    
    const out = await askConfirm(h.deps, {
      requirement_id: 'REQ-000002', target: 'plan', question: '批准？',
    }, exec) as { confirmed?: boolean; gate_failure?: unknown }
    
    // 断言：批准成功（覆盖门禁通过，证明双源合并生效）
    // 核心验证：plan.tasks 无 refs，但 RTM 有覆盖 → 门禁通过
    expect(out.confirmed).toBe(true)
    expect(out.gate_failure).toBeUndefined()
    
    // 注：完整的自动推进链（implementing + autoRun）需要更复杂的 workflow 设置
    // 本测试只验证覆盖门禁双源合并的核心修复
  })
  
  it('③验收文档门禁：无 plan.md、有 decomposition.md → passed=true', async () => {
    const { checkDocCompleteness } = await import('../src/domain/workflow/DocCompleteness.js')
    
    const result = checkDocCompleteness({
      files: new Set([
        'requirement.md',
        'decomposition.md',
        'design/architecture.md',
        'design/data-model.md',
        'design/interfaces.md',
        'design/test-cases.md',
        'reviews/review-1.md',
        'tests/test-1.test.ts',
        'tasks/t-001.md',
      ]),
      taskIds: ['t-001'],
    })
    
    // 断言：验收通过（plan.md 已从必填清单删除）
    expect(result.passed).toBe(true)
    expect(result.missing).toEqual([])
  })
})

