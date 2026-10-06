/**
 * 误物化清场计划（REQ-261004121649-bfa7 t3/t6 · FR-4）——「把一次回退物化出来的卡清掉」的唯一判定处。
 *
 * ## 为什么要有它
 *
 * 回退把旧卡标 canceled 并为每张**顶层父卡**物化一张重做卡（t1/t2）。人若发现物化错了
 * （范围选错、或上一次没清就再退一次），现状只能**逐张去队列里点取消**——实测一次要清 53 张。
 * 本模块给出「点一次、按边界批清」的判定：边界 = 该次回退物化的卡 id 清单。
 *
 * ## 两条匹配路径，回执必须说自己用了哪条（t6）
 *
 *  ① **精确**（`matchedBy: 'lastMaterialized'`）：需求台账上记着这次回退物化了哪些卡
 *     （`rollback.lastMaterialized`，t3 起写入）。这是**唯一**能分清"这批"与"上一批"的口径。
 *  ② **兜底**（`matchedBy: 'reworkOf+title-prefix'`）：旧数据没有 `lastMaterialized`
 *     （该字段是本需求才加的），只能按「有 `reworkOf` + 标题带 `[重做] ` 前缀」猜候选。
 *     猜就有猜错的可能，所以**回执逐条列出匹配依据与跳过原因**，不许假装精确。
 *
 * ## 三条不出事的纪律
 *
 *  - **不碰 done 卡**：已完成的活不能被这次清理吞掉（跳过并说明原因）；
 *  - **幂等**：清第二次 `canceled === 0`（已 cancelled 的卡不再取消、不重复留痕）；
 *  - **纯函数**：不改传入的 `tasks`，只返回计划（副本 + 新修订），落库由调用方负责。
 *
 * @module dsh-pmboard/application/internal/rollback-cleanup
 */
import type { ActorRef, TaskRecord } from '../../shared/protocol.js'
import { markCanceled } from '../../shared/protocol.js'

/** 清理的匹配方式（回执如实声明；t6 的诚实性要求）。 */
export type CleanupMatch = 'lastMaterialized' | 'reworkOf+title-prefix'

/** 一条被跳过的卡及原因（不许静默跳过）。 */
export interface CleanupSkip {
  taskId: string
  reason: string
}

/** 一条父子关系还原记录（`from: null` = 原本就没有父卡）。 */
export interface CleanupRestore {
  taskId: string
  reworkOf: string
  fromParentId: string | null
  toParentId: string
}

/** 清理计划（调用方据此落库；`canceled` 是最终会变成 canceled 的卡）。 */
export interface RollbackCleanupPlan {
  matchedBy: CleanupMatch
  /** 本次真正要取消的卡（**整卡副本**，写法与回退的 canceled 同形）。 */
  canceled: TaskRecord[]
  /** 父子关系被还原的条数（= `restoredLinks.length`；回执直接给这个数）。 */
  restoredLinks: CleanupRestore[]
  /** 被跳过的卡与原因（done 卡、找不到的卡、没有 reworkOf 无法定位的卡）。 */
  skipped: CleanupSkip[]
}

/** 标题前缀——重做卡的名字形如 `[重做] 原卡名`（`rollback-tasks.ts` 物化时写死）。 */
export const REWORK_TITLE_PREFIX = '[重做] '

/** 只认未取消的卡（已取消的没有可取消的东西，重复清也不该再留一条修订）。 */
function liveOf(tasks: readonly TaskRecord[], requirementId: string): TaskRecord[] {
  return tasks.filter((t) => t.requirementId === requirementId && t.status !== 'canceled')
}

/**
 * 定出本次要清的卡。
 *
 * @param lastMaterialized 台账上记的「上次物化的卡 id」；`undefined`/空数组 → 走兜底匹配。
 */
function pickTargets(
  live: readonly TaskRecord[],
  lastMaterialized: readonly string[] | undefined,
): { matchedBy: CleanupMatch; targets: TaskRecord[] } {
  const byId = new Map(live.map((t) => [t.id, t]))
  if (lastMaterialized !== undefined && lastMaterialized.length > 0) {
    const targets: TaskRecord[] = []
    for (const id of lastMaterialized) {
      const hit = byId.get(id)
      // 已被取消（上一次清过了）或已被删（人工处理过）→ 不在候选里，幂等自然成立。
      if (hit !== undefined) targets.push(hit)
    }
    return { matchedBy: 'lastMaterialized', targets }
  }
  // 兜底：没有物化记录的老数据。两个条件同时成立才算候选（宁可漏，不可错杀）。
  return {
    matchedBy: 'reworkOf+title-prefix',
    targets: live.filter(
      (t) => (t.reworkOf ?? '') !== '' && t.title.startsWith(REWORK_TITLE_PREFIX),
    ),
  }
}

