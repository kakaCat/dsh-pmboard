/**
 * 对话 Tab 查询断言（REQ-261004222448-292a · t-8eeed9）。
 *
 * 覆盖任务卡的四条验收（逐条对应 describe 标题）：
 *   ① 产出不含 `tool/call` / `tool/result` / `reasoning` / `run_code` 字样（反例标本喂进去，产物一字不许有）；
 *   ② 时间序单调递增（跨窗口 + 台账系统消息混排后仍递增）；
 *   ③ `limit=20` 返回 ≤ 20 条且 `hasMore` 与 `total` 一致，游标 `page.before`（**ms 时间戳**）能取更早（且不重不漏）；
 *   ④ 会话不可得（端口未装配 / 会话读不到）→ `available:false`（**不返回空数组冒充「没有对话」**）。
 * 另加：系统消息取台账原文（交接 / 中断 / 计划退回 / 挂起确认 / 验收裁决 / 回填标）与
 * 插件自署来源的 user/message **不得**被当成人类发言。
 *
 * 夹具：复用 tests/application/harness.ts 的内存台账与队列（不落盘、不碰 fs）；
 * 会话端口用 FakeSession 的子类（FakeSession 已经是 SessionProbe 的实现，子类只加事件读端）。
 */
import { describe, expect, it } from 'vitest'
import type { SessionProbe } from '../src/application/ports.js'
import { buildDialogue, queryDialogue, type DialogueSessionEventsPort } from '../src/application/query/QueryDialogue.js'
import type { PanelQueryDeps } from '../src/application/query/contracts.js'
import type { DialogueResponse, PanelResult, RequirementRecord } from '../src/shared/protocol.js'
import { FakeSession, makeHarness, req } from './application/harness.js'

const REQ_ID = 'REQ-261004222448-292a'
const WINDOW_A = 'session-window-a'
const WINDOW_B = 'session-window-b'

/** 台账侧的最小可用需求（有席位、有来源窗口）。 */
function dialogueReq(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return req({
    id: REQ_ID,
    status: 'implementing',
    sourceSessionId: WINDOW_A,
    seats: [{ windowKey: WINDOW_A, role: 'owner', joinedAt: 10 }],
    ...over,
  })
}

/**
 * 会话读端替身：`events` 是 key → 事件数组；值为 `undefined` = **读不到**（与 `[]` 空会话区分）。
 * `coldOnly` = 快照读不到（返回 undefined），只有冷读能取——用来证明"回落持久化冷读"这条读法。
 */
class FakeDialogueSession extends FakeSession implements DialogueSessionEventsPort {
  constructor(
    private readonly events: Map<string, readonly unknown[] | undefined>,
    private readonly coldOnly = false,
  ) {
    super()
  }
  snapshotEvents(key: string): readonly unknown[] | undefined {
    return this.coldOnly ? undefined : this.events.get(key)
  }
  async readEvents(key: string): Promise<readonly unknown[] | undefined> {
    return this.events.get(key)
  }
}

/** 组装六查询依赖（对话查询只用得上 store / tasks / injections / sessions / now）。 */
function panelDeps(h: ReturnType<typeof makeHarness>, sessions: SessionProbe): PanelQueryDeps {
  return {
    store: h.store,
    tasks: h.taskStore,
    injections: { readAll: async () => [] },
    sessions,
    now: () => h.clock.t,
  }
}

/** 用例脚手架：播种需求 + 挂上会话替身（返回 harness 是为了用它的故障注入与时钟）。 */
function setup(
  over: Partial<RequirementRecord>,
  sessions: SessionProbe,
): { deps: PanelQueryDeps; h: ReturnType<typeof makeHarness> } {
  const h = makeHarness({ requirements: [dialogueReq(over)] })
  return { deps: panelDeps(h, sessions), h }
}

/** 人说的（source.kind 可换成插件自署来源，用来断言"不是人类发言"）。 */
function humanEvent(at: number, seq: number, text: string, kind = 'user'): unknown {
  return {
    type: 'user/message',
    seq,
    time: at,
    data: { id: 'u-' + seq, role: 'user', content: [{ type: 'text', text }], source: { kind } },
  }
}

