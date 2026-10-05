/**
 * 分片台账 → SQLite 库 一次性迁移（REQ-261004103330-005f · t9 / FR-10、FR-12、FR-13）。
 *
 * ## 用法
 *
 * ```
 * node --import tsx/esm scripts/migrate-ledger-to-sqlite.ts \
 *   --from ~/.dsh/reqboard [--to ~/.dsh/reqboard.sqlite] [--dry-run] [--write-settings]
 * ```
 *
 * ## 第一要求：失败也不伤源数据
 *
 * 源分片目录**全程只读**——本脚本任何路径下都不写它（连 `--dry-run` 也一样）。
 * 迁移过程写在**暂存库** `<to>.migrating-<时间戳>` 上，校验通过才 `rename` 顶上目标库；
 * 校验不过就**删掉暂存库、目标库原样不动**。故"崩在中间"最坏结果是留下一个暂存文件，
 * 而不是一个半成品库。
 *
 * ## 与设计的一处偏离（写在明处）
 *
 * `design/data-model.md` 写的是"单事务内逐需求导入，不过就回滚"。本脚本改为**暂存库**：
 * 端口 `replaceAll` 内部确实是**单事务**（建表 + 逐条写 + 提交点一起），但事务一旦返回就已提交，
 * 端口没有暴露"提交前回调"，脚本**无法在事务内做校验**——而"校验不过就回滚"必须有那个时机。
 * 暂存库把同一保证做得更硬：校验是在**将要成为目标库的那份字节**上做的，失败时目标库
 * 从头到尾没被碰过（比"原地写完再回滚"少一次写放大，也少一类"回滚本身失败"的风险）。
 *
 * ## 八步（与卡一致）
 *
 * ① 预检（源有没有 `meta.json`、目标在不在、陈旧判定复用统一判据）
 * ② 备份源分片目录 ③ 旧库先备份再重建 ④ 建库建表 ⑤ 单事务导入
 * ⑥ 校验（条数 + id 集合 + 抽样逐字段深比较，不过即回滚） ⑦ 写设置（仅通过且显式要求时）
 * ⑧ 退出码 0/2/3/4 ⑨ 记系统记录（`migration` 事件；成功与失败都记，见 `recordMigrationEvent`）
 *
 * ## 不做的事
 *
 * 不依赖 `ShardedRequirementStore` 的广播/返回记录里的 `version`（见 `notes/findings.md` 发现 A：
 * 那条路径回的 version 是旧的）——本脚本逐条走**权威读** `get(id)`。
 *
 * @module scripts/migrate-ledger-to-sqlite
 */
import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { SqliteRequirementStore } from '../src/repositories/SqliteRequirementStore.js'
import { FileSettingsStore } from '../src/adapters/FileSettingsStore.js'
import { staleSqliteReason, type ShardsSnapshot, type SqliteSnapshot } from '../src/application/settings/events.js'
import {
  countRequirementsReadOnly,
  recordMigrationEvent,
  dshHomeOf,
  readSourceLedger,
  stamp,
  type SourceLedger,
} from './migrate-support.js'
import type { RunSettingsPatch } from '../src/application/settings/resolve-settings.js'
import type { ConfirmStamp } from '../src/application/settings/events.js'
import { REQBOARD_SCHEMA_VERSION, type ReqboardLedger } from '../src/shared/protocol.js'

/** 退出码（卡里定死；调用方据此判断"能不能重试"）。 */
export const MIGRATE_EXIT = {
  /** 成功（目标库已是新库、设置可选已写）。 */
  ok: 0,
  /** 预检不过（源不是分片布局 / 参数缺失）——改环境后重跑。 */
  preflight: 2,
  /** 校验不过（已回滚，目标库未动）——查数据后重跑。 */
  verify: 3,
  /** IO 失败（备份/建库/改名）——查权限与磁盘后重跑。 */
  io: 4,
} as const

/** 抽样校验条数（缺省 5，与卡一致）。 */
export const SAMPLE_SIZE = 5

export interface MigrateSeams {
  /** 覆写源读取（测试注入读失败）。 */
  readSource?: (from: string) => Promise<SourceLedger>
  /** 覆写逐字段深比较（测试注入"校验不过"）。 */
  deepEqual?: (a: unknown, b: unknown) => boolean
  /** 抽样条数（缺省 {@link SAMPLE_SIZE}）。 */
  sampleSize?: number
}

