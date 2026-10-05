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
import { questionCardFor } from '../../domain/gate/GateCatalog.js'
import { checkDoneEvidence, findRecentAgentDoneTask, doneThrottleRemainingMs } from '../../domain/workflow/DoneEvidenceSpec.js'
import { closingGapOf } from '../../domain/status/Predicates.js'
import { artifactNotifyText } from './artifact-gates.js'
// 子卡凭证走「汇报兜底」时的结构化留痕通道（2026-10-03 子卡毒状态修复）：
// 与 index.ts 的启动留痕同一条文件化诊断面，保证"靠汇报过的卡"事后可追溯。
import { captureDiag } from './diag-log.js'
// REQ-260927123256-196b FR-2/FR-4：挂起判定单点（未作答 且 台账未落章才拦）——守卫与回执共用。
import { livePendingConfirm, pendingConfirmRejectMessage } from './pending-guard.js'
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
   * 任务存储端口。类型用 `unknown` 而**不是** `{ repo?: unknown }`：后者是全可选属性的
   * **弱类型**，TS 会对没有 `repo` 的 `TaskStore` 报 TS2559「no properties in common」。
   * 这里本就是鸭子探测（内部再断言 `.repo.setWorkspaceRoot`），`unknown` 更贴合语义。
   */
  taskStore?: unknown
  /**
   * 知识层自举通知口（REQ-261004174324-4195 t4）。可选：`UseCaseDeps` 天然满足本形状，
   * 未装配时不做任何事（老行为）。
   */
  knowledgeBootstrap?: { ensure(root?: string): void }
}

