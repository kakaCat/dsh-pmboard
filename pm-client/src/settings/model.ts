/**
 * 设置弹窗的**纯函数模型**（REQ-261004103330-005f t11 / 设计 `frontend.md` §测试与可测性钩子）。
 *
 * 纪律（与 `client/views/*` 同款，也是本卡能在 Node 环境直测的原因）：
 *   · **零 DOM、零 IO、零时间**——所有外部输入由参数给，所有输出是字符串或新状态；
 *   · 状态迁移写成纯 reducer，DOM 只在 `controller.ts` 里碰（唯一有副作用的文件）。
 *
 * `SETTINGS_ACTIONS` 是**委派契约的唯一来源**：渲染出来的 `data-action` 必须都在这个清单里，
 * 否则就是"渲染了但没人处理"的死按钮——测试会断言这一点。
 *
 * @module dsh-pmboard/client/settings/model
 */

import type {
  SettingsPane, SettingsSource, StageKey, StageLimitView, StorageActionTicket, StorageBackend,
  StorageSettingsView, SystemRecordInvalidView, SystemRecordView,
} from './types.ts'
import type { MigrationPhase, StorageActionKind } from './storage.ts'

/** 全部 `data-action`（渲染与委派的**同一份**清单）。 */
export const SETTINGS_ACTIONS = [
  'settings-open',
  'settings-close',
  'settings-pane',
  'settings-open-config',
  'settings-jump-session',
  // t12（运行上限屏）：登记在清单里才不是"死按钮"——t11 的渲染守卫会逐个数，
  // 多一个没登记的 data-action 就会红。新增动作必须同时在这里与委派处各加一次。
  'settings-limit-reset',
  'settings-limit-save',
  'settings-limit-discard',
  // t13（存储与数据库屏）：同样必须先登记——渲染守卫会数"没登记的 data-action"（死按钮）。
  // 五个动作对应"发起切换 / 发起迁移 / 确认后继续执行 / 取消 / 失败后重来"。
  'settings-storage-switch',
  'settings-storage-migrate',
  'settings-storage-confirm',
  'settings-storage-cancel',
  'settings-storage-retry',
  // 对齐趟 2：原型「改路径」（PATCH /settings 的 storage.sqlitePath）。逻辑在 `storage-path.ts`，
  // 但动作**必须**登记在这里——不登记就是死按钮（守卫会红）。
  'settings-storage-path-save',
  'settings-storage-path-cancel',
  // 2026-10-04 人要求「改路径」要像操作系统那样开窗口选：动作同样必须先登记。
  'settings-storage-path-pick',
] as const
export type SettingsAction = (typeof SETTINGS_ACTIONS)[number]

/** 四屏的键与标题（左菜单顺序即此顺序）。 */
export const SETTINGS_PANES: readonly { readonly key: SettingsPane; readonly label: string }[] = [
  { key: 'limits', label: '运行上限' },
  { key: 'storage', label: '存储与数据库' },
  { key: 'records', label: '系统记录' },
  { key: 'general', label: '通用' },
]

/** 面板标题（`aria-labelledby` 与屏标题共用，避免两处各写一份）。 */
export function paneLabel(pane: SettingsPane): string {
  return SETTINGS_PANES.find((p) => p.key === pane)?.label ?? ''
}