/** agent 的回复（text 块 + 可选附加块）。 */
function agentEvent(at: number, seq: number, text: string, extraBlocks: readonly unknown[] = []): unknown {
  return {
    type: 'assistant/message',
    seq,
    time: at,
    data: {
      turn: 1,
      step: 1,
      stream: [],
      message: {
        id: 'a-' + seq,
        role: 'assistant',
        content: [{ type: 'text', text }, ...extraBlocks],
        source: { kind: 'model', provider: 'p', model: 'm' },
      },
    },
  }
}

/** 取出正常响应（降级即抛，避免断言落在降级信封上悄悄通过）。 */
function asOk(res: PanelResult<DialogueResponse>): DialogueResponse {
  if (res.available === false) throw new Error('期望正常响应，实际是降级：' + res.reason + ' / ' + res.note)
  return res
}

describe('① 过滤：工具调用 / 工具结果 / 推理 / run_code 一个字都不进响应', () => {
  it('接线名与设计稿名字指向同一实现（别名不会漂移）', () => {
    // 兄弟实现（queryTrunk / queryDag / queryTokenExtension）用 query<X> 拼法，接线只用记一种；
    // 设计稿 S-6 叫 buildDialogue——两个名字必须是同一个函数，否则接线接了别名就等于接了旧实现。
    expect(buildDialogue).toBe(queryDialogue)
  })

  it('含四类噪声的标本 → 产物里不含 tool/call、tool/result、reasoning、run_code', async () => {
    const events = [
      humanEvent(100, 0, '把对话 Tab 做出来'),
      agentEvent(200, 1, '看完了，我来改', [
        { type: 'reasoning', text: '先推理：tool/call reasoning run_code 都该被挡掉' },
        { type: 'tool-call', id: 'c1', name: 'read_file', arguments: '{}' },
      ]),
      // 工具事件本体（两类都要挡）
      { type: 'tool/call', seq: 2, time: 210, data: { turn: 1, step: 1, callId: 'c1', name: 'read_file', arguments: '{"path":"x"}' } },
      {
        type: 'tool/result',
        seq: 3,
        time: 220,
        data: {
          turn: 1,
          step: 1,
          message: {
            id: 'r1',
            role: 'tool',
            isError: false,
            content: [{ type: 'text', text: 'tool/result 正文不该出现' }],
            source: { kind: 'tool', callId: 'c1' },
          },
        },
      },
      // 文本块里被 run_code 包裹的内容
      agentEvent(300, 4, '<run_code>console.log("reasoning")</run_code>\n\n结论：可以开工'),
      // 过程叙述
      agentEvent(400, 5, '正在读取文件…'),
    ]
    const { deps } = setup({}, new FakeDialogueSession(new Map([[WINDOW_A, events]])))
    const res = asOk(await buildDialogue(deps, { requirementId: REQ_ID }))

    // 防假绿：标本里**确实**含这四类字样（否则"产物里没有"是空断言）
    const specimen = JSON.stringify(events)
    for (const forbidden of ['tool/call', 'tool/result', 'reasoning', 'run_code']) {
      expect(specimen.includes(forbidden)).toBe(true)
    }
    const rendered = JSON.stringify(res)
    for (const forbidden of ['tool/call', 'tool/result', 'reasoning', 'run_code']) {
      expect(rendered.includes(forbidden)).toBe(false)
    }
    // 正向对照：该留的确实留下了（否则"没有噪声"可以靠"什么都没有"作弊）
    expect(res.items.map(i => i.text)).toEqual(['把对话 Tab 做出来', '看完了，我来改', '结论：可以开工'])
  })

  it('推理块单独成条也算噪声：只保留 text 块', async () => {
    const events = [agentEvent(100, 0, '', [{ type: 'reasoning', text: '只有推理没有正文' }]), agentEvent(200, 1, '这是正文')]
    const { deps } = setup({}, new FakeDialogueSession(new Map([[WINDOW_A, events]])))
    const res = asOk(await buildDialogue(deps, { requirementId: REQ_ID }))
    expect(res.items.map(i => i.text)).toEqual(['这是正文'])
  })

  it('插件自署来源的 user/message 不是人类发言（reqboard-handoff 正文被丢弃）', async () => {
    const events = [
      humanEvent(100, 0, '真人说的'),
      humanEvent(200, 1, '[交接底稿] 这是插件自署的底稿正文', 'reqboard-handoff'),
      humanEvent(300, 2, '[开窗底稿] 同样是自署来源', 'reqboard-open-window'),
    ]
    const { deps } = setup({}, new FakeDialogueSession(new Map([[WINDOW_A, events]])))
    const res = asOk(await buildDialogue(deps, { requirementId: REQ_ID }))
    expect(res.items.map(i => i.text)).toEqual(['真人说的'])
    expect(res.items.every(i => i.kind === 'human')).toBe(true)
  })
})

