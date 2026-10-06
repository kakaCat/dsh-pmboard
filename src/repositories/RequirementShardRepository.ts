/**
 * 需求**分片目录**的 I/O 唯一入口（REQ-261002161439-277d · t3 / FR-2、FR-3、FR-4）。
 *
 * ## 职责边界（与 `QueueRepository` 同款纪律）
 *
 * 本文件只认「需求 → 一个分片目录」，做四件事：
 * 1. **读**：`record.json` / 追加日志 / 外置对象，并把「坏文件」隔离掉；
 * 2. **写**：原子写（复用 `persistAtomic`，**不造第二套**）与追加；
 * 3. **隔离**：**只有解析失败才改名** `<file>.corrupt-<ts>`；校验失败不隔离
 *    （那是"内容不合规"而不是"文件损坏"，改名会毁掉用户还能手工修的数据）；
 * 4. **冷热搬运**：整目录 rename。
 *
 * 不做什么：不做缓存、不做需求语义、不推导摘要（那些是 `ShardedRequirementStore` 的事，
 * 见 t4/t5）。这样迁移脚本（t6）只依赖本文件就能写分片，不必拉起带缓存的 Store。
 *
 * ## 两条实现纪律
 *
 * - **校验先于任何写**：结构校验不通过时**连目录都不建**（验收 ④：一个字节都不落盘）。
 * - **fs 能力注入**：默认 `node:fs/promises`；注入假 fs 就能断言失败路径（rename 抛错、
 *   临时文件清理），也给 t5 的读/写放大探针留了挂字节计数器的位置。
 *
 * ## 错误码为什么直接用传输码
 *
 * 本仓的既有做法是"模块内自足的码表"（`QUEUE_ERROR` / `JOURNAL_ERROR`），再由上层映射。
 * 本文件**故意不这么做**：它是 `RequirementStore` 端口的 IO 半边，直接把
 * `REQUIREMENT_STORE_ERROR` 抛给调用方，省掉一张需要同步维护的映射表——
 * 两张码表必然漂移（本仓的"两份真相"教训），而这里多一层映射没有任何收益。
 *
 * @module dsh-pmboard/repositories/RequirementShardRepository
 */
import { appendFile, readFile, readdir, rm } from 'node:fs/promises'
import { REQUIREMENT_STORE_ERROR } from '../application/ports.js'
import {
  archiveDir,
  isRequirementId,
  journalPath,
  metaPath,
  objectPath,
  recordPath,
  requirementDir,
  requirementsDir,
  type JournalKind,
  type ObjectKind,
} from '../domain/requirement/ReqboardPaths.js'
import { encodeJournalLine, type JournalLine } from '../domain/requirement/Journal.js'
import { nodeAtomicFs, persistAtomic, type AtomicFs } from './atomicWrite.js'
import { appendJournalLine, isNotFound, readJournalFile, type JournalReadResult } from './ShardJournalIO.js'
import { listShardIdsIn, removeShardDir, renameShardDir } from './ShardDirectoryOps.js'
// 再导出：readJournal 的返回类型属于本模块的公开面（消费方不必知道日志 IO 被抽到了哪个文件）
export type { JournalReadResult } from './ShardJournalIO.js'
import type { RequirementRecord } from '../shared/protocol.js'

/** 目录项（只用到名字与"是不是目录"）。 */
export interface ShardDirEntry {
  name: string
  isDirectory(): boolean
}

/** 分片仓储需要的 fs 能力（= 原子写能力 + 读/追加/列目录）。 */
export interface ShardFs extends AtomicFs {
  readFile(path: string, encoding: 'utf8'): Promise<string>
  appendFile(path: string, data: string, encoding: 'utf8'): Promise<void>
  readdir(path: string, opts: { withFileTypes: true }): Promise<readonly ShardDirEntry[]>
  /** 整目录删除（`replaceAll` 的整体重建用；`force` 让"不存在"不算错）。 */
  rm(path: string, opts: { recursive: true; force: true }): Promise<void>
}