/** 源台账类型（实现搬到 `migrate-support`，入口再导出以保持调用方面不变）。 */
export type { SourceLedger }

export interface MigrateToSqliteOptions {
  /** 分片数据根（必填；不猜）。 */
  from: string
  /** 目标库文件（缺省 `<dshHome>/reqboard.sqlite`）。 */
  to?: string
  /** DSH 主目录（缺省 `$DSH_HOME` 或 `~/.dsh`）；备份目录与默认库路径都基于它。 */
  dshHome?: string
  /** 只预检与打印计划，**不写任何文件**。 */
  dryRun?: boolean
  /** 校验通过后写 `storage.backend = sqlite`。 */
  writeSettings?: boolean
  /** 人工确认留痕（FR-10/FR-11）：由调用方把"已落章"的确认戳递进来，脚本不自造。 */
  confirmedBy?: ConfirmStamp
  /** 时钟（备份命名与留痕）。 */
  now?: number
  /** 进度输出（每步一行）。 */
  onLog?: (line: string) => void
  seams?: MigrateSeams
}

export interface MigrateReport {
  code: number
  /** 人读结论（一行）。 */
  reason: string
  target: string
  /** 备份目录（做了备份时给出）。 */
  backupDir?: string
  /** 旧库备份文件（目标库原本就在时给出）。 */
  previousDbBackup?: string
  /** 陈旧提示（有则说明"先备份旧库再全量重建"）。 */
  staleReason?: string
  requirementCount?: number
}

/**
 * 迁移主流程（可注入、可测；CLI 只是它的薄壳）。
 *
 * 返回值即退出码语义：`code` 为 {@link MIGRATE_EXIT} 之一。**不抛**（IO 异常也翻成 4）。
 */
