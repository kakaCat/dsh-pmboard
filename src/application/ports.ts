/**
 * application 端口（REQ-47939a t1）——用例依赖的抽象，签名对应 design/domain-model.md §5。
 *
 * 为什么要有端口层：现在 20 处 \`store.mutate\` 直接写在工具壳里，测一条领域规则要搭真
 * store；端口化之后用例测试可以用内存实现（t6 起），I/O 只在 adapters 落地（t5）。
 *
 * 依赖方向（design/architecture.md §2）：application 只依赖 domain 与 shared 的**类型**。
 * 本文件故意只 import type（编译期擦除），不在运行时把 shared 拉进用例。
 *
 * 本任务（t1）只立接口，不提供实现——实现由 t5 落地。
 */

import type {
  ActorRef,
  AdvanceRecord,
  ArtifactKind,
  CommentRecord,
  PendingConfirmation,
  PendingConfirmationOutcome,
  PromptDifficulty,
  ReqboardLedger,
  RequirementCategory,
  RequirementRecord,
  RequirementStatus,
  StatusEvent,
  TaskRecord,
  TriageRecord,
  TokenSnapshot,
  SessionLineageEntry,
  ContextPressureSnapshot,
  // REQ-261007100513-6749 t1：本段新增端口引用的契约类型（I-2 投递结果 / FR-6 预算运行态）。
  NoticeDeliveryResult,
  SubtaskBudgetState,
  VolatileNoticeKind,
} from '../shared/protocol.js'
import type { ConfirmContext, GateId } from '../domain/gate/GateSpec.js'
import type {
  KbArtifact,
  KbIndexRow,
  KbIssue,
  KbKind,
  KbOverflow,
} from '../domain/knowledge/types.js'
import type { QueueFile, QueueTask } from '../domain/queue/QueueTypes.js'
// REQ-261004103330-005f FR-1/FR-6/FR-14：运行设置与系统记录的**类型**从本层定义处 import
// （类型只做编译期擦除，不把 I/O 拉进 application——两个 settings 模块都是纯函数）。
import type {
  RunSettingsFileV1,
  RunSettingsPatch,
  ResolvedRunSettings,
} from './settings/resolve-settings.js'
import type {
  CompatResult,
  PluginStamp,
  StorePaths,
  StoresSnapshot,
  SystemEvent,
  SystemRecordV1,
} from './settings/events.js'
import type { RequirementFacts, RequirementSummary } from '../domain/requirement/RequirementSummary.js'
import type { ChainRunSummary } from './gate/GatePostChain.js'
// 交接水位三档的类型单一源在判据模块（本文件只**引用类型**，不在运行时把它拉进用例）。
import type { HandoffThresholds } from './internal/handoff-policy.js'
import type { SkillFileFingerprint } from './internal/skill-manifest.js'

/**
 * 只读台账视图（用例读路径的输入）。
 *
 * REQ-260927202051-f6df t6：`tasks` 已**移除**（台账 v9 不再持有任务卡）。
 * 需要任务请用 `TaskStore`（`taskStore.listByRequirement` / `get` / `listAll`）。
 * 这里**故意不留** `tasks` 字段：留着它会让读方编译通过却永远读到空数组——
 * "看板静默空白"正是本需求要根治的最坏结果，宁可让类型检查当场报错。
 */
export interface LedgerView {
  readonly schemaVersion: number
  readonly revision: number
  readonly requirements: readonly RequirementRecord[]
  readonly triages: readonly TriageRecord[]
}

/** 可写台账（仅在 mutate 回调内可见；写操作必须经 旧单册端口（已删除）.mutate 单点）。 */
export type MutableLedger = ReqboardLedger

/**
 * 一次 mutate 的变更集：只有这两个键。
 *
 * t6：`tasks` 通道**移除**——任务变更不再经台账通知，改由 `TaskStore.subscribe` 广播。
 */
export interface LedgerChange {
  requirements?: readonly RequirementRecord[]
  triages?: readonly TriageRecord[]
}

/**
 * 一次**单册台账** mutate 的结果。
 *
 * REQ-261002161439-277d t2：原名为 `MutateResult`，为把该名字让给分片存储端口
 * （`RequirementStore.mutate`，形状完全不同：返回单条需求而非变更集）而改名。
 * 本类型随 `旧单册端口（已删除）` 一起在 t8（端口切换）删除。
 */
export interface LedgerMutateResult {
  changed: LedgerChange
  revision: number
}

// B12 阶段⑤：旧单册端口 `旧单册端口（已删除）`（含 `台账快照读（已删除）`）已随实现文件删除。
// ---------------------------------------------------------------------------
// 需求存储端口（REQ-261002161439-277d · t2 / FR-1、FR-5、FR-6）：**聚合根 = 需求**
//
// 与上面 旧单册端口（已删除） 的关系：**并存，不是替代**。t2 只立契约（本段），
// t4/t5 落分片实现，t8 才做一次性端口切换（届时删掉 旧单册端口（已删除） 与 旧单册适配器（已删除））。
// 之所以并存：端口形状一改，`台账快照读（已删除）` 的 95 处调用点会在同一刻全部编译失败——
// 那是 t8 这张卡要一次性完成的事，不能拆进 t2。
//
// 三条纪律（写在这里，实现方与调用方都按它写代码）：
//   1. **全异步**：所有方法返回 Promise。现状那个**同步**整册 `台账快照读（已删除）` 在远端库上不可能实现，
//      它是本次改造必须消灭的形态（FR-1）。
//   2. **无整册语义**：没有任何"读全部需求"的通用入口。跨需求只剩 `sweep`（仅启动对账可用）
//      与 `replaceAll`（仅迁移脚本可用）两个显式口子。
//   3. **不泄漏存储细节**：签名里不出现文件名、JSON、SQL、路径、游标内涵
//      ——DB 适配器才能"再实现一次端口"而不是"再改一轮调用方"（FR-6）。
// ---------------------------------------------------------------------------

/** 全局版本（SSE 帧与"已落盘"指针用）。 */
export interface LedgerHead {
  readonly revision: number
  readonly schemaVersion: number
}

/**
 * 摘要查询条件。
 *
 * `scope` 缺省 `'active'`（不含归档）——这是看板首屏载荷降量的关键：现状把 33 条归档需求
 * 全文一起下发，而它们在首屏用不到（`design/architecture.md` §热冷分层）。
 *
 * `cursor` 是**不透明**串：调用方（含客户端）不得解析其内容，只负责原样回传。
 */
export interface RequirementFilter {
  readonly scope?: 'active' | 'archived' | 'all'
  readonly ids?: readonly string[]
  readonly status?: readonly RequirementStatus[]
  /**
   * 按**项目**筛（REQ-261005141830-7a3b FR-10）："这个项目下有哪些需求"一次问出来。
   * 不传 = 全量（老行为）；未归属的存量需求不会命中任何 `projectId` 筛（需另走路径口径）。
   */
  readonly projectId?: string
  /**
   * 与 `projectId` 搭配使用（REQ-261005141830-7a3b t5 · FR-8）：把**未归属**（无 `projectId`）
   * 的存量记录一并带回，好让「本项目 + 未归属」一次问出（看板据此保证老记录不消失）。
   *
   * 缺省 `false` = 只命中 `projectId` 相等的记录（**老行为逐字不变**）；单独给本项不产生任何筛选效果。
   */
  readonly includeUnattributed?: boolean
  readonly workspaceRoot?: string
  readonly sourceSessionId?: string
  /**
   * 按**席位**筛（REQ-261003215944-9e04 FR-3）：摘要的 `seats` 里有这个窗口键即命中。
   *
   * ⚠️ 这是**机械预筛**，不是授权判定：它只看落盘的 `seats` 数组，**不做**存量折算
   * （`seats` 缺省但有 `sourceSessionId` 的记录**不**由此命中——那条由 `sourceSessionId` 筛覆盖）。
   * 「谁在这条上是什么角色」永远由读端的唯一折算处 `seatOfSummary` 裁，故本筛多带回来的条目
   * 也不会被误当权限。把折算塞进存储 = 第二套口径，故不这么做。
   */
  readonly seatWindowKey?: string
  /** 缺省 200，实现方须有上限。 */
  readonly limit?: number
  readonly cursor?: string
}

/**
 * v10 热记录里的**计数字段**（提交点的一部分，`design/data-model.md` §热记录）。
 *
 * 它们不进 `RequirementRecord`（那是"装配后的需求"，大字段以数组形态出现），
 * 只出现在分片热记录与变更器拿到的 draft 上——故做成可选交叉类型。
 */
export interface RequirementCounts {
  readonly commentCount: number
  readonly historyCount: number
  readonly artifactCount: number
}

/**
 * 变更器看到的**可写草稿**：装配后的完整需求（含 `comments` / `artifacts` / `verification` …），
 * 变更器照旧就地改（`draft.comments.push(...)`）。
 *
 * 为什么不做成"只有标量字段 + 一组窄方法"：现状 90 处 `mutate` 回调就是这么写的
 * （`req.comments.push(...)`），收窄 draft 等于把这 90 处全部重写。接口稳定性比少装配几个字段值钱。
 *
 * 代价（实现方要担着）：适配器得先把该需求装配出来（最坏约 190KB：comments 65KB +
 * verification 71KB + artifacts 51KB），这是 **O(单需求)**、与库容无关。
 *
 * 纪律：`comments` / `statusHistory` / `advance.history` 三个数组**只允许追加**，不得删改已有元素。
 */
export type RequirementDraft = RequirementRecord & Partial<RequirementCounts>

/**
 * 变更器的返回值。
 *
 * `undefined` 与 `{ changed: false }` **等价**（都表示"本次没有改动"）：适配器两条都不得写盘
 * ——"无变更不写盘"是幂等判据的可观测形式（文件 mtime 不变）。
 */
export interface MutationOutcome {
  readonly changed: boolean
}

/** 一次需求写操作的结果（提交后的装配结果 + 版本 + 全局序）。 */
export interface MutateResult {
  /** 提交后重新装配的需求（调用方直接可用，不需要再读一次）。 */
  readonly requirement: RequirementRecord
  /** 单条需求的 CAS 令牌（每次成功写入 +1）。 */
  readonly version: number
  /** 全局序号（每次落盘成功 +1）。 */
  readonly revision: number
  readonly changed: boolean
}

/** `sweep` 的结果：真正被改动的需求 id 清单。 */
export interface SweepResult {
  readonly touched: readonly string[]
  readonly revision: number
}

/** 订阅通知（SSE 与缓存失效用）。 */
export interface RequirementChange {
  readonly kind:
    | 'requirement-created'
    | 'requirement-updated'
    | 'requirement-moved'
    | 'comment-added'
    | 'ledger-replaced'
  readonly requirementId: string
  readonly revision: number
  /** 变更后的摘要（订阅者据此增量刷新，不必重读整册）。 */
  readonly summary: RequirementSummary
}

/** 新建需求的入参（`id` 由调用方经 `IdFactory` 生成——端口不生成 id，可复现性靠注入）。 */
export interface NewRequirement {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly category?: RequirementCategory
  readonly promptDifficulty?: PromptDifficulty
  readonly docBasePath?: string
  /** 项目唯一标识（FR-1）：立项时由会话解析写入；缺省 = 未归属。 */
  readonly projectId?: string
  readonly workspaceRoot?: string
  readonly sourceSessionId?: string
  /** 缺省 `draft`。 */
  readonly status?: RequirementStatus
}

/** 追加评论的入参（`seq` 由存储分配，调用方不给）。 */
export interface NewComment {
  readonly id: string
  readonly body: string
  readonly createdAt: number
  readonly createdBy?: ActorRef
}

/** 需求历史的一条（状态流转与推进事件同处一条时间线，读侧按 kind 分支）。 */
export type RequirementHistoryEntry =
  | { readonly kind: 'status'; readonly event: StatusEvent }
  | { readonly kind: 'advance'; readonly record: AdvanceRecord }

/**
 * 整体导入结构 = 旧单册形状（`ReqboardLedger`）。
 *
 * 刻意复用同一个形状而不是另立一份：它同时是**导出格式**（`design/interfaces.md` §兼容与弃用
 * ——legacy v9 单册可被旧版读路径装载）与迁移/回滚脚本的交换格式，两处各写一份必然漂移。
 */
export type ImportedLedger = ReqboardLedger

/**
 * 需求存储端口——**写操作的唯一入口**（读方也一律经它，不得绕过它直接读分片文件；
 * 与既有"任务不得绕过 TaskStore"同款纪律）。
 *
 * 错误码见 `REQUIREMENT_STORE_ERROR`：实现方抛 `Object.assign(new Error(msg), { code })`，
 * 模块内部的更细码（如队列层的 `QUEUE_ERROR`、日志层的 `JOURNAL_ERROR`）由上抛处映射到这套传输码。
 */
