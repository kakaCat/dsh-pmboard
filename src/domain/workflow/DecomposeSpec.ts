/**
 * 拆分幂等规约（REQ-47939a t3 / INV-3）——decompose 的两道防线。
 *
 * 事故 B（REQ-6f39b5）：拆分成功落库后同程序内 move 被闸门拒绝 → agent 不知已拆
 * 成功，重试 decompose → 幽灵任务双倍落库、rollup 永久卡死。两道防线：
 *  ① 状态已**越过**拆分（实施/验收中）→ 说明已拆过，拒绝；
 *  ② 台账已有该需求的未取消任务 → 拒绝并返回已有清单（防状态异常时的漏网）。
 * 2026-09-17 修正（REQ-47939a 自身实测触发）：原守卫把 decomposing 也当作"已拆过"，但计划
 * 批准（reqboard_ask_confirm target=plan）会**自动**把 design → decomposing，于是正常
 * 路径必然先到 decomposing 再调 decompose → 被自己的守卫拒死，审批流水线自锁。
 * 正解：幽灵任务的唯一判据是"已有任务"（防线②），状态只用于区分"是否已越过拆分"。
 *
 * 纯函数：零 I/O、不碰时间与随机数；返回结构化原因（调用方拼 'reqboard_decompose 未执行：' 前缀）。
 */

import { fmt } from '../text/fmt.js'
import type { RequirementStatus } from '../requirement/RequirementStatus.js'

/** 已有任务的最小投影（清单提示用）。 */
export interface ExistingTaskLike {
  id: string
  title: string
  status: string
}

export type DecomposeVerdict =
  | { ok: true }
  | { ok: false; code: 'REQBOARD_ALREADY_DECOMPOSED'; reason: string }

/**
 * 拆分幂等守卫：返回拒绝原因（ok=false）或放行（ok=true）。
 *
 * 判据（2026-09-26 修正）：**唯一拒绝条件是「已有未取消任务」**。
 * 原第二条「状态已越过拆分（implementing/accepting）→ 一律拒绝」在**自动拆分失败**的
 * 既定形态下造成死锁：需求被推进到 implementing，但一条任务卡都没落库——既不能重拆
 * （本守卫拒），也不能退回上游（implementing→design 的产物门要求 task_detail 产物）。
 * 这与本守卫自己的注释一致：幽灵任务的唯一判据是「已有任务」；状态不再单独作为拒绝判据。
 * `_status` 形参保留以兼容既有调用点与类型契约。
 */
export interface DecomposeIdempotencyContext {
  /**
   * 需求级回退的目标阶段（`req.rollback.to`）。调用方以 `rollbackTo === status` 判「当前处在回退态」。
   */
  rollbackTo?: RequirementStatus
}

export function checkDecomposeIdempotency(
  status: RequirementStatus,
  existingTasks: readonly ExistingTaskLike[],
  ctx?: DecomposeIdempotencyContext,
): DecomposeVerdict {
  if (existingTasks.length > 0) {
    // REQ-261003204149-1e80 FR-4：**回退态放行重建**。
    // 不加这一条就是死结：回退后旧卡（或上一轮物化的重做卡）让重拆被 REQBOARD_ALREADY_DECOMPOSED 拒死，
    // 而 `taskCompletenessGap` 又因 live>0 放行 ⇒ 二次实施跑的是与新计划不符的旧卡。
    //
    // 判据刻意**窄**：只认「当前阶段 = 上次回退的目标」。非回退态一字不改
    // —— 事故 B（REQ-6f39b5：重试 decompose → 幽灵任务双倍落库、rollup 永久卡死）的防线不得削弱。
    if (ctx?.rollbackTo === status) return { ok: true }
    const list = existingTasks.map(t => t.id + ' ' + t.title + '（' + t.status + '）').join('；')
    return {
      ok: false,
      code: 'REQBOARD_ALREADY_DECOMPOSED',
      reason: fmt('该需求已落库 {count} 个未取消任务，禁止重复拆分。已有任务：{list}', { count: existingTasks.length, list }),
    }
  }
  return { ok: true }
}
