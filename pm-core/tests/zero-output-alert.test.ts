/**
 * 零产出告警（REQ-261004110201-f253 FR-3）——连续白跑要被看见，但不许瞎报。
 *
 * 钉四件事：
 *  ① 判据纯函数：streak 只在末尾连续 zeroOutput 时累加，**未知（老记录）即断**；
 *  ② 去重可推导：floor(streak/threshold) 大于既有告警数才写 → 阈值 2 时连续 4 次只写 2 条；
 *  ③ 真实路径：子卡连跑零产出，需求台账出现一条结构化告警评论（含 stage/streak/threshold）；
 *  ④ 边界：非零产出后重置、阈值 0 不报、告警不阻断子卡 done。
 *
 * 2026-10-11 退役 workflow 引擎（产出通道改团队台账）后，③ 的跑法换了但语义没换：
 *  · 换卡序列：原先"同一张卡退回 todo 再跑 4 次"在团队路径会撞「台账报告早于本次派发」
 *    （`team_report_stale`，同一 team task 不会二次开工）；streak 本就是按**同阶段全部执行**
 *    的尾部连算，故改为**同阶段多张卡依次跑**——与生产链（review 段多张卡）同形；
 *  · 零产出形态：团队口径下"成功但零产出"= 台账写了一条**不落在工作区**的路径
 *    （`../outside.ts` → 归一后 form='outside' 被丢弃）且没有 completed ⇒ outputCount=0。
 *    引擎时代的对应形态是"run 返回一个空 JSON 信封"（raw 非空、可数条目为 0）。
 */
import { describe, it, expect } from 'vitest'
import { zeroOutputStreak, shouldAlertZeroOutput } from 'pm-common/workflow/StageTelemetry.js'
import { executeSubtask } from 'pm-core/application/use-cases/ExecuteTask.js'
import { makeHarness, task, req } from 'tests/application/harness.js'
import { installTeamProducer } from 'tests/application/teams-fake.js'

const FILE = 'pm-core/src/domain/x.ts'
/** 不落在工作区的路径：Worker 写了台账（不是"没写"），但归一时被判 outside 丢弃 ⇒ 可数产出为 0。 */
const ZERO_OUTPUT_FILE = '../outside.ts'
const exec = { agent: { id: 'session-w' } }

describe('FR-3 判据段 ① streak 与去重', () => {
  it('末尾连续零产出计数；非零产出即停；未知即断（未知≠零产出）', () => {
    const z = (endedAt: number, extra: Record<string, unknown> = {}) => ({ startedAt: 0, endedAt, outcome: 'succeeded', ...extra })

    // 最近两次都零产出 → 2
    expect(zeroOutputStreak([z(1, { outputCount: 2, zeroOutput: false }), z(2, { outputCount: 0, zeroOutput: true }), z(3, { outputCount: 0, zeroOutput: true })])).toBe(2)
    // 最近一次零产出、再往前有产出 → 1（最近这一次是真的零产出，不能被抹掉）
    expect(zeroOutputStreak([z(3, { outputCount: 0, zeroOutput: true }), z(2, { outputCount: 5, zeroOutput: false })])).toBe(1)
    // 最近一次零产出、再往前是老记录（未知）→ 仍是 1，但不再往前累加（不冤枉未知）
    expect(zeroOutputStreak([z(3, { outputCount: 0, zeroOutput: true }), z(2)])).toBe(1)
    // 最近一次就是未知（老记录）→ 0（未知≠零产出，不冤枉）
    expect(zeroOutputStreak([z(3), z(2, { outputCount: 0, zeroOutput: true })])).toBe(0)
    // 仍在跑的不计
    expect(zeroOutputStreak([{ startedAt: 0, outcome: 'running', zeroOutput: true }])).toBe(0)
  })

  it('去重：floor(streak/threshold) > 已告警数 才写', () => {
    expect(shouldAlertZeroOutput(1, 0, 2)).toBe(false)
    expect(shouldAlertZeroOutput(2, 0, 2)).toBe(true)
    expect(shouldAlertZeroOutput(3, 1, 2)).toBe(false)  // 3/2=1，不比已告警 1 多
    expect(shouldAlertZeroOutput(4, 1, 2)).toBe(true)   // 4/2=2 > 1
    expect(shouldAlertZeroOutput(4, 2, 2)).toBe(false)
    expect(shouldAlertZeroOutput(5, 0, 0)).toBe(false)  // 阈值非法不报
  })
})

