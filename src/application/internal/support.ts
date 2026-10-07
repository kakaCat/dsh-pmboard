/**
 * 用例共享支撑（REQ-47939a t6）——从 host/agent-tools.ts 逐字搬入的模块级助手。
 *
 * 这些助手原本散在工具壳里（认证 / done 凭证门的证据采集 / 闸门问题卡 / 直接立项写入），
 * 现在移入 application：工具壳与 HTTP 路由共用同一份，不再各自实现一遍。**规则本身仍在
 * domain/**（DoneEvidenceSpec / RequirementStatus …），本文件只做"取证据 + 调纯判定 + 抛错"。
 *
 * 零行为变更：拒绝条件、错误码、消息文案与搬迁前逐字一致。
 *
 * @module dsh-pmboard/application/internal/support
 */
import type { UseCaseDeps } from '../ports.js'
import { requirementStoreOf, mutateIfPresent } from '../use-cases/queue-access.js'
import { boundSummariesOf } from '../internal/binding-read.js'
// REQ-261005141830-7a3b t1：路径纯函数搬到 project-root（本文件仍再导出），此处按名引入供内部使用。
import { normalizeProjectRoot, sameProjectRoot } from './project-root.js'
// REQ-261005141830-7a3b t3：取根的判据换成"项目身份带出根"——同一项目判据与 id→根 都从这一处取。
import { projectIdOfWindow, rootOfProject, sameProjectOf } from './project-identity.js'
import type { ProjectEntry } from '../ports.js'
import { questionCardFor } from '../../domain/gate/GateCatalog.js'
import { checkDoneEvidence, findRecentAgentDoneTask, doneThrottleRemainingMs } from '../../domain/workflow/DoneEvidenceSpec.js'
import { closingGapOf } from '../../domain/status/Predicates.js'
import { artifactNotifyText } from './artifact-gates.js'
// 子卡凭证走「汇报兜底」时的结构化留痕通道（2026-10-03 子卡毒状态修复）：
// 与 index.ts 的启动留痕同一条文件化诊断面，保证"靠汇报过的卡"事后可追溯。
import { captureDiag } from './diag-log.js'
// REQ-260927123256-196b FR-2/FR-4：挂起判定单点（未作答 且 台账未落章才拦）——守卫与回执共用。
import { livePendingConfirm, pendingConfirmFactsOf, pendingConfirmRejectMessage } from './pending-guard.js'
import {
  isSubtask,
  recordStatus,
  subtasksOf,
  type RequirementCategory,
  type RequirementRecord,
  type StageArtifact,
  type TaskRecord,
} from '../../shared/protocol.js'
import { captureSnapshot } from './token-usage.js'
import { checkParentSubtasksDone, checkSubtaskEvidence } from './subtask-evidence.js'
import { reportFileMtime } from './report-path.js'
// REQ-260924213231-b1c4 FR-7：降级路径（reqboard_create）复用弹框路径的文档位置缺省口径（单一事实源）。
import { CAPTURE_DEFAULTS } from './capture-mapping.js'
import { LIMITS } from '../../domain/limits.js'
// 后台任务 owner 的读取口径与 dive 同源（agent.id → agent.session.id）：单一实现，避免两处漂移。
import { agentIdOf } from '../dive/round-state.js'
// FR-9：dive 状态规则单一来源（纯函数）
import { transitionDive } from '../../domain/dive/transition.js'

/** 结构化认证失败：message 自带（CODE）文本；code 属性仅测试/直接执行消费。 */
export function reject(message: string, code: string): never {
  throw Object.assign(new Error(`${message}（${code}）`), { code })
}

/** 结构化读取调用 agent 的 id（identity 层：exec.agent 必须有 string id）。 */
export function agentIdFromExec(deps: UseCaseDeps, exec: unknown): string {
  // REQ-260929210741-30ae FR-5：每次用例入口顺手校正 workspaceRoot ——
  // 插件 apply() 时 process.cwd() 是宿主启动目录（Web 模式 = deepseek-harness），
  // 会话工作区只在 exec.agent.session.header.cwd 上。docs 是共享单例，
  // 这里是从会话上下文同步工作区根的**唯一收敛点**（所有用例都经本函数进门）。
  syncWorkspaceRootFromExec(deps, exec)
  return deps.session.windowKey(exec)
}

/**
 * 后台任务的 owner：宿主契约要的是 **id 字符串**，不是 agent 对象。
 *
 * 为什么必须收敛在这里：`ctx.jobs.start({ owner })` 的 owner 会被宿主拿去 `agents.get(id)` 解析
 * live agent（`@deepseek-ai/dsh-jobs-local` 的 `resolveOwner`），传对象**恒判无 live agent**——
 * 实测错误 `session "[object Object]" has no live agent (background job owner must be live)`，
 * 于是自动实施链从来没投递成功过（2026-10-02 REQ-261002161439-277d：advance.history 长度为 0）。
 *
 * 读取顺序与 dive 的 `agentIdOf` 同源（agent.id → agent.session.id），此处**只转出不复写第二份**；
 * 取不到 id 返回 `undefined`（= unowned job，宿主允许），**不是失败**，调用方不得据此拒绝投递。
 */
export function dispatchOwnerOf(exec: unknown): string | undefined {
  return agentIdOf((exec as { agent?: unknown } | undefined)?.agent)
}

/**
 * 从 exec.agent.session.header.cwd 校正工作区根（REQ-260929210741-30ae FR-5）。
 * 无会话 cwd（看板路由 / 启动恢复 / 测试）→ 不动，保持构造时的 process.cwd() 回落。
 * docs / queueRepo 未实现 setWorkspaceRoot（内存实现）→ 鸭子探测跳过。
 * queue.json 与 docs 产物必须同根：同一 cwd 同时校正两者，禁止各自解析。
 */
function syncWorkspaceRootFromExec(deps: UseCaseDeps, exec: unknown): void {
  const cwd = sessionCwdOf(exec)
  if (cwd === undefined) return
  applyWorkspaceRoot(deps, cwd)
}

/** 提取会话工作区（无则 undefined）。 */
function sessionCwdOf(exec: unknown): string | undefined {
  const cwd = (exec as { agent?: { session?: { header?: { cwd?: unknown } } } } | undefined)
    ?.agent?.session?.header?.cwd
  return typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined
}

/**
 * 根校正需要的**最小依赖面**（结构化）。
 *
 * `UseCaseDeps` 天然满足本形状；但看板 HTTP 路由的 `ctx.deps` 只有 `docs`（没有 `taskStore.repo`），
 * 故这里刻意用最小面而非 `UseCaseDeps`——不为一次鸭子探测去伪造整个依赖包
 * （REQ-260930193929-897b FR-1：看板路径也必须能按需求记录校正根）。
 */
export interface WorkspaceRootTargets {
  docs: unknown
  /**
   * 项目注册表端口（REQ-261005141830-7a3b t3 · FR-3）：取根时由 `record.projectId` 查它的 `path`。
   * **可选**：未装配（老装配 / 看板路由只带 docs）→ 一律走路径兜底，行为与改造前一致。
   */
  projectRegistry?: { list(): readonly ProjectEntry[] | undefined }
  /**
   * 任务存储端口。类型用 `unknown` 而**不是** `{ repo?: unknown }`：后者是全可选属性的
   * **弱类型**，TS 会对没有 `repo` 的 `TaskStore` 报 TS2559「no properties in common」。
   * 这里本就是鸭子探测（内部再断言 `.repo.setWorkspaceRoot`），`unknown` 更贴合语义。
   */
  taskStore?: unknown
  /**
   * 知识层自举通知口（REQ-261004174324-4195 t4）。可选：`UseCaseDeps` 天然满足本形状，
   * 未装配时不做任何事（老行为）。
   * 第二参 `projectId`（REQ-261005141830-7a3b t5 · FR-6）：同一项目多窗口只自举一次的去重键。
   */
  knowledgeBootstrap?: { ensure(root?: string, projectId?: string): void }
}

