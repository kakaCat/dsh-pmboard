/**
 * Dive 回合驱动器的**纯数据契约与判定**（REQ-260926215013-1568 T-1 · serves: FR-1, FR-5, FR-7, FR-8, FR-10）。
 *
 * 为什么单独一个模块：这五条纪律（竞态栅栏 / 准入计数 / 终态上限 / 内容不变量 / 检查点前置）
 * 的判定必须能被独立单测，且 **application 层禁 @deepseek-ai/* 运行时 import**（层边界门禁）。
 * 本模块零 I/O、零框架依赖，只做「给定状态 → 布尔/数值」的纯计算。
 *
 * @module dsh-pmboard/application/dive/round-state
 */
import type { DiveRoundSource, RequirementDive, RequirementStatus } from '../../shared/protocol.js'
import { isDiveRoundSource } from '../../shared/protocol.js'
import { getStageConfig } from './stage-configs.js'

/** 预留的相位：queued（已入队）→ claimed（已被 step 认领）→ admitted（已进入 history）。单向。 */
export type RoundPhase = 'queued' | 'claimed' | 'admitted'

/**
 * 连续同因失败达此数 → 熔断停手（REQ-261004065652-5c1c FR-2）。
 *
 * 为什么是 3：实测死循环均值 23 回合/分（峰值 74）——**任何 >0 的重复都在烧额度**，
 * 所以取保守侧；抖动场景下 3 次退避足够自愈（30s/1m/2m）。
 */
export const FAILURE_BREAKER_THRESHOLD = 3

/** 退避基数与封顶（FR-2）。 */
export const FAILURE_BACKOFF_BASE_MS = 30_000
export const FAILURE_BACKOFF_MAX_MS = 10 * 60 * 1000

/** 失败退避账（**内存态**：不落盘——落盘会让它退化成"第二个台账"，重新依赖 I/O）。 */
export interface DriverFailure {
  /** 病因类别（复用 `upstream-failure.reasonClassOf` 的口径）。 */
  reasonClass: string
  /** 连续同因失败次数（原因类别变化即归零）。 */
  count: number
  /** 不早于该时刻才允许再起轮（毫秒时间戳）。 */
  nextAt: number
}

/**
 * 内存闭锁（**内存态**：存在即不起轮）。
 *
 * 为什么必须有它、而不能只靠台账 `driverHealth`：2026-10-03 的死循环里，
 * 台账**写对了**（18:03:52 就写了 `paused`），但驱动**读不到**（同步投影陈旧）。
 * 闭锁的全部价值就是「**与 I/O 无关的当拍判定**」——即使投影再出一次同样的缺陷，
 * 也不可能出现"没人推进却一直起轮"。
 */
export interface DriverLatch {
  reasonClass: string
  /** 人话原因（进日志/留痕；≤200 字符）。 */
  reason: string
  at: number
  /**
   * 本次停手的**台账写是否已成功**（写成功后由回调翻真）。
   *
   * 为什么需要它（反向演练②实测抓到的假解锁）：解锁判据里有一条"台账显式 healthy = 有人清过"，
   * 而**写盘失败**时台账里的 `driverHealth` 是**缺失**的——若把"缺失"当成"健康"，
   * 闭锁会立刻自己解开，fail-closed 就成了空话。`writable` 把"我们确认写过"与"没写成"分开。
   */
  writable: boolean
}

/** 退避窗口：`base × 2^(n-1)`，封顶 `FAILURE_BACKOFF_MAX_MS`。`n ≤ 1` 取基数。 */
export function backoffFor(count: number): number {
  const n = count <= 1 ? 0 : count - 1
  const span = FAILURE_BACKOFF_BASE_MS * Math.pow(2, Math.min(n, 20))
  return Math.min(span, FAILURE_BACKOFF_MAX_MS)
}

