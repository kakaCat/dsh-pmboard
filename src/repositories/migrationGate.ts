/**
 * 迁移门（REQ-261002161439-277d · t8 / FR-8、FR-1）——**绝不静默起一个空台账**。
 *
 * ## 为什么值得单独成模块
 *
 * 运行时从"单册"切到"分片"之后，最危险的开局是：数据根里还只有 v9 单册（用户没跑迁移），
 * 而新实现找不到任何分片 ⇒ 它**看起来**像"这个需求/profile 还没有任何需求"，
 * 于是乐观地起一个空台账继续跑。后果是用户以为数据没了（本仓 v9 时代踩过同类事故：
 * "600 条任务消失"），而实际上是**没迁移**。
 *
 * 故装配时先过这道门，情形分得很清：
 *
 * | 单册 | `meta.json` | 判定 |
 * |------|------------|------|
 * | 在   | 不在       | **抛 `REQBOARD_REQUIRES_MIGRATION`**（必须人工跑迁移脚本） |
 * | 不在 | 在         | 正常启动 |
 * | 不在 | 不在       | 正常启动（全新安装，空数据根本来就该是空的） |
 * | 在   | 在         | 正常启动（迁移已完成，单册留作导出格式） |
 *
 * REQ-261004103330-005f FR-12 起**多一种未就绪**（同一类事故的另一个入口）：
 *
 * | `backend` | 库可用 | 分片有数据 | 判定 |
 * |-----------|--------|-----------|------|
 * | `sqlite`  | 否     | 是        | **未就绪 `REQBOARD_REQUIRES_SQLITE_MIGRATION`**（跑 `migrate-ledger-to-sqlite`） |
 * | `sqlite`  | 否     | 否        | 正常启动（全新安装，空库本就该是空的） |
 * | `sqlite`  | 是     | 任意      | 正常启动 |
 * | `json`    | —      | —         | 走上表（既有行为逐字不变） |
 *
 * **两种未就绪的文案各自独立构造**（{@link migrationMessage} / {@link sqliteMigrationMessage}），
 * 刻意**不共用模板**：它们要跑的是不同脚本、动的是不同数据，共用模板必然让其中一种给出错命令。
 * 测试用"两条文案互不出现"锁死这条。
 *
 * ## 两个入口，一份判据（REQ-261003191948-e94a · t1 / FR-1、FR-3）
 *
 * 同一个判定此前只有"抛错版"一种用法，于是**装配方拿不到"还没准备好"这个事实**——
 * 只能让异常冒泡，fiber 失败，连一条能把原因说出来的路由都留不下（2026-10-03 事故：
 * 界面只显示 404）。现在拆成：
 *
 *   - {@link preflightLedger}：**只读、不抛错**，返回判别联合——装配方据此分叉出"未就绪"态；
 *   - {@link assertLedgerMigrated}：既有抛错版，**内部改为调用 preflightLedger 再 rethrow**。
 *
 * 两者共用 {@link migrationMessage} 与 {@link migrationHint}，因此不可能出现"抛错版说一套、
 * 预检版判另一套"的第二份真相（tests/reqboard/migration-gate.test.ts 用"逐字相等"锁死这条）。
 *
 * **副作用纪律**：两个入口都只读、**不建任何目录**——不能因为"探一下路"就把空数据根坐实了。
 *
 * @module dsh-pmboard/repositories/migrationGate
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { inspectShards, inspectSqlite } from './storeInspect.js'

/** 数据根里表示"已迁移到 v10"的提交点文件。 */
export const V10_META_FILE = 'meta.json'

/** 迁移门拒绝时抛出的错误码（工具/启动路径按它给出指引）。 */
export const REQUIRES_MIGRATION = 'REQBOARD_REQUIRES_MIGRATION'

/** 迁移脚本路径（`hint` 与 message 共用，避免两处各写一份）。 */
export const MIGRATION_SCRIPT = 'scripts/migrate-ledger-v10.ts'

/** 第二种未就绪的错误码（REQ-261004103330-005f FR-12）：已选 SQLite 而库不可用、分片却有数据。 */
export const REQUIRES_SQLITE_MIGRATION = 'REQBOARD_REQUIRES_SQLITE_MIGRATION'

