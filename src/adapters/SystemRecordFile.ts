/**
 * 系统记录文件适配器（REQ-261004103330-005f FR-14 / FR-15 / FR-16 / FR-17 · t2）。
 *
 * ## 职责与边界
 *
 * 只做 I/O 与失败降级：事件形状、追加语义、派生字段随动全在 t1 的
 * `application/settings/events.ts`（纯函数）。本文件**不重算** counters/active/stores。
 *
 * ## 四条纪律（各有测试锁）
 *
 * 1. **启动自动创建**（FR-17）：文件不存在是"首次启动"，`read()` 时用 `emptySystemRecord`
 *    + 首条 `startup` 事件建出来——这是"事实"，不是"意志"，故插件自己写。
 * 2. **只追加、不覆盖**：写入一律走 `appendEvent`；**读到损坏文件绝不覆盖**
 *    （照 `InjectionLogFile` 先例：损坏响亮抛错，不静默当空——覆盖就把证据抹掉了）。
 * 3. **写失败不抛**：档案设施坏掉不该让看板整体不可用；但必须响亮——累加 `droppedEvents()`
 *    并走 `onWarn`，由看板红字显示。
 * 4. **同事件幂等**：`(event, at, plugin.version)` 相同即忽略，重放不会把历史写花。
 *
 * 写串行：同一进程内的读-改-写排队执行，避免并发 append 互相覆盖（照 `InjectionLogFile`）。
 *
 * @module dsh-pmboard/adapters/SystemRecordFile
 */
import { readFile } from 'node:fs/promises'
import { persistAtomic } from '../repositories/atomicWrite.js'
import type { SystemRecordStore } from '../application/ports.js'
import {
  SYSTEM_RECORD_SCHEMA_VERSION,
  appendEvent,
  emptySystemRecord,
  staleSqliteReason,
  startupEvent,
  withCompat,
  withDroppedEvent,
  withPaths,
  withPlugin,
  withStores,
  type ActiveBackend,
  type CompatResult,
  type PluginStamp,
  type SqliteSnapshot,
  type StorePaths,
  type StoresSnapshot,
  type SystemEvent,
  type SystemRecordV1,
} from '../application/settings/events.js'
import { fmt } from '../domain/text/fmt.js'

/** 记录文件损坏/形状不对（**响亮**：不静默当空，也不覆盖）。 */
export const SYSTEM_RECORD_INVALID = 'REQBOARD_SYSTEM_RECORD_INVALID'

export interface SystemRecordFileOptions {
  /** 记录文件绝对路径（`<dshHome>/dsh-reqboard-system.json`）。 */
  file: string
  /** 时钟（毫秒）；本适配器只用来盖 ISO 时刻。 */
  now: () => number
  /** 本安装的版本档案（FR-15：单一来源 = 调用方从 package.json 读，本文件不自造）。 */
  plugin: { name: string; stamp: PluginStamp; sqliteSchemaVersion: number }
  /** 实际解析到的路径档案（装配期算好传进来）。 */
  paths: StorePaths
  /** 当前生效后端与来源（`startup` 事件与 `active` 用它）。 */
  active: ActiveBackend
  /** 首条 `startup` 事件的载荷；缺省 `requirements: 0`、不标陈旧。 */
  startup?: { requirements?: number; staleSqlite?: boolean }
  /** 告警通道（写失败/不可读）；缺省不记。 */
  onWarn?: (message: string) => void
}

export class SystemRecordFile implements SystemRecordStore {
  private readonly file: string
  private readonly now: () => number
  private readonly plugin: SystemRecordFileOptions['plugin']
  private readonly paths: StorePaths
  private readonly active: ActiveBackend
  private readonly startup: { requirements?: number; staleSqlite?: boolean }
  private readonly onWarn: (message: string) => void
  private queue: Promise<unknown> = Promise.resolve()
  private dropped = 0
  /** 已经写进文件的丢弃数（本进程）：只用于算增量，避免把同一次丢弃重复累加。 */
  private persistedDrops = 0

  constructor(opts: SystemRecordFileOptions) {
    this.file = opts.file
    this.now = opts.now
    this.plugin = opts.plugin
    this.paths = opts.paths
    this.active = opts.active
    this.startup = opts.startup ?? {}
    this.onWarn = opts.onWarn ?? (() => {})
  }

  /** 写失败被丢弃的事件数（> 0 时看板红字告警）。 */
  droppedEvents(): number {
    return this.dropped
  }


  /** 读全量；文件不存在 → 初始化（建文件 + 首条 `startup`）。损坏 → **抛**（不静默当空）。 */
  async read(): Promise<SystemRecordV1> {
    return this.enqueue(async () => {
      const existing = await this.readDisk()
      if (existing !== undefined) return existing
      return await this.initialize()
    })
  }

