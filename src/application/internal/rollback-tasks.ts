/**
 * 回退时的旧任务卡处置（REQ-261003204149-1e80 FR-4）——「旧卡有归宿」的唯一实现处。
 *
 * 现状缺口（两个方向同时错）：
 *  - 旧卡留在原地 ⇒ `checkDecomposeIdempotency` 的「已有未取消任务」判据把重拆**拒死**；
 *  - 而 `taskCompletenessGap` 又因 `live > 0` 放行 ⇒ 二次实施跑的是**与新计划不符的旧卡**。
 *
 * 处置（照抄验收返工的既有范式，不另造机制）：
 *  ① 未取消旧卡一律标 `canceled`，并 push 一条 `kind='rollback'` 的修订（append-only，可回溯）；
 *  ② 为每张旧卡物化一张**重做卡**（`reworkOf` 指向旧卡），让「这些活要重做」在 DAG 上可见，
 *     而不是被静默丢弃；重新拆分落库时这些重做卡被新计划取代。
 *
 * **纯函数**：不改传入的 `tasks`，只返回计划（副本 + 新卡）。落库与顺序契约由调用方负责
 * （任务先写、需求后写——与 verdicts 的 I-11 顺序契约同款）。
 *
 * @module dsh-pmboard/application/internal/rollback-tasks
 */
import type { ActorRef, RequirementRecord, RequirementStatus, TaskRecord } from '../../shared/protocol.js'
import { markCanceled } from '../../shared/protocol.js'

/** 回退的卡处置计划（调用方据此落库）。 */
/**
 * 单次回退物化的**上限**（REQ-261004121649-bfa7 t2 / FR-3）。
 * 超过它说明上一次回退的卡没清理（今天实测过一次 56 张），此时**整次拒绝**比"先落库再让人发现"好。
 */
export const ROLLBACK_MATERIALIZE_LIMIT = 20

export interface RollbackTaskPlan {
  /** 需被标 `canceled` 的旧卡（**副本**，已带 rollback 修订；原数组不受影响） */
  canceled: TaskRecord[]
  /** 需新建的重做卡（`status='todo'`，`reworkOf` 指向被取代的旧卡） */
  reworkDrafts: TaskRecord[]
  /**
   * 子卡**原地复位**（REQ-261004121649-bfa7 FR-1）：status 回 todo，**保留** parentId/stageKind。
   * 与 `canceled` 同样是一份「整卡副本」，调用方写法一致。
   */
  resetTasks: TaskRecord[]
}

/** id 生成口（只用到 task 一种，收窄入参便于测试注入确定 id）。 */
export interface TaskIdFactory {
  task(): string
}

/**
 * 生成回退的卡处置计划。
 *
 * @param reason 回退理由（写进旧卡的 rollback 修订，供看板回答「为什么这批卡被放弃了」）
 */
