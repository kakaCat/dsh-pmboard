/**
 * 存储与数据库屏的**纯逻辑与文案**（REQ-261004103330-005f t13 / 设计 `frontend.md` 屏 2 + R8 四态机）。
 *
 * 与 `limits.ts` 同款纪律：**零 DOM、零副作用**——渲染在 `render/storage.ts`，这里只回答
 * "现在处于哪一态、清单该显示什么、这条错误该怎么用中文说清"。因此可直接在 Node 环境单测。
 *
 * ## 本屏最关键的一条事实：**同意不在本弹窗里落章**（读服务端代码后确认）
 *
 * `POST /settings/storage/request` 除了发票据，还会经作答通道**把人真正要作答的确认框推出去**
 * （`pushStorageConfirmBox`），并只在**人在那个框里作答**后才 `settle` 落章。
 * 因此本屏的确认面板是"**将要发生什么**"的说明书 + 执行闸门，而**不是**那个同意本身：
 *   · 面板上点「确认执行」→ 取票（此时真确认框弹出）→ 人作答 → 回来点「我已确认，继续执行」→ 带票执行；
 *   · 人若在那个框里点「取消」→ 票据落章为否定 → 服务端返回 403 `confirmation_required`（reason=denied）。
 * 这三步的文案必须如实，不许写"本页点确认即生效"——那会让人以为在这里点两下就换了库。
 *
 * **为什么不能"把 settle 挪到路由、让本页点一下即同意"（owner 裁定 2026-10-04，写给后人）**：
 * 那样这个门就**可被任何能打接口的人伪造**——而"换存储后端"恰恰是 FR-11 要挡住的事。
 * 本屏面板永远只是"说明书 + 执行闸门"，同意只认作答通道落的那一枚章。**别为了少点一下就把它改成可伪造的。**
 *
 * ## 不编造进度（R8）
 *
 * 迁移五步里，只有**可观测的事实**才算"已完成"（库文件存在、库里有 N 条、设置里后端已写成 sqlite）；
 * 观测不到的一律 `unknown`，并注明"以迁移窗口的实际输出为准"。**不显示百分比、不假装知道走到了第几步。**
 *
 * @module dsh-pmboard/client/settings/storage
 */

import type { SettingsSource, StorageBackend, StorageSettingsView } from './types.ts'

/** 三种待确认动作（与服务端 `StorageActionKind` 同字面量）。 */
export type StorageActionKind = 'switch-to-sqlite' | 'switch-to-json' | 'migrate'

/**
 * 本屏状态机（设计 R8）：`idle → requesting → confirm → running → done / failed`。
 *
 *   idle        什么都没做
 *   requesting  已点"确认执行"，正在取票（含服务端推真确认框）
 *   confirm     票已到手，等人**在真确认框里**作答后回来继续
 *   running     带票执行中（切库或开迁移窗口）
 *   done        已成功（切库成功 / 迁移窗口已开）
 *   failed      失败（文案里必须有"为什么"与"怎么修"）
 */
export type MigrationPhase = 'idle' | 'requesting' | 'confirm' | 'running' | 'done' | 'failed'

/** 清单条目的状态：`unknown` 是**诚实的第三种**——观测不到就说观测不到，不当成"没做"。 */
export type StepStatus = 'done' | 'pending' | 'unknown'

export interface MigrationStep {
  readonly key: string
  readonly label: string
  readonly status: StepStatus
  /** 事实依据或"为什么无法确认"（渲染成小字，供人核对）。 */
  readonly note?: string
}

/** 迁移五步（顺序即设计里的顺序；文案是人话）。 */
export const MIGRATION_STEPS: readonly { readonly key: string; readonly label: string }[] = [
  { key: 'backup', label: '备份分片目录' },
  { key: 'create', label: '建库建表' },
  { key: 'copy', label: '迁移需求数据' },
  { key: 'verify', label: '校验条数与抽样' },
  { key: 'write', label: '写设置（storage.backend = sqlite）' },
]

