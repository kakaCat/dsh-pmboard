/**
 * 迁移脚本的**纯辅助**（REQ-261004103330-005f · t9）。
 *
 * 为什么单独成文件：脚本本体承担"八步 + 退出码 + 可注入"的编排，再放这些辅助会越过
 * 单文件 400 行的尺寸纪律；而本仓**禁止删注释**（注释承载"为什么"），故按卡里的指示拆出来。
 * 这里放"读"与"命名"这类辅助，外加**迁移结束后的系统记录留痕**（⑨）——它内聚成一块、
 * 且与"读"共用同一套路径解析；脚本本体的写盘动作（备份/建库/顶替）仍全部留在本体，便于审阅时一眼看全。
 *
 * @module scripts/migrate-support
 */
import { existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SystemRecordFile } from '../src/adapters/SystemRecordFile.js'
import { SQLITE_SCHEMA_VERSION } from '../src/repositories/sqliteSchema.js'
import { pluginStampOf, readPluginInfo } from '../src/wiring/settings-assembly.js'
import { SYSTEM_RECORD_FILE_REL, type ActiveBackend, type ConfirmStamp, type StorePaths } from '../src/application/settings/events.js'
import { ShardedRequirementStore } from '../src/repositories/ShardedRequirementStore.js'
import type { RequirementRecord, TriageRecord } from '../src/shared/protocol.js'

/** 源台账（迁移的输入）。 */
export interface SourceLedger {
  requirements: RequirementRecord[]
  triages: TriageRecord[]
  revision: number
  /** 分片侧最近写入时刻（陈旧判定用；取全部记录 `updatedAt` 最大值）。 */
  lastWriteAt?: string
}