export interface RequirementStore extends RequirementReader {
  /** 单条需求（含大字段装配）；热侧未命中回落冷侧；都不存在 → `undefined`。 */
  get(id: string): Promise<RequirementRecord | undefined>
  /** 评论（按 `seq` 升序）；`since` 含起点，`limit` 缺省由实现定（须有上限）。 */
  listComments(id: string, opts?: { since?: number; limit?: number }): Promise<readonly CommentRecord[]>
  /** 状态流转 + 推进事件历史（按 `seq` 升序）。 */
  listHistory(id: string, opts?: { limit?: number }): Promise<readonly RequirementHistoryEntry[]>
  /** 全局版本（SSE 帧与"已落盘"指针用）。 */
  head(): Promise<LedgerHead>
  /** 新建；id 已存在 → `REQBOARD_ALREADY_EXISTS`（**不覆盖**）。 */
  create(input: NewRequirement, actor: ActorRef): Promise<RequirementRecord>
  /**
   * 临界区内读-改-写（RMW）。**原子性由适配器保证**：
   * JSON 实现 = 写前重读 + 进程内串行队列；DB 实现 = 事务 / `SELECT … FOR UPDATE`。
   *
   * `fn` 返回 `undefined` 或 `{changed:false}` = 无变更（不写盘、不 bump、不广播）。
   */
  mutate(id: string, fn: (draft: RequirementDraft) => MutationOutcome | undefined): Promise<MutateResult>
  /** CAS 变体：`draft.version !== expectedVersion` → `REQBOARD_CONFLICT`（带当前版本），**不静默覆盖**。 */
  mutateIf(id: string, expectedVersion: number, fn: (draft: RequirementDraft) => MutationOutcome | undefined): Promise<MutateResult>
  /** 追加评论（与热记录里的 `commentCount` 同一次提交）。 */
  appendComment(id: string, comment: NewComment): Promise<{ version: number; commentCount: number }>
  /**
   * **仅启动对账可用**（交互路径禁止调用）：一次覆盖多条需求的批量变更。
   *
   * 现状全仓只有 2 处需要它（`src/index.ts` 的启动对账、`migrate-dive-state.ts` 的一次性迁移），
   * 二者都是启动期全表扫描。DB 实现以单个事务承载。
   */
  sweep(reason: string, fn: (drafts: readonly RequirementDraft[]) => readonly string[]): Promise<SweepResult>
  /** **仅迁移/回滚脚本可用**：以导入结构整体重建（备份 + 原子替换由实现负责）。 */
  replaceAll(reason: string, next: ImportedLedger): Promise<void>
  /** 订阅需求变更（供 SSE / 缓存失效）；返回退订函数。 */
  subscribe(fn: (change: RequirementChange) => void): () => void
}

/**
 * 窄**只读**接口：给那些只需要"按 id / 按条件看需求"的调用方用（现状 4 处结构化声明
 * `{ 台账快照读（已删除）: LedgerView }` 换成它，见 `design/interfaces.md` §95 处读点改造分类）。
 *
 * 拆出窄口而不是到处传 `RequirementStore`：只读依赖注入不了写能力，
 * 用例测试里也就不会顺手写不该写的东西。
 */
export interface RequirementReader {
  /** 摘要投影（零文件读；实现方走内存索引）。 */
  getSummary(id: string): Promise<RequirementSummary | undefined>
  /**
   * 按条件列出摘要；缺省 `scope='active'`（不含归档）。
   *
   * 返回**一页**（`items` + `nextCursor`）：`nextCursor === undefined` = 到底。
   *
   * ⚠️ 本签名与 `design/interfaces.md` 代码块里那行 `Promise<readonly RequirementSummary[]>`
   * 不一致——**以本签名为准**，因为同一份设计的映射表写的是"摘要投影数组 + 下一页游标"。
   * 游标只能由存储自己产生（只有它知道自己的排序与分页方式），若只回数组，
   * 分页游标就得由上层的 HTTP 路由拼——那是把存储细节泄漏到入口层，与 FR-6 相悖。
   *
   * **排序契约（稳定，属端口承诺）**：`updatedAt` 降序，同一时刻按 `id` 升序。
   * 分页游标只在**同一 `scope` + 同一过滤条件**下有效。改排序键 = 改契约（会让在飞游标错页）。
   */
  listSummaries(filter?: RequirementFilter): Promise<RequirementSummaryPage>
  /**
   * 分诊记录（`triages`）。
   *
   * 来源：分片存储把它放在 `meta.json`（RequirementShardRepository.ShardMeta.triages）——
   * 一次读、不是整册扫，因此不构成读放大。
   * 旧端口的同步整册读（其 triages 字段）由本方法替代（B8 迁移用）。
   */
  listTriages(filter?: { sessionId?: string }): Promise<readonly TriageRecord[]>
  /**
   * **同步**摘要投影（本地缓存视图，**可能略旧**）。
   *
   * 只允许用于"过期不致命"的场景：系统提示词段组装（`systemPrompt.section` 的 `text` 回调是
   * **同步**的，每回合执行）与引导注入。**任何门禁、写判定、人工确认、验收都必须用 await 的权威读。**
   * DB 实现返回本地缓存投影（可为空数组 = 退化为不注入引导，不影响正确性）。
   */
  peekSummaries(): readonly RequirementSummary[]
  /**
   * **同步**提示词缝窄投影（本地缓存视图，**可能略旧**）。
   *
   * 与 `peekSummaries()` 的关系：**同一条缝的两种粒度**，不是替代。
   * `peekSummaries()` 给"只要状态"的判定（绑定/未绑定），本方法多带 `description`——
   * 提示词段的 `resolveStagePrompt` 用它推断难度（FR-16），而看板摘要刻意不含正文
   * （理由见 `RequirementFacts` 的注释）。
   *
   * 纪律与 `peekSummaries()` 同源，许可区（2026-10-03 明文化，B12 阶段①-a）**恰好三项**：
   *   1. 系统提示词段组装（`systemPrompt.section` 的 `text` 回调是**同步**的）；
   *   2. 引导注入（含越界纠偏提示——它**只注入文本**、返回值被丢弃，不是门禁）；
   *   3. **失败告警的寻址**（`FailureAlert.windowFor`：只用来决定"这条告警该投给哪个窗口"，
   *      属寻址而非判定；读到略旧最坏是该窗口这次没收到提醒，不会放过或挡下任何操作）。
   * **任何门禁、写判定、人工确认、验收都必须用 await 的权威读**
   * （反例：`H1/H2/H3` 的归属需求判定 `pickGateRequirement` —— 它是门禁，走权威 `get`）。
   * DB 实现返回本地缓存投影（可为空数组 = 退化为不注入引导，不影响正确性）。
   */
  peekFacts(): readonly RequirementFacts[]
  /**
   * **排空后**读全局版本（B12 阶段①-a 裁决 I1）。
   *
   * 语义：等到本适配器**此前受理的写**都已落盘，再返回那时的 head。
   * 为什么不能直接用 `head()`：`head()` 直读 `meta.json`，与服务端的串行写队列无关 ⇒
   * 可能返回一个**尚未落盘**的 revision。而调用方（节点结算的 `persistArtifacts`）
   * 要的正是"已落盘"的证据指针（纪律①「先落盘再遗弃」），错了就失去意义。
   *
   * 各实现：分片存储等写入器的串行队列；内存替身无队列（等价于 `head()`）。
   */
  headAfterDrain(): Promise<LedgerHead>
}

/** 分页投影（带游标；`nextCursor === undefined` 表示到底）。 */
export interface RequirementSummaryPage {
  readonly items: readonly RequirementSummary[]
  readonly nextCursor?: string
}

/**
 * 需求存储的**传输错误码**（工具与 HTTP 层可见的那一套）。
 *
 * 与 `domain/errors.ts` 的 `REQBOARD_ERROR_CODES` 刻意分开：那张表是**状态机/闸门**的码，
 * 这张是**存储**的码。模块内部的更细码（`QUEUE_ERROR` / `JOURNAL_ERROR`）由实现方映射到这里。
 */
export const REQUIREMENT_STORE_ERROR = {
  /** CAS 版本不匹配（并发写同一需求）。 */
  CONFLICT: 'REQBOARD_CONFLICT',
  /** 目标需求不存在（**写不隐式建档**）。 */
  NOT_FOUND: 'REQBOARD_NOT_FOUND',
  /** `create` 撞 id。 */
  ALREADY_EXISTS: 'REQBOARD_ALREADY_EXISTS',
  /** 写冷侧（归档/done）需求——冷侧只读。 */
  COLD_IMMUTABLE: 'REQBOARD_COLD_IMMUTABLE',
  /** 结构校验不通过（**不落盘、不隔离**）。 */
  VALIDATION_FAILED: 'REQBOARD_VALIDATION_FAILED',
  /** 分片解析失败（已改名隔离；其余需求不受影响）。 */
  CORRUPT_SHARD: 'REQBOARD_CORRUPT_SHARD',
  /** 读写失败（权限/磁盘）——不降级、不静默。 */
  IO_FAILED: 'REQBOARD_IO_FAILED',
} as const

export type RequirementStoreErrorCode = (typeof REQUIREMENT_STORE_ERROR)[keyof typeof REQUIREMENT_STORE_ERROR]

// ---------------------------------------------------------------------------
// 运行设置端口（REQ-261004103330-005f FR-1 / FR-3 / FR-4）
// ---------------------------------------------------------------------------

/** 设置读写的传输错误码（HTTP 层按 `envelope.fail` 映射到状态码）。 */
export const SETTINGS_STORE_ERROR = {
  /** 字段非法（越界/非整数/未知键）——**逐项**作废，不是整份失效。 */
  INVALID: 'REQBOARD_SETTINGS_INVALID',
  /** 落盘失败（权限/磁盘）。 */
  IO_FAILED: 'REQBOARD_IO_FAILED',
} as const

/**
 * 运行设置端口（FR-1）：设置文件的读、写、订阅。
 *
 * **读写分离的理由**：`snapshot()` 是同步的，因为 `roundLimitFor` 在 Dive 回合判定的热路径上
 * （`round-driver` 同步调用），绝不能在热路径上 await 一次文件读。故端口内维护内存快照，
 * 盘上内容变化经 `refresh()` / 外部文件变更订阅进来。
 *
 * `update` **刻意不接受 `storage.backend`**（见 `RunSettingsPatch`）：后端切换必须过人工确认门
 * （FR-11），用一个 PATCH 就能换库是本次明确要堵掉的口子。
 */
export interface SettingsStore {
  /** 生效设置（已合并四级来源、逐项带 `source`）；纯内存，不读盘。 */
  snapshot(): ResolvedRunSettings
  /** 读盘刷新快照。读失败 → **保留旧快照**并走 `onWarn`（不静默退回默认值，否则上限会莫名从 300 变 1000）。 */
  refresh(): Promise<ResolvedRunSettings>
  /** 校验 + 原子写（临时文件 + rename），成功后刷新快照并广播；非法/落盘失败抛带码错误。 */
  update(patch: RunSettingsPatch): Promise<ResolvedRunSettings>
  /** 设置文件当前内容（未合并默认）；不存在 → `undefined`（FR-17 惰性创建下的正常态）。 */
  readFile(): Promise<RunSettingsFileV1 | undefined>
  /** 订阅快照变更（PATCH 成功 / 文件被外部改动）；返回退订函数。 */
  subscribe(fn: (next: ResolvedRunSettings) => void): () => void
}

// ---------------------------------------------------------------------------
// 系统记录端口（REQ-261004103330-005f FR-14 / FR-15 / FR-16 / FR-17）
// ---------------------------------------------------------------------------

/**
 * 系统记录端口：只追加的"这台机器上发生过什么"。
 *
 * 失败纪律：`append` / `updateStores` 的写失败**不抛给调用方主流程**（档案设施坏掉不该让看板整体
 * 不可用），但必须响亮——累加 `droppedEvents` 并由看板红字显示。
 */
/**
 * 「选择…」的结果（REQ-261004103330-005f，2026-10-04）。
 *
 * 为什么必须走宿主：浏览器拿不到真实绝对路径（安全边界），所以真正的选择发生在 Node 进程里。
 * **只有三态**——多一态就意味着界面要写第四种话，而人只需要知道"选了 / 没选 / 这台机器弹不出窗口"。
 */
export type StoragePathPickOutcome =
  | { readonly kind: 'picked'; readonly path: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'unavailable'; readonly reason: string }

/** 文件路径选择端口（缺省 = 宿主没接 → 界面提示手输，不假装选了）。 */
export interface StoragePathPickerPort {
  pick(): Promise<StoragePathPickOutcome>
}

