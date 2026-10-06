/**
 * 项目注册表端口的**唯一 I/O 实现**（REQ-261005141830-7a3b t1 · serves: FR-2, FR-3）。
 *
 * 为什么在 adapters：application 层禁 import 宿主包（层边界门禁），而项目表来自宿主
 * `workspaceRegistry.list()`。application 只认 `ProjectRegistryPort` 这个形状。
 *
 * **服务按调用时解析**（与 `SessionWindowOpener` 同款口径）：装配期拿不到 ≠ 永远拿不到，
 * 故每次都现取；三态一律返回 `undefined` 而不是抛错或空数组——
 * "拿不到项目表"与"确实一个项目都没有"是两件事，混同会让上层把未知当已知（本仓最忌静默）。
 *
 * @module dsh-pmboard/adapters/WorkspaceRegistryProjectPort
 */
import type { ProjectEntry, ProjectRegistryPort } from '../application/ports.js'
import { toProjectEntries } from './workspaceRegistryRows.js'

/** 注册表服务的最小投影（只取"列出项目"这一项能力）。 */
interface WorkspaceRegistryLike {
  list?: () => unknown
}

export class WorkspaceRegistryProjectPort implements ProjectRegistryPort {
  /**
   * @param resolveRegistry 惰性取注册表服务（取不到 / 抛错都视为未装配）
   */
  constructor(private readonly resolveRegistry: () => unknown) {}

  /**
   * 项目条目快照。以下情形**一律** `undefined`（未装配 / 非对象 / 无 `list` 方法 /
   * `list` 抛错 / `list` 返回非数组）——调用方据此走路径兜底并标注。
   */
  list(): readonly ProjectEntry[] | undefined {
    let raw: unknown
    try {
      raw = this.resolveRegistry()
    } catch {
      return undefined
    }
    if (raw === null || typeof raw !== 'object') return undefined
    const list = (raw as WorkspaceRegistryLike).list
    if (typeof list !== 'function') return undefined
    let rows: unknown
    try {
      rows = list.call(raw)
    } catch {
      return undefined
    }
    if (!Array.isArray(rows)) return undefined
    return toProjectEntries(rows)
  }
}