/** 弹窗壳的状态（本卡只管壳：开合、当前屏、加载/失败）。四屏内容态由后续卡扩展。 */
export interface SettingsShellState {
  readonly open: boolean
  readonly pane: SettingsPane
  /** 取数中（骨架期显示"载入中"；后续屏各自有更细的加载态）。 */
  readonly loading: boolean
  /** 取数失败的**人话**消息（不塞 stack，不塞 code）。 */
  readonly error?: string
  /** 设置文件是否已存在（R7：不存在则「打开配置文件」置灰并解释）。 */
  readonly settingsFileExists: boolean
  /** 设置文件绝对路径（未知则 undefined）。 */
  readonly settingsFilePath?: string
  /**
   * **系统记录文件**的绝对路径（`dsh-reqboard-system.json`）。
   *
   * 来源是 `GET /settings` **摘要**的 `system.paths.systemFile`——**不是**记录文件自身：
   * `StorePaths`（记录内容）里**没有**这个字段，文件不会记自己叫什么。
   * 2026-10-04 我曾在记录内容里找它、还用类型转换把 `tsc` 挡住，结果读出来永远是 undefined（空转）。
   */
  readonly systemFilePath?: string
  /** 来源徽章数据（骨架期只为「通用」屏的版本展示保留）。 */
  readonly pluginVersion?: string
  /**
   * 各阶段的生效上限（t12）：`GET /settings` 的 `stageMaxRounds`。
   * 骨架期没有它（`undefined`）——那时本屏渲染空表而不是编造默认值。
   */
  readonly limits?: Readonly<Partial<Record<StageKey, StageLimitView>>>
  /** 本屏的**草稿**（t12，值一律存字符串：把"用户输入的原文"与"解析后的数字"分开，才谈得上"非法值当场拦"）。 */
  readonly drafts: Readonly<Partial<Record<StageKey, string>>>
  /** 保存中（按钮禁用并改文案，避免连点）。 */
  readonly saving: boolean
  /** 保存失败的**人话**消息（服务端原话优先）。 */
  readonly saveError?: string
  // ── t13：存储与数据库屏（后端概览 + 确认门四态机 + 迁移清单事实） ──────────────
  /** `GET /settings` 的 storage 块；缺省 = 还没取到数（渲染"未知"而不是编造）。 */
  readonly storage?: StorageSettingsView
  /** 本屏状态机（设计 R8）。 */
  readonly storagePhase: MigrationPhase
  /** 正在确认/执行的动作。 */
  readonly storageAction?: StorageActionKind
  /**
   * 确认票据（**只存内存**：不落 localStorage——刷新即失效，这是 FR-11 的要求，
   * 也让"票据被谁拿去重放"这件事在客户端不可能发生）。
   */
  readonly storageTicket?: StorageActionTicket
  /** 迁移窗口键（窗口已开出的**事实**）。 */
  readonly migrationWindowKey?: string
  /** 本屏错误文案（已按错误码翻成人话；不塞 stack）。 */
  readonly storageError?: string
  /** 迁移条数（服务端给才有；不给就不写数字，见 render 层的 impactLines）。 */
  readonly migrationRequirements?: number
  readonly sqliteExists?: boolean
  readonly sqliteRequirements?: number
  // ── t14：系统记录屏与通用屏 ────────────────────────────────────────────────
  /**
   * 系统记录全量（`GET /settings/system`）。`undefined` = 还没取到——
   * 与"读到了但内容坏"（`ok:false`）是**两件事**，渲染层必须分开呈现。
   */
  readonly systemRecord?: SystemRecordView | SystemRecordInvalidView
  readonly systemLoading?: boolean
  /** 取不到记录时的人话（不是"档案损坏"，是"读不到"）。 */
  readonly systemError?: string
  /** 「改路径」的失败人话（对齐趟 2；只影响存储屏那一行的提示，不动迁移状态机）。 */
  readonly pathError?: string
  /**
   * `GET /settings` 摘要里的路径档案（对齐趟 2）。
   *
   * 为什么单独存：通用屏的「台账数据根」与存储屏的手动迁移命令都要它，
   * 而它**在弹窗一打开就有了**——不能等"人点过记录屏"才显示（那会让人以为路径未知）。
   */
  readonly shardDataRoot?: string
  /** 构建指纹（通用屏展示；服务端给才有）。 */
  readonly pluginBuildStamp?: string
}

/** 初始状态（关闭态、默认停在「运行上限」）。 */
export function initialShellState(): SettingsShellState {
  return {
    open: false, pane: 'limits', loading: false, settingsFileExists: false, drafts: {}, saving: false,
    storagePhase: 'idle',
  }
}