export function planRollbackTasks(
  req: RequirementRecord,
  tasks: readonly TaskRecord[],
  to: RequirementStatus,
  now: number,
  actor: ActorRef,
  ids: TaskIdFactory,
  reason: string,
): RollbackTaskPlan {
  // 只处置「本需求 + 未取消」的卡：已取消的卡没有可放弃的东西，不重复留痕。
  const live = tasks.filter(t => t.requirementId === req.id && t.status !== 'canceled')

  const canceled = live.map((t) => {
    const copy = structuredClone(t)
    copy.status = 'canceled'
    copy.blocked = false
    delete copy.blockedReason
    copy.revisions = [
      ...(copy.revisions ?? []),
      {
        at: now,
        by: actor,
        kind: 'rollback',
        reason,
        changes: ['status: ' + t.status + '→canceled'],
      },
    ]
    copy.updatedAt = now
    copy.updatedBy = actor
    return copy
  })

  // REQ-261004121649-bfa7 t1 / FR-1：**只有顶层父卡物化重做卡**。
  // 此前对 `live` 里每一张卡都物化——包括子卡；子卡因此丢了子卡身份、升格成顶层父卡，
  // 一开工又按默认模板展开子链 → 名字递归成「…·研发·研发」（实测 17 张 → 73 张）。
  const isTopLevel = (t: TaskRecord): boolean => (t.parentId ?? '') === ''
  // 幂等（REQ-261004121649-bfa7 t2 / FR-3）：已经有「活的重做卡」指向这张父卡时不再物化。
  // 幂等键实质是 (需求, 卡, 回退序号)——序号体现在"上一次物化的卡还在不在"上（还在 = 已物化过）。
  const alreadyReworked = new Set(
    tasks.filter(t => (t.reworkOf ?? '') !== '' && t.status !== 'canceled').map(t => t.reworkOf as string),
  )
  // 两种卡都不物化（否则第二次回退又递归）：
  //   ① 已经有「活的重做卡」指向它（幂等）；
  //   ② 它自己就是一张重做卡（`reworkOf` 非空）——回退重做卡只会造出「重做卡的重做卡」。
  const topsToRework = live.filter(
    t => isTopLevel(t) && !alreadyReworked.has(t.id) && (t.reworkOf ?? '') === '',
  )

  // 分流后果：只有顶层父卡被取消；子卡改为复位（副本 status 回 todo，身份字段原样留着）。
  const topIds = new Set(topsToRework.map(t => t.id))
  const canceledTop = canceled.filter(c => topIds.has(c.id))
  // REQ-261005122915-9f90 t5 / FR-4：**占位重做卡不参与复位，而是随本轮回退一并取消**。
  // 它们既不在 `topsToRework`（第 ②条显式排除 `reworkOf` 非空），又没有 `parentId`，
  // 于是此前落进下面那条「子卡复位」分支被改回 `todo` —— 占位卡因此**每一轮回退都清不掉**，
  // 继续污染下一轮的落库幂等判据（实测：23 卡计划 0 张落库）。
  // 注意：返回体的 `canceled` 只含 `canceledTop`（要物化重做卡的那批），故这里必须
  // **显式把占位卡并进 `canceled`**——只从 resetTasks 里过滤掉会让它们两边都不落、留在 todo。
  const canceledPlaceholders = canceled.filter(c => (c.reworkOf ?? '') !== '')
  // 取消留痕（REQ-261005193546-1b1a FR-3）：只对**本批真被取消**的那两类卡写三字段
  // （顶层父卡 + 占位重做卡）；子卡走的是「原地复位」分支，**不写**（复位 ≠ 取消，
  // 写上去会让一张 todo 卡看起来"曾被取消"）。整批同源：`at` = 本批 `now`、
  // `by` = 触发本批回退的人、`reason` = 本批回退理由（不是逐卡理由）。
  // 为什么不写在上面 `live.map` 那一处（那里才是 `copy.status = 'canceled'`）：那一份 copy
  // 还会被下面的「子卡复位」分支浅拷贝成 todo 卡，就地写会连带污染复位卡。
  for (const c of [...canceledTop, ...canceledPlaceholders]) {
    markCanceled(c, { at: now, by: actor, reason })
  }
  const resetTasks = canceled
    .filter(c => !topIds.has(c.id) && (c.reworkOf ?? '') === '')
    .map((c): TaskRecord => ({
      ...c,
      status: 'todo',
      statusHistory: [
        ...(c.statusHistory ?? []),
        { status: 'todo', at: now, by: actor, reason: '需求回退到 ' + to + '：子卡原地复位（不升格、不物化）' },
      ],
    }))

  const reworkDrafts = topsToRework.map((t): TaskRecord => ({
    id: ids.task(),
    requirementId: t.requirementId,
    title: '[重做] ' + t.title,
    description: t.description,
    phase: t.phase,
    side: t.side,
    // 旧依赖随旧卡失效：保留会指向已取消的卡。
    dependsOn: [],
    scope: structuredClone(t.scope),
    acceptance: t.acceptance,
    ...(t.implementation !== undefined ? { implementation: t.implementation } : {}),
    context: t.context,
    ...(t.requirementRefs !== undefined ? { requirementRefs: [...t.requirementRefs] } : {}),
    // 关系靠 reworkOf 表达（不是 title 前缀——前缀只是给人看的）。
    reworkOf: t.id,
    // REQ-261004121649-bfa7 t4 / FR-2：**物化即终态**——显式空链。
    // 缺省会让重做卡一开工就按默认模板展开子卡链，于是出现「…·研发·研发」的递归命名。
    stages: [],
    status: 'todo',
    blocked: false,
    executions: [],
    comments: [],
    statusHistory: [
      { status: 'todo', at: now, by: actor, reason: '需求回退到 ' + to + '：由 ' + t.id + ' 物化的重做卡' },
    ],
    version: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    updatedBy: actor,
  }))

  // 上限（REQ-261004121649-bfa7 t2 / FR-3）：超限**整次拒绝**，且发生在编排期——
  // 调用方还没写任何东西，所以「队列零新增」是结构上成立的，不靠调用方自觉。
  if (reworkDrafts.length > ROLLBACK_MATERIALIZE_LIMIT) {
    throw Object.assign(
      new Error(
        '回退被拒：本次将物化 ' + reworkDrafts.length + ' 张重做卡，超过上限 ' + ROLLBACK_MATERIALIZE_LIMIT
        + '（REQBOARD_ROLLBACK_MATERIALIZE_OVER_LIMIT）。常见原因是上一次回退物化的重做卡还没清理——'
        + '请先批量清理那批卡，或缩小本次回退范围。队列未被改动。',
      ),
      { code: 'REQBOARD_ROLLBACK_MATERIALIZE_OVER_LIMIT' },
    )
  }
  return { canceled: [...canceledTop, ...canceledPlaceholders], reworkDrafts, resetTasks }
}