/** 同一根同时校正 docs 与 queueRepo（queue.json 与 docs 产物必须同根）。 */
function applyWorkspaceRoot(deps: WorkspaceRootTargets, root: string, projectId?: string): void {
  const docs = deps.docs as { setWorkspaceRoot?: (root: string) => void }
  if (typeof docs.setWorkspaceRoot === 'function') docs.setWorkspaceRoot(root)
  const taskStore = deps.taskStore as { repo?: unknown } | undefined
  const queueRepo = taskStore?.repo as { setWorkspaceRoot?: (root: string) => void } | undefined
  if (queueRepo !== undefined && typeof queueRepo.setWorkspaceRoot === 'function') {
    queueRepo.setWorkspaceRoot(root)
  }
  // REQ-261004174324-4195 t4：根校正完成即通知自举（即发即忘；缺层才动手，已有则零写入）。
  // REQ-261005141830-7a3b t5：带上项目身份 → 同项目多窗口只自举一次（缺身份回落按路径去重）。
  deps.knowledgeBootstrap?.ensure(root, projectId)
}

/**
 * 工作区根解析链（REQ-260929210741-30ae FR-5/FR-6 / t5 完整版）：
 *   1. requirement?.workspaceRoot   ← 需求级值（立项时选定，最高优先）
 *   2. exec.agent.session.header.cwd ← 会话工作区（默认）
 *   3. process.cwd()                 ← 无会话上下文回落（调用方保持构造值，不动）
 *
 * 纯函数：输入 exec 与可选需求记录，输出解析值（第 3 级返回 undefined 表示「保持现状」）。
 */
export function resolveWorkspaceRoot(exec: unknown, requirement?: { workspaceRoot?: string } | undefined): string | undefined {
  if (requirement !== undefined && typeof requirement.workspaceRoot === 'string' && requirement.workspaceRoot.length > 0) {
    return requirement.workspaceRoot
  }
  return sessionCwdOf(exec)
}

/**
 * 需求级根校正的**唯一实现**（读侧 / 写侧共用 · REQ-260930193929-897b FR-1）：
 * `requirement.workspaceRoot` 非空 → 把 `docs` 与 `queueRepo` 的根**同时**校正到该工作区；否则 no-op。
 *
 * 为什么读侧也必须走它：`deps.docs` / `deps.queueRepo` 是**宿主级、跨窗口共享**的单例，
 * 根会被别的窗口（另一个会话工作区）改掉。读盘类闸门若不在读文档前按需求自己的
 * `workspaceRoot` 再校正一次，就会去错误的目录找文档，后果是**两个相反方向**的坏结果：
 *   · 完整性门            → 报「requirement.md 不存在」（误拦，需求卡死、只能人工绕过）；
 *   · 拆分内容硬门 / FR 覆盖门 / 需求文档格式门 → 读不到文档而**静默放行**（漏放，无告警）。
 *
 * 不抛错：`setWorkspaceRoot` 缺失（内存实现 / 测试替身）由既有 `applyWorkspaceRoot` 的鸭子探测跳过。
 */
export function applyRequirementWorkspaceRoot(
  deps: WorkspaceRootTargets,
  requirement: { projectId?: string; workspaceRoot?: string } | undefined,
): void {
  const resolved = rootOfRequirement(deps, requirement)
  if (resolved === undefined) return
  // t5（FR-6）：自举去重键带上项目身份 —— 同项目多窗口只跑一次（缺身份回落按路径）。
  applyWorkspaceRoot(deps, resolved.root, requirement?.projectId)
}

/**
 * **「这条需求的根在哪」的唯一取数处**（REQ-261005141830-7a3b t3 · FR-3）。
 *
 * 判定顺序（顺序即语义，与 `design/interfaces.md` 的 `rootOf` 逐条对齐）：
 *   1. 记录有 `projectId` 且项目表在位 → 用该项目条目上的 `path`（**身份定归属、路径定位置**），
 *      `by='project-id'`、`attributed=true`；
 *   2. 否则（无 id / 项目表拿不到 / 条目缺根）→ 回落记录自带的 `workspaceRoot`（存量兜底），
 *      `by='path-fallback'`、`attributed=false`（调用方**必须**向外标注）；
 *   3. 两者都没有 → `undefined`（调用方按自己的兜底根写，并如实标注）。
 *
 * 为什么单独成函数：读侧 12 处、写侧 15 处调用点都从这里取根，换判据只需改这一处
 * ——这是本次改造"不动 27 个调用点"的全部秘密。
 */
export function rootOfRequirement(
  deps: WorkspaceRootTargets,
  record: { projectId?: string; workspaceRoot?: string } | undefined,
): ResolvedRequirementRoot | undefined {
  const projectId = typeof record?.projectId === 'string' ? record.projectId.trim() : ''
  if (projectId.length > 0) {
    const byId = rootOfProject(readProjectEntries(deps), projectId)
    if (byId !== undefined) return { root: byId, attributed: true, by: 'project-id' }
  }
  const declared = typeof record?.workspaceRoot === 'string' ? normalizeProjectRoot(record.workspaceRoot.trim()) : ''
  if (declared.length > 0) return { root: declared, attributed: false, by: 'path-fallback' }
  return undefined
}

/** 取根结果：`attributed=false` 表示这是兜底路径，不是项目身份给出的权威值。 */
export interface ResolvedRequirementRoot {
  /** 生效的根（已形状归一）。 */
  root: string
  /** true = 来自项目身份（`projectId` → 项目条目 `path`）；false = 路径兜底（必须向外标注）。 */
  attributed: boolean
  /** 用了哪个判据（进回执 / 评论 / 日志）。 */
  by: 'project-id' | 'path-fallback'
}

/**
 * 读项目表：未装配 / `list` 非函数 / 抛错 → `undefined`（不抛、不伪装空数组）。
 * 项目表由组合根注入（t5 接线）；未装配时本函数一律走路径兜底 —— 老装配行为不变。
 */
function readProjectEntries(deps: WorkspaceRootTargets): readonly ProjectEntry[] | undefined {
  const port = deps.projectRegistry
  if (port === undefined || typeof port.list !== 'function') return undefined
  try {
    return port.list()
  } catch {
    return undefined
  }
}

/**
 * **窗口 → 项目 id**（REQ-261005141830-7a3b t4 · FR-1）：立项时「这条需求属于哪个项目」的取数处。
 *
 * 未装配项目表 / `list` 抛错 / 该会话不在任何项目的 `sessionIds` 里 → `undefined`
 * ——调用方**必须**如实标注「未归属」（不猜、不编、不拿"当前项目"当默认值）。
 */
export function projectIdOfWindowForDeps(
  deps: { projectRegistry?: { list(): readonly ProjectEntry[] | undefined } },
  windowKey: string,
): string | undefined {
  const port = deps.projectRegistry
  if (port === undefined || typeof port.list !== 'function') return undefined
  let entries: readonly ProjectEntry[] | undefined
  try {
    entries = port.list()
  } catch {
    return undefined
  }
  return projectIdOfWindow(entries, windowKey)
}

// ---------------------------------------------------------------------------
// 席位 / 交接的项目校验（REQ-261005141830-7a3b t6 · FR-11）
// ---------------------------------------------------------------------------

/** 跨项目派席 / 交接 / 改绑被拒的传输码（REQ-261005141830-7a3b t6 · FR-11）。 */
export const CROSS_PROJECT_SEAT = 'REQBOARD_CROSS_PROJECT_SEAT'

