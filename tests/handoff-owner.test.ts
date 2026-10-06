/**
 * 交接写原子化（REQ-261004150249-731e FR-2 / design/test-cases.md 用例矩阵 FR-2 四问）。
 *
 * 钉四件事：
 *  ① 一次交接把三处一起改对：seats（新窗 owner / 旧窗 observer）+ sourceSessionId + 留痕评论；
 *  ② 无 seats 的存量记录被**物化**成显式两条（joinedAt 取 createdAt，与折算语义等价）；
 *  ③ 幂等：同目标重复调用 → changed=false，评论数与 updatedAt 一个字节都不动；
 *  ④ 不变量：owner 恰好一个且与 sourceSessionId 同指一窗；零 owner 的畸形记录不得被写成零 owner。
 *
 * 另有「半截交接」用例：commentId 抛错时三处都不变（写点全在构造之后，见实现里的顺序注释）。
 */
import { describe, it, expect } from 'vitest'
import { handoffOwner } from '../src/application/internal/binding-write.js'
import type { RequirementRecord, WindowSeat } from '../src/shared/protocol.js'
// t-4bd792：交接用例（HandoffOwner）+ 工具壳——夹具与断言风格照 tests/capture-window-bound-policy.test.ts。
import { assertSupportedJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { makeHarness, req } from './application/harness.js'
import { handoffRequirement } from '../src/application/use-cases/HandoffOwner.js'
import { defineHandoffTool } from '../src/tools/index.js'

const AT = 1_796_000_000_000
const ISO = new Date(AT).toISOString()

function makeReq(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: 'REQ-h', title: 't', description: '', status: 'implementing', blocked: false,
    comments: [], version: 1, createdAt: 1000, updatedAt: 1000,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
    ...over,
  } as unknown as RequirementRecord
}

/** 这轮写入的 owner 席位（恰好一个才算好看；多于一个由下面的断言点破）。 */
function owners(req: RequirementRecord): WindowSeat[] {
  return (req.seats ?? []).filter((s) => s.role === 'owner')
}

describe('FR-2 ① 正常交接：新窗 owner / 旧窗 observer / sourceSessionId 同步', () => {
  it('显式 seats 的需求：owner 换到 toWindow，原 owner 降 observer（保留 joinedAt/lastSeenAt）', () => {
    const r = makeReq({
      sourceSessionId: 'w-old',
      seats: [{ windowKey: 'w-old', role: 'owner', joinedAt: 500, lastSeenAt: 800 }],
    })
    const changed = handoffOwner(r, {
      toWindow: 'w-new', actor: { kind: 'agent', sessionId: 'w-new' }, at: AT,
      commentId: () => 'c-1', reason: '上下文将满，交给新窗口续作',
    })

    expect(changed).toBe(true)
    expect(r.seats!.find((s) => s.windowKey === 'w-new')?.role).toBe('owner')
    expect(r.seats!.find((s) => s.windowKey === 'w-old')).toEqual(
      { windowKey: 'w-old', role: 'observer', joinedAt: 500, lastSeenAt: 800 },
    )
    expect(r.sourceSessionId).toBe('w-new')
    // 留痕评论：from/to/角色变化/actor/ISO/reason 六项齐备（本仓风格：[交接] 窗口 A → B（…））
    expect(r.comments).toHaveLength(1)
    const body = r.comments[0]!.body
    expect(body).toContain('w-old')
    expect(body).toContain('w-new')
    expect(body).toContain('owner→observer')
    expect(body).toContain('（owner→observer）') // 与既有 applyRebind 同款留痕句式
    expect(body).toContain('actor=agent:w-new')
    expect(body).toContain(ISO)
    expect(body).toContain('上下文将满，交给新窗口续作')
    expect(r.comments[0]!.createdBy).toEqual({ kind: 'agent', sessionId: 'w-new' })
    expect(r.updatedAt).toBe(AT)
    expect(r.updatedBy).toEqual({ kind: 'agent', sessionId: 'w-new' })
  })

  it('原席位是 worker 的窗口接管：角色变化如实写 worker→owner（不改 joinedAt）', () => {
    const r = makeReq({
      sourceSessionId: 'w-old',
      seats: [
        { windowKey: 'w-old', role: 'owner', joinedAt: 500 },
        { windowKey: 'w-new', role: 'worker', joinedAt: 700 },
      ],
    })
    handoffOwner(r, { toWindow: 'w-new', actor: { kind: 'human' }, at: AT, commentId: () => 'c-2' })

    expect(owners(r)).toHaveLength(1)
    expect(r.seats!.find((s) => s.windowKey === 'w-new')).toEqual(
      { windowKey: 'w-new', role: 'owner', joinedAt: 700 },
    )
    expect(r.comments[0]!.body).toContain('worker→owner')
    expect(r.comments[0]!.body).toContain('actor=human')
  })
})