/** SQLite 迁移脚本路径（与上面那份是**两个不同脚本**，故各有一个常量，不合并）。 */
export const SQLITE_MIGRATION_SCRIPT = 'scripts/migrate-ledger-to-sqlite.ts'

export interface MigrationGateOptions {
  /** 数据根（分片目录父目录，如 `~/.dsh/reqboard`）。 */
  readonly dataRoot: string
  /** legacy v9 单册路径（如 `~/.dsh/dsh-reqboard.json`）。 */
  readonly ledgerFile: string
  /**
   * 本次装配选中的后端（REQ-261004103330-005f FR-12）。
   * 缺省 `'json'` ⇒ 行为与改造前**逐字一致**（既有调用点不必改）。
   */
  readonly backend?: 'json' | 'sqlite'
  /** SQLite 库文件绝对路径；`backend==='sqlite'` 时用于判"库可不可用"。 */
  readonly sqliteFile?: string
}

/**
 * 迁移门失败（宿主内形状）：把"为什么"与"怎么办"一次带全。
 *
 * `code` 刻意写成**字面量类型**而不是 `string`：调用方无法把别的错误码塞进"未就绪"分支，
 * 这正是本需求边界（只覆盖迁移门，不覆盖通用装配异常）的类型级落点。
 */
export interface MigrationFailure {
  /** 机器可判的错误码；本入口只产出这两种之一（文案与命令各不相同）。 */
  readonly code: typeof REQUIRES_MIGRATION | typeof REQUIRES_SQLITE_MIGRATION
  /** 人读原因（与抛错版 message **逐字相同**）。 */
  readonly message: string
  /** 代入真实路径的可复制命令（FR-3）：用户复制即跑，无需替换占位符。 */
  readonly hint: string
  /** legacy v9 单册路径（点名是哪份单册）。 */
  readonly ledgerFile: string
  /** v10 数据根（点名要迁到哪）。 */
  readonly dataRoot: string
  /** SQLite 未就绪时点名是哪个库文件（另一种未就绪才有）。 */
  readonly sqliteFile?: string
}

/** 预检结果：判别联合——装配方按 `ok` 分叉，不用异常做控制流。 */
export type PreflightResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: MigrationFailure }

/**
 * 人读原因（**唯一构造点**）。保持与历史文本逐字节一致——既有测试与用户记忆都锚在这句话上，
 * 新增的信息一律进 {@link migrationHint}，不改这里。
 */
function migrationMessage(options: MigrationGateOptions): string {
  return `检测到 legacy 单册 ${options.ledgerFile}，但数据根 ${options.dataRoot} 尚未迁移（缺 ${V10_META_FILE}）。`
    + '为避免静默起一个空台账，拒绝启动。请先运行：'
    + `node --import tsx/esm ${MIGRATION_SCRIPT} --file <单册> --out <数据根> --apply`
}

/**
 * 可复制命令（FR-3，**唯一构造点**）：把**真实路径**内联进去，用户复制即跑。
 *
 * 为什么值得单列一段而不是复用 message 里那半句：message 里的命令用的是 `<单册>`/`<数据根>`
 * 占位符（历史文本，不动），用户照抄会得到一个"跑不起来"的命令——2026-10-03 事故的排查期
 * 就卡在这一步（得先自己把路径替换进去）。`--apply` 也是刻意写死的：去掉它脚本默认 dry-run，
 * 用户会以为"跑了没反应"。
 *
 * 路径原样内联、不做 shell 转义：本仓路径可能含空格，`--file` / `--out` 后不加引号即可被
 * `node` 的参数解析正确处理；若将来发现有路径被 shell 截断，改这里是**同一处**的一行修改。
 */
export function migrationHint(options: MigrationGateOptions): string {
  return '检测到 legacy 单册但数据根尚未迁移（缺 ' + V10_META_FILE + '）。请执行：\n'
    + `node --import tsx/esm ${MIGRATION_SCRIPT} --file ${options.ledgerFile} --out ${options.dataRoot} --apply`
}

/**
 * SQLite 未就绪的人读原因（**独立构造点**，不与单册那份共用模板）。
 *
 * 为什么必须独立：两句话要指的路完全不同——那份让人跑 v10 单册迁移，这份让人跑 SQLite 迁移。
 * 共用模板省下的几行，换来的是"照着提示跑错脚本"。
 */
