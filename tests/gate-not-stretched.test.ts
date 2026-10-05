/**
 * 红线断言：人工门**没有被这次改造放宽**（REQ-261003215944-9e04 FR-5/FR-6 · t7）。
 *
 * 【为什么要有这道门】
 * 本需求的名字里带着「agent 自主立项」「agent 自主拆分」——但只要动手的人一松手，
 * "自主"就会从"agent 把文书备好"滑成"agent 替人拍板"。这两条断言就是那道防滑栏：
 *
 *   ① **G0（立项门）**：没有真实人工回合时，`reqboard_capture` 仍然拒绝
 *      （`REQBOARD_DIRECT_HUMAN_REQUIRED`）——开新窗口、handoff、second 都不改变这一点；
 *   ② **G3（计划批准门）**：计划未获批准时，`reqboard_decompose` 仍然拒绝
 *      （`REQBOARD_PLAN_NOT_APPROVED`）——agent 可以把计划写好，但不能自己批。
 *
 * 两条都**反向**可证伪：先证明"该拒的时候确实拒"，再证明"该过的时候能过"，
 * 免得断言退化成"反正都拒"。
 */
import { describe, it, expect } from 'vitest'
import { makeHarness, req } from './application/harness.js'
import { captureRequirement } from '../src/application/use-cases/CaptureRequirement.js'
import { executeDecompose } from '../src/application/use-cases/Decompose.js'
import { SessionProbeAdapter } from '../src/adapters/SessionProbeAdapter.js'

const W = 'session-redline'
const REQ_ID = 'REQ-261003215944-9e04'

/**
 * 造一个"活体顶层 agent" + 对应探针。
 *
 * 关键细节：`requireLiveDriver` 用**对象同一性**判定（agents.get(id) === exec.agent），
 * 所以 exec 里必须传**同一个对象**——传 `{ id: W }` 这种新字面量会被判成"不在线"，
 * 于是断言会跑偏成 DRIVER_REQUIRED（这条踩过，留注释省得后人再踩）。
 */
function liveAgent(opts: { withHuman: boolean }) {
  const event = { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '做这个' }] } }
  const agent = {
    id: W,
    status: 'running',
    session: { snapshotEvents: () => (opts.withHuman ? [undefined, event] : []) },
  }
  const probe = new SessionProbeAdapter({
    agents: () => ({ get: () => agent, currentInitiator: () => agent, roots: () => [agent] }),
    sessionProjections: () => ({ stateOf: () => ({ openTurnStartSeq: 0 }) }),
    now: () => 1000,
  })
  return { agent, probe, exec: { agent } }
}

function harness(probe: SessionProbeAdapter, diveOver: Record<string, unknown> = {}) {
  const h = makeHarness({
    requirements: [req({
      id: REQ_ID, status: 'decomposing', category: 'feature', sourceSessionId: W,
      dive: { phase: 'active', activation: 'armed', roundsInStage: 0, ...diveOver } as never,
    })],
  })
  h.deps.session = probe
  h.deps.rejections = { record: () => undefined, readAll: async () => [] } as never
  return h
}

describe('① G0 立项门：自主回合不许立项（开新窗口也不行）', () => {
  it('无人工回合 → reqboard_capture 仍以 REQBOARD_DIRECT_HUMAN_REQUIRED 拒绝', async () => {
    const { probe, exec } = liveAgent({ withHuman: false })
    const h = harness(probe)
    await expect(captureRequirement(h.deps, {}, exec))
      .rejects.toMatchObject({ code: 'REQBOARD_DIRECT_HUMAN_REQUIRED' })
    // 而且**连弹框都没发生**：拒绝在弹框之前
    expect((await h.store.listSummaries({ scope: 'all', limit: 10 })).items).toHaveLength(1)
  })

  it('反向：本次确有直接人工回合 → 该门放行（证明上面不是"反正都拒"）', async () => {
    const { probe, exec } = liveAgent({ withHuman: true })
    const h = harness(probe)
    const { FakeQuestions } = await import('./application/harness.js')
    const q = new FakeQuestions()
    q.answers = [
      { id: 'name', selected: ['人被问了所以能立项'] },
      { id: 'category', selected: ['feature'] },
      { id: 'difficulty', selected: ['standard'] },
      { id: 'doc_location', selected: ['docs/requirements/<REQ>/'] },
    ] as never
    h.deps.questions = q
    const out = await captureRequirement(h.deps, {}, exec) as { success?: boolean }
    expect(out.success).toBe(true)
  })
})

describe('② G3 计划批准门：计划没批不许拆分', () => {
  it('计划未批准 → reqboard_decompose 以 REQBOARD_PLAN_NOT_APPROVED 拒绝', async () => {
    const { probe, exec } = liveAgent({ withHuman: true })
    // 注意：Dive armed 时拆分会被另一道守卫先拦（REQBOARD_DIVE_ARMED），
    // 故这里用人已解锁的形态（disarmed+idle），让断言落在**计划批准门**上。
    const h = harness(probe, { activation: 'disarmed', phase: 'idle' })
    // 拆分阶段、有方案但**没有 approvedAt**（agent 自己写的计划不算批）
    await h.store.mutate(REQ_ID, (draft) => {
      ;(draft as { plan?: unknown }).plan = {
        path: 'docs/requirements/' + REQ_ID + '/decomposition.md',
        summary: 'agent 起草的计划',
        submittedAt: 1,
        tasks: [{ key: 't1', title: '任务一', implementation: 'x', acceptance: 'y' }],
      }
      return { changed: true }
    }).catch(() => undefined)
    await expect(executeDecompose(h.deps, {}, exec))
      .rejects.toMatchObject({ code: 'REQBOARD_PLAN_NOT_APPROVED' })
  })

  it('反向：计划已批准（approvedAt 有人盖章）→ 该门不再以 PLAN_NOT_APPROVED 拒绝', async () => {
    const { probe, exec } = liveAgent({ withHuman: true })
    const h = harness(probe, { activation: 'disarmed', phase: 'idle' })
    await h.store.mutate(REQ_ID, (draft) => {
      ;(draft as { plan?: unknown }).plan = {
        path: 'docs/requirements/' + REQ_ID + '/decomposition.md',
        summary: '人批过的计划',
        submittedAt: 1,
        approvedAt: 2,
        tasks: [{ key: 't1', title: '任务一', implementation: 'x', acceptance: 'y' }],
      }
      return { changed: true }
    }).catch(() => undefined)
    // 不再因"未批准"被拒（可能因其它原因失败，但不能是这个码）
    await executeDecompose(h.deps, {}, exec).then(
      () => undefined,
      (err: { code?: string }) => expect(err.code).not.toBe('REQBOARD_PLAN_NOT_APPROVED'),
    )
  })
})