/** 壳事件（控制器把 DOM 事件翻成这些再交给 reducer）。 */
export type SettingsShellEvent =
  | { readonly kind: 'open'; readonly pane?: SettingsPane }
  | { readonly kind: 'close' }
  | { readonly kind: 'set-pane'; readonly pane: SettingsPane }
  | { readonly kind: 'load-start' }
  | {
    readonly kind: 'load-ok'
    readonly settingsFileExists: boolean
    readonly settingsFilePath?: string
    /** 系统记录文件路径（摘要里给的；缺省 = 未返回，不猜）。 */
    readonly systemFilePath?: string
    readonly pluginVersion?: string
    /** t12：把上限读进状态（缺省 = 服务端没给，不编造）。 */
    readonly limits?: Readonly<Partial<Record<StageKey, StageLimitView>>>
    /** t12：取数（含保存后重取）会**清空草稿**——服务端值已是权威，留着旧草稿会立刻又变"脏"。 */
    readonly clearDrafts?: boolean
    /** t13：后端概览（含 effective / restartRequired——"待重启"就靠它说清）。 */
    readonly storage?: StorageSettingsView
    /** t14：构建指纹（通用屏用；服务端给才传）。 */
    readonly pluginBuildStamp?: string
    /** 摘要里的分片数据根（通用屏「台账数据根」与手动迁移命令用）。 */
    readonly shardDataRoot?: string
    /** t13：迁移清单的可观测事实（服务端给才有；不给就标"无法确认"，不编造进度）。 */
    readonly migrationRequirements?: number
    readonly sqliteExists?: boolean
    readonly sqliteRequirements?: number
  }
  | { readonly kind: 'load-fail'; readonly message: string }
  /** 一条**给人看的**提示（走状态条，不走 console）——用于「点了但做不成」这类情况。 */
  | { readonly kind: 'notice'; readonly message: string }
  // ── t12：运行上限屏的草稿与保存 ───────────────────────────────────────────
  | { readonly kind: 'set-draft'; readonly stage: StageKey; readonly raw: string }
  | { readonly kind: 'reset-draft'; readonly stage: StageKey }
  | { readonly kind: 'clear-drafts' }
  | { readonly kind: 'save-start' }
  | { readonly kind: 'save-ok' }
  | { readonly kind: 'save-fail'; readonly message: string }
  // ── t13：存储与数据库屏 ────────────────────────────────────────────────
  | {
    readonly kind: 'storage-phase'
    readonly phase: MigrationPhase
    readonly action?: StorageActionKind
    readonly error?: string
  }
  | { readonly kind: 'storage-ticket'; readonly ticket: StorageActionTicket }
  | { readonly kind: 'storage-window'; readonly windowKey: string }
  /** 取消 / 失败后清票（一次性票据：失败即作废，重来要重新确认）。 */
  | { readonly kind: 'storage-clear' }
  /** 改路径的保存结果（对齐趟 2）。`message` 缺省 = 成功，随之清掉旧错误。 */
  | { readonly kind: 'storage-path-result'; readonly message?: string }
  // ── t14：系统记录取数（与壳的 load-* 分开：四屏各有自己的取数） ──────────────
  | { readonly kind: 'record-start' }
  | { readonly kind: 'record-ok'; readonly record: SystemRecordView | SystemRecordInvalidView }
  | { readonly kind: 'record-fail'; readonly message: string }

/**
 * 壳状态迁移（纯函数：同一输入必得同一输出，便于直测）。
 *
 * 两条刻意的行为：
 *   · `open` 在**已打开**时只切屏、不重置加载态（与设计"若已开则聚焦，不重开"一致）；
 *   · `load-fail` **保留**上一次已知的 `settingsFilePath`（失败不该让按钮突然失去路径）。
 */
