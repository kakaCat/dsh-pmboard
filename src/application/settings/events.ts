/**
 * 系统记录：事件类型与**纯函数**写入语义（REQ-261004103330-005f FR-14 / FR-15 / FR-16 / FR-17）。
 *
 * 职责边界：本文件只做「事件形状 + 记录形状 + 追加一个事件后的新记录」。
 * 读盘、写盘、失败降级在 `adapters/SystemRecordFile`——本文件**零 IO**（application 层禁 `node:`）。
 *
 * ## 为什么是"追加"而不是"就地改"
 *
 * 系统记录的价值是回答「以前发生过什么」。就地改（例如"把当前后端覆盖上去"）会让历史消失，
 * 回滚之后再也查不出曾经用过 SQLite。故对外只有两个动作：`emptySystemRecord`（首次初始化）
 * 与 `appendEvent`（追加一条 + 派生字段随动）。任何"覆盖历史"的写法都不在这里提供。
 *
 * ## 派生字段随动，但不由调用方拼
 *
 * `counters` / `active` / `stores.sqlite` 都从事件**推导**而来，故放在 `appendEvent` 里统一算：
 * 调用方只描述"发生了什么"，记录的一致性由本函数保证（两处各算一次必然漂移）。
 *
 * @module dsh-pmboard/application/settings/events
 */

import type { StorageBackend } from './resolve-settings.js'

export const SYSTEM_RECORD_SCHEMA_VERSION = 1

/** `history` 上限：超出丢最旧并在 `counters.truncated` 记账（不静默丢）。 */
export const SYSTEM_HISTORY_MAX = 500

/** 系统记录的默认文件名（`dshHome` 下）。 */
export const SYSTEM_RECORD_FILE_REL = 'dsh-reqboard-system.json'

/** 插件版本戳：每条事件都带，事后能判断"这次操作是哪个版本干的"。 */
export interface PluginStamp {
  version: string
  buildStamp: string
}

/** 人工确认留痕（FR-11）：谁、什么时候、走哪条通道、当时是哪个插件版本。 */
export interface ConfirmStamp {
  kind: 'human'
  at: string
  /**
   * 作答通道（三种都算"人已作答"，但**只有前者是看板按钮**）。
   *
   * t1 初版把它写死成 `'board-confirm'`——过窄：t7 的 `StorageActionStamp` 实测有三通道
   * （看板确认按钮 / 弹框作答 / 文字证据命中真实用户消息），路由落章时会类型打架。
   * 这里放宽为同一组值（改的是类型宽度，不改任何行为）。
   */
  channel: 'board-confirm' | 'dialog-answer' | 'text-evidence'
  sessionId?: string
  pluginVersion: string
}

/** 实际解析到的路径档案（不是配置里的写法）。 */
export interface StorePaths {
  shardDataRoot: string
  sqliteFile: string
  settingsFile: string
  legacyLedger: string
  backupDirs: string[]
}

export interface ShardsSnapshot {
  exists: boolean
  requirements: number
  bytes: number
  headRevision: number
  /**
   * 分片侧最近一次写入时刻（= 全部记录 `updatedAt` 的最大值，ISO 串）。
   *
   * 为什么用它而不是 `headRevision`：分片 `meta.json` 里**只有 revision 计数器、没有时间戳**
   * （见 `RequirementShardRepository.ShardMeta`），拿计数器跟库的 `migratedAt` 比大小是拿两种单位比，
   * 结论没有意义。而每条记录的 `updatedAt` 本来就在摘要索引里，取最大值**零额外读盘**就能拿到。
   *
   * 缺省 `undefined` = 实现没提供（不据此误判，退化为只比条数）。
   */
  lastWriteAt?: string
}

export interface SqliteSnapshot {
  exists: boolean
  requirements: number
  bytes: number
  /** 上一次成功迁移的时刻；用于陈旧判定。 */
  migratedAt?: string
  /** true = 库早于/少于当前分片，重启前应重跑迁移（**绝不静默合并**）。 */
  stale: boolean
  staleReason?: string
  /** 写这个库时用的是哪个版本（用于 FR-16 一致性核对）。 */
  writtenBy?: PluginStamp
  sqliteSchemaVersion?: number
}

export interface StoresSnapshot {
  shards: ShardsSnapshot
  sqlite: SqliteSnapshot
}

export interface ActiveBackend {
  backend: StorageBackend
  since: string
  source: 'settings' | 'config' | 'env' | 'default'
}

export interface UpgradePair {
  at: string
  from: string
  to: string
}

export interface CompatResult {
  checkedAt: string
  consistent: boolean
  currentPluginVersion: string
  lastMigrationBy?: { pluginVersion: string; at: string }
  upgrades: UpgradePair[]
}

