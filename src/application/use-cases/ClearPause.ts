/**
 * ClearPause 用例（REQ-260925212722-96e7）
 *
 * 清除 Dive 模式的 armed 状态，允许手动操作。
 *
 * REQ-261002140814-1a5d（FR-1）——回执契约四件套：
 *   ① 前值必须在**变更器内**捕获：`mutate()` 返回 `{ changed, revision }`，**不回传**变更器的
 *      自定义返回值；此前是"从 mutate 结果里读变更器的自定义键" ⇒ 恒为 undefined ⇒ 回执带了
 *      undefined 值属性 ⇒ 绑定层无损 JSON 校验整体拒收（"value is not lossless JSON"：
 *      锁真的开了，却同时报错）。
 *   ② 可选字段缺值**整体省略**（不发 undefined / null）。
 *   ③ 失败判定改按 `changed.requirements.length`：`mutate()` 从不返回 undefined，
 *      原 `result === undefined` 是死分支，会把"需求已消失"报成成功（假成功）。
 *   ④ 变更器按端口契约返回 `LedgerChange`（`{ requirements: [req] }`），不是自定义对象。
 *
 * @module dsh-pmboard/application/use-cases/ClearPause
 */
import type { UseCaseDeps } from '../ports.js'
import { firstWritableBound } from '../../application/internal/window.js'
import { requirementStoreOf, mutateIfPresent } from './queue-access.js'
import { boundSummariesOf } from '../internal/binding-read.js'
import { normalizeText } from '../../shared/protocol.js'
// FR-9：dive 状态规则单一来源（纯函数）
import { transitionDive } from '../../domain/dive/transition.js'

export interface ClearPauseArgs {
  requirement_id?: string
}

export interface ClearPauseResult {
  success: boolean
  requirement_id: string
  /** 解锁前的 activation；无 dive 记录时**该键整体省略**（不得发 undefined） */
  previous_activation?: string
  message: string
}

/**
 * 清除 Dive 模式暂停，解除 armed 锁定
 */
export async function clearPause(
  deps: UseCaseDeps,
  windowKey: string,
  args: ClearPauseArgs
): Promise<ClearPauseResult> {
  const reject = (msg: string, code: string): never => {
    throw Object.assign(new Error(msg), { code })
  }

  // 1. 获取目标需求
  const explicitId = normalizeText(args.requirement_id, 'requirement_id', 64)
  // t8/B11：绑定读走新端口（只读摘要）
  const bound = await boundSummariesOf(requirementStoreOf(deps), windowKey)

  if (bound.length === 0) {
    // `return reject(...)`：reject 返回 never ⇒ 其后控制流不可达，target 得以收窄（消 TS18048）
    return reject('reqboard_clear_pause 未执行：本窗口没有绑定中的需求', 'REQBOARD_NO_BOUND_REQ')
  }

  const target = explicitId.length > 0 ? bound.find(r => r.id === explicitId) : firstWritableBound(bound, windowKey)
  if (target === undefined) {
    return reject(
      'reqboard_clear_pause 未执行：需求 ' + explicitId + ' 不是本窗口绑定的进行中需求',
      'REQBOARD_NOT_BOUND_TO_WINDOW'
    )
  }
  const targetId = target.id

  // 2. 执行清除
  let previousActivation: string | undefined
  const result = await mutateIfPresent(requirementStoreOf(deps), targetId, (req) => {
    // 前值在变更器内捕获——与"实际被写入的那份 draft"同源，值必然等于写入前值
    previousActivation = req.dive?.activation

    // 清除 Dive 状态：规则来自纯函数（FR-9），本处只负责"就地应用"。
    // 为什么不像 rearm 那样整体委托 applyDiveTransition：本条用例的契约要求
    // ① 前值在**同一个变更器内**捕获（回执四件套之一），② 同一次写盘里还要写 updatedBy；
    // 两者都要求"留在这次 mutate 里"，故这里用纯函数就地算，规则仍然只有一份。
    const cleared = transitionDive(req.dive, {
      event: 'disarm-manual',
      now: deps.clock.now(),
      actor: { kind: 'agent', sessionId: windowKey },
    })
    if (cleared.changed && cleared.next !== undefined) req.dive = cleared.next

    // 记录解锁日志（CommentRecord.body——写 text 会让看板渲染成空：GUI 读的是 c.body）
    const now = deps.clock.now()
    const commentId = deps.ids.comment()
    req.comments.push({
      id: commentId,
      body: `Dive 模式已解除锁定（reqboard_clear_pause）。之前状态：${previousActivation ?? 'none'}`,
      createdAt: now,
      createdBy: { kind: 'agent', sessionId: windowKey }
    })

    req.updatedAt = now
    req.updatedBy = { kind: 'agent', sessionId: windowKey }

    return { changed: true }
  })

  // 失败要响亮：新口下"需求没找到"就返回 undefined（收口助手把 NOT_FOUND 折算成它），
  // 所以这里判 `undefined`——旧写法要靠 changed 是否为空来反推，那条路径已随整册 mutate 消失。
  if (result === undefined) {
    return reject('reqboard_clear_pause 未执行：需求未找到或数据冲突', 'REQBOARD_MUTATION_FAILED')
  }

  return {
    success: true,
    requirement_id: targetId,
    // 条件展开：undefined 不是无损 JSON，缺值一律**省略该键**（不是发 undefined/null）
    ...(previousActivation !== undefined ? { previous_activation: previousActivation } : {}),
    message: `需求 ${targetId} 的 Dive 模式已解除锁定，现在可以手动操作了。`
  }
}
