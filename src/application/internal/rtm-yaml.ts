/**
 * RTM YAML 触发点接线（REQ-260926140539-457b FR-2 / FR-9）。
 *
 * 把需求流水线上的业务动作接到 RTM YAML 生成器：
 *   reqboard_create            → create（rtm-lifecycle.yml 骨架）
 *   submit(kind=requirement)   → submit:requirement
 *   ask_confirm / 看板确认产物 → confirm:artifact
 *   submit(kind=design)        → submit:design
 *   ask_confirm / 看板批准计划 → confirm:plan（拆分 + 实施骨架）
 *   任务状态变更 / task_report → task:status / task:report
 *   submit(kind=verification)  → submit:verification
 *   submit(kind=prototype)     → submit:prototype（REQ-261005105032-3b02 FR-5）
 *
 * **失败绝不打断主流程**（FR-9）：RTM 是增强层，任何异常只记 warning 并结构化返回，
 * 需求创建/提交/确认/推进的既有行为逐字节不变。
 *
 * @module dsh-pmboard/application/internal/rtm-yaml
 */
import type { UseCaseDeps } from '../ports.js'
import { requirementStoreOf } from '../use-cases/queue-access.js'
// REQ-261001203710-0fbf t7：RTM 写入前按需求 id 核验写盘根（判定下沉，一处覆盖十处调用点）
import { assertWritableRequirementProject } from './support.js'
import { recordRTMFailure, clearRTMFailure, recordRTMTriggerTrace } from './rtm-health.js'
import type { HostFsPort } from '../ports.js'
import { flowProfileFor, type RequirementCategory, type RequirementRecord, type TaskRecord } from '../../shared/protocol.js'
// REQ-261005193546-1b1a FR-2 / design/interfaces.md §5：两个公开入口各自收敛为活卡（覆盖度分母剔卡）。
// 判据/取数单点住在 domain（`isLiveTask` 的取反复用），此处只调用、不再手写 `!== 'canceled'`。
import { liveTasksOf } from '../../domain/status/Predicates.js'
import { stageOfStatus } from '../../../vendor/reqboard/src/rtm/lifecycle-generator.js'
import { RTMGenerator, runRTMTrigger, type RTMTrigger, type RTMTriggerResult } from '../../../vendor/reqboard/src/rtm/generator.js'
import type { LedgerReader } from '../../../vendor/reqboard/src/rtm/context.js'
import type { GateResult, RTMTaskLike, WorkflowPhase } from '../../../vendor/reqboard/src/rtm/types.js'
import { rtmValidator } from '../../../vendor/reqboard/src/rtm/validator.js'
import type { TaskDetailUpdate } from '../../../vendor/reqboard/src/rtm/implementing-generator.js'

/**
 * 触发点附加载荷。
 *
 * 触发点集合本身**只有一份**：vendor 的 `RTMTrigger`——`submit:prototype` 已收编进
 * `vendor/reqboard/src/rtm/generator.ts` 的联合类型与 `filesForTrigger` 分派。
 * 宿主侧刻意**不再自建**触发点联合类型：两处触发点集合就是两份真相，长期必然漂移。
 */
export interface RtmYamlPayload {
  taskId?: string
  updates?: TaskDetailUpdate
  /**
   * `submit:prototype`（决议 #48）：本次登记的原型路径。**只用于增量刷新与留痕**——
   * 生成器仍以**台账**为事实源（载荷里多出来的路径不会进 YAML，台账里没有的也不会被补上）。
   */
  paths?: string[]
}

/**
 * 台账只读快照的形状（旧单册适配器（已删除）.台账快照读（已删除） 返回的 LedgerView 是 readonly 数组，
 * 这里按只读接收，避免为了类型而复制一份）。
 *
 * **不含 `tasks`**（REQ-260927202051-f6df）：schema v9 后任务不再存台账，任务由调用方从队列
 * （TaskStore）取好后**显式传入**。刻意不留该字段，避免"留着 → 编译通过却永远读到空数组"
 * （那会让 RTM 覆盖度静默为空，而没有任何报错）。
 */
export interface RTMLedgerSnapshot {
  requirements: readonly RequirementRecord[]
}

/** 台账任务 → RTM 任务投影。 */
function toTaskLike(t: TaskRecord): RTMTaskLike {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    phase: t.phase,
    side: t.side,
    depends_on: [...t.dependsOn],
    // 修复：台账 implementation → RTM implements（字段名不同）
    implements: t.implementation,
    // 修复：台账 requirementRefs → RTM serves
    serves: t.requirementRefs,
  }
}