export interface SystemRecordStore {
  /** 读全量；文件不存在 → 触发一次初始化（FR-17：启动自动创建）后再读。 */
  read(): Promise<SystemRecordV1>
  /** 追加一个事件（含派生字段随动）；重复写同一事件由实现按幂等键忽略。 */
  append(e: SystemEvent): Promise<void>
  /** 刷新两个载体的体检快照（启动期 / 迁移后）。 */
  updateStores(patch: StoresSnapshot): Promise<void>
  /**
   * 刷新**路径档案**（FR-14：`paths` 记的是"**实际解析到的**路径"）。
   *
   * 为什么必须有它：`read()` 对已存在的记录原样返回，若装配期只在**首次建档**时写 `paths`，
   * 之后数据根 / 库文件 / 备份目录一旦搬家，档案里就一直是旧路径——看板「系统记录」屏会显示错的路径，
   * 排查时把人引到错地方（比不显示更坏）。
   *
   * 契约：**装配期每次启动都调一次**；只改 `paths`，`history` / `counters` / `active` / `stores` 一律不动；
   * **幂等**——路径未变时不写盘（不 bump `updatedAt`）；写失败按本端口既有口径**降级**（不抛、记 `droppedEvents`）。
   */
  updatePaths(paths: StorePaths): Promise<void>
  /** 版本一致性核对（FR-16）：版本变更即写 `upgrade` 事件，返回结论。 */
  reconcileVersion(current: PluginStamp, sqliteSchemaVersion: number): Promise<CompatResult>
  /** 写失败被丢弃的事件数（> 0 时看板红字告警）。 */
  droppedEvents(): number
}

// ---------------------------------------------------------------------------
// 任务存储端口（REQ-260927202051-f6df · I-1 / FR-1, FR-2, FR-3）：代码级"队列"
// ---------------------------------------------------------------------------

/**
 * 一次任务变更的通知（供 SSE / 缓存失效）。
 *
 * `revision` 是**进程内**的按需求单调计数（队列文件本身没有 revision 字段：
 * `QueueFile` 的 schema 里没有它，我们不擅自加字段）。因此它只可用于"这次和上次比有没有变"，
 * **不得**当作跨进程/跨重启的可比版本号，也不得用于 CAS——那需要给 QueueFile 加字段（契约变更）。
 */
export interface TaskChange {
  requirementId: string
  kind: 'task-created' | 'task-updated' | 'task-moved' | 'task-removed'
  tasks: readonly TaskRecord[]
  revision: number
}

/** mutate 回调拿到的上下文。 */
export interface QueueMutateContext {
  /**
   * 重算派生视图（edges / layers / ready）并写回草稿。
   *
   * 这是给回调的**可选**便利方法：`TaskStore.mutate` 在回调返回后会**再算一遍**
   * （派生字段绝不允许陈旧），所以回调里调不调都不影响最终落盘内容。
   */
  recompute: () => void
  /** 当前时间（毫秒）；时间由外部注入，保证测试可复现。 */
  now: () => number
}

/**
 * TaskStore 端口（I-1）——**所有读方唯一的任务入口**，不得绕过它直接读 queue.json。
 *
 * 三条出口契约（读方按此写代码）：
 * 1. **出口即剥离 `layer`**：`layer` 是队列文件的派生字段（DAG 层级），不属于 `TaskRecord`。
 *    凡从本端口取"任务"的方法（get / listByRequirement / listAll / mutate / createMany）
 *    返回的对象**不含 `layer` 键**；需要 DAG 视图（含 layer）用 `readQueue`。
 *    这样"层字段泄漏进 /state 响应"从根上不可能发生——收敛在端口一处。
 * 2. **不抛"不存在"**：`listByRequirement` 无队列返回 `[]`、`get` 无此任务返回 `undefined`、
 *    `readQueue` 无队列返回 `undefined`。只有**写**操作在无队列时抛 `QUEUE_NOT_FOUND`。
 * 3. 返回值是**脱离缓存的副本**（改它不会污染 store）。
 */
export interface TaskStore {
  /** 取单个任务（不存在返回 undefined）。 */
  get(taskId: string): Promise<TaskRecord | undefined>
  /** 取某需求的全部任务（无队列文件 → 空数组，不是错误）；顺序 = 队列文件内顺序。 */
  listByRequirement(requirementId: string): Promise<readonly TaskRecord[]>
  /**
   * 取**全部**需求的任务（看板首屏 `/state` 用；避免路由层遍历 82 个需求各读一次文件）。
   *
   * **顺序契约（稳定，D2）**：先按 `requirementId` **字典序升序**分组，组内保持队列文件内的
   * 任务顺序。即 `listAll()` = 对 `listRequirementIds().sort()` 依次拼接 `listByRequirement()`。
   * 之所以强调"稳定"：调用方（看板/回归断言）会比对两次输出的**逐字节相等**，
   * 顺序只要依赖文件系统 readdir 的返回次序就会偶发不等。
   */
  listAll(): Promise<readonly TaskRecord[]>
  /** 取某需求的队列文件全量（**含** DAG 派生视图 layer/edges/layers/ready）；无文件 → undefined。 */
  readQueue(requirementId: string): Promise<QueueFile | undefined>
  /**
   * 在需求维度上变更任务（原子写；返回**改动过的**任务）。
   *
   * `fn` 返回 `undefined` = 无变更（不写盘、不 bump revision、不广播）。
   * 目标需求无 queue.json → 抛 `QUEUE_NOT_FOUND`（写操作不隐式建空档）。
   * 校验失败 → 抛 `QUEUE_VALIDATION_FAILED`，文件保持上次有效内容。
   */
  mutate(
    requirementId: string,
    fn: (tasks: QueueTask[], ctx: QueueMutateContext) => QueueTask[] | undefined,
  ): Promise<readonly TaskRecord[]>
  /**
   * 批量写入（拆分落库用；**幂等**：已存在的 id 跳过不覆盖）。返回**实际新增**的任务。
   *
   * 与 `mutate` 的关键差异：目标需求没有队列文件时**允许新建**（拆分本来就是队列的诞生时刻）。
   * 全部 id 都已存在时不写盘（文件 mtime 不变）——这是"重复调用幂等"的可观测判据。
   */
  createMany(requirementId: string, tasks: readonly TaskRecord[]): Promise<readonly TaskRecord[]>
  /** 订阅任务变更（供 SSE / 缓存失效）；返回退订函数。 */
  subscribe(fn: (change: TaskChange) => void): () => void
}

/** 目录项（文件系统扫描的最小投影）。 */
export interface DocEntry {
  readonly name: string
  readonly isFile: boolean
  readonly mtimeMs: number
  readonly size: number
}
/**
 * 知识层生成器的源码读取端口（REQ-261004174324-4195 t2 / design/interfaces.md）。
 *
 * 为什么单独成端口而不是直接吃 `DocRepository`：生成器只需要「列目录 + 读文本」两件事，
 * 声明窄面之后测试可以用内存假实现跑（也能精确断言「没读源码」这种不变量）。
 * `FileDocRepository` 已**结构化满足**本端口，故不需要新适配器。
 */
export interface KbSourcePort {
  /** 列目录（不存在 → 空数组，不抛）。 */
  list(relDir: string): readonly DocEntry[]
  /** 读文本（工作区相对路径）。 */
  read(relPath: string): Promise<string>
}

export interface DocRepository {
  /** 相对工作区路径是否存在（evidence 存在性、构建新鲜度都靠它）。 */
  exists(relPath: string): boolean
  read(relPath: string): Promise<string>
  write(relPath: string, content: string): Promise<void>
  /** 列出目录（不存在则返回空数组，不抛）。 */
  list(relDir: string): readonly DocEntry[]
  /**
   * 单文件元数据（存在性 + mtime/size）；不存在/不可读 → undefined。
   * done 凭证门的"文件证据"与"页面插件构建新鲜度"需要 mtime（REQ-47939a t6 补，
   * 口径同搬迁前的 statSync(join(process.cwd(), f)).mtimeMs）。
   */
  stat(relPath: string): { mtimeMs: number; size: number } | undefined
  /** 相对路径 → 绝对路径（候选路径探测用）。 */
  resolve(relPath: string): string
  /** 工作区根（产物清单渲染需要相对路径）。 */
  workspaceRoot(): string
}

/**
 * 知识层读写端口（REQ-261001110934-3766 t2 / design/interfaces.md）。
 *
 * 为什么单独成端口而不是直接用 DocRepository：知识层要的是**语义操作**
 * （「按 id 取正文（条目整文件 / 页面小节）」/「追加一条并同步索引行」），
 * 而 DocRepository 只认「相对路径」。把语义留在 application 边界，adapter 只做文件搬运。
 */
export interface KbEntryDraft {
  readonly kind: KbKind
  /**
   * 条目状态（缺省 active）。`stale` / `superseded` **不进索引**（设计 I-7：索引只列 active），
   * 文件保留供追溯，由自检 K6 报告待复核。
   */
  readonly status?: 'active' | 'stale' | 'superseded'
  readonly title: string
  readonly oneLiner: string
  readonly appliesWhen: string
  /** L2 原文指针（可为空串 = 无原文）。 */
  readonly pointer: string
  readonly updated: string
  readonly req?: string
  readonly supersedes?: string
  readonly body: string
}

/** 索引读取结果：原文 + 体量 + 结构化溢出（超限不抛错，由调用方决定响亮程度）。 */
export interface KbIndexReadResult {
  readonly text: string
  readonly chars: number
  readonly lines: number
  readonly overflows: readonly KbOverflow[]
}

export interface KnowledgePort {
  /** 索引是否存在（注入侧据此决定是否加节：不存在 → 老行为逐字节不变）。 */
  indexExists(): Promise<boolean>
  /** 读索引原文 + 体量 + 预算溢出。 */
  readIndex(): Promise<KbIndexReadResult>
  /** 解析后的索引行 + 全部问题（解析失败行不静默丢弃）。 */
  readEntries(): Promise<{ rows: readonly KbIndexRow[]; issues: readonly KbIssue[] }>
  /** 取单条正文：`kb-NNNN` → 整文件；`kb-<页面>-<锚点>` → 该小节；未知/缺失 → undefined。 */
  readEntry(id: string): Promise<string | undefined>
  /**
   * 追加一条知识并同步索引行（幂等）：
   * 幂等键 = （`req` + `kind`）同源条目 → 复用既有 id（条目覆盖、索引行原位替换）。
   */
  appendEntry(draft: KbEntryDraft): Promise<{ id: string; indexPath: string }>
  /** 产物导航（索引 / 页面 / 条目 / 机器索引）。 */
  listArtifacts(): Promise<readonly KbArtifact[]>
}

/** 注入侧灰度设置（REQ-261001110934-3766 t8）：缺省 = 老行为逐字节不变。 */
export interface KnowledgeInjectSettings {
  /** 是否在节点输入包追加「项目知识索引」节。 */
  readonly injectIndex: boolean
  /** 是否把需求文档节从全文改为「TL;DR + 指针」（**灰度二阶段再开**）。 */
  readonly trimRequirementDoc: boolean
  /** 索引节字符预算。 */
  readonly injectBudgetChars: number
}

/** 时钟端口：domain 禁止 Date.now()，时间一律由外部注入，保证用例可复现。 */export interface Clock {
  now(): number
}

/** ID 工厂端口：domain 禁止 Math.random()，ID 生成同样注入。 */
export interface IdFactory {
  requirement(): string
  task(): string
  execution(): string
  comment(): string
}

