/**
 * 立项后推进 `draft → brainstorming`（= G0 的 to）——**唯一实现处**，两条立项路径共用：
 * 会话弹框（`reqboard_capture`，人经弹框作答）与**代理立项**（`reqboard_create` + `owner_window`，
 * agent 受本窗口直接人工指令代为取值）。
 *
 * 为什么必须共用：这段编排不止"改一个状态字段"——它同时带**入口快照**（不给快照，立项节点的
 * 消耗永远算不出来）与**幂等落原型骨架**（UI 需求在需求阶段就该拿到可填的 `prototypes/*.html`，
 * 否则原型门会变成"交不上就出不去"的死结）。各写一份就是两份真相：漏掉骨架的那条路会表现为
 * 「原型交不上」，让原型门背锅——本仓最忌的静默缺口形态。
 *
 * 失败语义：**不抛**。立项已经成立，推进失败是第二件事，由调用方在回执里如实说明
 * （`advanced=false` → "链会如实记为未推进"）。
 *
 * @module dsh-pmboard/application/internal/advance-draft
 */
import type { UseCaseDeps } from '../ports.js'
import { mutateIfPresent, requirementStoreOf } from '../use-cases/queue-access.js'
import { canReqTransition } from '../../shared/protocol.js'
import { captureSnapshot, transitionRequirement } from './token-usage.js'
import { landPrototypeSkeleton } from './prototype-skeleton.js'

/**
 * @param reason 推进留痕正文（**由调用方给**：两条路径的事实不同——"人经弹框作答"与"代理取值"必须写得出来，
 *   否则台账里两条路的记录同形，事后无法分辨谁来确认过弹框取值）。
 */
export async function advanceDraftToBrainstorming(
  deps: UseCaseDeps,
  requirementId: string,
  windowKey: string,
  reason: string,
): Promise<boolean> {
  if (!canReqTransition('draft', 'brainstorming')) return false
  try {
    const result = await mutateIfPresent(requirementStoreOf(deps), requirementId, (req) => {
      if (req.status !== 'draft') return undefined
      // REQ-b545fe t1：唯一迁移助手（结算离开节点 + 记入口快照，缺失不补 0）。
      transitionRequirement(req, 'brainstorming', {
        at: deps.clock.now(),
        actor: { kind: 'agent', sessionId: windowKey },
        reason,
        snap: captureSnapshot(deps, windowKey),
      })
      return { changed: true }
    })
    // REQ-261005105032-3b02 t11（FR-2）：推进进需求阶段时同样幂等落原型骨架
    // （只告警不阻断：落盘失败必须把 `true` 如实返回——推进真的发生了）。
    const advanced = result?.requirement
    if (advanced !== undefined) await landPrototypeSkeleton(deps.docs, advanced, { nowMs: deps.clock.now() })
    return result !== undefined
  } catch {
    return false
  }
}