async function runMigration(opts: MigrateToSqliteOptions): Promise<MigrateReport> {
  const log = opts.onLog ?? ((): void => {})
  const now = opts.now ?? Date.now()
  const ts = stamp(now)
  const from = resolve(opts.from)
  const home = dshHomeOf(opts)
  const target = resolve(opts.to ?? join(home, 'reqboard.sqlite'))
  const source = from
  const staging = `${target}.migrating-${ts}`

  // ① 预检 ————————————————————————————————————————————————
  if (!existsSync(join(source, 'meta.json'))) {
    log('① 预检不过：' + source + ' 下没有 meta.json（不是分片数据根）')
    log('   怎么办：先跑 scripts/migrate-ledger-v10.ts 把旧单册迁成分片，再来切库')
    return { code: MIGRATE_EXIT.preflight, reason: '源不是分片布局（缺 meta.json）', target }
  }
  let src: SourceLedger
  try {
    src = opts.seams?.readSource !== undefined
      ? await opts.seams.readSource(source)
      : await readSourceLedger(source, (m) => log('   [源告警] ' + m))
  } catch (err) {
    log('④ 读源失败：' + String(err))
    return { code: MIGRATE_EXIT.io, reason: '读源失败', target }
  }
  const before = countRequirementsReadOnly(target)
  let staleReason: string | undefined
  if (before !== undefined) {
    const shards: ShardsSnapshot = {
      exists: true,
      requirements: src.requirements.length,
      bytes: 0,
      headRevision: src.revision,
      ...(src.lastWriteAt !== undefined ? { lastWriteAt: src.lastWriteAt } : {}),
    }
    const sqlite: SqliteSnapshot = { exists: true, requirements: before, bytes: 0, stale: false }
    staleReason = staleSqliteReason(shards, sqlite)
  }
  log(`① 预检：源 ${source}（${src.requirements.length} 条，revision ${src.revision}）；目标 ${target}`
    + (before === undefined ? '（不存在，将新建）' : `（已存在，${before} 条）`))
  if (staleReason !== undefined) {
    log('   ⚠ 检出陈旧库：' + staleReason)
    log('   → 本次会先把旧库备份为 <库文件>.bak-' + ts + '，再全量重建（绝不用旧库当现状）')
  }

  if (opts.dryRun === true) {
    log('②–⑦ 跳过（--dry-run：只预检与打印计划，不写任何文件）')
    log('   dry-run 计划：备份源 → 备份旧库（若有）→ 建暂存库 → 单事务导入 → 校验 → '
      + (opts.writeSettings === true ? '写设置 storage.backend=sqlite' : '不写设置（未传 --write-settings）')
      + ' → 暂存库顶上目标')
    return {
      code: MIGRATE_EXIT.ok,
      reason: 'dry-run 完成（未写任何文件）',
      target,
      ...(staleReason !== undefined ? { staleReason } : {}),
      requirementCount: src.requirements.length,
    }
  }

  // ② 备份源分片目录（只增不删）————————————————————————————
  const backupDir = join(home, 'backups', `reqboard-${ts}`)
  try {
    mkdirSync(dirname(backupDir), { recursive: true })
    cpSync(source, backupDir, { recursive: true })
    log('② 已备份源分片：' + backupDir)
  } catch (err) {
    log('② 备份源失败：' + String(err))
    return { code: MIGRATE_EXIT.io, reason: '备份源分片失败', target }
  }

  // ③ 旧库先备份再重建 ——————————————————————————————————————
  let previousDbBackup: string | undefined
  try {
    if (existsSync(target)) {
      previousDbBackup = `${target}.bak-${ts}`
      cpSync(target, previousDbBackup)
      log('③ 旧库已备份：' + previousDbBackup)
    } else {
      log('③ 目标库不存在，无需备份')
    }
  } catch (err) {
    log('③ 备份旧库失败：' + String(err))
    return { code: MIGRATE_EXIT.io, reason: '备份旧库失败', target, backupDir }
  }

  // ④⑤ 建暂存库 + 单事务导入 ————————————————————————————————
  let staging$: SqliteRequirementStore | undefined
  const cleanupStaging = (): void => {
    try {
      staging$?.close()
    } catch {
      /* 关不掉不影响结论（下面就是删文件） */
    }
    try {
      rmSync(staging, { force: true })
      rmSync(`${staging}-wal`, { force: true })
      rmSync(`${staging}-shm`, { force: true })
    } catch {
      /* 删不掉也要把结论如实报出去（不掩盖） */
    }
  }
  try {
    mkdirSync(dirname(target), { recursive: true })
    staging$ = new SqliteRequirementStore({ file: staging, now: () => now, onWarn: (m) => log('   [暂存库告警] ' + m) })
    log('④ 暂存库已建表：' + staging)
    const ledger: ReqboardLedger = {
      schemaVersion: REQBOARD_SCHEMA_VERSION,
      revision: src.revision,
      requirements: src.requirements,
      triages: src.triages,
    }
    await staging$.replaceAll('migrate-ledger-to-sqlite', ledger)
    log(`⑤ 单事务导入完成：${src.requirements.length} 条需求 + ${src.triages.length} 条分诊`)
  } catch (err) {
    log('⑤ 导入失败：' + String(err))
    cleanupStaging()
    return { code: MIGRATE_EXIT.io, reason: '导入失败（暂存库已删，目标库未动）', target, backupDir }
  }

  // ⑥ 校验：条数 + id 集合 + 抽样逐字段深比较 ————————————————————
  const deepEqual = opts.seams?.deepEqual ?? ((a: unknown, b: unknown): boolean => isDeepStrictEqual(a, b))
  const sampleSize = opts.seams?.sampleSize ?? SAMPLE_SIZE
  try {
    const page = await staging$.listSummaries({ scope: 'all', limit: 100_000 })
    const gotIds = page.items.map((i) => i.id).sort()
    const wantIds = src.requirements.map((r) => r.id).sort()
    if (gotIds.length !== wantIds.length || gotIds.some((id, i) => id !== wantIds[i])) {
      throw new Error(`条数/id 集合不一致：源 ${wantIds.length} 条，库 ${gotIds.length} 条`)
    }
    const sample = wantIds.slice(0, Math.max(0, sampleSize))
    for (const id of sample) {
      const sourceRec = src.requirements.find((r) => r.id === id)
      const storedRec = await staging$.get(id)
      if (sourceRec === undefined || storedRec === undefined) throw new Error(`抽样 ${id} 读不回`)
      if (!deepEqual(sourceRec, storedRec)) throw new Error(`抽样 ${id} 逐字段比较不一致`)
    }
    log(`⑥ 校验通过：条数与 id 全等；抽样 ${sample.length} 条逐字段一致`)
  } catch (err) {
    log('⑥ 校验不过：' + String(err))
    cleanupStaging()
    log('   → 已回滚（暂存库已删），目标库与源分片**逐字节未变**')
    return { code: MIGRATE_EXIT.verify, reason: '校验不过（已回滚）', target, backupDir }
  }

  // ⑦ 写设置（仅校验通过 + 显式要求）————————————————————————
  if (opts.writeSettings === true) {
    try {
      const settings = new FileSettingsStore({ dshHome: home, onWarn: (m) => log('   [设置告警] ' + m) })
      await settings.update({ storage: { backend: 'sqlite' } } as unknown as RunSettingsPatch)
      log('⑦ 已写设置：storage.backend = sqlite（重启宿主后生效）')
    } catch (err) {
      log('⑦ 写设置失败：' + String(err))
      cleanupStaging()
      return { code: MIGRATE_EXIT.io, reason: '写设置失败（暂存库已删，目标库未动）', target, backupDir }
    }
  } else {
    log('⑦ 跳过写设置（未传 --write-settings）')
  }

  // ⑧ 顶上目标库 ————————————————————————————————————————
  try {
    staging$?.close()
    staging$ = undefined
    if (existsSync(target)) {
      rmSync(target, { force: true })
      rmSync(`${target}-wal`, { force: true })
      rmSync(`${target}-shm`, { force: true })
    }
    renameSync(staging, target)
    log('⑧ 暂存库已顶上目标：' + target)
    return {
      code: MIGRATE_EXIT.ok,
      reason: '迁移完成',
      target,
      backupDir,
      ...(previousDbBackup !== undefined ? { previousDbBackup } : {}),
      ...(staleReason !== undefined ? { staleReason } : {}),
      requirementCount: src.requirements.length,
    }
  } catch (err) {
    log('⑧ 顶替失败：' + String(err))
    cleanupStaging()
    return { code: MIGRATE_EXIT.io, reason: '顶替目标库失败（暂存库已删）', target, backupDir }
  }
}

