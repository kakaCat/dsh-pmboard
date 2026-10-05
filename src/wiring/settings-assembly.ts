/**
 * 运行设置 / 系统记录的**装配期接线**（REQ-261004103330-005f t5）。
 *
 * ## 为什么单独成模块
 *
 * `src/index.ts` 已 886 行（尺寸门禁的既有失败项），本需求不得再往它里面加逻辑——
 * 组合根只留"解析 → 分叉 → 注入"几行，具体动作收在这里（与 `wiring/not-ready.ts` 同款理由）。
 *
 * ## 三条纪律
 *
 * 1. **档案设施不许阻断启动**：系统记录的读写失败一律降级为告警（FR-17）——
 *    看板不能因为"记录写不进去"就整体不可用；但失败必须响亮（日志），不许静默。
 * 2. **只读探测不建目录**：迁移门那套纪律沿用到这里；唯一会建目录的是"给 SQLite 库文件
 *    准备父目录"，且只在该后端被选中时发生（见 {@link ensureParentDir}）。
 * 3. **版本号只有一个来源**：`package.json`（FR-15）。读不到就如实 `unknown`，
 *    绝不编一个版本号——编了之后"我在跑哪份构建"永远查不清。
 *
 * @module dsh-pmboard/wiring/settings-assembly
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { PluginConfig } from '../plugin-config.js'
import { panelSettings } from '../plugin-config.js'
import { FileSettingsStore } from '../adapters/FileSettingsStore.js'
import { SystemRecordFile } from '../adapters/SystemRecordFile.js'
import { SETTINGS_FILE_REL, type StorageBackend } from '../application/settings/resolve-settings.js'
import {
  SYSTEM_RECORD_FILE_REL,
  startupEvent,
  staleSqliteReason,
  type ActiveBackend,
  type PluginStamp,
  type StorePaths,
  type StoresSnapshot,
} from '../application/settings/events.js'
import { installStageLimitSnapshot } from '../application/dive/round-state.js'
import { SQLITE_SCHEMA_VERSION } from '../repositories/sqliteSchema.js'
import { inspectShards, inspectSqlite } from '../repositories/storeInspect.js'
import { preflightLedger, type MigrationFailure } from '../repositories/migrationGate.js'
import { ShardedRequirementStore } from '../repositories/ShardedRequirementStore.js'
import { SqliteRequirementStore } from '../repositories/SqliteRequirementStore.js'
import type { RequirementStore } from '../application/ports.js'
import { getBuildStamp } from '../shared/build-stamp.js'

/** 设置文件绝对路径（唯一派生点：路由的「打开配置文件」与错误消息都用它）。 */
export function settingsFilePathOf(dshHome: string): string {
  return join(dshHome, SETTINGS_FILE_REL)
}

/** 系统记录文件绝对路径（唯一派生点）。 */
export function systemRecordPathOf(dshHome: string): string {
  return join(dshHome, SYSTEM_RECORD_FILE_REL)
}

/**
 * 找包根 `package.json`：从模块目录**逐级上溯**（最多 4 级）。
 *
 * 为什么要上溯而不是写死 `../package.json`：同一个模块在源码态（`src/wiring/`）与构建态
 * （被打进 `dist/index.mjs`）里相对层级不同。上溯对两种形态都对，且不依赖构建配置。
 */
