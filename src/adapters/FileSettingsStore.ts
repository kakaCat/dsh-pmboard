/**
 * 运行设置文件适配器（REQ-261004103330-005f FR-1 / FR-3 / FR-4 · t2）。
 *
 * ## 职责与边界
 *
 * 只做 I/O：读盘 → 交给 t1 的纯函数 `resolveRunSettings` 解析 → 缓存成**同步快照**；
 * 写盘走 `persistAtomic`（全仓唯一的 temp + fsync + rename，**不造第二套原子写**）。
 * 校验判据同样来自 t1（`validateRunSettingsPatch`），本文件不复制一份范围表。
 *
 * ## 三条容易写坏的地方（都在测试里锁住）
 *
 * 1. **读失败保留旧快照，绝不退回默认值**（端口注释：否则上限会莫名从 300 变 1000）——
 *    人看到"改的设置丢了"比看到"读盘失败"更坏，因为前者会被误当成"我记错了"。
 * 2. **惰性创建**（FR-17）：文件不存在是**正常态**，不建文件、不报错；第一次 `update` 才落盘。
 * 3. **越界不钳值**：非法就抛码拒绝，绝不静默改成边界值（那会让人以为改生效了）。
 *
 * ## 轮询缺省关
 *
 * `pollMs` 缺省 `0` = 不轮询。测试里不留定时器（否则 vitest 会因未清理的 interval 挂住），
 * 生产装配显式给周期。`dispose()` 用于卸载时清理。
 *
 * @module dsh-pmboard/adapters/FileSettingsStore
 */
