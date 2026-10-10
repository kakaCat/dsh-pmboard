/**
 * 占位重做卡判据（REQ-261005122915-9f90 t1 / FR-1, FR-2）——「这张卡是回退留的占位，
 * 不是已落库的活」的**唯一判定处**。
 *
 * ## 为什么必须有它
 *
 * 回退会为每张顶层父卡物化一张 `[重做]` 卡并置 `reworkOf` 指向旧卡——它的作用是让「这些活要重做」
 * 在 DAG 上可见，**本质是占位**：它不承载任何已完成的成果，重新拆分落库时会被新计划取代。
 *
 * 但两处判据此前都按「未取消就是活」来算：
 *   - `landApprovedPlan` 的幂等判据 ⇒ 占位卡让「已落库」恒真，新计划 0 张落库（REQ-261005105032-3b02 实测）；
 *   - 批准路径的推进证据 ⇒ 占位卡让「落库已生效」恒真，需求被推进到实施。
 *
 * 判据散在两处就必然漂移（本仓「两份真相」的既有教训），故收成 domain 纯函数一处：
 * 零外部依赖，application / http / domain 都能用，且可单独测。
 *
 * ## 为什么放 domain
 *
 * 这是**关于任务卡是什么**的领域事实（占位 vs 真卡），不是某个用例的实现细节。
 * 层边界只许向内（`kb-conventions-c01`）：domain 不 import 任何外层。
 *
 * @module dsh-pmboard/domain/task/ReworkPlaceholder
 */

/** 判据所需的最小形状（避免只为一个谓词去依赖完整 `TaskRecord`）。 */
export interface ReworkLike {
  /** 本卡是为取代哪张旧卡而物化的重做卡（回退物化时写死；普通卡无此键）。 */
  readonly reworkOf?: string
}

/** 带状态的形状（`liveRealCards` 用）。 */
export interface StatusLike {
  readonly status: string
}

/**
 * 占位重做卡：`reworkOf` 非空。
 *
 * 判据刻意**只看 `reworkOf`**：标题前缀（`[重做] `）是给人看的，改名就会失效；
 * `reworkOf` 是落库时写死的关系字段，改名改不动它。
 */
export function isReworkPlaceholder(t: ReworkLike): boolean {
  return (t.reworkOf ?? '') !== ''
}

/**
 * 活卡里的**真卡**：未取消、且不是回退占位卡。
 *
 * 用途（且仅此二处口径）：
 *   - 落库幂等判据（FR-1）：只有真卡才算「已经落过库」；
 *   - 批准路径的推进证据（FR-3）：只有真卡才能证明「落库已生效」。
 *
 * 注意与既有「活卡」口径（`status !== 'canceled'`）的区别：**活卡口径语义不变**，
 * 继续用于队列视图与看板泳道；本函数只服务上述两处判定，不做替换。
 */
export function liveRealCards<T extends StatusLike & ReworkLike>(tasks: readonly T[]): T[] {
  return tasks.filter((t) => t.status !== 'canceled' && !isReworkPlaceholder(t))
}
