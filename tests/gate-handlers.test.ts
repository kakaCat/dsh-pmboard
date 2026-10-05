/**
 * H1 / H4 / H5 三个 handler 测试（REQ-e3b6a0 t7 / FR-2 · FR-5 · FR-6）。
 *
 * H1：Phase B 以台账实时状态回填 verdict/requirementId；
 * H4：按 D5 分流组唤醒消息并投递（压缩过 → 只发摘要；否则带提示词全文）；
 * H5：把各步结果写成链级审计评论。
 *
 * @module dsh-pmboard/tests/gate-handlers
 */
import { describe, it, expect } from 'vitest'
import { makeHarness, req } from './application/harness.js'
import { createH1AdvanceHandler } from '../src/application/gate/handlers/h1-advance.js'
import { createH4ResumeHandler } from '../src/application/gate/handlers/h4-resume.js'
import { createH5AuditHandler } from '../src/application/gate/handlers/h5-audit.js'
import type { ConfirmContext } from '../src/domain/gate/GateSpec.js'
import type { ChainScratch } from '../src/application/gate/GatePostChain.js'

const W = 'session-w-001'
const REQ_ID = 'REQ-000001'

function ctx(over: Partial<ConfirmContext> = {}): ConfirmContext {
  return {
    windowKey: W, gate: 'G1', from: 'brainstorming', to: 'design',
    requirementId: REQ_ID, answers: [{ id: 'confirm', selected: ['确认推进'] }], decidedAt: 1000,
    ...over,
  }
}

describe('H1 推进校验与回填', () => {
  it('台账 status === to → verdict=affirmative 且回填 requirementId', async () => {
    const h = makeHarness({ requirements: [req({ id: REQ_ID, status: 'design', sourceSessionId: W })] })
    const handler = createH1AdvanceHandler({ store: h.store })
    const c = ctx()
    const outcome = await handler.run({ ctx: c })
    expect(outcome).toEqual({ kind: 'continue' })
    expect(c.verdict).toBe('affirmative')
    expect(c.requirementId).toBe(REQ_ID)
  })

  it('未推进到 to（非肯定项）→ verdict=negative 且 skip: not_advanced', async () => {
    const h = makeHarness({ requirements: [req({ id: REQ_ID, status: 'brainstorming', sourceSessionId: W })] })
    const handler = createH1AdvanceHandler({ store: h.store })
    const c = ctx()
    const outcome = await handler.run({ ctx: c })
    expect(outcome).toMatchObject({ kind: 'skip', code: 'not_advanced' })
    expect(c.verdict).toBe('negative')
  })

  it('无归属需求 → verdict=negative 且 skip: no_requirement', async () => {
    const h = makeHarness({ requirements: [] })
    const handler = createH1AdvanceHandler({ store: h.store })
    const c = ctx({ requirementId: undefined })
    const outcome = await handler.run({ ctx: c })
    expect(outcome).toMatchObject({ kind: 'skip', code: 'no_requirement' })
    expect(c.verdict).toBe('negative')
  })
})

/**
 * H4 唤醒（D5 分流）——⚠️ **语义已随 Dive 化变更**。
 *
 * 旧行为：按 D5 分流组装唤醒文案（压缩过只发摘要 / 否则带阶段纪律全文）并投递给窗口。
 * 现行为：`createH4ResumeHandler` 的 `H4ResumeDeps` 已是**空接口**，`deliver` 也从
 * `AgentDeliveryPort` 删除；handler **只**返回
 * `{ kind: 'skip', code: 'dive_handles_resume', reason: '闸门 <gate> 确认后的续跑由Dive自动处理' }`
 * ——把"叫醒窗口"整件事交给 Dive 的 roundDriver（见 `src/application/gate/handlers/h4-resume.ts` 头注）。
 *
 * ⇒ 因此下面各 `it` 的**名字保留自投递实现**（记录 H4 当初按 D5 分流的各类文案场景），
 *   而**断言已按新权威行为改写**：锁「该 ctx/scratch 组合下 H4 只回交给 Dive 的 skip」。
 *   文案组装与投递的断言随 deliver 删除失效，不再保留（不删用例、不 skip）。
 */