/** `requireSameProject` 的判定结果（进回执 / 评论，见 FR-9：用了哪个判据必须说出来）。 */
export interface SameProjectGuard {
  /** 需求侧项目身份（缺省 = 未归属）。 */
  projectId?: string
  /** 目标窗口侧项目身份（缺省 = 未归属）。 */
  targetProjectId?: string
  /** 判据来源：`project-id` = 两侧都有身份；`path-fallback` = 任一侧缺身份、走路径口径。 */
  by: 'project-id' | 'path-fallback'
  /**
   * false = **没拿到权威判据**（缺身份且没有可比的两侧根）。
   * 调用方必须把这个标注如实说出去（回执 / 评论），但**不拒**——老装配（无项目表）行为不变。
   */
  attributed: boolean
}

/** 跨项目拒绝文案：必须给**两个项目身份**、各自根与**判据来源**（否则人只能猜是哪一个不对）。 */
function rejectCrossProject(
  action: string,
  by: 'project-id' | 'path-fallback',
  projectId: string | undefined,
  reqRoot: string | undefined,
  targetProjectId: string | undefined,
  targetRoot: string | undefined,
): never {
  reject(
    `reqboard 未执行：跨项目不得${action}（${CROSS_PROJECT_SEAT}）——需求项目=${projectId ?? '未归属'}`
    + `（根 ${reqRoot ?? '(未知)'}），目标窗口项目=${targetProjectId ?? '未归属'}（根 ${targetRoot ?? '(未知)'}）；`
    + `判据来源=${by === 'project-id' ? '项目身份（id 相等才算同项目）' : '路径兜底（任一侧缺项目身份）'}。`
    + '跨项目窗口不得对本项目的需求派席 / 交接 / 改绑。',
    CROSS_PROJECT_SEAT,
  )
}

/**
 * **「派席 / 交接 / 改绑的窗口必须与需求同项目」的唯一判据**（REQ-261005141830-7a3b t6 · FR-11）。
 *
 * 为什么必须有它：`reqboard_bind` 此前只校验"调用者是不是 owner"与席位上限，**完全不看项目**——
 * owner 在 P1 可以把 P2 的窗口派成 worker，那个窗口随后就能替 P1 写盘，这是"多窗口不同项目串"
 * 的一条**合法入口**。
 *
 * 判定顺序（顺序即语义）：
 *   1. 两侧都有 `projectId` → 比 id（`by='project-id'`）；不等 → 拒 `CROSS_PROJECT_SEAT`；
 *   2. 任一侧缺 id → 比路径（需求根 vs 目标窗口所属项目的根）；不等 → 同样拒；
 *   3. 连路径也比不了（目标窗口查不到项目 / 需求没有根）→ **不拒**，返回 `attributed=false`，
 *      由调用方如实标注「未归属」——老装配（宿主没有 workspace 注册表）行为零变化（FR-8）。
 *
 * `sameProjectRoot` 只做字符串形状归一（与既有判据同源）；软链等价需 realpath 解算器，
 * 那是调用方的事（application 层不许 IO）。
 */
export function requireSameProject(
  deps: WorkspaceRootTargets,
  requirement: { id?: string; projectId?: string; workspaceRoot?: string } | undefined,
  targetWindowKey: string,
  action: string,
): SameProjectGuard {
  const raw = requirement?.projectId
  const projectId = typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined
  const entries = readProjectEntries(deps)
  const targetProjectId = projectIdOfWindow(entries, targetWindowKey)

  // ① 两侧都有身份：权威判据，根不参与比较（同一 id 必然同一根）。
  if (projectId !== undefined && targetProjectId !== undefined) {
    if (projectId === targetProjectId) {
      return { projectId, targetProjectId, by: 'project-id', attributed: true }
    }
    rejectCrossProject(
      action,
      'project-id',
      projectId,
      rootOfProject(entries, projectId) ?? requirement?.workspaceRoot,
      targetProjectId,
      rootOfProject(entries, targetProjectId),
    )
  }

  // ② 任一侧缺身份：走路径口径（需求根 vs 目标窗口项目的根）。
  const reqRoot = rootOfRequirement(deps, requirement)?.root
  const targetRoot = targetProjectId === undefined ? undefined : rootOfProject(entries, targetProjectId)
  if (reqRoot !== undefined && targetRoot !== undefined) {
    if (sameProjectRoot(reqRoot, targetRoot)) {
      return { projectId, targetProjectId, by: 'path-fallback', attributed: false }
    }
    rejectCrossProject(action, 'path-fallback', projectId, reqRoot, targetProjectId, targetRoot)
  }

  // ③ 比不了：不猜、不放行得含糊——如实标注「未归属」，由调用方说出去（FR-9）。
  return { projectId, targetProjectId, by: 'path-fallback', attributed: false }
}

/**
 * 写侧入口（REQ-260929210741-30ae FR-6 / t5）——保留原名与形参以兼容既有调用点，
 * 内部**委托** `applyRequirementWorkspaceRoot`，使读写两侧只有一处校正实现。
 *
 * `exec` 形参已不再参与判定：校正动作**只由需求级值决定**（`resolveWorkspaceRoot` 的优先级链里，
 * 需求无 `workspaceRoot` 时回落到会话 cwd，而原实现的守卫在那种情况下本就不做任何校正）。
 * 故改名为 `_exec` 仅表「有意不用」，行为与改造前**逐字一致**。
 */
export function syncWorkspaceRootForRequirement(deps: UseCaseDeps, _exec: unknown, requirement: { projectId?: string; workspaceRoot?: string } | undefined): void {
  applyRequirementWorkspaceRoot(deps, requirement)
}

// ---------------------------------------------------------------------------
// 项目维度口径（REQ-261001203710-0fbf FR-1）——「一条记录属于哪个项目」的唯一答案
// ---------------------------------------------------------------------------

/** 落盘根与记录声明的项目根不一致时的传输码（写路径使用，见 t3）。 */
export const PROJECT_ROOT_MISMATCH = 'REQBOARD_PROJECT_ROOT_MISMATCH'

/** 可观测字段名：返回体 / 评论用它说明「本次实际用的是哪个项目根」。 */
export const USED_PROJECT_ROOT_FIELD = 'usedProjectRoot'

/** 一条记录的项目归属判定结果。 */
export interface ProjectRootDecision {
  /** 该记录所属项目的根（值原样返回，只做形状归一，不改语义）。 */
  root: string
  /** true = 来自记录自己的 `workspaceRoot`；false = 记录未声明，用的是 fallback（**必须向外标注**）。 */
  attributed: boolean
}

/**
 * 路径**形状**归一 / 同项目路径判定（REQ-261005141830-7a3b t1）：函数体已搬到
 * `./project-root.js`（依赖方向见那里的模块注释），此处**再导出**保持既有 import 路径不变
 * （`QueryKnowledge` / `EnsureKnowledgeLayer` / `ArtifactSync` / 测试都从本模块 import）。
 */
export { normalizeProjectRoot, sameProjectRoot } from './project-root.js'

/**
 * **「这条记录属于哪个项目」的唯一口径。**
 *
 * 规则（与 `design/data-model.md` 的三条口径逐条对应）：
 *   1. `record.workspaceRoot` 非空 → 就是它，`attributed: true`；
 *   2. 否则 → `fallback`，`attributed: false`——调用方**必须**把这个标注向外说出去
 *      （返回体 / 评论），不允许把它静默当成当前项目（那正是跨项目污染的来源）。
 */
export function projectRootOf(
  record: { workspaceRoot?: string } | undefined,
  fallback: string,
): ProjectRootDecision {
  const declared = record?.workspaceRoot
  if (typeof declared === 'string' && declared.length > 0) {
    return { root: normalizeProjectRoot(declared), attributed: true }
  }
  return { root: normalizeProjectRoot(fallback), attributed: false }
}

/** 记录集按项目分区的结果：我的 / 别人的 / 未归属。 */
export interface ProjectPartition<T> {
  /** 属于本次项目：按记录自己的根处理。 */
  mine: T[]
  /** 属于**别的**项目：调用方应跳过并计数回报，不得拿自己的根去处理。 */
  others: T[]
  /** 记录未声明 `workspaceRoot`：按 `fallback` 处理**并标注**（不得静默当成本项目）。 */
  unattributed: T[]
}