describe('FR-2 ② 存量记录（无 seats）被物化', () => {
  it('物化成两条：owner=新窗（joinedAt=at）、observer=旧窗（joinedAt=createdAt）', () => {
    const r = makeReq({ sourceSessionId: 'w-old', seats: undefined, createdAt: 1234 })
    const changed = handoffOwner(r, {
      toWindow: 'w-new', actor: { kind: 'agent', sessionId: 'w-new' }, at: AT, commentId: () => 'c-3',
    })

    expect(changed).toBe(true)
    expect(r.seats).toEqual([
      { windowKey: 'w-new', role: 'owner', joinedAt: AT },
      { windowKey: 'w-old', role: 'observer', joinedAt: 1234 }, // ← 折算口径：owner 是立项那刻入席的
    ])
    expect(r.sourceSessionId).toBe('w-new')
  })

  it('连 sourceSessionId 都没有（人工建卡）：只入席新 owner，不伪造原窗口', () => {
    const r = makeReq({ sourceSessionId: undefined, seats: undefined })
    const changed = handoffOwner(r, {
      toWindow: 'w-new', actor: { kind: 'human' }, at: AT, commentId: () => 'c-4',
    })

    expect(changed).toBe(true)
    expect(r.seats).toEqual([{ windowKey: 'w-new', role: 'owner', joinedAt: AT }])
    expect(r.comments[0]!.body).toContain('（无） → w-new')
  })
})

describe('FR-2 ③ 幂等：同目标再交一次 = 无操作', () => {
  it('第二次调用返回 false，评论数与 updatedAt 都不动', () => {
    const r = makeReq({ sourceSessionId: 'w-old', seats: undefined })
    const input = { toWindow: 'w-new', actor: { kind: 'human' as const }, at: AT, commentId: () => 'c-5' }
    expect(handoffOwner(r, input)).toBe(true)
    const afterFirst = r.comments.length
    const updatedAtFirst = r.updatedAt

    // 第三次、第四次也一样（幂等不是"只对第二次成立"）
    expect(handoffOwner(r, { ...input, at: AT + 1, commentId: () => 'c-6' })).toBe(false)
    expect(handoffOwner(r, { ...input, at: AT + 2, commentId: () => 'c-7' })).toBe(false)
    expect(r.comments).toHaveLength(afterFirst)
    expect(r.updatedAt).toBe(updatedAtFirst)
    expect(r.sourceSessionId).toBe('w-new')
  })

  it('空目标 / 同窗目标：按幂等返回 false（不抛、不写评论）', () => {
    const r = makeReq({ sourceSessionId: 'w-old', seats: undefined })
    expect(handoffOwner(r, { toWindow: '', actor: { kind: 'human' }, at: AT, commentId: () => 'c-8' })).toBe(false)
    expect(handoffOwner(r, { toWindow: 'w-old', actor: { kind: 'human' }, at: AT, commentId: () => 'c-9' })).toBe(false)
    expect(r.comments).toHaveLength(0)
    expect(r.seats).toBeUndefined()
  })
})

