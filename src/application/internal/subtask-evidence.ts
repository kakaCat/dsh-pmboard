/**
 * 子卡完工凭证口径（REQ-4842fe t5 / design/data-model §4）。
 *
 * 为什么不能沿用父卡四重校验：现有 done 凭证门含"本窗口工具活动"检查，而干活的
 * 子代理在**别的会话**——该检查对子卡恒不成立。子卡改用与窗口无关的三项 + 保留
 * 页面插件构建新鲜度：
 *   ① 子卡 report 非空（调度器从 run 产出生成，含 filesChanged / 完成项）；
 *   ② **证据形态分流**（见 STAGE_EVIDENCE_KIND）：写入族 = filesChanged 至少一个文件真实存在
 *      且 mtime ≥ **链出身**（requirement/父卡/子卡 createdAt 最小值，非会漂移的 claimedAt）；
 *      结论族（review/test/verify/…） = 天然无 diff，完工结论非空即放行；
 *   ③ run 的 stopReason=completed 且产出经 realm 物化非空。
 * **豁免**：本窗口工具活动、60 秒批量关闭节流（这两条是为人工窗口防刷设计的）。
 *
 * @module dsh-pmboard/application/internal/subtask-evidence
 */
import { fmt } from '../../domain/text/fmt.js'
import { STAGE_EVIDENCE_KIND, type StageKind } from '../../domain/task/SubtaskTemplate.js'

/** run 证据投影（台账 TaskRecord.lastRun 的形状）。 */
export interface SubtaskRunView {
  ok: boolean
  stopReason: string
  valueNonEmpty: boolean
  reason?: string
}

export interface SubtaskEvidenceInput {
  hasReport: boolean
  reportFilesChanged: readonly string[]
  reportCompleted: readonly string[]
  run: SubtaskRunView | undefined
  /**
   * 证据新鲜度基准 = **链出身**（requirement/父卡/子卡 createdAt 的最小值，见 support.assertDoneEvidence）。
   * 不再是会随重跑漂移的 claimedAt（L1 基准单调化）。
   */
  since: number
  /** 子卡阶段（受控 StageKind）；缺省按写入族从严（见 STAGE_EVIDENCE_KIND） */
  stageKind?: StageKind
  /** 汇报文件的 mtime（不存在的文件为 undefined） */
  fileMtimes: Readonly<Record<string, number | undefined>>
  /** 汇报里涉及的页面插件源文件（packages/pages 下 src，构建新鲜度检查用） */
  pagesSrcFiles: readonly string[]
  clientBuildExists: boolean
  clientBuildMtime: number
  newestPagesSrcMtime: number
}

/** 一次失败 run 的留痕投影（走兜底通过时结构化带出，见下方 fallbackViaReport）。 */
export interface FailedRunView {
  readonly stopReason: string
  readonly reason?: string
}

/**
 * 凭证判定结果。
 *
 * `ok:true` 上挂的两个可选字段是 REQ-…（子卡毒状态修复）的**可追溯性**要求：
 * 允许"没有成功的 run，用汇报兜底"通过，但**不许把那次失败静默吞掉**——
 * `note` 是人读的一句话，`failedRun` 是机器可读的失败投影，调用方据此记一条诊断。
 * 成功路径（run.ok===true）不得产出这两个字段。
 */
export type EvidenceVerdict =
  | { ok: true; note?: string; failedRun?: FailedRunView }
  | { ok: false; code: string; reason: string }

const GATE = 'REQBOARD_SUBTASK_GATE'

function gate(reason: string): EvidenceVerdict {
  return { ok: false, code: GATE, reason }
}