export function reduceShell(state: SettingsShellState, event: SettingsShellEvent): SettingsShellState {
  switch (event.kind) {
    case 'open': {
      const pane = event.pane ?? state.pane
      // 已开且屏没变 → **返回同一引用**：控制器据此不重绘、不重置加载态（设计「已开则聚焦，不重开」）
      if (state.open && pane === state.pane) return state
      return { ...state, open: true, pane }
    }
    case 'close':
      return { ...state, open: false }
    case 'set-pane':
      return state.pane === event.pane ? state : { ...state, pane: event.pane }
    case 'load-start':
      return { ...state, loading: true, error: undefined }
    case 'load-ok':
      return {
        ...state,
        loading: false,
        error: undefined,
        settingsFileExists: event.settingsFileExists,
        ...(event.settingsFilePath !== undefined ? { settingsFilePath: event.settingsFilePath } : {}),
        systemFilePath: event.systemFilePath,
        ...(event.pluginVersion !== undefined ? { pluginVersion: event.pluginVersion } : {}),
        ...(event.limits !== undefined ? { limits: event.limits } : {}),
        ...(event.clearDrafts === true ? { drafts: {} } : {}),
        ...(event.storage !== undefined ? { storage: event.storage } : {}),
        ...(event.migrationRequirements !== undefined ? { migrationRequirements: event.migrationRequirements } : {}),
        ...(event.sqliteExists !== undefined ? { sqliteExists: event.sqliteExists } : {}),
        ...(event.sqliteRequirements !== undefined ? { sqliteRequirements: event.sqliteRequirements } : {}),
        ...(event.pluginBuildStamp !== undefined ? { pluginBuildStamp: event.pluginBuildStamp } : {}),
        ...(event.shardDataRoot !== undefined ? { shardDataRoot: event.shardDataRoot } : {}),
      }
    case 'load-fail':
      return { ...state, loading: false, error: event.message }
    case 'notice':
      // 目标：**不允许出现「点了没反应」**——做不成就把原因放到状态条上（aria-live）。
      return { ...state, error: event.message }
    case 'set-draft':
      return { ...state, drafts: { ...state.drafts, [event.stage]: event.raw }, saveError: undefined }
    case 'reset-draft': {
      const next = { ...state.drafts }
      delete next[event.stage]
      return { ...state, drafts: next, saveError: undefined }
    }
    case 'clear-drafts':
      return { ...state, drafts: {}, saveError: undefined }
    case 'save-start':
      return { ...state, saving: true, saveError: undefined }
    case 'save-ok':
      return { ...state, saving: false, drafts: {}, saveError: undefined }
    case 'save-fail':
      return { ...state, saving: false, saveError: event.message }
    // ── t13：存储屏 ──────────────────────────────────────────────────────
    case 'storage-phase':
      return {
        ...state,
        storagePhase: event.phase,
        ...(event.action !== undefined ? { storageAction: event.action } : {}),
        ...(event.error !== undefined ? { storageError: event.error } : (event.phase === 'idle' ? { storageError: undefined } : {})),
      }
    case 'storage-ticket':
      return { ...state, storageTicket: event.ticket, storageError: undefined }
    case 'storage-window':
      return { ...state, migrationWindowKey: event.windowKey }
    // ── t14：系统记录 ───────────────────────────────────────────────────
    case 'record-start':
      return { ...state, systemLoading: true, systemError: undefined }
    case 'record-ok':
      // 取到了就同时清掉 loading 与 error（"上次读失败"不该粘着新结果）
      return { ...state, systemLoading: false, systemError: undefined, systemRecord: event.record }
    case 'record-fail':
      return { ...state, systemLoading: false, systemError: event.message }
    case 'storage-path-result': {
      const { pathError: _drop, ...rest } = state
      return event.message === undefined ? { ...rest } : { ...state, pathError: event.message }
    }
    case 'storage-clear':
      // 清票 + 回 idle：**取消/失败后不许复用旧票**（一次性票据是 FR-11 的硬要求）
      return {
        ...state,
        storagePhase: 'idle',
        storageTicket: undefined,
        storageAction: undefined,
      }
  }
}

/**
 * `Tab` 循环的下一个焦点序号（纯函数，便于单测）。
 *
 * 为什么要有它：本设计**不**做焦点陷阱的强实现（与宿主其它弹层保持同等宽松度），
 * 只保证"从最后一项 Tab 回到第一项"这一条不让人迷路。
 */
export function nextFocusIndex(current: number, count: number, shift: boolean): number {
  if (count <= 0) return 0
  const from = current < 0 || current >= count ? 0 : current
  return shift ? (from - 1 + count) % count : (from + 1) % count
}

/** 来源徽章（FR-2/FR-6）：类名与人话都从这里出，避免各屏各写一套。 */
export function badgeOf(source: SettingsSource): { readonly cls: string; readonly label: string } {
  switch (source) {
    case 'settings': return { cls: 'dsh-pm-set-badge is-file', label: '设置文件' }
    case 'config': return { cls: 'dsh-pm-set-badge is-config', label: '插件配置' }
    case 'env': return { cls: 'dsh-pm-set-badge is-env', label: '环境变量' }
    case 'default': return { cls: 'dsh-pm-set-badge is-default', label: '内置默认' }
  }
}

