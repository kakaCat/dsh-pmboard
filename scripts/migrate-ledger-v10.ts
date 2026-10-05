/**
 * v9 单册 → v10 分片迁移（REQ-261002161439-277d · t6 / FR-8）。
 *
 * ## 用法
 *
 * ```
 * node --import tsx/esm scripts/migrate-ledger-v10.ts --file ~/.dsh/dsh-reqboard.json \
 *   [--out ~/.dsh/reqboard] [--dry-run | --apply | --verify | --rollback] [--json] [--force]
 * ```
 * 缺省 `--dry-run`（只看报告，不动盘）。
 *
 * ## 沿用既有 v9 脚本的安全约定（`scripts/migrate-ledger.ts`）
 *
 * - 写前 `copyFileSync` 备份；
 * - `<ledgerDir>/state/server.pid` 存活时**拒绝 `--apply`**（防"内存态覆盖磁盘"），`--force` 跳过；
 * - **幂等**：已是 v10（`meta.json.schemaVersion === 10`）→ 报 `already_v10`，不重写任何文件；
 * - `--json` 输出机器可读报告。
 *
 * ## 提交点顺序（崩了也不会留下半迁移态）
 *
 * ```
 * ① 备份单册
 * ② 逐需求落分片（归档需求落 archive/）
 * ③ **最后**写 meta.json  ← 提交点
 * ```
 * 崩在 ②–③ 之间：`meta.json` 未写（或仍是 v9）⇒ 再跑一次从头重放即可（分片写入本身幂等）。
 *
 * ## 不做的事
 *
 * `--rollback`（v10 → v9 单册）由 t7 的 `scripts/rollback-ledger-v10.ts` 承担：那是**反向**映射，
 * 与正向迁移的"少一条都不行"是两套判据，塞在一个脚本里会互相干扰。本脚本的 `--rollback`
 * 只打印指引。
 *
 * @module scripts/migrate-ledger-v10
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { RequirementShardRepository } from '../src/repositories/RequirementShardRepository.js'
import { writeWholeShard } from '../src/repositories/shardWholeWrite.js'
import { isColdStatus } from '../src/domain/requirement/ReqboardPaths.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

/** v9 与 v10 的 schemaVersion。 */
export const LEDGER_V9 = 9
export const LEDGER_V10 = 10

export interface MigrateV10Options {
  /** 数据根（分片目录父目录）。 */
  readonly out: string
  /** 时钟（留痕与备份名用）。 */
  readonly now: number
  /** 迁移执行者（写进 migrations 留痕）。 */
  readonly by?: string
  /** 注入告警/进度通道（缺省不输出）。 */
  readonly onLog?: (message: string) => void
  /** 注入仓储（测试用来制造"第 k 条写失败"；缺省自建）。 */
  readonly repository?: RequirementShardRepository
}

export interface MigrateV10Report {
  readonly mode: 'dry-run' | 'apply' | 'verify'
  /** 单册里的需求条数。 */
  readonly total: number
  /** 实际落盘（dry-run 时为"将落盘"）的热侧条数。 */
  readonly hot: number
  readonly cold: number
  /** 无法装配而被跳过的需求（**必须非静默**）。 */
  readonly skipped: readonly { id: string; why: string }[]
  readonly backupPath?: string
  readonly metaPath?: string
}

/** 读 v9 单册（供本脚本与 t7 的回滚脚本复用）。抛错即"不能迁移"。 */
export function readV9Ledger(file: string): { ledger: Record<string, unknown>; requirements: readonly Record<string, unknown>[] } {
  if (!existsSync(file)) {
    throw Object.assign(new Error(`单册不存在：${file}`), { code: 'REQBOARD_FILE_MISSING' })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
  } catch (err) {
    throw Object.assign(new Error(`单册不是合法 JSON：${file}：${(err as Error).message}`), { code: 'REQBOARD_VALIDATION_FAILED' })
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw Object.assign(new Error(`单册结构不合规（不是对象）：${file}`), { code: 'REQBOARD_VALIDATION_FAILED' })
  }
  const ledger = parsed as Record<string, unknown>
  // v9 之前的单册必须先跑既有脚本：`tasks` 非空说明任务还在台账里，直接迁分片会把这批任务丢掉
  if (Array.isArray(ledger.tasks) && ledger.tasks.length > 0) {
    throw Object.assign(
      new Error(
        `单册仍带 ${(ledger.tasks as unknown[]).length} 条 tasks（v8 或更早）：先运行 scripts/migrate-ledger.ts --apply 把任务迁进各需求的 queue.json，再跑本脚本`,
      ),
      { code: 'LEDGER_REQUIRES_V9_FIRST' },
    )
  }
  if (typeof ledger.schemaVersion === 'number' && ledger.schemaVersion > LEDGER_V10) {
    throw Object.assign(
      new Error(`单册 schemaVersion=${String(ledger.schemaVersion)} 比本脚本（v10）新，拒绝降级迁移`),
      { code: 'LEDGER_TOO_NEW' },
    )
  }
  const requirements = Array.isArray(ledger.requirements) ? (ledger.requirements as Record<string, unknown>[]) : []
  return { ledger, requirements }
}

