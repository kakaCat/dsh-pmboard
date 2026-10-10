/**
 * 设置弹窗的**客户端视图模型类型**（REQ-261004103330-005f t11 / 设计 `frontend.md` §目录与包结构）。
 *
 * 为什么单独一份而不是直接 import 服务端类型：服务端 `ResolvedRunSettings` 里有 `Promise`、
 * 端口与内部字段（`problems` 的构造细节等），客户端只该拿到**渲染需要的那几个字段**。
 * 窄投影还能让"接口改了什么"在编译期暴露在客户端，而不是运行时读到 `undefined`。
 *
 * @module dsh-pmboard/client/settings/types
 */

/** 阶段键（与需求状态同名；此处只列设置表会出现的九个）。 */
export type StageKey =
  | 'draft' | 'brainstorming' | 'design' | 'decomposing' | 'implementing'
  | 'accepting' | 'done' | 'archived' | 'canceled'

/** 存储后端（FR-6）。 */
export type StorageBackend = 'json' | 'sqlite'

/** 单项来源（FR-2/FR-6）：看板据此显示「这个值是谁给的」。 */
export type SettingsSource = 'settings' | 'config' | 'env' | 'default'

/** 四屏的键（左菜单与 `data-pane` 共用同一套字面量）。 */
export type SettingsPane = 'limits' | 'storage' | 'records' | 'general'

/** `GET /settings` 的单阶段项。 */
export interface StageLimitView {
  readonly value: number
  readonly default: number
  readonly source: SettingsSource
}

/** `GET /settings` 的 `storage` 块。 */
export interface StorageSettingsView {
  readonly backend: { readonly value: StorageBackend; readonly source: SettingsSource }
  readonly sqlitePath: string
  /** 本进程**实际**在用的后端；与 `backend.value` 不同 = 待重启生效。 */
  readonly effective: StorageBackend
  readonly restartRequired: boolean
}

/** `GET /settings` 的 `plugin` 块（FR-15）。 */
export interface PluginStampView {
  readonly name: string
  readonly version: string
  readonly buildStamp: string
}

/**
 * `GET /settings` 的 `system` 摘要块。
 *
 * 两种形态都要能表达（t2 裁定）：`ok:true` 是正常摘要；`ok:false + invalid:true` 是
 * **记录文件损坏**——服务端刻意不 500，让设置页其余屏照常可用，只在系统记录屏红字。
 */
/** 两个载体的体检快照（服务端 `system.stores` 的形状；字段全可选 = 服务端多给少给都不炸）。 */
export interface SystemStoresView {
  readonly shards?: {
    readonly exists?: boolean
    readonly requirements?: number
    readonly bytes?: number
    readonly headRevision?: number
    readonly lastWriteAt?: string
  }
  readonly sqlite?: {
    readonly exists?: boolean
    readonly requirements?: number
    readonly bytes?: number
    readonly migratedAt?: string
    readonly stale?: boolean
    readonly staleReason?: string
  }
}

export interface SystemSummaryView {
  readonly ok: boolean
  readonly exists?: boolean
  readonly updatedAt?: string
  readonly events?: number
  /** 两份计数口径都暴露、**永不相加**（t2 裁定）：进程内 = 现在还在丢；Total = 历史累计。 */
  readonly droppedEvents?: number
  readonly droppedEventsTotal?: number
  /** 损坏时的可读原因（`ok:false` 时给）。 */
  readonly reason?: string
  readonly path?: string
  readonly hint?: string
  /** 路径档案（正常时给）。 */
  readonly paths?: {
    readonly settingsFile?: string
    readonly systemFile?: string
    readonly shardDataRoot?: string
    readonly sqliteFile?: string
  }
  /**
   * 两个载体的体检快照（`ok:true` 时才给）。
   *
   * 用途（t13 补齐）：影响清单里的"要迁移 N 条"取 `stores.shards.requirements`（源侧真实条数），
   * 迁移清单的"建库 / 迁移"两步取 `stores.sqlite.*`——这些都是**可观测事实**，不是编出来的进度。
   */
  readonly stores?: SystemStoresView
}

/**
 * `GET /settings` 的顶层 `settingsFile` 块——**R7 的真信号源**。
 *
 * 与 `types.ts` 初版的差异（读 `src/http/routers/settings.ts` 的 `handleGetSettings` 后修正）：
 * "设置文件在不在"是**顶层**字段，不在 `system.paths` 里。惰性创建（FR-17）下不存在是正常态，
 * 故按钮要据此置灰并解释，而不是去打开一个不存在的路径。
 */
export interface SettingsFileView {
  readonly exists: boolean
  readonly path?: string
}

/** `GET /settings` 的完整响应（本卡只用其中骨架需要的那几块）。 */
export interface RunSettingsView {
  readonly plugin: PluginStampView
  readonly stageMaxRounds: Readonly<Partial<Record<StageKey, StageLimitView>>>
  readonly storage: StorageSettingsView
  readonly settingsFile: SettingsFileView
  readonly system: SystemSummaryView
  /** 被作废的设置项（服务端逐项记账；骨架期只在失败态里展示条数）。 */
  readonly problems?: readonly { readonly key: string; readonly reason: string }[]
}

/** 系统记录文件损坏时服务端给的可读形状（t2 口径：200 + invalid 标记，不 500）。 */
export interface SystemRecordInvalidView {
  readonly ok: false
  readonly invalid: true
  readonly reason: string
  readonly path?: string
  readonly hint?: string
}

/** `GET /settings/system` 的成功形状（系统记录全量；仅声明本卡与后续屏会用到的字段）。 */
export interface SystemRecordView {
  readonly ok: true
  readonly updatedAt: string
  readonly plugin: PluginStampView & { readonly sqliteSchemaVersion: number; readonly recordedAt: string }
  readonly paths: Record<string, unknown>
  readonly active: { readonly backend: StorageBackend; readonly since: string; readonly source: SettingsSource }
  readonly stores: Record<string, unknown>
  readonly history: readonly Record<string, unknown>[]
  readonly counters: Record<string, number>
  readonly compat: Record<string, unknown>
  /** 进程内被丢弃的事件数（> 0 = 现在还在丢，看板红字）。 */
  readonly droppedEvents?: number
}

/** 切换后端的响应（FR-6/FR-11）。 */
export interface StorageSwitchResult {
  readonly backend: StorageBackend
  readonly restartRequired: boolean
  readonly systemEvent?: string
}

/** 发起迁移的响应（FR-10）：拿到窗口键即"窗口已开"。 */
export interface MigrationStartResult {
  readonly windowKey: string
  readonly sessionId?: string
  readonly task?: string
}

/** 确认票据（FR-11）：先取票、人作答落章、再带票执行。 */
export interface StorageActionTicket {
  readonly ticket: string
  readonly action: string
  /**
   * 过期时刻：**毫秒时间戳**（`number`）。
   *
   * 2026-10-04 t15 端到端核对：服务端回的就是 number（`settings.ts` 里 `rec.createdAt + LIMITS.pendingConfirmTtlMs`），
   * 原先这里写成 `string` 是**类型说谎**——前端若照它当 ISO 字符串处理（如 `.slice()`）会当场炸。
   * 过期即作废（前端也主动作废，不只依赖服务端）。
   */
  readonly expiresAt?: number
}
