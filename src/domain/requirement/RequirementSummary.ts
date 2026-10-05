/**
 * 需求**摘要投影**（REQ-261002161439-277d · t1 / FR-1、FR-4）——看板首屏载荷的元素形状。
 *
 * ## 为什么要有"摘要"这个类型
 *
 * 现状 `GET /state` 把每条需求**整条**（评论 65KB / 验收材料 71KB / 产物 51KB…）都发给客户端，
 * 而卡片、泳道、列表实际只读十来个标量字段（实测：`views/board.ts` 读
 * `blocked/category/createdAt/id/sourceSessionId/status/title/updatedAt`）。
 * 摘要把"首屏要什么"与"详情要什么"分开：**摘要不含任何无上界的大字段**。
 *
 * ## 为什么不复用 `RequirementRecord`
 *
 * 两个类型**刻意不互相赋值**（`design/frontend.md`）：详情视图若被喂了摘要，
 * `req.comments.length` 这类访问会**编译报错**，而不是运行期拿到 `undefined`。
 * 剩下哪些字段缺口由编译器逐个点名，不靠人肉巡检——这是本仓"宁可编译报错也不要静默降级"
 * 的既有纪律（同 `application/ports.ts` 里去掉 `LedgerView.tasks` 的理由）。
 *
 * 设计依据：`design/data-model.md` §摘要投影 `RequirementSummary`。
 *
 * @module dsh-pmboard/domain/requirement/RequirementSummary
 */
import type {
  ArtifactKind,
  PromptDifficulty,
  RequirementCategory,
  RequirementDive,
  RequirementStatus,
  StageKey,
} from '../../shared/protocol.js'

/**
 * 推进告警的**摘要子集**。
 *
 * 为什么不是整个 `AdvanceState`：`advance.history` 是 append-only 且无上界（已外置到
 * `history.jsonl`），而卡片角标只关心"是否暂停、连续失败几次"。把 `history` 带进摘要
 * 等于让首屏载荷随运行时间无界增长——那正是本次要治的病。
 */
export interface AdvanceAlert {
  /** 上次暂停原因（fail / stagnation / manual）。 */
  readonly pausedReason?: string
  /** 连续失败计数（熔断判据的展示位）。 */
  readonly failureStreak?: number
}

/**
 * 摘要（首屏载荷元素）。
 *
 * 必填字段 = 卡片渲染与排序的硬需求；可选字段**缺失即不下发该键**（不补 `undefined`、
 * 更不补 0）——与 tokenUsage"缺失 ≠ 0"同口径。
 */
export interface RequirementSummary {
  readonly id: string
  readonly title: string
  readonly status: RequirementStatus
  readonly blocked: boolean
  readonly createdAt: number
  readonly updatedAt: number
  readonly version: number
  /** 评论条数（**计数**，不是评论本体；热记录里的计数字段）。 */
  readonly commentCount: number
  /** 产物登记条数（同上）。 */
  readonly artifactCount: number
  readonly category?: RequirementCategory
  readonly promptDifficulty?: PromptDifficulty
  readonly paused?: boolean
  readonly autoRun?: boolean
  readonly sourceSessionId?: string
  /**
   * 需求席位（REQ-261003215944-9e04 FR-2/FR-3）：**缺省 = 存量记录**（读端折算为单 owner）。
   * 摘要层带上它是为了授权判定能在摘要粒度上按席位取（此前只看 sourceSessionId 单值）。
   */
  readonly seats?: import('../../shared/protocol.js').WindowSeat[]
  readonly workspaceRoot?: string
  readonly docBasePath?: string
  readonly advanceAlert?: AdvanceAlert
  /**
   * 调度优先级（REQ-261004110201-f253 FR-4）：数值越大越先派发；缺省 = 视为 0。
   * 进摘要的理由：**排序要它**（`scanAndResume` 与看板列表都在服务端排序），而排序发生在
   * 摘要投影之后——不进摘要就得回读整条需求。
   */
  readonly priority?: number
  /**
   * 推进锁持有时刻（REQ-261004110201-f253 FR-4）：**在制判据**——有新鲜锁 = 真有 run 在跑。
   * 进摘要的理由同 priority：WIP 闸与看板"谁在跑"都要读它，而排序/判定发生在摘要投影之后；
   * 它是**有界标量**（一个时间戳），不违反"摘要不带无上界字段"。
   */
  readonly advanceLockAt?: number
}