describe('② 时间序单调递增（跨窗口 + 系统消息混排）', () => {
  it('两个窗口 + 台账事件乱序喂入 → items 的 at 非递减', async () => {
    const a = [humanEvent(500, 0, 'A-500'), agentEvent(700, 1, 'A-700')]
    const b = [humanEvent(300, 0, 'B-300'), agentEvent(900, 1, 'B-900')]
    const { deps } = setup(
      {
        // 两个窗口都在席位表里（候选窗口只从席位 / 来源窗口 / 执行会话推导）
        seats: [
          { windowKey: WINDOW_A, role: 'owner', joinedAt: 10 },
          { windowKey: WINDOW_B, role: 'worker', joinedAt: 20 },
        ],
        statusHistory: [
          { status: 'draft', at: 100, by: { kind: 'human' }, reason: '创建' },
          { status: 'implementing', at: 600, by: { kind: 'agent' }, reason: '拆分完成，进入实施' },
        ],
        interruption: { at: 800, reason: 'upstream stream idle 3m', stage: 'implementing', pendingAction: 'x' },
      },
      new FakeDialogueSession(new Map([
        [WINDOW_A, a],
        [WINDOW_B, b],
      ])),
    )
    const res = asOk(await buildDialogue(deps, { requirementId: REQ_ID, limit: 50 }))
    expect(res.items.length).toBe(7) // 4 条会话 + 2 条阶段推进 + 1 条中断
    const times = res.items.map(i => i.at)
    for (let i = 1; i < times.length; i += 1) expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!)
    // 系统消息确实混在流里（不是被排到末尾）
    expect(res.items.some(i => i.kind === 'system' && i.at === 600)).toBe(true)
    expect(res.items[0]!.at).toBe(100)
    // 人机条目带窗口码（多窗口同一条流时，页面据此标"谁说的"）
    const humanWindows = res.items.filter(i => i.kind !== 'system').map(i => (i.kind === 'system' ? '' : i.windowKey))
    expect(new Set(humanWindows)).toEqual(new Set([WINDOW_A, WINDOW_B]))
  })
})