export interface SystemCounters {
  migrations: number
  migrationsFailed: number
  rollbacks: number
  upgrades: number
  /** 写失败被丢弃的事件数（> 0 时看板红字告警——档案设施坏了要响亮）。 */
  droppedEvents: number
  /** 超上限被截断的历史条数。 */
  truncated: number
  lastStartupAt?: string
  lastMigrationAt?: string
}

/** 五类事件（FR-14 的 `history[]` 元素）。 */
export type SystemEvent =
  | {
    at: string
    event: 'startup'
    backend: StorageBackend
    source: string
    requirements: number
    detected?: { staleSqlite?: boolean }
    plugin: PluginStamp
  }
  | {
    at: string
    event: 'upgrade'
    from: PluginStamp
    to: PluginStamp
    detectedBy: 'startup-compare'
    note?: string
    plugin: PluginStamp
  }
  | {
    at: string
    event: 'migration'
    from: 'json'
    to: 'sqlite'
    result: 'ok' | 'failed'
    requirements: number
    durationMs: number
    backupDir?: string
    windowKey?: string
    error?: string
    confirmedBy?: ConfirmStamp
    plugin: PluginStamp
  }
  | {
    at: string
    event: 'backend-switched'
    from: StorageBackend
    to: StorageBackend
    reason?: string
    keptOtherStore: boolean
    confirmedBy?: ConfirmStamp
    plugin: PluginStamp
  }
  | {
    at: string
    event: 'settings-invalid'
    key: string
    reason: string
    fellBackTo: string
    plugin: PluginStamp
  }

export interface SystemRecordV1 {
  schemaVersion: number
  updatedAt: string
  plugin: PluginStamp & { name: string; sqliteSchemaVersion: number; recordedAt: string }
  paths: StorePaths
  active: ActiveBackend
  stores: StoresSnapshot
  history: SystemEvent[]
  counters: SystemCounters
  compat: CompatResult
}

function emptyCounters(): SystemCounters {
  return { migrations: 0, migrationsFailed: 0, rollbacks: 0, upgrades: 0, droppedEvents: 0, truncated: 0 }
}

function emptyStores(): StoresSnapshot {
  return {
    shards: { exists: false, requirements: 0, bytes: 0, headRevision: 0 },
    sqlite: { exists: false, requirements: 0, bytes: 0, stale: false },
  }
}

/** 首次初始化（FR-17：系统记录由插件**启动时自动创建**；幂等由适配器保证，不在这里覆盖）。 */
export function emptySystemRecord(input: {
  now: string
  plugin: { name: string; stamp: PluginStamp; sqliteSchemaVersion: number }
  paths: StorePaths
  active: ActiveBackend
}): SystemRecordV1 {
  return {
    schemaVersion: SYSTEM_RECORD_SCHEMA_VERSION,
    updatedAt: input.now,
    plugin: {
      name: input.plugin.name,
      version: input.plugin.stamp.version,
      buildStamp: input.plugin.stamp.buildStamp,
      sqliteSchemaVersion: input.plugin.sqliteSchemaVersion,
      recordedAt: input.now,
    },
    paths: input.paths,
    active: input.active,
    stores: emptyStores(),
    history: [],
    counters: emptyCounters(),
    compat: {
      checkedAt: input.now,
      consistent: true,
      currentPluginVersion: input.plugin.stamp.version,
      upgrades: [],
    },
  }
}

/**
 * 追加一个事件并让派生字段随动（纯函数：入参不被修改，返回新记录）。
 *
 * 随动项：`updatedAt` / `history`（含截断）/ `counters` / `active` / `stores.sqlite`。
 * 为什么这些必须在这里算：两处各算一次必然漂移；调用方只该描述"发生了什么"。
 */
export function appendEvent(record: SystemRecordV1, event: SystemEvent): SystemRecordV1 {
  const history = [...record.history, event]
  let truncated = record.counters.truncated
  let kept = history
  if (history.length > SYSTEM_HISTORY_MAX) {
    const drop = history.length - SYSTEM_HISTORY_MAX
    truncated += drop
    kept = history.slice(drop)
  }

  const counters: SystemCounters = { ...record.counters, truncated }
  let active = record.active
  let stores = record.stores

  switch (event.event) {
    case 'startup':
      counters.lastStartupAt = event.at
      active = { backend: event.backend, since: event.at, source: normalizeSource(event.source) }
      break
    case 'upgrade':
      counters.upgrades += 1
      break
    case 'migration':
      if (event.result === 'ok') {
        counters.migrations += 1
        counters.lastMigrationAt = event.at
        stores = {
          ...stores,
          sqlite: {
            ...stores.sqlite,
            exists: true,
            requirements: event.requirements,
            migratedAt: event.at,
            stale: false,
            staleReason: undefined,
            writtenBy: event.plugin,
          },
        }
      } else {
        counters.migrationsFailed += 1
      }
      break
    case 'backend-switched':
      // 回滚口径 = 切回 json（FR-6）。切到 sqlite 不计 rollback。
      if (event.to === 'json') counters.rollbacks += 1
      active = { backend: event.to, since: event.at, source: 'settings' }
      break
    case 'settings-invalid':
      break
  }

  return { ...record, updatedAt: event.at, history: kept, counters, active, stores }
}

