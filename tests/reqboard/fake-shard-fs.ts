/**
 * 测试共享件 · 假分片文件系统（REQ-261002161439-277d · t3/t4）。
 *
 * 为什么抽出来共享：`tests/reqboard/shard-repository.test.ts`（仓储的失败路径）与
 * `tests/reqboard/store-contract.test.ts`（Store 的读契约）都需要一个能**注入故障**、
 * 并能**统计读写字节**的假 fs。两份手写必然漂移，而这类漂移的症状是"一个测试绿、另一个红"
 * ——正是本仓反复强调要避免的"第二实现"。
 *
 * 探针（`reads` / `readBytes` / `writes` / `readdirs`）直接服务卡上 A2：
 * 「`getSummary` 与 `listSummaries` 的 readFile 调用为 0、读入字节为 0」。
 */
import type { AtomicFileHandle } from '../../src/repositories/atomicWrite.js'
import type { RequirementShardRepository, ShardDirEntry, ShardFs } from '../../src/repositories/RequirementShardRepository.js'
import { encodeJournalLine, toCommentLine, toStatusLine, toAdvanceLine } from '../../src/domain/requirement/Journal.js'
import { isColdStatus } from '../../src/domain/requirement/ReqboardPaths.js'
import type { AdvanceRecord, CommentRecord, RequirementRecord, StatusEvent } from '../../src/shared/protocol.js'
import type { RequirementCounts } from '../../src/application/ports.js'

/** 一条分片的种子描述。 */
export interface ShardSeed {
  /** 热记录（含 v10 计数字段；缺省按 journals/objects 的实际条数补齐）。 */
  readonly record: RequirementRecord & Partial<RequirementCounts>
  readonly comments?: readonly CommentRecord[]
  readonly statusHistory?: readonly StatusEvent[]
  readonly advanceHistory?: readonly AdvanceRecord[]
  readonly objects?: Partial<Record<'artifacts' | 'plan' | 'verification' | 'archive', unknown>>
  /** true = 写完搬去冷侧（`archive/<REQ>/`）。 */
  readonly cold?: boolean
}

/**
 * 把一条分片写进数据根（走真实仓储写入路径，不手工拼路径）。
 *
 * 两条"要像真分片"的纪律：
 * 1. **大字段外置**：`record.json` 只留标量 + 计数，`comments`/`statusHistory`/`artifacts`/
 *    `plan`/`verification`/`archive` 与 `advance.history` 落日志或外置对象——否则测不出装配路径；
 *    入参既可以显式给 `comments` 等，也可以直接把完整记录塞进 `record`（助手自动外置）。
 * 2. **归档自动进冷侧**：`status ∈ {archived, done}` 的记录搬去 `archive/<REQ>/`，
 *    与真实布局一致（否则"默认载荷不含归档"这类断言测的是假状态）。
 */
export async function seedShard(
  repo: RequirementShardRepository,
  root: string,
  seed: ShardSeed,
): Promise<void> {
  const id = seed.record.id
  const comments = seed.comments ?? seed.record.comments ?? []
  const statusHistory = seed.statusHistory ?? seed.record.statusHistory ?? []
  const advanceHistory = seed.advanceHistory ?? seed.record.advance?.history ?? []
  const objects: Partial<Record<'artifacts' | 'plan' | 'verification' | 'archive', unknown>> = {
    ...(seed.record.artifacts !== undefined ? { artifacts: seed.record.artifacts } : {}),
    ...(seed.record.plan !== undefined ? { plan: seed.record.plan } : {}),
    ...(seed.record.verification !== undefined ? { verification: seed.record.verification } : {}),
    ...(seed.record.archive !== undefined ? { archive: seed.record.archive } : {}),
    ...(seed.objects ?? {}),
  }

  // 落盘的 record.json = 标量 + 计数（大字段一律外置）
  const onDisk: Record<string, unknown> = { ...(seed.record as unknown as Record<string, unknown>) }
  delete onDisk.comments
  delete onDisk.statusHistory
  delete onDisk.artifacts
  delete onDisk.plan
  delete onDisk.verification
  delete onDisk.archive
  if (onDisk.advance !== undefined && typeof onDisk.advance === 'object') {
    const advance = { ...(onDisk.advance as Record<string, unknown>) }
    delete advance.history
    onDisk.advance = advance
  }
  onDisk.commentCount = seed.record.commentCount ?? comments.length
  onDisk.historyCount = seed.record.historyCount ?? statusHistory.length + advanceHistory.length
  onDisk.artifactCount = seed.record.artifactCount ?? (Array.isArray(objects.artifacts) ? objects.artifacts.length : 0)

  await repo.writeRecordAtomic(root, id, onDisk as unknown as RequirementRecord)
  for (const [i, c] of comments.entries()) {
    await repo.appendJournal(root, id, 'comments', toCommentLine(i, c), i)
  }
  let seq = 0
  for (const s of statusHistory) {
    await repo.appendJournal(root, id, 'history', toStatusLine(seq, s), seq)
    seq += 1
  }
  for (const a of advanceHistory) {
    await repo.appendJournal(root, id, 'history', toAdvanceLine(seq, a), seq)
    seq += 1
  }
  for (const [kind, value] of Object.entries(objects)) {
    if (value === undefined) continue
    await repo.writeObjectAtomic(root, id, kind as 'artifacts' | 'plan' | 'verification' | 'archive', value)
  }
  if (seed.cold === true || isColdStatus(seed.record.status)) await repo.moveToCold(root, id)
}