/**
 * 记一次失败：**同因累加、异因归零**（不同病因分开数，避免"抖动 + 额度"互相掩盖）。
 * 纯函数——时间由调用方注入，便于假时钟用例。
 */
export function recordFailure(prev: DriverFailure | undefined, reasonClass: string, now: number): DriverFailure {
  const count = prev !== undefined && prev.reasonClass === reasonClass ? prev.count + 1 : 1
  return { reasonClass, count, nextAt: now + backoffFor(count) }
}

/** 熔断是否已触发（`count ≥ 阈值`）。 */
export function breakerTripped(failure: DriverFailure | undefined): boolean {
  return failure !== undefined && failure.count >= FAILURE_BREAKER_THRESHOLD
}


/** 一次回合预留（对齐 dsh-goal-round-driver 的 attempt）。 */
export interface RoundAttempt {
  requirementId: string
  /** 预留时的需求 revision */
  revision: number
  /** 预留的回合号 = 预留时 roundsInStage + 1 */
  round: number
  /** 消息身份（user/message 事件据此认领） */
  messageId: string
  /** 模型可见内容（逐字比对，防旧/伪造消息混入） */
  content: unknown
  phase: RoundPhase
  /** 被 discard / aborted / cancel → 永不计数 */
  cancelled: boolean
  /** revision 失效 / 竞争让位 → 永不计数 */
  stale: boolean
}

/** 每 agent 一个驱动状态（进程内存态，不落盘）。 */
export interface DriverState {
  /** 精确活体句柄（agents.get(id) === state.agent 才算存活） */
  agent: unknown
  /** 至多一个在飞预留 */
  attempt?: RoundAttempt
  /** 有非本回合的入队输入 → 让位到下次空闲 */
  competingQueued: boolean
  /** 有耐久义务待兑现（排队前必须落盘） */
  needsCheckpoint: boolean
  /** 合并触发标志 */
  requested: boolean
  /** 串行驱动链（withoutInitiator） */
  run?: Promise<void>
  /** teardown 已关闭准入 */
  stopping: boolean
  /** 失败退避账（FR-2，内存态）：退避期内不起轮；同因达阈值 → 熔断。 */
  failure?: DriverFailure
  /** 内存闭锁（FR-3，内存态）：存在即不起轮，**先于一切台账判据**。 */
  latch?: DriverLatch
}

/** 逐字（结构）相等：只吃 JSON 值（消息 content 是 JSON）。 */
export function deepEqualJson(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => deepEqualJson(v, b[i]))
  }
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const ka = Object.keys(ao)
  const kb = Object.keys(bo)
  if (ka.length !== kb.length) return false
  return ka.every(k => Object.prototype.hasOwnProperty.call(bo, k) && deepEqualJson(ao[k], bo[k]))
}

/** 来源逐字段相等（requirementId / revision / round）。 */
export function sameRound(source: DiveRoundSource, attempt: RoundAttempt): boolean {
  return source.requirementId === attempt.requirementId
    && source.revision === attempt.revision
    && source.round === attempt.round
}

/**
 * 是否为本驱动器登记的回合消息（**仅此判据认领**）：
 * source 是合法 Dive 来源、字段与预留一致、内容与登记逐字一致。
 */
export function sameQueued(content: unknown, source: unknown, attempt: RoundAttempt): boolean {
  if (!isDiveRoundSource(source)) return false
  if (!sameRound(source, attempt)) return false
  return deepEqualJson(content, attempt.content)
}

/** 进入 step 前/后的完整栅栏（fail-closed）。任何一条不成立即不得放行。 */
/**
 * 驱动/准入判定所需的**最小形状**（B12 阶段①-a）。
 *
 * 为什么不用 `RequirementRecord`：判定只需要 `dive` 与 `advance.pausedReason` 这两个有界字段，
 * 而同步缝（`round-driver` 的 idle 拍）拿不到整条记录——它拿的是 `RequirementFacts` 窄投影。
 * 用结构类型收窄后**两种入参都满足**：整条记录（异步路径）与窄投影（同步路径）都能传，
 * 且判定逻辑仍只有这一份（FR-5 要求准入栅栏与驱动前置条件**同源判定**，不得各看一套）。
 */