function normalizeSource(raw: string): ActiveBackend['source'] {
  return raw === 'settings' || raw === 'config' || raw === 'env' ? raw : 'default'
}

/** 刷新路径档案（装配期调用）。 */
export function withPaths(record: SystemRecordV1, paths: StorePaths): SystemRecordV1 {
  return { ...record, paths }
}

/** 刷新两个载体的体检快照（启动期与迁移后调用）。 */
export function withStores(record: SystemRecordV1, stores: StoresSnapshot): SystemRecordV1 {
  return { ...record, stores }
}

/** 刷新版本一致性核对结论（FR-16）。 */
export function withCompat(record: SystemRecordV1, compat: CompatResult): SystemRecordV1 {
  return { ...record, compat }
}

/** 刷新顶层版本戳（升级后调用；`history` 里的旧版本**不动**——那正是历史）。 */
export function withPlugin(record: SystemRecordV1, plugin: { name: string; stamp: PluginStamp; sqliteSchemaVersion: number; now: string }): SystemRecordV1 {
  return {
    ...record,
    plugin: {
      name: plugin.name,
      version: plugin.stamp.version,
      buildStamp: plugin.stamp.buildStamp,
      sqliteSchemaVersion: plugin.sqliteSchemaVersion,
      recordedAt: plugin.now,
    },
  }
}

/** 记一次"写失败、这条事件被丢弃"（适配器写盘失败时调用；只累加计数，不再尝试写盘）。 */
export function withDroppedEvent(record: SystemRecordV1): SystemRecordV1 {
  return { ...record, counters: { ...record.counters, droppedEvents: record.counters.droppedEvents + 1 } }
}

/**
 * 陈旧判定（FR-13）：库比当前分片旧 → `stale`，并给一句人话原因。两条判据任一成立即陈旧：
 *
 *   ① **条数**：分片条数 > 库条数（新增了需求，库没跟上）；
 *   ② **时间**：分片最近写入晚于库的 `migratedAt`（条数相同但内容被改过——只比条数会漏掉这种）。
 *
 * 判据 ② 的实现口径（**对设计的一处修正，2026-10-04 复核**）：设计写的是"分片 `headRevision`
 * 晚于库 `migratedAt`"，但分片 `meta.json` 只有 revision 计数器、没有时间戳——按字面不可实现。
 * 改用「全部记录 `updatedAt` 的最大值」（摘要索引里本来就有，零额外读盘），语义正是设计想要的
 * "分片侧最近一次写入"。
 *
 * 时间比较用 `Date.parse` 而不是字符串比较：ISO 串的时区写法可能不同（`+08:00` 与 `Z`），
 * 字符串比较会把同一时刻判成先后。任一侧解析不出来 → **不判**（宁可少标一次，也不给假告警）。
 */
export function staleSqliteReason(shards: ShardsSnapshot, sqlite: SqliteSnapshot): string | undefined {
  if (!sqlite.exists) return undefined
  if (!shards.exists) return undefined
  if (shards.requirements > sqlite.requirements) {
    return '库有 ' + String(sqlite.requirements) + ' 条，分片有 ' + String(shards.requirements)
      + ' 条（少 ' + String(shards.requirements - sqlite.requirements) + ' 条）：重启前请重跑迁移'
  }
  const shardAt = shards.lastWriteAt === undefined ? Number.NaN : Date.parse(shards.lastWriteAt)
  const libAt = sqlite.migratedAt === undefined ? Number.NaN : Date.parse(sqlite.migratedAt)
  if (Number.isFinite(shardAt) && Number.isFinite(libAt) && shardAt > libAt) {
    return '分片在库的迁移时刻（' + String(sqlite.migratedAt) + '）之后还有写入（最近 '
      + String(shards.lastWriteAt) + '）：库落后于分片，重启前请重跑迁移'
  }
  return undefined
}

/** 生成一条 `startup` 事件。 */
export function startupEvent(input: {
  at: string
  backend: StorageBackend
  source: string
  requirements: number
  staleSqlite?: boolean
  plugin: PluginStamp
}): SystemEvent {
  const detected = input.staleSqlite === undefined ? undefined : { staleSqlite: input.staleSqlite }
  return {
    at: input.at,
    event: 'startup',
    backend: input.backend,
    source: input.source,
    requirements: input.requirements,
    ...(detected !== undefined ? { detected } : {}),
    plugin: input.plugin,
  }
}
