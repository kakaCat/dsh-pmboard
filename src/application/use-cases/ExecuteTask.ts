/**
 * ExecuteTask 用例（REQ-4842fe t5 / FR-6）——**单张子卡的完整闭环**：
 *   子卡 in_progress（开执行记录）→ 一次 workflow run → 由产出生成子卡 report →
 *   子卡凭证门（三项 + 构建新鲜度）→ 子卡 done。
 *
 * 为什么单点在这里：叶子（干活）在 workflow 引擎的子代理里，枝干（状态/凭证/台账）
 * 必须留在宿主侧——脚本内无 ctx、读不到台账，任何"让脚本改状态"的设想都会炸
 * （design/workflow-engine-contract §4）。
 *
 * @module dsh-pmboard/application/use-cases/ExecuteTask
 */
import type { UseCaseDeps } from '../ports.js'
import { fmt } from '../../domain/text/fmt.js'
import { stageLabel, STAGE_EVIDENCE_KIND, type StageKind } from '../../domain/task/SubtaskTemplate.js'
import { generateSubtaskScript } from '../internal/workflow-script.js'
import { resolveStageModel } from '../../domain/task/StageRouting.js'
import { shouldAlertZeroOutput, zeroOutputStreak } from '../../domain/workflow/StageTelemetry.js'
// FR-11 路线 A：团队执行驱动（团队服务可用时优先于 workflow）。
import { runSubtaskViaTeam } from './SubtaskTeamRun.js'
// D14（REQ-260927123256-196b 的模块，此前**未接线**）：看板「继续」/启动恢复入口无 exec.agent 时
// 按绑定窗口兜底解析在线 agent；解不到给可读原因。它同时是团队分支的前置（TeamService 要 live caller）。
import { ensureAgentHandle } from '../internal/agent-handle.js'
import { assertDoneEvidence } from '../internal/support.js'
import { normalizeArtifactPath } from '../../domain/artifact/ArtifactPath.js'
import { detectCrossCardOverwrite } from '../internal/cross-card.js'
import { isSubtask, type TaskRecord } from '../../shared/protocol.js'
import { transitionTask } from '../internal/task-transition.js'
import {
  closeExecutions,
  openExecution,
  safeWindowKey,
  snapshotForWindow,
} from '../internal/token-usage.js'
import { requirementStoreOf, taskStoreOf, readyTasksOf, mutateQueue, mutateIfPresent } from './queue-access.js'

/** 子代理产出的结构化摘要（filesChanged / 完成项 / 证据）。 */
export interface SubtaskOutput {
  filesChanged: string[]
  completed: string[]
  evidence: string[]
  raw: string
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter((s) => s.length > 0).slice(0, 50)
}

/**
 * 解析子代理产出：优先按 JSON 对象读（脚本约定的产出形状）；文本则尝试 JSON.parse；
 * 都不是时把原文当一条完成项（filesChanged 为空 → 凭证门会因此拦下，**不猜文件**）。
 */
export function parseSubtaskOutput(output: unknown): SubtaskOutput {
  let obj: unknown = output
  if (typeof output === 'string') {
    try { obj = JSON.parse(output) } catch { obj = undefined }
  }
  if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
    const o = obj as Record<string, unknown>
    return {
      filesChanged: asStringArray(o.filesChanged),
      // schema 契约用 summary，旧 JSON 契约用 completed/done——两者都认，避免"产出形状对了却被判空"。
      completed: asStringArray(o.completed ?? o.done ?? (typeof o.summary === 'string' ? [o.summary] : undefined)),
      evidence: asStringArray(o.evidence),
      raw: typeof output === 'string' ? output : JSON.stringify(output),
    }
  }
  const raw = typeof output === 'string' ? output : output === undefined || output === null ? '' : JSON.stringify(output)
  const trimmed = raw.trim()
  return { filesChanged: [], completed: trimmed.length > 0 ? [trimmed.slice(0, 200)] : [], evidence: [], raw: trimmed }
}

/** 产出是否"非空"（null/undefined/空串/空对象/空数组都算空）。 */
export function isNonEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v as Record<string, unknown>).length > 0
  return true
}