/**
 * 用台账快照 + 队列任务搭一个只读 LedgerReader（RTM 只读，不反向写）。
 *
 * @param tasks 队列任务（`TaskStore.listByRequirement/listAll` 取；RTM 的 `tasksOf` 读它）
 */
function ledgerReaderOf(snap: RTMLedgerSnapshot, tasks: readonly TaskRecord[]): LedgerReader {
  return {
    requirement: id => {
      const r = snap.requirements.find(x => x.id === id)
      if (r === undefined) return undefined
      return {
        id: r.id,
        title: r.title,
        category: r.category ?? '',
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        // 绑定窗口进 RTM（台账 sourceSessionId → RTMLifecycle.requirement.source_session）。
        // **如实声明：当前无生产读取方**。Dive 的投递目标取自**台账**（round-driver.ts 的
        // requirementById(id)?.sourceSessionId），不读这份 YAML；source_session 目前仅供人查。
        ...(typeof r.sourceSessionId === 'string' && r.sourceSessionId.length > 0
          ? { sourceSessionId: r.sourceSessionId }
          : {}),
        // REQ-260930094139-2d65 FR-4：状态转移历史进 RTM 投影（只取 status/at——
        // lifecycle-generator 用它算真实阶段 entered_at/completed_at，替代 createdAt/updatedAt 回落）。
        ...(Array.isArray(r.statusHistory) && r.statusHistory.length > 0
          ? { statusHistory: r.statusHistory.map(e => ({ status: e.status, at: e.at })) }
          : {}),
        artifacts: (r.artifacts ?? []).map(a => ({
          kind: a.kind,
          path: a.path,
          stage: a.stage,
          confirmedAt: a.confirmedAt,
          registeredAt: a.registeredAt,
        })),
      }
    },
    tasksOf: reqId => tasks.filter(t => t.requirementId === reqId).map(toTaskLike),
  }
}

/** 从汇报文案推断当前子阶段（t16：doc/ui/analysis/implement/test/review/commit）。 */
export function inferWorkflowPhase(summary: string): WorkflowPhase {
  const s = summary.toLowerCase()
  if (/文档|doc|readme/.test(s)) return 'doc'
  if (/测试|test|用例|回归/.test(s)) return 'test'
  if (/审查|review|复核|检查/.test(s)) return 'review'
  if (/提交|commit|推送/.test(s)) return 'commit'
  if (/分析|analysis|调研|方案/.test(s)) return 'analysis'
  if (/界面|ui|样式|布局/.test(s)) return 'ui'
  return 'implement'
}

/**
 * 覆盖度门禁（FR-2 / FR-5 / design/interfaces.md §4.1）。
 *
 * 把触发点本次生成的覆盖度过一次校验，返回 undefined = **不拦截**：
 *  - 触发失败（ok=false）；
 *  - 该触发点没有覆盖度产出；
 *  - 覆盖度 total=0（无项可判）。
 * 这是 FR-9 的边界：RTM 是增强层，绝不能因为它的数据缺失而拦住主流程；
 * 只有**拿到真实覆盖度数据**时才执法。
 */
export function coverageGateOf(
  stage: 'design' | 'decomposing' | 'accepting',
  result: RTMTriggerResult | undefined,
): GateResult | undefined {
  if (result?.ok !== true) return undefined
  const coverage = result.coverage
  if (coverage === undefined || coverage.total <= 0) return undefined
  return rtmValidator.checkGate(stage, coverage)
}

/**
 * 触发一次 RTM 同步。返回结构化结果；异常被吞并记 warning（不抛）。
 */
