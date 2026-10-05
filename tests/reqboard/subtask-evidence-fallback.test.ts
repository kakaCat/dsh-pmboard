/**
 * 子卡完工凭证门：**失败 run 不得把「汇报兜底」永久堵死**。
 *
 * ## 被修的真实缺陷（2026-10-03 实测）
 *
 * 判据原是「**有没有** run 记录」而不是「有没有**成功的** run 记录」：
 *
 * ```
 * if (run === undefined) { …用 lastReport 当凭证… }   // 兜底，只对"从未跑过"生效
 * if (!run.ok) return gate('子卡凭证不过：workflow run 未完成…')  // 一次失败即永久命中
 * ```
 *
 * 后果是**毒状态**：子卡只要留下过一次失败的 run（哪怕失败原因是环境故障、与被考核的工作
 * 毫无关系），兜底就永久失效；而台账里没有任何工具能清 `lastRun` ⇒ 该卡此后既关不掉、
 * 又因残留 `running` 执行记录被判成"在跑"而不再被派发 —— 链死锁。
 *
 * 真实现场：`REQ-261003191948-e94a` / `t-bec57a`，4 次 RUN_SUBTASK 全挂于
 * `engine_unavailable`，而它的 `lastReport` 明明合规（2 个 filesChanged / 5 条 completed、
 * 文件 mtime 均 ≥ 链出身），仍被拒。
 *
 * ## 本文件锁定的目标语义
 *
 * - **没有成功的 run**（`run === undefined || run.ok !== true`）→ 允许 `lastReport` 当凭证；
 * - 写入族：`reportFilesChanged` 非空且至少一个文件 `mtime >= since`；
 * - 结论族：`reportCompleted` 非空即可；
 * - 两者都不合格 → 拒，且**同时**给出「那次 run 为什么失败」与「补什么」；
 * - 走兜底通过时，**不许把失败静默吞掉**：结构化带出 `note` 与 `failedRun`。
 */
import { describe, expect, it } from 'vitest'
import { checkSubtaskEvidence, type SubtaskEvidenceInput } from '../../src/application/internal/subtask-evidence.js'

const SINCE = 1_000_000

/** 默认夹具 = 写入族（dev）+ 无 run + 无汇报。 */
function input(over: Partial<SubtaskEvidenceInput> = {}): SubtaskEvidenceInput {
  return {
    hasReport: false,
    reportFilesChanged: [],
    reportCompleted: [],
    run: undefined,
    since: SINCE,
    stageKind: 'dev',
    fileMtimes: {},
    pagesSrcFiles: [],
    clientBuildExists: false,
    clientBuildMtime: 0,
    newestPagesSrcMtime: 0,
    ...over,
  }
}

/** 一次失败的 run（形状同台账 TaskRecord.lastRun）。 */
function failedRun(stopReason: string, reason?: string): SubtaskEvidenceInput['run'] {
  return { ok: false, stopReason, valueNonEmpty: false, ...(reason !== undefined ? { reason } : {}) }
}