/**
 * 对外入口 = **迁移 + 记系统记录**（⑨）。
 *
 * 为什么用包装而不是在每个 `return` 前补写：本函数有 8 处返回（预检 / 读源失败 / 备份失败 /
 * 旧库备份失败 / 导入失败 / 校验不过 / 写设置失败 / 顶替失败 / 成功），逐处补必然漏一处——
 * **"失败路径没留痕"这类事故就是这么来的**。包一层之后，返回路径再多也只写一次。
 */
export async function migrateLedgerToSqlite(opts: MigrateToSqliteOptions): Promise<MigrateReport> {
  const clock = (): number => opts.now ?? Date.now()
  const startedAt = clock()
  const report = await runMigration(opts)
  // ⑨ 记系统记录：实现在 `migrate-support`（与"读"类辅助同居一处）；成功与失败都记。
  await recordMigrationEvent({
    from: opts.from,
    ...(opts.dshHome !== undefined ? { dshHome: opts.dshHome } : {}),
    dryRun: opts.dryRun === true,
    ...(opts.confirmedBy !== undefined ? { confirmedBy: opts.confirmedBy } : {}),
    onLog: opts.onLog ?? ((): void => {}),
    ok: report.code === MIGRATE_EXIT.ok,
    reason: report.reason,
    target: report.target,
    ...(report.backupDir !== undefined ? { backupDir: report.backupDir } : {}),
    requirementCount: report.requirementCount ?? 0,
    startedAt,
    endedAt: clock(),
  })
  return report
}

// ── CLI 薄壳 ────────────────────────────────────────────────────────────

function parseArgs(argv: readonly string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next
      i++
    } else {
      out[key] = true
    }
  }
  return out
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))
  const from = typeof args.from === 'string' ? args.from : ''
  if (from.length === 0) {
    console.error('用法：migrate-ledger-to-sqlite --from <分片数据根> [--to <库文件>] [--dry-run] [--write-settings]')
    console.error('❌ 未给 --from：源数据根**必须显式指定**（不猜，猜错方向就是搬错数据）')
    return MIGRATE_EXIT.preflight
  }
  const report = await migrateLedgerToSqlite({
    from,
    ...(typeof args.to === 'string' ? { to: args.to } : {}),
    dryRun: args['dry-run'] === true,
    writeSettings: args['write-settings'] === true,
    onLog: (line) => console.log(line),
  })
  console.log(`结论：${report.reason}（退出码 ${report.code}）`)
  return report.code
}

if (process.argv[1] !== undefined && /migrate-ledger-to-sqlite\.(ts|mts|js)$/.test(process.argv[1])) {
  void main().then((code) => process.exit(code))
}
