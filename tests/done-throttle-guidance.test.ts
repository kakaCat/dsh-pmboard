/**
 * 60s 批量关闭节流 × 批量（REQ-261007100513-6749 t4 / serves: FR-5）。
 *
 * 本卡对节流的**唯一**改动是可见性口径（写在 `MoveTask.planMoveTasks` 的注释里）：
 * 所有门禁在写入前判完 ⇒ **同批提交的卡看不到彼此的 done 事件**（互不触发），跨批仍触发。
 * 判据本身（`DoneEvidenceSpec.findRecentAgentDoneTask` / `doneThrottleRemainingMs`）**一条未改**——
 * 事故 C 的防线由逐卡 done 凭证门继续承载（没汇报的卡仍逐张被 REQBOARD_NO_REPORT 拒）。
 *
 * 结构化升级（FR-5 的后半句）：撞节流时必须给出**确定等待时间**与"这段时间能做什么"，
 * 不许让调用方靠试探/硬等找节奏（REQ-8475 实测：agent 猜节奏 → 32 次 sleep 62 = 33.1 分钟纯等待）。
 */
import { describe, expect, it } from 'vitest'
import { makeHarness, req, task } from './application/harness.js'
import { defineTaskMoveTool } from '../src/tools/index.js'
import { executeMoveTask } from '../src/application/use-cases/MoveTask.js'
import type { TaskRecord } from '../src/shared/protocol.js'
import { expectCode } from './helpers/code-assert.js'
import { doneThrottleRemainingMs } from '../src/domain/workflow/DoneEvidenceSpec.js'

const W = 'session-w-001'
const REQ = 'REQ-000001'
const THROTTLE_MS = 60_000
const run = (t: unknown, args: unknown): Promise<Record<string, any>> =>
  (t as { execute: (a: unknown, e: unknown) => Promise<Record<string, any>> }).execute(args, { agent: { id: W } })

/** 存量卡（legacy）：in_review 且已汇报 → ①②两项凭证够，能走到第③项节流判定。 */
function reviewCard(id: string, over: Partial<TaskRecord> = {}): TaskRecord {
  return task({
    id,
    requirementId: REQ,
    status: 'in_review',
    createdAt: 1,
    lastReport: { at: 2, reportIndex: 1, filesChanged: [], completed: ['完成 ' + id] },
    ...over,
  })
}

/** 子卡（写入族 dev）：lastRun 成功 + 汇报里给出真实新鲜的文件。 */
function devSubtask(id: string, parentId: string): TaskRecord {
  return task({
    id,
    requirementId: REQ,
    parentId,
    stageKind: 'dev' as never,
    status: 'in_progress',
    createdAt: 1,
    lastRun: { at: 2, ok: true, stopReason: 'completed', valueNonEmpty: true },
    lastReport: { at: 2, reportIndex: 1, filesChanged: ['docs/req/a.md'], completed: ['做了 ' + id] },
  })
}

/** 夹具：3 张存量卡（in_review）+ 一张停留 todo 的卡（避免整需求被 rollup 推到验收）。 */
function seedThree() {
  const h = makeHarness({
    tasks: [
      reviewCard('t-a1'),
      reviewCard('t-a2'),
      reviewCard('t-a3'),
      task({ id: 't-keep', requirementId: REQ, status: 'todo', createdAt: 1 }),
    ],
  })
  h.seedRequirementSync(req({ status: 'implementing' }))
  h.deps.doneThrottleMs = THROTTLE_MS
  return h
}

