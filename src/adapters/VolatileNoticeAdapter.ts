/**
 * 易变段尾部投递适配器（REQ-261007100513-6749 t3 · FR-2 ← design/interfaces.md §I-2、
 * architecture.md §安全/性能考虑「注入不得冒充人类」）。
 *
 * 唯一职责：把一段易变段正文 **prepend 进该窗口会话的 `next-step` 收件箱**
 * （`agents.get(windowKey)` → `inboxOf(agent).prepend('next-step', msg)`）。
 *
 * 三条落在这里的纪律：
 * ① **不新起回合**：只 prepend，**不碰** `agent.followup()` / `deliver()`——那会额外起一整轮
 *    agent loop，而本需求立项的动因正是消灭这类开销（投递编排侧的定时器同样只调本适配器）。
 * ② **自署来源，禁止冒充人类**：消息 `source` 必须自署 `{kind:'dive', plugin, requirementId?}`，
 *    **不得**写成 `kind:'user'`——否则窗口 agent 会把系统提示当人话执行（按 `kind==='user'`
 *    判"人类发话"的门禁也会被骗过）。`next-turn` 不是本通道的投递面（只在同一 `next-step` 上排）。
 * ③ **刻意不带 `revision` / `round`**：带齐那三个字段（requirementId + revision + round）会让这条
 *    消息成为 `isDiveRoundSource()` 的**合法 Dive 回合来源**，而 round 驱动的 `onPreStep` 栅栏
 *    只认"自己预约过的回合消息"——它一旦在本步的消息里看见合法来源却与预留不符，就会把**整个 step**
 *    判成 `reject`（`round-driver.ts` 的 pre-step 拒绝分支）。故本消息自署为 `kind:'dive'`（可被
 *    识别为非人类来源、不会被 round 栅栏认领），但**不构成**回合来源。将来若有人想补上这两字段，
 *    必须先改 pre-step 栅栏的认领判据，否则会把窗口的每一步都拒掉。
 *
 * 失败语义：已知失败（agents 不可得 / 窗口不在线 / 无 `inbox.prepend`）→ `{ok:false, reason}`
 * （**不抛**，由投递编排退回头部并留痕）；未预期异常也在这里收口成 `{ok:false, reason}`。
 *
 * @module dsh-pmboard/adapters/VolatileNoticeAdapter
 */

import { inboxOf } from '../application/dive/round-state.js'
import type { NoticeDeliverySink } from '../application/internal/notice-delivery.js'
import type { VolatileNotice } from '../application/internal/volatile-notice.js'
import { fmt } from '../domain/text/fmt.js'

export interface VolatileNoticeAdapterDeps {
  /** agent 服务解析器（**惰性**：装配期未必在；与 AgentDeliverer 同款）。 */
  agents: () => unknown
  /** 插件名（进 source.plugin：这条消息"是谁说的"）。 */
  plugin: string
  /** 消息 id 工厂（缺省 = 进程内单调序号；注入便于测试断言）。 */
  newMessageId?: () => string
  /** 归属需求解析（进 source.requirementId；解不到 → 只带 kind/plugin，**不猜**）。 */
  contextFor?: (windowKey: string) => { requirementId?: string } | undefined
}

/** 消息形状（与 `AgentDeliverer` 同款结构类型：本包依赖树解析不到 dsh-llm）。 */
interface NoticeMessage {
  id: string
  role: 'user'
  content: { type: 'text'; text: string }[]
  source: { kind: 'dive'; plugin: string; requirementId?: string }
}

export class VolatileNoticeAdapter implements NoticeDeliverySink {
  private readonly deps: VolatileNoticeAdapterDeps
  private seq = 0

  constructor(deps: VolatileNoticeAdapterDeps) {
    this.deps = deps
  }

  /** 就绪：窗口在线且其 agent 有可 prepend 的 inbox。**不抛**（抛错 = 不就绪）。 */
  canDeliver(windowKey: string): boolean {
    try {
      const inbox = inboxOf(this.agentOf(windowKey))
      return typeof inbox?.prepend === 'function'
    } catch {
      return false
    }
  }

  /** prepend 一段正文（成功/失败都如实回报；**永不起回合**）。成功回 `messageId` 供到达确认。 */
  deliver(windowKey: string, notice: VolatileNotice): { ok: true; messageId: string } | { ok: false; reason: string } {
    try {
      const agent = this.agentOf(windowKey)
      if (agent === undefined) {
        return { ok: false, reason: fmt('窗口 {w} 不在线（尾部通道投递不可用）', { w: windowKey.slice(0, 16) }) }
      }
      const inbox = inboxOf(agent)
      if (typeof inbox?.prepend !== 'function') {
        return { ok: false, reason: fmt('窗口 {w} 的 agent 无 inbox.prepend（尾部通道投递不可用）', { w: windowKey.slice(0, 16) }) }
      }
      const message = this.messageFor(windowKey, notice)
      inbox.prepend('next-step', message)
      // 回 messageId：**到达**确认（host 的 `agent/inbox/claimed`）要靠它把"送出了"对上号（复核 P1-B）。
      return { ok: true, messageId: message.id }
    } catch (err) {
      return { ok: false, reason: fmt('inbox.prepend 抛错：{err}', { err: errText(err) }) }
    }
  }

  /** `agents.get(windowKey)`（服务不可得 / 抛错 → undefined，由调用方按"不在线"处理）。 */
  private agentOf(windowKey: string): unknown {
    const agents = this.deps.agents() as { get?: (id: string) => unknown } | undefined
    if (typeof agents?.get !== 'function') return undefined
    const agent = agents.get(windowKey)
    return agent === null ? undefined : agent
  }

  private messageFor(windowKey: string, notice: VolatileNotice): NoticeMessage {
    const requirementId = this.requirementIdFor(windowKey)
    return {
      id: (this.deps.newMessageId ?? (() => fmt('volatile-notice-{n}', { n: ++this.seq })))(),
      role: 'user',
      content: [{ type: 'text', text: notice.text }],
      // 自署来源（见文件头 ②③）；requirementId 解不到就不写该键——不猜一个假归属。
      source: { kind: 'dive', plugin: this.deps.plugin, ...(requirementId === undefined ? {} : { requirementId }) },
    }
  }

  private requirementIdFor(windowKey: string): string | undefined {
    try {
      return this.deps.contextFor?.(windowKey)?.requirementId
    } catch {
      return undefined
    }
  }
}

/** 错误文本（`unknown` → string）。 */
function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
