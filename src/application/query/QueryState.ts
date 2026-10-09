/**
 * QueryState 用例（REQ-47939a t6）——从 host/agent-tools.ts 的 defineStatusTool / reqboard_status 工厂**逐字搬入**编排。
 *
 * 零行为变更：拒绝条件、错误码与消息文案与搬迁前一致；规则仍单点于 domain/。
 *
 * @module dsh-pmboard/application/use-cases/QueryState
 */
import { requirementStoreOf } from '../use-cases/queue-access.js'
import { getBuildStamp } from '../../shared/build-stamp.js'
import { stageTelemetryOf, type StageTelemetryRow } from '../../domain/workflow/StageTelemetry.js'
import type { UseCaseDeps } from '../ports.js'
import {
  agentNextActions,
  type TaskRecord,
} from '../../shared/protocol.js'
import { liveTasksOf } from '../../domain/status/Predicates.js'
import { firstWritableBound, openRequirementsForVia, seatOf, seatsOf } from '../internal/window.js'
// REQ-261007220012-bd29 FR-3：原运行态查询工具 并入 status（run 节）——用例原样复用。
import { queryRunStatus } from '../use-cases/QueryRunStatus.js'
import type { RequirementRecord as ClientRequirementRecord, TaskRecord as ClientTaskRecord } from '../../client/types.js'
import {
  agentIdFromExec,
  projectRequirement,
} from '../internal/support.js'
import { parseDocument, extractClauseDefinitions, extractSkippedClauses } from '../internal/content-gates.js'
import { collectReceiveRefs, clauseReceiveStatus, checkFullTraceability } from '../internal/content-gate-wiring.js'
import { designDocRegistrationOf } from '../internal/design-docs.js'
import { generateStatusRTM } from '../internal/status-rtm-integration.js'
import { checkRTMHealth } from '../internal/rtm-health.js'
// REQ-260927123256-196b FR-4 / I-2：挂起确认投影（判定与守卫同源，避免两处口径漂移）。
import {
  PENDING_CONFIRM_BLOCKED_TOOLS,
  PENDING_CONFIRM_RECOVERY,
  livePendingConfirm,
  pendingConfirmFactsOf,
} from '../internal/pending-guard.js'

/**
 * run 节编排（REQ-261007220012-bd29 FR-3）——原运行态查询工具 的定位与降级口径逐步搬入。
 *
 * 返回 `undefined` = 本键整体省略（无法确定目标需求，如未绑定且未传参）；
 * 产出对象时错误以 `error` 键如实回报（不抛——status 的其余小节必须照常可用）。
 *
 * 注意：本文件是 reqboard_status 的**响应源**，`tests/output-contract.test.ts` 会把本文件里
 * 每处 `return {...}` 的顶层键当作响应键扫描，故这里一律「先建变量再 return」，不写字面量返回。
 */