/** 迁移进度所需的**可观测事实**（全部来自服务端响应或系统记录，不猜）。 */
export interface MigrationFacts {
  readonly phase: MigrationPhase
  /** 迁移窗口键（窗口已开出即有此值——事实而非推测）。 */
  readonly windowKey?: string
  /** 库里已有多少条（`GET /settings` 的 system.stores.sqlite 或 system 记录）。 */
  readonly sqliteRequirements?: number
  readonly sqliteExists?: boolean
  /** 设置文件里后端已写成 sqlite（且来源是设置文件）——"第 5 步做完"的唯一硬证据。 */
  readonly backendWritten?: boolean
}

/**
 * 五步清单（**只按事实**推导）。
 *
 * 观测不到的一律 `unknown`：例如"备份做了没有"前端无法从任何接口读到，
 * 就不该标成"已完成"——那是在替 Agent 汇报它没汇报过的事。
 */
export function migrationSteps(facts: MigrationFacts): MigrationStep[] {
  const lib = facts.sqliteExists === true
  const copied = lib && (facts.sqliteRequirements ?? 0) > 0
  const written = facts.backendWritten === true
  const outcome = ((): StepStatus => {
    if (facts.phase === 'failed') return 'pending'
    return 'unknown'
  })()
  return MIGRATION_STEPS.map((s) => {
    switch (s.key) {
      case 'backup':
        return { ...s, status: outcome, note: '前端读不到备份动作；以迁移窗口的实际输出为准' }
      case 'create':
        return lib
          ? { ...s, status: 'done' as StepStatus, note: '库文件已存在' }
          : { ...s, status: facts.phase === 'idle' || facts.phase === 'confirm' ? 'pending' as StepStatus : outcome, note: lib ? '' : '库文件尚未出现' }
      case 'copy':
        return copied
          ? { ...s, status: 'done' as StepStatus, note: '库里已有 ' + String(facts.sqliteRequirements) + ' 条' }
          : { ...s, status: 'pending' as StepStatus, note: '库里还没有数据' }
      case 'verify':
        return written
          ? { ...s, status: 'done' as StepStatus, note: '校验通过才会写设置，故"设置已写"即校验通过' }
          : { ...s, status: outcome, note: '校验结果前端读不到；以迁移窗口的实际输出为准' }
      case 'write':
        return written
          ? { ...s, status: 'done' as StepStatus, note: '设置文件已写 storage.backend = sqlite' }
          : { ...s, status: 'pending' as StepStatus, note: '设置尚未写成 sqlite' }
      default:
        return { ...s, status: 'unknown' as StepStatus }
    }
  })
}

/**
 * 从 `GET /settings` 的 system 摘要里抽出**可观测事实**（纯函数，零 IO）。
 *
 * 三条纪律：① 档案损坏（`ok:false`）时**一律不编数字**，退回保守文案；
 * ② 字段缺一个就少给一个（调用方各自兜底），不塞默认值假装有数；③ 只读，便于直测。
 */
export function migrationFactsOf(system: {
  readonly ok?: boolean
  readonly stores?: import('./types.ts').SystemStoresView
} | undefined): { readonly migrationRequirements?: number; readonly sqliteExists?: boolean; readonly sqliteRequirements?: number } {
  if (system === undefined || system.ok === false) return {}
  const shards = system.stores?.shards
  const sqlite = system.stores?.sqlite
  return {
    ...(typeof shards?.requirements === 'number' ? { migrationRequirements: shards.requirements } : {}),
    ...(typeof sqlite?.exists === 'boolean' ? { sqliteExists: sqlite.exists } : {}),
    ...(typeof sqlite?.requirements === 'number' ? { sqliteRequirements: sqlite.requirements } : {}),
  }
}

/** 目标后端 → 待确认动作（切换方向由目标决定，不由按钮位置决定）。 */
export function actionForBackend(target: StorageBackend): StorageActionKind {
  return target === 'sqlite' ? 'switch-to-sqlite' : 'switch-to-json'
}

/**
 * 待确认动作的人话标题与影响清单（**本屏确认面板的正文**）。
 *
 * 影响清单要写"动什么、不动什么、失败会怎样"——设计原型的确认框就是这么写的，
 * 而这三件事恰好是人做决定时唯一需要知道的。
 */