/**
 * 汇报兜底判定：**没有成功的 run** 时，允许 `lastReport` 充当有效执行证据。
 *
 * 口径（REQ-260929195829-6e02 t1 的原始意图 + 2026-10-03 的判据修正）：
 *   - 前提：`hasReport` 且 `filesChanged` / `completed` 至少一项非空；
 *   - 写入族（file）：`filesChanged` 非空，且至少一个文件真实存在、`mtime >= since`（链出身）；
 *   - 结论族（verdict）：天然无 diff，`completed` 非空即过；
 *   - 页面插件构建新鲜度照旧检查。
 *
 * 两条纪律：
 *   ① 拒绝时**同时**给出「那次 run 为什么失败」与「补什么」——只报失败等于把排查成本甩给用户；
 *   ② 通过时**不许把失败静默吞掉**：`note` + `failedRun` 结构化带出，调用方据此记一条诊断，
 *      保证"这张卡是靠汇报过的、且它曾有一次失败"可被追溯。
 */
function fallbackViaReport(
  input: SubtaskEvidenceInput,
  evidenceKind: 'file' | 'verdict',
  run: SubtaskRunView | undefined,
): EvidenceVerdict {
  // 失败投影：run 从未存在 → 说明"未执行"；存在但失败 → 点名 stopReason/reason
  const failureDetail = run === undefined
    ? '未执行或未落库（台账里没有 workflow run 记录）'
    : fmt('最近一次 run 失败于 stopReason={stop}{reason}', {
        stop: run.stopReason,
        reason: run.reason !== undefined && run.reason.length > 0 ? '（' + run.reason + '）' : '',
      })
  const hasValidReport = input.hasReport
    && (input.reportFilesChanged.length > 0 || input.reportCompleted.length > 0)
  if (!hasValidReport) {
    return gate(fmt(
      '子卡凭证不过：既没有成功的 workflow run，也没有合格的完工汇报——{failure}。补齐（二选一）：'
      + '① 调 reqboard_task_report 落一条汇报（写入族要 filesChanged：至少一个文件真实存在且 mtime ≥ 链出身 {since}；结论族要 completed）；'
      + '② 修好执行引擎后重跑本卡',
      { failure: failureDetail, since: input.since },
    ))
  }
  if (input.reportFilesChanged.length === 0 && evidenceKind !== 'verdict') {
    return gate(fmt(
      '子卡凭证不过：阶段 {stage} 属写入族，汇报未给出改动文件（缺少文件系统证据）——{failure}。'
      + '补齐：在 reqboard_task_report 的 filesChanged 里列出真实落盘的文件路径（相对工作区根）',
      { stage: String(input.stageKind ?? ''), failure: failureDetail },
    ))
  }
  if (input.reportFilesChanged.length > 0) {
    const fresh = input.reportFilesChanged.some((f) => {
      const m = input.fileMtimes[f]
      return m !== undefined && m >= input.since
    })
    if (!fresh) {
      return gate(fmt(
        '子卡凭证不过：改动文件不存在或 mtime 早于链出身 {since}——{failure}。'
        + '补齐：① 确认路径正确（相对工作区根）；② 确保文件在本轮真实落盘；③ 检查文件是否被误删',
        { since: input.since, failure: failureDetail },
      ))
    }
  }
  if (input.pagesSrcFiles.length > 0) {
    if (!input.clientBuildExists) {
      return gate(fmt('子卡凭证不过：改了 {files} 但 packages/pages/{pkg}/lib/client.js 不存在，请先构建——{failure}', {
        files: input.pagesSrcFiles.join(', '),
        pkg: pagesPkgOf(input.pagesSrcFiles[0]),
        failure: failureDetail,
      }))
    }
    if (input.clientBuildMtime < input.newestPagesSrcMtime) {
      return gate(fmt('子卡凭证不过：packages/pages/{pkg}/lib/client.js 旧于 src 最新改动，先重新构建——{failure}', {
        pkg: pagesPkgOf(input.pagesSrcFiles[0]),
        failure: failureDetail,
      }))
    }
  }
  // 通过。run 存在但失败时**必须**把失败结构化带出（不许静默吞掉）；
  // run 从未存在（人工推进路径）无需 note——本来就没有失败可报。
  if (run === undefined) return { ok: true }
  return {
    ok: true,
    note: fmt('凭证经「汇报兜底」通过：{failure}。通过依据 = lastReport 的 filesChanged/completed + 文件新鲜度（≤ 链出身 {since}）',
      { failure: failureDetail, since: input.since }),
    failedRun: { stopReason: run.stopReason, ...(run.reason !== undefined ? { reason: run.reason } : {}) },
  }
}