/** 会话探测端口：窗口身份、调用方权限、工具痕迹、近期用户消息（t5 适配 capture-hook）。 */
export interface SessionProbe {
  windowKey(exec: unknown): string
  /** 非活窗口/非本进程驱动 → 抛 caller_not_live。 */
  requireLiveDriver(exec: unknown): void
  /** subagent/非直接人机通道 → 抛 delegated_caller / not_direct_human。 */
  requireDirectHuman(exec: unknown): void
  /** 某窗口"自 since 以来最后一次真实工具动作"的时间戳；无则 0（done 凭证门用）。 */
  toolActivitySince(windowKey: string, since: number): number
  /**
   * 某窗口执行会话**及其全部后代子代理会话**的累计 token 快照（写时快照的唯一读取口，
   * REQ-a33899 t2；跨会话聚合口径 REQ-261004154937-2ca3）。
   *
   * 口径：`totals` = 自身 + 后代闭包（按 `parentSession` 传递）可用量的合计；快照带 `members`
   * 逐成员留痕，驱动**逐成员差值**（见 `deltaSnapshots`）。取不到用量的后代**不进合计**，
   * 只进 `degradedMembers`（缺失 ≠ 0）。
   *
   * 服务/会话不可得时返回 source='unavailable' 的空桶快照——**不抛错、不阻断主流程**；
   * 血缘服务不可得则退回只算自身并标 `descendants-unavailable`。
   * 调用方据此按「无快照」展示，禁止用旧值/记忆值冒充（R-013）。
   */
  tokenTotals(windowKey: string): TokenSnapshot
  /**
   * 该窗口会话的后代子代理会话（按 `parentSession` 传递闭包，不含自身）——REQ-261004154937-2ca3。
   *
   * **异步**（枚举走 `sessionPersistence.list()`，DSH 侧是 Promise）且**不抛错**：
   * 血缘服务不可得 → `undefined`（调用方按「未聚合」呈现，不得假装聚合过）。
   * 快照链是同步的，故 `tokenTotals` **不调用本方法**——它读适配器内异步刷新的成员缓存；
   * 本方法公开出来是给「预热 + 可测」用的。
   */
  descendantSessions(windowKey: string): Promise<readonly SessionLineageEntry[] | undefined>
  /**
   * 某窗口当轮上下文压力**参考**（REQ-261002175818-80a8 t4 / FR-8）。
   *
   * **只读展示、非门禁判据**：DSH token-meter 自述这三个字段刻意非原子（last-wins 覆写），
   * 且 "not a billing or gating input"；判据永远是本仓自己的 LIMITS 常量。
   *
   * 口径与 `tokenTotals` 完全一致（同一条纪律）：取自
   * `sessionProjections.stateOf(session, 'contextPressure')`；不可得（服务未装配 / 无会话 /
   * 投影抛错 / 形状不符）→ `source='unavailable'` 且字段**缺席**——**不抛错、不阻断主流程**。
   * 禁止用旧值/记忆值冒充（R-013）。
   */
  contextPressure(windowKey: string): ContextPressureSnapshot
  /**
   * evidence 原文是否命中该窗口近期的真实用户消息（文字确认核验用）。
   * 返回 undefined = 核验通道未注入（搬迁前 deps.recentUserMsgs === undefined 的语义，
   * 此时放行并标注"核验未启用"）；返回 {ok:false, reason} = 确实未命中（拒绝并带原因）。
   */
  matchesRecentUserMessage(
    windowKey: string,
    evidence: string,
    withinMs: number,
  ): { ok: boolean; matchedText?: string; reason?: string } | undefined
  /**
   * 读某窗口会话的**原始事件流**（REQ-261004222448-292a t-497311 · FR-6 对话 Tab 的数据源）。
   *
   * 两条读法分开列，是因为它们**同步/异步与可得性语义不同**，合成一个方法必然丢信息：
   *  - `snapshotEvents`：活窗口的同步快照（`agents.get(key).session.snapshotEvents()`）；
   *  - `readEvents`：冷会话回落持久化读（`sessionPersistence.open(id,'read')` → `read().events`）。
   *
   * **缺失语义（关键）**：`undefined` = 读不到；`[]` = 读到了、就是空的。
   * 两态混同会让页面把「会话读不到」渲染成「没有对话」——正是本次要修的诚实性缺陷。
   *
   * 两个方法都**可选**：老装配（无此能力）→ 调用方按「未装配」降级（`port-unavailable`），
   * 而不是拿空数组冒充。适配器实现见 `adapters/SessionProbeAdapter.ts`。
   */
  snapshotEvents?: (windowKey: string) => readonly unknown[] | undefined
  readEvents?: (windowKey: string) => Promise<readonly unknown[] | undefined>
}

/**
 * 会话开窗端口（REQ-261003215944-9e04 FR-1）——用 **DSH 现成的会话 fork/create** 造一个新窗口，
 * 而不是自己造会话协议。
 *
 * 为什么够用：pmboard 的「窗口码」就是 root agent 的 id、也就是会话 id
 * （见 `adapters/SessionProbeAdapter.ts` 的 `windowKey`），所以 DSH 建出来的新会话
 * 天然是一条**未绑定需求的新窗口**。
 *
 * 缺省 = 未装配 → 调用方必须**响亮失败**（`REQBOARD_OPEN_WINDOW_UNAVAILABLE`），
 * 绝不伪造一个窗口码——伪造的话下游会往一个不存在的窗口投递（R-013 诚实降级）。
 */
export interface WindowOpenerPort {
  /** 开窗通道是否可用（`sessionController` 服务是否在位）。 */
  available(): boolean
  /**
   * 从源会话 fork 一个新会话（切点缺省 = 最近一个完整回合）。
   * 无已完成回合时返回 `code='unavailable_no_completed_turn'`，调用方据此提示改用 create。
   */
  fork(sourceSessionId: string, atSeq?: number): Promise<OpenWindowOutcome>
  /**
   * 建一个全新空会话（不继承任何对话前缀）。
   *
   * REQ-261004150249-731e FR-1：可指定落点——`workspaceId` **优先**（DSH 会按 `workspace.path`
   * 建会话并 `attachSession`，新会话直接归入该项目分组），其次 `cwd`；两者互斥（同时给宿主会
   * 拒绝）。**都不给时是既有行为**（宿主 `defaultCwd`）——调用方要么给，要么自己响亮失败，
   * 不得让"要在原项目里续作"的新窗口悄悄落到宿主目录（实测病灶：落进
   * `/Users/mac/.dsh/profiles/desktop`，随后写盘被 `PROJECT_ROOT_MISMATCH` 拒）。
   */
  create(opts?: WindowCreateOptions): Promise<OpenWindowOutcome>
  /**
   * 源会话的项目落点（REQ-261004150249-731e FR-1）——`create` 的入参来源。
   *
   * 三级：① 源会话所属 workspace → `{ workspaceId }`；② 源会话 `header.cwd` → `{ cwd }`；
   * ③ 都拿不到 → `undefined`（调用方**响亮失败**，不回落宿主目录）。
   * 可选：测试替身可不实现（调用方按缺省处理）。
   */
  resolveSourceProject?(sourceSessionId: string): WindowCreateOptions | undefined
  /**
   * 冷读任一会话画像（REQ-261005151245-54ae FR-2）——新窗口要继承什么，全从这一次读里取。
   *
   * **读不到就抛错**（服务未装配 / 宿主抛错 / 会话不存在）；读到但三项都没读数 → 返回 `{}`。
   * 为什么不让它返回 `undefined`：那会把「读不到」与「源没有」压成同一态，
   * 上层只能替宿主断言"源窗口没有标题"——编造。原因文案由 `window-inherit.readWindowProfile` 收口。
   * 可选：测试替身可不实现（调用方按「未装配读画像能力」记 failed）。
   */
  readProfile?(sessionId: string): Promise<WindowSourceProfile>
  /**
   * 写定会话标题（REQ-261005151245-54ae FR-1）。失败**抛错**（调用方翻成 `failed` + 原因）。
   * 可选：未实现 → 该项 `failed`（「未装配写标题能力」），**不伪造成功**。
   */
  rename?(sessionId: string, title: string): Promise<void>
  /**
   * 写定会话模型选择（REQ-261005151245-54ae FR-4）。失败**抛错**。
   * 可选：未实现 → 该项 `failed`（「未装配设模型能力」）。
   */
  selectModel?(sessionId: string, selection: WindowModelSelection): Promise<void>
}

/**
 * 继承回执的三态（REQ-261005151245-54ae FR-5）——**并列且独立**，不做「一荣俱荣」的折叠。
 *
 * `set` = 已按源窗口写定；`skipped` = 源侧没有这项读数（按纪律不动、不猜默认值）；
 * `failed` = 想做但没做成（能力缺失 / 宿主抛错 / 画像读不到）。
 * 「读不到」必须落在 `failed` 而不是 `skipped`：前者是"没拿到"，后者是"本来就没有"。
 */
export type WindowInheritanceStatus = 'set' | 'skipped' | 'failed'

/** 源会话画像（REQ-261005151245-54ae FR-2）：三项都可缺省（各自独立缺省、不互相兜底）。 */
export interface WindowSourceProfile {
  /** 源会话标题（非空才算；空串按缺失处理，不写空标题）。 */
  title?: string
  /** 源会话的 Agent 预设（= 界面上的「模式」）。 */
  agentPreset?: string
  /** 源会话的模型选择读数。 */
  modelSelection?: WindowModelSelection
}

/**
 * 读画像的结果（REQ-261005151245-54ae FR-2）：要么拿到画像（可为空对象），
 * 要么拿到读不到的原因——**没有"静默 undefined"这一态**。
 */
export interface WindowProfileRead {
  /** 读到了：`{}` = 宿主投影里三项都没值（各自按"源无该项"处理）。 */
  profile?: WindowSourceProfile
  /** 读不到的原因（`profile` 缺席时必有）：`未装配读画像能力（readProfile）` 或 `读画像失败：<宿主错误原文>`。 */
  reason?: string
}

/** 模型选择读数（REQ-261005151245-54ae FR-4）：写进子会话时 `reasoningEffort` 缺省即不带该键。 */
export interface WindowModelSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

/** 继承回执（REQ-261005151245-54ae FR-5）：三项状态 + 只记 `skipped` / `failed` 的原因。 */
export interface WindowInheritance {
  title: WindowInheritanceStatus
  preset: WindowInheritanceStatus
  model: WindowInheritanceStatus
  /** 条目格式 `<项名>：<一句话原因>`（项名 ∈ 标题/模式/模型），顺序即执行顺序。 */
  reasons: string[]
}

/** 开新会话的落点（REQ-261004150249-731e FR-1）。**互斥**：只取其一。 */
export interface WindowCreateOptions {
  /** 目标 workspace（优先；DSH 会连带把新会话挂进该 workspace）。 */
  workspaceId?: string
  /** 目标工作目录（无 workspace 归属时的兜底）。 */
  cwd?: string
  /**
   * 目标 Agent 预设（模式；REQ-261005151245-54ae FR-3）。
   *
   * 与上面两个落点字段**正交**：互斥判定只针对 `workspaceId` / `cwd`，本字段不参与。
   * 仅 `create` 路径使用；`fork` 路径由宿主按源会话继承，不重复设。
   */
  agentPreset?: string
}

/**
 * 项目注册表条目（REQ-261005141830-7a3b FR-2/FR-3）——宿主 `workspaceRegistry` 的最小投影。
 *
 * 一个条目就是**一个项目**：`id` 是它的身份，`path` 是它的根，`sessionIds` 是它下面的窗口。
 * 三者同源、同一次查表拿到——所以"项目 id 里带着 workspaceRoot"不是两次映射，而是一条记录的两个字段。
 */
export interface ProjectEntry {
  /** 项目唯一标识（宿主 workspace id；数字型已在适配器归一为字符串）。 */
  id: string
  /** 项目的工作区根（= 该项目的 `workspaceRoot`）；空串表示"有 id 无根"（不可用）。 */
  path: string
  /** 会话 → 项目 的反查键（该项目的窗口；非数组会被归一为空数组）。 */
  sessionIds: readonly string[]
}

/**
 * 项目注册表端口（REQ-261005141830-7a3b FR-2/FR-3）——"谁在哪个项目里"的只读入口。
 *
 * **缺省 = 未装配**：调用方必须走路径兜底并标注（FR-8），不得把"拿不到"当成"没有项目"。
 * 唯一 I/O 实现见 `adapters/WorkspaceRegistryProjectPort.ts`。
 */
export interface ProjectRegistryPort {
  /** 项目条目快照；未装配 / 服务不可用 → `undefined`（不抛错、不伪装空数组）。 */
  list(): readonly ProjectEntry[] | undefined
}

/**
 * 跨窗口投递端口（REQ-261003215944-9e04 FR-7）——把一条消息投给**任意窗口**（含已冷却的会话）。
 *
 * 与 Dive 的回合投递不同：后者是同步的（`agents.get` 拿活体句柄），而冷会话要先 resume，
 * 故这里**必须是异步的**。
 *
 * 红线：消息必须**自署 `source.kind`**（如 `reqboard-open-window`）。
 * 绝不许用会话控制器的 prompt 入口（那个会把来源无条件标成 `{kind:'user'}`），
 * 那等于让插件冒充人类，会绕过 goal 与 pmboard 自己的全部人工门。
 */
export interface CrossWindowDeliveryPort {
  /** 投给某窗口；冷会话走 resume。永不抛，返回结构化结果。 */
  deliver(windowKey: string, message: unknown): Promise<{ delivered: boolean; reason?: string }>
  /** 造一条自署来源的消息（与 Dive 的 createRoundMessage 同款形状，只有 kind 不同）。 */
  createMessage(params: { text: string; kind: string }): { message: unknown; messageId: string }
}

/** 开窗结果（端口层）：成功给窗口码；失败给**结构化**原因，调用方不许把它当成功。 */
export type OpenWindowOutcome =
  | {
    ok: true
    /** 新窗口码（= 新会话 id = 新 root agent id）。 */
    windowKey: string
    /** fork 时的源会话 id；create 时缺省。 */
    parentSessionId?: string
  }
  | {
    ok: false
    /**
     * unavailable_no_completed_turn = 源会话没有可切的完整回合（可改用 create）
     * open_failed = 建会话本身失败（带原始原因）
     * opener_unavailable = 服务未装配
     */
    code: 'unavailable_no_completed_turn' | 'open_failed' | 'opener_unavailable'
    reason: string
  }

/**
 * 弹框端口（reqboard_ask_confirm / accept_sheet / 立项弹框 的 UI 通道）。
 *
 * REQ-e3b6a0 t7：原先的 `autoContinue` 桩（作答后回调）**已删除**，改为 `gate` 声明——
 * 由装饰器 `adapters/GateAwareQuestions.ts` 统一织入"确认后置链"，故新增弹框入口零成本获得能力。
 */