/**
 * 把记录集按项目切开——**看板扫描不再「取全部 id 用同一个 cwd 扫」**的依据（见 t2）。
 *
 * 注：`unattributed` 也按 `fallback` 处理，但单独成桶，好让调用方如实标注而不是混进「我的」。
 */
export function partitionByProject<T extends { projectId?: string; workspaceRoot?: string }>(
  records: readonly T[],
  projectRoot: string,
  fallback: string,
  realpath?: (p: string) => string,
  callerProjectId?: string,
): ProjectPartition<T> {
  const mine: T[] = []
  const others: T[] = []
  const unattributed: T[] = []
  for (const r of records) {
    // REQ-261005141830-7a3b t5：**判据优先用项目身份**（两侧都有 id 就比 id，根不参与比较）；
    // 任一侧没有 id 才退回路径形状比较 —— 与 `sameProjectOf` 同一口径，不再各写一套。
    const verdict = callerProjectId !== undefined
      ? sameProjectOf({ projectId: callerProjectId }, r, realpath)
      : undefined
    if (verdict !== undefined) {
      if (verdict.by === 'path-fallback' && !verdict.attributed) { unattributed.push(r); continue }
      if (verdict.same) mine.push(r)
      else others.push(r)
      continue
    }
    const d = projectRootOf(r, fallback)
    if (!d.attributed) { unattributed.push(r); continue }
    if (sameProjectRoot(d.root, projectRoot, realpath)) mine.push(r)
    else others.push(r)
  }
  return { mine, others, unattributed }
}

/**
 * 是否为**绝对**路径形态（POSIX `/…` 或 Windows `X:/…`）。纯字符串判断，零 IO。
 * 用途：只有两边都绝对才敢判「是不是同一个项目」——相对写法与绝对路径可能同指一处，
 * 在 application 层解析不了（不许 import node:path），故那种情况一律不判（见 ensureWritableProjectRoot）。
 */
export function isAbsoluteRoot(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:\//.test(p)
}

/** 记录声明的根**不可用**（非绝对路径 / 目录不存在 / 不可读）时的传输码（写侧使用）。 */
export const INVALID_WORKSPACE = 'REQBOARD_INVALID_WORKSPACE'

/**
 * 本次调用**自己的**根（调用窗口会话 cwd）。
 *
 * 只用于「记录未声明 `workspaceRoot`」的存量需求兜底；**不参与真错配判定**——
 * 真错配的判据是「记录声明的根不可用」或「校正失效」，与调用方自己的根无关。
 */
export interface WriteRootCaller {
  callerRoot?: string
}

/** 声明根不可用 → 响亮拒绝（写侧**不降级**到调用方 cwd：那正是「写到别的项目」）。 */
function rejectUnusableDeclaredRoot(declared: string): never {
  throw Object.assign(
    new Error(
      '写盘被拒：记录声明的项目根不可用（' + INVALID_WORKSPACE + '）——记录声明的根=' + declared
      + '。修复：核对该需求的 workspaceRoot 是否为**存在且可读的绝对路径目录**；'
      + '写侧不会回落到会话 cwd（回落等于把产物写到别的项目里）。',
    ),
    { code: INVALID_WORKSPACE },
  )
}

/**
 * **写盘前守卫**（REQ-261001203710-0fbf t3 / FR-2；口径重定 REQ-261005123641-3982 FR-1/FR-2）：
 * 让「即将写入的根」等于「**这条需求记录自己声明的根**」——声明根是唯一权威，写前把它落到仓储上。
 *
 * **判定输入只有记录**：`record.workspaceRoot`（由 REQ id 取到的记录）。进程内共享的
 * `deps.docs` / `repo` 根**不参与判定**，只被校正、被复核——它记录的是「最后一个调用的窗口」，
 * 不是「本次调用属于哪条需求」，拿它当判据就等于让邻居窗口替本窗口做决定（实测病灶：
 * 立项弹框停留 34 秒期间，另一窗口的 `reqboard_status` 把单例根改走 → 立项被误拒，
 * 而记录其实已经建好；见 REQ-261005123641-3982 `requirement.md` 的产品定义）。
 *
 * **为什么从「只核验」改成「先校正再核验」**（推翻 REQ-261001203710-0fbf 的旧取舍，理由如实记）：
 * 旧取舍的顾虑是「拿一个可能算错的声明去搬动写入，会把错误放大」（当时 capture 在没有会话 cwd 时
 * 回落 `process.cwd()`，记录声明的根本身就是错的）。该顾虑现在由两件事承担：① 声明根的**可信化**
 * 在立项侧完成（capture/create 优先取「实际会写进去的工作区」）；② 本函数新增**存在性硬校验**——
 * 声明根不是存在且可读的绝对路径目录就拒绝，绝不搬动。剩下的一种「不一致」是共享单例被别的窗口
 * 改过——那不是错配，是缓存过期，校正即可。
 *
 * 判定顺序（顺序即语义，见 `design/interfaces.md`）：
 *   1. 没有 `workspaceRoot()` 探针（无根内存替身）→ 返回 undefined：无从核验，不谎报也不误拒；
 *   2. 记录声明了根：
 *      a. **非绝对路径**（`'.'` 等）→ 不判，返回探针当前值（变更记见函数体①：用户裁定「宽容」）；
 *      b. 绝对路径但 `docs.exists(declared) === false` → 抛 `INVALID_WORKSPACE`（**不降级**）；
 *      c. `applyWorkspaceRoot` 同款校正（唯一实现）→ 复核探针值；
 *        相同 → 返回声明根；仍不同 → 抛 `PROJECT_ROOT_MISMATCH`（**校正失效的最后防线**，
 *        如端口没有 `setWorkspaceRoot`）；读不回/非绝对 → 返回声明根（不判）；
 *   3. 记录未声明根（存量）→ 回落 `caller.callerRoot` 并校正到它；连它也没有 → undefined
 *      （调用方按其兜底根写并**标注** `attributed=false`）。
 *
 * @returns 生效的写入根（已形状归一）；无从核验时 undefined
 */
export function ensureWritableProjectRoot(
  deps: WorkspaceRootTargets,
  record: { id?: string; projectId?: string; workspaceRoot?: string } | undefined,
  caller?: WriteRootCaller,
): string | undefined {
  // 读得回才判（读不回 = 无从判断，不谎报也不误拒）
  const probe = (deps.docs as { workspaceRoot?: () => unknown }).workspaceRoot
  if (typeof probe !== 'function') return undefined

  // REQ-261005141830-7a3b t3：声明根 = 项目身份带出的根（有 projectId 时），否则记录自带的路径。
  // 判定顺序（① 非绝对不判 / ② 绝对但不可用即拒 / ③ 校正 / ④ 复核）逐字不变。
  const declared = rootOfRequirement(deps, record)?.root ?? ''
  if (declared.length === 0) {
    // 存量需求（未声明根）：回落**本次调用自己的根**，由调用方在回执/评论里如实标注
    const fallback = typeof caller?.callerRoot === 'string' ? normalizeProjectRoot(caller.callerRoot) : ''
    if (fallback.length === 0 || !isAbsoluteRoot(fallback)) return undefined
    applyWorkspaceRoot(deps, fallback)
    return fallback
  }

  // ① 声明根必须**可解析**：非绝对（`'.'` 等）时 application 层算不出它指向哪——与旧实现一致，
  //    **不判**（不校正、不拒绝）。变更记（2026-10-05，用户在对话中裁决「宽容：非绝对 → 不判」）：
  //    设计表原写「非绝对 → 抛 INVALID_WORKSPACE」，实测会打红内存仓储（把根报成 `'.'`）的立项用例；
  //    相对根在生产路径不出现（`process.cwd()` / 会话 cwd 恒为绝对），故按「无法解析就不判」处理。
  if (!isAbsoluteRoot(declared)) {
    const current = probe.call(deps.docs)
    if (typeof current !== 'string' || current.length === 0) return undefined
    return normalizeProjectRoot(current)
  }

  // ② 绝对声明根必须**可用**——写侧只拒绝、不降级（回落会话 cwd = 写到别的项目里）
  const exists = (deps.docs as { exists?: (p: string) => unknown }).exists
  if (typeof exists === 'function') {
    let ok = false
    try { ok = exists.call(deps.docs, declared) === true } catch { ok = false }
    if (!ok) rejectUnusableDeclaredRoot(declared)
  }

  // ③ 写前校正：把共享仓储的根搬到声明根（与读侧同一实现，读写两侧只有一处校正）
  applyWorkspaceRoot(deps, declared, record?.projectId)

  // ④ 复核：校正生效 → 声明根即写入根；仍不一致 = 校正失效（最后防线，给两个绝对路径）
  const effective = probe.call(deps.docs)
  if (typeof effective !== 'string' || effective.length === 0) return declared
  const got = normalizeProjectRoot(effective)
  if (!isAbsoluteRoot(got)) return declared
  if (!sameProjectRoot(declared, got)) {
    throw Object.assign(
      new Error(
        '写盘被拒：即将写入的项目根与记录声明的项目根不一致（' + PROJECT_ROOT_MISMATCH + '）——'
        + '记录声明的根=' + declared + '；实际会写的根=' + got
        + '。修复：核对该需求的 workspaceRoot 与调用上下文传入的根，不要让它落到别的项目里。',
      ),
      { code: PROJECT_ROOT_MISMATCH },
    )
  }
  return declared
}

