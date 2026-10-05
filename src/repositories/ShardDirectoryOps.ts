/**
 * 分片**目录级**操作（REQ-261002161439-277d · t5 抽出）——列 id、冷热搬运、整目录删除。
 *
 * 抽出来的直接原因是 `RequirementShardRepository` 撞了单文件 ≤400 行的门禁；
 * 间接收益是"目录结构"这一类事实（有哪些需求、在哪一侧）与"文件内容"（记录/日志/对象）分开可读。
 * 这些函数只依赖注入的 fs 与路径事实源，不认识业务语义——校验与守卫留在仓储里。
 *
 * @module dsh-pmboard/repositories/ShardDirectoryOps
 */
import { REQUIREMENT_STORE_ERROR } from '../application/ports.js'
import { requirementIdOfDirName } from '../domain/requirement/ReqboardPaths.js'
import type { ShardFs } from './RequirementShardRepository.js'
import { isNotFound } from './ShardJournalIO.js'

/** 目录不存在 → 空数组（不是错误）。 */
export async function listShardIdsIn(fs: ShardFs, dir: string): Promise<readonly string[]> {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (err) {
    if (isNotFound(err)) return []
    throw Object.assign(new Error(`分片 I/O 失败：${dir}：${(err as Error)?.message ?? String(err)}`), {
      code: REQUIREMENT_STORE_ERROR.IO_FAILED,
      path: dir,
      cause: err,
    })
  }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => requirementIdOfDirName(e.name))
    .filter((id): id is string => id !== undefined)
    .sort()
}

/** 整目录 rename；源不存在 → `NOT_FOUND`，其余 IO 失败 → `IO_FAILED`。 */
export async function renameShardDir(fs: ShardFs, from: string, to: string): Promise<void> {
  try {
    await fs.rename(from, to)
  } catch (err) {
    if (isNotFound(err)) {
      throw Object.assign(new Error(`要搬运的需求目录不存在：${from}`), { code: REQUIREMENT_STORE_ERROR.NOT_FOUND })
    }
    throw Object.assign(new Error(`分片 I/O 失败：${to}：${(err as Error)?.message ?? String(err)}`), {
      code: REQUIREMENT_STORE_ERROR.IO_FAILED,
      path: to,
      cause: err,
    })
  }
}

/** 整目录删除（`force` 让"不存在"不算错）。 */
export async function removeShardDir(fs: ShardFs, dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true })
}