async function runSectionOf(
  deps: UseCaseDeps,
  args: unknown,
  open: Awaited<ReturnType<typeof openRequirementsForVia>>,
  windowKey: string,
): Promise<Record<string, unknown> | undefined> {
  const a = (args ?? {}) as { requirement_id?: unknown; run_id?: unknown }
  const requestedId = typeof a.requirement_id === 'string' && a.requirement_id.length > 0 ? a.requirement_id : undefined
  const requestedRunId = typeof a.run_id === 'string' && a.run_id.length > 0 ? a.run_id : undefined

  let targetId = requestedId
  if (targetId === undefined && requestedRunId !== undefined) {
    // run_id → requirement_id：台账没有 run 索引（advance.runId 只在记录上）⇒ 按需逐条 get。
    const store = requirementStoreOf(deps)
    const page = await store.listSummaries({ scope: 'all' })
    for (const sm of page.items) {
      const r = await store.get(sm.id)
      if (r?.advance?.runId === requestedRunId) { targetId = r.id; break }
    }
    if (targetId === undefined) {
      const notFound: Record<string, unknown> = { error: '未找到 run_id=' + requestedRunId + ' 对应的需求' }
      return notFound
    }
  }
  if (targetId === undefined) {
    // 缺省取本窗口绑定需求里第一条**可写**的（与 run_status 原口径一致；取不到 → 整键省略）。
    const first = firstWritableBound(open, windowKey)
    if (first === undefined) return undefined
    targetId = first.id
  }

  // 未装配 = 组合根配置错误（原运行态查询工具口径）：
  // **显式**点名了目标需求 → 响亮抛错（调用方要的就是这条链的运行态）；
  // 走窗口绑定缺省 → 静默省略 run 节，status 的其余小节必须照常可用。
  const explicit = requestedId !== undefined || requestedRunId !== undefined
  if (deps.taskStore === undefined) {
    if (explicit) {
      throw Object.assign(new Error('任务存储（TaskStore）未装配，无法读取任务'), { code: 'REQBOARD_STORE_INCONSISTENT' })
    }
    return undefined
  }
  const jobs = deps.jobs
  const dshJobsAdapter = jobs !== undefined && jobs.available()
    ? { getJob: (id: string): Promise<{ status: string } | null> => jobs.get(id) }
    : undefined
  try {
    const status = await queryRunStatus({
      requirementId: targetId,
      getRequirement: async () => {
        const rec = await requirementStoreOf(deps).get(targetId as string)
        if (rec === undefined) {
          throw Object.assign(new Error('需求不存在：' + targetId), { code: 'REQBOARD_REQUIREMENT_NOT_FOUND' })
        }
        return rec as unknown as ClientRequirementRecord
      },
      getTasks: async () => (await deps.taskStore!.listByRequirement(targetId as string)) as unknown as ClientTaskRecord[],
      ...(dshJobsAdapter !== undefined ? { dshJobsAdapter } : {}),
    })
    // ⚠️ 无 active run 时 queryRunStatus 给的是 `runId: null`，而声明是 string
    // ⇒ 值级类型校验会失败。口径：**不是 string 就整个键省略**，不发 null。
    const snapshot: Record<string, unknown> = { requirement_id: targetId, ...status }
    if (typeof snapshot.runId !== 'string') delete snapshot.runId
    return snapshot
  } catch (err) {
    // 显式点名的失败必须被调用方看见（既有错误码契约：REQBOARD_REQUIREMENT_NOT_FOUND 等）；
    // 仅绑定缺省路径的意外失败降级为「本键省略」——status 的核心职责是绑定自查。
    if (explicit) throw err
    return undefined
  }
}