describe('FR-2 ④ 不变量 INV-1 / INV-2 / INV-3', () => {
  it('写入后 owner 恰好一个，且该 owner 的 windowKey 与 sourceSessionId 同指一窗', () => {
    const r = makeReq({
      sourceSessionId: 'w-old',
      // 畸形：两个 owner（INV-3 违例）——写入必须收敛成一个，不能"再添一个 owner"
      seats: [
        { windowKey: 'w-old', role: 'owner', joinedAt: 500 },
        { windowKey: 'w-ghost', role: 'owner', joinedAt: 600 },
      ],
    })
    handoffOwner(r, { toWindow: 'w-new', actor: { kind: 'human' }, at: AT, commentId: () => 'c-10' })

    const live = owners(r)
    expect(live).toHaveLength(1)
    expect(live[0]!.windowKey).toBe('w-new')
    expect(r.sourceSessionId).toBe(live[0]!.windowKey)
    // 其余 owner 降 observer（不是删掉——降级保留可见性）
    expect(r.seats!.filter((s) => s.role === 'observer').map((s) => s.windowKey)).toEqual(['w-old', 'w-ghost'])
  })

  it('零 owner 的畸形记录：选择**修好**（返回 true 并产出唯一 owner），不得写成 seats 非空却零 owner', () => {
    // 实现选择（与实现里 handoffOwner 的注释一致）：**不拒绝、就地修复**——
    // 拒绝等于把这条记录永久钉死在"对所有人不可见也不可写"（architecture.md §不变量的违反症状）。
    const r = makeReq({
      sourceSessionId: undefined,
      seats: [{ windowKey: 'w', role: 'worker', joinedAt: 1 }],
    })
    const changed = handoffOwner(r, {
      toWindow: 'w-new', actor: { kind: 'human' }, at: AT, commentId: () => 'c-11',
    })

    expect(changed).toBe(true)
    // 判据只有一条：结果里不得出现「seats 非空但零 owner」
    const seats = r.seats ?? []
    expect(seats.length > 0 && owners(r).length === 0).toBe(false)
    expect(owners(r).map((s) => s.windowKey)).toEqual(['w-new'])
    expect(r.sourceSessionId).toBe('w-new')
    expect(r.seats!.find((s) => s.windowKey === 'w')?.role).toBe('worker') // 旁席原样保留
  })
})

describe('FR-2 ⑤ 半截交接防线：写点全在构造之后', () => {
  it('commentId 抛错 → seats / sourceSessionId / 评论 / updatedAt 四处全不变', () => {
    const seatsBefore: WindowSeat[] = [{ windowKey: 'w-old', role: 'owner', joinedAt: 500 }]
    const r = makeReq({ sourceSessionId: 'w-old', seats: seatsBefore })

    expect(() => handoffOwner(r, {
      toWindow: 'w-new', actor: { kind: 'human' }, at: AT,
      commentId: () => { throw new Error('id 生成失败（模拟 mutate 中途异常）') },
    })).toThrow('id 生成失败')

    expect(r.seats).toBe(seatsBefore)
    expect(r.seats).toEqual([{ windowKey: 'w-old', role: 'owner', joinedAt: 500 }])
    expect(r.sourceSessionId).toBe('w-old')
    expect(r.comments).toHaveLength(0)
    expect(r.updatedAt).toBe(1000)
  })
})

// ---------------------------------------------------------------------------
// t-4bd792：交接用例 `handoffRequirement` + 工具壳 `reqboard_handoff`（FR-4 / FR-5）
//
// 六条要求逐条落地（design/test-cases.md 的 FR-5 / FR-4 行）：
//   ① 非 owner → REQBOARD_SEAT_NOT_OWNER 且台账零改动（席位 / 绑定 / 评论数都不变）；
//   ② to_window 等于源窗口或空串 → REQBOARD_HANDOFF_TARGET_INVALID；
//   ③ 读数不可得 + 无 reason → REQBOARD_HANDOFF_NO_CONTEXT（不猜、不自动交接）；
//   ④ 底稿消息 source.kind === 'reqboard-handoff' 且 **≠ 'user'**（冒充人类防线）；
//   ⑤ 投递失败 → 仍 success:true + delivery.delivered=false + reason（且**不回滚**交接）；
//   ⑥ 回执含 from_window / to_window / old_role / new_role。
// 用真夹具（内存端口）跑，不另造会话替身——口径与 capture-window-bound-policy 一致。
// ---------------------------------------------------------------------------