export interface UserQuestionPort {
  available(): boolean
  ask(
    questions: readonly AskQuestion[],
    opts: {
      agent?: unknown
      signal?: unknown
      /**
       * 闸门声明（可选）：这次弹框属于哪道人工闸门。**带它 = 自动获得确认后置链**
       * （压缩/注入/唤醒/留痕）；不带 = 通用征询，不进链。
       */
      gate?: GateId
    },
  ): Promise<readonly AskAnswer[]>

  /**
   * 限时等待（REQ-261007223647-da5d t3 · FR-1）：窗口内作答 → `answered`；
   * 到期 → `pending`（**不是错误**：宿主卡片仍可作答，票也不该因此丢）。
   *
   * 可选实现：装了宿主 `askTimed` 的适配器直接透传；未装的走 `askWithBudget` 的本地竞速兜底。
   * 未实现时调用方一律经 `application/internal/ask-timed.ts` 的 `askWithBudget`，不直接碰它。
   */
  askTimed?(
    questions: readonly AskQuestion[],
    opts: { agent?: unknown; signal?: unknown; gate?: GateId; timeoutMs: number },
  ): Promise<AskTimedResult>
}

/**
 * 限时等待结果（见 `UserQuestionPort.askTimed`）。三态**必须分开**：
 *  - `answered` 人答了；
 *  - `pending` 到点还没答（**不是错误**，票留着、卡片还能答）；
 *  - `rejected` 等待本身失败/被取消（ASK_ABORTED、权限不足…）——**不能并进 pending**，
 *    否则"用户取消"会被记成"超时"（t5 留痕按类型分账，合并即失真）。
 */
export type AskTimedResult =
  | { kind: 'answered'; answers: readonly AskAnswer[] }
  | { kind: 'pending' }
  | { kind: 'rejected'; error: unknown }

/**
 * 单个弹框问题（题干与选项都要短——长文本会把选项挤出可视区）。
 *
 * ⚠️ **字段值不得为 `undefined`**（REQ-261008103718-f1ea FR-1，2026-10-08 事故）：
 * 弹框请求要走 host→client 的 remote 事件，宿主网关要求**无损 JSON**——值为 `undefined`
 * 的键（含 `{ description: undefined }` 这种"键在值为 undefined"的写法）会让**整条请求**
 * 被拒收（`api gateway: Remote event request is not lossless JSON data`），弹框根本不出现。
 * 写可选字段请用**条件展开**：
 *   `...(hasDesc ? { description: '…' } : {})`   ✅
 *   `description: hasDesc ? '…' : undefined`     ❌
 * 适配器（UserQuestionsAdapter）会在出口兜底清洗，但上游写对才是正解。
 */
export interface AskQuestion {
  id: string
  header?: string
  question: string
  options?: readonly { label: string; description?: string }[]
}

/** 弹框答复（selected 为选项 label；custom 为自定义输入）。 */
export interface AskAnswer {
  id?: string
  selected?: string[]
  custom?: string
}

/**
 * 受信内部**人工门弹框**端口（REQ-260927100007-b8ba FR-14 / design I-10）。与工具层的
 * `questions.ask` 分开：工具层要过 `requireLiveDriver`（`agent.status === 'running'`），
 * 而 Dive 跑在 idle。**仅 Dive 调用**、只发起弹框——肯定项仍由 `actor=human` 走
 * `transitionRequirement`（人工门强度不变）。通道不可用 → `{answered:false}` + 降级投递；
 * 实现须**永不抛**。幂等/防刷屏由调用方按 (需求, 门, 产物指纹) 保证。
 */
export interface GatePromptPort {
  prompt(input: {
    windowKey: string
    requirementId: string
    /** 人工门 id（G1..G4）。 */
    gate: string
    /** 确认产物（artifact）/ 推进确认（plan）。 */
    kind: 'artifact' | 'plan'
    /** kind='artifact' 时必填：要确认的产物 kind。 */
    artifactKind?: string
    question: string
  }): Promise<{ answered: boolean; affirmative: boolean }>
}

/** 用例的依赖集合（组合根构造后注入；用例不得自行 new 实现）。 */
/** 投递结果：三态都要可判（在线 / 离线 / 抛错），且**永不抛**。 */
export interface DeliveryResult {
  readonly delivered: boolean
  readonly reason?: string
}

/**
 * 会话投递端口（已废弃 deliver 方法）：现仅作为 DiveRoundDeliveryPort 的父接口。
 * 实际使用的是子接口 DiveRoundDeliveryPort（Dive 专用投递）。
 */
export interface AgentDeliveryPort {
  // deliver() 已删除，所有需求都在Dive模式下运行
}

/**
 * Dive 回合投递端口（REQ-260926215013-1568 T-3）：在 `AgentDeliveryPort` 之上增「回合消息」能力。
 *
 * 刻意独立成**子类型**而不是直接扩 `AgentDeliveryPort`：既有实现与测试大量只提供 `deliver`，
 * 直接扩父接口会同时打红它们（T-1 的验收是"tsc 错误数不高于基线"）。唯一实现 =
 * `adapters/AgentDeliverer.ts`（T-3 落地）；回合驱动只依赖本端口。
 */
export interface DiveRoundDeliveryPort extends AgentDeliveryPort {
  /**
   * 构造（**不投递**）一条 Dive 回合消息：带 `source:{kind:'dive',requirementId,revision,round}`。
   * 返回消息与身份——驱动需要在 `followup` 之前登记预留（messageId 是 user/message 认领锚点）。
   */
  createRoundMessage(input: {
    requirementId: string
    revision: number
    round: number
    text: string
  }): { message: unknown; messageId: string }
  /** 投递一条已构造消息（保留既有 source）；永不抛，失败以 delivered=false + reason 返回。 */
  deliverMessage(windowKey: string, message: unknown): DeliveryResult
}

/**
 * 闸门后置链端口（REQ-e3b6a0 t3 / FR-2）：Phase A `enqueue` 登记、Phase B `runPending` 执行。
 * 实现 = `application/gate/GatePostChain.ts`（组合根装配）；本端口让用例与适配器只见契约。
 */
export interface GatePostChainPort {
  /** 登记一次闸门作答（幂等键 windowKey+gate+decidedAt）；永不抛。 */
  enqueue(ctx: ConfirmContext): void
  /** 跑某窗口的待处理闸门（幂等 / 可降级 / 永不抛）。 */
  runPending(windowKey: string, session?: unknown): Promise<ChainRunSummary>
}

// ---------------------------------------------------------------------------
// 叶子执行端口（REQ-4842fe t4 / FR-4）：一张子卡 = 一次独立 workflow run
// ---------------------------------------------------------------------------

/** 一次 workflow run 的结果投影（stopReason 非 completed → ok:false，永不抛给调用方）。 */
export interface WorkflowRunOutcome {
  ok: boolean
  /** realm 物化后的 lossless JSON（仅 ok=true 时可信）。 */
  value?: unknown
  /** 失败原因：stopReason(error/cancelled) / engine_unavailable / start_failed。 */
  reason?: string
}

/** 起一次 run 的入参（parent 类型不外泄——端口只透传，adapter 内桥接引擎类型）。 */
export interface WorkflowStartInput {
  script: string
  meta: { name: string; description: string; phases?: string[] }
  args?: Record<string, unknown>
  /** 子代理归属（引擎要求 live Agent）；调用方传入 exec.agent。 */
  parent?: unknown
  signal?: AbortSignal
}

/**
 * WorkflowRunner 端口（唯一实现 = adapters/WorkflowEngineRunner.ts）。
 *
 * 为什么要有这个端口：application/domain 层禁止 import 运行时 `@deepseek-ai/*`
 * （layer-boundary 门禁），而子卡执行必须触达 `ctx.workflowEngine`——端口把
 * "起一次 run" 收敛成一个方法，引擎类型只在 adapter 内出现。
 */
export interface WorkflowRunner {
  start(input: WorkflowStartInput): Promise<WorkflowRunOutcome>
  /**
   * 可达性探针（REQ-261004065652-5c1c FR-10）。缺省 undefined = 未知（按可达处理，行为不变）。
   *
   * 为什么要它：本 profile 的 agent preset 用 `isolate: { workflowEngine: true }` 把引擎圈在
   * agent 作用域，**profile 级插件永远取不到**（2026-10-03 实测子卡链连挂 4 次）。此前是
   * "开工 → 派卡 → 失败 → 报错"，人看到的是"卡坏了"；预检把它变成"开工前就说清楚"。
   */
  reachable?(): boolean
}

// ---------------------------------------------------------------------------
// 团队执行端口（FR-11 路线 A / REQ-260926140539-457b + REQ-260927144541-0481）：
// 子卡实施段改走 DSH 原生 Agent Teams（ctx.agentTeams = TeamService）
// ---------------------------------------------------------------------------

/** 共享任务视图（TeamTaskView 投影；application 层不得 import @deepseek-ai/*）。 */
export interface TeamTaskViewLike {
  id: string
  revision: number
  subject: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'deleted'
  blockedBy: readonly string[]
  writeScopes: readonly string[]
  ownerName?: string
  ready: boolean
  writeScopeWarnings: readonly string[]
}

/** 团队成员视图（TeamMemberView 投影）。 */
export interface TeamMemberViewLike {
  id: string
  name: string
  role: 'lead' | 'teammate'
  status: 'running' | 'idle' | 'inactive' | 'provisioning' | 'failed'
  description?: string
  diagnostics: readonly string[]
}

/** 起一个持久 Worker（teammate）的入参。 */
export interface SpawnWorkerInput {
  name: string
  description: string
  /** 明文提示词；adapter 负责转成引擎要的 ContentBlock[]。 */
  prompt: string
  context?: 'fresh' | 'fork'
  signal?: AbortSignal
}

/** 建一张共享任务的入参（原生 DAG = blockedBy；写范围 = writeScopes）。 */
export interface TeamTaskCreateInput {
  subject: string
  description: string
  blockedBy?: readonly string[]
  writeScopes?: readonly string[]
}

/** CAS 转移入参（FR-11 的 expected_revision 防冲突）。 */
export interface TeamTaskUpdateInput {
  taskId: string
  expectedRevision: number
  action: 'claim' | 'release' | 'edit' | 'set_dependencies' | 'complete' | 'reopen' | 'reassign' | 'delete'
  owner?: string
}

/**
 * AgentTeamsPort（FR-11 路线 A）——唯一实现 = adapters/AgentTeamsAdapter.ts，桥接 `ctx.agentTeams`。
 *
 * 为什么要有这个端口：application/domain 层禁止 import 运行时 `@deepseek-ai/*`（layer-boundary
 * 门禁），而团队执行必须触达 TeamService——端口把"起 Worker / 建任务 / CAS / 等变更"收敛成方法，
 * 服务类型只在 adapter 内出现。`caller` = live Agent 句柄（透传，adapter 内桥接），
 * 与 WorkflowStartInput.parent 同款处理。
 */
export interface AgentTeamsPort {
  /** 服务是否可用（未装配 → false；调用方走兼容路径，不静默成功）。 */
  available(): boolean
  spawnWorker(caller: unknown, input: SpawnWorkerInput): Promise<TeamMemberViewLike>
  listMembers(caller: unknown): readonly TeamMemberViewLike[]
  createTask(caller: unknown, input: TeamTaskCreateInput): Promise<TeamTaskViewLike>
  listTasks(caller: unknown): readonly TeamTaskViewLike[]
  getTask(caller: unknown, taskId: string): TeamTaskViewLike
  updateTask(caller: unknown, input: TeamTaskUpdateInput): Promise<TeamTaskViewLike>
  /** 等下一个团队域变更（事件驱动，零轮询）。timedOut=true 表示窗口内无变更。 */
  waitForChange(caller: unknown, timeoutMs: number, signal?: AbortSignal): Promise<{ timedOut: boolean }>
  /** 中断一个 teammate 的当前回合（保留其待处理收件箱）。 */
  interrupt(caller: unknown, targetName: string): { previousStatus: string }
  /**
   * 给一个**已存在**的 teammate 投递消息（inactive 的会被唤醒——teammate 是 durable/continuable 的）。
   * 为什么必须有它：TeamService 的 teammate 名字**唯一且不可复用**（实测：同名重起被拒
   * `teammate name "…" was already used in this Team`），所以"成员已存在但 inactive"时只能唤醒，不能重起。
   */
  sendMessage(caller: unknown, input: { target: string; content: string }): Promise<{ messageId: string; status: string }>
}

/**
 * 实施链失败处置端口（REQ-4842fe FR-13）：**唯一人工交互面 = 会话内弹框**（三选一）；
 * 不另做告警通道、**不发飞书**、不接通知面（2026-09-21 用户裁定，见 requirement §8 #17）；
 * 宿主日志仅作排障留痕。
 * 唯一纪律：**永不抛**（告警失败不得反过来阻断暂停与留痕）。
 */
export interface FailureAlertPort {
  alert(input: { requirementId: string; title: string; content: string }): void
}