describe('H4 唤醒（D5 分流）', () => {
  /** Dive 化后的唯一契约：恒 skip，且 reason 原样回显闸门码（`fmt('闸门 {gate} …')`）。 */
  function expectDiveResumeSkip(outcome: unknown, gate: string): void {
    expect(outcome).toEqual({
      kind: 'skip',
      code: 'dive_handles_resume',
      reason: '闸门 ' + gate + ' 确认后的续跑由Dive自动处理',
    })
  }

  it('H2 已压缩 → 只发作答摘要，不带提示词全文', async () => {
    const handler = createH4ResumeHandler({})
    const scratch: ChainScratch = { promptText: '【design 阶段纪律】不变量A', compacted: true }
    const c = ctx({ verdict: 'affirmative' })
    const outcome = await handler.run({ ctx: c, scratch })
    expectDiveResumeSkip(outcome, c.gate)
  })

  it('H2 跳过/降级 → 摘要 + 阶段纪律提示词全文', async () => {
    const handler = createH4ResumeHandler({})
    const scratch: ChainScratch = { promptText: '【design 阶段纪律】不变量A' }
    const c = ctx({ verdict: 'affirmative' })
    const outcome = await handler.run({ ctx: c, scratch })
    expectDiveResumeSkip(outcome, c.gate)
  })

  it('非肯定项也要唤醒（带用户意见）', async () => {
    const handler = createH4ResumeHandler({})
    const c = ctx({ verdict: 'negative', from: 'brainstorming', to: 'design', answers: [{ id: 'confirm', selected: ['需要修改'], custom: '补边界' }] })
    const outcome = await handler.run({ ctx: c, scratch: {} })
    expectDiveResumeSkip(outcome, c.gate)
  })

  it('无 from 的闸门（G0 立项门）负分支 → 不编造"节点仍在 X"（REQ-260924002956-f37c BUG-2）', async () => {
    const handler = createH4ResumeHandler({})
    // G0 没有 from（尚未绑定需求）：负分支只能说"未通过"，没有"当前节点"可言
    const c = ctx({ gate: 'G0', from: undefined, to: 'brainstorming', requirementId: undefined, verdict: 'negative', answers: [{ id: 'name', selected: ['✖️ 不需要立项'] }] })
    const outcome = await handler.run({ ctx: c, scratch: {} })
    expectDiveResumeSkip(outcome, 'G0')
  })

  it('有 from 的闸门负分支仍印"节点仍在 {from}"（防把 H4 改反）', async () => {
    const handler = createH4ResumeHandler({})
    const c = ctx({ verdict: 'negative', from: 'design', to: 'decomposing' })
    const outcome = await handler.run({ ctx: c, scratch: {} })
    expectDiveResumeSkip(outcome, c.gate)
  })

  it('投递失败 → degraded: not_delivered（不抛）', async () => {
    // 投递已删除：本用例不再可能"投递失败"，改为锁「H4 不因投递而降级，恒 skip」
    const handler = createH4ResumeHandler({})
    const c = ctx({ verdict: 'affirmative' })
    const outcome = await handler.run({ ctx: c, scratch: {} })
    expectDiveResumeSkip(outcome, c.gate)
  })

  // ── 2026-09-26 修正：① 开工令（缺 kickoff）② 空唤醒假话 ──────────────────
  it('缺陷①修正：肯定分支必带「进入本阶段的第一步」（与 STAGE_CHAIN.entry 同源）', async () => {
    const handler = createH4ResumeHandler({})
    const scratch: ChainScratch = { promptText: '【design 阶段纪律】不变量A' }
    const c = ctx({ verdict: 'affirmative', to: 'design' })
    const outcome = await handler.run({ ctx: c, scratch })
    expectDiveResumeSkip(outcome, c.gate)
  })

  it('缺陷①修正：压缩过（只说"纪律在输入包里"）时也要带第一步，否则唤醒仍是空的', async () => {
    const handler = createH4ResumeHandler({})
    const c = ctx({ verdict: 'affirmative', to: 'brainstorming' })
    const outcome = await handler.run({ ctx: c, scratch: { compacted: true } })
    expectDiveResumeSkip(outcome, c.gate)
  })

  it('缺陷①修正：非肯定分支不附开工令（改一版不该收到下一节点的开工令）', async () => {
    const handler = createH4ResumeHandler({})
    const c = ctx({ verdict: 'negative' })
    const outcome = await handler.run({ ctx: c, scratch: { promptText: '【design 阶段纪律】不变量A' } })
    expectDiveResumeSkip(outcome, c.gate)
  })

  it('缺陷②修正：没压缩也没取到词 → 如实说明，不再谎称"已随节点输入包给出"', async () => {
    const handler = createH4ResumeHandler({})
    const c = ctx({ verdict: 'affirmative', gate: 'G0', from: undefined, to: 'brainstorming', requirementId: undefined })
    const outcome = await handler.run({ ctx: c, scratch: { promptSkipped: { code: 'stage_disabled', reason: '分类 bug 的档案跳过阶段 brainstorming，不注入' } } })
    expectDiveResumeSkip(outcome, 'G0')
  })

  it('缺陷②修正：连 skip 原因都没有（scratch 空）也不谎称已给出', async () => {
    const handler = createH4ResumeHandler({})
    const c = ctx({ verdict: 'affirmative', to: 'design' })
    const outcome = await handler.run({ ctx: c, scratch: {} })
    expectDiveResumeSkip(outcome, c.gate)
  })
})

describe('H5 链级审计', () => {
  it('把各步结果写成需求时间线评论', async () => {
    const h = makeHarness({ requirements: [req({ id: REQ_ID, sourceSessionId: W })] })
    const handler = createH5AuditHandler({  store: h.store, now: () => 123, newCommentId: () => 'c-audit' })
    const scratch: ChainScratch = {
      steps: [
        { name: 'h1-advance', outcome: { kind: 'continue' } },
        { name: 'h2-compact', outcome: { kind: 'skip', code: 'doc_not_ready', reason: 'r' } },
        { name: 'h4-resume', outcome: { kind: 'degraded', code: 'not_delivered', reason: 'r' } },
      ],
    }
    const outcome = await handler.run({ ctx: ctx({ verdict: 'affirmative' }), scratch })
    expect(outcome).toEqual({ kind: 'continue' })
    const body = (await h.store.get(REQ_ID))!.comments.at(-1)!.body
    expect(body).toContain('[闸门后置链] G1')
    expect(body).toContain('h1-advance=ok')
    expect(body).toContain('h2-compact=skip（doc_not_ready）')
    expect(body).toContain('h4-resume=degraded（not_delivered）')
  })

  it('无 requirementId → skip: no_requirement（不写台账）', async () => {
    const h = makeHarness({})
    const handler = createH5AuditHandler({  store: h.store, now: () => 1, newCommentId: () => 'c' })
    const outcome = await handler.run({ ctx: ctx({ requirementId: undefined }), scratch: {} })
    expect(outcome).toMatchObject({ kind: 'skip', code: 'no_requirement' })
  })
})