import { existsSync, readFileSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { persistAtomic } from '../repositories/atomicWrite.js'
import { SETTINGS_STORE_ERROR, type SettingsStore } from '../application/ports.js'
import {
  SETTINGS_FILE_REL,
  resolveRunSettings,
  validateRunSettingsPatch,
  type ResolvedRunSettings,
  type RunSettingsConfigInput,
  type RunSettingsFileV1,
  type RunSettingsPatch,
  type SettingsProblem,
  type StorageBackend,
} from '../application/settings/resolve-settings.js'
import { fmt } from '../domain/text/fmt.js'

export interface FileSettingsStoreOptions {
  /** `dshHome` 绝对路径（设置文件 = `<dshHome>/dsh-reqboard-settings.json`）。 */
  dshHome: string
  /** 部署级默认（四级来源的第二级）。 */
  config?: RunSettingsConfigInput
  /** 环境变量表（第三级）；缺省 `process.env`。 */
  env?: Record<string, string | undefined>
  /** 本进程**实际**在用的后端：用于算 `effective` / `restartRequired`。 */
  currentBackend?: StorageBackend
  /** 告警通道（读盘失败/文件损坏）；缺省不记。 */
  onWarn?: (message: string) => void
  /** mtime 轮询周期（ms）；`0`/缺省 = 不轮询。 */
  pollMs?: number
  /** 时钟（`updatedAt` 用）；缺省 `Date.now`。 */
  now?: () => number
}

function coded(code: string, message: string): Error {
  return Object.assign(new Error(message), { code })
}

/** 把解析出的 problems 拼成一句可行动的话（路由层直接把它当 400 消息用）。 */
export function problemsText(problems: readonly SettingsProblem[]): string {
  return problems.map((p) => p.key + ' ' + p.reason).join('；')
}

export class FileSettingsStore implements SettingsStore {
  private readonly file: string
  private readonly dshHome: string
  private readonly config: RunSettingsConfigInput | undefined
  private readonly env: Record<string, string | undefined>
  private readonly now: () => number
  private readonly onWarn: (message: string) => void
  private readonly listeners = new Set<(next: ResolvedRunSettings) => void>()
  /** 进程**实际**在用的后端（不随文件变化；装配期定）。 */
  private readonly currentBackend: StorageBackend | undefined
  /** 盘上最后一次读到的原样内容（`update` 的合并基底）。 */
  private fileCache: RunSettingsFileV1 | undefined
  private current: ResolvedRunSettings
  private timer: ReturnType<typeof setInterval> | undefined
  private lastMtimeMs: number | undefined

  constructor(opts: FileSettingsStoreOptions) {
    this.dshHome = opts.dshHome
    this.file = join(opts.dshHome, SETTINGS_FILE_REL)
    this.config = opts.config
    this.env = opts.env ?? process.env
    this.now = opts.now ?? (() => Date.now())
    this.onWarn = opts.onWarn ?? (() => {})
    this.currentBackend = opts.currentBackend
    // 构造期**同步**读一次盘：装配期必须**立刻**知道「用哪个后端」与「阶段上限是多少」，
    // 而装配是同步的（`apply()` 不是 async），等不了随后的异步 `refresh()`。
    //
    // 为什么不能像最初那样只算"没有文件"的生效值（2026-10-04 t15 端到端实测）：
    // `assembleStorage` 在构造后立刻读 `snapshot()` 决定后端——若那份快照还是默认值，
    // 设置文件里写的 `storage.backend=sqlite` **永远不会生效**（重启也不行），
    // 「切库后重启生效」这句承诺当场落空；同理，阶段上限在启动那一刻也读不到文件里的值。
    // 读失败一律按"无文件"处理（不抛）：告警与校验由随后的 `refresh()` 负责，
    // 构造期抛错会让整个插件起不来，那是拿"设置文件写坏"惩罚所有人。
    this.current = this.resolve(this.readParsedSync())
    const pollMs = opts.pollMs ?? 0
    if (pollMs > 0) {
      this.timer = setInterval(() => void this.pollOnce(), pollMs)
      // 不让定时器挂住进程退出（测试与短命进程友好）
      if (typeof this.timer.unref === 'function') this.timer.unref()
    }
  }

  /** 同步快照（纯内存）：Dive 回合判定的热路径用它，绝不在热路径 await 文件读。 */
  snapshot(): ResolvedRunSettings {
    return this.current
  }

  /**
   * 读盘刷新。**读失败保留旧快照**并走 `onWarn`——不退回默认值。
   * 文件不存在 = 惰性创建的正常态：按"无文件"解析（仍会刷新，因为可能刚从有到无）。
   */
  async refresh(): Promise<ResolvedRunSettings> {
    let parsed: RunSettingsFileV1 | undefined
    try {
      parsed = await this.readParsed()
    } catch (err) {
      this.onWarn(fmt('运行设置读取失败，保留上一份生效值：{reason}', { reason: reasonOf(err) }))
      return this.current
    }
    this.fileCache = parsed
    return this.publish(this.resolve(parsed))
  }

  /**
   * 校验 + 原子写。非法 → `REQBOARD_SETTINGS_INVALID`；落盘失败 → `REQBOARD_IO_FAILED`。
   * 合并语义：只覆盖本次给的键，未提及的键原样保留（PATCH 不是 PUT）。
   */
  async update(patch: RunSettingsPatch): Promise<ResolvedRunSettings> {
    const problems = validateRunSettingsPatch(patch)
    if (problems.length > 0) {
      throw coded(SETTINGS_STORE_ERROR.INVALID, '设置未写入（校验未通过）：' + problemsText(problems))
    }
    const base = await this.readForWrite()
    const nextFile: RunSettingsFileV1 = {
      schemaVersion: 1,
      ...(base?.stageMaxRounds !== undefined || patch.stageMaxRounds !== undefined
        ? { stageMaxRounds: { ...base?.stageMaxRounds, ...patch.stageMaxRounds } }
        : {}),
      ...(base?.storage !== undefined || patch.storage !== undefined
        ? { storage: { ...base?.storage, ...patch.storage } }
        : {}),
      updatedAt: new Date(this.now()).toISOString(),
    }
    try {
      await persistAtomic(this.file, JSON.stringify(nextFile, null, 2) + '\n')
    } catch (err) {
      throw coded(SETTINGS_STORE_ERROR.IO_FAILED, fmt('运行设置落盘失败：{reason}', { reason: reasonOf(err) }))
    }
    this.fileCache = nextFile
    return this.publish(this.resolve(nextFile))
  }

  /** 盘上原样内容（未合并默认）；不存在 → `undefined`。损坏 → 抛 `REQBOARD_SETTINGS_INVALID`。 */
  async readFile(): Promise<RunSettingsFileV1 | undefined> {
    const parsed = await this.readParsed()
    this.fileCache = parsed
    return parsed
  }

  subscribe(fn: (next: ResolvedRunSettings) => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  /** 清理轮询定时器（卸载 / 测试收尾）。 */
  dispose(): void {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
  }

  // ── 内部 ────────────────────────────────────────────────────────────────

  private resolve(file: RunSettingsFileV1 | undefined): ResolvedRunSettings {
    return resolveRunSettings({
      ...(file !== undefined ? { file } : {}),
      ...(this.config !== undefined ? { config: this.config } : {}),
      env: this.env,
      dshHome: this.dshHome,
      ...(this.currentBackend !== undefined ? { currentBackend: this.currentBackend } : {}),
    })
  }

  private publish(next: ResolvedRunSettings): ResolvedRunSettings {
    this.current = next
    for (const fn of this.listeners) {
      try {
        fn(next)
      } catch (err) {
        this.onWarn(fmt('设置订阅回调抛错（已忽略，不影响其他订阅者）：{reason}', { reason: reasonOf(err) }))
      }
    }
    return next
  }

  /** 读盘 + 解析。ENOENT → undefined；损坏 → 抛码（**不静默当空**）。 */
  /**
   * 构造期的**同步**读盘（原因见构造器注释）。
   *
   * 只做 JSON 解析与顶层形状检查，语义与 `readParsed` 对齐；差别是**失败一律返回 `undefined` 而不抛**——
   * 构造期抛错会让插件整体起不来（拿"设置文件写坏"惩罚所有人）。那份文件的告警与校验
   * 由随后的 `refresh()` 负责，这里静默即可，避免同一问题报两次。
   */
  private readParsedSync(): RunSettingsFileV1 | undefined {
    try {
      if (!existsSync(this.file)) return undefined
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as unknown
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
      return parsed as RunSettingsFileV1
    } catch {
      return undefined
    }
  }

  private async readParsed(): Promise<RunSettingsFileV1 | undefined> {
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
      throw coded(
        SETTINGS_STORE_ERROR.INVALID,
        fmt('设置文件不是合法 JSON（{file}）：{reason}。请修好或删除该文件后重试', { file: this.file, reason: reasonOf(err) }),
      )
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw coded(SETTINGS_STORE_ERROR.INVALID, fmt('设置文件顶层须是对象：{file}', { file: this.file }))
    }
    return parsed as RunSettingsFileV1
  }

  /**
   * `update` 的合并基底。相对 `readFile` 多一条纪律：**文件损坏时拒绝写入**——
   * 直接覆盖会把"人写坏的那份"连同证据一起抹掉（读盘失败还能修，被覆盖就没了）。
   */
  private async readForWrite(): Promise<RunSettingsFileV1 | undefined> {
    if (this.fileCache !== undefined) return this.fileCache
    return this.readParsed()
  }

  /** 轮询一次 mtime：变了才 refresh（没变不读文件，避免无谓 IO）。 */
  private async pollOnce(): Promise<void> {
    let mtimeMs: number
    try {
      mtimeMs = (await stat(this.file)).mtimeMs
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // 文件被删 = 回到惰性态；只在之前有文件时才刷新一次
        if (this.lastMtimeMs !== undefined) {
          this.lastMtimeMs = undefined
          await this.refresh()
        }
        return
      }
      this.onWarn(fmt('运行设置 mtime 探测失败（本轮跳过）：{reason}', { reason: reasonOf(err) }))
      return
    }
    if (mtimeMs === this.lastMtimeMs) return
    this.lastMtimeMs = mtimeMs
    await this.refresh()
  }
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