/**
 * 生成一次「误物化清场」的计划。
 *
 * @param rollbackSeq 人指定的回退序号（回执/留痕用；不存在性由调用方判定后拒绝）
 */
export function planRollbackCleanup(
  req: { readonly id: string },
  tasks: readonly TaskRecord[],
  rollbackSeq: number,
  now: number,
  actor: ActorRef,
  /** 台账上记的「上次物化的卡 id」（`rollback.lastMaterialized`）。 */
  lastMaterialized: readonly string[] | undefined,
  reason: string,
): RollbackCleanupPlan {
  const live = liveOf(tasks, req.id)
  const { matchedBy, targets } = pickTargets(live, lastMaterialized)

  const skipped: CleanupSkip[] = []
  const canceled: TaskRecord[] = []
  const restoredLinks: CleanupRestore[] = []

  // 全部卡（含已取消）——还原父子关系时要按 reworkOf 找到**原卡**（原卡已被上一次回退取消）。
  const allById = new Map(tasks.filter((t) => t.requirementId === req.id).map((t) => [t.id, t]))

  // 本批动作的原因（整批同一条，**同源**）：修订留痕与取消留痕 `cancelReason` 用同一个字符串，
  // 不允许任一处另取值（REQ-261005193546-1b1a FR-3 / design/backend.md「与 statusHistory 的关系」）。
  // 去掉 `reason` 为空时的尾巴，保证它是非空文本（否则 `cancelReason` 按规则不会写）。
  const batchReason = '误物化清场（第 ' + rollbackSeq + ' 次回退'
    + (reason.length > 0 ? '：' + reason : '') + '）'

  for (const t of targets) {
    // 不碰已完成：done 的活不能被清场吞掉。
    if (t.status === 'done') {
      skipped.push({ taskId: t.id, reason: 'done 卡不清理（已完成的活不因清场丢失）' })
      continue
    }
    const copy = structuredClone(t)
    copy.status = 'canceled'
    // 取消留痕（REQ-261005193546-1b1a FR-3）：与上面那行相邻、同一对象（copy）——之后由调用方
    // 在同一次 mutateQueue 写事务里落盘。at/by/reason 与本卡那条 rollback 修订同源。
    markCanceled(copy, { at: now, by: actor, reason: batchReason })
    copy.blocked = false
    delete copy.blockedReason
    copy.revisions = [
      ...(copy.revisions ?? []),
      {
        at: now,
        by: actor,
        kind: 'rollback',
        reason: batchReason,
        changes: ['status: ' + t.status + '→canceled'],
      },
    ]
    copy.updatedAt = now
    copy.updatedBy = actor
    canceled.push(copy)

    // ── 父子关系还原 ──────────────────────────────────────────────────
    // 物化出来的重做卡是**顶层**卡（t1 之后只有顶层父卡才物化），所以它本来就不该有 parentId。
    // 真正需要还原的是**旧数据**里被误物化的子卡：它丢了 parentId、升格成了顶层卡。
    // 判据只能取自它的原卡（reworkOf 指向的那张）：原卡当时挂在谁名下，它就该挂回谁名下。
    const reworkOf = t.reworkOf ?? ''
    if (reworkOf === '') {
      skipped.push({ taskId: t.id, reason: '无 reworkOf：定位不到原卡，无法判定该挂回哪张父卡' })
      continue
    }
    const original = allById.get(reworkOf)
    if (original === undefined) {
      skipped.push({ taskId: t.id, reason: '原卡 ' + reworkOf + ' 不存在：无法判定该挂回哪张父卡' })
      continue
    }
    // 原卡自己的 parentId（旧数据里子卡被物化时丢掉的那个）→ 就是它该挂回去的位置。
    const target = original.parentId
    if (target === undefined || target.length === 0) {
      // 原卡本来就是顶层父卡 → 重做卡留在顶层是对的，不是"误伤"，不该硬编一个父卡出来。
      skipped.push({ taskId: t.id, reason: '原卡 ' + reworkOf + ' 本就是顶层父卡：重做卡留在顶层，无需还原' })
      continue
    }
    if (t.parentId === target) {
      skipped.push({ taskId: t.id, reason: '父子关系已正确（parentId 已是 ' + target + '），无需还原' })
      continue
    }
    copy.parentId = target
    restoredLinks.push({
      taskId: t.id,
      reworkOf,
      fromParentId: t.parentId ?? null,
      toParentId: target,
    })
  }

  return { matchedBy, canceled, restoredLinks, skipped }
}
