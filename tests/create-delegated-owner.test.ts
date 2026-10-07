/**
 * 代理立项（`reqboard_create` + `owner_window`，2026-10-06）——agent 受本窗口直接人工指令，
 * 替人把需求**登记到别的窗口名下**。
 *
 * ## 为什么要有这条通道
 * 现场实测（本仓自己的委派）：把 5 条工作面用 `reqboard_open_window` 派给 5 个新窗口后，
 * 那些窗口全靠人在每个窗口里手打一句「继续」才立得起来——**没被发话的那一个至今没有立项**
 * （它反而在没有台账的情况下落了 50 处改动）。根因是 `requireDirectHuman` 只认
 * `source.kind==='user'`，而自署底稿不是人类消息。本通道把「授权」落在**发话的那个窗口**
 * （人就在这里），由它替 agent 把需求直接登记到目标窗口名下——人只说一次话，N 条需求立起来。
 *
 * ## 五条判据
 *   ① 归属：`sourceSessionId == owner_window`（不再记在本窗口）；
 *   ② 如实留痕：`createdBy.kind === 'agent'`，评论写 `[代理立项]` 与「未经弹框逐问确认」——
 *      不能冒充"用户经弹框确认了三问"（那是无法证伪的谎）；
 *   ③ 推进：立项后到 `brainstorming`（draft 阶段 `autoExecute=false`，留着它等于派了没人动）；
 *   ④ 形态非法 → `REQBOARD_INVALID_INPUT`（不是窗口码）；
 *   ⑤ 目标窗口不在线 → `REQBOARD_OWNER_WINDOW_NOT_LIVE`（记到没人接手的窗口名下 = 静默停摆）；
 *      而**取不到在线判据**（`deps.agents` 未装配）时放行并如实记归属——无法证伪即放行。
 *   ⑥ 回归：不传 `owner_window` 时老行为**一字不变**（`createdBy.kind='human'`、`[会话捕获]`、留在 draft）。
 */
import { describe, it, expect } from 'vitest'
import { makeHarness } from './application/harness.js'
import { executeCreateRequirement } from '../src/application/use-cases/CreateRequirement.js'

const W = 'session-caller'
const TARGET = 'session-target-1'

function h(): ReturnType<typeof makeHarness> {
  const x = makeHarness({ requirements: [] })
  x.deps.ids = { requirement: () => 'REQ-261006999999-aaaa', task: () => 't-1', comment: () => 'c-1' } as never
  return x
}

async function create(x: ReturnType<typeof makeHarness>, args: unknown): Promise<Record<string, unknown>> {
  return await executeCreateRequirement(x.deps, args, { agent: { id: W } }) as Record<string, unknown>
}

function bodyOf(rec: { comments?: readonly { body: string }[] }): string {
  return (rec.comments ?? []).map((c) => c.body).join('\n')
}

describe('代理立项：把需求登记到别的窗口名下', () => {
  it('①②③ 归属换窗 + 台账如实记为 agent 代理 + 推进到需求阶段', async () => {
    const x = h()
    x.deps.agents = (() => ({ get: (id: string) => (id === TARGET ? {} : undefined) })) as never
    const out = await create(x, {
      title: '派给别的窗口的活',
      category: 'feature',
      prompt_difficulty: 'standard',
      summary: '由本窗口的人发话授权，agent 代为登记',
      reason: '人要求把这条工作面派给该窗口',
      owner_window: TARGET,
    })
    expect(out.success).toBe(true)
    expect(out.owner_window).toBe(TARGET)
    expect(out.status).toBe('brainstorming')      // ③ 推进过（draft 阶段不自动跑）
    const rec = (await x.store.get(String(out.requirement_id)))!
    expect(rec.sourceSessionId).toBe(TARGET)      // ① 不在本窗口名下
    expect((rec.createdBy as { kind?: string }).kind).toBe('agent')   // ② 如实
    const body = bodyOf(rec as never)
    expect(body).toContain('[代理立项]')
    expect(body).toContain('未经弹框逐问确认')
    expect(body).toContain(TARGET)
    expect(body).not.toContain('用户经五问弹框确认立项')   // 不许冒充人确认过三问
  })

  it('④ 不是窗口码 → REQBOARD_INVALID_INPUT（不静默当成本窗口）', async () => {
    const x = h()
    await expect(create(x, { title: 'x', category: 'feature', owner_window: '第二个窗口' }))
      .rejects.toThrow(/REQBOARD_INVALID_INPUT/)
  })

  it('⑤ 目标窗口不在线 → REQBOARD_OWNER_WINDOW_NOT_LIVE（不派给没人接手的窗口）', async () => {
    const x = h()
    x.deps.agents = (() => ({ get: () => undefined })) as never
    await expect(create(x, { title: 'x', category: 'feature', owner_window: 'session-dead-window' }))
      .rejects.toThrow(/REQBOARD_OWNER_WINDOW_NOT_LIVE/)
    // 拒绝发生在建档之前 ⇒ 台账零写入
    expect((await x.store.listSummaries({ scope: 'all', limit: 10 })).items).toHaveLength(0)
  })

  it('⑤b 取不到在线判据（deps.agents 未装配）→ 放行，并如实记下归属窗口', async () => {
    const x = h()
    const out = await create(x, { title: 'x', category: 'feature', owner_window: 'session-unknown-window' })
    expect(out.success).toBe(true)
    expect(out.owner_window).toBe('session-unknown-window')
  })

  it('⑥ 回归：不传 owner_window → 老行为一字不变（human 创建 / 会话捕获文案 / 留在 draft）', async () => {
    const x = h()
    const out = await create(x, { title: '老路径', category: 'feature', prompt_difficulty: 'standard' })
    expect(out.success).toBe(true)
    expect(out.owner_window).toBeUndefined()      // 缺省不新增键
    expect(out.status).toBe('draft')
    const rec = (await x.store.get(String(out.requirement_id)))!
    expect(rec.sourceSessionId).toBe(W)
    expect((rec.createdBy as { kind?: string }).kind).toBe('human')
    expect(bodyOf(rec as never)).toContain('[会话捕获]')
  })
})