/**
 * `summarize` 的入参形状：`RequirementRecord` 与 v10 热记录**都**是它的结构子类型。
 *
 * 关键点：大字段既可来自装配后的数组（`comments[]`），也可来自热记录里的计数
 * （`commentCount`）——两种来源都接受，**优先用显式计数**。这样 t1 不依赖 t2/t5 的
 * 类型扩展就能先落地，且适配器两种形态都能喂。
 */
export interface SummarizableRequirement {
  readonly id: string
  readonly title: string
  /**
   * 需求正文。**不属于看板摘要**（见 `RequirementFacts`），但投影函数需要能读到它——
   * 提示词缝的 `resolveStagePrompt` 用它推断难度（FR-16），故此处声明为可选。
   */
  readonly description?: string
  readonly status: RequirementStatus
  readonly blocked?: boolean
  readonly createdAt: number
  readonly updatedAt: number
  readonly version: number
  readonly category?: RequirementCategory
  readonly promptDifficulty?: PromptDifficulty
  readonly paused?: boolean
  readonly autoRun?: boolean
  readonly sourceSessionId?: string
  readonly workspaceRoot?: string
  /** 席位（REQ-261003215944-9e04 FR-2）：摘要层也要能按席位取，缺省 = 存量单 owner。 */
  readonly seats?: import('../../shared/protocol.js').WindowSeat[]
  readonly docBasePath?: string
  /** 调度优先级（FR-4）：缺省即不下发该键（读侧视作 0）。 */
  readonly priority?: number
  /** 装配后的评论数组（v10 热记录里没有它，只有 `commentCount`）。 */
  readonly comments?: readonly unknown[]
  /** 热记录里的评论计数（优先于数组长度）。 */
  readonly commentCount?: number
  /**
   * 产物数组。**故意保持宽松类型**：`summarize` 只用它的长度（计数），
   * 而测试夹具常传 `{}` / `{ kind: 'design' }` 这类只关心计数的值（`domain-summary.test.ts`）。
   * 真正要读产物字段的是 `factsOf`——它在那里**逐条校验**，结构不全的条目**丢弃**（见下），
   * 既不伪造字段、也不把宽松入参的锅甩给消费者。
   */
  readonly artifacts?: readonly unknown[]
  readonly artifactCount?: number
  readonly advance?: { readonly pausedReason?: string; readonly failureStreak?: number; readonly lockAt?: number }
  /** 驱动判定用的有界子集（`RequirementFacts.dive` 的来源）。 */
  readonly dive?: RequirementDive
  /**
   * token 累计（REQ-261004065652-5c1c FR-11）：预算闸要读它，故投影它是"必要字段"。
   * 刻意只声明 `totals` 的三枚标量——`byStage` 是按阶段的对象，不该进同步缝。
   */
  readonly tokenUsage?: {
    readonly totals?: {
      readonly uncachedInputTokens?: number
      readonly outputTokens?: number
      readonly cacheReadTokens?: number
    }
  }
}

/** 摘要的键集（**单一事实源**：测试断言"大字段不在摘要里"、适配器断言出口形状都用它）。 */
export const SUMMARY_KEYS: readonly string[] = [
  'id', 'title', 'status', 'blocked', 'createdAt', 'updatedAt', 'version',
  'commentCount', 'artifactCount',
  'category', 'promptDifficulty', 'paused', 'autoRun',
  'sourceSessionId', 'workspaceRoot', 'docBasePath', 'advanceAlert', 'priority', 'advanceLockAt',
]

/**
 * **大字段键集**：这些字段一律不进摘要（也不进热记录文件，见 `design/data-model.md`）。
 *
 * 列在这里而不是写在适配器里，是为了让"哪些字段算大"只有一个答案：适配器用它决定
 * 落哪个文件，测试用它断言摘要没带它们。
 */
export const BIG_FIELD_KEYS: readonly string[] = [
  'comments',
  'statusHistory',
  'artifacts',
  'plan',
  'verification',
  'archive',
]

/** 该键是否属于"不进摘要/热记录"的大字段。 */
export function isBigFieldKey(key: string): boolean {
  return BIG_FIELD_KEYS.includes(key)
}

/**
 * 推进告警投影：两个字段**都没有**时返回 `undefined`（而不是 `{}`）。
 *
 * 返回空对象会让看板把"没有推进状态"渲染成"有告警对象但为空"，也会让
 * `'advanceAlert' in summary` 这类判据失真。缺失就是缺失。
 */