/**
 * 立项弹框交互留痕（REQ-260922012924-2e29 FR-5；REQ-261007223647-da5d t5 起扩为三类）。
 *
 * 答什么：这个窗口最近在立项弹框上做过什么——点了 ✖️（reject）、还是直接取消/暂离（cancel）、
 * 还是等到点没作答（timeout）。**取消与超时原先一律不留痕**，于是"用户明明取消了、agent 还弹"
 * 只能靠人抱怨才发现（2026-10-07 现场）。
 *
 * 用途三条：① reject 仍在 TTL 内 → 不再弹框（原粘滞语义）；② cancel 在 TTL 内累计到阈值 →
 * 不再弹框并提议走看板（FR-2）；③ 回执与复盘可查"到底发生了什么"。
 */
export type CaptureInteractionKind = 'reject' | 'cancel' | 'timeout'

export interface CaptureRejection {
  windowKey: string
  at: number
  title?: string
  /** 交互类型；缺省（旧记录）按 `reject` 处理——旧文件读取零迁移。 */
  kind?: CaptureInteractionKind
}

/** 交互留痕端口：record 同步受理异步落盘（失败只告警不抛）；readAll 缺文件 → []，损坏由调用方降级。 */
export interface CaptureRejectionPort {
  record(entry: CaptureRejection): void
  readAll(): Promise<readonly CaptureRejection[]>
}

// ---------------------------------------------------------------------------
// REQ-261007100513-6749 t1（定死接口与数据契约）：I-2 投递意图 + FR-6 预算运行态
// ---------------------------------------------------------------------------

/**
 * 易变段投递端口（I-2，REQ-261007100513-6749 FR-2/FR-3）。
 *
 * **意图 / 实现分离**：写路径用例只调 `notify()`（意图），去重（内容哈希）、去抖、投递
 * （`inbox.prepend('next-step')`）、降级兜底全在适配器里（实现）——用例可单测（fake port），
 * 投递可单测（fake agent）。
 *
 * **契约（唯一一条硬纪律）：永不抛。** 投递失败**不是**写路径的失败——状态已经落账了，
 * 因通知失败回滚会制造状态倒退。故一切失败（通道不可得 / 实现内部异常）都以返回值
 * `NoticeDeliveryResult` 回报：调用方据此决定是否退回头部，而**不回滚**已落的写入。
 */
export interface VolatileNoticePort {
  /**
   * 请求把该窗口的易变段同步到会话尾部。
   *
   * 实现侧负责：内容哈希去重 → 去抖 → `inbox.prepend('next-step')` → 失败退回头部 + 留痕。
   * `kind` 缺省 = 由实现按本次意图推导要投哪一段。
   * **永不抛**（失败以 `NoticeDeliveryResult` 回报），调用方用例不因投递失败而回滚写路径。
   */
  notify(windowKey: string, kind?: VolatileNoticeKind): Promise<NoticeDeliveryResult>
}

/**
 * 预算窗口运行态端口（FR-6，design/data-model.md §运行态文件 1）。
 *
 * 落点 = `state/subtask-budget.json`（与本仓既有 `state/prompt-injection-log.json` /
 * `state/capture-rejections.json` 同级：**运行态、可删可重建**，不进台账）。
 * 两个方法就是该文件的读写面——**窄端口**：窗口与计数的**判定**是
 * `application/internal/subtask-budget.ts` 的纯函数，端口只负责搬运，用例不直接碰文件系统。
 *
 * 失败语义：
 *  · `read()` 文件缺失 / 损坏 → `undefined`：调用方按「计数不可得」**显式降级并留痕**，
 *    **不按 0 静默通过**（缺文件不等于没花钱）；
 *  · `write()` 原子写（temp → fsync → rename，与队列同法）；实现侧**自持串行锁**。
 *
 * 并发口径（t5 返工 P2②，注释与实现对齐）：本端口**故意不给** read-modify-write 组合方法，
 * 因为放行的原子性**不由端口提供**——它由调用方显式给出的 `expectedWindowIndex`（CAS）保证：
 * `releaseSubtaskBudget` 把「我看到的窗口号」与当前窗口号比较，**不等即拒并回报当前窗口号**，
 * 于是不存在「两个放行者各读到 #0、各自 +1、丢一次放行」的读改写竞态（端口仍是窄读写面）。
 */
export interface SubtaskBudgetPort {
  /** 读全量窗口态（缺失/损坏 → undefined，见上）。 */
  read(): Promise<SubtaskBudgetState | undefined>
  /** 覆盖式写回全量窗口态（原子写；失败不静默吞，按实现口径告警 + 留痕）。 */
  write(state: SubtaskBudgetState): Promise<void>
}

/**
 * 预算**停手位**的一条记录（REQ-261007100513-6749 t5 返工 · P2）。
 *
 * 为什么另立类型而不复用人工门 in-flight（`DialogInFlightRecord`）：两者语义**不同**——
 * 人工门 = 「有人在等一个弹框」（按**需求**登记；借它记预算会把同需求所有可开工卡一起停发，
 * D-3 要的是「该卡停」不是「整需求停」）；预算 = 「这张卡 / 这个子会话这一窗用满了」，
 * 按**卡或会话**登记、过期后可重新进入。
 */
export interface SubtaskHaltRecord {
  /** 停手位引用（`budget-<作用域标识>-w<窗口号>`；单一构造点 = `budgetAwaitingRef`）。 */
  readonly ref: string
  /** 作用域键：已归属 = 卡 id；未归属 = `sess:<子会话 id>`（**不是**需求 id）。 */
  readonly scope: string
  readonly sessionId: string
  readonly taskId?: string
  readonly requirementId?: string
  /** 到顶那一窗的窗口号（换窗 = 新停手位；同窗重复到顶 = 幂等命中）。 */
  readonly windowIndex: number
  readonly since: number
  /** 失效时刻（`budgetHaltTtlMs`）；失效后同一作用域**可重新进停手位**（不是一次性闸）。 */
  readonly expiresAt: number
  /** 本作用域第几次进入停手位（≥1；过期或被清后再次到顶 ⇒ 递增）。 */
  readonly reentries: number
}

/** 进入停手位的回执。 */
export interface SubtaskHaltOutcome {
  /** true = 本次**新进入**（含过期/被清后重新进入）；false = 已在同一窗口的停手位上（幂等）。 */
  readonly entered: boolean
  readonly halt: SubtaskHaltRecord
}

/**
 * 预算**运行时状态**端口（REQ-261007100513-6749 t5 返工 · P1/P2）——计数与停手位的唯一落点。
 *
 * 为什么需要它（返工要解决的第一性问题）：**执法单位是子会话，汇报去向才看卡片归属**。
 * 这两件事必须拆开，而「按子会话计数」**不能**落在 `SubtaskBudgetPort` 里——
 * 那份运行态是**按卡**的（`tasks[taskId]`，形状由契约测试逐字钉住）：多卡并行时归属不可判，
 * 按卡的键根本不存在，旧实现于是整条链落「未归属 ⇒ 零计数、零效力」。
 *
 * 口径：
 *  · 计数窗口 = **进程内按会话**（`windowOfSession` / `chargeSession`）；子会话只活在进程生命周期里，
 *    跨重启无意义，故**不落盘**；`SubtaskBudgetPort` 仍按卡落盘，承载放行与审计所需的结论；
 *  · 归属只影响**汇报去向**：`chargeSession({taskId})` 的 `taskId` 只被记下来（首次归属即钉住），
 *    **不参与**「是否到顶」的判定；
 *  · 停手位按 `scope`（卡 id / `sess:<会话 id>`）**独立**登记，与人工门 in-flight 零耦合，
 *    过期后**可重新进入**。实现 = `application/internal/subtask-runtime.ts`（纯内存，零 IO）。
 */
export interface SubtaskRuntimePort {
  /** 该会话的计数窗口（undefined = 本会话还没计入过）。 */
  windowOfSession(sessionId: string): SubtaskBudgetState['tasks'][string] | undefined
  /** 该会话**首次**归属到的卡 id（钉住不漂移；未归属 → undefined）。 */
  taskOfSession(sessionId: string): string | undefined
  /**
   * 记一次请求（**会话为单位**，不依赖卡片归属）：窗口推进 1 次。
   *
   * `limit` 只在**首次**开窗时生效（上限开窗定格，事后改台账不影响已开窗口）；
   * `inherit` = 该会话归属卡在运行态文件里的窗口（有则继承其 `used`/`windowIndex`/`limit`，
   * 使「同一张卡换了一个子会话」不会凭空拿到一份归零的额度）。
   */
  chargeSession(input: {
    sessionId: string
    taskId?: string
    limit: number
    at: number
    inherit?: SubtaskBudgetState['tasks'][string]
  }): {
    window: SubtaskBudgetState['tasks'][string]
    exceeded: boolean
    accepted: boolean
    overBy: number
    /** true = 本会话的窗口是本次新开的。 */
    created: boolean
  }
  /**
   * 放行：把该卡名下的**所有会话**窗口切到新窗口（续跑起点）——不切就等于没放行，
   * 被叫停的子会话会在下一个请求上立刻再次到顶。返回受影响的会话数。
   */
  applyRelease(taskId: string, next: SubtaskBudgetState['tasks'][string]): number
  /** 进停手位（同作用域同窗口幂等；过期/被清后再次调用 = 重新进入，`reentries` 递增）。 */
  enterHalt(input: {
    ref: string
    scope: string
    sessionId: string
    taskId?: string
    requirementId?: string
    windowIndex: number
    at: number
  }): SubtaskHaltOutcome
  /** 该作用域当前**有效**的停手位（过期的就地摘除 → undefined）。 */
  activeHalt(scope: string, at: number): SubtaskHaltRecord | undefined
  /** 按卡清停手位（放行主路）；返回清掉的条数。 */
  clearHaltsForTask(taskId: string, at: number): number
  /** 诊断/对账用快照（只回未过期的）。 */
  listHalts(at: number): readonly SubtaskHaltRecord[]
}

/**
 * 挂起确认端口（T-4，REQ-260924213231-b1c4 / FR-3 / I-3/I-4）。
 *
 * 唯一实现 = `adapters/PendingConfirmRegistry.ts`（内存 ticket → 状态；窗口绑定 + 过期判定）。
 * 为什么要有端口：ask_confirm / confirm_receipt 用例只依赖契约，内存注册表与过期规则留在 adapter；
 * `UseCaseDeps.pendingConfirms === undefined`（缺省）= 未装配非阻塞能力 → 弹框保持旧的阻塞语义。
 *
 * 各方法都**不抛**：未知 ticket / 窗口不符 / 已过期一律返回 undefined，由用例降级读台账。
 */
export interface PendingConfirmPort {
  /** 登记一次挂起确认并返回 ticket（前缀 `pc-`；id 与时间由实现负责）。 */
  register(input: {
    windowKey: string
    requirementId: string
    target: 'artifact' | 'plan'
    kind?: ArtifactKind
  }): PendingConfirmation
  /** 按 ticket 取（窗口不符或已过期 → undefined）。 */
  get(ticket: string, windowKey: string): PendingConfirmation | undefined
  /** 回填后台作答结果（未知 ticket → undefined；幂等）。 */
  settle(ticket: string, outcome: PendingConfirmationOutcome): PendingConfirmation | undefined
  /** 本窗口**未作答**的挂起确认（FR-9 停手守卫）；没有则 undefined。 */
  pendingForWindow(windowKey: string): PendingConfirmation | undefined
  /**
   * 只读查「同一道门」是否已有人在等（REQ-261006164732-6503 t2 · 设计 I-4 / G-3）。
   *
   * 键 = `(requirementId, target, kind)`，**不含 windowKey**——同一需求同一道门，跨窗口只算一道；
   * 只认「未作答且未过期」，命中至多一条。**纯读**：不 settle、不 register、不 markInterrupted、不续期。
   *
   * 为什么是端口的**必选**成员（而不是可选）：建门去重靠它；可选就等于"某些实现可以没有唯一性"，
   * 而那是最难查的一类静默降级。
   */
  findOpen(input: {
    requirementId: string
    target: 'artifact' | 'plan'
    kind?: ArtifactKind
  }): PendingConfirmation | undefined
  /**
   * 标记「阻塞等待期间被中止」（REQ-260927123256-196b FR-4）：只写首次 `interruptedAt`（幂等），
   * 未知 ticket → undefined（不抛）。中止记录以 `interruptedAt` 为过期基准，再获一个完整 TTL。
   */
  markInterrupted(ticket: string): PendingConfirmation | undefined
}


/** 一条在途弹框登记（REQ-261002141430-a5ef / design/data-model §1）。 */
export interface DialogInFlightRecord {
  /** 在途引用：挂起路径 = ticket（`pc-…`），其余 = 本地引用（`dlg-…`）。 */
  ref: string
  windowKey: string
  requirementId: string
  /** 来源：确认门（ask_confirm）/ Dive 人工门框。 */
  kind: 'confirm' | 'gate'
  /** true = 超宽限已挂起（可凭 ticket 取回执）。 */
  suspend: boolean
  /** 登记时刻（诊断用）。 */
  since: number
}

