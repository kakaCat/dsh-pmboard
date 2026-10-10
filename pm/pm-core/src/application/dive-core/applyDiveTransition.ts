/**
 * Dive 状态转化的**唯一写盘入口**（REQ-261003215944-9e04 FR-9 · t9）——
 * `transitionDive`（纯函数，域层）与台账（application 端口）之间的那一层。
 *
 * 为什么要有它：规则收进纯函数还不够——**写**这件事同样散在八处，各自 mutate、各自写留痕。
 * 现在所有入口（立项 / 人解锁 / 回退 / 驱动失败 / 自动恢复 / 人显式继续 / 阶段推进 / 推进弹框）
 * 都只调它一次，三条纪律也只需在这里实现一遍：
 *   ① **幂等**：判定在纯函数里，且**在 mutate 回调内**对当前 draft 复算——
 *      读与写之间被别的事件改过时，以临界区内的那份为准（不是拿临界区外的旧快照覆盖）；
 *   ② **永不抛**：调用点分布在事件与请求路径上（含 turn/end 钩子），抛错会炸宿主；
 *   ③ **弹框在途守卫**：有确认框挂在屏幕上时，`confirm-advance` / `recover-auto` 一律不写
 *      （否则会出现"框还在屏幕上、链已经跑起来"——REQ-261002141430-a5ef FR-4① 的现场）。
 *
 * @module dsh-pmboard/application/dive/applyDiveTransition
 */
import type { RequirementDraft, RequirementStore } from '../ports.js'
import { mutateIfPresent } from '../use-cases/queue-access.js'
import {
  transitionDive,
  type DiveActorKind,
  type DiveEvent,
} from '../../domain/dive/transition.js'

export interface DiveTransitionDeps {
  store: RequirementStore
  /** 时间源（唯一来源：纯函数与 `updatedAt` 共用同一个 now）。 */
  now: () => number
  /** 留痕 id 生成（缺省用事件名 + 时间戳拼，够用且可读）。 */
  commentId?: (event: DiveEvent, at: number) => string
  /**
   * 弹框在途判据。缺省 = 不判定（行为与不具备该能力时逐字一致）。
   * 为真时：`confirm-advance` / `recover-auto` **零写入**并返回 `code='dialog-in-flight'`。
   */
  dialogInFlight?: (requirementId: string) => boolean
  /**
   * 失败留痕钩子（**吞错但不静默**）：写盘/读盘抛错时调它一次，由组合根接到日志/诊断。
   *
   * 为什么不在本模块直接写台账留痕：失败往往正是"台账写不进去"（磁盘/权限/序列化），
   * 在失败路径上再写一次台账，会把一次失败放大成两次，甚至掩盖原始错误。
   * 故这里只**如实报告**，落点交给调用方。
   */
  onError?: (info: { requirementId: string; event: DiveEvent; code: string; reason: string }) => void
}

export interface DiveTransitionOptions {
  /** `pause-runtime` 的结构化原因（如 `deliver-failed` / `round-limit:implementing`）。 */
  reason?: string
  /** 需求当前阶段（达上限的留痕要写它）。 */
  status?: string
  /** 本阶段回合上限（达上限的留痕要写它；缺省则不留数字，不编造）。 */
  roundLimit?: number
  /** 恢复/继续的触发来源（进留痕，便于事后判断是谁把它叫醒的）。 */
  trigger?: string
  /** `confirm-advance` 专用：本次推进是否跨阶段。 */
  stageChanged?: boolean
}

export interface DiveTransitionOutcome {
  /** 是否真的写盘（false = 零写入）。 */
  changed: boolean
  /**
   * 未写盘时的结构化原因：
   * not-found / dialog-in-flight / no-change / apply-failed（**永不抛**，错误在这里收口）。
   */
  code?: 'not-found' | 'dialog-in-flight' | 'no-change' | 'apply-failed'
  /** 失败时的可读原因（日志与诊断用，不对外承诺文案）。 */
  reason?: string
}

/** 需要尊重"弹框在途"的两类事件（它们会改运行时状态，会把链重新带起来）。 */
const DIALOG_GUARDED: readonly DiveEvent[] = ['confirm-advance', 'recover-auto']

/**
 * 应用一次 Dive 状态转化。**这是唯一写 `dive.*` 的地方**（一次性迁移模块除外）。
 *
 * @param deps - 存储端口 + 时间源 + 弹框在途判据
 * @param requirementId - 目标需求
 * @param event - 八事件之一
 * @param actor - 留痕作者（人机可辨：只有 `arm-explicit` 该记 `human`）
 * @param options - 事件补充信息（原因 / 阶段 / 上限 / 触发 / 是否跨阶段）
 * @returns 结构化结果；**任何情况都不抛**
 */
export async function applyDiveTransition(
  deps: DiveTransitionDeps,
  requirementId: string,
  event: DiveEvent,
  actor: { kind: DiveActorKind; sessionId?: string },
  options: DiveTransitionOptions = {},
): Promise<DiveTransitionOutcome> {
  try {
    if (DIALOG_GUARDED.includes(event) && deps.dialogInFlight?.(requirementId) === true) {
      return { changed: false, code: 'dialog-in-flight' }
    }
    const at = deps.now()
    let wrote = false
    const res = await mutateIfPresent(deps.store, requirementId, (draft: RequirementDraft) => {
      // 临界区内复算：读与写之间可能被别的事件改过，以这里这份 draft 为准（原子 RMW）。
      const result = transitionDive(draft.dive, {
        event,
        now: at,
        actor,
        ...(options.reason !== undefined ? { reason: options.reason } : {}),
        ...(options.status !== undefined ? { status: options.status } : {}),
        ...(options.roundLimit !== undefined ? { roundLimit: options.roundLimit } : {}),
        ...(options.trigger !== undefined ? { trigger: options.trigger } : {}),
        ...(options.stageChanged !== undefined ? { stageChanged: options.stageChanged } : {}),
      })
      // ① 幂等：纯函数说没变 → 返回 undefined，适配器**零写入**（不 bump、不广播）。
      if (!result.changed || result.next === undefined) return undefined
      draft.dive = result.next
      if (result.comment !== undefined) {
        draft.comments.push({
          id: deps.commentId?.(event, at) ?? `c-dive-${event}-${at}`,
          body: result.comment.body,
          createdAt: at,
          createdBy: result.comment.createdBy,
        })
      }
      draft.updatedAt = at
      wrote = true
      return { changed: true }
    })
    if (res === undefined) return { changed: false, code: 'not-found' }
    return wrote && res.changed === true ? { changed: true } : { changed: false, code: 'no-change' }
  } catch (error: unknown) {
    // ② 永不抛：调用点在事件/请求路径上，抛出去会炸宿主（这里收口成结构化结果 + 留痕钩子）。
    const reason = error instanceof Error ? error.message : String(error)
    try {
      deps.onError?.({ requirementId, event, code: 'apply-failed', reason })
    } catch {
      // 留痕钩子自己抛错也不许冒泡（否则"吞错"的承诺就被它破了）。
    }
    return { changed: false, code: 'apply-failed', reason }
  }
}
