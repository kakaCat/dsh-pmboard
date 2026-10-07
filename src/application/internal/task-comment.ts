/**
 * 系统留痕与投递 helper（REQ-261007100513-6749 t5 ← FR-6 / 设计 I-5 + S-3）。
 *
 * 两件都是「**系统**替流程写下一笔」，且**都不是工具**：
 *   ① `appendTaskComment` —— 写**卡评论**（`TaskRecord.comments`）。卡评论必须由已过席位检查的用例或
 *      系统路径写；给 agent 一个"直接写评论"的工具等于开一条绕过席位与门禁的路；
 *   ② `createInboxNotify` —— 把一段正文 `inbox.prepend` 进**某个会话**（子卡的停止指令 / owner 的
 *      到顶通知）。**只 prepend，永不起回合**（无 `followup` / `deliver`）。
 *
 * 落点（data-model.md §兼容性分析）：`docs/requirements/<REQ>/queue.json` 的 `TaskRecord.comments`
 * （**不是** `comments.jsonl`）⇒ 必须经队列写盘收口 `mutateQueue`。
 *
 * 三条纪律：
 *   ① **只追加评论**：不改 `status` / `version` / `updatedAt` / 任何门禁字段——「放行只写卡评论」
 *      的验收断言就钉在这里（状态机与版本号一律不动）；
 *   ② **失败响亮但可控**：`appendTaskComment` 如实抛（调用方自己决定吞不吞），投递器永不抛且如实回报；
 *   ③ **id 走 `deps.ids.comment()`**：与全仓评论 id 同一工厂（不另造前缀格式）。
 *
 * @module dsh-pmboard/application/internal/task-comment
 */

import { fmt } from '../../domain/text/fmt.js'
import type { ActorRef, CommentRecord } from '../../shared/protocol.js'
import type { NewComment, UseCaseDeps } from '../ports.js'
import { inboxOf, agentStatusOf } from '../dive/round-state.js'
import { mutateQueue, taskStoreOf } from '../use-cases/queue-access.js'

/** 缺省署名人（系统路径：子卡预算门的一切留痕都是系统写的，不冒充窗口 agent）。 */
export const SYSTEM_ACTOR: ActorRef = { kind: 'system' }

/**
 * 追加一条**卡评论**。`at` 缺省 = 当前时钟（注入便于测试断言先后顺序）。
 *
 * 卡不存在 / 队列不可用 → 抛错（`TASK_NOT_FOUND` / `REQBOARD_STORE_INCONSISTENT`），
 * **不静默丢弃**：一条没写进去的"到顶汇报"会让整条预算链失去可审计性。
 */
export async function appendTaskComment(
  deps: UseCaseDeps,
  taskId: string,
  body: string,
  actor: ActorRef = SYSTEM_ACTOR,
  at?: number,
): Promise<CommentRecord> {
  const task = await taskStoreOf(deps).get(taskId)
  if (task === undefined) {
    throw Object.assign(new Error(fmt('卡评论写入失败：任务 {id} 不存在', { id: taskId })), { code: 'REQBOARD_TASK_NOT_FOUND' })
  }
  const createdAt = at ?? deps.clock.now()
  const comment: CommentRecord = { id: deps.ids.comment(), body, createdAt, createdBy: actor }
  // 只动 comments（①）：其余字段一个都不碰 ⇒ version/status 不变。
  await mutateQueue(deps, task.requirementId, (draft) => {
    const target = draft.find((t) => t.id === taskId)
    if (target === undefined) return undefined
    target.comments = [...(target.comments ?? []), comment]
    return draft
  })
  return comment
}

/**
 * 追加一条**需求级评论**（落 `docs/requirements/<REQ>/comments.jsonl`）——
 * 归属**未定**时的唯一汇报去向（REQ-261007100513-6749 t5 返工 · P1②）。
 *
 * 为什么必须有它：多卡并行（真实形态）下「这条子会话属于哪张卡」**判不出来**，
 * 而旧实现的选择是"不猜、也不记账"⇒ 零效力。返工后的口径是：**执法照常**（按会话计数与停手），
 * 汇报**不挂卡**、写需求级评论并点名子会话 id 与「归属未定」——把判断交回给人，
 * **绝不**把计数静默挂到某张卡上（挂错卡 = 停错卡 + 伪造归属）。
 */
export async function appendRequirementComment(
  deps: UseCaseDeps,
  requirementId: string,
  body: string,
  actor: ActorRef = SYSTEM_ACTOR,
  at?: number,
): Promise<NewComment> {
  const comment: NewComment = {
    id: deps.ids.comment(), body, createdAt: at ?? deps.clock.now(), createdBy: actor,
  }
  await deps.store.appendComment(requirementId, comment)
  return comment
}