/**
 * 子卡提示词：含父卡实施方案 + 本卡验收标准 + 产出 JSON 约定。
 *
 * REQ-260927121324-abde 附带修复（路径口径）：凭证门（assertDoneEvidence → deps.docs.stat）
 * 一律按**仓库根**（deps.docs.workspaceRoot()）解析文件，而子代理跑在自己的会话工作区里，
 * 容易按当前目录报短路径（如 src/...）——于是真实存在的文件被判"不存在"，子卡恒不过门。
 * 这里把仓库根绝对路径写进提示词，要求 filesChanged 用仓库根相对路径（或绝对路径）。
 */
/**
 * 本步边界（REQ-260928185112-e20d P0-1 验收切片）——每个阶段**只对自己那一段负责**。
 *
 * 为什么需要：子卡此前普遍带着"父卡验收全文"，于是 dev 段去跑 build/grep 零命中、
 * integrate 与 test 段各跑一遍同一批命令（实测 integrate 6 张卡共 24.7 min、**零落盘产出**）。
 * 口径：**父卡的终态验收命令只在 test 段执行**；其余段只做本卡范围内的活，不越界、不重复。
 *
 * REQ-261003203909-55f2 FR-7：类型改 `Record<StageKind,string>`——**20 段全登记成为编译期义务**
 * （此前 `Record<string,string>` + `?? ''`：新段漏写边界规则静默落空，子代理拿到的提示词没有
 * 边界约束）。原 `doc` 键被移除：它不是 StageKind（受控枚举无 doc），`stageKind` 取不到它，
 * 是松散类型掩盖的死配置。
 */
export const STAGE_SCOPE_RULE: Readonly<Record<StageKind, string>> = {
  dev: '【本步边界】只做本卡范围内的改动与本地验证（改动落盘 + 与本卡文件相关的测试/命令）。**不要**执行父卡的终态验收命令（全量测试 / build:client / grep 零命中等）——那属于测试段。',
  integrate: '【本步边界】只做本卡范围的接口对接与**真实一次调用**验证（给请求样例 + 实际响应）。**不要**重复跑父卡终态验收命令（属测试段），**不要**为此改写实现（属研发段）。',
  review: '【本步边界】只给"设计与实现是否偏离"的逐条结论与依据。**不要**改代码，**不要**跑父卡终态验收命令（属测试段）。',
  test: '【本步边界】父卡的终态验收命令由本段执行：逐条跑并贴命令 + 退出码 + 计数摘要。**不要**改代码；跑不过就如实报失败并给出失败输出。',
  repro: '【本步边界】只复现缺陷：写最小回归用例并证明「修复前失败」（贴输出）。**不要**改实现（属修复段）。',
  fix: '【本步边界】只做根因修复并让回归用例转绿（贴命令与输出），根因单独写明。**不要**扩大改动面（无关重构另立卡）。',
  regress: '【本步边界】只跑回归：失败数 ≤ 开工前基线并贴比对输出。**不要**改代码；新增失败如实报。',
  probe: '【本步边界】只回答本卡的可证伪问题并贴证据（命令 + 输出）。**不要**下实施结论（属分析段），**不要**改代码。',
  collect: '【本步边界】只取数：来源/时点/样本量标注，产物落盘。**不要**做结论分析（属分析段）。',
  analyze: '【本步边界】只做结论分析：结论含置信度与适用边界，列出被证伪的假设。**不要**改代码，**不要**重复取数（属取数段）。',
  prepare: '【本步边界】只做方案/脚本准备并自检可复现（脚本命令 + 输出摘要）。**不要**直接执行真实变更（属执行/实施段）。',
  run: '【本步边界】只执行准备好的脚本并落库结果（记录条数/输出路径可复核）。**不要**临时改脚本逻辑（属准备段）。',
  verify: '【本步边界】只逐条校验并给结果（异常项列出并标注影响面）。**不要**改被校验的对象。',
  change: '【本步边界】只声明变更内容与回滚方式，并给可执行验证命令。**不要**实施生效（属实施段）。',
  dryrun: '【本步边界】只做试运行并比对预期（--dry-run + 输出）。**不要**让变更真实生效（属实施段）。',
  apply: '【本步边界】只做实施生效 + 可复核验证输出。**不要**变更方案本身（属变更段）。',
  // REQ-261003203909-55f2 新增四段（文本与 STAGE_ACCEPTANCE 同源）：
  e2e: '【本步边界】只做端到端场景断言（写用例 + 跑 + 贴「场景名/命令/退出码」）。**不要**改实现代码（属研发段），**不要**重复跑父卡终态验收命令（属测试段）。',
  manual: '【本步边界】只生成核对清单并停下等人。**禁止**代替人做核对、**禁止**伪造核对结果（未核对就写「通过」）。',
  release: '【本步边界】只做构建/发版与回滚方式声明（构建戳/版本号断言 + 输出）。**不要**改功能代码（属研发段）。',
  capture: '【本步边界】只采集不改动：产物落盘 evidence/ 并给可复核命令。**不要**做结论分析（属分析段）。',
}