/**
 * **按需求 id 核验写盘根**（REQ-261001203710-0fbf t7）：给「知道需求是谁、手里却没有记录」的共享写入器用。
 *
 * 为什么要有它：守卫若只接在 3 个调用点，改造新增的写盘点（完工记录 / 验收文档 / 接收标记 / 链上追加 /
 * 十处 RTM…）就全是裸的。这些写入器**都拿得到需求 id**，按 id 取记录即可——判定下沉后一处生效。
 *
 * 与 `ensureWritableProjectRoot` **同口径**（同一实现、同一出口，不许一个校正一个不校正）：
 *   · reqId 为空 → 无从核验，返回 undefined；
 *   · 台账读不到 / 端口缺失 → 无从核验，返回 undefined（不据此误拒）；
 *   · 记录声明的根不可用 → 原样抛 `INVALID_WORKSPACE`；
 *   · 校正后仍不一致（校正失效）→ 原样抛 `PROJECT_ROOT_MISMATCH`。两处「响亮」出口调用方不得吞掉。
 */
export async function assertWritableRequirementProject(
  deps: UseCaseDeps,
  reqId: string | undefined,
  caller?: WriteRootCaller,
): Promise<string | undefined> {
  if (typeof reqId !== 'string' || reqId.length === 0) return undefined
  let rec: { id?: string; workspaceRoot?: string } | undefined
  try {
    rec = await requirementStoreOf(deps).get(reqId)
  } catch {
    return undefined
  }
  if (rec === undefined) return undefined
  return ensureWritableProjectRoot(deps, rec, caller)
}

/** 尽力而为的 live-driver 认证（规则与文案在 SessionProbeAdapter，行为同搬迁前）。 */
export function requireLiveDriver(deps: UseCaseDeps, exec: unknown): void {
  deps.session.requireLiveDriver(exec)
}

/** 直接人工回合认证（规则与文案在 SessionProbeAdapter，行为同搬迁前）。 */
export function requireDirectHuman(deps: UseCaseDeps, exec: unknown): void {
  deps.session.requireDirectHuman(exec)
}

/**
 * 阶段通知简版（REQ-31e11f t4）：产物登记成功时通知请人审阅。
 * 用 ctx 里可用的通知通道（feishu_notify）；若无通知服务则 logger.info 降级，不阻断。
 */
export function notifyArtifactRegistered(
  _deps: UseCaseDeps,
  reqId: string,
  artifact: StageArtifact,
): void {
  try {
    const text = artifactNotifyText(
      { id: reqId, title: '' } as RequirementRecord,
      artifact,
    )
    // 尝试通过全局 logger 输出（降级路径，不阻断）
    const g = globalThis as { console?: typeof console }
    g.console?.info?.('[reqboard] ' + text)
  } catch { /* 通知失败不阻断主流程 */ }
}

/**
 * rollup 阻塞清单（REQ-2e9473 t02）：需求停在 implementing 但 R2 无法推进（存在未完成任务）
 * 时，返回阻塞任务清单；否则 undefined。用于 task_move / verify_submit 返回体显式告警——
 * REQ-6f39b5 事故 B 的教训：幽灵任务卡死 rollup 时静默无提示，agent 与用户都看不见。
 */
export function rollupBlockersOf(
  tasks: readonly TaskRecord[],
  reqId: string,
  reqStatus: string,
): { id: string; title: string; status: string }[] | undefined {
  if (reqStatus !== 'implementing') return undefined
  // 队列任务（REQ-260927202051-f6df D4：`LedgerView.tasks` 随 v9 移除，任务由调用方从队列传入）
  const open = tasks.filter(t => t.requirementId === reqId && t.status !== 'canceled' && t.status !== 'done')
  if (open.length === 0) return undefined
  return open.map(t => ({ id: t.id, title: t.title, status: t.status }))
}

/**
 * done 凭证门（REQ-2e9473 t06/W2，事故 C/D 的硬门）：转 done 前的四重校验——
 *  ① 汇报前置：必须有 task_report 留痕（lastReport），且 completed/filesChanged 至少其一非空；
 *  ② 真实动作：**链出身以来**（需求/父卡/本卡 createdAt 最小值；老数据才退回开工 claimedAt）有
 *     干活类工具痕迹（edit/write/bash/run_code，弱信号），或汇报声明的文件真实存在且 mtime 晚于
 *     该基准（强信号）——25ms 速通两路都过不了；
 *  ③ 批量关闭节流：同需求 60s 内已有其他任务被本窗口关闭 → 拒（事故 C：一次调用关 4 个任务）；
 *  ④ 构建新鲜度：汇报改动涉及 packages/pages/<pkg>/src/ → 该包 lib/client.js 必须存在且
 *     新于最新 src 改动（事故 D：改了源码没构建，用户看到旧页面）。
 */
/** 页面插件构建新鲜度证据（父卡四重校验与子卡新口径共用）。 */
function pagesBuildEvidence(
  deps: UseCaseDeps,
  pagesSrc: readonly string[],
): { clientBuildExists: boolean; clientBuildMtime: number; newestPagesSrcMtime: number } {
  if (pagesSrc.length === 0) return { clientBuildExists: false, clientBuildMtime: 0, newestPagesSrcMtime: 0 }
  const pkg = /^packages\/pages\/([^/]+)\//.exec(pagesSrc[0] ?? '')?.[1] ?? ''
  const st = deps.docs.stat('packages/pages/' + pkg + '/lib/client.js')
  return {
    clientBuildExists: st !== undefined,
    clientBuildMtime: st?.mtimeMs ?? 0,
    newestPagesSrcMtime: Math.max(...pagesSrc.map((f) => deps.docs.stat(f)?.mtimeMs ?? 0)),
  }
}

/**
 * 链窗口基准（不可变出身，单调不后退）：需求 / 父卡 / 本卡 `createdAt` 的最小值。
 * 三者全缺（老数据）才退回本卡开工时刻——`claimedAt` 会被开工/重跑重写，不能当窗口起点
 * （REQ-260927144541-0481 D17 L1；2026-09-28 起父子两条证据路径共用本基准）。
 */