/**
 * 失败是否属于「**环境类不可达**」（而非工作/流程本身的失败）。
 *
 * 只有环境类失败才允许走汇报兜底，理由是二者**含义不同**：
 *   - 环境类（引擎被作用域隔离、服务不可达）：平台**根本没跑起来**，工作可能已由本窗口在带外
 *     完成，`lastReport` 是唯一可得的执行证据——这正是"一次环境抖动把卡永久毒死"要修的场景；
 *   - 实质性（`team_report_stale` / `no_output` / `SCRIPT_PARSE` / 跨卡覆盖 …）：说明**这次派发
 *     本身出了问题**，不得被一份更早的报告"洗白"。
 *
 * 后者有既存守卫且对着真实事故：`tests/execute-subtask-team.test.ts`
 * 「台账报告早于本次派发（历史报告）→ team_report_stale（不让早前交付侥幸通过）」。
 * 本函数把这条边界写成可测的一行，而不是靠"哪种失败更常见"的印象。
 *
 * legacy `engine_unavailable` 必须一并认：台账里**已存在**的历史记录就是那个形状
 * （如 REQ-261003191948-e94a 的 `t-bec57a.lastRun`），不认它就修不动真实受害卡。
 */
const ENVIRONMENTAL_FAILURE = /engine_unavailable|engine_unreachable/i

export function isEnvironmentalFailure(run: { stopReason: string; reason?: string }): boolean {
  return ENVIRONMENTAL_FAILURE.test(run.stopReason)
    || (run.reason !== undefined && ENVIRONMENTAL_FAILURE.test(run.reason))
}