  /** 追加一个事件；同 `(event, at, plugin.version)` 幂等忽略。写失败不抛（记账 + 告警）。 */
  async append(event: SystemEvent): Promise<void> {
    await this.mutate((rec) => {
      if (rec.history.some((e) => sameEvent(e, event))) return {}
      return { record: appendEvent(rec, event) }
    })
  }

  /** 刷新两个载体的体检快照；陈旧判定用 t1 的 `staleSqliteReason` 兜底（调用方漏标也标上）。 */
  async updateStores(patch: StoresSnapshot): Promise<void> {
    await this.mutate((rec) => {
      const reason = staleSqliteReason(patch.shards, patch.sqlite)
      const sqlite: SqliteSnapshot = {
        ...patch.sqlite,
        stale: patch.sqlite.stale || reason !== undefined,
        ...(patch.sqlite.staleReason !== undefined
          ? { staleReason: patch.sqlite.staleReason }
          : reason !== undefined && patch.sqlite.stale
            ? { staleReason: reason }
            : {}),
      }
      return { record: withStores(rec, { shards: patch.shards, sqlite }) }
    })
  }

  /**
   * 刷新路径档案（FR-14）：只改 `paths`，其余字段一律不动。
   *
   * **幂等**：路径没变就不写盘（返回"无变更"，`updatedAt` 也不动）——装配期每次启动都会调它，
   * 不该因此每次都留下一次写盘痕迹。写失败按本适配器口径降级（`mutate` 内部落盘失败不抛，记账 + 告警）。
   */
  async updatePaths(paths: StorePaths): Promise<void> {
    await this.mutate((rec) => (samePaths(rec.paths, paths) ? {} : { record: withPaths(rec, paths) }))
  }

  /**
   * 版本一致性核对（FR-16）：与记录里的版本不同 → 追加 `upgrade` 事件并刷新顶层版本戳
   * （`history` 里的旧版本**不动**——那正是历史）。写失败仍返回结论（结论来自内存里的记录）。
   */
  async reconcileVersion(current: PluginStamp, sqliteSchemaVersion: number): Promise<CompatResult> {
    let out: CompatResult | undefined
    await this.mutate((rec) => {
      const at = this.nowIso()
      const lastOk = [...rec.history].reverse().find((e) => e.event === 'migration' && e.result === 'ok')
      const lastMigrationBy = lastOk === undefined || lastOk.event !== 'migration'
        ? undefined
        : { pluginVersion: lastOk.plugin.version, at: lastOk.at }
      const upgrades = [...rec.compat.upgrades]
      let record = rec
      if (rec.plugin.version !== current.version) {
        record = appendEvent(record, {
          at,
          event: 'upgrade',
          from: { version: rec.plugin.version, buildStamp: rec.plugin.buildStamp },
          to: current,
          detectedBy: 'startup-compare',
          plugin: current,
        })
        upgrades.push({ at, from: rec.plugin.version, to: current.version })
      }
      // 版本戳与表结构版本都随当前事实刷新（升级不改表结构时 sqliteSchemaVersion 不变）
      if (rec.plugin.version !== current.version || rec.plugin.sqliteSchemaVersion !== sqliteSchemaVersion) {
        record = withPlugin(record, { name: rec.plugin.name, stamp: current, sqliteSchemaVersion, now: at })
      }
      const consistent = (lastMigrationBy === undefined || lastMigrationBy.pluginVersion === current.version)
        && rec.plugin.sqliteSchemaVersion === sqliteSchemaVersion
      const compat: CompatResult = {
        checkedAt: at,
        consistent,
        currentPluginVersion: current.version,
        ...(lastMigrationBy !== undefined ? { lastMigrationBy } : {}),
        upgrades,
      }
      out = compat
      return { record: withCompat(record, compat) }
    })
    return out ?? this.fallbackCompat(current)
  }

  // ── 内部 ────────────────────────────────────────────────────────────────

  private nowIso(): string {
    return new Date(this.now()).toISOString()
  }

  /**
   * 首次初始化的记录：空记录 + 首条 `startup`（FR-17）。
   *
   * 抽成独立方法是为了让**任何**先于 `read()` 的写入（如装配期直接 `append`）也拿到同一条 startup
   * ——否则会出现"有事件但没有启动记录"的档案，回看时读不出这台机器是哪天开始用的。
   */
  private initialRecord(): SystemRecordV1 {
    return appendEvent(this.empty(), startupEvent({
      at: this.nowIso(),
      backend: this.active.backend,
      source: this.active.source,
      requirements: this.startup.requirements ?? 0,
      ...(this.startup.staleSqlite !== undefined ? { staleSqlite: this.startup.staleSqlite } : {}),
      plugin: this.plugin.stamp,
    }))
  }

  /** 首次初始化并落盘。写失败只告警并记账（仍返回可读记录）。 */
  private async initialize(): Promise<SystemRecordV1> {
    const fresh = this.initialRecord()
    try {
      await this.persist(fresh)
    } catch (err) {
      this.dropped += 1
      this.onWarn(fmt('系统记录初始化失败（本次 startup 事件被丢弃）：{reason}', { reason: reasonOf(err) }))
    }
    return fresh
  }