export async function queryState(deps: UseCaseDeps, args: unknown, exec: any): Promise<unknown> {
      const windowKey = agentIdFromExec(deps, exec)
      // B12 阶段②c：整册 read ⇒ 新端口的绑定读（只取本窗口的开放需求，不装配整册）。
      const open = await openRequirementsForVia(requirementStoreOf(deps), windowKey)
      /**
       * 队列任务读取（REQ-260927202051-f6df）：v9 台账已无 `tasks`，任务唯一来源 = TaskStore。
       * `taskStore` 缺省（未装配）→ 空数组（端口文档语义：调用方显式降级，不抛）。
       */
      const tasksOf = async (reqId: string): Promise<readonly TaskRecord[]> =>
        deps.taskStore !== undefined ? deps.taskStore.listByRequirement(reqId) : []
      // 挂起确认投影（REQ-260927123256-196b FR-4 / I-2）：本窗口**仍然有意义**的未作答确认
      // （已 settle / 已过期 / 台账已落章的陈旧记录不列）——agent 不打开弹框也能看出「在等谁」。
      const livePending = await livePendingConfirm(deps, windowKey)
      // REQ-261005200052-ce40 FR-3：投影补**诊断四要素 + 可用出路**（只追加键，旧键逐字不动）——
      // 被拦的人/agent 一眼能看出「为什么挂着、卡在哪份产物、什么时候自动失效、哪条路真的通」。
      let pending_confirms: unknown[] = []
      if (livePending !== undefined) {
        const pendingReq = await requirementStoreOf(deps).get(livePending.requirementId)
        const facts = pendingReq === undefined ? undefined : pendingConfirmFactsOf(pendingReq, livePending, deps.clock.now())
        pending_confirms = [{
          ticket: livePending.ticket,
          requirement_id: livePending.requirementId,
          target: livePending.target,
          ...(livePending.kind === undefined ? {} : { kind: livePending.kind }),
          created_at: livePending.createdAt,
          interrupted: livePending.interruptedAt !== undefined,
          blocked_tools: [...PENDING_CONFIRM_BLOCKED_TOOLS],
          recovery: facts === undefined
            ? PENDING_CONFIRM_RECOVERY
            : '收到作答前不得产出下游产物。可用出路：' + facts.usableRecovery.join('；'),
          ...(facts === undefined ? {} : {
            requirement_status: facts.requirementStatus,
            gate: facts.gate,
            artifact_count: facts.artifactCount,
            expires_at: facts.expiresAt,
            usable_recovery: [...facts.usableRecovery],
          }),
        }]
      }
      // 需求侧接收标记（FR-3 / T-5）：逐条功能点显示"谁接了 / 还没人接"。
      // R9 的形态就是"未被接收"，必须在**每次 status 调用**里显眼可见，而不是靠人记得去查。
      let clause_receive_status: unknown[] = []
      let unreceived: string[] = []
      // 阶段遥测（REQ-261004110201-f253 FR-2）：按**子卡阶段**聚合时长/产出/零产出。
      // 只读投影（从 executions 派生，不落盘、不新增桶）；无已完成执行 → 整体省略键。
      let stageTelemetry: StageTelemetryRow[] = []
      // 设计文档逐份登记态（FR-1 / I-2，T-4）：磁盘 / 产物簿 / 确认章三源合成——agent 不打开看板
      // 也能读出「未登记 / 待确认 / 已落章」。与 reqboard_submit(kind=design) 的 design_docs 同源同口径。
      let design_docs: unknown[] = []
      if (open.length > 0) {
        const boundReq = open[0]
        design_docs = await designDocRegistrationOf(deps.docs, boundReq)
        const reqPath = 'docs/requirements/' + boundReq.id + '/requirement.md'
        if (deps.docs.exists(reqPath)) {
          const doc = parseDocument(await deps.docs.read(reqPath))
          const roots = extractClauseDefinitions(doc)
          if (roots.length > 0) {
            const status = clauseReceiveStatus(
              roots,
              await collectReceiveRefs(deps.docs, boundReq, await tasksOf(boundReq.id)),
              await tasksOf(boundReq.id),
              extractSkippedClauses(doc),
            )
            clause_receive_status = status
            unreceived = status.filter(s => s.state === 'unreceived').map(s => s.clause)
          }
        }
      }
      // RTM 集成：生成 FR 覆盖度和验收进度（REQ-260925172227-2d61 FR-4）
      let rtmData: ReturnType<typeof generateStatusRTM> | undefined
      if (open.length > 0) {
        try {
          const boundReq = open[0]
          const reqDir = 'docs/requirements/' + boundReq.id
          // 活卡判据收编（REQ-261005193546-1b1a FR-4 · INV-4）：此处原为手写的取消比较式。
          const reqTasks = liveTasksOf(await tasksOf(boundReq.id))
          // FR-2：阶段遥测取自同一批任务（子卡执行记录）——投影而非新桶，零额外读盘
          stageTelemetry = stageTelemetryOf(reqTasks)
          const verificationSheet = boundReq.verification?.sheet
          rtmData = generateStatusRTM(reqDir, reqTasks, verificationSheet)
        } catch (rtmErr) {
          console.warn('[QueryState] RTM 集成失败:', rtmErr)
        }
      }
      
      // RTM 健康检查（修复：yaml 生成失败，下一次校验时提醒）
      let rtm_health: unknown | undefined
      if (open.length > 0) {
        try {
          const boundReq = open[0]
          const workspaceRoot = deps.docs.workspaceRoot()
          // REQ-261008020617-088f RF-3：state 落点由 HostFsPort 从根推导，不再自己拼 stateDir
          rtm_health = checkRTMHealth(deps.hostFs, workspaceRoot, boundReq)
        } catch (healthErr) {
          console.warn('[QueryState] RTM 健康检查失败:', healthErr)
        }
      }
      
      // 三级追溯链统计（2026-09-26 追溯性改进）
      let traceability_chain: unknown | undefined
      if (open.length > 0) {
        try {
          const boundReq = open[0]
          // 同上一处（收编；两处口径必须一致——同一份读数不能有两个活卡集合）。
          const reqTasks = liveTasksOf(await tasksOf(boundReq.id))
          const coverage = await checkFullTraceability(deps.docs, boundReq, reqTasks)
          
          traceability_chain = {
            design_coverage: {
              total: coverage.designCoverage.total,
              covered: coverage.designCoverage.covered,
              coverage_rate: coverage.designCoverage.total > 0 
                ? Math.round((coverage.designCoverage.covered / coverage.designCoverage.total) * 100) 
                : 100,
              gaps: coverage.designCoverage.gaps,
              status: coverage.designCoverage.gaps.length === 0 ? 'complete' : 'incomplete'
            },
            implementation_coverage: {
              total: coverage.implementationCoverage.total,
              covered: coverage.implementationCoverage.covered,
              coverage_rate: coverage.implementationCoverage.total > 0
                ? Math.round((coverage.implementationCoverage.covered / coverage.implementationCoverage.total) * 100)
                : 100,
              gaps: coverage.implementationCoverage.gaps,
              status: coverage.implementationCoverage.gaps.length === 0 ? 'complete' : 'incomplete'
            },
            test_coverage: {
              total: coverage.testCoverage.total,
              tested: coverage.testCoverage.tested,
              coverage_rate: coverage.testCoverage.total > 0
                ? Math.round((coverage.testCoverage.tested / coverage.testCoverage.total) * 100)
                : 0,
              gaps: coverage.testCoverage.gaps,
              status: coverage.testCoverage.tested === coverage.testCoverage.total ? 'complete' : 'incomplete'
            },
            overall_status: 
              coverage.designCoverage.gaps.length === 0 &&
              coverage.implementationCoverage.gaps.length === 0 &&
              coverage.testCoverage.tested === coverage.testCoverage.total
                ? 'complete'
                : 'incomplete'
          }
        } catch (traceErr) {
          console.warn('[QueryState] 追溯链统计失败:', traceErr)
        }
      }
      
      // FR-2（REQ-261003215944-9e04 · t-845a64）：席位表与本窗口的席位。
      // 口径：**读端折算后**的那一份（与 `seatsOf` / `seatOf` 同一处规则），且取自绑定需求本身
      // ——不是在这里另算一套。无绑定需求时 `seats` 整体省略（无损 JSON 纪律：不发空数组）；
      // 本窗口在这条上没席位时 `my_seat` 整体省略（不伪装 worker）。
      const primary = open.length > 0 ? open[0] : undefined
      const primarySeat = primary === undefined ? undefined : seatOf(primary, windowKey)

      // FR-3（REQ-261007220012-bd29）：实施链运行态——原运行态查询工具 并入本入口。
      // 口径与原工具逐字一致：能确定目标需求时恒出现；无 active run 时 runId 整键省略（不发 null）；
      // 显式传 requirement_id / run_id 时按入参定位（run_id 走台账反查）。
      const run = await runSectionOf(deps, args, open, windowKey)

      return {
        window_key: windowKey,
        bound: open.length > 0,
        open_count: open.length,
        // REQ-261003222428-3556 FR-3：构建指纹——「我在跑哪份构建」随时可查（陈旧构建可见化）。
        // 未盖章（测试/直跑 src）→ 整体省略键（无损 JSON 纪律：不发 undefined/null）。
        ...(getBuildStamp() !== undefined ? { plugin_build: getBuildStamp()! } : {}),
        // FR-2（REQ-261004110201-f253）：阶段遥测——无已完成执行时**整体省略键**（不发空数组/null）
        ...(stageTelemetry.length > 0 ? { stage_telemetry: stageTelemetry } : {}),
        open_requirements: open.map(projectRequirement),
        ...(primary !== undefined ? { seats: seatsOf(primary) } : {}),
        ...(primarySeat !== undefined ? { my_seat: primarySeat } : {}),
        next_actions: open.length > 0 ? agentNextActions(open[0].status) : [],
        clause_receive_status,
        unreceived_clauses: unreceived,
        design_docs,
        pending_confirms,
        ...(run !== undefined ? { run } : {}),
        ...(rtmData !== undefined
          ? {
              fr_coverage: rtmData.fr_coverage,
              ...(rtmData.fr_acceptance_progress !== undefined
                ? { fr_acceptance_progress: rtmData.fr_acceptance_progress }
                : {}),
            }
          : {}),
        ...(traceability_chain !== undefined
          ? { traceability_chain }
          : {}),
        ...(rtm_health !== undefined
          ? { rtm_health }
          : {}),
        note:
          open.length > 0
            ? `本窗口已绑定进行中需求（当前 ${open[0].status}）：里程碑处用 reqboard_move 自行推进（${agentNextActions(open[0].status).join(' / ') || '无可推进项'}），勿重复立项`
            : '本窗口未绑定需求：识别到值得立项的新工作 → 调 reqboard_capture 弹「立项弹框」（需求名称 / 需求类型 / 算力档位 / 文件落点），用户作答即在同一次调用内创建并绑定本窗口（创建即立项）',
        board_link: open.length > 0 ? `/dashboard#pmboard?req=${open[0].id}` : '/dashboard#pmboard',
      }
    }