/**
 * 席位授权地基（REQ-261003215944-9e04 FR-3 · t-dd3067 **切片一**）。
 *
 * 【为什么先做这一层】
 * 「授权从窗口绑定改为席位」是一次架构级改造：全仓有 16 处 `bound[0]`（隐含"第一条就是我的"）
 * 与 15 个用例的校验点。本切片先把它**判定所依赖的那几个纯函数**立起来并锁死口径，
 * 清扫（把 16 处换成 `firstWritableBound`、把 owner-only 动作按 `canWrite` 拦截）留给后续，
 * ——这样每一步结束树都是绿的，且后续清扫有可依据的判据而不是凭手感。
 *
 * 【五条判据】
 *   ① 角色 × 动作矩阵：observer 不能写、worker 不能推阶段/把关、owner 全可、只读人人可；
 *   ② 没有席位 = 不能写（不是"默认放行"，也不是"默认拒绝一切"——只读仍可）；
 *   ③ 存量折算等价：无 seats 的记录按单 owner 判定，行为与改造前逐字一致；
 *   ④ `firstWritableBound` 在只有第二条属于本窗口时，能跳过第一条（这正是 `bound[0]` 做不到的）；
 *   ⑤ 纯函数：不读时钟、不改入参。
 */
import { describe, it, expect } from 'vitest'
import { canWrite, firstWritableBound, seatOf, seatOfSummary, type SeatAction } from '../src/application/internal/window.js'
import type { RequirementSummary } from '../src/domain/requirement/RequirementSummary.js'
import type { WindowSeat } from '../src/shared/protocol.js'

const W = 'session-me'
const OTHER = 'session-other'

const seat = (role: WindowSeat['role'], windowKey = W): WindowSeat =>
  ({ windowKey, role, joinedAt: 1000 })

const ACTIONS: SeatAction[] = ['move-requirement', 'confirm-gate', 'submit-artifact', 'claim-task', 'report-task', 'read']

describe('① 角色 × 动作矩阵（FR-3）', () => {
  it('owner 六个动作全可', () => {
    for (const action of ACTIONS) expect(canWrite(seat('owner'), action).ok, action).toBe(true)
  })

  it('worker 能领卡/汇报/提交产物，但**不能**推阶段、不能把关人工门', () => {
    const worker = seat('worker')
    expect(canWrite(worker, 'claim-task').ok).toBe(true)
    expect(canWrite(worker, 'report-task').ok).toBe(true)
    expect(canWrite(worker, 'submit-artifact').ok).toBe(true)
    expect(canWrite(worker, 'read').ok).toBe(true)
    for (const action of ['move-requirement', 'confirm-gate'] as SeatAction[]) {
      const r = canWrite(worker, action)
      expect(r.ok).toBe(false)
      expect(r.ok === false && r.code).toBe('REQBOARD_SEAT_NOT_OWNER')
    }
  })

  it('observer 只读：任何写动作都被拒（码可辨）', () => {
    const observer = seat('observer')
    expect(canWrite(observer, 'read').ok).toBe(true)
    for (const action of ACTIONS.filter(a => a !== 'read')) {
      const r = canWrite(observer, action)
      expect(r.ok, action).toBe(false)
      expect(r.ok === false && r.code).toBe('REQBOARD_SEAT_READONLY')
    }
  })

  it('② 没有席位：写动作拒（REQBOARD_NO_SEAT），只读仍可', () => {
    expect(canWrite(undefined, 'read').ok).toBe(true)
    for (const action of ACTIONS.filter(a => a !== 'read')) {
      const r = canWrite(undefined, action)
      expect(r.ok, action).toBe(false)
      expect(r.ok === false && r.code).toBe('REQBOARD_NO_SEAT')
    }
  })

  // 验收锚点「6 个动作 × 3 个角色」——把 18 格写成一张表逐格钉死，漏一格即失败
  // （上面三条是叙述性断言，这一条是**计数**断言：改枚举时它先亮）。
  it('覆盖矩阵：3 角色 × 6 动作 = 18 格全钉（防漏格）', () => {
    const table: Record<WindowSeat['role'], Record<SeatAction, boolean>> = {
      owner: { 'move-requirement': true, 'confirm-gate': true, 'submit-artifact': true, 'claim-task': true, 'report-task': true, read: true },
      worker: { 'move-requirement': false, 'confirm-gate': false, 'submit-artifact': true, 'claim-task': true, 'report-task': true, read: true },
      observer: { 'move-requirement': false, 'confirm-gate': false, 'submit-artifact': false, 'claim-task': false, 'report-task': false, read: true },
    }
    const roles: WindowSeat['role'][] = ['owner', 'worker', 'observer']
    let cells = 0
    for (const role of roles) {
      for (const action of ACTIONS) {
        expect(canWrite(seat(role), action).ok, role + ' × ' + action).toBe(table[role][action])
        cells += 1
      }
    }
    expect(cells).toBe(18)
  })
})