export function impactLines(action: StorageActionKind, ctx: { readonly requirements?: number; readonly sqlitePath?: string }): string[] {
  const n = ctx.requirements === undefined ? '全部分片' : String(ctx.requirements) + ' 条'
  const to = ctx.sqlitePath ?? '（库文件路径由服务端给出）'
  if (action === 'switch-to-json') {
    return [
      '写设置文件：storage.backend = json',
      'SQLite 库文件**保留不删**（便于对照排查）',
      '重启宿主后生效；分片目录恢复为生效数据源',
    ]
  }
  return [
    '备份分片目录到备份区（只增不删）',
    '迁移 ' + n + ' 条需求到 ' + to,
    '校验条数与抽样比对；**校验不过就不写设置**（宁可不切，也不带着坏数据切）',
    action === 'migrate'
      ? '本步只跑迁移与校验；设置由迁移脚本在校验通过后写入'
      : '校验通过后写设置 storage.backend = sqlite，重启宿主后生效',
  ]
}

/** 动作标题（按钮与确认面板共用一处）。 */
export function actionTitle(action: StorageActionKind): string {
  if (action === 'switch-to-json') return '切回 JSON 分片'
  if (action === 'switch-to-sqlite') return '切到 SQLite'
  return '开始迁移（交给 Agent 窗口）'
}

/**
 * 按错误码给**各自独立**的人话（本屏硬要求：不许一句"出错了"打发所有情况）。
 *
 * `message` 是服务端原话；当码未知时原话优先（**不吞服务端的解释**）。
 */
export function storageErrorCopy(code: string | undefined, message: string): string {
  switch (code) {
    case 'confirmation_required':
      // 三种可能都要点到（否则人会反复点同一个按钮）：还没在确认框作答 / 在框里点了取消 / 票据过期
      return '确认未通过：' + message
        + '。常见原因：还没在确认框里作答、在框里点了取消、或票据已过期。请重新发起确认（本页不会自动重试）。'
    case 'sqlite_not_migrated':
      return '库里还没有数据：' + message + '。先执行迁移，迁移完成后再切。'
    case 'migration_in_progress':
      return '已有迁移在进行：' + message + '。等它跑完（可在系统记录屏看结果）再操作。'
    case 'dispatch_failed':
      return '窗口开好了但任务没送到：' + message + '。窗口里没有指令，不会自己动——请重试或改由人工执行迁移脚本。'
    case 'window_opener_unavailable':
      return '本宿主没有装配开窗能力：' + message + '。可改由人工在终端执行迁移脚本（命令见验收材料）。'
    case 'window_open_failed':
      return '开迁移窗口失败：' + message + '。没有窗口被创建，也没有任何文件被改动。'
    case 'migration_paths_unknown':
      return '拿不到迁移所需的路径：' + message + '。请先确认设置里库路径可用。'
    default:
      return message
  }
}

/**
 * 该错误是否意味着**票据已废**（必须清掉本地票据，重来要重新确认）。
 *
 * `confirmation_required` 一族（无票/落章未通过/已消费/过期）都属此类；
 * 其余错误（如 `sqlite_not_migrated`）是"状态不满足"，票据已被消费掉，同样要清。
 * 一句话：**任何失败都清票**——票据一次性，失败后重试必须重新走确认（卡里点名的要求）。
 */
export function shouldClearTicketOnError(_code: string | undefined): boolean {
  return true
}

/** 票据是否已过期（前端也主动作废，不只依赖服务端；`expiresAt` 是毫秒时间戳）。 */
export function ticketExpired(ticket: { readonly expiresAt?: number | string }, nowMs: number): boolean {
  const at = ticket.expiresAt
  if (at === undefined) return false
  const ms = typeof at === 'number' ? at : Date.parse(at)
  if (!Number.isFinite(ms)) return false
  return nowMs >= ms
}

/** 当前生效后端的人话。 */
export function backendName(backend: StorageBackend): string {
  return backend === 'sqlite' ? 'SQLite' : 'JSON 分片'
}

/** 「当前已在用」时按钮该显示什么（服务端对这种情况返回 400 并说明；前端先如实提示，少一次白跑）。 */
export function alreadyActiveHint(settings: StorageSettingsView | undefined, target: StorageBackend): string | undefined {
  if (settings === undefined) return undefined
  if (settings.effective !== target) return undefined
  return '当前进程已在用' + backendName(target) + '，无需切换。'
    + (settings.restartRequired ? '（设置已改成另一个后端，重启宿主后生效）' : '')
}