/** 单册里的迁移留痕（读路径必须原样带过：v9 曾因 load 丢了它以出事故）。 */
export function migrationsOf(ledger: Record<string, unknown>): { from: number; to: number; at: number; by: string }[] {
  const raw = ledger.migrations
  if (!Array.isArray(raw)) return []
  return raw.filter((m): m is { from: number; to: number; at: number; by: string } =>
    typeof m === 'object' && m !== null
    && typeof (m as { from?: unknown }).from === 'number'
    && typeof (m as { to?: unknown }).to === 'number')
}

/** 判断"是否已经是 v10"（幂等判据的唯一来源）。 */
export function isAlreadyV10(out: string): boolean {
  const metaFile = join(out, 'meta.json')
  if (!existsSync(metaFile)) return false
  try {
    const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as { schemaVersion?: unknown }
    return meta.schemaVersion === LEDGER_V10
  } catch {
    return false
  }
}

/** 单条需求能不能装配（不能则跳过并计入报告，不静默丢）。 */
function assembable(entry: Record<string, unknown>): string | undefined {
  if (typeof entry.id !== 'string' || entry.id.length === 0) return '缺 id'
  if (typeof entry.title !== 'string') return '缺 title'
  if (typeof entry.status !== 'string') return '缺 status'
  return undefined
}

/**
 * 执行迁移（`dryRun` 时只统计不落盘）。
 *
 * 分片写入走生产代码（`writeWholeShard`）——**不在这里另写一份"怎么落盘"**：
 * 迁移路径与运行时路径必须产生同一种布局，否则迁移完的数据与运行时写入的数据会不一样。
 */
export async function migrateToV10(
  file: string,
  options: MigrateV10Options & { dryRun?: boolean },
): Promise<MigrateV10Report> {
  const { out, now, by = 'migrate-ledger-v10', onLog } = options
  const dryRun = options.dryRun === true

  if (isAlreadyV10(out)) {
    onLog?.(`already_v10：${out} 已是 v10，未重写任何文件`)
    return { mode: dryRun ? 'dry-run' : 'apply', total: 0, hot: 0, cold: 0, skipped: [] }
  }

  const { ledger, requirements } = readV9Ledger(file)
  const skipped: { id: string; why: string }[] = []
  const entries: { record: RequirementRecord; cold: boolean }[] = []
  for (const raw of requirements) {
    const why = assembable(raw)
    if (why !== undefined) {
      skipped.push({ id: typeof raw.id === 'string' ? raw.id : '(无 id)', why })
      continue
    }
    const record = raw as unknown as RequirementRecord
    entries.push({ record, cold: isColdStatus(record.status) })
  }
  const hot = entries.filter((e) => !e.cold).length
  const cold = entries.length - hot

  if (dryRun) {
    return { mode: 'dry-run', total: requirements.length, hot, cold, skipped }
  }

  // ① 备份
  const backupPath = `${file}.backup-${now}`
  copyFileSync(file, backupPath)

  // ② 逐需求落分片
  const repo = options.repository ?? new RequirementShardRepository()
  mkdirSync(out, { recursive: true })
  for (const entry of entries) {
    await writeWholeShard(repo, out, entry.record)
    if (entry.cold) await repo.moveToCold(out, entry.record.id)
  }

  // ③ 最后写 meta.json（提交点）
  const migrations = [
    ...migrationsOf(ledger),
    { from: LEDGER_V9, to: LEDGER_V10, at: now, by },
  ]
  const metaPath = join(out, 'meta.json')
  await repo.writeMeta(out, {
    schemaVersion: LEDGER_V10,
    revision: typeof ledger.revision === 'number' ? ledger.revision : 0,
    migrations,
    // 分诊记录原样带过：**不因"现状 0 条"丢键**（丢键 = 静默丢数据）
    triages: Array.isArray(ledger.triages) ? (ledger.triages as unknown[]) : [],
  })

  for (const s of skipped) onLog?.(`跳过 ${s.id}：${s.why}`)
  onLog?.(`迁移完成：热侧 ${hot} 条、冷侧 ${cold} 条、跳过 ${skipped.length} 条 → ${out}`)
  return { mode: 'apply', total: requirements.length, hot, cold, skipped, backupPath, metaPath }
}