/** 生产实现：`node:fs/promises`。 */
export const nodeShardFs: ShardFs = {
  ...nodeAtomicFs,
  readFile: (path, encoding) => readFile(path, encoding),
  appendFile: (path, data, encoding) => appendFile(path, data, encoding),
  async readdir(path, opts) {
    const entries = await readdir(path, opts)
    return entries.map((e) => ({ name: e.name, isDirectory: () => e.isDirectory() }))
  },
  async rm(path, opts) {
    await rm(path, opts)
  },
}

/** 全局元数据（`<root>/meta.json`）：分片布局的提交点之外唯一需要原子写的全局态。 */
export interface ShardMeta {
  schemaVersion: number
  revision: number
  /** 迁移留痕（v9 曾因读路径丢它出过事故，故读写都必须原样带过）。 */
  migrations?: readonly { from: number; to: number; at: number; by: string }[]
  /**
   * 分诊记录（`triages`）。
   *
   * **为什么放在 meta.json**：它在 v9 单册里是顶层数组，现状 0 条；分片布局里没有天然的归属，
   * 而 `meta.json` 是"全局态"的家。放在这里而不是丢掉——「现状为空」不是丢键的理由
   * （t7 复核时实测发现 t6 首版把它丢了，属真数据丢失，已修）。
   */
  triages?: readonly unknown[]
}

export interface RequirementShardRepositoryOptions {
  /** fs 能力（缺省 `node:fs/promises`；测试注入假 fs / 探针）。 */
  fs?: ShardFs
  /** 时钟（`<file>.corrupt-<ts>` 的时间戳来源；缺省 `Date.now`）。 */
  now?: () => number
  /** 告警通道（缺省 `console.warn`；隔离坏文件、重写日志、改动被忽略时都会走这里）。 */
  onWarn?: (message: string) => void
}

/** 记录的最低可信度（与单册时代的判定同口径：id 必须与目录名相符）。 */
function isPlausibleRecord(raw: unknown, expectedId: string): boolean {
  if (typeof raw !== 'object' || raw === null) return false
  const o = raw as Record<string, unknown>
  return o.id === expectedId
    && typeof o.title === 'string'
    && typeof o.status === 'string'
    && typeof o.version === 'number'
}

export class RequirementShardRepository {
  private readonly fs: ShardFs
  private readonly now: () => number
  private readonly onWarn: (message: string) => void

  constructor(options: RequirementShardRepositoryOptions = {}) {
    this.fs = options.fs ?? nodeShardFs
    this.now = options.now ?? (() => Date.now())
    this.onWarn = options.onWarn ?? ((message) => console.warn(message))
  }

  // ── 读 ───────────────────────────────────────────────────────────────

