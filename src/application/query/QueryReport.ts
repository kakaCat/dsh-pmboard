/**
 * 首屏唯一请求「工作汇报」的服务端聚合（REQ-261004222448-292a t-43fcf4 / serves: FR-3, FR-4, FR-5）
 * ——S-1 / S-2。
 *
 * 一块响应答四问（UC-1）：**在跑什么 / 谁在跑 / 几件事等人 / 下一步谁动手**。
 * 四问分别落在 `progress` + `head.seats` + `waitingHuman` + `verdictLine`/`nextStepForAgent` 上。
 *
 * 三条纪律：
 *   ① **口径同源**：缺口里的"未接收条款"与 `reqboard_status` 用**同一份投影**
 *      （`assembleRequirementMarks` → `clauseReceiveStatus` + `collectTaskRefs`）；
 *      "挂起确认"同样取自挂起端口，不在这里另判一套。
 *   ② **终态无动作**：`archived`/`canceled`/`done` 一律返回空 `actions`（FR-3：终态只留「← 看板」）；
 *      **只给当前状态下合法的动作**（非法动作在前端就是一颗点了会被拒的按钮）。
 *   ③ **降级不冒充**：台账读不到 → `Degrade('ledger-unreadable')`；端口未装配 → 不写"0 条"。
 *
 * @module dsh-pmboard/application/query/QueryReport
 */
import { fmt } from '../../domain/text/fmt.js'
import {
  HUMAN_ONLY_REQ_TRANSITIONS,
  REQ_TRANSITIONS,
  STAGE_ARTIFACT_REQUIREMENTS,
  windowCodeFromSessionId,
  type Degrade,
  type PanelResult,
  type PendingConfirmation,
  type ReportAction,
  type ReportGap,
  type ReportHead,
  type ReportProgress,
  type ReportResponse,
  type RequirementMarksView,
  type RequirementRecord,
  type RequirementStatus,
  type StageKey,
  type TaskRecord,
} from '../../shared/protocol.js'
import { PIPELINE_ORDER } from '../../domain/requirement/RollbackSpec.js'
import { assertArtifactGates } from '../internal/artifact-gates.js'
import { parseDocument, extractClauseDefinitions, extractSkippedClauses } from '../internal/content-gates.js'
import {
  clauseReceiveStatus,
  collectTaskRefs,
  extractAllDesignSections,
  type DesignSection,
} from '../internal/content-trace.js'
import { PENDING_CONFIRM_BLOCKED_TOOLS, PENDING_CONFIRM_RECOVERY } from '../internal/pending-guard.js'
import { seatsOf } from '../internal/window.js'
import { ALL_STAGE_KEYS } from '../../shared/protocol.js'
import type { PanelQueryDeps, PanelQueryInput, PendingConfirmReadPort } from './contracts.js'

// ---------------------------------------------------------------------------
// 加法式依赖扩展（PanelQueryDeps 上没有，见最终答复的契约缺口一节）
// ---------------------------------------------------------------------------

/**
 * 挂起确认的只读口**定义已上移到 `contracts.ts`**（主窗口接线时归一），此处只 import 使用。
 *
 * 为什么不在这里再导出一次：`query/index.ts` 对 contracts 与 QueryReport 都做 `export *`，
 * 同一名字从两条路出去会让整个出口歧义（TS2308）。要引用它的调用方请从 contracts 走。
 */

/**
 * 会话归档态的只读口（本查询专用的加法式扩展）。
 *
 * `head.sessionJump[].archived` 的语义是「已归档仍可点（先恢复再打开）」——这个事实只有
 * DSH 侧的会话服务知道（客户端 `session-jump` 也是从 workspace 服务读的），
 * 台账与 `SessionProbe` 都不暴露它。缺省 = 不可知 → 一律按**未归档**给（点击直接打开；
 * 真的已归档时客户端已有「先恢复再打开」的既有路径），并在卡汇报里记为需接线的口。
 */
export interface SessionArchiveReadPort {
  archivedSessionIds?(): ReadonlySet<string>
}