/** 错误文本（`unknown` → string；与全仓各模块同款局部 helper）。 */
export function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** 卡评论/诊断的**稳定标记**（测试与排障按它检索；改文案不改标记）。 */
export const BUDGET_MARKS = {
  top: '[子卡预算] 到顶汇报',
  uncountable: '[子卡预算] 计数不可得',
  writeFailed: '[子卡预算] 运行态写入失败',
  released: '[子卡预算] 放行',
  notReleased: '[子卡预算] 放行未生效',
  overrun: '[子卡预算] 到顶后仍继续请求',
  stopUndelivered: '[子卡预算] 停止指令未送达',
  attribution: '[子卡预算] 归属依据',
  openFailed: '[子卡预算] 开窗失败',
  /** 归属未定：汇报走**需求级评论**（不挂卡）。 */
  unattributed: '[子卡预算] 归属未定',
  /** 独立停手位登记/失效重进。 */
  halt: '[子卡预算] 停手位',
  /** 内存态（按会话累计）与运行态文件不一致——写失败期间的计数没有静默丢失。 */
  memoryDiverged: '[子卡预算] 内存态与运行态不一致',
} as const

/**
 * 停止指令正文（投给**子会话**；自署来源见 `createInboxNotify`）。
 *
 * `taskId` 缺省 = 归属未定：文案必须如实说明「不知道该放行哪张卡」，
 * 否则子代理会照着一条不存在的卡号去等（软门禁的指令也是契约，不能编）。
 */
export function stopInstructionText(input: {
  sessionId: string
  windowIndex: number
  limit: number
  taskId?: string
}): string {
  const scope = input.taskId === undefined
    ? fmt('子会话 {sid}（**归属未定**：需求下有多张在制卡，判不出这是哪张卡）', { sid: input.sessionId.slice(0, 24) })
    : fmt('{id}', { id: input.taskId })
  return fmt('【子卡预算到顶】{scope} 在本窗口（#{w}）已用满 {limit} 次请求（用户裁定 D-3 的请求预算软门禁）。'
    + '请**立即停止发起新请求**，用一条汇报收尾（做了什么 / 卡在哪 / 还差什么），不要继续试探。'
    + '续跑条件：owner 经 reqboard_task_move 的 budget.release（task_id 填{target}，reason 必填）显式放行一个窗口。', {
    scope, w: String(input.windowIndex), limit: String(input.limit),
    target: input.taskId === undefined ? '经需求级评论核对出的那张卡' : fmt('本卡 {id}', { id: input.taskId }),
  })
}

/**
 * 到顶汇报正文（**卡评论**：已归属时的汇报）。「停止时刻」与「汇报时刻」都写进正文，人工可复核先后。
 *
 * `basis` 必须写进正文（P1②）：兜底归属（父窗口下唯一 in_progress 卡）是**推断**，不是事实，
 * 汇报里必须写明依据，人才能复核这次停的是不是那张卡。
 */
export function topReportText(input: {
  sessionId: string; windowIndex: number; limit: number; used: number
  stopAt: number; reportAt: number; stopDelivered: boolean
  basis?: 'exact-session' | 'parent-unique-in-progress'
}): string {
  const basis = input.basis === 'exact-session'
    ? '归属依据：`executions[].sessionId` 精确命中本会话（快路径）'
    : input.basis === 'parent-unique-in-progress'
      ? '归属依据：**兜底推断**——父窗口在该需求下**恰好一张** `in_progress` 卡（若归属有误请人工核对）'
      : '归属依据：未标注'
  return fmt('{mark}：子会话 {sid} 在本窗口（#{w}）已用满 {limit} 次请求（本窗口累计 {used} 次；用户裁定 D-3）。'
    + '{basis}。① 先停：{stop}（停止时刻 {stopAt}）；② 本条即汇报（时刻 {reportAt}，**晚于**停止时刻）；'
    + '③ 等放行：owner 调 reqboard_task_move 的 budget.release 放行一个窗口后才续跑。'
    + '软门禁**依赖子代理配合**：不 kill、不拦工具调用；到顶后若仍继续请求会再投一次告警（不静默）。', {
    mark: BUDGET_MARKS.top, sid: input.sessionId.slice(0, 24), w: String(input.windowIndex),
    limit: String(input.limit), used: String(input.used), basis,
    stop: input.stopDelivered
      ? '已向该子会话投递「停止发起新请求并汇报」的指令'
      : '向子会话投递停止指令**失败**（另见下一条留痕）',
    stopAt: String(input.stopAt), reportAt: String(input.reportAt),
  })
}

/**
 * 到顶汇报正文（**需求级评论**：归属未定时的汇报，P1②）。
 *
 * 文本三件事必须齐（它是人工接手的唯一线索）：点名**子会话 id**、写明**归属未定**及原因、
 * 给出该需求下**在制卡清单**（人据此判断该放行哪张卡）。**不含**任何"我已认定是某张卡"的措辞。
 */