/** 来源徽章（与 `model.badgeOf` 同口径；本屏单独用一份以免跨屏耦合）。 */
export function sourceLabel(source: SettingsSource): string {
  switch (source) {
    case 'settings': return '设置文件'
    case 'config': return '插件配置'
    case 'env': return '环境变量'
    default: return '内置默认'
  }
}

/** 文案集中一处，便于评审逐字核对。**逐句对齐原型 `prototype/board-settings.html` 的屏 2**。 */
export const STORAGE_COPY = {
  paneTitle: '存储与数据库',
  /** 屏标题同行副标题（原型 `.pane-title .muted`）。 */
  paneSub: '台账数据的存放方式；切换需重启宿主',
  paneHint: '台账数据的存放方式；切换后端必须经人工确认，且要重启宿主才生效。',
  backendHeading: '后端',
  backendSub: '数据库开关',
  switchToSqlite: '切到 SQLite',
  switchToJson: '切回 JSON 分片',
  /** 原型按钮文案：这件事是交给 Agent 去做的，人只看结果。 */
  migrate: '交给 Agent 处理',
  dataPathHeading: '数据位置',
  pathEdit: '改路径',
  pathSave: '保存路径',
  pathCancel: '取消',
  pathSaved: '已写入设置：重启宿主后生效。',
  sourceHeading: '生效来源',
  whenHeading: '生效时机',
  manualCmd: '手动迁移命令',
  confirmHeading: '确认要做什么',
  /** 这三句是"同意在哪完成"的如实说明（本屏最容易被写成假保证的地方）。 */
  consentNote: '点「确认执行」后，会在你的确认框里弹出正式确认：**在那里点确认才算数**；本页按钮只是发起与继续。',
  awaitingConsent: '已发出确认请求：请在确认框里作答后，回到本页点「我已确认，继续执行」。',
  confirmRun: '确认执行',
  confirmContinue: '我已确认，继续执行',
  cancel: '取消',
  retry: '重来一次',
  doneSwitch: '已写入设置：重启宿主后生效（当前进程仍在用旧后端）。',
  doneMigrate: '迁移窗口已开：迁移与校验在那个窗口里进行，本页只展示可观测到的结果。',
  idleHint: '尚未发起任何切换或迁移。',
  ticketOnce: '确认票据一次性有效：失败后重试必须重新发起确认，本页不会自动重试。',
  openWindow: '打开迁移窗口',
  noData: '—',
} as const

/** 后端分段开关两项（原型 `#backendSeg`：JSON 分片[当前] / SQLite[实验性]）。 */
export const BACKEND_SEG: readonly {
  readonly backend: StorageBackend
  readonly label: string
  readonly tag: string
  readonly tone: 'now' | 'exp'
}[] = [
  { backend: 'json', label: 'JSON 分片', tag: '当前', tone: 'now' },
  { backend: 'sqlite', label: 'SQLite', tag: '实验性', tone: 'exp' },
]

/** 来源顺序（原型写在「生效来源」行右侧；与 `sourceLabel` 一一对应）。 */
export const SOURCE_CHAIN_TEXT = '设置文件 > 插件配置 > 环境变量 > 内置默认'

/** 「迁移与校验」分组的小标题（原型 `#agentSub`）。 */
export const AGENT_SUB_TEXT = '把 JSON 分片搬进 SQLite 并逐项校验'

/** 五步的**一行**写法（原型 agent-hint 里就是这一行）。 */
export const MIGRATION_STEPS_PLAIN = '备份 → 建库 → 迁移 → 校验 → 写设置'

/** 「生效时机」一行的人话（原型：`已在生效（重启后仍为 JSON 分片）`）。 */
export function whenTextOf(s: StorageSettingsView | undefined): string {
  if (s === undefined) return '未知（服务端未返回）'
  return '已在生效（重启后仍为' + backendName(s.effective) + '）'
}