const REQ_HO = 'REQ-000000000001-abcd'
const W_OWNER = 'session-ho-owner'
const W_WORKER = 'session-ho-worker'
const W_NEW = 'session-ho-new'

const execOf = (windowKey: string) => ({ agent: { id: windowKey } })

/** 已登记的 owner 席位记录（implementing = 开放态，才进绑定读）。 */
function seated(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return req({
    id: REQ_HO,
    title: '交接用例',
    status: 'implementing',
    sourceSessionId: W_OWNER,
    seats: [{ windowKey: W_OWNER, role: 'owner', joinedAt: 1 }],
    ...over,
  })
}

/** 顶墙档（critical）：读数可用且 ≥ 0.90 ⇒ agent 可**自主**交接（否则必须写明 reason）。 */
function atTopWall<T extends ReturnType<typeof makeHarness>>(h: T): T {
  h.session.contextPressureSnapshot = {
    at: 1,
    source: 'projection',
    contextWindow: 200_000,
    pressureTokens: 190_000,
    projectedTokens: 195_000,
  }
  return h
}

/** 假跨窗口投递口：捕获（目标窗口, 消息）并按给定结果回执；`captured` 传 null = 只回执不捕获。 */
function fakeDeliver(
  captured: { to: string; message: unknown }[] | null,
  result: { delivered: boolean; reason?: string },
) {
  return {
    createMessage: (params: { text: string; kind: string }) => ({
      messageId: 'm-ho-1',
      message: {
        id: 'm-ho-1',
        role: 'user',
        content: [{ type: 'text', text: params.text }],
        source: { kind: params.kind, plugin: 'dsh-pmboard' },
      },
    }),
    deliver: async (to: string, message: unknown) => {
      captured?.push({ to, message })
      return result
    },
  }
}

describe('FR-5 ① 非 owner → REQBOARD_SEAT_NOT_OWNER 且台账零改动', () => {
  it('worker 席位调用：显式 id 与缺省 id 两条路径都拒，席位 / 绑定 / 评论一个字节不动', async () => {
    const h = makeHarness({
      requirements: [seated({
        seats: [
          { windowKey: W_OWNER, role: 'owner', joinedAt: 1 },
          { windowKey: W_WORKER, role: 'worker', joinedAt: 2 },
        ],
      })],
    })
    const before = (await h.store.get(REQ_HO))!

    await expect(handoffRequirement(h.deps, { requirement_id: REQ_HO, reason: '人要求交接' }, execOf(W_WORKER)))
      .rejects.toThrow(/REQBOARD_SEAT_NOT_OWNER/)
    // 缺省路径（不给 id）也必须给准确的 SEAT_NOT_OWNER，而不是含糊的「没有绑定需求」
    await expect(handoffRequirement(h.deps, { reason: '人要求交接' }, execOf(W_WORKER)))
      .rejects.toThrow(/REQBOARD_SEAT_NOT_OWNER/)

    const after = (await h.store.get(REQ_HO))!
    expect(after.seats).toEqual(before.seats)
    expect(after.sourceSessionId).toBe(W_OWNER)
    expect(after.comments).toHaveLength(before.comments.length)
    expect(after.updatedAt).toBe(before.updatedAt)
  })

  it('observer 席位同样拒，且错误码统一为 REQBOARD_SEAT_NOT_OWNER（底层码只进文案）', async () => {
    const h = atTopWall(makeHarness({
      requirements: [seated({
        seats: [
          { windowKey: W_OWNER, role: 'owner', joinedAt: 1 },
          { windowKey: W_WORKER, role: 'observer', joinedAt: 2 },
        ],
      })],
    }))
    await expect(handoffRequirement(h.deps, { requirement_id: REQ_HO }, execOf(W_WORKER)))
      .rejects.toThrow(/REQBOARD_SEAT_NOT_OWNER/)
    expect((await h.store.get(REQ_HO))!.sourceSessionId).toBe(W_OWNER)
  })
})

