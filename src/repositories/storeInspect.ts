/**
 * 两个存储载体的**只读体检**（REQ-261004103330-005f t5）——迁移门与启动快照共用同一份实现。
 *
 * ## 为什么必须共用
 *
 * "库到底有没有数据"这个问题，迁移门（决定要不要拒绝启动）与系统记录（决定 `stores` 快照与
 * 陈旧判定）都要回答。两处各写一份判据，就会出现"门说没数据、记录说有数据"这种自相矛盾——
 * 而本需求的 FR-12/FR-13 全建立在这个判定上。故收在这里，一处实现、两处消费。
 *
 * ## 只读纪律（继承迁移门的头注）
 *
 * 全程**不建目录、不写文件、不创建库**：库文件不存在就如实回 `exists:false`，绝不"探一下"就把它坐实。
 * 打开已有的库做计数是读操作；异常一律转成 `usable:false` 而不是抛出（探针失败要能被上层当作
 * "没有可用数据"处理，而不是让装配期崩在探查上）。
 *
 * @module dsh-pmboard/repositories/storeInspect
 */

import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import {
  ARCHIVE_DIR,
  META_FILE,
  RECORD_FILE,
  REQUIREMENTS_DIR,
  requirementsDir,
} from '../domain/requirement/ReqboardPaths.js'
import { SQLITE_META_KEYS } from './sqliteSchema.js'

/** 分片侧体检快照（与 `application/settings/events.ts` 的 `ShardsSnapshot` 结构兼容）。 */
export interface ShardsInspection {
  exists: boolean
  requirements: number
  bytes: number
  headRevision: number
  /** 有一次可用的 `meta.json` 且能读出 revision。 */
  metaReadable: boolean
}

/** SQLite 侧体检快照（与 `SqliteSnapshot` 结构兼容，另给 `usable` 与库版本）。 */
export interface SqliteInspection {
  exists: boolean
  requirements: number
  bytes: number
  /** 库存在、能打开、且 `requirements` 表里有 ≥1 行——即"有可用数据"。 */
  usable: boolean
  /** 库里的表结构版本（读不到 → undefined；迁移门与 FR-16 一致性核对都要它）。 */
  sqliteSchemaVersion?: number
}

/**
 * 数一个目录下"是需求分片"的子目录（含 `record.json` 的那些），并累加其字节数。
 *
 * 只 stat 一层：**不读文件内容**（不为了体检把几百个 `record.json` 全读进来）。
 * 这也意味着体检**拿不到**"分片最近写入时刻"，故调用方传 `lastWriteAt` 时会缺省——
 * 陈旧判定退化为只比条数（`staleSqliteReason` 已按缺省处理，不误判）。
 */
function countShardsIn(dir: string): { count: number; bytes: number } {
  if (!existsSync(dir)) return { count: 0, bytes: 0 }
  let count = 0
  let bytes = 0
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return { count: 0, bytes: 0 }
  }
  for (const entry of entries) {
    if (entry.isDirectory() !== true) continue
    const recordPath = join(dir, entry.name, RECORD_FILE)
    if (!existsSync(recordPath)) continue
    count += 1
    try {
      bytes += statSync(recordPath).size
    } catch {
      /* 数不到字节不影响"有没有数据"这个判定 */
    }
  }
  return { count, bytes }
}

/**
 * 分片根体检：热侧（`requirements/`）+ 冷侧（`archive/`）都算数。
 *
 * 为什么冷侧也要算：全归档的机器上热侧是空的，但数据**在**——按 `json` 侧"没数据"处理会
 * 让切库时静默跳过迁移（那正是 FR-12 要拦的开局）。
 */
export function inspectShards(root: string): ShardsInspection {
  const hot = countShardsIn(requirementsDir(root))
  const cold = countShardsIn(join(root, ARCHIVE_DIR))
  const requirements = hot.count + cold.count
  const bytes = hot.bytes + cold.bytes
  const metaPath = join(root, META_FILE)
  const metaExists = existsSync(metaPath)
  let headRevision = 0
  let metaReadable = false
  if (metaExists) {
    try {
      const parsed = JSON.parse(readFileSync(metaPath, 'utf8')) as { revision?: unknown }
      headRevision = typeof parsed.revision === 'number' ? parsed.revision : 0
      metaReadable = true
    } catch {
      metaReadable = false
    }
  }
  return {
    exists: metaExists || requirements > 0,
    requirements,
    bytes,
    headRevision,
    metaReadable,
  }
}

/** `node:sqlite` 的取用方式与 `SqliteRequirementStore` 同款：运行时 require，静态 import 会被构建器当裸包。 */
const loadDatabaseSync = (): (new (file: string) => {
  prepare: (sql: string) => { get: (...args: unknown[]) => unknown }
  close: () => void
}) => createRequire(import.meta.url)('node:sqlite').DatabaseSync

/**
 * SQLite 库体检。**任何异常都转成 `usable:false`**，不抛——探针失败的上层语义是
 * "没有可用数据"，由迁移门决定要不要拒绝启动，而不是让装配期崩在探查里。
 */
export function inspectSqlite(file: string): SqliteInspection {
  if (!existsSync(file)) return { exists: false, requirements: 0, bytes: 0, usable: false }
  let bytes = 0
  try {
    bytes = statSync(file).size
  } catch {
    /* 同上：字节数不是判定依据 */
  }
  try {
    const DatabaseSync = loadDatabaseSync()
    const db = new DatabaseSync(file)
    try {
      const row = db.prepare('SELECT COUNT(*) AS n FROM requirements').get() as { n?: unknown } | undefined
      const requirements = typeof row?.n === 'number' ? row.n : Number(row?.n ?? 0)
      let sqliteSchemaVersion: number | undefined
      try {
        const meta = db
          .prepare('SELECT value FROM meta WHERE key = ?')
          .get(SQLITE_META_KEYS.schemaVersion) as { value?: unknown } | undefined
        const parsed = Number(meta?.value)
        sqliteSchemaVersion = Number.isFinite(parsed) ? parsed : undefined
      } catch {
        /* 没有 meta 表 = 不是本实现建的库，按"读不到版本"处理 */
      }
      return {
        exists: true,
        requirements,
        bytes,
        usable: requirements > 0,
        ...(sqliteSchemaVersion === undefined ? {} : { sqliteSchemaVersion }),
      }
    } finally {
      try {
        db.close()
      } catch {
        /* 关不掉不影响结论 */
      }
    }
  } catch {
    // 文件在但不是可用的库（半成品/坏文件）→ 视为"没有可用数据"，
    // 由迁移门按"库不可用 + 分片有数据"拒绝启动并给出重建指引（FR-12/FR-13）。
    return { exists: true, requirements: 0, bytes, usable: false }
  }
}

/** 分片目录名的保留常量再导出（迁移门与测试都要点名这两个目录）。 */
export { ARCHIVE_DIR, REQUIREMENTS_DIR }