  /**
   * 读热记录（`record.json`）。
   *
   * 三种结果分得很清：不存在 → `undefined`；**解析失败 → 隔离改名 + 告警 + `undefined`**；
   * 校验失败 → 抛 `REQBOARD_VALIDATION_FAILED`（**不隔离**，数据还能手工修）。
   */
  async readRecord(root: string, requirementId: string, opts: { cold?: boolean } = {}): Promise<RequirementRecord | undefined> {
    const file = recordPath(root, requirementId, opts)
    let text: string
    try {
      text = await this.fs.readFile(file, 'utf8')
    } catch (err) {
      if (isNotFound(err)) return undefined
      throw this.ioError(file, err)
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text) as unknown
    } catch {
      await this.isolate(file, '热记录 JSON 解析失败')
      return undefined
    }
    if (!isPlausibleRecord(parsed, requirementId)) {
      throw Object.assign(
        new Error(`分片 ${file} 结构不合规（id 与目录名不符，或缺 title/status/version）——拒绝加载该条，其余需求不受影响`),
        { code: REQUIREMENT_STORE_ERROR.VALIDATION_FAILED },
      )
    }
    return parsed as RequirementRecord
  }

  // ── 读：外置对象 ─────────────────────────────────────────────────────

  /**
   * 外置对象**是否存在**（只列目录、不读内容）。
   *
   * 为什么需要它（REQ-261006175040-12d4 t3 / FR-6）：`readObject` 对"文件不存在"与"JSON 损坏
   * 被隔离"都返回 `undefined`，两者的语义却相反——前者 = 真没有（卡面该显示缺失），
   * 后者 = 读不到（卡面**不得**冒充缺失）。取数点用本探针把两者分开。
   *
   * 用 `readdir` 而不是新增 `stat` 能力：`ShardFs` 是多个测试替身实现的公开接口，
   * 加一个**必需**方法会一次性破坏所有替身（它们只实现了既有能力）；列目录是既有能力，零波及。
   */
  async objectExists(root: string, requirementId: string, kind: ObjectKind, opts: { cold?: boolean } = {}): Promise<boolean> {
    const file = objectPath(root, requirementId, kind, opts)
    const cut = file.lastIndexOf('/')
    const dir = file.slice(0, cut)
    const name = file.slice(cut + 1)
    try {
      const entries = await this.fs.readdir(dir, { withFileTypes: true })
      return entries.some((e) => e.name === name)
    } catch (err) {
      if (isNotFound(err)) return false
      throw this.ioError(file, err)
    }
  }

  /** 读外置大对象（`artifacts.json` / `plan.json` / `verification.json` / `archive.json`）。 */
  async readObject<T>(root: string, requirementId: string, kind: ObjectKind, opts: { cold?: boolean } = {}): Promise<T | undefined> {
    const file = objectPath(root, requirementId, kind, opts)
    let text: string
    try {
      text = await this.fs.readFile(file, 'utf8')
    } catch (err) {
      if (isNotFound(err)) return undefined
      throw this.ioError(file, err)
    }
    try {
      return JSON.parse(text) as T
    } catch {
      await this.isolate(file, `${kind} JSON 解析失败`)
      return undefined
    }
  }

  /** 读追加日志（`comments.jsonl` / `history.jsonl`）；不存在 → 空日志（不是错误）。 */
  async readJournal(root: string, requirementId: string, kind: JournalKind, opts: { cold?: boolean } = {}): Promise<JournalReadResult> {
    return readJournalFile(this.fs, journalPath(root, requirementId, kind, opts))
  }

  /** 读全局元数据（`<root>/meta.json`）；不存在 → `undefined`（空数据根，不是错误）。 */
  async readMeta(root: string): Promise<ShardMeta | undefined> {
    const file = metaPath(root)
    let text: string
    try {
      text = await this.fs.readFile(file, 'utf8')
    } catch (err) {
      if (isNotFound(err)) return undefined
      throw this.ioError(file, err)
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text) as unknown
    } catch {
      await this.isolate(file, 'meta.json 解析失败')
      return undefined
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw Object.assign(new Error(`meta.json 结构不合规：${file}`), { code: REQUIREMENT_STORE_ERROR.VALIDATION_FAILED })
    }
    const o = parsed as Record<string, unknown>
    if (typeof o.schemaVersion !== 'number' || typeof o.revision !== 'number') {
      throw Object.assign(new Error(`meta.json 缺 schemaVersion/revision：${file}`), { code: REQUIREMENT_STORE_ERROR.VALIDATION_FAILED })
    }
    return parsed as ShardMeta
  }

  /** 原子写全局元数据（**迁移的提交点**：迁移脚本最后写它）。 */
  async writeMeta(root: string, meta: ShardMeta): Promise<void> {
    if (typeof meta.schemaVersion !== 'number' || typeof meta.revision !== 'number') {
      throw Object.assign(new Error('meta 缺 schemaVersion/revision，拒绝写入'), {
        code: REQUIREMENT_STORE_ERROR.VALIDATION_FAILED,
      })
    }
    await persistAtomic(metaPath(root), JSON.stringify(meta), this.fs)
  }

  // ── 写 ───────────────────────────────────────────────────────────────

  /**
   * 原子写热记录（**提交点**）。
   *
   * 校验全部发生在 `persistAtomic` **之前**——失败时连目录都不会建（验收 ④）。
   */
  async writeRecordAtomic(root: string, requirementId: string, record: RequirementRecord, opts: { cold?: boolean } = {}): Promise<void> {
    this.assertWritableRecord(requirementId, record)
    await persistAtomic(recordPath(root, requirementId, opts), JSON.stringify(record), this.fs)
  }

  /** 原子写外置对象（整份替换；单需求有界）。 */
  async writeObjectAtomic(root: string, requirementId: string, kind: ObjectKind, value: unknown, opts: { cold?: boolean } = {}): Promise<void> {
    if (!isRequirementId(requirementId)) {
      throw Object.assign(new Error(`需求 id 形态非法，拒绝写入：${JSON.stringify(requirementId)}`), {
        code: REQUIREMENT_STORE_ERROR.VALIDATION_FAILED,
      })
    }
    // `JSON.stringify(undefined)` 返回的不是字符串（函数、Symbol 同理）：不拦的话会走到
    // writeFile(undefined) ——写成垃圾或抛出难懂的类型错。校验先于任何写，这里响亮拒绝。
    const text = JSON.stringify(value)
    if (typeof text !== 'string') {
      throw Object.assign(
        new Error(`外置对象 ${kind} 不可序列化（值为 ${value === undefined ? 'undefined' : typeof value}），拒绝写入 ${requirementId}`),
        { code: REQUIREMENT_STORE_ERROR.VALIDATION_FAILED },
      )
    }
    await persistAtomic(objectPath(root, requirementId, kind, opts), text, this.fs)
  }

  /**
   * 追加一行日志（I-2：**追加前先按提交点计数截断未提交尾行**）。
   *
   * 语义与两条路径见 `ShardJournalIO.appendJournalLine`（含"为什么重写是安全的"）。
   * 这里只做入口校验（需求 id 形态）与路径拼接。
   */
  async appendJournal(
    root: string,
    requirementId: string,
    kind: JournalKind,
    line: JournalLine,
    count: number,
    opts: { cold?: boolean } = {},
  ): Promise<void> {
    if (!isRequirementId(requirementId)) {
      throw Object.assign(new Error(`需求 id 形态非法，拒绝追加日志：${JSON.stringify(requirementId)}`), {
        code: REQUIREMENT_STORE_ERROR.VALIDATION_FAILED,
      })
    }
    await appendJournalLine(this.fs, journalPath(root, requirementId, kind, opts), line, count, this.onWarn)
  }

  /**
   * 整份重写一份日志（**只追加纪律被违反时的降级路径**，见 `ShardJournalIO`；
   * 正常的尾部增长走 `appendJournal`，不要用本方法）。
   */
  async writeJournalAtomic(
    root: string,
    requirementId: string,
    kind: JournalKind,
    lines: readonly JournalLine[],
    opts: { cold?: boolean } = {},
  ): Promise<void> {
    if (!isRequirementId(requirementId)) {
      throw Object.assign(new Error(`需求 id 形态非法，拒绝重写日志：${JSON.stringify(requirementId)}`), {
        code: REQUIREMENT_STORE_ERROR.VALIDATION_FAILED,
      })
    }
    await persistAtomic(journalPath(root, requirementId, kind, opts), lines.map(encodeJournalLine).join(''), this.fs)
  }

  /** 删除一个外置对象（对象被清空时用；不存在不算错）。 */
  async deleteObject(root: string, requirementId: string, kind: ObjectKind, opts: { cold?: boolean } = {}): Promise<void> {
    if (!isRequirementId(requirementId)) {
      throw Object.assign(new Error(`需求 id 形态非法，拒绝删除对象：${JSON.stringify(requirementId)}`), {
        code: REQUIREMENT_STORE_ERROR.VALIDATION_FAILED,
      })
    }
    await this.fs.rm(objectPath(root, requirementId, kind, opts), { recursive: true, force: true })
  }

  /** 归档搬运：`requirements/<REQ>/` → `archive/<REQ>/`（整目录 rename，同文件系统内原子）。 */
  async moveToCold(root: string, requirementId: string): Promise<void> {
    if (!isRequirementId(requirementId)) {
      throw Object.assign(new Error(`需求 id 形态非法，拒绝搬运：${JSON.stringify(requirementId)}`), {
        code: REQUIREMENT_STORE_ERROR.VALIDATION_FAILED,
      })
    }
    if ((await this.listColdIds(root)).includes(requirementId)) {
      throw Object.assign(new Error(`冷侧已存在 ${requirementId}，拒绝覆盖（先人工处理归档冲突）`), {
        code: REQUIREMENT_STORE_ERROR.VALIDATION_FAILED,
      })
    }
    await this.fs.mkdir(archiveDir(root), { recursive: true })
    await renameShardDir(this.fs, requirementDir(root, requirementId), requirementDir(root, requirementId, { cold: true }))
  }

  /**
   * 删除一个分片目录（热/冷两侧都删；不存在不算错）。
   *
   * 用途：`replaceAll` 的**整体重建**——导入结构里没有的需求必须真的消失，
   * 否则"整体导入"会留下上一轮的幽灵需求（读得到、写不进）。
   */
  async deleteShard(root: string, requirementId: string): Promise<void> {
    if (!isRequirementId(requirementId)) {
      throw Object.assign(new Error(`需求 id 形态非法，拒绝删除：${JSON.stringify(requirementId)}`), {
        code: REQUIREMENT_STORE_ERROR.VALIDATION_FAILED,
      })
    }
    await removeShardDir(this.fs, requirementDir(root, requirementId))
    await removeShardDir(this.fs, requirementDir(root, requirementId, { cold: true }))
  }

  /** 反向搬运（人工把需求从归档搬回热侧）。 */
  async moveFromCold(root: string, requirementId: string): Promise<void> {
    if (!isRequirementId(requirementId)) {
      throw Object.assign(new Error(`需求 id 形态非法，拒绝搬运：${JSON.stringify(requirementId)}`), {
        code: REQUIREMENT_STORE_ERROR.VALIDATION_FAILED,
      })
    }
    if ((await this.listHotIds(root)).includes(requirementId)) {
      throw Object.assign(new Error(`热侧已存在 ${requirementId}，拒绝覆盖（先人工处理冲突）`), {
        code: REQUIREMENT_STORE_ERROR.VALIDATION_FAILED,
      })
    }
    await this.fs.mkdir(requirementsDir(root), { recursive: true })
    await renameShardDir(this.fs, requirementDir(root, requirementId, { cold: true }), requirementDir(root, requirementId))
  }

  // ── 枚举 ─────────────────────────────────────────────────────────────

  /** 热侧需求 id（**只返回目录**：忽略文件、`.corrupt` 残留、非需求命名）；目录不存在 → 空数组。 */
  async listHotIds(root: string): Promise<readonly string[]> {
    return listShardIdsIn(this.fs, requirementsDir(root))
  }

  /** 冷侧（归档）需求 id。 */
  async listColdIds(root: string): Promise<readonly string[]> {
    return listShardIdsIn(this.fs, archiveDir(root))
  }

  // ── 内部 ─────────────────────────────────────────────────────────────

  private assertWritableRecord(requirementId: string, record: RequirementRecord): void {
    const fail = (why: string): never => {
      throw Object.assign(new Error(`拒绝写入分片（${requirementId}）：${why}`), {
        code: REQUIREMENT_STORE_ERROR.VALIDATION_FAILED,
      })
    }
    if (!isRequirementId(requirementId)) fail(`需求 id 形态非法：${JSON.stringify(requirementId)}`)
    if (record === null || typeof record !== 'object') fail('记录不是对象')
    if (record.id !== requirementId) fail(`记录 id(${record.id}) 与目标目录(${requirementId}) 不一致`)
    if (typeof record.title !== 'string' || record.title.trim().length === 0) fail('标题为空')
    if (typeof record.status !== 'string') fail('status 不是字符串')
    if (typeof record.version !== 'number') fail('version 不是数字')
  }

  /** 坏文件隔离：改名 `<file>.corrupt-<ts>` + 告警。**只有解析失败才走这里**。 */
  private async isolate(file: string, why: string): Promise<void> {
    const target = `${file}.corrupt-${this.now()}`
    try {
      await this.fs.rename(file, target)
    } catch (err) {
      this.onWarn(`坏文件隔离失败（${why}）：${file} → ${target}：${(err as Error).message}`)
      return
    }
    this.onWarn(`坏文件已隔离（${why}）：${file} → ${target}`)
  }

  private ioError(path: string, cause: unknown): Error {
    return Object.assign(new Error(`分片 I/O 失败：${path}：${(cause as Error)?.message ?? String(cause)}`), {
      code: REQUIREMENT_STORE_ERROR.IO_FAILED,
      path,
      cause,
    })
  }
}
