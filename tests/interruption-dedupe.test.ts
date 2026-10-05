// serves: FR-8
/**
 * 断点留痕去重限流（REQ-261004065652-5c1c · t6 / TC-9）。
 *
 * ## 复现的事故
 *
 * 2026-10-03 的死循环里，断点评论被刷了 15+ 条（`error:AUTH:403 …` ↔ `aborted:user` 交替），
 * 每次还带 300 字符的 403 原文，并且**每次 bump 一次 version**（台账写放大）。
 * 修前的幂等键是**原因原文**（`prev.reason === reason`）——交替的两种原因永远不相等 ⇒ 一条都压不住。
 *
 * ## 实现口径（与设计初稿的差异见 `interruption.ts` 的注释）
 *
 * 限流键 = **形（阶段 + 下一步）**，不是病因类别：
 *   · 形没变 且 距上一条 < 10 分钟 → 不写（死循环刷屏的那一半）；
 *   · 形变了（阶段推进 / 下一步变化）→ **立刻写**，不受限流；
 *   · `checkpoint` ↔ 异常 的切换属于信息升级 → 一律放行；
 *   · 落库原因截断到 200 字符，评论正文与字段同源。
 */
import { describe, it, expect } from 'vitest'
import {
  stampInterruption, stampCheckpoint, nextActionFor, INTERRUPTION_MIN_INTERVAL_MS,
} from '../src/application/internal/interruption.js'
import { REASON_TEXT_MAX } from '../src/application/internal/upstream-failure.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

function req(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: 'REQ-abc123', title: 't', description: '', status: 'accepting', blocked: false,
    comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    ...over,
  } as unknown as RequirementRecord
}

const T0 = 1_000_000
const AUTH = 'error:AUTH:403 {"error":{"type":"permission_error","message":"You\'ve reached your weekly usage limit…' + 'x'.repeat(200)
const ABORT = 'aborted:user'

describe('TC-9 · 交替病因不再刷屏', () => {
  it('交替注入 AUTH / aborted 各 10 次（每分钟一次）→ 写入 ≤ 2 条', () => {
    const r = req()
    let writes = 0
    let t = T0
    for (let i = 0; i < 10; i += 1) {
      if (stampInterruption(r, t, AUTH)) writes += 1
      if (stampInterruption(r, t + 60_000, ABORT)) writes += 1
      t += 120_000 // 每轮 2 分钟 → 20 次注入共 19 分钟
    }
    expect(writes, '修前 20 条；现在只该留 10 分钟窗口的边界那几条').toBeLessThanOrEqual(2)
    expect(r.comments, '本函数不写评论，评论由调用方按返回值写').toHaveLength(0)
  })

  it('窗口内换病因类别也压住（这是"每需求全局限流"与初稿"按类去重"的关键差异）', () => {
    const r = req()
    expect(stampInterruption(r, T0, AUTH)).toBe(true)
    expect(stampInterruption(r, T0 + 1_000, ABORT), '形没变 ⇒ 压住').toBe(false)
    expect(stampInterruption(r, T0 + 60_000, 'error:TRANSPORT:stream idle'), '仍未过窗口').toBe(false)
  })

  it('越过窗口 → 再写一条，并刷新为最新病因', () => {
    const r = req()
    expect(stampInterruption(r, T0, AUTH)).toBe(true)
    const t2 = T0 + INTERRUPTION_MIN_INTERVAL_MS
    expect(stampInterruption(r, t2, ABORT)).toBe(true)
    expect(r.interruption?.reason).toBe(ABORT)
    expect(r.interruption?.at).toBe(t2)
  })
})

describe('TC-9 · 新信息必须立刻可见（限流不得压掉进度）', () => {
  it('阶段变了（形变了）→ 窗口内也立刻写', () => {
    const r = req({ status: 'accepting' })
    expect(stampInterruption(r, T0, AUTH)).toBe(true)
    r.status = 'implementing' // 阶段推进
    expect(stampInterruption(r, T0 + 1_000, AUTH), '阶段变了是新信息').toBe(true)
    expect(r.interruption?.stage).toBe('implementing')
    expect(r.interruption?.pendingAction).toBe(nextActionFor(r))
  })

  it('下一步变了（形变了）→ 立刻写（同阶段也可能换待办动作）', () => {
    const r = req({ status: 'decomposing' })
    expect(stampInterruption(r, T0, AUTH)).toBe(true)
    // 计划从"未提交"变成"已提交未批准" → pendingAction 由 submit 变 ask_confirm
    r.plan = { path: 'docs/x.md', summary: 's', tasks: [], submittedAt: 1, submittedBy: { kind: 'agent' } } as never
    expect(stampInterruption(r, T0 + 1_000, AUTH)).toBe(true)
    expect(r.interruption?.pendingAction).toBe('reqboard_ask_confirm(target=plan)')
  })

  it('checkpoint ↔ 异常 的切换属于信息升级 → 一律放行', () => {
    const r = req()
    expect(stampCheckpoint(r, T0, 'reqboard_move')).toBe(true)
    expect(r.interruption?.reason).toBe('checkpoint')
    expect(stampInterruption(r, T0 + 1_000, AUTH), '上传失败比"刚交棒"有用').toBe(true)
    expect(r.interruption?.reason).toContain('error:AUTH')
    expect(stampCheckpoint(r, T0 + 2_000, 'reqboard_move'), '回到 checkpoint 也放行').toBe(true)
  })

  it('checkpoint 自身的幂等语义不变（同 stage + 同 pendingAction 不重写）', () => {
    const r = req()
    expect(stampCheckpoint(r, T0)).toBe(true)
    expect(stampCheckpoint(r, T0 + 1_000)).toBe(false)
  })
})

describe('TC-9 · 落库原因有界（正文与字段同源）', () => {
  it('超长 403 文案 → 落库 reason ≤ 200 字符且带省略号', () => {
    const r = req()
    expect(stampInterruption(r, T0, AUTH)).toBe(true)
    const stored = r.interruption?.reason ?? ''
    expect(stored.length).toBeLessThanOrEqual(REASON_TEXT_MAX)
    expect(stored.endsWith('…')).toBe(true)
    expect(stored.startsWith('error:AUTH')).toBe(true)
  })

  it('短原因原样落库（不无谓加省略号）', () => {
    const r = req()
    expect(stampInterruption(r, T0, ABORT)).toBe(true)
    expect(r.interruption?.reason).toBe(ABORT)
  })
})
