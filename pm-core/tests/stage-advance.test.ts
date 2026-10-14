/**
 * **阶段推进 = 一个业务方法**（2026-10-11 用户裁定）：
 * `MoveRequirement`（工具通道）与 `ConfirmArtifact` 的确认推进（弹框/看板通道）都调
 * `applyStageAdvance`，一次写盘做三件事：落章本阶段达成位 + **收口当前 goal** + 迁移。
 *
 * 本文件钉住这条路（判据全部来自真实工具调用 `executeMoveRequirement`）：
 *   ① 前进边：落章 `from` + goal 收口（active → complete）+ 状态迁移；
 *   ② 门边（agent 推）：拒绝、零改动（goal 也不能被顺手收口）；
 *   ③ 回退边：不落章（不是"本阶段已成"），但**仍收口 goal**（离开本阶段 = 这段工作结束）；
 *   ④ 人的意图不动：paused / blocked 的 goal 一律不收口；
 *   ⑤ 老台账（没有阶段目标表）：迁移照常、不臆造达成位。
 */
import { describe, it, expect } from 'vitest'
import { executeMoveRequirement } from 'pm-core/application/use-cases/MoveRequirement.js'
import { seedStageGoals } from 'pm-core/domain/workflow/StageGoalSeed.js'
import { makeHarness, req } from 'tests/application/harness.js'
import type { RequirementStatus } from 'pm-core/domain/requirement/RequirementStatus.js'

const exec = { agent: { id: 'session-w-001' } }

type Rec = {
  status: string
  goals?: { stage: string; state: string }[]
  goal?: { phase?: string } | undefined
}

function goal(phase: string) {
  return {
    id: 'goal:REQ-000001:1', objective: '本阶段目标', phase, revision: 1,
    // blocked 是结构化停手：快照必须带原因（严格解码）
    ...(phase === 'blocked' ? { blockedReason: { code: 'round-limit', message: '回合到顶' } } : {}),
  }
}

async function seed(status: RequirementStatus, opts: { goals?: boolean; goalPhase?: string } = {}) {
  const h = makeHarness({
    requirements: [req({
      status,
      ...(opts.goals === false ? {} : { goals: seedStageGoals() as never }),
      ...(opts.goalPhase === undefined ? {} : { goal: goal(opts.goalPhase) as never }),
    })],
  })
  await h.seedSettled()
  return h
}

const rec = (h: Awaited<ReturnType<typeof seed>>) => h.store.peekAll()[0] as never as Rec
const stageState = (h: Awaited<ReturnType<typeof seed>>, stage: string) =>
  rec(h).goals?.find((g) => g.stage === stage)?.state

describe('推进方法（工具通道：reqboard_move）', () => {
  it('① 前进边 design → decomposing：落章 design + **收口 goal** + 迁移（一次写盘）', async () => {
    const h = await seed('design', { goalPhase: 'active' })
    await executeMoveRequirement(h.deps, { to: 'decomposing' }, exec)
    expect(rec(h).status).toBe('decomposing')
    expect(stageState(h, 'design')).toBe('done')
    expect(stageState(h, 'decomposing')).toBe('pending')
    // 关键：目标必须被清掉（留墓碑）—— 否则新阶段的目标建不出来（内核 create 要求无当前目标）
    expect(rec(h).goal).toBeUndefined()
    expect((rec(h) as never as { goalCleared?: { id?: string } }).goalCleared?.id).toBe('goal:REQ-000001:1')
  })

  it('①b goal 已 complete（agent 报过达成）⇒ 同样清掉，给新阶段腾槽位', async () => {
    const h = await seed('design', { goalPhase: 'complete' })
    await executeMoveRequirement(h.deps, { to: 'decomposing' }, exec)
    expect(rec(h).goal).toBeUndefined()
    expect(stageState(h, 'design')).toBe('done')
  })

  it('② 门边（agent 推 brainstorming → design）⇒ 拒绝且台账零改动（goal 不被顺手收口）', async () => {
    const h = await seed('brainstorming', { goalPhase: 'active' })
    await expect(executeMoveRequirement(h.deps, { to: 'design' }, exec))
      .rejects.toMatchObject({ code: 'REQBOARD_HUMAN_GATE' })
    expect(rec(h).status).toBe('brainstorming')
    expect(rec(h).goal?.phase).toBe('active')   // 拒绝 = 零改动：目标也不能被顺手清掉
    expect(stageState(h, 'brainstorming')).toBe('pending')
  })

  it('③ 回退边 implementing → design：不落章（不是"本阶段已成"），但清 goal（离开本阶段）', async () => {
    const h = await seed('implementing', { goalPhase: 'active' })
    await executeMoveRequirement(h.deps, { to: 'design', reason: '回退返工' }, exec)
    expect(rec(h).status).toBe('design')
    expect(stageState(h, 'design')).toBe('pending')
    expect(stageState(h, 'implementing')).toBe('pending')
    expect(rec(h).goal).toBeUndefined()
  })

  it('④ 人的意图不动：paused / blocked 的 goal 一律不清（阶段推进无权解除人的停手）', async () => {
    for (const phase of ['paused', 'blocked']) {
      const h = await seed('design', { goalPhase: phase })
      await executeMoveRequirement(h.deps, { to: 'decomposing' }, exec)
      expect(rec(h).status).toBe('decomposing')
      expect(rec(h).goal?.phase, phase).toBe(phase)
    }
  })

  it('⑤ 老台账没有阶段目标表 ⇒ 迁移照常、不臆造达成位', async () => {
    const h = await seed('design', { goals: false, goalPhase: 'active' })
    await executeMoveRequirement(h.deps, { to: 'decomposing' }, exec)
    expect(rec(h).status).toBe('decomposing')
    expect(rec(h).goals).toBeUndefined()
    expect(rec(h).goal).toBeUndefined()   // 清目标与阶段表无关：没有表也照清
  })
})