function chainBaselineOf(requirementCreatedAt: number | undefined, task: TaskRecord, parent?: TaskRecord): number {
  // t8/B11：只吃需求 createdAt（原为整册台账里 find 一条）
  const raw = Math.min(
    requirementCreatedAt ?? Infinity,
    parent?.createdAt ?? Infinity,
    task.createdAt ?? Infinity,
  )
  return Number.isFinite(raw) ? raw : (task.claimedAt ?? task.createdAt ?? 0)
}

/**
 * done 凭证门（REQ-2e9473 t06/W2，事故 C/D 的硬门）：转 done 前的四重校验。
 *
 * @param tasks 队列任务（REQ-260927202051-f6df D4：`LedgerView.tasks` 随 v9 移除）。
 *              `ledger` 只用于取需求记录（`ledger.requirements`）。
 */
export function assertDoneEvidence(
  deps: UseCaseDeps,
  windowKey: string,
  task: TaskRecord,
  requirementCreatedAt: number | undefined,
  tasks: readonly TaskRecord[],
): void {
  // 规则（四重校验与拒绝文案）在 domain/workflow/DoneEvidenceSpec.ts（REQ-47939a t3）；
  // 这里只负责取副作用证据（工具痕迹 / 文件 stat / 构建新鲜度）再交给纯判定。
  const rep = task.lastReport
  const filesChangedEarly = rep?.filesChanged ?? []
  // 基准 = 链出身（chainBaselineOf，单调不后退）——**父子同口径**（REQ-260927144541-0481 D17 L1）。
  // 此前父卡仍用 `claimedAt ?? createdAt`：claimedAt 由开工/重跑重写，轻档手工交付（先干活、
  // 后认领）会把已存在的交付判成「无改动」→ FINALIZE_PARENT 恒失败（2026-09-28 实测 t-dd5ba9
  // 开工 14:59:53 晚于交付 14:58:45，链在该父卡收尾处暂停）。子卡路径早已修过，父卡是同一缺陷的孪生。
  const chainSince = chainBaselineOf(requirementCreatedAt, task, isSubtask(task) ? tasks.find((t) => t.id === task.parentId) : undefined)
  // REQ-261003203909-55f2 FR-2 防伪造：manual 段的核对清单骨架由链落盘（mtime 必然 ≥ 链出身），
  // 只看链出身，「骨架生成后一个字不改就汇报」也能过门——manual 子卡的基准收紧为
  // 「骨架生成时间 +1ms」：人核对后的更新必然晚于骨架，没核对就汇报过不了门。
  const since = task.stageKind === 'manual' && task.manualSkeletonAt !== undefined
    ? Math.max(chainSince, task.manualSkeletonAt + 1)
    : chainSince

  // REQ-4842fe t5：子卡走**新口径**（三项 + 构建新鲜度），豁免窗口活动与 60s 节流——
  // 干活的子代理在别的会话，"本窗口工具活动"对子卡恒不成立。
  if (isSubtask(task)) {
    // REQ-260927144541-0481（D17 结构性死路收口）：子卡是**父卡这条链**的一个阶段，交付可能在
    // 子卡 run 之前就已完成（轻档手工交付）——此时拿「子卡本次 run 起点」当新鲜度基准，必然把
    // 已存在的交付判成「无改动」。实测 t-c42bc0：run.ok=true、13 个上报文件全部存在，但 mtime
    // 14:55–15:04 早于 run 起点 15:25:48 → 子卡恒不过门、链必停。
    // 第一版修法取「父卡 claimedAt（缺省 createdAt）」——**基准仍会漂移**：claimedAt 由 ExecuteTask
    // 在每次重跑/重入时重写，链越跑基准越靠后，同一份交付会被前后两次判成不同结论。
    // 故基准改取**不可变出身**（requirement / 父卡 / 子卡 createdAt 的最小值，见下），窗口单调不后退；
    // 上报文件仍必须真实存在（写入族）——只把「谁的窗口」修对，不放弃文件系统证据。
    // L1 基准单调化（D17 病根）：基准已在函数入口统一取**不可变出身**（chainBaselineOf），
    // 父子同口径——claimedAt 会被重跑重写，不能当"链窗口起点"。
    const subPagesSrc = filesChangedEarly.filter((f) => /^packages\/pages\/[^/]+\/src\//.test(f))
    const build = pagesBuildEvidence(deps, subPagesSrc)
    const verdictSub = checkSubtaskEvidence({
      hasReport: rep !== undefined,
      reportFilesChanged: filesChangedEarly,
      reportCompleted: rep?.completed ?? [],
      run: task.lastRun,
      since: since,
      // L2 证据形态分流：阶段决定该收文件证据还是结论证据（STAGE_EVIDENCE_KIND）。
      ...(task.stageKind !== undefined ? { stageKind: task.stageKind } : {}),
      // D15：路径归一——容忍子代理写相对 git 根的 `agent-dh/…` 前缀（工作区根已是 agent-dh）。
      fileMtimes: Object.fromEntries(filesChangedEarly.map((f) => [f, reportFileMtime(deps, f)])),
      pagesSrcFiles: subPagesSrc,
      ...build,
    })
    if (!verdictSub.ok) reject(verdictSub.reason, verdictSub.code)
    // 走「汇报兜底」通过时把那次失败 run 结构化留痕（2026-10-03 子卡毒状态修复的配套要求）：
    // 允许"没有成功的 run 也能靠汇报收尾"，但**不许把失败静默吞掉**——
    // 否则事后没人能回答"这张卡是靠汇报过的吗？它当时为什么没跑成？"。
    if (verdictSub.note !== undefined) {
      captureDiag('reqboard-capture [SUBTASK-REPORT-FALLBACK]: task=' + task.id
        + ' stage=' + String(task.stageKind ?? '-')
        + ' failedRun=' + JSON.stringify(verdictSub.failedRun ?? null)
        + ' | ' + verdictSub.note)
    }
    return
  }

  // REQ-4842fe t5：父卡收尾门（INV-5）——存在未 done 子卡时父卡不得 done。
  const subs = subtasksOf(tasks, task.id)
  if (subs.length > 0) {
    const verdictParent = checkParentSubtasksDone(subs)
    if (!verdictParent.ok) reject(verdictParent.reason, verdictParent.code)
  }

  const activity = deps.session.toolActivitySince(windowKey, since)
  const hasTraceWork = activity > 0
  const filesChanged = rep?.filesChanged ?? []
  const fileEvidence = filesChanged.some((f) => {
    const m = reportFileMtime(deps, f)
    return m !== undefined && m >= since
  })
  const nowTs = deps.clock.now()
  // REQ-261001154450-b918 FR-4：节流拒绝文案必须给出"还要等多久"，不能让 agent 靠试探找节奏
  const throttleMs = deps.doneThrottleMs ?? 60_000
  const recentDoneTask = findRecentAgentDoneTask(
    tasks, task.id, task.requirementId, nowTs, throttleMs,
  )
  const throttleRemainingMs = doneThrottleRemainingMs(tasks, task.id, task.requirementId, nowTs, throttleMs)
  // ④ 页面插件构建新鲜度（事故 D）
  const pagesSrc = filesChanged.filter(f => /^packages\/pages\/[^/]+\/src\//.test(f))
  let clientBuildExists = false
  let clientBuildMtime = 0
  let newestPagesSrcMtime = 0
  if (pagesSrc.length > 0) {
    const pkg = /^packages\/pages\/([^/]+)\//.exec(pagesSrc[0])?.[1] ?? ''
    const st = deps.docs.stat('packages/pages/' + pkg + '/lib/client.js')
    if (st !== undefined) { clientBuildMtime = st.mtimeMs; clientBuildExists = true }
    newestPagesSrcMtime = Math.max(...pagesSrc.map((f) => deps.docs.stat(f)?.mtimeMs ?? 0))
  }
  const verdict = checkDoneEvidence({
    hasReport: rep !== undefined,
    reportFilesChanged: filesChanged,
    reportCompleted: rep?.completed ?? [],
    hasTraceWork,
    fileEvidence,
    ...(recentDoneTask !== undefined ? { recentDoneTask } : {}),
    ...(throttleRemainingMs > 0 ? { throttleRemainingMs } : {}),
    pagesSrcFiles: pagesSrc,
    clientBuildExists,
    clientBuildMtime,
    newestPagesSrcMtime,
  })
  if (!verdict.ok) reject(verdict.reason, verdict.code)
}

/**
 * evidence 中的工作区路径候选（REQ-2e9473 t12）：只认已知根前缀 + 扩展名的 token，
 * 降低把散文误判成路径的概率（如"packages/x.ts 通过"仅取 packages/x.ts）。
 */
export function workspacePathCandidates(evidence: readonly string[]): string[] {
  // 注意扩展名按长度降序：json 必须在 js 之前，否则 package.json 会被截成 package.js（t12 实测）
  const re = /(?:^|[\s（(])((?:packages|docs|scripts|tests|agent-dh|profiles|examples)\/[\w./@-]+\.(?:tsx|json|mjs|cjs|jpeg|html|svg|png|jpg|css|ts|js|md))/g
  const out = new Set<string>()
  for (const e of evidence) {
    for (const m of e.matchAll(re)) {
      if (m[1] !== undefined) out.add(m[1])
    }
  }
  return [...out]
}

/**
 * 闸门问题卡（REQ-2e9473 t08）：move 被人工闸门拒绝时，返回可直接喂给 reqboard_ask_confirm
 * 的调用参数——闸门从"只挡不引"升级为"挡并指路"。用户点肯定项即自动落章+推进。
 *
 * REQ-e3b6a0 t2：文案与调用表达式已收敛进 `domain/gate/GateCatalog.questionCardFor`
 * （闸门唯一事实源），本处只做转发以保持既有调用点与输出逐字不变。
 */
export function gateQuestionCard(gateKind: string | undefined, from: string, to: string): string {
  return questionCardFor(gateKind, from, to)
}

/**
 * 文档位置取值与回落标记（REQ-260924213231-b1c4 T-10 / FR-7 / UC-4）——立项**降级路径**
 * （`reqboard_create`：弹框通道不可用、用户在对话里给三值时）与弹框路径共用同一份缺省口径
 * （`CAPTURE_DEFAULTS.docLocation`），堵住"降级丢第四问"。
 *
 * 规则：未传 / 空串 → 回落默认并标记 `usedDefault=true`（返回体 `defaults_used` 据此如实留痕，
 * 不静默猜）；形态非法（非字符串 / 绝对路径 / 含 `..` 上跳段）→ `REQBOARD_INVALID_INPUT`，
 * **不静默改路径**（design/use-cases.md UC-4 异常流）。
 */
export function resolveDocBasePath(raw: unknown): { docBasePath: string; usedDefault: boolean } {
  if (raw === undefined || raw === null) {
    return { docBasePath: CAPTURE_DEFAULTS.docLocation, usedDefault: true }
  }
  if (typeof raw !== 'string') {
    reject('reqboard_create 未执行：doc_location 必须是工作区相对目录（字符串）', 'REQBOARD_INVALID_INPUT')
  }
  const p = raw.trim()
  if (p.length === 0) return { docBasePath: CAPTURE_DEFAULTS.docLocation, usedDefault: true }
  if (p.length > LIMITS.pathMax) {
    reject(`reqboard_create 未执行：doc_location 超长（≤${LIMITS.pathMax} 字符）`, 'REQBOARD_INVALID_INPUT')
  }
  if (!isWorkspaceRelativeDir(p)) {
    reject(
      `reqboard_create 未执行：doc_location 必须是工作区相对目录（收到 ${p}）——绝对路径与含 .. 的路径一律不接受，不静默改路径`,
      'REQBOARD_INVALID_INPUT',
    )
  }
  return { docBasePath: p, usedDefault: false }
}

/** 工作区相对目录判定：拒绝绝对路径（POSIX / Windows 盘符 / UNC / ~）与 `..` 上跳段。 */
function isWorkspaceRelativeDir(p: string): boolean {
  if (p.startsWith('/') || p.startsWith('~') || p.startsWith('\\')) return false
  if (/^[A-Za-z]:[\\/]/.test(p)) return false
  return !p.split(/[\\/]+/).includes('..')
}

/**
 * 直接立项写入：store.mutate('requirement-created') push RequirementRecord
 * （status='draft'，sourceSessionId=windowKey，actor={kind:'human'}——弹框作答
 * = 用户确认，语义等同看板 confirm）。幂等：mutator 内窗口已 bound → return
 * undefined 中止；中止后若快照显示已绑定 → REQBOARD_WINDOW_BOUND 拒绝。
 */
export async function createRequirementDirect(
  deps: UseCaseDeps,
  windowKey: string,
  input: {
    title: string; category: RequirementCategory; description: string; reason: string
    promptDifficulty?: string; docBasePath?: string; workspaceRoot?: string
    /** 项目身份（REQ-261005141830-7a3b FR-1）：由调用方按窗口解析后传入；缺省 = 未归属。 */
    projectId?: string
    /**
     * 归属窗口覆盖（REQ-261003215944-9e04 FR-4 handoff）：缺省 = 调用窗口。
     * 人在本窗口作答，但需求记在**新窗口**名下——即"把这个项目交给新窗口当 owner"。
     */
    ownerSessionId?: string
    /**
     * 显式选择「本窗口接第二个项目」（FR-4 second）：跳过"一窗口一需求"的拒绝。
     *
     * 为什么保留这道守卫却允许显式跳过：守卫的本意是**防重复立项的竞态双保险**，
     * 不是"永远不许第二条"。调用方（reqboard_capture）已在弹框前做过同一判定，
     * 这里只认它传进来的显式决定——不猜、不静默放行。
     */
    allowWindowBound?: boolean
    /**
     * 立项来源（**如实留痕**，2026-10-06）：缺省 `'capture-dialog'` = 人经弹框答三问
     * （actor=human，评论写「[会话捕获] 用户经五问弹框确认立项」）；
     * `'agent-delegated'` = agent 受**本窗口直接人工指令**代为取值并立项（actor=agent，
     * 评论写清授权来源与"未经弹框逐问确认"）。
     *
     * 为什么必须分开：这两条路的**事实不同**——一条有人逐问确认过名称/分类/难度，另一条没有。
     * 混用会让"人确认过三问"变成一句无法证伪的谎，事后复盘时两条路完全同形。
     */
    provenance?: 'capture-dialog' | 'agent-delegated'
  },
): Promise<RequirementRecord> {
  const nowTs = deps.clock.now()
  // REQ-260924213231-b1c4 FR-7：docBasePath 缺省时写既有默认值——回落要**落在台账**（不只留在返回体），
  // 否则"降级路径丢第四问"只是换了地方丢。与 requirementDocPath() 的缺省分支同值。
  const docBasePath = (input.docBasePath ?? '').trim() || CAPTURE_DEFAULTS.docLocation
  // B12 阶段④-4（D 组裁决③的落地）：创建型改走**新端口**。
  // ★ 语义差异（须知）：旧路径是"整册一次原子写"，现在拆成 **create + 一条定点补写**两次写。
  //   幂等闸（本窗口是否已绑定）由"同事务内判定"变为**前置检查 + 写入后复核**双保险（见下）。
  const store = requirementStoreOf(deps)
  if (input.allowWindowBound !== true && (await boundSummariesOf(store, windowKey)).length > 0) {
    reject('reqboard_create 未写入：本窗口已绑定进行中需求，勿重复立项', 'REQBOARD_WINDOW_BOUND')
  }
  // 立项来源决定"谁建的"——代理立项必须记成 agent（见 provenance 的注释：两条路的事实不同）。
  const delegated = input.provenance === 'agent-delegated'
  const actor = delegated
    ? ({ kind: 'agent', sessionId: windowKey } as const)
    : ({ kind: 'human' } as const)
  {
    const req: RequirementRecord = {
      id: deps.ids.requirement(),
      title: input.title,
      description: input.description,
      category: input.category,
      promptDifficulty: input.promptDifficulty as any, // 提示词难度级别
      docBasePath,
      // FR-6：需求级工作区根（capture 第 5 问；reqboard_create 手工路径缺省 = 会话 cwd，由调用方传入）
      ...(input.workspaceRoot !== undefined ? { workspaceRoot: input.workspaceRoot } : {}),
      // 项目身份（REQ-261005141830-7a3b FR-1）：有就写（从此"同一项目"比 id）；没有就不写该键（未归属）
      ...(input.projectId !== undefined && input.projectId.length > 0 ? { projectId: input.projectId } : {}),
      sourceSessionId: input.ownerSessionId ?? windowKey,
      status: 'draft',
      blocked: false,
      // 🆕 创建即武装 Dive：让 Dive 自动接管后续阶段推进。
      // FR-9（REQ-261003215944-9e04）：初值不再在这里手抄字段——由纯函数按 `arm` 事件给出，
      // 规则只有一份。**刻意仍在这同一次 create 里写**（不改成"先建后补一次 mutate"）：
      // 拆成两次写会让"需求已存在但没有 dive"成为一个可被观测到的中间态。
      dive: transitionDive(undefined, {
        event: 'arm',
        now: nowTs,
        actor: { kind: 'human' },
      }).next!,
      comments: [
        {
          id: deps.ids.comment(),
          body: (delegated
            ? [
              `[代理立项] agent 受本窗口直接人工指令创建（授权会话 ${windowKey}）`,
              `三问取值由 agent 给出，**未经弹框逐问确认**：${input.title}（${input.category}，提示词难度：${input.promptDifficulty ?? 'standard'}）`,
              ...(input.reason ? [`依据：${input.reason}`] : []),
              ...(input.ownerSessionId !== undefined && input.ownerSessionId !== windowKey
                ? [`归属窗口：${input.ownerSessionId}（不在本窗口名下，由它接手推进）`]
                : []),
            ]
            : [
              `[会话捕获] 用户经五问弹框确认立项（会话 ${windowKey}）`,
              `名称/分类/难度为用户确认值：${input.title}（${input.category}，提示词难度：${input.promptDifficulty ?? 'standard'}）`,
              ...(input.reason ? [`依据：${input.reason}`] : []),
            ])
            // FR-1：没有项目身份就**明说**，不留「看起来正常其实没归属」的记录（本仓最忌静默）
            .concat(input.projectId === undefined || input.projectId.length === 0
              ? ['未归属项目（按路径兜底）：本窗口不在任何项目的窗口列表里，故未写项目身份。']
              : [])
            .join('\n'),
          createdAt: nowTs,
          createdBy: actor,
        },
      ],
      version: 1,
      createdAt: nowTs,
      updatedAt: nowTs,
      createdBy: actor,
      updatedBy: actor,
    }
    // REQ-a33899：立项即记 draft 状态事件 + 写时快照——否则「立项」节点没有进入快照，
    // 该节点消耗永远算不出来（首段也应当可归因）。
    recordStatus(req, 'draft', nowTs, actor, undefined, captureSnapshot(deps, windowKey))
    // ① 建档（新端口的 create 只表达标量）
    await store.create({
      id: req.id,
      title: req.title,
      description: req.description,
      category: req.category,
      status: req.status,
      ...(req.promptDifficulty !== undefined ? { promptDifficulty: req.promptDifficulty } : {}),
      ...(req.docBasePath !== undefined ? { docBasePath: req.docBasePath } : {}),
      ...(req.workspaceRoot !== undefined ? { workspaceRoot: req.workspaceRoot } : {}),
      ...(req.projectId !== undefined ? { projectId: req.projectId } : {}),
      ...(req.sourceSessionId !== undefined ? { sourceSessionId: req.sourceSessionId } : {}),
    }, actor)
    // ② 把 create 表达不了的字段（dive 创建即武装 / 立项留痕 / 入口快照）补写进去
    const written = await mutateIfPresent(store, req.id, (r) => {
      Object.assign(r, req)
      return { changed: true }
    })
    if (written === undefined || !written.changed) {
      reject('reqboard_create 写入失败：台账状态异常', 'REQBOARD_STORE_INCONSISTENT')
    }
    return written.requirement
  }
}

/**
 * 需求简要投影（open_requirements 输出用；不泄漏 comments 等内部字段）。
 *
 * REQ-261001154450-b918 FR-6：额外给出 `closing_gap`——**归档了但没交归档材料**这种半截收尾
 * 此前在所有读面上都会显示成"完成"，8475 就是这样收的尾。闭环与否由 domain 单点推导
 * （status + artifacts），此处只投影，不落盘、不重复判定。缺省（已闭环或未归档）不写该键。
 */
export function projectRequirement(r: RequirementRecord): {
  id: string
  title: string
  status: string
  category: string
  closing_gap?: 'archive_missing'
} {
  const gap = closingGapOf(r)
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    category: r.category ?? '',
    ...(gap === undefined ? {} : { closing_gap: gap }),
  }
}


/**
 * 用例边界错误码映射（REQ-260927100007-b8ba FR-7）：domain 状态机抛的是领域码
 * （human_gate / system_gate），而 agent 侧工具的传输契约是 REQBOARD_HUMAN_GATE —— 在用例
 * 边界统一映射一次；工具壳与看板 HTTP 路由各自保持既有码不变（看板仍读 human_gate）。
 */
export function mapAgentError(err: unknown): never {
  if ((err as { code?: unknown } | null | undefined)?.code === 'human_gate') {
    const message = (err as Error).message ?? '该转移是人工闸门，仅人可操作'
    throw Object.assign(new Error(message + '（REQBOARD_HUMAN_GATE）'), { code: 'REQBOARD_HUMAN_GATE' })
  }
  throw err
}

/**
 * 确认门挂起期间的**同窗口停手守卫**（REQ-260927100007-b8ba FR-9；REQ-260927123256-196b FR-2/FR-4）。
 *
 * 缺省阻塞路径在**进入等待前**就登记 ticket（见 use-cases/AskConfirm.ts），守卫因此在整个等待期
 * 生效：写路径工具入口一律先过这里，命中挂起 → 代码级拒绝 REQBOARD_CONFIRM_PENDING，并给出
 * 真实可用的恢复路径（取回执 / 看板确认——2026-10-06 起删去「重新发起覆盖」：那条指向的动作
 * 就是再开一个框，与「同门只留一个在等的框」冲突，见 REQ-261006164732-6503 t9）。
 *
 * 判定单点在 `internal/pending-guard.ts` 的 `livePendingConfirm`：台账已落章（人走看板/证据通道
 * 作答）时放行——否则「人已确认但挂起记录未 settle」的陈旧记录会把窗口锁死。
 * （reqboard_status / reqboard_confirm_receipt 刻意不过此守卫——否则人无法解除挂起。）
 *
 * serves: FR-2 / FR-4（REQ-260927123256-196b t3）；判定口径见 pending-guard.livePendingConfirm。
 */
export async function assertNoPendingConfirm(deps: UseCaseDeps, windowKey: string): Promise<void> {
  const p = await livePendingConfirm(deps, windowKey)
  if (p === undefined) return
  // REQ-261005200052-ce40 FR-3：拒绝时带上**为什么**（需求状态 / 被卡的产物 / 何时失效）与**真实可用**的出路。
  // 台账读不到（罕见）→ 退回旧文案（facts 缺省），不伪造诊断。
  const req = await requirementStoreOf(deps).get(p.requirementId)
  const facts = req === undefined ? undefined : pendingConfirmFactsOf(req, p, deps.clock.now())
  reject(pendingConfirmRejectMessage(p, facts), 'REQBOARD_CONFIRM_PENDING')
}