/**
 * 「生效时机」的人话（FR-6）：
 * **目标与当前进程不一致时必须说"要重启"**——这是最容易让人以为"点了没生效"的一句话。
 */
export function whenText(effective: StorageBackend, restartRequired: boolean): string {
  const now = effective === 'sqlite' ? 'SQLite' : 'JSON 分片'
  return restartRequired
    ? '重启宿主后生效（当前进程仍在使用 ' + now + '）'
    : '已在生效（' + now + '）'
}

/** 「打开配置文件」按钮是否可点（R7：惰性创建时文件可能还不存在）。 */
/**
 * 「打开配置文件」这一下**该干什么**（把决定从控制器里提出来，才谈得上直测）。
 *
 * - 文件在 → `open`（交给宿主的打开通道）；
 * - 文件还没创建（惰性创建下的**正常态**）→ `explain`：**跳到「通用」屏**，
 *   那里有成句解释（首次保存上限、或确认一次切库后才落盘）。
 *   为什么不干站着：`disabled` 的按钮不派发点击，用户看到的就是「点了没反应」——
 *   这正是 2026-10-04 人报的那个问题。
 */
export type OpenConfigIntent =
  | { readonly kind: 'open'; readonly path: string }
  | { readonly kind: 'explain'; readonly pane: SettingsPane; readonly hint: string }

/**
 * 系统记录文件的路径（`dsh-reqboard-system.json`）。
 *
 * 2026-10-04 人明确：「打开配置文件，应该是**系统文件 json**、路径等信息」——**这个对**。
 * 于是页头那个按钮改为优先打开它：它**始终存在**（启动时自动建档），里面有路径档案、版本、
 * 后端使用史、迁移留痕；而设置文件在"人还没保存过"时根本不存在（惰性创建）。
 * 档案损坏（`ok:false`）时不给路径——**不猜**。
 */
export function systemFilePathOf(state: SettingsShellState): string | undefined {
  // 直接读状态字段（由 `load-ok` 从**摘要**灌进来）。**不再**去记录内容里找：
  // 那里没有这个字段，而且当初用类型转换绕过了类型检查，把"读错层"藏成了"永远拿不到"。
  return state.systemFilePath
}

export function openConfigIntent(state: SettingsShellState): OpenConfigIntent {
  // ① 系统记录文件优先（人确认过的目标）
  const sys = systemFilePathOf(state)
  if (sys !== undefined) return { kind: 'open', path: sys }
  // ② 退到设置文件（它存在时）
  if (canOpenConfig(state) && state.settingsFilePath !== undefined) {
    return { kind: 'open', path: state.settingsFilePath }
  }
  // ③ 都拿不到：把人带到「通用」屏看解释，**不留死点击**
  return { kind: 'explain', pane: 'general', hint: openConfigHint(state) }
}

/** 页头按钮旁那句**可见**的短说明（不靠悬停）。文件可打开时为空串。 */
export function openConfigBadge(state: SettingsShellState): string {
  if (openConfigIntent(state).kind === 'open') return ''
  return state.settingsFilePath === undefined ? '拿不到路径' : '尚未创建'
}

export function canOpenConfig(state: SettingsShellState): boolean {
  return state.settingsFilePath !== undefined && state.settingsFileExists
}

/** R7 的置灰提示文案（按钮 `title` 与旁注共用）。 */
export function openConfigHint(state: SettingsShellState): string {
  if (state.settingsFilePath === undefined) return '暂时拿不到设置文件路径（服务端未返回）'
  // 措辞与「通用」屏同一句（t14 统一）：惰性创建下"还没创建"是正常态，要给出生成条件
  if (!state.settingsFileExists) return '尚未创建：首次保存后生成（保存一次上限、或确认一次切库后就会出现）'
  return '在侧栏打开设置文件'
}

/** 断言渲染出的 action 都在清单内（供渲染测试复用；不在清单里 = 死按钮）。 */
export function unknownActions(actions: readonly string[]): string[] {
  const known = new Set<string>(SETTINGS_ACTIONS)
  return [...new Set(actions.filter((a) => !known.has(a)))]
}