describe('批量推进 × 60s 节流（FR-5）', () => {
  it('同批一次关 3 张卡**不触发**节流（同批互不可见；判据一条未改）', async () => {
    const h = seedThree()
    await h.seedSettled()

    const out = await run(defineTaskMoveTool(h.deps), {
      tasks: [
        { task_id: 't-a1', to: 'done' },
        { task_id: 't-a2', to: 'done' },
        { task_id: 't-a3', to: 'done' },
      ],
    })

    expect(out.success).toBe(true)
    expect(out.results?.map((r: { ok: boolean }) => r.ok)).toEqual([true, true, true])
    expect(out.throttleRemainingMs).toBeUndefined()
    expect(out.guidance).toBeUndefined()
    expect(out.partial).toBeUndefined()
    const after = await h.tasksOf(REQ)
    expect(after.filter(x => x.status === 'done')).toHaveLength(3)
  })

  /** 夹具：n 张 in_review 顶层卡（各带 lastReport）+ 1 张 todo 卡（避免整需求被 rollup 推到验收）。 */
  function seedMany(n: number) {
    const cards = Array.from({ length: n }, (_, i) => reviewCard('t-c' + String(i).padStart(2, '0')))
    const h = makeHarness({
      tasks: [...cards, task({ id: 't-keep', requirementId: REQ, status: 'todo', createdAt: 1 })],
    })
    h.seedRequirementSync(req({ status: 'implementing' }))
    h.deps.doneThrottleMs = THROTTLE_MS
    return { h, cards }
  }

  it('批内上限（设计 DD-2）：单批 20 张顶层卡 → 只落 3 张，其余逐项 REQBOARD_BULK_CLOSE + 确定指引', async () => {
    const { h, cards } = seedMany(20)
    await h.seedSettled()

    const out = await run(defineTaskMoveTool(h.deps), {
      tasks: cards.map(c => ({ task_id: c.id, to: 'done' })),
    })

    const after = await h.tasksOf(REQ)
    // 上限是设计钉死的 3（DD-2）：修前这里是 20（单次调用可关满 MOVE_BATCH_MAX）
    expect(after.filter(x => x.status === 'done')).toHaveLength(3)
    expect(out.success).toBe(true)
    expect(out.partial).toBe(true)
    const rejected = (out.results as { ok: boolean; code?: string; throttleRemainingMs?: number }[])
      .filter(r => !r.ok)
    expect(rejected).toHaveLength(17)
    for (const r of rejected) {
      expect(r.code).toBe('REQBOARD_BULK_CLOSE')
      expect(r.throttleRemainingMs).toBeGreaterThan(0)
      expect(r.throttleRemainingMs).toBeLessThanOrEqual(THROTTLE_MS)
    }
    // 顶层结构化指引照旧（复用既有装配：凡 results 里出现 BULK_CLOSE 即产出）
    expect(out.throttleRemainingMs).toBeGreaterThan(0)
    expect(String(out.guidance)).toContain('确定等待')
  })

  it('批内上限的边界：单批 4 张 → 3 落 1 拒（第 4 张带 throttleRemainingMs）', async () => {
    const { h, cards } = seedMany(4)
    await h.seedSettled()

    const out = await run(defineTaskMoveTool(h.deps), {
      tasks: cards.map(c => ({ task_id: c.id, to: 'done' })),
    })

    expect((out.results as { ok: boolean }[]).map(r => r.ok)).toEqual([true, true, true, false])
    const last = (out.results as { code?: string }[])[3]
    expect(last?.code).toBe('REQBOARD_BULK_CLOSE')
    const after = await h.tasksOf(REQ)
    expect(after.filter(x => x.status === 'done')).toHaveLength(3)
  })

  it('单卡连续两次收尾仍触发：工具层给**结构化失败回执**（throttleRemainingMs + guidance，确定等待时间）', async () => {
    const h = seedThree()
    await h.seedSettled()
    const t = defineTaskMoveTool(h.deps)

    const first = await run(t, { task_id: 't-a1', to: 'done' })
    expect(first.success).toBe(true)

    // R3：用例层**继续抛错**（既有契约与回归不动），工具层把它转成结构化回执**返回**——
    // 因为 dsh-tools 的 toolErrorResult 只传 message（error.info 仅 HarnessError 的 name/code），
    // 挂在错误对象上的结构化字段到不了调用方。
    const out = await run(t, { task_id: 't-a2', to: 'done' })
    expect(out.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f): 由中文文案兜底升级为断码（撞 60s 节流 = REQBOARD_BULK_CLOSE）
    expectCode(out, 'REQBOARD_BULK_CLOSE')
    expect(out.code).toBe('REQBOARD_BULK_CLOSE')
    expect(String(out.error)).toContain('REQBOARD_BULK_CLOSE')
    expect(String(out.error)).toContain('还需等待约')      // 既有文案不动
    expect(out.throttleRemainingMs).toBeGreaterThan(0)
    expect(out.throttleRemainingMs).toBeLessThanOrEqual(THROTTLE_MS)
    // 必须给**确定**等待时间 + 可做之事（不许让调用方试探）
    expect(String(out.guidance)).toContain('确定等待')
    expect(String(out.guidance)).toMatch(/\d+ 毫秒/)
    expect(String(out.guidance)).toMatch(/reqboard_task_report|写卡评论/)
    expect(String(out.guidance)).toContain('子卡')
    expect(Object.keys(out)).toEqual(['success', 'task_id', 'error', 'code', 'throttleRemainingMs', 'guidance'])
    // 第二张没落账
    expect((await h.tasksOf(REQ)).find(x => x.id === 't-a2')?.status).toBe('in_review')
  })

  it('用例层仍是抛错（工具层的转换不改它的契约）：executeMoveTask 直接调 → reject + 结构化字段在错误上', async () => {
    const h = seedThree()
    await h.seedSettled()
    await executeMoveTask(h.deps, { task_id: 't-a1', to: 'done' }, { agent: { id: W } })

    const err = await executeMoveTask(h.deps, { task_id: 't-a2', to: 'done' }, { agent: { id: W } })
      .catch((e: Error & { code?: string; throttleRemainingMs?: number; guidance?: string }) => e)
    expect((err as Error & { code?: string }).code).toBe('REQBOARD_BULK_CLOSE')
    expect((err as { throttleRemainingMs?: number }).throttleRemainingMs).toBeGreaterThan(0)
    expect(String((err as { guidance?: string }).guidance)).toContain('确定等待')
  })

  it('跨批仍触发：批内逐项 ok=false + code=REQBOARD_BULK_CLOSE + throttleRemainingMs，顶层给 guidance', async () => {
    const h = seedThree()
    await h.seedSettled()
    const t = defineTaskMoveTool(h.deps)

    await run(t, { task_id: 't-a1', to: 'done' })   // 先制造一条 60s 内的 done 事件

    const out = await run(t, {
      tasks: [
        { task_id: 't-a2', to: 'done' },
        { task_id: 't-a3', to: 'done' },
      ],
    })

    expect(out.success).toBe(false)          // 全失败 → success=false（不新造码，逐项给原因）
    // FR-6(REQ-261006201814-ac4f): 由中文文案兜底升级为断码（顶层不新造码 → 钉批内逐项码）
    expectCode((out.results as { code?: string }[])[0], 'REQBOARD_BULK_CLOSE')
    expect(out.partial).toBeUndefined()      // partial 只在"有成功也有失败"时为 true
    expect(out.results).toHaveLength(2)
    for (const r of out.results as { ok: boolean; code?: string; throttleRemainingMs?: number }[]) {
      expect(r.ok).toBe(false)
      expect(r.code).toBe('REQBOARD_BULK_CLOSE')
      expect(r.throttleRemainingMs).toBeGreaterThan(0)
    }
    expect(out.throttleRemainingMs).toBeGreaterThan(0)
    expect(String(out.guidance)).toContain('确定等待')
    expect(String(out.guidance)).toContain('子卡')
    // 回执键形状逐字固定（撞节流项：throttleRemainingMs 在**项内**，指引在**顶层**；
    // 被拒项不带 from/to——目标状态根本没落，给一个 from→to 反而是假信息）
    expect(Object.keys(out)).toEqual(['success', 'task_id', 'results', 'throttleRemainingMs', 'guidance'])
    expect(Object.keys((out.results as object[])[0] ?? {})).toEqual(['task_id', 'ok', 'code', 'error', 'throttleRemainingMs'])
    expect(String((out.results as { error?: string }[])[0]?.error)).toContain('REQBOARD_BULK_CLOSE')
    // 两张都没落账（拒绝 = 零副作用）
    const after = await h.tasksOf(REQ)
    expect(after.filter(x => x.status === 'done').map(x => x.id)).toEqual(['t-a1'])
  })

  it('子卡仍豁免节流（批外刚关过一张卡，批内两张子卡照关）', async () => {
    const h = makeHarness({
      tasks: [
        reviewCard('t-a1'),
        task({ id: 't-p', requirementId: REQ, status: 'in_progress', createdAt: 1 }),
        devSubtask('t-s1', 't-p'),
        devSubtask('t-s2', 't-p'),
        task({ id: 't-keep', requirementId: REQ, status: 'todo', createdAt: 1 }),
      ],
    })
    h.seedRequirementSync(req({ status: 'implementing' }))
    h.docs.put('docs/req/a.md')
    h.deps.doneThrottleMs = THROTTLE_MS
    await h.seedSettled()
    const t = defineTaskMoveTool(h.deps)

    await run(t, { task_id: 't-a1', to: 'done' })
    const out = await run(t, {
      tasks: [
        { task_id: 't-s1', to: 'done' },
        { task_id: 't-s2', to: 'done' },
      ],
    })

    expect(out.success).toBe(true)
    expect(out.results?.map((r: { ok: boolean }) => r.ok)).toEqual([true, true])
    expect(out.throttleRemainingMs).toBeUndefined()
  })

  it('节流只挡非子卡：没汇报的卡仍逐张被凭证门拒（事故 C 的防线没被批量绕过）', async () => {
    const h = makeHarness({
      tasks: [
        // 三张都没汇报（lastReport 缺失）——即使同批也逐张被 REQBOARD_NO_REPORT 拒
        task({ id: 't-b1', requirementId: REQ, status: 'in_review', createdAt: 1 }),
        task({ id: 't-b2', requirementId: REQ, status: 'in_review', createdAt: 1 }),
        task({ id: 't-b3', requirementId: REQ, status: 'in_review', createdAt: 1 }),
      ],
    })
    h.seedRequirementSync(req({ status: 'implementing' }))
    h.deps.doneThrottleMs = THROTTLE_MS
    await h.seedSettled()

    const out = await run(defineTaskMoveTool(h.deps), {
      tasks: [
        { task_id: 't-b1', to: 'done' },
        { task_id: 't-b2', to: 'done' },
        { task_id: 't-b3', to: 'done' },
      ],
    })

    expect(out.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f): 由中文文案兜底升级为断码（顶层不新造码 → 钉批内逐项码）
    expectCode((out.results as { code?: string }[])[0], 'REQBOARD_NO_REPORT')
    for (const r of out.results as { ok: boolean; code?: string }[]) {
      expect(r.ok).toBe(false)
      expect(r.code).toBe('REQBOARD_NO_REPORT')
    }
    const after = await h.tasksOf(REQ)
    expect(after.every(x => x.status === 'in_review')).toBe(true)
  })
})