function sqliteMigrationMessage(options: MigrationGateOptions): string {
  const file = options.sqliteFile ?? '<库文件>'
  return `已选择 SQLite 存储，但库 ${file} 里没有可用数据，而数据根 ${options.dataRoot} 里有需求。`
    + '为避免静默起一个空台账（旧数据看不见），拒绝启动。请先运行：'
    + `node --import tsx/esm ${SQLITE_MIGRATION_SCRIPT} --from ${options.dataRoot} --to ${file} --write-settings`
}

/** SQLite 未就绪的可复制命令（**独立构造点**，真实路径内联、`--write-settings` 写死）。 */
export function sqliteMigrationHint(options: MigrationGateOptions): string {
  const file = options.sqliteFile ?? '<库文件>'
  return 'SQLite 库不可用（不存在 / 空 / 不是本实现建的库），而分片里有数据。请执行：\n'
    + `node --import tsx/esm ${SQLITE_MIGRATION_SCRIPT} --from ${options.dataRoot} --to ${file} --write-settings`
}

/** SQLite 迁移脚本的参数名（与脚本 CLI 同源；测试点位用）。 */
export const SQLITE_MIGRATION_FLAGS = ['--from', '--to', '--write-settings'] as const

/**
 * 只读预检：**不建目录、不写文件、不抛错**，把"能不能装配"作为数据返回。
 *
 * 装配方（`src/index.ts`）据此分叉出"未就绪"态——只要它不抛，插件就仍然处于已加载状态，
 * 降级路由才能留在 fiber 里（REQ-261003191948-e94a FR-1）。
 */
export function preflightLedger(options: MigrationGateOptions): PreflightResult {
  // ── 分支 A：已选 SQLite（FR-12）────────────────────────────────────────────
  // 判据：**库不可用**（不存在 / 空 / 不是本实现建的库）**且分片有数据** → 未就绪。
  // 反过来：两者都空 = 全新安装，正常启动（空库本就该是空的，不该拿"没数据"当理由拒绝）。
  if (options.backend === 'sqlite') {
    const shards = inspectShards(options.dataRoot)
    const sqlite = inspectSqlite(options.sqliteFile ?? '')
    if (!sqlite.usable && shards.requirements > 0) {
      return {
        ok: false,
        failure: {
          code: REQUIRES_SQLITE_MIGRATION,
          message: sqliteMigrationMessage(options),
          hint: sqliteMigrationHint(options),
          ledgerFile: options.ledgerFile,
          dataRoot: options.dataRoot,
          ...(options.sqliteFile === undefined ? {} : { sqliteFile: options.sqliteFile }),
        },
      }
    }
    return { ok: true }
  }

  // ── 分支 B：JSON 分片（既有行为，逐字不变）──────────────────────────────────
  const metaPath = join(options.dataRoot, V10_META_FILE)
  if (existsSync(metaPath)) return { ok: true }
  if (!existsSync(options.ledgerFile)) return { ok: true }
  return {
    ok: false,
    failure: {
      code: REQUIRES_MIGRATION,
      message: migrationMessage(options),
      hint: migrationHint(options),
      ledgerFile: options.ledgerFile,
      dataRoot: options.dataRoot,
    },
  }
}

/**
 * 装配前过门：单册在场而数据根未迁移 → 抛错，**不创建任何文件或目录**。
 *
 * 返回 `true` 表示"已迁移（或无需迁移）"，调用方可继续装配。
 *
 * 实现说明（REQ-261003191948-e94a t1）：本函数现在是 {@link preflightLedger} 的**抛错外壳**，
 * 判据与文案都不在这里——这样"离场"与"未就绪"两种用法永远同源。
 */
export function assertLedgerMigrated(options: MigrationGateOptions): boolean {
  const preflight = preflightLedger(options)
  if (preflight.ok) return true
  throw Object.assign(new Error(preflight.failure.message), {
    code: preflight.failure.code,
    hint: preflight.failure.hint,
    dataRoot: preflight.failure.dataRoot,
    ledgerFile: preflight.failure.ledgerFile,
    ...(preflight.failure.sqliteFile === undefined ? {} : { sqliteFile: preflight.failure.sqliteFile }),
  })
}