describe('FR-3 真实路径 ② 连续零产出 → 台账留一条结构化告警', () => {
  /** 依次跑 N 张同阶段子卡（每张派发一次 Worker），产出按 `opts.output` 恒为空/恒有值。 */
  async function runZeroOutputTimes(times: number, opts: { threshold?: number; output?: { filesChanged?: string[]; completed?: string[] } } = {}) {
    const h = makeHarness()
    h.docs.put(FILE, 'x')
    h.seedRequirementSync(req({ id: 'REQ-000001', status: 'implementing', category: 'feature', autoRun: true }))
    h.seedTasks('REQ-000001', [
      task({ id: 't-p', requirementId: 'REQ-000001', status: 'in_progress', title: '父卡' }),
      ...Array.from({ length: times }, (_, i) => task({
        id: 't-s' + (i + 1), requirementId: 'REQ-000001', status: 'todo',
        title: '子卡' + (i + 1), parentId: 't-p', stageKind: 'review' as never,
      })),
    ])
    await h.seedSettled()
    if (opts.threshold !== undefined) h.deps.zeroOutputAlertThreshold = opts.threshold
    installTeamProducer(h, opts.output ?? { filesChanged: [ZERO_OUTPUT_FILE] })

    for (let i = 1; i <= times; i += 1) {
      const r = await executeSubtask(h.deps, { subtaskId: 't-s' + i, windowKey: 'session-w', exec })
      // 前置锚：零产出是"跑成功了但没落盘"——跑失败（如 team_report_missing）不算零产出，不能让它凑 streak
      expect(r.ok, JSON.stringify(r)).toBe(true)
    }
    return h
  }

  it('阈值 2：连续 4 次零产出 → 恰好 2 条告警（floor(4/2)），且含 stage/streak/threshold 三要素', async () => {
    const h = await runZeroOutputTimes(4, { threshold: 2 })
    const req0 = (await h.store.get('REQ-000001'))!
    const alerts = (req0.comments ?? []).filter((c) => String(c.body).includes('[零产出告警]'))
    expect(alerts).toHaveLength(2)
    for (const a of alerts) {
      expect(a.body).toContain('stage=review')
      expect(a.body).toContain('threshold=2')
      expect(a.body).toMatch(/streak=\d/)
      expect(a.createdBy?.kind).toBe('system')
    }
    expect(alerts.map((a) => String(a.body).match(/streak=(\d+)/)?.[1]).sort()).toEqual(['2', '4'])
  })

  it('阈值 2：连续 2 次零产出 → 恰好 1 条告警', async () => {
    const h = await runZeroOutputTimes(2, { threshold: 2 })
    const req0 = (await h.store.get('REQ-000001'))!
    expect((req0.comments ?? []).filter((c) => String(c.body).includes('[零产出告警]'))).toHaveLength(1)
  })

  it('有产出 → 不告警；阈值高于连续数 → 不告警', async () => {
    const withOutput = await runZeroOutputTimes(3, { threshold: 2, output: { filesChanged: [FILE], completed: ['完成'] } })
    expect(((await withOutput.store.get('REQ-000001'))!.comments ?? []).some((c) => String(c.body).includes('[零产出告警]'))).toBe(false)

    const highThreshold = await runZeroOutputTimes(2, { threshold: 5 })
    expect(((await highThreshold.store.get('REQ-000001'))!.comments ?? []).some((c) => String(c.body).includes('[零产出告警]'))).toBe(false)
  })
})