describe('③ 游标分页：limit / hasMore / total / page.before（ms 时间戳游标）', () => {
  it('45 条 · limit=20 → 三页不重不漏，hasMore 与 total 一致', async () => {
    const texts = Array.from({ length: 45 }, (_, i) => 'msg-' + String(i).padStart(2, '0'))
    const events = texts.map((text, i) => humanEvent(1000 + i, i, text))
    const { deps } = setup({}, new FakeDialogueSession(new Map([[WINDOW_A, events]])))

    // 缺省 = 最新一页；page.before = 本页最早一条的 at（ms 时间戳游标）
    const page1 = asOk(await buildDialogue(deps, { requirementId: REQ_ID, limit: 20 }))
    expect(page1.items.length).toBe(20)
    expect(page1.page.total).toBe(45)
    expect(page1.page.hasMore).toBe(true)
    expect(page1.page.before).toBe(1025) // 本页最早一条的 at
    expect(page1.items.map(i => i.text)).toEqual(texts.slice(25))

    const page2 = asOk(await buildDialogue(deps, { requirementId: REQ_ID, limit: 20, before: page1.page.before }))
    expect(page2.items.length).toBe(20)
    expect(page2.page.total).toBe(45)
    expect(page2.page.hasMore).toBe(true)
    expect(page2.page.before).toBe(1005)
    expect(page2.items.map(i => i.text)).toEqual(texts.slice(5, 25))
    // hasMore 与 total 一致：取 at < before 的池子，池子比 limit 长就是还有更早
    expect(page2.page.hasMore).toBe(page2.page.total - page2.items.length - 20 > 0)

    const page3 = asOk(await buildDialogue(deps, { requirementId: REQ_ID, limit: 20, before: page2.page.before }))
    expect(page3.items.length).toBe(5)
    expect(page3.page.total).toBe(45)
    expect(page3.page.hasMore).toBe(false)
    expect(page3.page.before).toBeUndefined()
    expect(page3.items.map(i => i.text)).toEqual(texts.slice(0, 5))

    const all = [...page1.items, ...page2.items, ...page3.items].map(i => i.text)
    expect(new Set(all).size).toBe(45) // 不重
    expect([...all].sort()).toEqual([...texts].sort()) // 不漏
  })

  it('缺省 limit=40（与原型「已加载 40/152 条」口径一致）；limit 超上限夹到 50（路由层另有 400 校验）', async () => {
    const events = Array.from({ length: 60 }, (_, i) => humanEvent(1000 + i, i, 'm' + i))
    const { deps } = setup({}, new FakeDialogueSession(new Map([[WINDOW_A, events]])))
    const dflt = asOk(await buildDialogue(deps, { requirementId: REQ_ID }))
    expect(dflt.items.length).toBe(40)
    expect(dflt.page.total).toBe(60)
    const capped = asOk(await buildDialogue(deps, { requirementId: REQ_ID, limit: 999 }))
    expect(capped.items.length).toBe(50)
    expect(capped.page.total).toBe(60)
    expect(capped.page.hasMore).toBe(true)
    expect(capped.page.before).toBe(1010) // 本页最早一条的 at = 1000 + (60 − 50)
  })
})

describe('④ 会话不可得 → available:false（不返回空数组冒充「没有对话」）', () => {
  it('端口未装配（sessions 上没有事件读端）→ port-unavailable', async () => {
    const { deps } = setup({}, new FakeSession())
    const res = await buildDialogue(deps, { requirementId: REQ_ID })
    expect(res.available).toBe(false)
    if (res.available !== false) throw new Error('unreachable')
    expect(res.reason).toBe('port-unavailable')
    expect(res.note.length).toBeGreaterThan(0)
    expect('items' in res).toBe(false) // 关键：不是"空数组冒充没有对话"
  })

  it('会话读不到（候选窗口全部 undefined）→ no-snapshot', async () => {
    const { deps } = setup({}, new FakeDialogueSession(new Map([[WINDOW_A, undefined]])))
    const res = await buildDialogue(deps, { requirementId: REQ_ID })
    expect(res.available).toBe(false)
    if (res.available !== false) throw new Error('unreachable')
    expect(res.reason).toBe('no-snapshot')
    expect('items' in res).toBe(false)
  })

  it('台账读不到 → ledger-unreadable（降级而不是抛错）', async () => {
    const { deps, h } = setup({}, new FakeDialogueSession(new Map([[WINDOW_A, []]])))
    h.store.injectFault(REQ_ID) // 夹具的故障注入（走真实 get 抛错路径）
    const res = await buildDialogue(deps, { requirementId: REQ_ID })
    expect(res.available).toBe(false)
    if (res.available !== false) throw new Error('unreachable')
    expect(res.reason).toBe('ledger-unreadable')
    expect(res.note.includes('注入故障')).toBe(true)
  })

  it('空会话（读到了、就是空的）与读不到是两回事：available=true + 空时间线', async () => {
    const { deps } = setup({}, new FakeDialogueSession(new Map([[WINDOW_A, []]])))
    const res = asOk(await buildDialogue(deps, { requirementId: REQ_ID }))
    expect(res.items).toEqual([])
    expect(res.page).toEqual({ total: 0, hasMore: false })
  })

  it('快照读不到时回落持久化冷读（两条读法按可得性二选一）', async () => {
    const events = [humanEvent(100, 0, '冷读回来的消息')]
    const { deps } = setup({}, new FakeDialogueSession(new Map([[WINDOW_A, events]]), true))
    const res = asOk(await buildDialogue(deps, { requirementId: REQ_ID }))
    expect(res.items.map(i => i.text)).toEqual(['冷读回来的消息'])
  })
})

