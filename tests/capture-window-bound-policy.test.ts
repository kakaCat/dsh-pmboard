/**
 * 本窗口接第二个项目 / 把项目交给新窗口（REQ-261003215944-9e04 FR-4 · t6）。
 *
 * 【为什么要有这道门】
 * 改造前，一个窗口只要有一条在飞需求，**第二条连弹框都弹不出来**（前置就 `REQBOARD_WINDOW_BOUND`）。
 * 用户现场的表现是"想开第二件事，系统说不行"。本卡把它从"一律拒绝"改成**显式选择**：
 *   · `second`（缺省）= 本窗口接第二个项目，自己当 owner；
 *   · `handoff`       = 开一个新窗口，需求记在**它**名下（本窗口只留指针）。
 *
 * 【四条判据】
 *   ① second：回执 success + 新需求的 sourceSessionId == 本窗口；
 *   ② handoff：回执带新 windowKey，且新需求记在**新窗口**名下（不是本窗口）；
 *   ③ 缺省不传 = second（向后兼容语义变化，不再拒绝）；
 *   ④ 非法值 / handoff 但无开窗能力 → 结构化拒绝，不静默降级成 second。
 */
import { describe, it, expect } from 'vitest'
import { makeHarness, req } from './application/harness.js'
import { captureRequirement } from '../src/application/use-cases/CaptureRequirement.js'
import { FakeQuestions } from './application/harness.js'
import type { AskAnswer, WindowOpenerPort } from '../src/application/ports.js'

const W = 'session-first-window'
const FIRST = 'REQ-261003215944-9e04'
const SECOND = 'REQ-261003215944-9e05'

/** 四问作答（label 必须与枚举原值严格相等，否则映射回落默认——见 capture-mapping 注释）。 */
const ANSWERS: AskAnswer[] = [
  { id: 'name', selected: ['第二个项目'] },
  { id: 'category', selected: ['feature'] },
  { id: 'difficulty', selected: ['standard'] },
  { id: 'location', selected: ['docs/requirements/<REQ>/'] },
] as never

/** 已绑定一条在飞需求的窗口。 */
function seeded(opener?: WindowOpenerPort): ReturnType<typeof makeHarness> {
  const h = makeHarness({
    requirements: [req({
      id: FIRST, status: 'implementing', category: 'feature', sourceSessionId: W,
      dive: { phase: 'active', activation: 'armed', roundsInStage: 0 } as never,
    })],
  })
  const q = new FakeQuestions()
  q.answers = ANSWERS
  h.deps.questions = q
  h.deps.rejections = { record: () => undefined, readAll: async () => [] } as never
  h.deps.ids = { requirement: () => SECOND, task: () => 't-ffffff', comment: () => 'c-1' } as never
  if (opener !== undefined) h.deps.windowOpener = opener
  return h
}

/** 假开窗能力：create 返回一个新窗口码。 */
function opener(newKey: string | undefined, available = true): WindowOpenerPort {
  return {
    available: () => available,
    fork: async () => ({ ok: true, windowKey: 'session-forked', parentSessionId: W }),
    // REQ-261004150249-731e FR-1：handoff 开窗前必须先解析出源项目落点（这里声明 workspace），
    // 解析不出＝响亮失败而不是在宿主目录建窗（该判据见 open-window-project-root.test.ts）。
    resolveSourceProject: () => ({ workspaceId: 'ws-handoff' }),
    create: async () => (newKey === undefined
      ? { ok: false, code: 'open_failed', reason: '宿主拒了' }
      : { ok: true, windowKey: newKey }),
  } as WindowOpenerPort
}

async function capture(h: ReturnType<typeof makeHarness>, args: unknown) {
  return await captureRequirement(h.deps, args, { agent: { id: W } }) as Record<string, unknown>
}