/** 备份名用的时间戳（`yyyyMMdd-HHmmss`，本地时区）。 */
export function stamp(now: number): string {
  const d = new Date(now)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** DSH 主目录：显式选项 > `$DSH_HOME` > `~/.dsh`。 */
export function dshHomeOf(opts: { dshHome?: string }): string {
  return opts.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/**
 * 默认源读取：分页列摘要 + **逐条权威读**。
 *
 * 为什么不用广播/返回记录里的 `version`：见 `notes/findings.md` 发现 A——分片实现那条路径回的
 * `version` 是**旧的**（`{ ...merged, ...draft }` 把它盖回去了）。迁移是数据搬家，只认权威读。
 */
export async function readSourceLedger(from: string, onWarn: (m: string) => void): Promise<SourceLedger> {
  const sharded = new ShardedRequirementStore({ root: from, onWarn })
  const requirements: RequirementRecord[] = []
  let cursor: string | undefined
  do {
    const page = await sharded.listSummaries({ scope: 'all', ...(cursor !== undefined ? { cursor } : {}) })
    for (const item of page.items) {
      const rec = await sharded.get(item.id)
      if (rec !== undefined) requirements.push(rec)
    }
    cursor = page.nextCursor
  } while (cursor !== undefined)
  const triages = await sharded.listTriages()
  const head = await sharded.head()
  const times = requirements.map((r) => r.updatedAt).filter((v): v is number => typeof v === 'number')
  return {
    requirements,
    triages: [...triages],
    revision: head.revision,
    ...(times.length > 0 ? { lastWriteAt: new Date(Math.max(...times)).toISOString() } : {}),
  }
}

/**
 * **只读**数一下目标库里有多少条需求（不建表、不写 sidecar）。
 *
 * 为什么不用 `SqliteRequirementStore` 打开：它的构造期会应用 PRAGMA + DDL，
 * 而 `--dry-run` 的承诺是"不写任何文件"——只读连接才不会把承诺打折。
 * 打不开（不是库 / 没有该表 / 无权限）→ `undefined`，调用方据此跳过陈旧判定（不误判）。
 */
export function countRequirementsReadOnly(file: string): number | undefined {
  if (!existsSync(file)) return undefined
  try {
    const require_ = createRequire(import.meta.url)
    const { DatabaseSync } = require_('node:sqlite') as {
      DatabaseSync: new (path: string, opts?: { readOnly?: boolean }) => {
        prepare: (sql: string) => { get: () => unknown }
        close: () => void
      }
    }
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      const row = db.prepare('SELECT COUNT(*) AS n FROM requirements').get() as { n?: unknown } | undefined
      return typeof row?.n === 'number' ? row.n : Number(row?.n ?? 0)
    } finally {
      db.close()
    }
  } catch {
    return undefined
  }
}

/**
 * ⑨ 往系统记录追加一条 `migration` 事件（**成功与失败都记**）——由脚本在迁移结束后调用。
 *
 * 三条纪律（都不是可选项）：
 *   1. `--dry-run` **不写**——它承诺"不写任何文件"，档案也算写盘的一种；
 *   2. 写事件失败**不改变退出码语义**（档案是辅助设施，不是门禁）：告警 + 由适配器记 droppedEvents，
 *      该退出码 3 还是 3——不能因为"没记上留痕"就把一次失败的迁移说成别的结果；
 *   3. 字段一律用既有 `migration` 分支的形状，不新造事件种类、不新造字段。
 */
export interface MigrationRecordInput {
  /** 源分片根（写进路径档案）。 */
  from: string
  /** DSH 主目录（缺省按既有优先级解析）。 */
  dshHome?: string
  /** `--dry-run`：承诺不写任何文件，故**不记**。 */
  dryRun: boolean
  /** 人工确认留痕（由调用方递进来）。 */
  confirmedBy?: ConfirmStamp
  onLog: (line: string) => void
  /** 迁移是否成功（**用布尔传入**：helper 不反向依赖主脚本的退出码常量，避免循环）。 */
  ok: boolean
  /** 失败原因（成功时忽略）。 */
  reason: string
  target: string
  backupDir?: string
  requirementCount: number
  startedAt: number
  endedAt: number
}

/** 本模块所在目录（`readPluginInfo` 从它上溯找 package.json；不硬编码任何绝对路径）。 */
const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

export async function recordMigrationEvent(input: MigrationRecordInput): Promise<void> {
  if (input.dryRun) return
  const log = input.onLog
  try {
    const home = dshHomeOf(input)
    const file = join(home, SYSTEM_RECORD_FILE_REL)
    mkdirSync(dirname(file), { recursive: true })
    const at = new Date(input.endedAt).toISOString()
    const info = readPluginInfo(MODULE_DIR)
    const stampOf = pluginStampOf(info)
    const active: ActiveBackend = { backend: 'json', since: at, source: 'settings' }
    const paths: StorePaths = {
      shardDataRoot: resolve(input.from),
      sqliteFile: input.target,
      settingsFile: join(home, 'dsh-reqboard-settings.json'),
      legacyLedger: join(home, 'dsh-reqboard.json'),
      backupDirs: input.backupDir === undefined ? [] : [input.backupDir],
    }
    const record = new SystemRecordFile({
      file,
      now: () => input.endedAt,
      plugin: { name: info.name, stamp: stampOf, sqliteSchemaVersion: SQLITE_SCHEMA_VERSION },
      paths,
      active,
      onWarn: (m) => log('   [系统记录告警] ' + m),
    })
    await record.append({
      at,
      event: 'migration',
      from: 'json',
      to: 'sqlite',
      result: input.ok ? 'ok' : 'failed',
      requirements: input.requirementCount,
      durationMs: Math.max(0, input.endedAt - input.startedAt),
      ...(input.backupDir !== undefined ? { backupDir: input.backupDir } : {}),
      ...(input.ok ? {} : { error: input.reason }),
      ...(input.confirmedBy !== undefined ? { confirmedBy: input.confirmedBy } : {}),
      plugin: stampOf,
    })
    log('⑨ 已记系统记录：migration ' + (input.ok ? 'ok' : 'failed'))
  } catch (err) {
    // 档案写不进去不该改变迁移结论——如实告警，退出码保持 report.code 原值。
    log('⑨ 系统记录写入失败（不影响退出码）：' + String(err))
  }
}