export interface DrivableShape {
  readonly dive?: RequirementDive
  readonly advance?: { readonly pausedReason?: string }
}

/** 准入判定所需的最小形状（比 `DrivableShape` 多 id/version 的陈旧性比对）。 */
export interface ReservationShape extends DrivableShape {
  readonly id: string
  readonly version: number
}

export interface ReservationCheck {
  state: DriverState
  content: unknown
  source: DiveRoundSource
  req: ReservationShape | undefined
  /** 驱动所在插件 fiber 是否 active（对齐 Goal 的 ctx.fiber.state === 2） */
  fiberActive: boolean
  /** agents.get(req.sourceSessionId) === state.agent（精确活体） */
  agentLive: boolean
}

export function roundReservationValid(c: ReservationCheck): boolean {
  const { state, content, source, req } = c
  const a = state.attempt
  if (!c.fiberActive) return false
  if (state.stopping) return false
  if (!c.agentLive) return false
  if (a === undefined) return false
  if (a.phase !== 'claimed' || a.stale || a.cancelled) return false
  if (!sameQueued(content, source, a)) return false
  if (req === undefined) return false
  if (req.id !== source.requirementId || req.version !== source.revision) return false
  const dive = req.dive
  if (dive === undefined) return false
  // FR-5：与 isDrivableRequirement **同源判定**——准入栅栏与驱动前置条件不得各看一套字段
  // （修前两处都看 phase；引入 driverHealth 后若只改一处，就会出现"能驱动但准入拒绝"的缝）。
  if (!isDrivableRequirement(req)) return false
  return source.round === (dive.roundsInStage ?? 0) + 1
}

/**
 * 阶段上限的**内存快照来源**（REQ-261004103330-005f FR-2 / t6）。
 *
 * 为什么必须走"模块级快照 + 同步读"而不是每次去问端口：`roundLimitFor` 被 `round-driver` 在
 * **回合判定的热路径**上同步调用（判定 → `await checkpoint` → 起轮）。端口读设置要读盘、是异步的，
 * 一旦在这里 `await`，判定与排队之间就多出一个可被设置的窗口——本模块既有的竞态栅栏纪律会失守。
 *
 * 快照的三路刷新（装配在 `src/index.ts`）：
 *   ① 装配期灌初值；② 设置变更（PATCH 广播 → `subscribe`）时刷新；③ 设置文件被外部改动时按 mtime 轮询刷新。
 *
 * 结构类型而不是 import `ResolvedRunSettings`：本模块保持"零上层依赖"，
 * 单测可以直接喂最小对象（`{ stageMaxRounds: { implementing: { value: 5 } } }`）。
 */
export interface StageLimitSource {
  readonly stageMaxRounds: Readonly<Record<string, { readonly value: number } | undefined>>
}

let stageLimitSource: StageLimitSource | undefined

/** 装上限快照（传 `undefined` 即卸载）。幂等；装配期灌初值、之后由订阅/轮询刷新。 */
export function installStageLimitSnapshot(source: StageLimitSource | undefined): void {
  stageLimitSource = source
}

/**
 * 回合上限（权威来源 = 已安装的设置快照；未安装回落 `stage-configs` 的**默认值表**；未知阶段 10）。
 *
 * 两条不能省的兜底：
 *   · **未安装 → 与改造前逐字一致**（`tests/dive-round-state.test.ts` 锁着这条向后兼容）；
 *   · 快照里该阶段的值不是有限数 → 同样回落默认表。若不兜底，`roundsInStage >= NaN` 恒为 false，
 *     上限会**静默失效**（跑飞需求一路跑下去，正是这张卡要根治的事）。
 */