export function buildSubtaskPrompt(parent: TaskRecord, subtask: TaskRecord, label: string, workspaceRoot?: string): string {
  const root = typeof workspaceRoot === 'string' && workspaceRoot.length > 0 ? workspaceRoot : undefined
  const wsBase = root === undefined ? undefined : root.replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter((s) => s.length > 0).pop()
  const forbidGitRoot = wsBase === undefined ? '' : '；**更禁止**以 `' + wsBase + '/` 开头——那是 git 根、比工作区根多一层（本仓实测 `' + wsBase + '/packages/...` 被判"文件不存在"）'
  const pathContract = root === undefined
    ? ''
    : `
【路径口径（凭证门按工作区根解析，写错会被判"文件不存在"）】filesChanged 一律写**相对工作区根**的路径，工作区根 = ${root}。例如 packages/web/dsh-pmboard/src/application/use-cases/ExecuteTask.ts；**禁止**写相对你当前目录的短路径（如 src/application/use-cases/ExecuteTask.ts）${forbidGitRoot}。拿不准前缀就直接给以 ${root} 开头的绝对路径。
`
  // REQ-260927144541-0481 根因修复（integrate 反复被凭证门退回）：把**凭证门的证据形态**
  // 提前写进工作要求。此前提示词只说'给结论/给文件'，Worker 不知道本阶段的证据形态——
  // integrate（写入族）交了一份只含 completed 的联调结论，被 checkSubtaskEvidence 判
  // '汇报未给出改动文件' 退回、链暂停；同一张卡重跑仍复现（出现多次，非偶发）。
  // 这里只**如实转述门的要求**，不改判定逻辑（decomposition §1.3 边界）。
  const stageKey = String(subtask.stageKind ?? '') as StageKind
  const scopeRule = STAGE_SCOPE_RULE[stageKey] ?? ''
  // P0-2：产出契约与脚本 schema 同源（写入族 filesChanged / 结论族 verdict），避免"提示词要 completed、
  // schema 只有 filesChanged+summary"这种错配导致 schema 校验必败、产出被判空。
  const evidenceFamily = STAGE_EVIDENCE_KIND[stageKey] ?? 'file'
  const outputContract = evidenceFamily === 'verdict'
    ? '{"verdict":"pass 或 fail","summary":"结论与依据摘要","evidence":["命令与输出摘要", ...],"issues":["发现的问题，无则空数组"]}'
    : '{"filesChanged":["相对仓库根路径（或以仓库根开头的绝对路径）", ...],"summary":"做了什么、完成了哪些项","evidence":["命令与输出摘要", ...]}'
  const evidenceRule = STAGE_EVIDENCE_KIND[stageKey] === 'verdict'
    ? '【本阶段凭证形态】结论族：本阶段产出是判断/输出（复核意见、测试输出、联调结论），把结论写进 completed 即算完工，不要为凑 filesChanged 编造改动文件。'
    : '【本阶段凭证形态】写入族：本阶段完工必须有落盘产出（代码改动 / 联调记录 / 测试用例等），并把真实存在的路径写进 filesChanged——只交结论会被凭证门退回（REQBOARD_SUBTASK_GATE），链会就此停下。'
  return `你是实施子代理，只完成这一张子卡的工作，做完即止（不要扩大范围）。

【父卡】${parent.title}
【本卡阶段】${String(subtask.stageKind ?? '')}（${label}）
【本卡验收标准（怎么算做完）】
${subtask.acceptance}

【父卡实施方案（上下文）】
${parent.implementation ?? '（父卡未写实施方案）'}

【父卡需求背景】
${parent.context || '（无）'}
${scopeRule}
${evidenceRule}
${pathContract}
【产出要求】完成后**只输出一个 JSON 对象**，不要额外解释；字段必须与下面的形状**逐字对齐**
（schema 是 additionalProperties:false：多写字段会被判产出无效、本条白跑）：
${outputContract}`
}