describe('FR-5 ② to_window 非法 → REQBOARD_HANDOFF_TARGET_INVALID', () => {
  it('等于源窗口 / 空串：拒绝且台账零改动', async () => {
    const h = atTopWall(makeHarness({ requirements: [seated()] }))

    await expect(handoffRequirement(h.deps, { to_window: W_OWNER }, execOf(W_OWNER)))
      .rejects.toThrow(/REQBOARD_HANDOFF_TARGET_INVALID/)
    await expect(handoffRequirement(h.deps, { to_window: '   ' }, execOf(W_OWNER)))
      .rejects.toThrow(/REQBOARD_HANDOFF_TARGET_INVALID/)

    const after = (await h.store.get(REQ_HO))!
    expect(after.sourceSessionId).toBe(W_OWNER)
    expect(after.seats).toEqual([{ windowKey: W_OWNER, role: 'owner', joinedAt: 1 }])
    expect(after.comments).toHaveLength(0)
  })
})

describe('FR-3 ③ 读数缺席不猜；非顶墙档要 reason', () => {
  it('source=unavailable 且无 reason → REQBOARD_HANDOFF_NO_CONTEXT，台账零改动', async () => {
    // FakeSession 缺省 = contextPressure.source='unavailable'（即「取不到」，不是「余量充裕」）
    const h = makeHarness({ requirements: [seated()] })

    await expect(handoffRequirement(h.deps, {}, execOf(W_OWNER)))
      .rejects.toThrow(/REQBOARD_HANDOFF_NO_CONTEXT/)

    const after = (await h.store.get(REQ_HO))!
    expect(after.sourceSessionId).toBe(W_OWNER)
    expect(after.comments).toHaveLength(0)
  })

  it('档位明确但未达顶墙（0.50）+ 无 reason → REQBOARD_INVALID_INPUT；写了 reason 才放行且 self_initiated=false', async () => {
    const h = makeHarness({ requirements: [seated()] })
    h.session.contextPressureSnapshot = { at: 1, source: 'projection', contextWindow: 100, pressureTokens: 50 }

    await expect(handoffRequirement(h.deps, { to_window: W_NEW }, execOf(W_OWNER)))
      .rejects.toThrow(/REQBOARD_INVALID_INPUT/)

    h.deps.crossWindowDeliver = fakeDeliver(null, { delivered: true })
    const out = await handoffRequirement(h.deps, { to_window: W_NEW, reason: '人明确要求换窗口' }, execOf(W_OWNER))
    expect(out.success).toBe(true)
    expect(out.self_initiated).toBe(false)
  })
})

describe('FR-4 ④ 底稿自署 kind（冒充人类防线）', () => {
  it('投递消息的 source.kind === reqboard-handoff 且 ≠ user；正文自带断点四件套', async () => {
    const captured: { to: string; message: unknown }[] = []
    const h = atTopWall(makeHarness({ requirements: [seated()] }))
    h.deps.crossWindowDeliver = fakeDeliver(captured, { delivered: true })

    const out = await handoffRequirement(h.deps, { to_window: W_NEW, reason: '水位 0.95，阶段边界' }, execOf(W_OWNER))

    expect(out.success).toBe(true)
    expect(captured).toHaveLength(1)
    expect(captured[0]!.to).toBe(W_NEW)
    const msg = captured[0]!.message as { source?: { kind?: string }; content?: { text?: string }[] }
    expect(msg.source?.kind).toBe('reqboard-handoff')
    expect(msg.source?.kind).not.toBe('user')
    const text = msg.content?.[0]?.text ?? ''
    expect(text).toContain(REQ_HO)
    expect(text).toContain('断点')
    expect(out.delivery).toEqual({ delivered: true, kind: 'reqboard-handoff' })
  })
})