describe('系统消息：措辞取台账原文、回填带 inferred 标', () => {
  it('阶段推进 / 计划退回 / 中断 / 交接 / 挂起确认 / 验收裁决逐条按原文渲染', async () => {
    const { deps } = setup(
      {
        statusHistory: [
          { status: 'draft', at: 100, by: { kind: 'human' }, reason: '创建（历史回填）', inferred: true },
          { status: 'design', at: 200, by: { kind: 'agent' }, reason: '分析完毕，进入设计' },
          { status: 'decomposing', at: 300, by: { kind: 'agent' } }, // 无 reason → 只报事实
        ],
        plan: {
          path: 'docs/requirements/' + REQ_ID + '/decomposition.md',
          summary: 'x',
          tasks: [],
          submittedAt: 400,
          submittedBy: { kind: 'agent' },
          rejectedAt: 500,
          rejectedReason: '任务粒度太粗，按子卡再拆一层',
        },
        interruption: {
          at: 600,
          reason: 'upstream stream idle 3m ×5',
          stage: 'decomposing',
          pendingAction: 'reqboard_decompose',
        },
        verification: {
          summary: '交付完成',
          evidence: ['pnpm test 全绿'],
          submittedAt: 700,
          submittedBy: { kind: 'agent' },
          reviewedAt: 800,
          reviewedBy: { kind: 'human' },
          decision: 'rework',
          reviewNote: '证据里缺冒烟输出，退回补',
        },
        comments: [
          { id: 'c1', body: '[交接] 窗口 session-window-a → session-window-b', createdAt: 900, createdBy: { kind: 'system' } },
          { id: 'c2', body: '[确认弹框] 用户确认（批准计划）：可以拆', createdAt: 1000, createdBy: { kind: 'human' } },
          { id: 'c3', body: '[里程碑催办] 内部簿记，不该进对话流', createdAt: 1100, createdBy: { kind: 'system' } },
        ],
      },
      new FakeDialogueSession(new Map([[WINDOW_A, []]])),
    )
    const res = asOk(await buildDialogue(deps, { requirementId: REQ_ID, limit: 50 }))
    const systems = res.items.filter(i => i.kind === 'system')

    expect(systems.map(i => i.text)).toEqual([
      '创建（历史回填）',
      '分析完毕，进入设计',
      '阶段推进 → decomposing',
      '任务粒度太粗，按子卡再拆一层',
      'upstream stream idle 3m ×5',
      '证据里缺冒烟输出，退回补',
      '[交接] 窗口 session-window-a → session-window-b',
      '[确认弹框] 用户确认（批准计划）：可以拆',
    ])
    expect(systems.map(i => (i.kind === 'system' ? i.evt : ''))).toEqual([
      'stage-advance',
      'stage-advance',
      'stage-advance',
      'plan-rejected',
      'interrupt',
      'verify',
      'handoff',
      'confirm-pending',
    ])
    // 回填标只打在反推出来的那一条上
    expect(systems.filter(i => i.kind === 'system' && i.inferred === true).map(i => i.at)).toEqual([100])
    // 闭集之外的内部簿记不进对话流
    expect(res.items.some(i => i.text.includes('里程碑催办'))).toBe(false)
  })
})