export interface ExecuteSubtaskInput {
  subtaskId: string
  /** 执行窗口码（system 驱动可传 'system'）。 */
  windowKey: string
  /** 调用者（透传给引擎作 parent 归属）。 */
  exec?: unknown
  /**
   * 本次 run 的取消权（Phase2）：**优先于调用方 turn 的 signal**。
   * 自动链投递路径传的是后台 job 的 signal（job 是工作单元）；同步兼容路径不传 → 回落 exec.signal。
   */
  runSignal?: AbortSignal
}

export interface ExecuteSubtaskResult {
  ok: boolean
  subtaskId: string
  parentId?: string
  stageKind?: string
  filesChanged?: string[]
  reason?: string
  code?: string
}

function fail(subtaskId: string, reason: string, code: string, extra: Partial<ExecuteSubtaskResult> = {}): ExecuteSubtaskResult {
  return { ok: false, subtaskId, reason, code, ...extra }
}

const ZERO_OUTPUT_ALERT_MARK = '[零产出告警]'

/**
 * 零产出告警（REQ-261004110201-f253 FR-3）。
 *
 * 判据全部来自**已落盘数据**（子卡执行记录 + 需求评论），不依赖内存状态 ⇒ 可重放、无并发新面：
 *   · streak = 该阶段末尾连续 zeroOutput 执行数（未知即断，见 domain 侧注释）；
 *   · alerted = 台账里同阶段既有告警条数；
 *   · 写新告警当且仅当 floor(streak / threshold) > alerted。
 *
 * 边界：阈值/阶段名缺失、需求不存在、无 streak → 静默返回（没问题就不说话）；
 * 写盘失败只 warn（旁路能力，绝不拖垮子卡交付）。
 */
async function maybeAlertZeroOutput(deps: UseCaseDeps, requirementId: string, stageKind: string): Promise<void> {
  const threshold = deps.zeroOutputAlertThreshold ?? 2
  if (stageKind.length === 0 || !Number.isFinite(threshold) || threshold < 1) return
  try {
    const tasks = await taskStoreOf(deps).listByRequirement(requirementId)
    const execs = tasks
      .filter((t) => t.parentId !== undefined && String(t.stageKind ?? '') === stageKind)
      .flatMap((t) => t.executions ?? [])
    const streak = zeroOutputStreak(execs)
    if (streak < threshold) return
    const req0 = await requirementStoreOf(deps).get(requirementId)
    if (req0 === undefined) return
    const alerted = (req0.comments ?? [])
      .filter((c) => String(c.body ?? '').includes(ZERO_OUTPUT_ALERT_MARK) && String(c.body ?? '').includes('stage=' + stageKind))
      .length
    if (!shouldAlertZeroOutput(streak, alerted, threshold)) return
    const lastDuration = execs
      .filter((e) => e.endedAt !== undefined)
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0]
    const durationMs = lastDuration === undefined ? 0 : Math.max(0, (lastDuration.endedAt ?? 0) - lastDuration.startedAt)
    const at = deps.clock.now()
    await mutateIfPresent(requirementStoreOf(deps), requirementId, (req) => {
      req.comments.push({
        id: deps.ids.comment(),
        body: fmt('{mark} stage={stage} streak={streak} threshold={threshold} 最近耗时={ms}ms'
          + '——该阶段连续多次零落盘产出，建议人工核对模板与提示词（系统不会自动改模板）。',
        { mark: ZERO_OUTPUT_ALERT_MARK, stage: stageKind, streak: String(streak), threshold: String(threshold), ms: String(durationMs) }),
        createdAt: at,
        createdBy: { kind: 'system' },
      })
      return { changed: true }
    })
  } catch (err) {
    try { console.warn('[ExecuteTask] 零产出告警写入失败（不阻断交付）：', err) } catch { /* 兜底 */ }
  }
}