export function roundLimitFor(status: RequirementStatus | string): number {
  const fromSettings = stageLimitSource?.stageMaxRounds[status]?.value
  if (typeof fromSettings === 'number' && Number.isFinite(fromSettings)) return fromSettings
  return getStageConfig(status as RequirementStatus)?.maxRounds ?? 10
}

/** 回合消息正文（纯函数，供端口注入与测试固定；内容不变量据此逐字比对）。 */
export function renderDiveRoundText(input: { requirementId: string; round: number; status: string }): string {
  const header = '继续执行需求 ' + input.requirementId + '（Dive 模式自动续跑，第 ' + input.round + ' 回合）\n\n当前状态：' + input.status
  
  // 按阶段生成针对性指令
  let instruction = ''
  switch (input.status) {
    case 'brainstorming':
      instruction = '\n\n**本阶段任务：调研用户意图，写需求文档**' +
        '\n- 参考模板：docs/requirements/' + input.requirementId + '/requirement.md' +
        '\n- 写完后调 reqboard_submit(kind=requirement) 登记产物' +
        '\n- 然后调 reqboard_ask_confirm(target=artifact, kind=requirement) 请人确认' +
        // FR-8 / FR-10（REQ-261005105032-3b02）：讨论里说定的东西不许只留在会话里——逐条落账，
        // 否则实施与验收阶段看不到，只能口头再重申一遍（D-3 的根因）。
        '\n- 讨论里说定的补充/纠正/被否方案逐条落账到 requirement.md 的「讨论与裁定记录（D-x）」表' +
        '（编号、原话来源、裁定、影响 FR、判据五列齐；禁只留概括；疑问句与闲聊不入账）' +
        // FR-1 / FR-10：UI 需求的需求阶段必交原型；权威版本只认 INDEX，避免"两版并存、引用旧版"（D-6）。
        '\n- sides 含 frontend 时需求阶段必交原型：把权威原型落到 docs/requirements/' + input.requirementId + '/prototypes/，' +
        '在 prototypes/INDEX.md 标出唯一一条状态=authoritative（路径按需求目录相对书写，被取代的标 superseded），' +
        '再调 reqboard_submit(kind=prototype) 登记；确认需求文档前自查这两件事都做了'
      break
    case 'design':
      instruction = '\n\n**本阶段任务：写设计文档**' +
        '\n- 目录：docs/requirements/' + input.requirementId + '/design/' +
        '\n- 写完后调 reqboard_submit(kind=design) 登记' +
        '\n- 然后调 reqboard_ask_confirm(target=artifact, kind=design) 请人确认' +
        // FR-3 / FR-10：design/frontend.md 必须指向权威原型与页面内锚点，且不得指向 superseded 版本。
        '\n- 有原型的需求：design/frontend.md 的「原型页面」节指向 prototypes/INDEX.md 里的权威路径与 #FR-N 锚点' +
        '（不指向 superseded 版本；锚点引用单独记账，不计入 serves），并引用相关 D-x 裁定'
      break
    case 'decomposing':
      instruction = '\n\n**本阶段任务：写拆分计划**' +
        '\n- 路径：docs/requirements/' + input.requirementId + '/decomposition.md' +
        '\n- 写完后调 reqboard_submit(kind=plan) 提交' +
        '\n- 然后调 reqboard_ask_confirm(target=plan) 请人批准'
      break
    case 'implementing':
      instruction = '\n\n**本阶段任务：执行任务卡**' +
        '\n- 用 reqboard_status() 查看当前任务' +
        '\n- 按任务说明执行，完成后调 reqboard_task_move 推进状态' +
        // FR-6 / FR-9：开工前先看本卡「设计落点」的原型锚点与关联裁定——否则"只做这张卡"会变成
        // "不看原型就动手"，实施完与原型对不上（返工）。
        '\n- 本卡「设计落点」有原型锚点时：先按 prototypes/INDEX.md 的权威原型对照锚点区块（#FR-N）再动手；' +
        '本卡关联的 D-x 裁定逐条兑现（卡上的原型锚点与关联 D-x 经 reqboard_task_tree 可见）'
      break
    case 'accepting':
      instruction = '\n\n**本阶段任务：准备验收材料**' +
        '\n- 调 reqboard_submit(kind=verification) 提交验收材料' +
        '\n- 等待人工逐项验收'
      break
  }
  
  return header + instruction
}