export function advanceAlertOf(
  advance: { readonly pausedReason?: string; readonly failureStreak?: number } | undefined,
): AdvanceAlert | undefined {
  if (advance === undefined) return undefined
  const alert: { pausedReason?: string; failureStreak?: number } = {}
  if (advance.pausedReason !== undefined) alert.pausedReason = advance.pausedReason
  if (advance.failureStreak !== undefined) alert.failureStreak = advance.failureStreak
  return Object.keys(alert).length === 0 ? undefined : alert
}

/** 计数取值：显式计数优先（热记录），否则退回数组长度（装配后的记录）。 */
function countOf(explicit: number | undefined, list: readonly unknown[] | undefined): number {
  if (explicit !== undefined) return explicit
  return list === undefined ? 0 : list.length
}

/**
 * 投影：完整需求 → 摘要。
 *
 * 可选字段用条件展开，**缺失即无该键**（`'paused' in summary === false`），而不是 `paused: undefined`——
 * 后者在 JSON 序列化时消失、在对象比较时却存在，是"两处口径"的温床。
 */
export function summarize(record: SummarizableRequirement): RequirementSummary {
  const alert = advanceAlertOf(record.advance)
  // FR-4：在制判据随摘要下发（有界标量；缺省即不发键）
  const lockAt = (record.advance as { readonly lockAt?: number } | undefined)?.lockAt
  return {
    id: record.id,
    title: record.title,
    status: record.status,
    blocked: record.blocked === true,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    version: record.version,
    commentCount: countOf(record.commentCount, record.comments),
    artifactCount: countOf(record.artifactCount, record.artifacts),
    ...(record.category !== undefined ? { category: record.category } : {}),
    ...(record.promptDifficulty !== undefined ? { promptDifficulty: record.promptDifficulty } : {}),
    ...(record.paused !== undefined ? { paused: record.paused } : {}),
    ...(record.autoRun !== undefined ? { autoRun: record.autoRun } : {}),
    ...(record.sourceSessionId !== undefined ? { sourceSessionId: record.sourceSessionId } : {}),
    ...(record.seats !== undefined ? { seats: record.seats } : {}),
    ...(record.workspaceRoot !== undefined ? { workspaceRoot: record.workspaceRoot } : {}),
    ...(record.docBasePath !== undefined ? { docBasePath: record.docBasePath } : {}),
    ...(record.priority !== undefined ? { priority: record.priority } : {}),
    ...(lockAt !== undefined ? { advanceLockAt: lockAt } : {}),
    ...(alert !== undefined ? { advanceAlert: alert } : {}),
  }
}

/**
 * **同步缝专用窄投影**（B12 阶段①-a）。
 *
 * ## 为什么不复用 `RequirementSummary`
 *
 * 同步的那几条缝（`systemPrompt.section` 的 `text` 回调、dive 驱动判定、越界提示注入）
 * 要的字段比看板摘要多：
 *   · `description`（`boundSectionText` 交给 `resolveStagePrompt` 推断难度，FR-16）；
 *   · `dive` / `advance.pausedReason`（`isDrivableRequirement` / `isRecoverableDisarm` 判"该不该驱动"）；
 *   · `artifacts` 的**事实子集**（越界提示要看 requirement 产物是否已确认）。
 *
 * 而 `RequirementSummary` 是**看板载荷**的投影，刻意不带任何无上界的大字段
 * （本文件头注：摘要不含大字段；`design/architecture.md` §热冷分层要求首屏载荷下降 ≥10×）。
 * 把正文与产物塞进看板摘要 = 每次看板请求都带上它们，方向正好相反。
 *
 * ## 为什么是**一条**投影而不是三条
 *
 * 三条（提示词 / 驱动 / 门禁各一条）会让每个实现维护三份缓存、三份新鲜度口径——
 * 本仓"两份真相必然漂移"的教训。故合并成一条：**字段都是有界标量或小数组**
 * （`comments` / `history` / 产物正文一律不带），一次缓存、一份新鲜度。
 *
 * 由 `RequirementStore.peekFacts()` 同步提供（允许略旧，理由见端口注释）。
 */