describe('FR-4：已绑定时按 onWindowBound 选择分支', () => {
  it('① second：本窗口接第二个项目（新需求 sourceSessionId == 本窗口）', async () => {
    const h = seeded()
    const out = await capture(h, { onWindowBound: 'second' })
    expect(out.success).toBe(true)
    expect(out.bound_policy).toBe('second')
    expect(out.window_key).toBeUndefined()
    const created = (await h.store.get(String(out.requirement_id)))!
    expect(created.sourceSessionId).toBe(W)
    // 本窗口现在有两条在飞需求——这正是本卡要打开的局面
    const all = await h.store.listSummaries({ scope: 'all', limit: 50 })
    expect(all.items.filter(r => r.sourceSessionId === W)).toHaveLength(2)
  })

  it('② handoff：开新窗口，需求记在**它**名下（本窗口只留指针）', async () => {
    const NEW = 'session-second-window'
    const h = seeded(opener(NEW))
    const out = await capture(h, { onWindowBound: 'handoff' })
    expect(out.success).toBe(true)
    expect(out.bound_policy).toBe('handoff')
    expect(out.window_key).toBe(NEW)
    expect(String(out.note)).toContain(NEW)
    const created = (await h.store.get(String(out.requirement_id)))!
    expect(created.sourceSessionId).toBe(NEW)   // 不在本窗口名下
  })

  it('③ 缺省（不传）= second：不再一律拒绝', async () => {
    const h = seeded()
    const out = await capture(h, {})
    expect(out.success).toBe(true)
    expect(out.bound_policy).toBe('second')
  })

  it('④ 非法值 → REQBOARD_INVALID_INPUT；handoff 无开窗能力 → OPEN_WINDOW_UNAVAILABLE（不静默降级）', async () => {
    await expect(capture(seeded(), { onWindowBound: 'nope' })).rejects.toThrow(/REQBOARD_INVALID_INPUT/)

    const noOpener = seeded()
    await expect(capture(noOpener, { onWindowBound: 'handoff' })).rejects.toThrow(/REQBOARD_OPEN_WINDOW_UNAVAILABLE/)

    const failing = seeded(opener(undefined))
    await expect(capture(failing, { onWindowBound: 'handoff' })).rejects.toThrow(/REQBOARD_OPEN_WINDOW_UNAVAILABLE/)
  })

  it('⑤ 未绑定 + handoff → 也真开新窗口，需求记在**新窗口**名下（委派立项）', async () => {
    // 修复前这里被静默忽略：不开窗、需求落回本窗口，回执照报 bound_policy=handoff。
    // 现场后果：开窗委派的窗口以为需求派出去了，实际三条工作面一条都没立起来。
    const NEW = 'session-delegated'
    const h = makeHarness({ requirements: [] })
    const q = new FakeQuestions()
    q.answers = ANSWERS
    h.deps.questions = q
    h.deps.ids = { requirement: () => SECOND, task: () => 't-ffffff', comment: () => 'c-1' } as never
    h.deps.windowOpener = opener(NEW)
    const out = await capture(h, { onWindowBound: 'handoff' })
    expect(out.success).toBe(true)
    expect(out.bound_policy).toBe('handoff')
    expect(out.window_key).toBe(NEW)                    // 真的换了窗
    expect(String(out.note)).toContain(NEW)
    const created = (await h.store.get(String(out.requirement_id)))!
    expect(created.sourceSessionId).toBe(NEW)           // 不在本窗口名下
  })

  it('⑥ 未绑定 + 缺省（或不传）→ 仍记本窗口（回归保护：老行为不变）', async () => {
    const h = makeHarness({ requirements: [] })
    const q = new FakeQuestions()
    q.answers = ANSWERS
    h.deps.questions = q
    h.deps.ids = { requirement: () => SECOND, task: () => 't-ffffff', comment: () => 'c-1' } as never
    const out = await capture(h, { onWindowBound: 'second' })
    expect(out.success).toBe(true)
    expect(out.window_key).toBeUndefined()
    const created = (await h.store.get(String(out.requirement_id)))!
    expect(created.sourceSessionId).toBe(W)
  })

  it('⑦ 未绑定 + handoff 但开窗能力缺失/开窗失败 → 如实拒绝，不静默降级成 second', async () => {
    const bare = makeHarness({ requirements: [] })
    const q = new FakeQuestions()
    q.answers = ANSWERS
    bare.deps.questions = q
    bare.deps.ids = { requirement: () => SECOND, task: () => 't-ffffff', comment: () => 'c-1' } as never
    await expect(capture(bare, { onWindowBound: 'handoff' })).rejects.toThrow(/REQBOARD_OPEN_WINDOW_UNAVAILABLE/)

    const failing = makeHarness({ requirements: [] })
    const q2 = new FakeQuestions()
    q2.answers = ANSWERS
    failing.deps.questions = q2
    failing.deps.ids = { requirement: () => SECOND, task: () => 't-ffffff', comment: () => 'c-1' } as never
    failing.deps.windowOpener = opener(undefined)
    await expect(capture(failing, { onWindowBound: 'handoff' })).rejects.toThrow(/REQBOARD_OPEN_WINDOW_UNAVAILABLE/)
  })
})