describe('③ 存量折算：无 seats 的记录与改造前逐字一致', () => {
  it('seatOf：无 seats → 折算单 owner；别人不是它的席位', () => {
    const legacy = { sourceSessionId: W, createdAt: 555 }
    expect(seatOf(legacy, W)).toEqual({ windowKey: W, role: 'owner', joinedAt: 555 })
    expect(seatOf(legacy, OTHER)).toBeUndefined()
  })

  it('seatOfSummary：同口径（无 seats 时按 sourceSessionId 折算）', () => {
    expect(seatOfSummary({ sourceSessionId: W }, W)).toMatchObject({ windowKey: W, role: 'owner' })
    expect(seatOfSummary({ sourceSessionId: W }, OTHER)).toBeUndefined()
    // 有 seats 时以 seats 为准（sourceSessionId 可能只是历史来源）
    expect(seatOfSummary({ sourceSessionId: OTHER, seats: [seat('worker')] }, W)).toMatchObject({ role: 'worker' })
  })
})

describe('④ firstWritableBound：按席位取，而不是无脑取第一条', () => {
  const summary = (over: Partial<RequirementSummary>): RequirementSummary =>
    ({ id: 'REQ-x', title: 't', status: 'implementing', ...over } as RequirementSummary)

  it('第一条不是我的、第二条是 → 取第二条（这是 bound[0] 做不到的）', () => {
    const list = [summary({ sourceSessionId: OTHER }), summary({ sourceSessionId: W })]
    expect(firstWritableBound(list, W)?.sourceSessionId).toBe(W)
  })

  it('第一条我是 observer、第二条我是 owner → 推阶段时取第二条', () => {
    const list = [
      summary({ seats: [{ windowKey: W, role: 'observer', joinedAt: 1 }] }),
      summary({ seats: [{ windowKey: W, role: 'owner', joinedAt: 2 }] }),
    ]
    expect(firstWritableBound(list, W, 'move-requirement')).toBe(list[1])
    // 只读动作下第一条也算"可写"（read 不需要席位），故取第一条——行为可解释
    expect(firstWritableBound(list, W, 'read')).toBe(list[0])
  })

  it('一条都不属于我 → undefined（调用方据此走"没有绑定需求"的既有拒绝）', () => {
    expect(firstWritableBound([summary({ sourceSessionId: OTHER })], W)).toBeUndefined()
  })

  it('存量列表（无 seats）→ 与 bound[0] 等价', () => {
    const list = [summary({ sourceSessionId: OTHER }), summary({ sourceSessionId: W })]
    // 改造前是 bound[0] = 第一条（别人的）→ 现在正确地跳过它；这条差异正是 FR-3 的收益
    expect(list[0]!.sourceSessionId).toBe(OTHER)
    expect(firstWritableBound(list, W)?.sourceSessionId).toBe(W)
  })
})

