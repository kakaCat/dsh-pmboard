/**
 * 产物投影的「活卡口径」单点（REQ-261005193546-1b1a · FR-5 / A3 / INV-F）。
 *
 * 背景：**同一处泄漏在两处投影里都出现过**——
 *   ① 文档面板（`QueryDocs`）：把取消卡名下的 `tasks/<id>.md` 列成文档行；
 *   ② 阶段详情（`QueryStageDetail.artifactsForStage`）：把同一批产物下发给客户端，
 *      由 `renderStagePanel` 的**追溯链**渲染成「任务卡（t-xxxx）」节点（实测 26/238）。
 * 两处都属「界面出现了已取消卡」，故判据必须**只有一个定义**——本模块就是那个定义。
 *
 * 判据刻意写成「**命中已取消集**」而不是「不命中活卡集合」：
 * 后者会把「队列读不到 / 卡不在本需求 / id 认不出」一律当成"已取消"从而**误删**界面行
 * （那是比漏删更坏的谎）。**认不出 → 保留（不猜）**。
 *
 * 已取消集由**活卡判据的补集**推导（`liveTasksOf`），本模块不新写任何 `status === 'canceled'`
 * 字面量——那是 INV-4 收掉的漂移源。
 */
import type { StageArtifact, TaskRecord } from '../../shared/protocol.js'
import { liveTasksOf } from '../../domain/status/Predicates.js'

/** 任务卡文档的产物路径形状（`/tasks/<task_id>.md` 结尾）——判据只认这一种形状。 */
export const TASK_CARD_DOC_RE = /\/tasks\/([^/]+)\.md$/

/** 由活卡判据推导「已取消卡 id 集合」（补集口径，不新写字面量）。 */
export function canceledIdsOf(tasks: readonly TaskRecord[]): ReadonlySet<string> {
  const live = new Set(liveTasksOf(tasks).map(t => t.id))
  return new Set(tasks.filter(t => !live.has(t.id)).map(t => t.id))
}

/** 该产物是否属**已知已取消卡**名下的任务卡文档。 */
export function isArtifactOfCanceledTask(path: string, canceledIds: ReadonlySet<string>): boolean {
  const m = TASK_CARD_DOC_RE.exec(path)
  return m !== null && canceledIds.has(m[1]!)
}

/** 按活卡口径过滤产物：剔除「已知已取消卡名下」的任务卡文档，其余照旧（含 fail-open）。 */
export function liveArtifactsOf<T extends Pick<StageArtifact, 'path'>>(
  artifacts: readonly T[],
  tasks: readonly TaskRecord[],
): T[] {
  const canceledIds = canceledIdsOf(tasks)
  return artifacts.filter(a => !isArtifactOfCanceledTask(a.path, canceledIds))
}