/**
 * 执行一张子卡（幂等：已 done 直接返回；已在 in_progress 不重复开执行记录）。
 * 失败**不改子卡状态**（退回 todo + attempt+1 属 t8 失败语义，由事件链决定）。
 */
export async function executeSubtask(deps: UseCaseDeps, input: ExecuteSubtaskInput): Promise<ExecuteSubtaskResult> {
  const store = taskStoreOf(deps)
  // UC-2（REQ-260927202051-f6df FR-2）：子卡与父卡一律从**队列**取（台账 v9 已无 tasks）。
  const task = await store.get(input.subtaskId)
  if (task === undefined) return fail(input.subtaskId, fmt('子卡不存在：{id}', { id: input.subtaskId }), 'REQBOARD_TASK_NOT_FOUND')
  if (!isSubtask(task)) return fail(task.id, fmt('{id} 不是子卡（无 parentId）', { id: task.id }), 'REQBOARD_NOT_SUBTASK')
  const parent = task.parentId === undefined ? undefined : await store.get(task.parentId)
  if (parent === undefined) {
    return fail(task.id, fmt('子卡 {id} 的父卡 {p} 不存在', { id: task.id, p: String(task.parentId) }), 'REQBOARD_SUBTASK_GATE')
  }
  // 队列就绪视图（TC-9.2）：父卡字段取自队列之后，日志显式打印 ready 列表（诊断链卡住的唯一线索）。
  const queueTasks = await store.listByRequirement(task.requirementId)
  const ready = readyTasksOf(queueTasks)
  console.log('Queue ready tasks: ' + (ready.length > 0 ? ready.map((t) => t.id).join(', ') : '[]') + ' (requirement ' + task.requirementId + ')')
  const base = { subtaskId: task.id, parentId: parent.id, stageKind: task.stageKind }
  if (task.status === 'done') return { ok: true, ...base, filesChanged: task.lastReport?.filesChanged ?? [], reason: 'already_done' }
  if (task.status === 'canceled') return fail(task.id, '子卡已取消', 'REQBOARD_SUBTASK_GATE', base)

  // D14 接线：三条入口（工具/看板/启动恢复）在此统一拿 agent 句柄；解不到就**可读地失败**，
  // 不让引擎的 TypeError（reading 'session'）当结论。团队分支与 workflow 分支共用它。
  const handle = await ensureAgentHandle(deps, parent.id, task.id, input.exec, queueTasks)
  if (!handle.ok) return fail(task.id, handle.reason, 'REQBOARD_SUBTASK_GATE', base)
  const runExec = handle.exec

  // 自动链子卡会话码（REQ-260927121324-abde FR-4）：safeWindowKey 解析（'system' / 缺 agent → undefined），
  // 解析不到退回该需求的绑定窗口（sourceSessionId），再无 → 诚实不写快照（缺失 ≠ 0，禁止编造）。
  const req = await requirementStoreOf(deps).get(task.requirementId)
  const sessionKey = safeWindowKey(deps, input.exec) ?? req?.sourceSessionId

  const actor = { kind: 'system' as const }
  const label = stageLabel(task.stageKind as never)
  // 提示词只算一次：workflow 分支拼进脚本，团队分支作为 team task 描述（含台账子卡 id）。
  const prompt = buildSubtaskPrompt(parent, task, label, deps.docs.workspaceRoot())
  let script: string
  try {
    // FR-1（REQ-261004110201-f253）：按「子卡阶段 × 需求难度」查路由表；未配置/未命中 → 不注入
    //（生成结果与改造前逐字节相同）。表在装配期已校验，此处只做纯解析。
    const stageRoute = resolveStageModel(String(task.stageKind ?? ''), req?.promptDifficulty, deps.stageRouting)
    script = generateSubtaskScript({
      stageKind: String(task.stageKind ?? ''),
      stageLabel: label,
      prompt,
      ...(stageRoute !== undefined ? { route: stageRoute } : {}),
    })
  } catch (err) {
    return fail(task.id, (err as Error).message, (err as { code?: string }).code ?? 'workflow_script_contract', base)
  }

  // run 产出解包（REQ-260927100007-b8ba t-8bce7d）：WorkflowRunOutcome 是 {ok, value:{output}} **两层信封**，
  // 产出本身按既有 JSON 契约解析。此前误把信封当产出对象用，filesChanged 恒 undefined → 子卡必崩。
  // schema 仍随 args 透传给引擎，用于约束子代理的产出形状。
  let rawOutput: unknown = undefined
  let outcome: { ok: boolean; reason?: string }
  // REQ-260927121324-abde 附带修复：子卡「开工时刻」必须取在 workflow 开工之前。
  // 此前 ranAt 在 run 结束后才取（REQ-260927100007-b8ba「先执行后认领」改造的回归），
  // claimedAt（凭证门 since）恒晚于子代理写文件的 mtime → 子卡凭证门永远不过、链必停。
  const startedAt = deps.clock.now()
  // FR-11 路线 A（REQ-260926140539-457b）：团队执行优先——caller 是 live agent 且服务可用时，
  // 把这张子卡派给团队 Worker（持久、可观测）；Worker 经 reqboard_task_report 写台账，链把产出
  // 读回来合成为 workflow 同款形状 → 下游（解析/跨卡/落账/凭证门）逐字复用。服务不可用 → 旧路径。
  const teamCaller = (runExec as { agent?: unknown } | undefined)?.agent
  if (deps.teams !== undefined && deps.teams.available() && teamCaller !== undefined) {
    const viaTeam = await runSubtaskViaTeam(deps, {
      task, parent, caller: teamCaller, prompt,
      // 一次性建全队任务时，为同队其它子卡现算工作要求（避免 SubtaskTeamRun 反向 import 本文件）。
      promptFor: (t) => buildSubtaskPrompt(parent, t, stageLabel(t.stageKind as never), deps.docs.workspaceRoot()),
    })
    outcome = viaTeam.ok ? { ok: true } : { ok: false, reason: viaTeam.reason }
    rawOutput = viaTeam.ok
      ? JSON.stringify({ filesChanged: [...viaTeam.filesChanged], summary: viaTeam.summary })
      : undefined
  } else if (deps.workflow === undefined) {
    outcome = { ok: false, reason: 'engine_unavailable' }
  } else {
    try {
      // 构造 schema 定义
      const schema = {
        type: 'object',
        properties: {
          filesChanged: {
            type: 'array',
            items: { type: 'string' },
            description: '改动的文件路径列表（相对工作区路径）'
          },
          summary: {
            type: 'string',
            description: '执行摘要：做了什么、完成了哪些项'
          }
        },
        required: ['filesChanged', 'summary'],
        additionalProperties: false
      }
      const started = await deps.workflow.start({
        script,
        meta: { name: 'reqboard-subtask-' + String(task.stageKind ?? 'x'), description: fmt('子卡执行：{title}', { title: task.title }) },
        args: { subtaskId: task.id, parentId: parent.id, stageKind: String(task.stageKind ?? ''), schema },
        parent: (runExec as { agent?: unknown } | undefined)?.agent,
        // REQ-260928185112-e20d Phase2：取消权归**承载链的后台 job**；只有拿不到 job signal 时
        // （同步兼容路径 / 看板直投）才回落到调用方 turn 的 signal。此前一律用 turn 的 signal →
        // turn 一结束，链里下一张子卡 0.1–3.6s 瞬断（实测 4 次）并连带 2 次长跑被掐。
        signal: input.runSignal ?? (runExec as { signal?: AbortSignal } | undefined)?.signal,
      })
      if (started.ok) {
        outcome = { ok: true }
        rawOutput = (started.value as { output?: unknown } | undefined)?.output
      } else {
        outcome = { ok: false, reason: started.reason }
      }
    } catch (err) {
      outcome = { ok: false, reason: fmt('run 异常：{m}', { m: String((err as Error).message ?? err) }) }
    }
  }

  const parsedRaw = parseSubtaskOutput(rawOutput)
  // 路径归一（REQ-260927121324-abde 附带修复）：子代理产出可能带仓库根目录名前缀
  // （如 agent-dh/packages/...）或绝对路径，而凭证门按 deps.docs.workspaceRoot() 解析——
  // 不归一就会把真实存在的文件判成「不存在」，子卡恒不过门、链必停。这里统一收敛成
  // 工作区相对路径再落 lastReport 与跨卡判定。
  const wsRoot = deps.docs.workspaceRoot()
  const parsed: SubtaskOutput = {
    ...parsedRaw,
    filesChanged: parsedRaw.filesChanged
      .map((f) => normalizeArtifactPath(f, wsRoot))
      .filter((r) => r.form === 'workspace' && r.path.length > 0)
      .map((r) => r.path),
  }
  const valueNonEmpty = parsed.raw.trim().length > 0 || parsed.filesChanged.length > 0 || parsed.completed.length > 0
  const ranAt = deps.clock.now()

  // REQ-4842fe t9/FR-10 次防线：产出文件的 mtime 落在另一张在跑父卡的执行窗口内 → 判跨卡覆盖。
  // FR-2（REQ-261003222428-3556）：传入我自己的执行窗口——并行组里我自己的开工落盘 mtime
  // 必落在对方窗口内，先由我的窗口解释（我写的≠覆盖），解释不了才判。
  if (outcome.ok && parsed.filesChanged.length > 0) {
    const conflict = detectCrossCardOverwrite(
      queueTasks,
      parent.id,
      parsed.filesChanged,
      (f) => deps.docs.stat(f)?.mtimeMs,
      ranAt,
      { startedAt, endedAt: ranAt },
    )
    if (conflict !== undefined) {
      return fail(
        task.id,
        fmt('跨卡覆盖：{file} 的 mtime 落在父卡 {p} 的子卡 {s} 执行窗口内', {
          file: conflict.file,
          p: conflict.otherParentId,
          s: conflict.otherSubtaskId,
        }),
        'REQBOARD_CROSS_CARD',
        base,
      )
    }
  }

  // REQ-260925110957-552d: 执行成功后才写 in_progress + lastRun + lastReport
  // 任务写经 TaskStore（台账 v9 无 tasks 键）；本步只改任务，需求侧无写入。
  await mutateQueue(deps, task.requirementId, (tasks) => {
    const t = tasks.find((x) => x.id === task.id)
    if (t === undefined) return undefined
    
    // 先执行后认领：执行成功才写 in_progress（经唯一收敛点，校验 + 状态事件一步到位）
    // 收敛点已 bump version/updatedAt/updatedBy；下面的 t.version++ 只在未发生转移时补
    let transitioned = false
    if (t.status === 'todo') {
      transitionTask(t, 'in_progress', { at: ranAt, actor, role: isSubtask(t) ? 'subtask' : 'legacy' })
      transitioned = true
      t.claimedAt = startedAt
      t.claimedBy = input.windowKey
      // 执行快照唯一写入口（FR-4）：开工落记录 + 写 start 快照；
      // born-failed（outcome=failed）由助手内部不写 start，直接以终止记录落账。
      openExecution(
        t,
        {
          id: deps.ids.execution(),
          trigger: 'auto',
          at: startedAt,
          ...(sessionKey !== undefined ? { sessionId: sessionKey } : {}),
          ...(outcome.ok ? {} : { outcome: 'failed' as const, error: outcome.reason ?? '' }),
        },
        snapshotForWindow(deps, sessionKey),
      )
    }
    
    t.lastRun = { at: ranAt, ok: outcome.ok, stopReason: outcome.ok ? 'completed' : (outcome.reason ?? 'error'), valueNonEmpty, ...(outcome.ok ? {} : { reason: outcome.reason ?? '' }) }
    if (parsed.raw.length > 0 || parsed.filesChanged.length > 0 || parsed.completed.length > 0 || parsed.evidence.length > 0) {
      t.lastReport = {
        at: ranAt,
        reportIndex: (t.lastReport?.reportIndex ?? 0) + 1,
        filesChanged: parsed.filesChanged,
        completed: parsed.completed.length > 0 ? parsed.completed : [parsed.raw.slice(0, 200)],
      }
    }
    if (!transitioned) {
      t.version += 1
      t.updatedAt = ranAt
      t.updatedBy = actor
    }
    return tasks
  })

  try {
    const doneAt = deps.clock.now()
    // t8/B11：done 凭证门只需要需求的 createdAt ⇒ 取**摘要**（零文件读）
    const reqCreatedAtForDone = (await requirementStoreOf(deps).getSummary(task.requirementId))?.createdAt
    await mutateQueue(deps, task.requirementId, (tasks) => {
      const t = tasks.find((x) => x.id === task.id)
      if (t === undefined) return undefined
      // D4：assertDoneEvidence 新签名 (deps, windowKey, task, ledger, tasks)。
      assertDoneEvidence(deps, input.windowKey, t, reqCreatedAtForDone, tasks)
      transitionTask(t, 'done', { at: doneAt, actor, role: isSubtask(t) ? 'subtask' : 'legacy' })
      // 收尾唯一入口（FR-5）：闭合全部 running 并写 end/delta（快照在完工时刻新取，非开工旧值）。
      // FR-2（REQ-261004110201-f253）：同时落产出条目数（filesChanged + completed）——
      // 阶段遥测的数据来源；产出为空 → zeroOutput=true（供零产出告警与模板校准）。
      closeExecutions(t, {
        at: doneAt,
        outcome: 'succeeded',
        outputCount: parsed.filesChanged.length + parsed.completed.length,
      }, snapshotForWindow(deps, sessionKey))
      return tasks
    })
    // FR-3（REQ-261004110201-f253）：零产出告警——本卡完工后按已落盘数据推导「连续零产出」，
    // 达阈值（且按 floor(streak/threshold) 去重）就在需求台账留一条结构化告警。
    // **只告警、不改模板、不改路由、不阻断链**；告警写失败只 warn（旁路，不能拖垮交付）。
    await maybeAlertZeroOutput(deps, task.requirementId, String(task.stageKind ?? ''))
    return { ok: true, ...base, filesChanged: parsed.filesChanged }
  } catch (err) {
    const code = (err as { code?: string }).code ?? 'REQBOARD_SUBTASK_GATE'
    const reason = (err as Error).message ?? String(err)
    // 🔍 调试日志：凭证门失败
    console.log('[DEBUG ExecuteTask catch]', {
      taskId: task.id,
      stageKind: task.stageKind,
      code,
      reason: reason.substring(0, 100)
    })
    const failedAt = deps.clock.now()
    await mutateQueue(deps, task.requirementId, (tasks) => {
      const t = tasks.find((x) => x.id === task.id)
      if (t === undefined) return undefined
      // 收尾唯一入口（FR-5）：失败同样闭合 running 并写 end/delta（error 一并落账）。
      closeExecutions(t, { at: failedAt, outcome: 'failed', error: reason }, snapshotForWindow(deps, sessionKey))
      // 🔧 修复：凭证门失败时回退子卡到 todo，避免卡在 in_progress
      if (t.status === 'in_progress' && isSubtask(t)) {
        transitionTask(t, 'todo', { at: failedAt, actor, role: 'subtask' })
        t.attempt = (t.attempt ?? 0) + 1
        console.log('[DEBUG] 子卡凭证门失败，回退到 todo，attempt:', t.attempt)
      } else {
        t.version += 1
      }
      t.updatedAt = failedAt
      t.updatedBy = actor
      return tasks
    })
    // FR-11 路线 A：凭证门拒了这张卡，但团队任务已 completed —— 必须**重开**（reopen），
    // 否则 Worker 不会再碰它，下一轮链又读到 completed → 空转死循环（门白拒）。
    if (deps.teams !== undefined && deps.teams.available() && teamCaller !== undefined) {
      const linked = (await store.get(task.id))?.teamTaskId
      if (linked !== undefined) {
        try {
          const cur = deps.teams.getTask(teamCaller, linked)
          await deps.teams.updateTask(teamCaller, { taskId: linked, expectedRevision: cur.revision, action: 'reopen' })
        } catch {
          // best-effort：重开失败不改变已定失败结果——链仍会 rollback + pause + 告警，不会静默。
        }
      }
    }
    return fail(task.id, reason, code, base)
  }
}
