/**
 * workspace 注册表原始行的**唯一归一实现**（REQ-261005141830-7a3b t1 · serves: FR-2, FR-3）。
 *
 * 为什么必须只有一份：`SessionWindowOpener.resolveSourceProject`（开窗落点）与
 * `WorkspaceRegistryProjectPort`（项目身份端口）都要把宿主注册表读成"谁在哪个项目里"。
 * 两处各写一遍扫描逻辑必然漂移（本仓有"两份真相"的教训），故在此归一，两处都调它。
 *
 * 归一规则（宽进严出，**不猜**）：
 *   · 行不是对象 / `id` 缺失或空 → 跳过该行（**不编造 id**）；
 *   · `id` 是数字 → 归一为字符串（宿主两种形态都出现过）；
 *   · `path` 非字符串 → 记为空串（空串在 `rootOfProject` 处视同"有 id 无根"）；
 *   · `sessionIds` 非数组 / 元素非字符串 → 记为空数组（该条目只是"没有任何窗口"）。
 *
 * @module dsh-pmboard/adapters/workspaceRegistryRows
 */
import type { ProjectEntry } from '../application/ports.js'

/** 把注册表原始行归一为项目条目；入参不是数组时由调用方处理（本函数只吃数组）。 */
export function toProjectEntries(rows: readonly unknown[]): ProjectEntry[] {
  const out: ProjectEntry[] = []
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    const w = row as { id?: unknown; path?: unknown; sessionIds?: unknown }
    const id = typeof w.id === 'string' && w.id.length > 0
      ? w.id
      : (typeof w.id === 'number' && Number.isFinite(w.id) ? String(w.id) : undefined)
    if (id === undefined) continue
    const path = typeof w.path === 'string' ? w.path : ''
    const sessionIds = Array.isArray(w.sessionIds)
      ? w.sessionIds.filter((s): s is string => typeof s === 'string' && s.length > 0)
      : []
    out.push({ id, path, sessionIds })
  }
  return out
}