export interface RequirementFacts {
  readonly id: string
  readonly title: string
  /** 缺省空串（与 `RequirementRecord.description` 的必填口径对齐）。 */
  readonly description: string
  readonly status: RequirementStatus
  readonly updatedAt: number
  readonly version: number
  readonly category?: RequirementCategory
  readonly sourceSessionId?: string
  /** 自动推进开关（round-driver 的"实施阶段中断自动恢复"要读它）。 */
  readonly autoRun?: boolean
  /** 人显式暂停位（与 `advance.pausedReason` 分属"人意图/运行时告警"两套，见 protocol 注释）。 */
  readonly paused?: boolean
  /** 驱动判定读的有界子集（`dive` 本身只有几个标量 + 一个小的 driverHealth）。 */
  readonly dive?: RequirementDive
  /** 推进告警：**只取 `pausedReason`**——`advance.history` 无上界，刻意不带。 */
  readonly advance?: { readonly pausedReason?: string }
  /** 产物**事实**（每需求几条，不含正文）；无产物时为空数组。 */
  readonly artifacts: readonly FactArtifact[]
  /**
   * token 累计的**有界投影**（REQ-261004065652-5c1c FR-11 · 预算闸读它）。
   *
   * 为什么只放三枚标量而不是整条 `RequirementTokenUsage`：同步缝的载荷必须有界——
   * `byStage` 是按阶段的对象、会随阶段增加而长大（同 `advance` 只投影 `pausedReason` 的既有口径）。
   * 缺省 = 该需求从未跑过（预算闸按"无消耗"计，**不伪造成 0 桶**：缺失 ≠ 0 是本仓一贯口径）。
   */
  readonly tokenUsage?: {
    readonly uncachedInputTokens: number
    readonly outputTokens: number
    readonly cacheReadTokens: number
  }
}

/** 产物的有界事实子集（确认门判定只读这几个字段）。 */
export interface FactArtifact {
  readonly stage: StageKey
  readonly kind: ArtifactKind
  readonly path: string
  readonly registeredAt: number
  readonly confirmedAt?: number
}

/**
 * token 累计 → 有界投影（REQ-261004065652-5c1c FR-11）。
 *
 * 缺省语义（与全仓"缺失 ≠ 0"一致）：`tokenUsage` 缺失、或 `totals` 缺失 → `undefined`
 * （读作"从未跑过"），**不**补一个全零桶——补零会让"没跑过"与"跑了但零消耗"同形。
 */
function tokenUsageOf(record: SummarizableRequirement): RequirementFacts['tokenUsage'] {
  const totals = record.tokenUsage?.totals
  if (totals === undefined) return undefined
  return {
    uncachedInputTokens: totals.uncachedInputTokens ?? 0,
    outputTokens: totals.outputTokens ?? 0,
    cacheReadTokens: totals.cacheReadTokens ?? 0,
  }
}

/** 投影：完整需求 → 同步缝窄投影（可选字段缺失即无该键，同 `summarize` 的口径）。 */
export function factsOf(record: SummarizableRequirement): RequirementFacts {
  return {
    id: record.id,
    title: record.title,
    description: record.description ?? '',
    status: record.status,
    updatedAt: record.updatedAt,
    version: record.version,
    ...(record.category !== undefined ? { category: record.category } : {}),
    ...(record.sourceSessionId !== undefined ? { sourceSessionId: record.sourceSessionId } : {}),
    ...(record.autoRun !== undefined ? { autoRun: record.autoRun } : {}),
    ...(record.paused !== undefined ? { paused: record.paused } : {}),
    ...(record.dive !== undefined ? { dive: record.dive } : {}),
    // `advance` 只投影 pauseReason：带整条会连 history（append-only、无上界）一起进同步口。
    ...(record.advance !== undefined ? { advance: { ...(record.advance.pausedReason !== undefined ? { pausedReason: record.advance.pausedReason } : {}) } } : {}),
    ...(tokenUsageOf(record) !== undefined ? { tokenUsage: tokenUsageOf(record)! } : {}),
    artifacts: (record.artifacts ?? []).flatMap((raw) => {
      // 入参是宽松类型（见 `SummarizableRequirement.artifacts`）：**结构不全的条目丢弃**，
      // 不补默认值（补 `path: ''` 之类会让消费者把"没有"当成"有"）。
      const a = raw as Partial<FactArtifact>
      if (a.stage === undefined || a.kind === undefined || a.path === undefined) return []
      if (a.registeredAt === undefined) return []
      return [{
        stage: a.stage,
        kind: a.kind,
        path: a.path,
        registeredAt: a.registeredAt,
        ...(a.confirmedAt !== undefined ? { confirmedAt: a.confirmedAt } : {}),
      }]
    }),
  }
}