/**
 * 是否「可起轮」（REQ-261001213924-1441 FR-5 起改用两套状态判定）。
 *
 * 判据：**人的意图**为 armed（只有人能改）且**运行时健康**非 paused（驱动侧写）。
 * phase 只在旧记录（无 driverHealth）时作读侧兼容——避免"phase=paused 终态锁死"的老语义复活。
 */
export function isDrivableRequirement(req: DrivableShape | undefined): boolean {
  const dive = req?.dive
  if (dive === undefined) return false
  if (dive.activation !== 'armed') return false
  // [实施链已暂停 => 不起轮] advance 因停滞/失败/人工把 pausedReason 写上（AdvanceChain.pauseRequirement）——
  // 不拦的话，Dive 会对一条已放弃自动推进的需求**无限起轮**（本轮实测的死循环）。人工「继续」会清空它（requirements.ts）。
  if (req?.advance?.pausedReason !== undefined) return false
  if (dive.driverHealth !== undefined) return dive.driverHealth.state !== 'paused'
  return dive.phase !== 'paused'
}

/**
 * 是否「因基础设施原因被误解除武装」（REQ-261001201200-8f8b FR-4）——可自动恢复。
 *
 * 为什么用 phase 当判别器而不是新增字段：**既有语义已经区分了两种 disarmed**——
 *   · 人主动 \`reqboard_clear_pause\` → activation=disarmed 且 **phase=idle**（"我要手动跑"）；
 *   · 回合上限/中止 → phase=paused（终态，需人解锁）；
 *   · 驱动失败/投递失败/检查点失败/agent 错误/teardown 遗留 → activation=disarmed 但 **phase 仍是 active**。
 * 只有最后一种该被自动恢复。本判据零 IO、不新增字段，故不需要台账迁移。
 */
export function isRecoverableDisarm(req: DrivableShape | undefined): boolean {
  return req !== undefined && req.dive?.activation === 'disarmed' && req.dive?.phase === 'active'
}

// ── 宿主对象的结构访问器（零框架依赖；防 application 反向 import adapters/框架） ──

export interface InboxLike {
  nextStep?: { id?: unknown }[]
  nextTurn?: { id?: unknown }[]
  prepend?: (target: string, message: unknown) => void
}

export function agentIdOf(agent: unknown): string | undefined {
  if (typeof agent !== 'object' || agent === null) return undefined
  const a = agent as { id?: unknown; session?: { id?: unknown } }
  if (typeof a.id === 'string' && a.id.length > 0) return a.id
  const sid = a.session?.id
  return typeof sid === 'string' && sid.length > 0 ? sid : undefined
}
export function agentStatusOf(agent: unknown): string | undefined {
  return typeof agent === 'object' && agent !== null ? (agent as { status?: string }).status : undefined
}
export function inboxOf(agent: unknown): InboxLike | undefined {
  return typeof agent === 'object' && agent !== null ? (agent as { inbox?: InboxLike }).inbox : undefined
}
export function messageIdOf(m: unknown): string | undefined {
  const id = (m as { id?: unknown } | undefined)?.id
  return typeof id === 'string' ? id : undefined
}
export function sourceOf(m: unknown): unknown { return (m as { source?: unknown } | undefined)?.source }
export function contentOf(m: unknown): unknown { return (m as { content?: unknown } | undefined)?.content }