describe('FR-4 ⑤ 投递失败不回滚（部分成功）', () => {
  it('新会话 resume 超时：success:true + delivery.delivered=false + reason，席位与绑定保持交接后状态', async () => {
    const h = atTopWall(makeHarness({ requirements: [seated()] }))
    h.deps.crossWindowDeliver = fakeDeliver(null, { delivered: false, reason: '冷会话 resume 超时' })

    const out = await handoffRequirement(h.deps, { to_window: W_NEW, reason: '顶墙' }, execOf(W_OWNER))

    expect(out.success).toBe(true)
    expect(out.delivery.delivered).toBe(false)
    expect(out.delivery.reason).toContain('resume 超时')
    const after = (await h.store.get(REQ_HO))!
    expect(after.sourceSessionId).toBe(W_NEW) // 不回滚
    expect(after.seats?.find((s) => s.windowKey === W_NEW)?.role).toBe('owner')
    expect(after.seats?.find((s) => s.windowKey === W_OWNER)?.role).toBe('observer')
    expect(after.comments).toHaveLength(1) // 留痕仍在（交接成立过）
  })

  it('未装配 crossWindowDeliver：如实报「未装配」，绝不谎报 delivered', async () => {
    const h = atTopWall(makeHarness({ requirements: [seated()] }))

    const out = await handoffRequirement(h.deps, { to_window: W_NEW, reason: '顶墙' }, execOf(W_OWNER))

    expect(out.success).toBe(true)
    expect(out.delivery.delivered).toBe(false)
    expect(out.delivery.reason).toContain('crossWindowDeliver')
  })
})

describe('FR-5 ⑥ 回执四键 + 幂等分支', () => {
  it('from_window / to_window / old_role / new_role 齐备；context_pressure 原样透传（含 source）', async () => {
    const h = atTopWall(makeHarness({ requirements: [seated()] }))
    h.deps.crossWindowDeliver = fakeDeliver(null, { delivered: true })

    const out = await handoffRequirement(h.deps, { to_window: W_NEW, reason: '顶墙' }, execOf(W_OWNER))

    expect(out.from_window).toBe(W_OWNER)
    expect(out.to_window).toBe(W_NEW)
    expect(out.old_role).toBe('observer')
    expect(out.new_role).toBe('owner')
    expect(out.self_initiated).toBe(true)
    expect(out.context_pressure).toEqual({
      contextWindow: 200_000,
      pressureTokens: 190_000,
      projectedTokens: 195_000,
      source: 'projection',
    })
  })

  it('席位已就位（目标窗本就是在位 owner）：不写台账、仍走投递，并在 note 里如实标幂等', async () => {
    // 畸形双 owner（INV-3 违例）：调用方是**第二个** owner，目标是在位的第一个 owner
    // ⇒ handoffOwner 判幂等（from === to）。本用例只锁用例层对幂等的处置：不报错、不写盘、仍投递。
    const h = atTopWall(makeHarness({
      requirements: [seated({
        seats: [
          { windowKey: W_OWNER, role: 'owner', joinedAt: 1 },
          { windowKey: W_WORKER, role: 'owner', joinedAt: 2 },
        ],
      })],
    }))
    const captured: { to: string; message: unknown }[] = []
    h.deps.crossWindowDeliver = fakeDeliver(captured, { delivered: true })
    const commentsBefore = (await h.store.get(REQ_HO))!.comments.length

    const out = await handoffRequirement(h.deps, { to_window: W_OWNER, reason: '只补投递' }, execOf(W_WORKER))

    expect(out.success).toBe(true)
    expect(out.note).toContain('幂等')
    expect((await h.store.get(REQ_HO))!.comments).toHaveLength(commentsBefore)
    expect(captured.map((c) => c.to)).toEqual([W_OWNER])
  })
})