/**
 * 在途弹框登记端口（REQ-261002141430-a5ef FR-1 / FR-3）——**停手判据的唯一可读来源**。
 *
 * 为什么与 `PendingConfirmPort` 分开而不是扩它：前者答"我能取回执吗"（凭据视图，滤过期与落章），
 * 本端口答"自动链该不该停"（等待视图，管拦截）。两个谓词口径不同，混在一起必然漂移
 * （design/data-model §1）。唯一实现 = `adapters/PendingConfirmRegistry`（与 ticket 表同实例）。
 *
 * **`inFlightFor` 必须是纯内存同步读**：Dive 的人工门框与起轮在同一 idle 拍相邻
 * （session-driver 的 `captureTick` → `requestDrive`），只要它引入 await/IO，同拍那一轮就拦不住。
 *
 * 各方法都**不抛**：未知 ref / 重复 exit 一律零动作。
 */
export interface DialogInFlightPort {
  /** 登记在途（幂等：同 ref 重复登记不叠加；`since` 由实现盖章）。 */
  enter(input: { ref: string; windowKey: string; requirementId: string; kind: 'confirm' | 'gate'; suspend: boolean }): void
  /** 解除（幂等；未知 ref 零动作）。 */
  exit(ref: string): void
  /**
   * 该需求是否有未解除的在途弹框（**同步**）。
   *
   * REQ-261006170150-52cc FR-3：实现侧按 `suspend` **分档惰性过期**
   * （挂起型 30 分钟 / 阻塞型 60 分钟）——读出过期记录即摘掉并按"无人等待"返回 false。
   * 故 `true` 的含义是"**此刻真的**有人在等"，而不是"历史上登记过"。
   */
  inFlightFor(requirementId: string): boolean
  /** 诊断/对账用快照：只回**未过期**的记录（与 `inFlightFor` 同口径）。 */
  list(): readonly DialogInFlightRecord[]
}

// ---------------------------------------------------------------------------
// 后台任务端口（REQ-260925110957-552d / FR-1）：实施链异步化
// ---------------------------------------------------------------------------

/** Job 启动参数 */
export interface JobStartSpec {
  /** Job 类型标识 */
  kind: string
  /** Job 标签（用于日志） */
  label: string
  /**
   * Job 归属：**agent/session 的 id 字符串**（不是 agent 对象）。
   *
   * 宿主契约（`@deepseek-ai/dsh-jobs-local` 的 `resolveOwner`）：`agents.get(session)` 只认 id，
   * 传对象会被判「无 live agent」——实测错误文本 `session "[object Object]" has no live agent`。
   * 缺省 = unowned job（宿主允许，但失去 owner 作用域的取消与并发上限）。
   *
   * 取 id 的单一口径见 `application/internal/support.ts` 的 `dispatchOwnerOf`。
   */
  owner?: string
  /** Job 执行函数 */
  run: (signal: AbortSignal) => Promise<void>
}

/** Job 状态快照 */
export interface JobSnapshot {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'killed'
  startedAt?: number
  finishedAt?: number
  error?: string
}

/**
 * 后台任务端口（REQ-260925110957-552d t2）。
 * 
 * 唯一实现 = `adapters/DshJobsAdapter.ts`（桥接 ctx.jobs.start/get）。
 * 缺省 = 后台任务系统不可用 → advanceRequirement 显式返回 {dispatched:false, reason:'jobs_unavailable'}。
 */
export interface JobsPort {
  /** 启动后台任务，返回 Job ID（同步返回，不等执行完成） */
  start(spec: JobStartSpec): Promise<string>
  /** 查询 Job 状态快照（不存在返回 null） */
  get(jobId: string): Promise<JobSnapshot | null>
  /** 检查是否可用 */
  available(): boolean
}

// ---------------------------------------------------------------------------
// skill 资产端口（REQ-261005122347-e07a FR-1 / FR-2 / FR-5 / FR-6）
// ---------------------------------------------------------------------------

/**
 * 解释器探测结果（FR-5）。
 *
 * 为什么进回执而不留在插件内部：主 agent 派原型子代理前要**一次拿到**"这台机器能不能检索"，
 * 否则它只能自己再探一遍，然后就多出第二个探测点（口径必然漂移）。
 */
export interface PythonProbeResult {
  readonly found: boolean
  /** 探测到的解释器名（python3 / python / py）。found=false 时缺省。 */
  readonly name?: string
  /** 版本字符串（如 3.8.10）；拿不到版本时缺省，但不因此判 found=false。 */
  readonly version?: string
  /** 解释器绝对路径。 */
  readonly path?: string
}

/** 待写文件（内容与指纹一起给：写盘侧再算一遍就会多出第二个口径）。 */
export interface SkillWriteFile {
  /** 相对投放根的 POSIX 路径。 */
  readonly rel: string
  readonly content: Uint8Array
  /**
   * 声明的内容哈希。**给了就必须与实写一致**（写盘侧逐文件校验，不符即整棵树失败）；
   * 元数据文件（`.manifest.json` / `.gitignore`）没有可预先声明的哈希，故可选。
   */
  readonly sha256?: string
}

/** 投放写盘回执（按实际落盘内容重算，不用调用方传来的值——回执要是"盘上事实"）。 */
export interface SkillWriteReceipt {
  readonly files: Readonly<Record<string, SkillFileFingerprint>>
  readonly bytes: number
}

/** 读到的资产内容 + 指纹。哈希在适配层算（application 不碰 `node:crypto`）。 */
export interface SkillAssetContent {
  readonly content: Uint8Array
  readonly sha256: string
}

/**
 * 包内 skill 资产读端口（FR-1）：唯一实现 = `adapters/SkillAssets`（解 `<pkg>/skills`）。
 *
 * 为什么是三个方法：用例必须能枚举「某个 skill 下有哪些文件」才能建待写清单；
 * 只给 `listSkills()` 就得让用例去猜文件名——那是把目录形状漏进 application。
 */
export interface SkillAssetPort {
  /** 资产根**绝对路径**（诊断/报错用：装机漏打包时要能一眼看出找的是哪）。 */
  rootDir(): string
  /** 列包内 skill 名（一级子目录，排序后）。 */
  listSkills(): readonly string[]
  /** 列某 skill 下的全部文件（相对 `<pkg>/skills` 的 POSIX 路径，排序后）。 */
  listFiles(skill: string): readonly string[]
  /** 读单文件（相对 `<pkg>/skills`）。不存在 → **抛**（响亮，不返回空）。 */
  readAsset(rel: string): Promise<SkillAssetContent>
  /**
   * 读包内 `skills/PROVENANCE.md` 原文（FR-8）。投放清单要据此记下"这批资产来自哪个上游 commit"，
   * 否则装到用户机器上的那份就断了溯源链。读不到 → **抛**（缺溯源 = 资产不完整）。
   */
  readProvenance(): Promise<string>
}

/**
 * 投放端口（FR-5 / FR-6）。
 *
 * `probePython` 是全插件**唯一**碰 `node:child_process` 的点（落在适配层，与
 * `adapters/SystemFileOpener` 同层）；application 侧只拿到结果对象。
 *
 * `writeTree` 必须**全成功或全不落地**（先写临时目录、逐文件校验、再整体改名）：
 * 半份资产会让子代理读到混版 skill，那比没有更坏；失败时还要清掉临时目录。
 * `readTree` 只回**资产文件**，不含 `.manifest.json` / `.gitignore` 两个元数据文件
 * （否则 `verifyManifest` 会把插件自己写的清单判成 `file-extra`）。
 */
export interface SkillInstallPort {
  /** 顺序探测 python3 → python → py -3；全缺 → `{found:false}`（不抛）。 */
  probePython(): Promise<PythonProbeResult>
  /** 写整棵树（事务性）。失败 → 抛，且不留半份与 `.tmp-*` 残留。 */
  writeTree(root: string, files: readonly SkillWriteFile[]): Promise<SkillWriteReceipt>
  /** 读整棵树（相对 root 的 POSIX 路径 → 指纹，不含元数据文件）；目录不存在 → 空表。 */
  readTree(root: string): Promise<Readonly<Record<string, SkillFileFingerprint>>>
  /** 读投放根里的 `.manifest.json` 原文；不存在 → undefined（缺清单 = 视为未投放）。 */
  readManifest(root: string): Promise<string | undefined>
}

// ---------------------------------------------------------------------------
// 宿主文件面端口（REQ-261008020617-088f RF-3 / RF-5）
// ---------------------------------------------------------------------------

/**
 * 宿主文件面端口（**同步**）——application 不得 `node:fs` / `node:path`，一切宿主文件读写经它。
 *
 * ## 为什么每个方法都要传根（而不是构造期绑定一个根）
 *
 * 同一进程里每条需求有自己的根：`deps.docs` / `deps.taskStore` 是**宿主级单例**，根会被别的窗口
 * （另一个会话工作区）改掉。`docs/architecture/gate-read-root.md` 记着两次真实事故：读盘前不按
 * 被核验需求的根再校正一次，完整性门会**误拦**（报「文件不存在」而文件就在盘上），其余读类门会
 * **静默放行**。把根绑进构造期 = 把那条事故重新种进类型里，故本端口要求调用方**逐次**给出
 * 「这次读/写的根」——用哪个根写在调用点上，看得见、可评审。
 *
 * ## 为什么是同步
 *
 * 既有调用点分布在同步路径上（`syncRTMYamlWithSnapshot` 及其 HTTP 调用方、`QueryState`），改成
 * 异步的爆炸半径远大于一个新开的窄同步口；这与 `DocRepository` 的 `exists` / `list` / `stat`
 * 同步口径一致。需要**异步**读文档请用 `DocRepository.read`（分工：这里只做「同步宿主文件面」）。
 */
export interface HostFsPort {
  /**
   * 宿主进程 cwd（`process.cwd()`）。
   *
   * 用途单一：capture 弹框「宿主默认工作区」哨兵的解析源。**它不是任何需求的根**，也不要拿它当
   * `workspaceRoot`（那是 `DocRepository.workspaceRoot()` 的事）——实测两者在 DSH Web 模式下不同：
   * 前者是宿主启动目录，后者是会话工作区。
   */
  cwd(): string
  /** 绝对路径是否为**存在的目录**（不存在 / 不可读 / 非目录 → `false`，不抛）。 */
  isDirectory(absPath: string): boolean
  /**
   * 绝对路径**是否存在**（文件或目录都算；不存在 / 不可读 → `false`，不抛）。
   *
   * 为什么单列一条：`reqboard_create` 的落点校验对「路径不存在」与「路径存在但不可读/不是目录」
   * **给的是两句不同文案**（`目录不存在` / `目录不存在或不可读`）。只有 `isDirectory` 时两者会被
   * 压成同一句——那是对用户可观察的行为变化，故保留这条只回答"在不在"的探针。
   */
  existsAbs(absPath: string): boolean
  /** `<root>/<relPath>` 是否存在。 */
  exists(root: string, relPath: string): boolean
  /** 读 `<root>/<relPath>` 文本；不存在 / 读失败 → `undefined`（不抛，调用方按「判不了」处理）。 */
  readText(root: string, relPath: string): string | undefined
  /**
   * 读 `<root>/.dsh-data/state/<name>` 的 JSON；不存在 / 坏文件 → `undefined`（不抛）。
   *
   * 为什么不给「任意路径的 JSON 读」：state 目录布局（`.dsh-data/state`）此前硬编码在 3 处
   * application 调用点；收进端口 = 把这条布局收敛成**一处**可改契约。
   */
  readStateJson(root: string, name: string): unknown | undefined
  /**
   * 原子写 `<root>/.dsh-data/state/<name>`（临时文件 + rename；目录按需创建；失败**抛**）。
   *
   * 写失败必须抛：调用方（RTM 失败留痕 / 触发留痕）自己决定降级口径，端口不替它决定。
   * 缩进口径固定 2 空格（与既有 state 文件逐字节一致）。
   */
  writeStateJsonAtomic(root: string, name: string, data: unknown): void
}

/**
 * 诊断日志 sink 端口（REQ-261008020617-088f RF-4）——`application/internal/diag-log` 的注入面。
 *
 * 为什么是 sink 而不是「宿主态端口」：诊断日志的落点由组合根决定（`dshHomePath(config, …)`），
 * 与任何工作区根无关，给它造一个通用宿主态端口是空转。门面（`captureDiag` / `initCaptureDiag`）
 * 留在 application 且**零 I/O**，文件实现落 `adapters/FileDiagSink`。
 *
 * **实现必须永不抛**：诊断通道绝不能反过来影响主流程（REQ-f6307c 的既有纪律）。
 */
export interface DiagSinkPort {
  /** 追加一行（含换行；时间戳由门面拼进 `line`）。任何失败静默。 */
  write(line: string): void
}