describe('子卡凭证门：失败 run 下的汇报兜底', () => {
  it('① 失败 run + 新鲜汇报（写入族）→ 通过，且 note/failedRun 带出那次失败原因', () => {
    const stopReason = 'engine_unavailable'
    const v = checkSubtaskEvidence(input({
      run: failedRun(stopReason, 'engine_unavailable：子卡执行引擎不可达'),
      hasReport: true,
      reportFilesChanged: ['src/repositories/migrationGate.ts'],
      reportCompleted: ['新增 preflightLedger', '补 3 条用例'],
      stageKind: 'dev',
      fileMtimes: { 'src/repositories/migrationGate.ts': SINCE + 1 },
    }))

    expect(v.ok, '没有成功的 run 时，合规汇报必须能当凭证').toBe(true)
    if (!v.ok) return
    // 不许静默吞掉：通过的同时必须能追溯"这张卡是靠汇报过的，且它曾有一次失败"
    expect(v.note ?? '', 'note 必须点名那次失败的 stopReason').toContain(stopReason)
    expect(v.failedRun?.stopReason).toBe(stopReason)
    expect(v.failedRun?.reason ?? '').toContain('引擎不可达')
  })

  it('② 失败 run + 无汇报 → 拒，且消息同时给出「为什么失败」与「补什么」', () => {
    const stopReason = 'engine_unavailable'
    const v = checkSubtaskEvidence(input({
      run: failedRun(stopReason, 'engine_unavailable'),
      hasReport: false,
      stageKind: 'dev',
    }))

    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.code).toBe('REQBOARD_SUBTASK_GATE')
    expect(v.reason, '必须点名那次 run 的 stopReason').toContain(stopReason)
    expect(v.reason, '还必须给出补齐路径（不能只说失败）').toMatch(/reqboard_task_report|补齐/)
  })

  it('③ 失败 run + 汇报文件不新鲜（mtime < since）→ 拒', () => {
    const v = checkSubtaskEvidence(input({
      run: failedRun('engine_unavailable'),
      hasReport: true,
      reportFilesChanged: ['src/x.ts'],
      reportCompleted: ['改完了'],
      stageKind: 'dev',
      fileMtimes: { 'src/x.ts': SINCE - 1 },
    }))

    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('REQBOARD_SUBTASK_GATE')
  })

  it('④ 结论族（review）+ 失败 run + completed 非空 → 通过（天然无 diff）', () => {
    const v = checkSubtaskEvidence(input({
      run: failedRun('engine_unavailable'),
      hasReport: true,
      reportFilesChanged: [],
      reportCompleted: ['逐条复核完毕：设计与实现无偏离'],
      stageKind: 'review',
    }))

    expect(v.ok).toBe(true)
    if (v.ok) expect(v.note ?? '').toContain('engine_unavailable')
  })

  it('⑤ 写入族 + 失败 run + 只有结论没有落盘 → 仍拒（没落盘=没干活，不放宽）', () => {
    const v = checkSubtaskEvidence(input({
      run: failedRun('engine_unavailable'),
      hasReport: true,
      reportFilesChanged: [],
      reportCompleted: ['我改完了，功能正常'],
      stageKind: 'dev',
    }))

    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toContain('写入族')
  })

  it('⑥ 回归：成功的 run 行为逐字不变（ok:true 且不带 note/failedRun）', () => {
    const v = checkSubtaskEvidence(input({
      run: { ok: true, stopReason: 'completed', valueNonEmpty: true },
      hasReport: true,
      reportFilesChanged: ['src/x.ts'],
      reportCompleted: ['改完了'],
      stageKind: 'dev',
      fileMtimes: { 'src/x.ts': SINCE + 1 },
    }))

    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.note, '成功路径不该产出兜底 note').toBeUndefined()
      expect(v.failedRun).toBeUndefined()
    }
  })

  it('⑦ 回归：从未跑过（run===undefined）+ 合规汇报 → 仍通过（既有兜底不退化）', () => {
    const v = checkSubtaskEvidence(input({
      run: undefined,
      hasReport: true,
      reportFilesChanged: ['src/x.ts'],
      reportCompleted: ['改完了'],
      stageKind: 'dev',
      fileMtimes: { 'src/x.ts': SINCE + 1 },
    }))

    expect(v.ok).toBe(true)
  })

  it('⑧ 从未跑过 + 无汇报 → 拒（消息说明"未执行或未落库"）', () => {
    const v = checkSubtaskEvidence(input({ run: undefined, hasReport: false, stageKind: 'dev' }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toContain('未执行或未落库')
  })

  it('⑨ 实质性失败（team_report_stale）+ 新鲜汇报 → **仍拒**（不许用更早的报告洗白本次派发失败）', () => {
    const v = checkSubtaskEvidence(input({
      run: failedRun('team_report_stale', 'team_report_stale'),
      hasReport: true,
      reportFilesChanged: ['src/x.ts'],
      reportCompleted: ['早前交付'],
      stageKind: 'dev',
      fileMtimes: { 'src/x.ts': SINCE + 1 },
    }))

    expect(v.ok, '兜底只对"环境类不可达"开放；实质性失败仍按原口径拒').toBe(false)
    if (!v.ok) {
      expect(v.reason).toContain('team_report_stale')
      expect(v.reason, '退回旧文案，不产出兜底 note').not.toContain('汇报兜底')
    }
  })

  it('⑩ 环境类判据认 legacy 形状：stopReason=error 但 reason 含 engine_unavailable → 走兜底', () => {
    const v = checkSubtaskEvidence(input({
      // 台账里**已存在**的历史记录就是这个形状（真实受害卡 t-bec57a 同理）
      run: { ok: false, stopReason: 'error', valueNonEmpty: false, reason: 'engine_unavailable' },
      hasReport: true,
      reportFilesChanged: ['src/x.ts'],
      reportCompleted: ['窗口自证'],
      stageKind: 'dev',
      fileMtimes: { 'src/x.ts': SINCE + 1 },
    }))

    expect(v.ok, '不认 legacy 形状就修不动真实受害卡').toBe(true)
    if (v.ok) expect(v.note ?? '').toContain('engine_unavailable')
  })
})