export class FakeShardFs implements ShardFs {
  readonly files = new Map<string, string>()
  readonly dirs = new Set<string>(['/'])
  readonly faults = { rename: false, open: false, read: false }
  /** 探针：readFile 调用次数与读入字节（A2 用它证明"摘要零文件读"）。 */
  reads = 0
  readBytes = 0
  /** 探针：readdir 调用次数（摘要走内存后，它也该是 0）。 */
  readdirs = 0
  /** 探针：写入次数与**写入字节**（A1 写放大、A7 幂等判据用）。 */
  writes = 0
  writeBytes = 0

  async mkdir(path: string, _opts: { recursive: true }): Promise<void> {
    let cur = path
    while (cur.length > 1) {
      this.dirs.add(cur)
      const cut = cur.lastIndexOf('/')
      cur = cut <= 0 ? '/' : cur.slice(0, cut)
    }
  }

  async open(path: string, _flags: 'w'): Promise<AtomicFileHandle> {
    if (this.faults.open) throw Object.assign(new Error('注入：open 失败'), { code: 'EACCES' })
    this.files.set(path, '')
    return {
      writeFile: async (data: string) => {
        this.files.set(path, data)
        this.writes += 1
        this.writeBytes += data.length
      },
      sync: async () => { /* 假 fs 无落盘语义 */ },
      close: async () => { /* noop */ },
    }
  }

  async rename(from: string, to: string): Promise<void> {
    if (this.faults.rename) throw Object.assign(new Error('注入：rename 失败'), { code: 'EXDEV' })
    const isDir = this.dirs.has(from) || [...this.files.keys()].some((p) => p.startsWith(from + '/'))
    if (isDir) {
      // 内容必须在删除前取走，且 [旧, 新] 不能写反——写反的后果是"键没变、内容变成路径串"，
      // 这类假 fs 自身的 bug 会让上层搬运测试全绿却掩盖真问题（本需求实测踩过一次）。
      const moves: { to: string; content: string }[] = []
      for (const p of [...this.files.keys()]) {
        if (!p.startsWith(from + '/')) continue
        moves.push({ to: to + p.slice(from.length), content: this.files.get(p)! })
        this.files.delete(p)
      }
      for (const m of moves) this.files.set(m.to, m.content)
      const movedDirs: string[] = []
      for (const d of [...this.dirs]) {
        if (d === from || d.startsWith(from + '/')) { movedDirs.push(d); this.dirs.delete(d) }
      }
      for (const d of movedDirs) this.dirs.add(to + d.slice(from.length))
      return
    }
    const content = this.files.get(from)
    if (content === undefined) throw Object.assign(new Error(`ENOENT: ${from}`), { code: 'ENOENT' })
    this.files.delete(from)
    this.files.set(to, content)
  }

  async unlink(path: string): Promise<void> {
    this.files.delete(path)
  }

  async readFile(path: string, _encoding: 'utf8'): Promise<string> {
    if (this.faults.read) throw Object.assign(new Error('注入：读失败'), { code: 'EIO' })
    const content = this.files.get(path)
    if (content === undefined) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' })
    this.reads += 1
    this.readBytes += content.length
    return content
  }

  async appendFile(path: string, data: string, _encoding: 'utf8'): Promise<void> {
    // 与真实 fs 同语义：文件不存在则创建（appendFile 不是"只追加已有文件"）。
    this.files.set(path, (this.files.get(path) ?? '') + data)
    this.writes += 1
    this.writeBytes += data.length
  }

  async readdir(path: string, _opts: { withFileTypes: true }): Promise<readonly ShardDirEntry[]> {
    this.readdirs += 1
    const prefix = path.endsWith('/') ? path : path + '/'
    const names = new Map<string, boolean>()
    for (const d of this.dirs) {
      if (d === path || !d.startsWith(prefix)) continue
      const first = d.slice(prefix.length).split('/')[0]!
      if (!names.has(first)) names.set(first, true)
    }
    for (const f of this.files.keys()) {
      if (!f.startsWith(prefix)) continue
      const rest = f.slice(prefix.length)
      const first = rest.split('/')[0]!
      if (!names.has(first)) names.set(first, rest.includes('/'))
    }
    if (names.size === 0 && !this.dirs.has(path)) {
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' })
    }
    return [...names.entries()].map(([name, isDir]) => ({ name, isDirectory: () => isDir }))
  }

  async rm(path: string, _opts: { recursive: true; force: true }): Promise<void> {
    for (const p of [...this.files.keys()]) if (p === path || p.startsWith(path + '/')) this.files.delete(p)
    for (const d of [...this.dirs]) if (d === path || d.startsWith(path + '/')) this.dirs.delete(d)
  }

  /** 残留的临时文件（原子写失败必须清理干净）。 */
  tempLeftovers(): string[] {
    return [...this.files.keys()].filter((p) => p.endsWith('.tmp'))
  }

  /** 某目录下的文件数（断言"一个字节都不落盘"用）。 */
  fileCountUnder(dir: string): number {
    return [...this.files.keys()].filter((p) => p.startsWith(dir + '/')).length
  }

  /** 复位探针（A2：先热身，再断言稳态零读）。 */
  resetProbes(): void {
    this.reads = 0
    this.readBytes = 0
    this.readdirs = 0
    this.writes = 0
    this.writeBytes = 0
  }

  /** 直接塞一条原始文件内容（造坏分片用）。 */
  putFile(path: string, content: string): void {
    this.files.set(path, content)
  }

  /** 用日志行拼一份文件（走真实编码，不手写 JSON）。 */
  putJournal(path: string, lines: readonly Parameters<typeof encodeJournalLine>[0][]): void {
    this.files.set(path, lines.map(encodeJournalLine).join(''))
  }
}