/** 同一根同时校正 docs 与 queueRepo（queue.json 与 docs 产物必须同根）。 */
function applyWorkspaceRoot(deps: WorkspaceRootTargets, root: string): void {
  const docs = deps.docs as { setWorkspaceRoot?: (root: string) => void }
  if (typeof docs.setWorkspaceRoot === 'function') docs.setWorkspaceRoot(root)
  const taskStore = deps.taskStore as { repo?: unknown } | undefined
  const queueRepo = taskStore?.repo as { setWorkspaceRoot?: (root: string) => void } | undefined
  if (queueRepo !== undefined && typeof queueRepo.setWorkspaceRoot === 'function') {
    queueRepo.setWorkspaceRoot(root)
  }
  // REQ-261004174324-4195 t4：根校正完成即通知自举（即发即忘；缺层才动手，已有则零写入）。
  deps.knowledgeBootstrap?.ensure(root)
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
export function applyRequirementWorkspaceRoot(deps: WorkspaceRootTargets, requirement: { workspaceRoot?: string } | undefined): void {
  const root = requirement?.workspaceRoot
  if (typeof root !== 'string' || root.length === 0) return
  applyWorkspaceRoot(deps, root)
}

/**
 * 写侧入口（REQ-260929210741-30ae FR-6 / t5）——保留原名与形参以兼容既有调用点，
 * 内部**委托** `applyRequirementWorkspaceRoot`，使读写两侧只有一处校正实现。
 *
 * `exec` 形参已不再参与判定：校正动作**只由需求级值决定**（`resolveWorkspaceRoot` 的优先级链里，
 * 需求无 `workspaceRoot` 时回落到会话 cwd，而原实现的守卫在那种情况下本就不做任何校正）。
 * 故改名为 `_exec` 仅表「有意不用」，行为与改造前**逐字一致**。
 */
export function syncWorkspaceRootForRequirement(deps: UseCaseDeps, _exec: unknown, requirement: { workspaceRoot?: string } | undefined): void {
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
 * 路径**形状**归一（纯字符串，零 IO）：反斜杠 → 正斜杠、折叠重复斜杠、去尾斜杠。
 * 保留根 `/` 与 Windows 盘符形态；不做 realpath——那是解算器的事（见下）。
 */
export function normalizeProjectRoot(p: string): string {
  const q = p.replace(/\\/g, '/').replace(/\/{2,}/g, '/')
  const trimmed = q.length > 1 ? q.replace(/\/+$/, '') : q
  return trimmed
}

/**
 * 同项目判定：先形状归一，若给了 `realpath` 解算器再各自解析后比较（软链等价）。
 *
 * **为什么把 realpath 做成可注入参数而不是直接 `import { realpathSync } from 'node:fs'`**：
 * 本仓 `tests/layer-boundary.test.ts` 规定 `application/` 不得 import `node:`（一切 I/O 走端口）。
 * 纯函数里直接引 fs 会新增一条越界；故由调用方（适配器 / 测试）注入解算器，
 * 不注入时退化为形状比较——仍然满足「尾斜杠不得判为错配」这条硬要求。
 */
export function sameProjectRoot(a: string, b: string, realpath?: (p: string) => string): boolean {
  const na = normalizeProjectRoot(a)
  const nb = normalizeProjectRoot(b)
  if (na === nb) return true
  if (realpath === undefined) return false
  const ra = safeRealpath(realpath, na)
  const rb = safeRealpath(realpath, nb)
  return ra === rb
}

/** 解算器可能抛（路径不存在等）——解析失败时退回原值，绝不让比较动作抛出。 */
function safeRealpath(realpath: (p: string) => string, p: string): string {
  try {
    return normalizeProjectRoot(realpath(p))
  } catch {
    return p
  }
}

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
export function partitionByProject<T extends { workspaceRoot?: string }>(
  records: readonly T[],
  projectRoot: string,
  fallback: string,
  realpath?: (p: string) => string,
): ProjectPartition<T> {
  const mine: T[] = []
  const others: T[] = []
  const unattributed: T[] = []
  for (const r of records) {
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

/**
 * **写盘前守卫**（REQ-261001203710-0fbf t3 / FR-2）：核验「即将写入的根」确实等于「这条记录声明的根」，
 * 不一致就**拒绝落盘**（给两个绝对路径），绝不静默写别处。
 *
 * 为什么**只核验、不代为重定向**（设计取舍，实测教训）：我最初实现成「先按记录声明的根校正、再核验」，
 * 结果在一次测试里把本该写到临时目录的文件**重定向进了真实仓库**——因为那条记录声明的根本身是错的
 * （capture 在没有会话 cwd 时回落 `process.cwd()`）。**拿一个可能算错的声明去搬动写入，会把错误放大**。
 * 读侧可以校正（最坏是读空、可重试），**写侧只许拒绝**：拒绝之后人能看到两个路径并自己决定。
 *
 * 三条边界（都不误伤）：
 *   - 记录没声明 `workspaceRoot` → 无「错配」可言，返回 undefined（调用方按其兜底根写并**标注**）；
 *   - 读不回根（端口没有 `workspaceRoot()` 探针，如无根的内存替身）→ 返回 undefined：
 *     无法核验就不谎报成功，也不据此误拒；
 *   - 任一侧不是绝对路径（`'.'` 等相对写法）→ 无法在 application 层解析成同一路径 → 不判（见 isAbsoluteRoot）；
 *   - 两侧都是绝对路径且不同 → 抛 `PROJECT_ROOT_MISMATCH`。
 *
 * @returns 核验通过时的生效根（已形状归一）；无法核验时 undefined
 */
export function ensureWritableProjectRoot(
  deps: WorkspaceRootTargets,
  record: { id?: string; workspaceRoot?: string } | undefined,
): string | undefined {
  const declared = record?.workspaceRoot
  if (typeof declared !== 'string' || declared.length === 0) return undefined

  // 读得回才核验（读不回 = 无从判断，不谎报也不误拒）
  const probe = (deps.docs as { workspaceRoot?: () => unknown }).workspaceRoot
  if (typeof probe !== 'function') return undefined
  const effective = probe.call(deps.docs)
  if (typeof effective !== 'string' || effective.length === 0) return undefined

  const want = normalizeProjectRoot(declared)
  const got = normalizeProjectRoot(effective)
  // 只在**两边都是绝对路径**时才判：相对写法与绝对路径可能指同一目录，此处解析不了（不许 import node:path）
  if (!isAbsoluteRoot(want) || !isAbsoluteRoot(got)) return got
  if (!sameProjectRoot(want, got)) {
    throw Object.assign(
      new Error(
        '写盘被拒：即将写入的项目根与记录声明的项目根不一致（' + PROJECT_ROOT_MISMATCH + '）——'
        + '记录声明的根=' + want + '；实际会写的根=' + got
        + '。修复：核对该需求的 workspaceRoot 与调用上下文传入的根，不要让它落到别的项目里。',
      ),
      { code: PROJECT_ROOT_MISMATCH },
    )
  }
  return got
}

/**
 * **按需求 id 核验写盘根**（REQ-261001203710-0fbf t7）：给「知道需求是谁、手里却没有记录」的共享写入器用。
 *
 * 为什么要有它：守卫若只接在 3 个调用点，改造新增的写盘点（完工记录 / 验收文档 / 接收标记 / 链上追加 /
 * 十处 RTM…）就全是裸的。这些写入器**都拿得到需求 id**，按 id 取记录即可——判定下沉后一处生效。
 *
 * 三条不误判：
 *   · reqId 为空 → 无从核验，返回 undefined；
 *   · 台账读不到 / 端口缺失 → 无从核验，返回 undefined（不据此误拒）；
 *   · **观测到错配 → 原样抛** PROJECT_ROOT_MISMATCH——这是本函数唯一的「响亮」出口，调用方不得吞掉。
 */
export async function assertWritableRequirementProject(
  deps: UseCaseDeps,
  reqId: string | undefined,
): Promise<string | undefined> {
  if (typeof reqId !== 'string' || reqId.length === 0) return undefined
  let rec: { id?: string; workspaceRoot?: string } | undefined
  try {
    rec = await requirementStoreOf(deps).get(reqId)
  } catch {
    return undefined
  }
  if (rec === undefined) return undefined
  return ensureWritableProjectRoot(deps, rec)
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
  const actor = { kind: 'human' } as const
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
          body: [
            `[会话捕获] 用户经五问弹框确认立项（会话 ${windowKey}）`,
            `名称/分类/难度为用户确认值：${input.title}（${input.category}，提示词难度：${input.promptDifficulty ?? 'standard'}）`,
            ...(input.reason ? [`依据：${input.reason}`] : []),
          ].join('\n'),
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
 * 三条恢复路径（取回执 / 看板确认 / 重新发起覆盖）。
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
  reject(pendingConfirmRejectMessage(p), 'REQBOARD_CONFIRM_PENDING')
}
