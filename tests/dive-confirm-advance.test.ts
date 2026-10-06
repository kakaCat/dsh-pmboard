/**
 * 推进弹框与看板「继续」接到同一个 dive 方法（REQ-261003215944-9e04 FR-10 · t11）。
 *
 * 【为什么要有这道门】
 * 现场观感是「人工门确认后不自动续跑」：确认路径原先**完全不碰 dive**——阶段推进虽然会把
 * 回合计数归零，但**运行时暂停位没人复位**，于是人确认了、链还是停着；同阶段的确认更是
 * 什么都不发生。本卡把两条确认入口（弹框收敛点 `confirm-settle`、会话/工具入口 `ConfirmArtifact`）
 * 统一接到 `confirm-advance` 事件。
 *
 * 【三条判据 + 一条红线】
 *   ① 达上限停下时，人确认推进 → 回合计数归零 + 运行时健康复位；
 *   ② 人先按过 clear_pause（disarmed+idle）再确认推进 → **自动化仍然关着**（activation 不被改写）；
 *   ③ 看板「继续」是**唯一**能把 automation 打开的动作，且留痕记 human；
 *   ④ 红线：任何确认路径都不得代人选「继续」。
 */
import { describe, it, expect } from 'vitest'
import { makeHarness, req } from './application/harness.js'
import { applyConfirmDecision } from '../src/application/internal/confirm-settle.js'
import { armExplicit } from '../src/application/internal/rearm.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const REQ_ID = 'REQ-261003215944-9e04'
const AGENT = 'session-confirm-advance'

/** 播种：brainstorming，带一份已登记未确认的需求文档（够走到"确认即推进"）。 */
function seeded(over: Partial<RequirementRecord> = {}): ReturnType<typeof makeHarness> {
  const h = makeHarness({
    requirements: [req({
      id: REQ_ID,
      status: 'brainstorming',
      category: 'feature',
      autoRun: true,
      sourceSessionId: AGENT,
      dive: { phase: 'active', activation: 'armed', roundsInStage: 0 } as never,
      artifacts: [{
        stage: 'brainstorming', kind: 'requirement',
        path: 'docs/requirements/' + REQ_ID + '/requirement.md', registeredAt: 1,
      } as never],
      ...over,
    })],
  })
  // REQ-261005105032-3b02：需求文档要真的在盘上（裁定门读它的「讨论与裁定记录（D-x）」节）——
  // 播种原先只登记了产物、没落文档；补一份含真空态的最小文档，断言一行不改。
  h.docs.put('docs/requirements/' + REQ_ID + '/requirement.md',
    '# 需求\n\n## 讨论与裁定记录（D-x）\n\n本节无裁定\n')
  return h
}

/** 人确认这条路：落章 + 推进（与弹框作答同一条收敛点）。 */
async function confirm(h: ReturnType<typeof makeHarness>, advance = true) {
  return applyConfirmDecision(h.deps, {}, {
    requirementId: REQ_ID, windowKey: AGENT, target: 'artifact', kind: 'requirement',
    question: 'q', picked: '确认，推进到下一阶段 (Recommended)', nowTs: h.clock.t, advance,
  })
}

describe('FR-10：确认推进之后自动链能接着跑', () => {
  it('① 达上限停下（round-limit）→ 人确认推进：回合计数归零 + 健康复位 + activation 未被改写', async () => {
    const h = seeded({
      dive: {
        phase: 'active', activation: 'armed', roundsInStage: 3,
        driverHealth: { state: 'paused', reason: 'round-limit:brainstorming', since: 1, attempts: 2 },
      } as never,
    })
    const out = await confirm(h)
    expect(out.advanced).toBe(true)

    const dive = (await h.store.get(REQ_ID))!.dive!
    expect(dive.roundsInStage).toBe(0)                              // 本阶段额度还回去了
    expect(dive.driverHealth?.state).toBe('healthy')                // 停手位复位——链能接着跑
    expect(dive.activation).toBe('armed')                           // 红线：确认推进不改人的意图
  })

  it('② 人先 clear_pause（disarmed + idle）再确认推进 → 自动化仍然关着', async () => {
    const h = seeded({
      dive: { phase: 'idle', activation: 'disarmed', roundsInStage: 0 } as never,
    })
    await confirm(h)
    const dive = (await h.store.get(REQ_ID))!.dive!
    expect(dive.activation).toBe('disarmed')   // 红线：不许代人选「继续」
    expect(dive.phase).toBe('idle')
  })

  it('③ 同阶段确认（未跨阶段）也复位停手位——否则"确认了、链却不动"', async () => {
    const h = seeded({
      dive: {
        phase: 'active', activation: 'armed', roundsInStage: 2,
        driverHealth: { state: 'paused', reason: 'round-limit:brainstorming', since: 1, attempts: 1 },
      } as never,
    })
    // advance=false 模拟"本阶段无处可推"的同阶段确认（落章仍然发生）
    await confirm(h, false)
    const dive = (await h.store.get(REQ_ID))!.dive!
    expect(dive.driverHealth?.state).toBe('healthy')
    expect(dive.activation).toBe('armed')
  })

  it('④ 看板「继续」是唯一能打开自动化的动作（留痕记 human）', async () => {
    const h = seeded({ dive: { phase: 'idle', activation: 'disarmed', roundsInStage: 0 } as never })
    const changed = await armExplicit({ store: h.store, now: () => h.clock.t }, REQ_ID, 'board-resume')
    expect(changed).toBe(true)
    const r = (await h.store.get(REQ_ID))!
    expect(r.dive!.activation).toBe('armed')
    expect(r.comments.at(-1)?.createdBy?.kind).toBe('human')
  })

  it('⑤ 幂等：确认路径重放不会重复写（第二次无变化）', async () => {
    const h = seeded({
      dive: {
        phase: 'active', activation: 'armed', roundsInStage: 2,
        driverHealth: { state: 'paused', reason: 'round-limit:brainstorming', since: 1, attempts: 1 },
      } as never,
    })
    await confirm(h, false)
    const after1 = JSON.stringify((await h.store.get(REQ_ID))!.dive)
    await confirm(h, false)
    expect(JSON.stringify((await h.store.get(REQ_ID))!.dive)).toBe(after1)
  })
})