/** 校验分片与单册等价（mode=--verify；只报不等价的 id 清单，逐项比较交给 t7 的回滚脚本）。 */
export async function verifyV10(file: string, out: string): Promise<{ ok: boolean; missing: string[]; extra: string[]; mismatched: string[] }> {
  const { requirements } = readV9Ledger(file)
  const repo = new RequirementShardRepository()
  const hotIds = new Set(await repo.listHotIds(out))
  const coldIds = new Set(await repo.listColdIds(out))
  const missing: string[] = []
  const mismatched: string[] = []
  for (const raw of requirements) {
    const id = typeof raw.id === 'string' ? raw.id : ''
    if (id.length === 0) continue
    const onDisk = hotIds.has(id) ? await repo.readRecord(out, id) : coldIds.has(id) ? await repo.readRecord(out, id, { cold: true }) : undefined
    if (onDisk === undefined) {
      missing.push(id)
      continue
    }
    const expect = raw as { version?: unknown; title?: unknown }
    if (onDisk.version !== expect.version || onDisk.title !== expect.title) mismatched.push(id)
  }
  const expectIds = new Set(requirements.map((r) => (typeof r.id === 'string' ? r.id : '')).filter((id) => id.length > 0))
  const extra = [...hotIds, ...coldIds].filter((id) => !expectIds.has(id))
  return { ok: missing.length === 0 && extra.length === 0 && mismatched.length === 0, missing, extra, mismatched }
}

/** 服务存活探测（与既有 v9 脚本同口径：`<ledgerDir>/state/server.pid`）。 */
export function serviceRunning(ledgerFile: string): boolean {
  const pidFile = join(dirname(ledgerFile), 'state', 'server.pid')
  if (!existsSync(pidFile)) return false
  try {
    const pid = Number(readFileSync(pidFile, 'utf8').trim())
    if (!Number.isInteger(pid) || pid <= 0) return false
    process.kill(pid, 0) // 只探测存在性，不发信号
    return true
  } catch {
    return false
  }
}

const USAGE = `用法：--file <ledger> [--out <数据根>] [--dry-run|--apply|--verify|--rollback] [--json] [--force]（默认 --dry-run）
  注：--apply 会先探测 <ledgerDir>/state/server.pid，服务在跑时拒绝（防内存态覆盖磁盘）；--force 跳过该探测。
  --rollback 由 scripts/rollback-ledger-v10.ts 承担（反向映射是另一套判据）。`

function parseArgs(argv: readonly string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next
      i += 1
    } else {
      out[key] = true
    }
  }
  return out
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))
  const file = typeof args.file === 'string' ? resolve(args.file) : ''
  if (file.length === 0) {
    console.error(USAGE)
    return 2
  }
  const out = typeof args.out === 'string' ? resolve(args.out) : join(dirname(file), 'reqboard')
  const json = args.json === true
  const force = args.force === true
  const mode = args.apply === true ? 'apply' : args.verify === true ? 'verify' : args.rollback === true ? 'rollback' : 'dry-run'
  const now = Date.now()

  const emit = (payload: unknown): void => {
    if (json) console.log(JSON.stringify(payload, null, 2))
  }

  if (mode === 'rollback') {
    console.log('--rollback 已迁至 scripts/rollback-ledger-v10.ts（t7）：反向映射与正向迁移是两套判据。')
    emit({ mode, delegatedTo: 'scripts/rollback-ledger-v10.ts' })
    return 0
  }

  if (mode === 'apply' && !force && serviceRunning(file)) {
    console.error('❌ 检测到服务正在运行（state/server.pid 存活）——拒绝 --apply。先停服务，或用 --force 明确跳过。')
    emit({ mode, refused: 'service_running' })
    return 3
  }

  try {
    if (mode === 'verify') {
      const result = await verifyV10(file, out)
      emit({ mode, ...result })
      if (!json) console.log(result.ok ? '✅ 分片与单册等价' : `❌ 不等价：缺 ${result.missing.length}、多 ${result.extra.length}、字段不符 ${result.mismatched.length}`)
      return result.ok ? 0 : 1
    }
    const report = await migrateToV10(file, {
      out,
      now,
      dryRun: mode === 'dry-run',
      onLog: json ? undefined : (m) => console.log(m),
    })
    emit(report)
    if (!json) console.log(`[${report.mode}] 需求 ${report.total} 条：热侧 ${report.hot}、冷侧 ${report.cold}、跳过 ${report.skipped.length}`)
    return 0
  } catch (err) {
    console.error(`❌ ${(err as Error).message}`)
    emit({ mode, error: (err as Error).message, code: (err as { code?: string }).code })
    return 1
  }
}

/** 直接执行时才跑 main（被 import 时不跑——测试要 import 本模块的函数）。 */
if (process.argv[1] !== undefined && /migrate-ledger-v10\.(ts|mts|js)$/.test(process.argv[1])) {
  void main().then((code) => process.exit(code))
}
