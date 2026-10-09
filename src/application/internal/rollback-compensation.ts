/**
 * 回退两段写的**队列补偿**单点（REQ-261008011118-defe BUG-3 / DD-3）。
 *
 * ## 为什么需要它
 *
 * 回退落库跨两个存储：**任务先写**（队列）→ **需求后写**（台账）。顺序契约（I-11）本身是对的
 * （任务写失败 ⇒ 需求未动，干净），缺的是「第二段未落账时对第一段的归还」：
 *
 *   · 需求写**抛错**（store 故障 / 域校验）⇒ 队列上已落的取消、复位、物化全部留着；
 *   · 需求写走成 **no-op**（并发把 `req.status` 改走，回调返回 undefined）⇒ 同一形态的静默半成品。
 *
 * 两种都要归还。本模块是这条归还的唯一实现处：**先在写前留档**（{@link rememberRollbackPreImage}），
 * 未落账时**一次队列 mutate** 归还（{@link compensateRollbackQueue}），归还本身失败则响亮处置
 * （{@link raiseRollbackCompensationFailed}）。
 *
 * ## 两条口径（与 transitionTask / 既有白名单同源的字段面）
 *
 *  · 只恢复**本次写面**九字段（`status / statusHistory / version / updatedAt / updatedBy /
 *    revisions / canceledAt / canceledBy / cancelReason`）——不整卡替换：并发写入者在这段时间
 *    对该卡**其它**字段的改动不该被一起抹掉；
 *  · 可选字段「本前缺省 ⇒ 删键」：前向写入可能**新增**了键（如给原本没有 statusHistory 的老卡补事件），
 *    只赋值不删键就恢复不出"回退前逐字节相同"。
 *
 * @module dsh-pmboard/application/internal/rollback-compensation
 */
import type { UseCaseDeps } from '../ports.js'
import type { TaskRecord } from '../../shared/protocol.js'
import { mutateQueue } from '../use-cases/queue-access.js'
import { requirementStoreOf } from '../use-cases/queue-access.js'
import { fmt } from '../../domain/text/fmt.js'

/** 回退在队列上的**写面**（补偿恢复的范围；与 MoveRequirement 的任务写白名单同源）。 */
export const ROLLBACK_WRITE_SURFACE = [
  'statusHistory', 'revisions', 'canceledAt', 'canceledBy', 'cancelReason',
] as const

/** 补偿结论（调用方据此决定"抛出原错误 + 结论"还是走响亮处置）。 */
export interface CompensationOutcome {
  ok: boolean
  detail: string
}

/**
 * 写前留档：把这张卡的**本前快照**记进 `preImage`（同一 id 只记第一次 = 最早的写前状态）。
 *
 * 为什么必须在**覆写之前**调用且用同一份 mutate 快照：入口处的 `reqTasks` 可能已经滞后于
 * mutate 的强制重读，用它当"回退前"会把并发写入者的新状态误当旧状态写回去。
 */
export function rememberRollbackPreImage(
  preImage: Map<string, TaskRecord>,
  card: TaskRecord,
): void {
  if (preImage.has(card.id)) return
  preImage.set(card.id, structuredClone(card))
}

/** 补偿入参。 */
export interface CompensateRollbackInput {
  deps: UseCaseDeps
  requirementId: string
  /** 本轮物化的重做卡 id（原本不存在 ⇒ 归还时直接移除）。 */
  createdDraftIds: readonly string[]
  /** 写前留档（{@link rememberRollbackPreImage} 的产物）。 */
  preImage: ReadonlyMap<string, TaskRecord>
}

/**
 * 归还一次回退的队列写面（**幂等**：卡 id 唯一、恢复的是确定值，重复触发结果一致）。
 *
 * 返回 `{ok:false}` 而不是抛错：调用方要把它与"需求侧为什么没落账"一起报出去（见
 * {@link raiseRollbackCompensationFailed}），在这里抛会把真因吞掉。
 *
 * 未声明任何写面变更（本轮物化 0 张且 preImage 为空）⇒ `{ok:true}` 且**不写盘**。
 */