/**
 * 重启提示（原型 `#restartNotice`，**只在目标与生效不同**时出现）。
 *
 * 这段话是本屏最要紧的解释：切换**只发生在装配期**——不写清这句，
 * 人会以为点完按钮就该立刻换库，看到"还是 JSON 分片"就以为坏了。
 */
export function restartNoticeText(effective: StorageBackend | undefined, target: StorageBackend | undefined): string {
  const now = effective === undefined ? '未知后端' : backendName(effective)
  const to = target === undefined ? '' : '（目标：' + backendName(target) + '）'
  return '需要重启宿主生效。当前进程仍在使用' + now + to + '——切换只发生在装配期，'
    + '绝不半途换存储实现（做一半会丢写）。重启前请先跑迁移，否则新的库是空的。'
}

/** Agent 说明首段（原型 `#agentHint` 的正文，含"不用你做"这句我们特意保留的话）。 */
export const AGENT_HINT_INTRO = '这件事不用你做：点下面的按钮会开一个 Agent 窗口，由它执行 '
  + MIGRATION_STEPS_PLAIN + '，完成后回报结论。你只需要看结果、重启宿主。'

/**
 * 手动迁移命令（原型 `#btnAgentManual` 展开后的 `pre.agent-cmd`）。
 *
 * 为什么必须给：开窗能力可能未装配（`window_opener_unavailable`），
 * 那时人只能自己在终端跑——**不给命令就等于没有出路**。
 */
export function manualMigrateCommand(paths: { readonly shardDataRoot?: string; readonly sqliteFile?: string }): string {
  const from = paths.shardDataRoot ?? '<分片数据根>'
  const to = paths.sqliteFile ?? '<库文件>'
  return 'npx tsx scripts/migrate-ledger-to-sqlite.ts --from ' + from + ' --to ' + to + ' --write-settings'
}

/** 旧库检出的提醒（原型那句红字；条数只按事实给，拿不到就不写数字）。 */
export function oldLibNoticeText(oldCount: number | undefined, shardCount: number | undefined): string {
  const head = oldCount === undefined ? '系统记录里检出已存在的旧库' : '系统记录里检出已存在的旧库（' + String(oldCount) + ' 条）'
  const diff = oldCount !== undefined && shardCount !== undefined && shardCount > oldCount
    ? '，比当前分片旧 ' + String(shardCount - oldCount) + ' 条'
    : ''
  return head + diff + '：迁移会先备份旧库再重建，绝不把陈旧库当现状直接启用。'
}

/** 「迁移没做完就重启 → 拒绝服务」的说明（原型 `#refuseNotice`）。 */
export function refuseNoticeText(shardCount: number | undefined): string {
  const n = shardCount === undefined ? '若干' : String(shardCount) + ' 条'
  return '迁移没做完就重启宿主 → 拒绝服务。按既有纪律「绝不静默起一个空台账」：'
    + '已选 SQLite 而库是空的、分片里却有 ' + n + '需求时，宿主拒绝服务并给指引（不是当成"没有需求"）。'
    + '这正是要交给 Agent 去做完的原因。'
}

/** 回滚说明（原型 `#rollbackTip`）：回滚不删源数据，是给人在动手前就放心的那句话。 */
export const ROLLBACK_TIP_TEXT = '回滚：开关切回 JSON 分片并重启即可；原分片目录只读保留、不删不动，'
  + 'SQLite 文件也留在盘上，方便对照排查。'

/** 载体体检（原型 `.health`）：只列**可观测事实**，观测不到的写"未知"。 */
export function healthLinesOf(input: {
  readonly shardCount?: number
  readonly sqliteExists?: boolean
  readonly sqliteCount?: number
  readonly stale?: boolean
}): string[] {
  const shards = input.shardCount === undefined ? 'JSON 分片：未知' : 'JSON 分片：' + String(input.shardCount) + ' 条需求 · 生效中'
  const sqlite = ((): string => {
    if (input.sqliteExists !== true) return 'SQLite 库：尚未创建'
    const n = input.sqliteCount === undefined ? '未知条数' : String(input.sqliteCount) + ' 条'
    return 'SQLite 库：存在 ' + n + (input.stale === true ? '（已陈旧）' : '')
  })()
  return [shards, sqlite, '端口契约：store-contract.test.ts（读 + 写）']
}