function findPackageJson(moduleDir: string): string | undefined {
  let dir = moduleDir
  for (let i = 0; i < 4; i++) {
    const candidate = join(dir, 'package.json')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

/**
 * 插件版本信息（FR-15）：单一来源 = `package.json`。
 * 读不到 → `version: 'unknown'`（如实），调用方不要把它美化成某个默认版本。
 */
export function readPluginInfo(moduleDir: string): { name: string; version: string } {
  const file = findPackageJson(moduleDir)
  if (file === undefined) return { name: 'dsh-pmboard', version: 'unknown' }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { name?: unknown; version?: unknown }
    return {
      name: typeof parsed.name === 'string' && parsed.name.length > 0 ? parsed.name : 'dsh-pmboard',
      version: typeof parsed.version === 'string' && parsed.version.length > 0 ? parsed.version : 'unknown',
    }
  } catch {
    return { name: 'dsh-pmboard', version: 'unknown' }
  }
}

/** 版本戳（系统记录每条事件都带它；构建指纹缺省 `unstamped`，与路由侧同口径）。 */
export function pluginStampOf(info: { version: string }): PluginStamp {
  return { version: info.version, buildStamp: getBuildStamp() ?? 'unstamped' }
}

/** 给库文件准备父目录（只在该后端被选中时调用）。已存在则什么都不做。 */
export function ensureParentDir(file: string): void {
  const dir = dirname(file)
  if (dir.length === 0 || existsSync(dir)) return
  mkdirSync(dir, { recursive: true })
}

/**
 * 按设置选中本次装配的存储实现（FR-6）。
 *
 * 为什么"选一次"而不是每个调用方各自判：`RequirementStore` 是宿主级单例，被路由 / 工具 /
 * Dive 驱动器 / SSE 订阅同时持有；运行中替换会留下"旧实现仍在写、新实现已在读"的窗口
 * （本仓踩过同类静默丢数据事故）。**切换只发生在装配期**，是结构性防线，不是省事。
 */
export function selectRequirementStore(opts: {
  backend: StorageBackend
  dataRoot: string
  sqliteFile: string
  now: () => number
  warn: (message: string) => void
}): RequirementStore {
  if (opts.backend === 'sqlite') {
    // 库文件的父目录要先在：`DatabaseSync` 不会替我们建目录，缺目录会直接抛在装配期。
    ensureParentDir(opts.sqliteFile)
    return new SqliteRequirementStore({ file: opts.sqliteFile, now: opts.now, onWarn: opts.warn })
  }
  return new ShardedRequirementStore({ root: opts.dataRoot, now: opts.now, onWarn: opts.warn })
}

/** 运行设置接线：构造 store + 灌初值 + 三路刷新（启动读取 / PATCH 广播 / mtime 轮询）。 */
export interface RunSettingsWiring {
  store: FileSettingsStore
}

/**
 * 装配运行设置端口。
 *
 * 三路刷新（与 design/architecture.md 的「设置解析链与内存快照」逐条对应）：
 *   ① 构造期灌初值（同步快照，Dive 的 `roundLimitFor` 在热路径上同步读它）；
 *   ② `subscribe`：PATCH 广播与文件外部变更都会推新值；
 *   ③ `refresh()`：启动时读一次盘（构造期那份可能是"没有文件"的默认值）。
 */
export function createRunSettingsWiring(opts: {
  config?: PluginConfig
  dshHome: string
  warn: (message: string) => void
}): RunSettingsWiring {
  const store = new FileSettingsStore({
    dshHome: opts.dshHome,
    config: opts.config,
    onWarn: (message) => opts.warn('运行设置：' + message),
    // 轮询周期复用面板刷新那个旋钮（`panel.refreshMs=0` 即关掉轮询，与看板同款语义）
    pollMs: panelSettings(opts.config).refreshMs,
  })
  installStageLimitSnapshot(store.snapshot())
  store.subscribe((next) => installStageLimitSnapshot(next))
  void store
    .refresh()
    .then((next) => installStageLimitSnapshot(next))
    .catch((err: unknown) => opts.warn('运行设置：启动读取失败（沿用内置默认值）: ' + String(err)))
  return { store }
}

/** 读盘上已有的记录，取出历史上记过的备份目录（装配期保留，不要在重建路径档案时抹掉）。 */
function existingBackupDirs(file: string): string[] {
  if (!existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { paths?: { backupDirs?: unknown } }
    const dirs = parsed.paths?.backupDirs
    return Array.isArray(dirs) ? dirs.filter((d): d is string => typeof d === 'string') : []
  } catch {
    return []
  }
}

/** 系统记录接线所需输入（装配期已算好的事实）。 */
export interface SystemRecordWiringInput {
  dshHome: string
  /** 分片数据根（`~/.dsh/reqboard`）。 */
  dataRoot: string
  /** legacy v9 单册路径。 */
  legacyLedger: string
  /** SQLite 库文件绝对路径（无论当前后端是不是 sqlite 都记进档案——它是"备选载体的位置"）。 */
  sqliteFile: string
  /** 本进程实际在用的后端与其来源。 */
  backend: StorageBackend
  backendSource: ActiveBackend['source']
  plugin: { name: string; stamp: PluginStamp }
  now: () => number
  warn: (message: string) => void
}

export interface SystemRecordWiring {
  record: SystemRecordFile
  paths: StorePaths
}

/** 构造系统记录端口（路径档案与当前后端在装配期定型）。 */
export function createSystemRecordWiring(input: SystemRecordWiringInput): SystemRecordWiring {
  const systemFile = systemRecordPathOf(input.dshHome)
  const paths: StorePaths = {
    shardDataRoot: input.dataRoot,
    sqliteFile: input.sqliteFile,
    settingsFile: settingsFilePathOf(input.dshHome),
    legacyLedger: input.legacyLedger,
    backupDirs: existingBackupDirs(systemFile),
  }
  const record = new SystemRecordFile({
    file: systemFile,
    now: input.now,
    plugin: { name: input.plugin.name, stamp: input.plugin.stamp, sqliteSchemaVersion: SQLITE_SCHEMA_VERSION },
    paths,
    active: {
      backend: input.backend,
      since: new Date(input.now()).toISOString(),
      source: input.backendSource,
    },
    onWarn: (message) => input.warn('系统记录：' + message),
  })
  return { record, paths }
}

/** 启动期体检结果（既用于系统记录，也供调用方记日志）。 */
export interface StartupInspection {
  stores: StoresSnapshot
  staleSqlite: boolean
  staleReason?: string
}

/** 只读体检两个载体 → `stores` 快照（陈旧判定交给 `staleSqliteReason`，不在这里自造判据）。 */
export function inspectStores(dataRoot: string, sqliteFile: string): StartupInspection {
  const shards = inspectShards(dataRoot)
  const sqlite = inspectSqlite(sqliteFile)
  const stores: StoresSnapshot = {
    shards: {
      exists: shards.exists,
      requirements: shards.requirements,
      bytes: shards.bytes,
      headRevision: shards.headRevision,
    },
    sqlite: {
      exists: sqlite.exists,
      requirements: sqlite.requirements,
      bytes: sqlite.bytes,
      stale: false,
      ...(sqlite.sqliteSchemaVersion === undefined ? {} : { sqliteSchemaVersion: sqlite.sqliteSchemaVersion }),
    },
  }
  const reason = staleSqliteReason(stores.shards, stores.sqlite)
  const staleReason = reason === undefined ? undefined : reason
  return {
    stores: staleReason === undefined ? stores : { ...stores, sqlite: { ...stores.sqlite, stale: true, staleReason } },
    staleSqlite: staleReason !== undefined,
    ...(staleReason === undefined ? {} : { staleReason }),
  }
}

/**
 * 一次装配（FR-1/2/6/14/17）：读设置 → 过迁移门 → 选实现 → 启动建档。
 *
 * 为什么收成一个函数：组合根（`src/index.ts`）已有尺寸门禁负担，而这条链的**顺序本身**是有语义的——
 * 设置决定后端、后端决定迁移门判据、门过了才能选实现。把顺序写在一处，比散在组合根里更难写错。
 *
 * 返回判别联合：`ok:false` 时组合根走既有的"未就绪"路径（注册 503 降级路由并 return），
 * **不抛**——`apply` 一抛，fiber 失败、连一条能说明原因的路由都留不下（2026-10-03 事故）。
 */
export type StorageAssembly =
  | {
    ok: true
    store: RequirementStore
    settingsStore: FileSettingsStore
    systemRecord: SystemRecordFile
    pluginInfo: { name: string; version: string }
    backend: StorageBackend
    sqliteFile: string
  }
  | { ok: false; failure: MigrationFailure }

export interface StorageAssemblyInput {
  config?: PluginConfig
  dshHome: string
  dataRoot: string
  legacyLedger: string
  /** 组合根自己的模块目录（用于上溯 `package.json` 读版本）。 */
  moduleDir: string
  now: () => number
  warn: (message: string) => void
  info: (message: string) => void
}

export function assembleStorage(input: StorageAssemblyInput): StorageAssembly {
  const { store: settingsStore } = createRunSettingsWiring({
    config: input.config,
    dshHome: input.dshHome,
    warn: input.warn,
  })
  const runSettings = settingsStore.snapshot()
  const backend = runSettings.storage.backend.value
  const sqliteFile = runSettings.storage.sqlitePath
  input.info('存储后端=' + backend + '（来源：' + runSettings.storage.backend.source + '）· 库文件=' + sqliteFile)

  const preflight = preflightLedger({
    dataRoot: input.dataRoot,
    ledgerFile: input.legacyLedger,
    backend,
    sqliteFile,
  })
  if (!preflight.ok) return { ok: false, failure: preflight.failure }

  const store = selectRequirementStore({
    backend,
    dataRoot: input.dataRoot,
    sqliteFile,
    now: input.now,
    warn: input.warn,
  })
  const pluginInfo = readPluginInfo(input.moduleDir)
  const systemRecord = bootSystemRecord({
    dshHome: input.dshHome,
    dataRoot: input.dataRoot,
    legacyLedger: input.legacyLedger,
    sqliteFile,
    backend,
    backendSource: runSettings.storage.backend.source,
    plugin: { name: pluginInfo.name, stamp: pluginStampOf(pluginInfo) },
    now: input.now,
    warn: input.warn,
    info: input.info,
  })
  return { ok: true, store, settingsStore, systemRecord, pluginInfo, backend, sqliteFile }
}

/**
 * 启动期一步到位：建档 + 写档案（`startup` + 体检 + 版本核对），返回可注入路由的端口。
 *
 * 组合根只需一行调用——`src/index.ts` 已有尺寸门禁负担，新逻辑一律留在本模块。
 * **不 await**：写档案是旁路，绝不让它拖住装配（失败也只在内部告警）。
 */
export function bootSystemRecord(input: SystemRecordWiringInput & { info?: (message: string) => void }): SystemRecordFile {
  const { record, paths } = createSystemRecordWiring(input)
  void startSystemRecord({ ...input, record, paths })
    .then((inspection) => {
      if (inspection === undefined) return
      const tail = inspection.staleReason === undefined ? '' : '｜' + inspection.staleReason
      input.info?.(
        '系统记录已更新：分片 ' + String(inspection.stores.shards.requirements) + ' 条 · 库 '
        + String(inspection.stores.sqlite.requirements) + ' 条' + tail,
      )
    })
    .catch((err: unknown) => input.warn('系统记录启动写入异常（已降级）: ' + String(err)))
  return record
}

/**
 * 启动期把档案写一遍：`startup` 事件 + 载体体检 + 版本一致性核对。
 *
 * **永不抛**：任何一步失败都只告警（FR-17 的口径——档案设施坏了不该让看板不可用）。
 * 每次启动都会追加一条 `startup`（`at` 不同即不同事件），从而让 `active` / `lastStartupAt` 保持当拍可信；
 * 首条 `startup` 由适配器在**首次创建**时写（FR-17：启动自动初始化）。
 */
export async function startSystemRecord(
  input: SystemRecordWiringInput & { record: SystemRecordFile; paths?: StorePaths },
): Promise<StartupInspection | undefined> {
  const { record } = input
  try {
    await record.read() // 不存在即初始化（含首条 startup 与路径档案）
  } catch (err) {
    // 记录文件损坏 → 读会抛（t2 的口径：损坏要响亮，不静默当空）。
    // 这里降级为告警并**继续启动**：看板其余功能不该因为档案坏了而整体不可用；
    // 损坏本身由「系统记录」屏红字呈现（见 notes/t2-upstream-notes.md）。
    input.warn('系统记录不可读（降级继续启动）: ' + String(err))
    return undefined
  }

  const inspection = inspectStores(input.dataRoot, input.sqliteFile)
  try {
    await record.append(
      startupEvent({
        at: new Date(input.now()).toISOString(),
        backend: input.backend,
        source: input.backendSource,
        requirements: inspection.stores.shards.requirements,
        staleSqlite: inspection.staleSqlite,
        plugin: input.plugin.stamp,
      }),
    )
    // FR-14：`paths` 记的是"**实际解析到的**"路径——**已存在**的记录也必须每次启动刷新一遍。
    // 只写`paths`（幂等：未变不写盘），`history`/`counters`/`active`/`stores` 都不动。
    if (input.paths !== undefined) await record.updatePaths(input.paths)
    await record.updateStores(inspection.stores)
    await record.reconcileVersion(input.plugin.stamp, SQLITE_SCHEMA_VERSION)
  } catch (err) {
    input.warn('系统记录写入失败（降级继续启动）: ' + String(err))
  }
  return inspection
}