export interface UseCaseDeps {
  /**
   * 项目注册表端口（REQ-261005141830-7a3b t3 · FR-3）：取根时由 `record.projectId` 查项目条目的 `path`。
   *
   * **可选 = 未装配时行为与改造前逐字一致**（一律走路径兜底 + 标注），故本批不改任何既有构造点；
   * 组合根在 t5 装配真实现。
   */
  projectRegistry?: ProjectRegistryPort
  /**
   * 新需求存储端口（REQ-261002161439-277d t8 / B0）。
   *
   * **为什么先做可选**：端口形状一改，41 处测试构造点会一次性全红，破坏"每批结束树必须绿"的
   * 分批门（那正是卡上"一次性原子切换"走不通的原因）。故先并存，随批次逐个调用点搬过来；
   * 搬完（B12）由可选转为必填并删掉 `repo`。
   *
   * 纪律：**新写的读点一律用它**；不要新增 `repo.台账快照读（已删除）` 调用点。
   *
   * B12 阶段④-1（2026-10-03）：已由可选转**必填**——`repo` 同时转可选 ⇒ 之后的端口迁移
   * 不会再被"41 处测试构造点一次性全红"卡住（那正是分批门要避免的）。
   */
  store: RequirementStore
  docs: DocRepository
  /**
   * 宿主文件面端口（REQ-261008020617-088f RF-3 / RF-5）：RTM 健康检查的 state 读写与
   * 「绝对路径 → 目录存在性 / 宿主 cwd」判定都经它，application 侧不再 `node:fs` / `node:path`。
   *
   * **必填、不给未装配降级**：可选 + 运行期兜底会把装配遗漏从编译期挪到运行期（本仓老教训），
   * 故漏装配 ⇒ 编译报错。全仓装配点只有 5 处（组合根 + 4 个测试 harness）。
   */
  hostFs: HostFsPort
  /**
   * 知识层端口（REQ-261001110934-3766 t4）。**可选**：未装配时 reqboard_kb 响亮报错，
   * 其余链路（注入/归档）各自按需判断——保证既有测试夹具与老行为不受影响。
   */
  knowledge?: KnowledgePort
  /** 注入侧灰度设置（t8）；缺省 = 不追加索引节、不瘦身文档。 */
  knowledgeInject?: KnowledgeInjectSettings
  /**
   * 知识层自举通知口（REQ-261004174324-4195 t4）：工作区根被校正后通知一次（即发即忘）。
   * 缺省 = 不自举（老行为）；装配点在组合根（`application/internal/knowledge-bootstrap`）。
   * 第二参 `projectId`（REQ-261005141830-7a3b t5 · FR-6）：同一项目多窗口只自举一次的去重键。
   */
  knowledgeBootstrap?: { ensure(root?: string, projectId?: string): void }
  /**
   * 包内 skill 资产读端口（REQ-261005122347-e07a FR-1）。**可选**：未装配时
   * `reqboard_skill_install` 响亮报错，其余链路（注入/推进/归档）一概不受影响——
   * 保证既有测试夹具不必逐个补桩。
   */
  skillAssets?: SkillAssetPort
  /** 投放端口（FR-5 / FR-6）。未装配 → 工具响亮报错（不静默降级成"没资产"）。 */
  skillInstall?: SkillInstallPort
  /**
   * skills 开关与投放根（FR-7）：由组合根用 `skillsSettings(config)` 注入（非法配置装配期抛错）。
   * 缺省（未装配）= 开启 + root 落会话工作区，与"不写配置"逐字一致。
   */
  skillsSettings?: { readonly enabled: boolean; readonly root?: string }
  /**
   * 插件自身身份（name/version/build）：写进 skill 投放清单，让"这份资产是哪一版插件放的"可追溯。
   * 缺省 = 用 `dsh-pmboard` / `unknown`（不影响投放成功，只影响清单里的溯源字段）。
   */
  pluginMeta?: { readonly name: string; readonly version: string; readonly build?: string }
  /**
   * 阶段模型路由表（REQ-261004110201-f253 FR-1）。由组合根用 `stageRoutingSetting(config)` 注入
   * ——**校验发生在装配期**（非法配置在那里就抛，不在执行期才发现）。
   * 缺省/空表 = 不注入 provider/model（生成脚本与改造前逐字节相同）。
   */
  stageRouting?: Record<string, { provider?: string; model?: string }>
  /**
   * 零产出告警阈值（REQ-261004110201-f253 FR-3）。由组合根用 `zeroOutputAlertThresholdSetting(config)`
   * 注入（非法配置装配期抛错）。缺省 2；同一需求同一阶段**连续**零产出达到该次数写一条告警评论。
   */
  zeroOutputAlertThreshold?: number
  /**
   * 全局在制需求上限（REQ-261004110201-f253 FR-4）。由组合根用 `maxInFlightRequirementsSetting(config)`
   * 注入；缺省 0 = 不限。在制判据 = 有新鲜推进锁（真有 run 在跑）。
   */
  maxInFlightRequirements?: number
  /**
   * 归档清单未列闸门（REQ-261004183621-de3f FR-6）：`enforce`（缺省）= 未列未豁免且未声明 → 拒绝；
   * `warn` = 旧语义（只记对账结果与留痕，不拦）。由组合根用 `archiveGateSetting(config)` 注入。
   */
  archiveUnlistedGate?: 'enforce' | 'warn'
  /**
   * 一轮容量与标记门禁（REQ-261002175818-80a8 t5 / FR-3、FR-5）。组合根把 `config.capacity`
   * 原样注入，**解析仍由 `plugin-config` 单点做**（`resolveRoundCapacity` / `markerGateOf`）——
   * 用例侧不重复缺省逻辑，缺省 = 常量 16 DU + enforce，与没配过逐字一致。
   */
  capacity?: {
    roundDetailUnits?: number
    markerGate?: 'enforce' | 'warn'
  }
  clock: Clock
  ids: IdFactory
  session: SessionProbe
  questions: UserQuestionPort
  /**
   * 任务存储（队列）端口（REQ-260927202051-f6df I-1）。**缺省 = 未装配**：
   * 用例在读任务时必须显式判空并走"队列不可用"的明确失败/降级路径，
   * 不得假装成功（与 `workflow` / `teams` / `jobs` 的缺省语义一致）。
   */
  taskStore?: TaskStore
  /** done 批量关闭节流窗口（毫秒，默认 60000；测试可注入 0 关闭）。 */
  doneThrottleMs?: number
  /**
   * 弹框缺省宽限（毫秒，REQ-261004065652-5c1c FR-7）。
   *
   * `reqboard_ask_confirm` **不传** `inline_grace_ms` 时的等待上限：
   *   · 缺省 600000（10 分钟）——修前缺省是**全阻塞**，实测吞掉宿主的 3600000ms 工具超时后才 abort；
   *   · `0` = 显式回到旧的全阻塞（一键回退）；
   *   · 未装配 `pendingConfirms` 时本项**无效**（没有挂起能力，只能阻塞——不制造"假非阻塞"）。
   */
  confirmDefaultGraceMs?: number
  /** 立项拒绝留痕（FR-5；缺省 = 无粘滞，行为与 FR-5 前一致）。 */
  rejections?: CaptureRejectionPort
  /**
   * 子卡执行端口（REQ-4842fe t4）。缺省 = 引擎不可用——执行子卡时**显式失败**
   * （ok:false, reason=engine_unavailable），绝不静默成功。
   */
  workflow?: WorkflowRunner
  /**
   * 团队执行端口（FR-11 路线 A / REQ-260926140539-457b）：子卡实施段改走 DSH 原生 Agent Teams。
   * 缺省 = 服务不可用 → 调用方退回 workflow 兼容路径（不静默成功）。
   */
  teams?: AgentTeamsPort
  /** 失败告警通道（缺省 = 只留痕不告警，由组合根决定）。 */
  alert?: FailureAlertPort
  /**
  /**
   * 挂起确认注册表（REQ-260924213231-b1c4 FR-3）。缺省 = 未装配非阻塞能力 →
   * 弹框保持旧的阻塞语义（宽限内作答与原返回体逐字一致）。
   */
  pendingConfirms?: PendingConfirmPort
  /**
   * 在途弹框登记（REQ-261002141430-a5ef FR-1/FR-3）：自动链据此停手等人。
   * 缺省 = 未装配 → 停手判据恒为假，行为与改动前逐字一致（向后兼容）。
   */
  dialogs?: DialogInFlightPort
  /**
   * 停手位被清 → 请求一次自动链驱动（REQ-261006170150-52cc FR-2）。
   *
   * 组合根实现 = `(id) => diveManager.roundDriver().onRequirementMoved(id)`——
   * **与 store 桥同一条路**（需求 → sourceSessionId → agents.get → requestDrive，含误停摆重武装），
   * 因此不新增任何进会话的投递路径（唤醒仍唯一经 round 半的预留 → 投递 → 准入）。
   *
   * 缺省 undefined = 未装配 ⇒ 清位只写台账、不请求驱动，行为与改造前逐字一致。
   */
  notifyDrivable?: (requirementId: string) => void
  /**
   * 后台任务端口（REQ-260925110957-552d FR-1）。缺省 = 后台任务系统不可用 →
   * advanceRequirement 显式返回 {dispatched:false, reason:'jobs_unavailable'}。
   */
  jobs?: JobsPort
  /**
   * 在线 agent 查询（D14 修复）：子卡派发需要 agent 句柄（引擎读 request.parent.session），
   * 而看板「继续」/启动恢复这两条入口没有调用窗口的 exec。runSubtaskStep 据此按父卡所属
   * 需求的绑定窗口兜底解析；解不到则**响亮失败**（不再抛引擎 TypeError）。缺省 = 视为不在线。
   */
  agents?: () => { get?: (id: string) => unknown } | undefined
  /**
   * 会话开窗端口（REQ-261003215944-9e04 FR-1）。缺省 = 未装配 → `reqboard_open_window`
   * 响亮失败（`REQBOARD_OPEN_WINDOW_UNAVAILABLE`），不伪造窗口码。
   */
  /**
   * 文件路径选择端口（REQ-261004103330-005f，2026-10-04）：「选择…」由宿主弹原生窗口。
   * 缺省 = 宿主没接 → 路由 501 `path_picker_unavailable`，界面提示手输。
   */
  pickStoragePath?: StoragePathPickerPort
  windowOpener?: WindowOpenerPort
  /**
   * 跨窗口投递端口（FR-7）。缺省 = 未装配 → 开窗后不投递（如实说明），不伪造"已送达"。
   */
  crossWindowDeliver?: CrossWindowDeliveryPort
  /**
   * 交接水位三档（REQ-261004150249-731e FR-3）。缺省 = 内置 `0.75 / 0.85 / 0.90`
   * （与 `plugin-config.handoffSettings` 的缺省同值）——**未装配不等于不判据**：
   * 用例按内置缺省走，逐档行为与「配置了同值」一致。
   *
   * 组合根把 `handoffSettings(config)` 注进来是另一张卡（本卡只加这一个字段）。
   */
  handoff?: HandoffThresholds
  /**
   * 易变段尾部投递端口（REQ-261007100513-6749 t3 · FR-2/FR-3 ← I-2）。
   *
   * **可选 = 未装配时行为与改造前逐字一致**：写路径（`MoveTask` / `MoveRequirement` /
   * 待捕获登记）只调 `notify()` 表达"这一段变了"这一**意图**，去重/去抖/投递/降级全在实现里
   * （`application/internal/notice-delivery.ts`，装配见组合根）。未装配时三个调用点直接返回
   * （`notifyVolatileQuietly` 的缺省分支）——不排定时器、不留痕、不改任何正文。
   *
   * 纪律：**永不抛、不 await 成功语义**（状态已落账，因通知失败回滚 = 状态倒退）。
   */
  volatileNotice?: VolatileNoticePort
  /**
   * 子卡**请求预算**的运行态端口（REQ-261007100513-6749 t5 · FR-6 ← design/data-model.md）。
   *
   * **可选 = 未装配时行为与改造前逐字一致**：整条预算链（计数订阅器 / 到顶先停后报 / 幂等放行）
   * 在 `deps.subtaskBudget === undefined` 时**整体零行为**——不订阅会话事件、不读写运行态文件、
   * 不拦也不放；`reqboard_task_move({budget})` 响亮回 `REQBOARD_STORE_INCONSISTENT`（不假成功；不新造码）。
   *
   * 端口自身的失败语义见 `SubtaskBudgetPort`：`read()` 缺失/损坏 → `undefined` = **计数不可得**
   * （调用方显式降级并留痕，**不按 0 通过**）；`write()` 失败 → 告警 + 留痕 + **不阻断开工**。
   */
  subtaskBudget?: SubtaskBudgetPort
  /**
   * 子卡预算的**运行时状态**（按会话计数 + 独立停手位；REQ-261007100513-6749 t5 返工 · P1/P2）。
   *
   * **可选 = 未装配时降级**：计数订阅器会自持一份进程内实例（执法照样生效），只是
   * `reqboard_task_move({budget:{release:true}})` 的放行**清不到**那些会话窗口与停手位
   * （它们与计数器不同实例）——故组合根**必须**注入与计数器**同一个**实例
   * （见 `index.ts`：一个实例，两处引用）。契约与语义见 `SubtaskRuntimePort`。
   */
  subtaskRuntime?: SubtaskRuntimePort
}