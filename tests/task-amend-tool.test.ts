/**
 * reqboard_task_amend 工具壳契约（REQ-261007220012-bd29 FR-4）——修缮簇单入口。
 * serves: FR-4
 *
 * 三段行为等价由原用例测试背书（adopt-task / regenerate-chain / backfill-task-refs 已改打本工具）；
 * 本文件只钉**壳层**的三件事：
 *   ① op 必填与枚举校验：缺 op / 未知 op → REQBOARD_INVALID_INPUT；
 *   ② op 与必填项不匹配 → 拒绝且 message 点名该 op 的必填集；
 *   ③ 分派与渲染：三个 op 各命中自己的用例分支（渲染按 op 选摘要）。
 */
import { describe, expect, it } from 'vitest'
import { defineTaskAmendTool, TASK_AMEND_OPS } from '../src/tools/index.js'
import { taskAmendSummary } from '../src/tools/TaskAmendTool/summary.js'
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import { makeHarness, req } from './application/harness.js'

const W = 'session-w-001'
const exec = { agent: { id: W } }

/** 最小 deps：本文件只走「壳层拒绝」与「渲染」两条路径，不触台账。 */
function tool(): { execute: (a: unknown, e: unknown) => Promise<Record<string, any>> } {
  return defineTaskAmendTool({ session: { windowKey: () => W } } as never) as never
}

async function codeOf(args: unknown): Promise<{ code?: string; message?: string; out?: Record<string, any> }> {
  try {
    const out = await tool().execute(args, exec)
    return { out }
  } catch (e) {
    const err = e as { code?: string; message?: string }
    return { code: err.code, message: String(err.message ?? err) }
  }
}

describe('reqboard_task_amend 壳层契约（FR-4）', () => {
  it('op 枚举受控：refs / adopt / chain / archive / interruption，且是绑定层强制的必填项', () => {
    expect([...TASK_AMEND_OPS]).toEqual(['refs', 'adopt', 'chain', 'archive', 'interruption'])
    const def = defineTaskAmendTool({} as never) as any
    expect(def.parameters.properties.op.enum).toEqual(['refs', 'adopt', 'chain', 'archive', 'interruption'])
    expect(def.parameters.required).toEqual(['op'])
  })

  it('缺 op / 未知 op → 拒绝（不静默挑一个动作）', async () => {
    // 缺 op：绑定层按 required 直接拒（INVALID_ARGS）——比壳层更早一层，同样响亮
    const noOp = await codeOf({ task_id: 't-x' })
    expect(noOp.out).toBeUndefined()
    expect(String(noOp.message)).toContain('op')

    // 未知 op：绑定层 enum 拒（若直调绕过绑定层，壳层仍兜一层 REQBOARD_INVALID_INPUT）
    const badOp = await codeOf({ op: 'refactor', task_id: 't-x' })
    const text = String(badOp.out?.error ?? badOp.message ?? '')
    expect(text).toMatch(/refactor|refs/)
  })

  it('op=refs 缺必填项 → 拒绝并点名 refs 必填集', async () => {
    const r = await codeOf({ op: 'refs', task_id: 't-x' })
    expect(r.out?.op).toBe('refs')
    expect(r.out?.success).toBe(false)
    expect(String(r.out?.error)).toContain('REQBOARD_INVALID_INPUT')
    expect(String(r.out?.error)).toContain('requirement_refs')
    expect(String(r.out?.error)).toContain('reason')
  })

  it('op=adopt 缺必填项 → 拒绝并点名 adopt 必填集', async () => {
    const r = await codeOf({ op: 'adopt', task_id: 't-x' })
    expect(r.out?.success).toBe(false)
    expect(String(r.out?.error)).toContain('REQBOARD_INVALID_INPUT')
    expect(String(r.out?.error)).toContain('parent_id')
  })

  it('op=chain 缺省 dry_run（只读诊断）不要求 task_id/reason；dry_run:false 则要求', async () => {
    // dry_run 缺省：本壳不拦（交给用例按绑定/需求状态裁决）——这里只证明**壳层不误报必填**
    const dry = await codeOf({ op: 'chain' })
    expect(String(dry.out?.error ?? '')).not.toContain('REQBOARD_INVALID_INPUT')
    // dry_run:false：壳层点名必填集
    const apply = await codeOf({ op: 'chain', dry_run: false })
    expect(apply.out?.success).toBe(false)
    expect(String(apply.out?.error)).toContain('task_id')
    expect(String(apply.out?.error)).toContain('reason')
  })

  it('op=archive 缺必填项 → 拒绝并点名 archive 必填集', async () => {
    const r = await codeOf({ op: 'archive' })
    expect(r.out?.op).toBe('archive')
    expect(r.out?.success).toBe(false)
    expect(String(r.out?.error)).toContain('REQBOARD_INVALID_INPUT')
    expect(String(r.out?.error)).toContain('docs')
    expect(String(r.out?.error)).toContain('reason')
    // 缺 reason（docs 给了）也要点名 reason，且缺失清单里只有 reason
    const r2 = await codeOf({ op: 'archive', docs: [{ kind: 'notes', path: 'a.md' }] })
    expect(String(r2.out?.error)).toContain('缺必填项 [reason]')
  })

  it('op=interruption 缺 reason → 拒绝并点名 interruption 必填集', async () => {
    const r = await codeOf({ op: 'interruption' })
    expect(r.out?.op).toBe('interruption')
    expect(r.out?.success).toBe(false)
    expect(String(r.out?.error)).toContain('缺必填项 [reason]')
  })

  it('渲染按 op 选摘要（🏷️ refs / 归属 adopt / 子卡链 chain / 归档补录 archive / 断点 interruption）', () => {
    expect(taskAmendSummary({ op: 'refs', task_id: 't-x', before: ['FR-1'], after: ['FR-1', 'FR-2'], rtm_synced: true }))
      .toContain('🏷️')
    expect(taskAmendSummary({ op: 'adopt', success: true, task_id: 't-x', parent_id: 't-p', stage_kind: 'dev' }))
      .toContain('归属补救')
    expect(taskAmendSummary({ op: 'chain', success: true, dry_run: true, scanned: 2, created_total: 0, requirement_id: 'REQ-x' }))
      .toContain('只读诊断')
    expect(taskAmendSummary({ op: 'archive', success: true, appended: ['a.md'], skipped: [], status: 'archived' }))
      .toContain('归档清单补录')
    expect(taskAmendSummary({ op: 'interruption', success: true, requirement_id: 'REQ-x',
      interruption: { at: 1, reason: 'idle 3m', stage: 'implementing', pendingAction: 'reqboard_task_run' } }))
      .toContain('已记断点')
  })
})