describe('FR-5 工具壳：reqboard_handoff 的名字、声明面与委托', () => {
  /** 工具壳形状（`defineTool` 的返回值）——只取本用例要用的三处。 */
  type Shell = {
    name?: string
    parameters?: { properties?: Record<string, unknown> }
    output?: { schema?: { properties?: Record<string, unknown> } }
    execute: (args: unknown, ctx: unknown) => Promise<Record<string, unknown>>
  }

  it('名字不含 rebind 字样；入参只有 reason / mode / to_window（看板改绑是另一条 human_gate 通道）', () => {
    const shell = defineHandoffTool({} as never) as unknown as Shell
    expect(shell.name).toBe('reqboard_handoff')
    expect(/rebind/i.test(shell.name ?? '')).toBe(false)
    expect(Object.keys(shell.parameters?.properties ?? {}).sort()).toEqual(['mode', 'reason', 'to_window'])
  })

  it('成功路径直调 execute：返回键全部已声明（additionalProperties:false 下多一个就整条拒收）', async () => {
    const h = atTopWall(makeHarness({ requirements: [seated()] }))
    h.deps.crossWindowDeliver = fakeDeliver(null, { delivered: true })
    const shell = defineHandoffTool(h.deps) as unknown as Shell

    const out = await shell.execute({ to_window: W_NEW, reason: '顶墙交接' }, execOf(W_OWNER))

    expect(out['success']).toBe(true)
    expect(out['to_window']).toBe(W_NEW)
    expect(out['new_role']).toBe('owner')
    const declared = Object.keys(shell.output?.schema?.properties ?? {})
    expect(declared.length).toBeGreaterThan(0)
    expect(Object.keys(out).filter((k) => !declared.includes(k))).toEqual([])
  })

  it('联调：宿主校验器收得下入参与回执（含嵌套 delivery / context_pressure）', async () => {
    const h = atTopWall(makeHarness({ requirements: [seated()] }))
    // 刻意用**投递失败**的回执过校验器：未投递分支的字段形状同样不得被宿主拒收。
    h.deps.crossWindowDeliver = fakeDeliver(null, { delivered: false, reason: '窗口冷却' })
    const shell = defineHandoffTool(h.deps) as unknown as Shell

    const params = shell.parameters as unknown as Parameters<typeof validateJsonSchemaValue>[0]
    assertSupportedJsonSchema(params)
    expect(validateJsonSchemaValue(params, { to_window: W_NEW, mode: 'create', reason: '顶墙' })).toEqual([])

    const out = await shell.execute({ to_window: W_NEW, reason: '顶墙' }, execOf(W_OWNER))
    const schema = shell.output?.schema as unknown as Parameters<typeof validateJsonSchemaValue>[0]
    assertSupportedJsonSchema(schema)
    expect(validateJsonSchemaValue(schema, out)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// t-9f1e88 反向演练：「假成功防线」——显式 seats 的记录经看板改绑，席位必须**真的**换过去。
//
// 为什么这条此前是空的（design/test-cases.md §反向演练 表里唯一标「待补」的一行）：
// 既有 `tests/binding-trace.test.ts` 的三条 applyRebind 用例全部建立在**无 seats** 的存量记录上
// （只有 `sourceSessionId` 一处权威），所以改造前那种「只改 sourceSessionId、席位一个字节不动」
// 的实现照样全绿——回执 `rebound:true` 而席位权威判新窗口「未绑定」，正是本需求要根治的假成功。
//
// 本条的判据因此**必须落在 seats 上**（不是 sourceSessionId）：
// 显式 seats（owner=旧窗 + 一个 worker 旁席）经 `applyRebind`（看板改绑的真实入口）后，
// 新窗 owner、旧窗**降 observer**（不是退席）、旁席不动、owner 恰好一个。
// 改造前它必红；这是本演练「红转绿」的可证伪锚点。
//
// `applyRebind` 的 import 随本块放在末尾：ESM 的 import 声明会提升到模块顶部，语义与写在
// 文件头**完全一致**（本块是末尾追加，故连 import 一起放在这里，改动不落在既有用例上）。
// ---------------------------------------------------------------------------
import { applyRebind } from '../src/application/internal/binding-write.js'

describe('反向演练：假成功防线（显式 seats 记录经看板改绑 → 席位真的换到新窗口）', () => {
  it('applyRebind 同时改席位与绑定：新窗 owner / 旧窗 observer / 旁席不动 / 留痕一条', () => {
    const r = makeReq({
      sourceSessionId: 'w-old',
      seats: [
        { windowKey: 'w-old', role: 'owner', joinedAt: 500, lastSeenAt: 800 },
        { windowKey: 'w-mate', role: 'worker', joinedAt: 700 },
      ],
    })
    // 前置事实：席位权威此刻只认 w-old（改绑前 owner 是旧窗）
    expect(r.seats!.filter((s) => s.role === 'owner').map((s) => s.windowKey)).toEqual(['w-old'])

    const changed = applyRebind(r, {
      toWindow: 'w-new', actor: { kind: 'human' }, at: AT, commentId: () => 'c-rebind-1', reason: '窗口死了，改绑到本窗口',
    })

    expect(changed).toBe(true)
    // 假成功的判据就在这里：只看 sourceSessionId 会漏掉这三条（改造前正是如此）
    const live = r.seats!.filter((s) => s.role === 'owner')
    expect(live.map((s) => s.windowKey)).toEqual(['w-new'])
    expect(r.seats!.find((s) => s.windowKey === 'w-new')?.role).toBe('owner')
    // 降级保留可见性（不是退席）：席位仍在，joinedAt/lastSeenAt 是历史事实不改写
    expect(r.seats!.find((s) => s.windowKey === 'w-old'))
      .toEqual({ windowKey: 'w-old', role: 'observer', joinedAt: 500, lastSeenAt: 800 })
    // 旁席不被改绑牵连
    expect(r.seats!.find((s) => s.windowKey === 'w-mate')).toEqual({ windowKey: 'w-mate', role: 'worker', joinedAt: 700 })
    // 两个权威同指一窗（INV-2）
    expect(r.sourceSessionId).toBe(live[0]!.windowKey)
    expect(r.comments).toHaveLength(1)
    expect(r.comments[0]!.body).toContain('w-old')
    expect(r.comments[0]!.body).toContain('w-new')

    // 改绑入口的幂等沿用交接的同一条判据（原 owner 已是目标窗 → 不刷评论、不动台账）
    expect(applyRebind(r, {
      toWindow: 'w-new', actor: { kind: 'human' }, at: AT + 1, commentId: () => 'c-rebind-2',
    })).toBe(false)
    expect(r.comments).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// REQ-261005151245-54ae FR-5/FR-6：新建接管窗口带回继承回执；指定已有窗口则整体省略
// ---------------------------------------------------------------------------

describe('REQ-261005151245-54ae 新建窗口的继承回执', () => {
  /** 假开窗能力：记录标题与模型写入；画像给出「源窗口有标题、有模式、有模型」。 */
  function openerWithInheritance(calls: { rename: { sessionId: string; title: string }[] }) {
    return {
      available: () => true,
      fork: async () => ({ ok: true, windowKey: W_NEW, parentSessionId: W_OWNER }),
      resolveSourceProject: () => ({ workspaceId: 'ws-ho' }),
      create: async () => ({ ok: true, windowKey: W_NEW }),
      readProfile: async () => ({
        title: '交接用例 (2)',
        agentPreset: 'cordis',
        modelSelection: { provider: 'deepseek', model: 'deepseek-chat' },
      }),
      rename: async (sessionId: string, title: string) => {
        calls.rename.push({ sessionId, title })
      },
      selectModel: async () => undefined,
    }
  }

  it('新建窗口：回执含 inheritance，且标题按源标题递增写到新窗口上', async () => {
    const calls = { rename: [] as { sessionId: string; title: string }[] }
    const h = atTopWall(makeHarness({ requirements: [seated()] }))
    h.deps.windowOpener = openerWithInheritance(calls) as never

    const out = await handoffRequirement(h.deps, { reason: '顶墙交接' }, execOf(W_OWNER))

    expect(out.to_window).toBe(W_NEW)
    expect(out.inheritance).toEqual({ title: 'set', preset: 'set', model: 'set', reasons: [] })
    expect(calls.rename).toEqual([{ sessionId: W_NEW, title: '交接用例 (3)' }])
  })

  it('指定已有窗口：回执不含 inheritance，且不动那个窗口的任何属性', async () => {
    const calls = { rename: [] as { sessionId: string; title: string }[] }
    const h = makeHarness({
      requirements: [seated({
        seats: [
          { windowKey: W_OWNER, role: 'owner', joinedAt: 1 },
          { windowKey: W_NEW, role: 'worker', joinedAt: 2 },
        ],
      })],
    })
    h.deps.windowOpener = openerWithInheritance(calls) as never

    const out = await handoffRequirement(h.deps, { to_window: W_NEW, reason: '人明确指定接管窗口' }, execOf(W_OWNER))

    expect(out.to_window).toBe(W_NEW)
    expect(out).not.toHaveProperty('inheritance')
    expect(calls.rename).toEqual([])
  })
})