  private empty(): SystemRecordV1 {
    return emptySystemRecord({
      now: this.nowIso(),
      plugin: this.plugin,
      paths: this.paths,
      active: this.active,
    })
  }

  /** 读-改-写（排队串行）。读失败或写失败：**不抛**，记一次丢弃。 */
  private async mutate(fn: (rec: SystemRecordV1) => { record?: SystemRecordV1 }): Promise<void> {
    await this.enqueue(async () => {
      let rec: SystemRecordV1
      try {
        rec = (await this.readDisk()) ?? this.initialRecord()
      } catch (err) {
        this.noteDrop(fmt('系统记录不可读，本次事件被丢弃（不覆盖原文件）：{reason}', { reason: reasonOf(err) }))
        return
      }
      let outcome: { record?: SystemRecordV1 }
      try {
        outcome = fn(rec)
      } catch (err) {
        this.noteDrop(fmt('系统记录事件构造失败，本次事件被丢弃：{reason}', { reason: reasonOf(err) }))
        return
      }
      if (outcome.record === undefined) return
      try {
        await this.persist(outcome.record)
      } catch (err) {
        // 内存里的记账仍要留下痕迹（read() 走盘读不到，但 droppedEvents() 读得到）
        this.noteDrop(fmt('系统记录写入失败，本次事件被丢弃：{reason}', { reason: reasonOf(err) }))
      }
    })
  }

  private noteDrop(message: string): void {
    this.dropped += 1
    this.onWarn(message)
  }

  private async persist(record: SystemRecordV1): Promise<void> {
    // 把"本进程丢过的事件数"补进计数再落盘（t1 的 withDroppedEvent 就是为这准备的）：
    // 光记在内存里，下次成功写盘后文件里仍看不出丢过东西——"响亮"必须进档案。
    const delta = this.dropped - this.persistedDrops
    let next = record
    for (let i = 0; i < delta; i++) next = withDroppedEvent(next)
    await persistAtomic(this.file, JSON.stringify(next, null, 2) + '\n')
    this.persistedDrops = this.dropped
  }

  /** 读盘并做**最小形状校验**：不是合法记录就抛（响亮，且绝不覆盖）。 */
  private async readDisk(): Promise<SystemRecordV1 | undefined> {
    let raw: string
    try {
      raw = await readFile(this.file, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw err
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw) as unknown
    } catch (err) {
      throw coded(SYSTEM_RECORD_INVALID, fmt('系统记录不是合法 JSON（{file}）：{reason}。请修复或移走该文件后重启', { file: this.file, reason: reasonOf(err) }))
    }
    if (!isSystemRecord(parsed)) {
      throw coded(SYSTEM_RECORD_INVALID, fmt('系统记录形状不对（缺 schemaVersion/history/counters）：{file}。请修复或移走该文件后重启', { file: this.file }))
    }
    return parsed
  }

  private fallbackCompat(current: PluginStamp): CompatResult {
    return {
      checkedAt: this.nowIso(),
      consistent: false,
      currentPluginVersion: current.version,
      upgrades: [],
    }
  }

  /** 写串行（照 `InjectionLogFile`）：上一次失败不阻断下一次。 */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn, fn)
    this.queue = p.then(() => undefined, () => undefined)
    return p
  }
}

function coded(code: string, message: string): Error {
  return Object.assign(new Error(message), { code })
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** 幂等键：同事件 + 同时刻 + 同插件版本 → 视为同一条（重放忽略）。 */
function sameEvent(a: SystemEvent, b: SystemEvent): boolean {
  return a.event === b.event && a.at === b.at && a.plugin.version === b.plugin.version
}

/** 最小形状校验：够用即可（深校验是 t1 纯函数的活，这里只挡住"明显不是记录"的文件）。 */
function isSystemRecord(value: unknown): value is SystemRecordV1 {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<SystemRecordV1>
  return typeof v.schemaVersion === 'number'
    && Array.isArray(v.history)
    && typeof v.counters === 'object' && v.counters !== null
    && typeof v.plugin === 'object' && v.plugin !== null
    && v.schemaVersion === SYSTEM_RECORD_SCHEMA_VERSION
}

/** 路径档案是否与盘上一致（用于 `updatePaths` 的幂等判定；`backupDirs` 按顺序逐项比）。 */
function samePaths(a: StorePaths, b: StorePaths): boolean {
  return a.shardDataRoot === b.shardDataRoot
    && a.sqliteFile === b.sqliteFile
    && a.settingsFile === b.settingsFile
    && a.legacyLedger === b.legacyLedger
    && a.backupDirs.length === b.backupDirs.length
    && a.backupDirs.every((dir, i) => dir === b.backupDirs[i])
}