describe('挂起确认守卫按 op 分流（REQ-261008020552-4aa0 FR-2 · 行为等价关键点）', () => {
  it('挂起确认期间：op=interruption 放行（原工具无此前置）、op=refs 仍被 REQBOARD_CONFIRM_PENDING 拦', async () => {
    const h = makeHarness({ requirements: [req({ status: 'implementing' })] })
    await h.seedSettled()
    const registry = new PendingConfirmRegistry({ now: () => 100 })
    // 挂票绑一个**不在台账**的需求 id（台账查不到 → 保守留挂，守卫必定生效；
    // 若绑到已落库但无可落章产物的需求，票会按「没有东西可落章」被放行，测不到守卫）。
    registry.register({ windowKey: W, requirementId: 'REQ-not-in-ledger', target: 'plan' })
    const deps = { ...h.deps, pendingConfirms: registry }
    const tool = defineTaskAmendTool(deps) as never as {
      execute: (a: unknown, e: unknown) => Promise<Record<string, unknown>>
    }
    // op=interruption：断点补写被收编前就没有挂起确认前置——挂起期间仍可调成功
    const ok = await tool.execute({ op: 'interruption', reason: 'upstream stream idle 3m ×5' }, exec)
    expect(ok.op).toBe('interruption')
    expect(ok.success).toBe(true)
    expect(ok.requirement_id).toBe('REQ-000001')
    // op=refs：写路径守卫现状不变——挂起期间仍被拦
    await expect(tool.execute({ op: 'refs', task_id: 't-x', requirement_refs: ['FR-1'], reason: 'x' }, exec))
      .rejects.toMatchObject({ code: 'REQBOARD_CONFIRM_PENDING' })
  })
})