// ⑤ 起的断言**曾经 skip**：入口侧的 owner-only 检查已就位，但「本窗口的绑定列表」当时仍由
// `boundSummariesOf` 按 sourceSessionId 单值过滤，于是"只有 worker 席位、sourceSessionId 指向别人"
// 的需求根本进不了 bound，会先被「本窗口没有绑定中的需求」拦下——断言测不到它要测的东西。
// 现在 `boundSummariesOf` 已席位化（两条来源并取），故启用；⑥ 直接锁死这个缝本身。
describe('⑤ owner-only 的端到端拦截（FR-3 核心行为）', () => {
  it('worker 席位调用推阶段入口 → 拿到越权码而不是"成功推进"', async () => {
    const { executeMoveRequirement } = await import('../src/application/use-cases/MoveRequirement.js')
    const { makeHarness, req } = await import('./application/harness.js')
    const h = makeHarness({
      requirements: [req({
        id: 'REQ-261003215944-9e04', status: 'brainstorming', category: 'feature',
        // 本窗口在这条需求上只是 worker（另一个人是 owner）
        seats: [
          { windowKey: OTHER, role: 'owner', joinedAt: 1 },
          { windowKey: W, role: 'worker', joinedAt: 2 },
        ] as never,
        dive: { phase: 'active', activation: 'armed', roundsInStage: 0 } as never,
      })],
    })
    await expect(executeMoveRequirement(h.deps, { to: 'design' }, { agent: { id: W } }))
      .rejects.toMatchObject({ code: 'REQBOARD_SEAT_NOT_OWNER' })
  })

  it('反向：owner 席位推阶段不会被这条拦截（证明不是"谁都推不动"）', async () => {
    const { executeMoveRequirement } = await import('../src/application/use-cases/MoveRequirement.js')
    const { makeHarness, req } = await import('./application/harness.js')
    const h = makeHarness({
      requirements: [req({
        id: 'REQ-261003215944-9e04', status: 'brainstorming', category: 'feature',
        seats: [{ windowKey: W, role: 'owner', joinedAt: 1 }] as never,
        dive: { phase: 'active', activation: 'armed', roundsInStage: 0 } as never,
      })],
    })
    await executeMoveRequirement(h.deps, { to: 'design' }, { agent: { id: W } }).then(
      () => undefined,
      (err: { code?: string }) => expect(err.code).not.toBe('REQBOARD_SEAT_NOT_OWNER'),
    )
  })

  // 这两条是"按席位授权"最关键的一对：同一条需求、同一张卡，只差角色。
  // 改造前它们都到不了角色判定——`sourceSessionId` 是别人，入口就按"本窗口没有绑定中的需求"拒了。
  const seedTaskCase = async (role: 'worker' | 'observer') => {
    const { makeHarness, req, task } = await import('./application/harness.js')
    const h = makeHarness()
    h.seedRequirementSync(req({
      id: 'REQ-261003215944-9e04', status: 'implementing', category: 'feature',
      sourceSessionId: OTHER, // 立项的是别人：只有席位能证明"我在这条上有份"
      seats: [
        { windowKey: OTHER, role: 'owner', joinedAt: 1 },
        { windowKey: W, role, joinedAt: 2 },
      ] as never,
    }))
    await h.seedSettled()
    await h.setTasks('REQ-261003215944-9e04', [
      task({ id: 't-w1', requirementId: 'REQ-261003215944-9e04', status: 'todo', title: 'worker 的卡' }),
    ])
    return h
  }

  it('worker 席位推**自己的卡**必须通过（FR-3 正向）', async () => {
    const { executeMoveTask } = await import('../src/application/use-cases/MoveTask.js')
    const h = await seedTaskCase('worker')
    const out = await executeMoveTask(h.deps, { task_id: 't-w1', to: 'in_progress' }, { agent: { id: W } }) as { success?: boolean }
    expect(out.success).toBe(true)
    expect((await h.tasksOf('REQ-261003215944-9e04')).find(t => t.id === 't-w1')!.status).toBe('in_progress')
  })

  it('observer 席位**看得见但写不动**（绑定 ≠ 可写，防席位改造变成放权）', async () => {
    const { executeMoveTask } = await import('../src/application/use-cases/MoveTask.js')
    const h = await seedTaskCase('observer')
    await expect(executeMoveTask(h.deps, { task_id: 't-w1', to: 'in_progress' }, { agent: { id: W } }))
      .rejects.toMatchObject({ code: 'REQBOARD_SEAT_READONLY' })
    // 拒绝是**零写入**的：卡仍在 todo（不是"先改了再报错"）
    expect((await h.tasksOf('REQ-261003215944-9e04')).find(t => t.id === 't-w1')!.status).toBe('todo')
  })
})

describe('⑥ 绑定列表按席位取（boundSummariesOf · FR-3 的入口缝）', () => {
  const boot = async () => {
    const { makeHarness, req } = await import('./application/harness.js')
    const { boundSummariesOf } = await import('../src/application/internal/binding-read.js')
    return { makeHarness, req, boundSummariesOf }
  }

  it('席位派给我（sourceSessionId 是别人）也算绑定——改造前这条取不到', async () => {
    const { makeHarness, req, boundSummariesOf } = await boot()
    const h = makeHarness({
      requirements: [req({
        id: 'REQ-seated', status: 'implementing', category: 'feature',
        sourceSessionId: OTHER,
        seats: [
          { windowKey: OTHER, role: 'owner', joinedAt: 1 },
          { windowKey: W, role: 'worker', joinedAt: 2 },
        ] as never,
      })],
    })
    expect((await boundSummariesOf(h.store, W)).map((s) => s.id)).toEqual(['REQ-seated'])
  })

  it('存量记录（无 seats）经折算仍绑定；只读角色也可见（可见 ≠ 可写）', async () => {
    const { makeHarness, req, boundSummariesOf } = await boot()
    const h = makeHarness({
      requirements: [
        req({ id: 'REQ-legacy', status: 'implementing', category: 'feature', sourceSessionId: W }),
        req({
          id: 'REQ-observer', status: 'implementing', category: 'feature', sourceSessionId: OTHER,
          seats: [{ windowKey: W, role: 'observer', joinedAt: 3 }] as never,
        }),
      ],
    })
    expect((await boundSummariesOf(h.store, W)).map((s) => s.id).sort()).toEqual(['REQ-legacy', 'REQ-observer'])
  })

  it('席位是权威：seats 里没有我，即便 sourceSessionId 是我 → 不进绑定列表', async () => {
    const { makeHarness, req, boundSummariesOf } = await boot()
    const h = makeHarness({
      requirements: [req({
        id: 'REQ-handover', status: 'implementing', category: 'feature', sourceSessionId: W,
        seats: [{ windowKey: OTHER, role: 'owner', joinedAt: 1 }] as never,
      })],
    })
    expect(await boundSummariesOf(h.store, W)).toEqual([])
  })

  it('关闭态不进绑定列表（开放态判定未被绕过）', async () => {
    const { makeHarness, req, boundSummariesOf } = await boot()
    const h = makeHarness({
      requirements: [req({
        id: 'REQ-done', status: 'done', category: 'feature', sourceSessionId: W,
        dive: { phase: 'active', activation: 'armed', roundsInStage: 0 } as never,
      })],
    })
    expect(await boundSummariesOf(h.store, W)).toEqual([])
  })
})