/** 本查询的依赖 = 公共面板依赖 + 两个加法式只读口（缺省即降级，不抛）。 */
export type ReportQueryDeps = PanelQueryDeps & {
  pendingConfirms?: PendingConfirmReadPort
  sessionsArchive?: SessionArchiveReadPort
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

/** 需求不存在 → 抛 `code='not_found'`（路由层转 404）。 */
function notFound(id: string): Error {
  return Object.assign(new Error(fmt('需求不存在：{id}', { id })), { code: 'not_found' })
}

/** 读不到 → 降级信封（不用 0 / 空数组冒充「没有」）。 */
function unreadable(err: unknown): Degrade {
  return {
    available: false,
    reason: 'ledger-unreadable',
    note: fmt('读不到台账/队列：{msg}', { msg: err instanceof Error ? err.message : String(err) }),
  }
}

/**
 * 需求状态中文标签（服务端一份最小表）。
 *
 * 为什么不去 import 客户端的 `STATUS_LABELS`：application 层**禁止** import client
 * （`tests/layer-boundary.test.ts`）。理由与 `chainMissing` 同款；差别是标签会漂移，
 * 故此处记为"建议下沉到 domain/text/labels.ts 单点"（见最终答复）。
 */
const STATUS_LABELS: Record<RequirementStatus, string> = {
  draft: '立项', brainstorming: '需求分析', design: '设计', decomposing: '拆分',
  implementing: '实施', accepting: '验收', done: '完成', archived: '归档', canceled: '取消',
}

/** 终态（页面只留「← 看板」；操作条必须为空数组）。 */
function isTerminal(status: RequirementStatus): boolean {
  return status === 'archived' || status === 'canceled' || status === 'done'
}

// ---------------------------------------------------------------------------
// S-2 · buildGaps（四类判定）
// ---------------------------------------------------------------------------

/** 追溯断链判定的文档侧输入（读不到 → 省略 = **不判该环**，不假装断了）。 */
export interface ReportTraceInput {
  /** 设计文档的 `serves` 章节（悬空引用判定用）。 */
  designSections?: readonly DesignSection[]
}

/** 当前阶段的**前进**目标（`canceled`/回退边不算"下一步"；无前进边 → undefined）。 */
function forwardTargetOf(status: RequirementStatus): RequirementStatus | undefined {
  const i = (PIPELINE_ORDER as readonly string[]).indexOf(status)
  if (i < 0 || i >= PIPELINE_ORDER.length - 1) return undefined
  return PIPELINE_ORDER[i + 1]
}

/**
 * 第二类：必备产物缺失 / 门禁未过（与 `artifact-gates` **同源**判定）。
 *
 * 两级（与状态机前的两道校验逐条对应）：
 *   · 当前阶段的必备产物未登记 → `yellow`；
 *   · 当前阶段**出门**的产物门/人工确认门未过 → `red`（"门禁未过为红"），
 *     且与上一条**按 kind 去重**——同一件缺产物不报两条（同一条事实两种颜色只会误导）。
 * 分类未启用该阶段的产物要求时一律不判（与 `requiredKindsFor` 同源）。
 */
function artifactGaps(req: RequirementRecord): ReportGap[] {
  const gaps: ReportGap[] = []
  const from = req.status
  if (!(ALL_STAGE_KEYS as readonly string[]).includes(from)) return gaps
  const stage = from as StageKey
  // 存量需求（无 artifacts 字段或空数组）不硬拦——与 assertArtifactGates 的 isLegacy 同口径
  const isLegacy = (req.artifacts ?? []).length === 0
  if (!isLegacy) {
    for (const kind of STAGE_ARTIFACT_REQUIREMENTS[stage] ?? []) {
      if ((req.artifacts ?? []).some(a => a.stage === stage && a.kind === kind)) continue
      gaps.push({
        severity: 'yellow',
        what: fmt('{stage} 阶段缺必备产物（{kind}）', { stage: STATUS_LABELS[from], kind }),
        why: '节点完成 = 节点产物就位：缺产物时推进会被产物存在门拒绝',
        ref: { kind: 'artifact', id: kind },
      })
    }
  }
  const to = forwardTargetOf(from)
  if (to === undefined) return gaps
  const failure = assertArtifactGates(req, from, to)
  if (failure === undefined) return gaps
  const blocked: ReportGap = {
    severity: 'red',
    what: failure.message,
    why: fmt('{from} → {to} 的门未过（产物未就位或未被人确认）：这扇门就是当前唯一堵点', {
      from: STATUS_LABELS[from], to: STATUS_LABELS[to],
    }),
    ...(failure.kind !== undefined ? { ref: { kind: 'artifact' as const, id: failure.kind } } : {}),
  }
  const dup = failure.kind === undefined
    ? -1
    : gaps.findIndex(g => g.ref?.kind === 'artifact' && g.ref.id === failure.kind)
  if (dup >= 0) gaps[dup] = blocked
  else gaps.push(blocked)
  return gaps
}

/**
 * 第三类：追溯断链（FR → 设计 → 任务 → 测试 中"环缺失"）。
 *
 * 与第一类**不重叠**的判据设计（否则同一条事实报两次，计数就没法对齐）：
 *   · 只判"**已经被任务卡接收**的条款"的断链 —— 未被接收的条款归第一类；
 *   · 设计环：设计章节 `serves` 了一个不存在的编号（悬空引用）→ 断；
 *   · 测试环：接收它的卡**全部结单**却一条交付证据都没有 → 断（还在跑的卡不算断链：
 *     链条正在走，不能因为"还没走完"就报断）；
 *   · 任务环：依赖指向本需求队列里不存在的卡（悬空依赖）。
 * 拿不到设计文档（`trace.designSections === undefined`）时**不判设计环**——读不到 ≠ 断了。
 */
function traceGaps(
  tasks: readonly TaskRecord[],
  marks: RequirementMarksView,
  trace: ReportTraceInput | undefined,
): ReportGap[] {
  const gaps: ReportGap[] = []
  const roots = new Set(marks.clauses.map(c => c.clause))
  if (marks.available && trace?.designSections !== undefined) {
    for (const section of trace.designSections) {
      for (const served of section.serves) {
        if (roots.has(served)) continue
        gaps.push({
          severity: 'yellow',
          what: fmt('设计章节 {ref} 引用的条款 {clause} 不存在', {
            ref: section.file + '#' + section.section, clause: served,
          }),
          why: '设计声称服务的编号在需求文档里找不到（悬空引用，追溯断链）',
          ref: { kind: 'clause', id: served },
        })
      }
    }
  }
  for (const clause of marks.clauses) {
    if (clause.state !== 'received') continue
    const receivers = clause.by
      .map(id => tasks.find(t => t.id === id))
      .filter((t): t is TaskRecord => t !== undefined)
    if (receivers.length === 0) continue
    const allDone = receivers.every(t => t.status === 'done')
    const hasEvidence = receivers.some(t => {
      const r = t.lastReport
      return r !== undefined && ((r.completed?.length ?? 0) > 0 || (r.filesChanged?.length ?? 0) > 0)
    })
    if (!allDone || hasEvidence) continue
    gaps.push({
      severity: 'yellow',
      what: fmt('条款 {clause} 已结单却无交付证据', { clause: clause.clause }),
      why: fmt('接收它的 {n} 张卡全部 done，却没有一条汇报/证据——测试环断链', { n: receivers.length }),
      ref: { kind: 'clause', id: clause.clause },
    })
  }
  const ids = new Set(tasks.map(t => t.id))
  for (const t of tasks) {
    for (const dep of t.dependsOn) {
      if (ids.has(dep)) continue
      gaps.push({
        severity: 'yellow',
        what: fmt('任务 {task} 的前置 {dep} 不存在', { task: t.id, dep }),
        why: '依赖指向本需求队列里没有的卡（悬空依赖，排期与关键路径都画不出来）',
        ref: { kind: 'task', id: t.id },
      })
    }
  }
  return gaps
}

/**
 * S-2 入口：四类缺口逐类判定（每类都带 `ref`，页面据此"指得回去"）。
 *
 * 参数顺序与 `design/backend.md` §S-2 的表一致（`req, tasks, marks, pendingConfirms`），
 * 第五个参数是文档侧的可选输入（读不到就省略）。
 * **无缺口 → 返回空数组**（页面渲染「无缺口」一行，不画空表格）。
 */
export function buildGaps(
  req: RequirementRecord,
  tasks: readonly TaskRecord[],
  marks: RequirementMarksView,
  pendingConfirms: readonly PendingConfirmation[],
  trace?: ReportTraceInput,
): ReportGap[] {
  const gaps: ReportGap[] = []
  // ① 未被接收的条款（红）——口径与 reqboard_status 同源（同一份 marks 投影）
  if (marks.available) {
    for (const clause of marks.unreceived) {
      gaps.push({
        severity: 'red',
        what: fmt('条款 {clause} 没人接', { clause }),
        why: '既没有任务卡承接它、也没有"本轮裁剪"记录——这正是条款在流水线上蒸发的形态',
        ref: { kind: 'clause', id: clause },
      })
    }
  }
  // ② 必备产物缺失 / 门禁未过
  gaps.push(...artifactGaps(req))
  // ③ 追溯断链
  gaps.push(...traceGaps(tasks, marks, trace))
  // ④ 挂起确认未作答（黄）——why 里必须带"被拦住的写路径"
  for (const pending of pendingConfirms) {
    gaps.push({
      severity: 'yellow',
      what: fmt('挂起确认 {ticket} 待作答', { ticket: pending.ticket }),
      why: fmt('被拦住的写路径：{tools}。{recovery}', {
        tools: PENDING_CONFIRM_BLOCKED_TOOLS.join(' / '),
        recovery: PENDING_CONFIRM_RECOVERY,
      }),
      ref: { kind: 'confirm', id: pending.ticket },
    })
  }
  return gaps
}

// ---------------------------------------------------------------------------
// FR-3 · 操作条（只给当前状态下合法的动作）
// ---------------------------------------------------------------------------

/** 推进到某目标的后果（人读一句话；写清"点了会发生什么"）。 */
const MOVE_CONSEQUENCE: Readonly<Partial<Record<RequirementStatus, string>>> = {
  brainstorming: '进入需求分析：共创需求文档，产物经人确认后才放行',
  design: '进入设计：写 design/*.md，登记后待人确认（人工门）',
  decomposing: '进入拆分：写拆分计划并提交，人批准后才落任务卡',
  implementing: '进入实施：落库任务卡并开跑自动链（要求拆分计划已批准）',
  accepting: '提交验收：要求全部任务已结单；验收材料由人逐项裁决',
  archived: '归档：把产出合并进项目文档并写归档索引（人工门，终态）',
  canceled: '取消：需求移出在途泳道（人工门；可用回退边撤回）',
  draft: '退回立项：重新描述需求（回退，晚于目标的下游确认章会作废）',
}

/**
 * 本阶段合法动作（FR-3）：**前进边 + 取消 + 计划裁决 + 验收裁决**。
 *
 * 为什么**不列回退边**：回退（`REQ_TRANSITIONS` 里那些更早的目标）是"发现方向错了"的补偿动作，
 * 不是"本阶段该做什么"；详情页操作条按标本只放前进/取消（见 prototype 操作条：实施阶段
 * 只有「立项取消」+「→ 验收」）。回退入口另有其处，塞进结论头只会把按钮挤成一排。
 * 终态一律空数组（`archived`/`canceled`/`done`）。
 */
export function buildActions(req: RequirementRecord): ReportAction[] {
  if (isTerminal(req.status)) return []
  const actions: ReportAction[] = []

  if (req.status === 'accepting') {
    if (req.verification?.submittedAt !== undefined) {
      actions.push({
        key: 'verify-pass',
        label: '验收通过并归档',
        to: 'archived',
        consequence: '通过即归档：需求进入终态、不再接受修改；验收单结论一并落章',
        humanOnly: true,
      })
      actions.push({
        key: 'verify-rework',
        label: '退回返工',
        to: 'implementing',
        consequence: '退回实施：验收单标记返工项，实施窗口按意见重做后重新提交',
        humanOnly: true,
      })
    }
  } else {
    // 计划裁决（G3）：只在这一刻存在——已批准/已退回都不再给
    const plan = req.plan
    if (plan !== undefined && plan.approvedAt === undefined && plan.rejectedAt === undefined) {
      actions.push({
        key: 'plan-approve',
        label: '批准拆分计划',
        consequence: '批准后按计划落库任务卡并进入实施（人工门；批准即开工）',
        humanOnly: true,
        ...(req.status === 'decomposing' ? { to: 'implementing' as RequirementStatus } : {}),
      })
      actions.push({
        key: 'plan-reject',
        label: '退回计划',
        consequence: '退回：计划作废并需重新提交（必须写清理由，供作者精确修复）',
        humanOnly: true,
      })
    }
    // 前进边（不含 canceled 与回退边；与"下一步"同源）
    const to = forwardTargetOf(req.status)
    if (to !== undefined && (REQ_TRANSITIONS[req.status] as readonly string[]).includes(to)) {
      actions.push({
        key: 'move',
        label: fmt('推进到{label}', { label: STATUS_LABELS[to] }),
        to,
        consequence: MOVE_CONSEQUENCE[to] ?? fmt('推进到{label}', { label: STATUS_LABELS[to] }),
        humanOnly: HUMAN_ONLY_REQ_TRANSITIONS.has(req.status + '>' + to),
      })
    }
  }

  // 取消（放弃路径）：任何非终态都合法（人工门）
  if ((REQ_TRANSITIONS[req.status] as readonly string[]).includes('canceled')) {
    actions.push({
      key: 'cancel',
      label: '取消需求',
      to: 'canceled',
      consequence: MOVE_CONSEQUENCE['canceled']!,
      humanOnly: true,
    })
  }
  return actions
}

// ---------------------------------------------------------------------------
// 结论行 / 状态带 / 给 agent 的下一步
// ---------------------------------------------------------------------------

/** 状态带第一格：阶段进入时间与停留、距上次更新、任务计数（口径写在注释里）。 */
function progressOf(req: RequirementRecord, tasks: readonly TaskRecord[], now: number): ReportProgress {
  const history = req.statusHistory ?? []
  // 停留时长按**最近一次**进入当前阶段算（回退后重入是新的一段，不能拿首次进入糊）
  const entered = history.filter(e => e.status === req.status).slice(-1)[0]
  const live = tasks.filter(t => t.status !== 'canceled')
  const subs = live.filter(t => t.parentId !== undefined)
  const running: readonly string[] = ['in_progress', 'integrating', 'testing', 'in_review']
  return {
    ...(entered !== undefined ? { stageEnteredAt: entered.at, stageStayedMs: Math.max(0, now - entered.at) } : {}),
    sinceUpdateMs: Math.max(0, now - req.updatedAt),
    tasks: {
      total: live.length,
      done: live.filter(t => t.status === 'done').length,
      running: live.filter(t => running.includes(t.status)).length,
      todo: live.filter(t => t.status === 'todo').length,
      subChainDone: subs.filter(t => t.status === 'done').length,
      subChainTotal: subs.length,
    },
  }
}

/** 一句话结论：在跑什么 / 谁在跑 / 几件事等人 / 下一步谁动手（四问缺一不可）。 */
function verdictLineOf(
  req: RequirementRecord,
  progress: ReportProgress,
  waitingHuman: number,
  nextStepForAgent: string | undefined,
): string {
  const stage = STATUS_LABELS[req.status]
  const doing = progress.tasks.running > 0
    ? fmt('在跑 {n} 张任务卡（{stage}）', { n: progress.tasks.running, stage })
    : fmt('{stage} 阶段暂无在跑任务', { stage })
  const windows = seatsOf(req).map(s => windowCodeFromSessionId(s.windowKey))
  const who = windows.length > 0 ? fmt('{windows} 在席', { windows: windows.join('、') }) : '没有窗口在席'
  const waiting = waitingHuman > 0 ? fmt('{n} 件事等人', { n: waitingHuman }) : '没有事在等人'
  const next = nextStepForAgent ?? (isTerminal(req.status) ? '终态，无需动手' : '等人给方向')
  return [doing, who, waiting, fmt('下一步 {next}', { next })].join('；')
}

/** 给实施窗口 agent 的下一步（可空：终态没有下一步）。 */
function nextStepOf(
  req: RequirementRecord,
  progress: ReportProgress,
  gaps: readonly ReportGap[],
): string | undefined {
  if (isTerminal(req.status)) return undefined
  if (req.blocked) return fmt('先解除阻塞：{reason}', { reason: req.blockedReason ?? '未写原因' })
  const blockedGate = gaps.find(g => g.severity === 'red' && g.ref?.kind === 'artifact')
  switch (req.status) {
    case 'draft':
      return '接手开工：调 reqboard_move(to=brainstorming)（或在会话里直接讲清需求）'
    case 'brainstorming':
      return '写需求文档 → reqboard_submit(kind=requirement)，登记后等人确认（G1）'
    case 'design':
      return '写设计文档 → reqboard_submit(kind=design)，登记后等人确认（G2）'
    case 'decomposing':
      if (req.plan === undefined) return '提交拆分计划 → reqboard_submit(kind=plan)（含任务表）'
      if (req.plan.approvedAt === undefined) return '等人批准拆分计划（G3）；批准后调 reqboard_decompose 落库'
      return '调 reqboard_decompose 把批准的计划落成任务卡'
    case 'implementing':
      if (progress.tasks.total === 0) return '调 reqboard_decompose 落库任务卡（当前 0 张）'
      if (progress.tasks.done === progress.tasks.total) {
        return '全部任务已结单 → 提交验收材料 reqboard_submit(kind=verification) 并推进到验收'
      }
      if (blockedGate !== undefined) return fmt('先补齐堵点：{what}', { what: blockedGate.what })
      return fmt('调 reqboard_task_run 推进下一张 ready 卡（还有 {n} 张未结单）', {
        n: progress.tasks.total - progress.tasks.done,
      })
    case 'accepting':
      return req.verification?.submittedAt === undefined
        ? '提交验收材料 → reqboard_submit(kind=verification)'
        : '等人逐项裁决验收单（agent 不能自过）'
    default:
      return undefined
  }
}

// ---------------------------------------------------------------------------
// 挂起确认 / 会话归档（加法式只读口的解析）
// ---------------------------------------------------------------------------

/** 该需求上**未作答**的挂起确认（跨窗口合并；端口未装配 → `assembled:false`）。 */
function pendingOf(
  deps: ReportQueryDeps,
  req: RequirementRecord,
): { pending: PendingConfirmation[]; assembled: boolean } {
  const port = deps.pendingConfirms
  if (port === undefined) return { pending: [], assembled: false }
  if (port.pendingForRequirement !== undefined) {
    return { pending: [...port.pendingForRequirement(req.id)], assembled: true }
  }
  if (port.pendingForWindow !== undefined) {
    const seen = new Map<string, PendingConfirmation>()
    for (const seat of seatsOf(req)) {
      const found = port.pendingForWindow(seat.windowKey)
      // 同一窗口可能挂着**别的**需求：只有指向本需求的才算本页的缺口
      if (found !== undefined && found.requirementId === req.id) seen.set(found.ticket, found)
    }
    return { pending: [...seen.values()], assembled: true }
  }
  return { pending: [], assembled: false }
}

/** 会话跳转入口（archived 由会话服务给；缺省按未归档——点击直接打开）。 */
function sessionJumpOf(deps: ReportQueryDeps, req: RequirementRecord): ReportHead['sessionJump'] {
  const archived = deps.sessionsArchive?.archivedSessionIds?.() ?? new Set<string>()
  return seatsOf(req).map(seat => ({ windowKey: seat.windowKey, archived: archived.has(seat.windowKey) }))
}

// ---------------------------------------------------------------------------
// S-1 · 端点入口
// ---------------------------------------------------------------------------

/**
 * `GET /requirements/:id/report`：首屏唯一请求（**不含正文**）。
 *
 * 顺序：读台账 → 读队列 → 读文档（条款/设计章节，用于缺口）→ 组装四问。
 * 文档读不到**不阻断首屏**（缺口少一类而已）：与"文档 Tab 整块降级"不同，
 * 结论头是首屏骨架，不能因为一个可选输入缺失就整页不可用。
 */
export async function queryReport(
  deps: ReportQueryDeps,
  input: PanelQueryInput,
): Promise<PanelResult<ReportResponse>> {
  let req: RequirementRecord | undefined
  try {
    req = await deps.store.get(input.requirementId)
  } catch (err) {
    return unreadable(err)
  }
  if (req === undefined) throw notFound(input.requirementId)

  let tasks: readonly TaskRecord[]
  try {
    tasks = await deps.tasks.listByRequirement(input.requirementId)
  } catch (err) {
    return unreadable(err)
  }

  // 条款接收投影：与 reqboard_status 同源（clauseReceiveStatus + collectTaskRefs）。
  // 文档是**可选输入**：读失败不该让首屏整页 500（与 S-5「文档不可读 → 该条 missing，不是 500」同款纪律），
  // 故这里降级为"条款/设计环本次不判"并**留一条 warn**（不静默——静默会让缺口看起来"本来就没有"）。
  let marks: RequirementMarksView = {
    requirementId: req.id, clauses: [], unreceived: [], available: false,
  }
  let designSections: readonly DesignSection[] | undefined
  if (deps.docs !== undefined) {
    const docs = deps.docs
    try {
      const requirementDoc = 'docs/requirements/' + req.id + '/requirement.md'
      if (docs.exists(requirementDoc)) {
        const doc = parseDocument(await docs.read(requirementDoc))
        const roots = extractClauseDefinitions(doc)
        const status = clauseReceiveStatus(roots, await collectTaskRefs(docs, req), tasks, extractSkippedClauses(doc))
        marks = {
          requirementId: req.id,
          clauses: status.map(s => ({ clause: s.clause, state: s.state, by: [...s.by] })),
          unreceived: status.filter(s => s.state === 'unreceived').map(s => s.clause),
          available: true,
        }
      }
      designSections = await extractAllDesignSections(docs, 'docs/requirements/' + req.id + '/design')
    } catch (err) {
      console.warn('[QueryReport] 文档读取失败：本次不判条款接收与追溯断链（去查文档端口/文件权限）', err)
    }
  }

  const { pending, assembled } = pendingOf(deps, req)
  const gaps = buildGaps(req, tasks, marks, pending, { designSections })
  // 挂起端口未装配：**读不到就说读不到**（不写"0 条"）——用灰条声明，不冒充"没有挂起"。
  // 终态不提示（终态本就不该有挂起确认，加一条只会是噪声）。
  if (!assembled && !isTerminal(req.status)) {
    gaps.push({
      severity: 'gray',
      what: '挂起确认状态不可知',
      why: '未装配挂起确认端口（PanelQueryDeps 上没有该口）：读不到，就不说"没有"',
    })
  }

  const now = deps.now?.() ?? Date.now()
  const progress = progressOf(req, tasks, now)
  const actions = buildActions(req)
  // 「几件事等人」的口径以**需求条款**为准：FR-3 判定②要求它与缺口条数一致
  // （协议注释里那句"红条数"是更早的写法；产品口径优先，且两者都钉在用例里防漂移）。
  const waitingHuman = gaps.length
  const nextStepForAgent = nextStepOf(req, progress, gaps)

  const head: ReportHead = {
    id: req.id,
    title: req.title,
    // 契约要求 category 为非可选 string，而台账里它可缺省：缺省时按 `flowProfileFor` 的同口径
    // 记 feature（全仓对"无分类"的行为就是按 feature 走），不另造一个"未知分类"显示值。
    category: req.category ?? 'feature',
    ...(req.promptDifficulty !== undefined ? { promptDifficulty: req.promptDifficulty } : {}),
    status: req.status,
    blocked: req.blocked,
    ...(req.blockedReason !== undefined ? { blockedReason: req.blockedReason } : {}),
    createdAt: req.createdAt,
    updatedAt: req.updatedAt,
    seats: seatsOf(req),
    sessionJump: sessionJumpOf(deps, req),
  }

  const response: ReportResponse = {
    head,
    progress,
    verdictLine: verdictLineOf(req, progress, waitingHuman, nextStepForAgent),
    waitingHuman,
    gaps,
    actions,
    ...(nextStepForAgent !== undefined ? { nextStepForAgent } : {}),
  }
  return response
}