describe('M6（FR-4）：时钟漂移下 doneThrottleRemainingMs 恒 ∈ [0, throttleMs]', () => {
  /** 一张「其他任务」刚 done（agent）——节流读数取它。 */
  const otherDoneAt = (at: number) => task({
    id: 't-other',
    requirementId: REQ,
    status: 'done',
    statusHistory: [{ status: 'done', at, by: { kind: 'agent' } }],
  } as never)

  it('h.at 在未来（时钟回拨/漂移）→ 钳到 throttleMs，不溢出', () => {
    const now = 1_000_000
    const left = doneThrottleRemainingMs([otherDoneAt(now + 30_000)] as never, 't-mine', REQ, now, THROTTLE_MS)
    expect(left).toBe(THROTTLE_MS)          // 修前 = 60000 + 30000 = 90000
    expect(left).toBeLessThanOrEqual(THROTTLE_MS)
  })

  it('正常历史（h.at 在过去 10s）→ 读数不变（行为回归锚点）', () => {
    const now = 1_000_000
    const left = doneThrottleRemainingMs([otherDoneAt(now - 10_000)] as never, 't-mine', REQ, now, THROTTLE_MS)
    expect(left).toBe(50_000)
  })

  it('早于节流窗的历史 → 0（下界不变）', () => {
    const now = 1_000_000
    const left = doneThrottleRemainingMs([otherDoneAt(now - 120_000)] as never, 't-mine', REQ, now, THROTTLE_MS)
    expect(left).toBe(0)
  })
})