/** 三项校验 + 构建新鲜度（保留）；不通过返回 {ok:false}，由调用方拒绝转移。 */
export function checkSubtaskEvidence(input: SubtaskEvidenceInput): EvidenceVerdict {
  const run = input.run
  
  // 🔍 调试日志：查看实际传入的参数
  const evidenceKindDebug = input.stageKind === undefined
    ? 'file'
    : STAGE_EVIDENCE_KIND[input.stageKind] ?? 'file'
  console.log('[DEBUG checkSubtaskEvidence]', {
    hasReport: input.hasReport,
    stageKind: input.stageKind,
    evidenceKind: evidenceKindDebug,
    valueNonEmpty: run?.valueNonEmpty,
    reportFilesChanged: input.reportFilesChanged?.length,
    reportCompleted: input.reportCompleted?.length
  })
  
  const evidenceKind = input.stageKind === undefined
    ? 'file'
    : STAGE_EVIDENCE_KIND[input.stageKind] ?? 'file'

  // ── 没有**成功的** run → 走汇报兜底（仅限环境类失败） ──────────────────────
  // 判据是"有没有**成功的** run"，而不是"**有没有** run 记录"。
  // 2026-10-03 修（子卡毒状态）：原写法 `if (run === undefined) {…兜底…} if (!run.ok) {…拒…}`
  // 让一次失败 run 永久堵死兜底——判据错在"存在性"而非"成功性"。
  // 但兜底**只对"环境类不可达"开放**：实质性失败（如 team_report_stale）仍按原口径拒绝，
  // 否则一份更早的报告就能把"这次派发本身失败"洗白（既有守卫见 isEnvironmentalFailure 注释）。
  if (run === undefined || run.ok !== true) {
    if (run !== undefined && !isEnvironmentalFailure(run)) {
      return gate(fmt('子卡凭证不过：workflow run 未完成（stopReason={stop}{reason}）', {
        stop: run.stopReason,
        reason: run.reason !== undefined ? '；' + run.reason : '',
      }))
    }
    return fallbackViaReport(input, evidenceKind, run)
  }

  // 对结论族子卡放宽 valueNonEmpty 要求：workflow 执行成功即可，允许无产出
  if (!run.valueNonEmpty && evidenceKind !== 'verdict') {
    return gate(fmt('子卡凭证不过：run 产出为空（脚本未返回有效 JSON）。修改方法：在 workflow 末尾 return 一个 JSON 对象，至少包含 filesChanged 或 completed 字段', {}))
  }
  
  // 结论族子卡如果 workflow 成功但无汇报，自动通过（验证通过即为有效结论）
  if (evidenceKind === 'verdict' && !input.hasReport) {
    return { ok: true }
  }
  
  if (!input.hasReport || (input.reportFilesChanged.length === 0 && input.reportCompleted.length === 0)) {
    return gate(fmt('子卡凭证不过：缺少完工汇报（filesChanged/completed 至少一项非空）。修改方法：在 workflow 中 return {"filesChanged": ["路径"], "completed": ["完成项"]}，至少一个数组非空', {}))
  }
  // L2 证据形态分流（D17）：写入族必须有落盘改动；结论族（review/test/verify/…）天然无 diff，
  // 完工结论非空即放行。此前"无 filesChanged 一律拒"让结论族 100% 死、链必停。
  if (input.reportFilesChanged.length === 0) {
    if (evidenceKind !== 'verdict') {
      return gate(fmt('子卡凭证不过：阶段 {stage} 属写入族，汇报未给出改动文件（缺少文件系统证据）。修改方法：确保 workflow 创建/修改了文件，并在返回值的 filesChanged 中列出文件路径', {
        stage: String(input.stageKind ?? ''),
      }))
    }
    // 结论族：前面已保证 filesChanged/completed 至少其一非空，这里 completed 必非空 → 放行。
  } else {
    const fresh = input.reportFilesChanged.some((f) => {
      const m = input.fileMtimes[f]
      return m !== undefined && m >= input.since
    })
    if (!fresh) {
      return gate(fmt('子卡凭证不过：改动文件不存在或 mtime 早于链出身 {since}。修改方法：① 确认文件路径正确（相对工作区根）；② 确保文件在 workflow 执行时被创建/修改；③ 检查文件是否被意外删除', { since: input.since }))
    }
  }
  if (input.pagesSrcFiles.length > 0) {
    if (!input.clientBuildExists) {
      return gate(fmt('子卡凭证不过：改了 {files} 但 packages/pages/{pkg}/lib/client.js 不存在，请先构建', {
        files: input.pagesSrcFiles.join(', '),
        pkg: pagesPkgOf(input.pagesSrcFiles[0]),
      }))
    }
    if (input.clientBuildMtime < input.newestPagesSrcMtime) {
      return gate(fmt('子卡凭证不过：packages/pages/{pkg}/lib/client.js 旧于 src 最新改动，先重新构建', {
        pkg: pagesPkgOf(input.pagesSrcFiles[0]),
      }))
    }
  }
  return { ok: true }
}

/** 从 pages 源文件路径取包名（构建新鲜度错误消息用）。 */
export function pagesPkgOf(file: string | undefined): string {
  if (file === undefined) return ''
  const m = /^packages\/pages\/([^/]+)\//.exec(file)
  return m?.[1] ?? ''
}

/** 父卡收尾门（INV-5）：存在未 done 子卡时不得收尾。 */
export function checkParentSubtasksDone(subtasks: ReadonlyArray<{ id: string; status: string }>): EvidenceVerdict {
  const open = subtasks.filter((s) => s.status !== 'done' && s.status !== 'canceled')
  if (open.length === 0) return { ok: true }
  return gate(fmt('父卡不能收尾：仍有 {n} 张子卡未完成（{ids}）', {
    n: open.length,
    ids: open.map((s) => s.id).join('、'),
  }))
}