export function unattributedTopReportText(input: {
  sessionId: string; windowIndex: number; limit: number; used: number
  stopAt: number; reportAt: number; stopDelivered: boolean
  reason: string; candidates: readonly string[]
}): string {
  return fmt('{mark}／{unattr}：子会话 {sid} 在本窗口（#{w}）已用满 {limit} 次请求（本窗口累计 {used} 次；用户裁定 D-3）。'
    + '**归属未定**：{why} → 按口径**不写任何卡评论**（绝不把计数挂到某张卡上）。'
    + '{cands}'
    + '① 先停：{stop}（停止时刻 {stopAt}）；② 本条即汇报（时刻 {reportAt}，**晚于**停止时刻）；'
    + '③ 等放行：先在需求级核对这是哪张卡，再调 reqboard_task_move 的 budget.release（task_id 填那张卡）。', {
    mark: BUDGET_MARKS.top, unattr: BUDGET_MARKS.unattributed, sid: input.sessionId.slice(0, 24),
    w: String(input.windowIndex), limit: String(input.limit), used: String(input.used),
    why: input.reason,
    cands: input.candidates.length === 0
      ? '该需求下当前没有可核对的在制卡。'
      : fmt('该需求下的在制卡：{ids}。', { ids: input.candidates.join('、') }),
    stop: input.stopDelivered
      ? '已向该子会话投递「停止发起新请求并汇报」的指令'
      : '向子会话投递停止指令**失败**（另见下一条留痕）',
    stopAt: String(input.stopAt), reportAt: String(input.reportAt),
  })
}

/** 预算门的**投递器**：只 `inbox.prepend`，**永不起回合**（不调用 `followup` / `deliver`）。 */
export interface InboxNotify {
  /** 停止指令 → 子会话（`next-step`，当步就可见）。 */
  stopSubagent(input: { sessionId: string; requirementId?: string; text: string }): { ok: boolean; reason?: string }
  /** owner 通知：**活跃 → `next-step`；空闲 → `next-turn`**（排队等下个回合，仍不起新回合）。 */
  notifyOwner(input: { windowKey: string; requirementId?: string; text: string }): {
    ok: boolean
    channel: 'inbox-next-step' | 'inbox-next-turn'
    reason?: string
  }
}

export interface InboxNotifyDeps {
  /** agent 服务解析器（**惰性**，与 `VolatileNoticeAdapter` / `AgentDeliverer` 同款）。 */
  agents: () => unknown
  plugin: string
  newMessageId?: () => string
}

/**
 * 造投递器（唯一实现 = 组合根；本模块只依赖 `inbox.prepend` 这一个缝）。
 *
 * 消息形状与 `VolatileNoticeAdapter` 同款：`source` **自署** `{kind:'dive', plugin, requirementId?}`，
 * **不冒充人类**（写成 `kind:'user'` 会让窗口 agent 把系统提示当人话执行，也会骗过按
 * `kind==='user'` 判「人类发话」的门禁）；**刻意不带** `revision` / `round`（带上会让它成为 Dive
 * 合法回合来源，被 round 半的 pre-step 栅栏判 reject）。
 */
export function createInboxNotify(deps: InboxNotifyDeps): InboxNotify {
  let seq = 0
  const newId = (): string => (deps.newMessageId ?? (() => fmt('subtask-budget-{n}', { n: ++seq })))()
  const message = (text: string, requirementId?: string): unknown => ({
    id: newId(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'dive', plugin: deps.plugin, ...(requirementId === undefined ? {} : { requirementId }) },
  })
  const agentFor = (windowKey: string): unknown => {
    try {
      const agents = deps.agents() as { get?: (id: string) => unknown } | undefined
      if (typeof agents?.get !== 'function') return undefined
      const agent = agents.get(windowKey)
      return agent === null ? undefined : agent
    } catch { return undefined }
  }
  const prepend = (
    windowKey: string, target: 'next-step' | 'next-turn', text: string, requirementId?: string,
  ): { ok: boolean; reason?: string } => {
    try {
      const agent = agentFor(windowKey)
      if (agent === undefined) return { ok: false, reason: fmt('窗口 {w} 不在线', { w: windowKey.slice(0, 16) }) }
      const inbox = inboxOf(agent)
      if (typeof inbox?.prepend !== 'function') {
        return { ok: false, reason: fmt('窗口 {w} 的 agent 无 inbox.prepend', { w: windowKey.slice(0, 16) }) }
      }
      inbox.prepend(target, message(text, requirementId))
      return { ok: true }
    } catch (err) {
      return { ok: false, reason: fmt('inbox.prepend 抛错：{e}', { e: errText(err) }) }
    }
  }
  return {
    stopSubagent(input) {
      return prepend(input.sessionId, 'next-step', input.text, input.requirementId)
    },
    notifyOwner(input) {
      const agent = agentFor(input.windowKey)
      // 活跃 → next-step；空闲 → next-turn。判不出状态（服务缺失 / 无 status 字段）按**立即**处理。
      const idle = agent !== undefined && agentStatusOf(agent) === 'idle'
      const target: 'next-step' | 'next-turn' = idle ? 'next-turn' : 'next-step'
      const res = prepend(input.windowKey, target, input.text, input.requirementId)
      return {
        ok: res.ok,
        channel: target === 'next-turn' ? 'inbox-next-turn' : 'inbox-next-step',
        ...(res.reason === undefined ? {} : { reason: res.reason }),
      }
    },
  }
}
