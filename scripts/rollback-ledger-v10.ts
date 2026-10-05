/**
 * v10 分片 → legacy v9 单册（REQ-261002161439-277d · t7 / FR-8「可回滚」）。
 *
 * ## 为什么必须是独立脚本
 *
 * 正向迁移（t6）与反向导出是**两套判据**：前者要求"一条都不许少、顺序不能乱"，
 * 后者要求"导出的单册能被**旧版读路径**原样装载"。塞在一个脚本里，任一侧的判据改动都会
 * 影响另一侧，而回滚是出事时才用的东西——它必须简单到不会因为正向迁移的演进被弄坏。
 *
 * ## 用法
 *
 * ```
 * node --import tsx/esm scripts/rollback-ledger-v10.ts --root ~/.dsh/reqboard \
 *   --out ~/.dsh/dsh-reqboard.json [--dry-run | --apply] [--json] [--force]
 * ```
 * 缺省 `--dry-run`。
 *
 * ## 口径
 *
 * - 热侧 + 冷侧**全部**导出（归档需求在 v9 单册里只是 `status: 'archived'` 的普通条目）；
 * - **大字段重新内联**（comments/statusHistory/artifacts/plan/verification/archive），
 *   并**去掉 v10 才有的计数字段**——旧版读路径不认识它们；
 * - `schemaVersion` 写 **9**；`revision`、`migrations`、`triages` 从 `meta.json` 带过；
 * - 写前备份既有目标文件（`<out>.backup-<ts>`）；`--apply` 前探测服务存活（`--force` 跳过）。
 *
 * @module scripts/rollback-ledger-v10
 */
import { copyFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { RequirementShardRepository } from '../src/repositories/RequirementShardRepository.js'
import { ShardedRequirementStore } from '../src/repositories/ShardedRequirementStore.js'
import { persistAtomic } from '../src/repositories/atomicWrite.js'
import { LEDGER_V9, serviceRunning } from './migrate-ledger-v10.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

/** 旧版读路径不认识的字段（v10 热记录的内部计数）——导出时必须剔除。 */
const V10_ONLY_FIELDS = ['commentCount', 'historyCount', 'artifactCount'] as const

export interface ExportV9Result {
  /** 导出的单册结构（与 v9 形状一致）。 */
  readonly ledger: Record<string, unknown>
  readonly ids: readonly string[]
  /** 被剔除的 v10 专有字段计数（审计用：**证明**我们确实剔了）。 */
  readonly strippedFields: number
}

/** 去掉 v10 专有字段（不改入参）。 */
function stripV10Fields(record: RequirementRecord): { record: RequirementRecord; stripped: number } {
  const raw = { ...(record as unknown as Record<string, unknown>) }
  let stripped = 0
  for (const key of V10_ONLY_FIELDS) {
    if (key in raw) {
      delete raw[key]
      stripped += 1
    }
  }
  return { record: raw as unknown as RequirementRecord, stripped }
}

/**
 * 从 v10 数据根导出 v9 单册结构（**只读**，不写任何文件）。
 *
 * 读取走生产代码的 Store（`get` 会装配评论/历史/外置对象并剥掉计数字段），
 * 不在本脚本里另写一套"怎么读分片"。
 */
export async function exportV9(root: string): Promise<ExportV9Result> {
  const repo = new RequirementShardRepository()
  const meta = await repo.readMeta(root)
  const store = new ShardedRequirementStore({ root, repository: repo, onWarn: () => { /* 导出不吞任何东西：坏分片会被 get 返回 undefined，下面的 id 计数会如实少 */ } })

  const ids = [...(await repo.listHotIds(root)), ...(await repo.listColdIds(root))]
  const requirements: RequirementRecord[] = []
  let strippedFields = 0
  for (const id of ids) {
    const record = await store.get(id)
    if (record === undefined) continue
    const { record: cleaned, stripped } = stripV10Fields(record)
    strippedFields += stripped
    requirements.push(cleaned)
  }
  return {
    ledger: {
      schemaVersion: LEDGER_V9,
      revision: meta?.revision ?? 0,
      requirements,
      // 与迁移对称：留痕与分诊记录都原样带过（v9 单册的顶层键）
      migrations: meta?.migrations ?? [],
      triages: meta?.triages ?? [],
    },
    ids: requirements.map((r) => r.id),
    strippedFields,
  }
}

export interface RollbackOptions {
  readonly root: string
  readonly out: string
  readonly now: number
  readonly dryRun?: boolean
}

export interface RollbackReport {
  readonly mode: 'dry-run' | 'apply'
  readonly requirements: number
  readonly hot: number
  readonly cold: number
  /** 剔除的 v10 专有字段数（应为 requirements × 3 左右；为 0 说明没剔到，要查）。 */
  readonly strippedFields: number
  readonly backupPath?: string
}

/** 导出并（在 `dryRun` 为假时）写入目标单册。 */
export async function rollbackToV9(options: RollbackOptions): Promise<RollbackReport> {
  const { root, out, now, dryRun = true } = options
  const exported = await exportV9(root)
  const repo = new RequirementShardRepository()
  const hot = (await repo.listHotIds(root)).length
  const cold = (await repo.listColdIds(root)).length

  if (dryRun) {
    return { mode: 'dry-run', requirements: exported.ids.length, hot, cold, strippedFields: exported.strippedFields }
  }

  const backupPath = existsSync(out) ? `${out}.backup-${now}` : undefined
  if (backupPath !== undefined) copyFileSync(out, backupPath)
  await persistAtomic(out, JSON.stringify(exported.ledger, null, 2) + '\n')
  return { mode: 'apply', requirements: exported.ids.length, hot, cold, strippedFields: exported.strippedFields, ...(backupPath !== undefined ? { backupPath } : {}) }
}

const USAGE = `用法：--root <数据根> --out <单册路径> [--dry-run|--apply] [--json] [--force]（默认 --dry-run）
  注：--apply 会先探测 <root>/../state/server.pid 与 <out 所在目录>/state/server.pid，服务在跑时拒绝（--force 跳过）。`

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
  const root = typeof args.root === 'string' ? resolve(args.root) : ''
  const out = typeof args.out === 'string' ? resolve(args.out) : ''
  const json = args.json === true
  const force = args.force === true
  const dryRun = args.apply !== true
  if (root.length === 0 || out.length === 0) {
    console.error(USAGE)
    return 2
  }
  const emit = (payload: unknown): void => { if (json) console.log(JSON.stringify(payload, null, 2)) }

  if (!dryRun && !force && (serviceRunning(join(root, 'meta.json')) || serviceRunning(out))) {
    console.error('❌ 检测到服务正在运行——拒绝 --apply。先停服务，或用 --force 明确跳过。')
    emit({ mode: 'apply', refused: 'service_running' })
    return 3
  }

  try {
    const report = await rollbackToV9({ root, out, now: Date.now(), dryRun })
    emit(report)
    if (!json) {
      console.log(`[${report.mode}] 导出 ${report.requirements} 条（热 ${report.hot} / 冷 ${report.cold}），剔除 v10 专有字段 ${report.strippedFields} 个 → ${out}`)
    }
    return 0
  } catch (err) {
    console.error(`❌ ${(err as Error).message}`)
    emit({ error: (err as Error).message, code: (err as { code?: string }).code })
    return 1
  }
}

if (process.argv[1] !== undefined && /rollback-ledger-v10\.(ts|mts|js)$/.test(process.argv[1])) {
  void main().then((code) => process.exit(code))
}