export async function compensateRollbackQueue(input: CompensateRollbackInput): Promise<CompensationOutcome> {
  const { deps, requirementId, createdDraftIds, preImage } = input
  if (preImage.size === 0 && createdDraftIds.length === 0) {
    return { ok: true, detail: '本轮回退未改动队列，无需补偿' }
  }
  try {
    await mutateQueue(deps, requirementId, (queueTasks) => {
      let touched = false
      // ① 撤销本轮物化的重做卡
      for (const id of createdDraftIds) {
        const i = queueTasks.findIndex(t => t.id === id)
        if (i >= 0) {
          queueTasks.splice(i, 1)
          touched = true
        }
      }
      // ② 逐卡恢复本次写面（可选字段"本前缺省 ⇒ 删键"）
      for (const [id, pre] of preImage) {
        const cur = queueTasks.find(t => t.id === id)
        if (cur === undefined) continue
        cur.status = pre.status
        cur.version = pre.version
        cur.updatedAt = pre.updatedAt
        cur.updatedBy = pre.updatedBy
        for (const key of ROLLBACK_WRITE_SURFACE) {
          const v = pre[key]
          if (v === undefined) delete cur[key]
          else (cur as unknown as Record<string, unknown>)[key] = v
        }
        touched = true
      }
      return touched ? queueTasks : undefined
    })
    return { ok: true, detail: '队列已归还回退前状态（补偿成功）' }
  } catch (err) {
    return { ok: false, detail: (err as Error).message ?? String(err) }
  }
}

/** 补偿失败的响亮处置入参。 */
export interface CompensationFailedInput {
  deps: UseCaseDeps
  requirementId: string
  /** 回退目标阶段（写进留痕文案）。 */
  to: string
  /** 需求侧为什么没落账（原错误消息 / 漂移说明）。 */
  cause: string
  /** 补偿自身的失败原因。 */
  detail: string
  /** 受影响卡 id（物化卡 + 写面卡，已去重）。 */
  affected: readonly string[]
}

/**
 * 补偿失败 ⇒ **响亮**：需求台账留一条评论（best-effort）+ 抛
 * `REQBOARD_ROLLBACK_COMPENSATION_FAILED`（消息点名受影响卡）。
 *
 * 为什么不二次重试：补偿连续失败通常意味着 store 出了真问题，重试只会把真因掩盖成噪音；
 * 台账评论也写不进去时（store 故障）不静默——下面的抛出消息里已带齐受影响卡。
 */
export async function raiseRollbackCompensationFailed(input: CompensationFailedInput): Promise<never> {
  const { deps, requirementId, to, cause, detail, affected } = input
  const ids = affected.length > 0 ? affected.join('、') : '（无）'
  try {
    await requirementStoreOf(deps).mutate(requirementId, (r) => {
      r.comments.push({
        id: deps.ids.comment(),
        body: fmt(
          '[回退补偿失败] 需求回退到 {to} 时需求侧未落账，且队列归还失败：{detail}；受影响卡：{ids}。'
          + '请人工核对队列（这些卡可能仍是已取消/已物化状态）。',
          { to, detail, ids },
        ),
        createdAt: deps.clock.now(),
        createdBy: { kind: 'system' },
      })
      return { changed: true }
    })
  } catch {
    // 连评论都写不进去（store 故障）：不掩盖——抛出消息里已带齐受影响卡。
  }
  throw Object.assign(
    new Error(fmt(
      'reqboard_move 未执行：回退两段写失败且**补偿未完成**——{cause}；补偿失败：{detail}；'
      + '受影响卡：{ids}（REQBOARD_ROLLBACK_COMPENSATION_FAILED）。请人工核对队列后再重试。',
      { cause, detail, ids },
    )),
    { code: 'REQBOARD_ROLLBACK_COMPENSATION_FAILED' },
  )
}
