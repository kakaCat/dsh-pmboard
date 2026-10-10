/**
 * goal 域的**纯类型**：client-safe（不 import 任何宿主包/上层包），
 * 与宿主 `@deepseek-ai/dsh-goal/src/types.ts` 对齐（本包是它的 pm 自实现）。
 *
 * 【对齐口径】宿主 goal 的类型清单 → 本包映射：
 *   GoalId/GoalRef          → TaskGoalId/GoalRef
 *   CreateGoalRequest       → CreateTaskGoalRequest
 *   GoalPhase               → GoalPhase（同名同值）
 *   GoalSnapshot            → TaskGoal（L2）/ StageGoal（L1）
 * 差异：宿主是"一会话一 goal"，pm 是"一卡一 goal + 一阶段一达成位"，故多出 StageGoal。
 *
 * 客户端命名空间投影见 `./client.js`（零内容重复）。
 *
 * @module dsh-pmboard/goal/types
 */

/** goal 相位（与宿主同名同值：active/paused/blocked/complete）。 */
export type GoalPhase = 'active' | 'paused' | 'blocked' | 'complete'

/** 目标身份（跨修订稳定；形态 `goal:<taskId>`）。 */
export type TaskGoalId = string

/** 一次修订的 CAS 身份（对齐宿主 GoalRef）。 */
export interface GoalRef {
  readonly id: TaskGoalId
  readonly revision: number
}

/**
 * L2 任务目标（宿主 `GoalSnapshot` 的 pm 对应物）：挂在一张任务卡上。
 *
 * 判据复用任务卡的 `acceptance`（D-1 裁定）：`objective` 是它的陈述面。
 * **不含回合计数**：唯一权威 = `dive.roundsInStage`（2026-10-10 收敛裁定）。
 */
export interface TaskGoal {
  readonly id: TaskGoalId
  readonly taskId: string
  /** 人话陈述（= 卡片 acceptance 的陈述面）。 */
  readonly objective: string
  readonly phase: GoalPhase
  /** **只在 `blocked` 时出现**（对齐宿主：present exactly while phase is blocked）。 */
  readonly blockedReason?: GoalBlockReason
  /** 自动续跑回合的**上限**（对齐宿主 `maxGoalRounds`）；缺省 = 调用方配置。 */
  readonly maxGoalRounds?: number
  /** 创建/最近修订时刻（对齐宿主 GoalView 的时间戳；由调用方注入时钟）。 */
  readonly createdAt?: number
  readonly updatedAt?: number
  /** 乐观锁（每次有效变更 +1；CAS 身份）。 */
  readonly revision: number
}

/**
 * 进程内续跑许可（对齐宿主 `GoalActivation`）。
 *
 * 【pm 的真相在哪】`dive.activation`（core）——只有人能改、有完整纪律与测试。
 * 本包只用它做**派生视图**（`GoalView.activation`），**不另存一份**。
 */
export type GoalActivation = 'armed' | 'disarmed'

/**
 * 目标的**聚合视图**（对齐宿主 `GoalView`：快照 + 派生计数 + 时间戳 + 进程内许可）。
 *
 * `roundsStarted` / `activation` 是**派生只读**：
 *   · 回合计数唯一权威 = core 的 `dive.roundsInStage`（2026-10-10 收敛裁定）；
 *   · 许可唯一权威 = core 的 `dive.activation`。
 * 这样形态对齐宿主，**真相仍单一**（不新增第二份存储）。
 */
export interface GoalView {
  readonly goal: TaskGoal
  /** 已准入回合数（派生自 `dive.roundsInStage`）。 */
  readonly roundsStarted: number
  /** 进程内续跑许可（派生自 `dive.activation`）。 */
  readonly activation: GoalActivation
}

/**
 * 阻塞原因（对齐宿主 `GoalBlockReason`：**结构化**，不是自由文本）。
 *
 * 为什么必须结构化：人靠 `code` 判断"该找谁"（额度 / 鉴权 / 等人裁 / 等上游），
 * 自由文本只能靠人读；`message` 才是给人看的那句。
 */
export interface GoalBlockReason {
  /** 稳定的 lower-kebab-case 分类（由阻塞策略选）。 */
  readonly code: string
  /** 非空的人话解释。 */
  readonly message: string
}

/** 目标身份跨修订稳定 + CAS 令牌（对齐宿主 GoalRef）。 */
export interface GoalRefWithTask extends GoalRef {
  readonly taskId: string
}

/** 建目标请求（对齐宿主 CreateGoalRequest；objective 缺省由调用方取卡片 acceptance）。 */
export interface CreateTaskGoalRequest {
  readonly taskId: string
  readonly objective: string
  readonly maxGoalRounds?: number
}

/** 改目标请求（对齐宿主 EditGoalRequest：至少要给一项）。 */
export interface EditTaskGoalRequest {
  readonly objective?: string
  readonly maxGoalRounds?: number
}

/** 建目标回执（对齐宿主 CreateGoalResult）。 */
export interface CreateTaskGoalResult {
  readonly ref: GoalRef
}

/** 一次达成位的读投影（进 core 的 RequirementFacts 有界计数）。 */
export interface StageGoalProgress {
  readonly total: number
  readonly done: number
}

/**
 * L1 阶段目标：挂在需求台账 `goals[]`，每主阶段一条。
 * 两态**达成位**（不是状态机）：阶段推进仍由 core 的状态机 + 人工门管。
 */
export interface StageGoal {
  /**
   * 阶段键。**刻意用 `string`**：枚举定义权在 core（`RequirementStatus`），
   * pm-goal 不反向依赖 core——这是本包零依赖、被 core 引用的前提。
   */
  readonly stage: string
  readonly statement: string
  readonly doneCriteria: readonly string[]
  /** 达成位：pending → done（D-4：agent 提议 + 人工门落章，agent 不得自写 done）。 */
  readonly state: 'pending' | 'done'
}