export async function syncRTMYaml(
  deps: UseCaseDeps,
  tasks: readonly TaskRecord[],
  reqId: string,
  trigger: RTMTrigger,
  payload?: RtmYamlPayload,
): Promise<RTMTriggerResult | undefined> {
  // FR-2（REQ-261005193546-1b1a）：函数体顶部第一行收敛为**活卡**；其后本函数体只用 `live`。
  // `liveTasksOf` 是纯函数、不抛（design/interfaces.md §5「异常语义」）⇒ 不改变下方
  // 「取根/取快照都在 try 内」「失败绝不打断主流程」的既有边界。
  const live = liveTasksOf(tasks)
  // FR-9：本函数的契约是"失败绝不打断主流程"——**连取根/取快照都必须在 try 内**。
  // 此前它们在 try 之外求值，docs/repo 端口缺失时会在进 try 之前抛出去（实测：不注入
  // docs 的工具用例会炸），与"RTM 是增强层"的承诺相反。
  try {
    // t8/B11：整册读换成摘要页（与路由侧三处先例同形），不再经桥的同步快照。
    const page = await requirementStoreOf(deps).listSummaries({ scope: 'all' })
    // REQ-261001203710-0fbf t7 / FR-2：RTM 是**工作区相对**落盘，且根取自 `deps.docs.workspaceRoot()`
    // （宿主级单例、会被别的窗口改）。写入前按需求 id 核验即将写的根 = 该需求声明的根；
    // 不一致就抛 PROJECT_ROOT_MISMATCH（由下面的 catch 如实记为 RTM 失败，不写错地方、也不静默）。
    await assertWritableRequirementProject(deps, reqId)
    return syncRTMYamlWithSnapshot(deps.hostFs, deps.docs.workspaceRoot(), { requirements: page.items as never }, live, reqId, trigger, payload)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.warn('[rtm-yaml] ' + trigger + ' ' + reqId + ' 取工作区根/台账快照失败（已忽略，不影响主流程）:', err)
    // 记录失败到 state/rtm-failures.json（修复：yaml 生成失败，下一次校验时提醒）
    try {
      recordRTMFailure(deps.hostFs, deps.docs.workspaceRoot(), reqId, trigger, errMsg)
    } catch {
      // 记录失败本身也失败时静默（不能因为记录失败而影响主流程）
    }
    return undefined
  }
}

/**
 * HTTP 路由（只拿到 store/deps.cwd，不是完整 UseCaseDeps）用的入口。
 */
export function syncRTMYamlWithSnapshot(
  host: HostFsPort,
  workspaceRoot: string,
  snapshot: RTMLedgerSnapshot,
  tasks: readonly TaskRecord[],
  reqId: string,
  trigger: RTMTrigger,
  payload?: RtmYamlPayload,
): RTMTriggerResult | undefined {
  // FR-2（REQ-261005193546-1b1a）：第二个公开入口同样在函数体顶部第一行收敛为活卡。
  // 看板三条路由（requirements.ts:404/:464、tasks.ts:174）**直调本入口、绕过前者**，
  // 缺这一行就漏三条路径（design/backend.md §两个 RTM 公开入口）。
  const live = liveTasksOf(tasks)
  try {
    const generator = new RTMGenerator({
      workspaceRoot,
      ledger: ledgerReaderOf(snapshot, live),
      generatedBy: 'dsh-pmboard',
      // "这个需求有多少个节点"：取分类流程档案（单一事实源在 shared/protocol）；
      // archived 按 RTM 口径归一到 done（stageOfStatus 是同一归一函数的单点）。
      enabledStagesOf: (category: string | undefined) =>
        flowProfileFor(category as RequirementCategory | undefined).stages.map(stageOfStatus),
    })
    // 触发点分派只有一处：vendor 的 `runRTMTrigger`（`submit:prototype` 已收编进其联合类型与
    // filesForTrigger）——宿主不再自建分派表，避免两份触发点真相漂移。
    const result = runRTMTrigger(generator, trigger, reqId, payload)
    if (!result.ok) {
      console.warn('[rtm-yaml] ' + trigger + ' ' + reqId + ' 同步失败：' + (result.error ?? '未知原因'))
      // 记录失败
      try {
        // REQ-261008020617-088f RF-3：state 落点由 HostFsPort 决定（不再自己拼 stateDir）
        recordRTMFailure(host, workspaceRoot, reqId, trigger, result.error ?? '未知原因')
      } catch {
        // 记录失败本身也失败时静默
      }
    } else {
      // 成功时清除失败记录
      try {
        clearRTMFailure(host, workspaceRoot, reqId)
      } catch {
        // 清除失败记录失败时静默
      }
      // 留痕（决议 #48）：`submit:prototype` 本次带了哪些原型路径。台账仍是生成器的事实源，
      // 这条记录只回答"登记动作带了什么"；**写不进去也不能改变同步结果**（增强层纪律）。
      if (trigger === 'submit:prototype') {
        try {
          recordRTMTriggerTrace(host, workspaceRoot, reqId, trigger, payload?.paths ?? [])
        } catch {
          // 留痕失败静默：证据丢了是遗憾，把成功的同步改判成失败是错误
        }
      }
    }
    return result
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.warn('[rtm-yaml] ' + trigger + ' ' + reqId + ' 接线异常（已忽略，不影响主流程）:', err)
    // 记录失败（state 落点由端口决定）
    try {
      recordRTMFailure(host, workspaceRoot, reqId, trigger, errMsg)
    } catch {
      // 记录失败本身也失败时静默
    }
    return undefined
  }
}
