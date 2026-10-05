/**
 * 会话投递适配器（REQ-e3b6a0 t4 / FR-5）——**Dive专用投递实现**。
 *
 * 【2026-XX-XX 全面Dive化】
 * 移除 deliver() 方法（旧的followup → inbox路径）。
 * 现在只保留 Dive 专用的 deliverMessage + createRoundMessage。
 *
 * @module dsh-pmboard/adapters/AgentDeliverer
 */
import type { DiveRoundDeliveryPort, AgentDeliveryPort, CrossWindowDeliveryPort } from '../application/ports.js'
import {
  injectionLogInputForRound,
  type InjectionLogPort,
} from '../application/internal/injection-log.js'
import { fmt } from '../domain/text/fmt.js'

type MessageIdFactory = () => string

interface AgentsLike { get?: (id: string) => unknown }
interface AgentLike { followup?: (msg: unknown) => void; session?: unknown }
/** 会话控制器（只取两项：冷会话 resume 与投递后的落盘确认）。 */
interface SessionControllerLike {
  resolveAgent?: (sessionId: string) => Promise<unknown>
}
/** 会话服务的 flush（投递后确认真的落盘；照 schedule 的配方）。 */
type FlushSession = (agent: unknown) => Promise<boolean> | boolean

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class AgentDeliverer implements AgentDeliveryPort, DiveRoundDeliveryPort, CrossWindowDeliveryPort {
  private readonly resolveAgents: () => unknown
  private readonly idFactory: MessageIdFactory
  private readonly plugin: string
  /** 冷会话 resume 的服务（FR-7）。缺省 = 只能投热窗口，冷窗口如实报"不在线"。 */
  private readonly resolveController: () => unknown
  /** 投递后的落盘确认（缺省 = 不确认，但仍如实报 delivered）。 */
  private readonly flushSession: FlushSession | undefined
  /** 注入留痕口（FR-9 / t-cc7233）：缺省 = 不记（老装配逐字不变）。 */
  private readonly injectionLog: InjectionLogPort | undefined

  /**
   * 构造期校验（REQ-261001201200-8f8b FR-1）：idFactory 必须是**函数**。
   *
   * 为什么在构造期响亮抛出：修前的装配错误（`new AgentDeliverer(agents, { plugin }, ...)` 式两参调用）
   * 被拖到了运行期第一次 createRoundMessage，抛错又被 requestDrive 的 catch 吞掉 → disarm →
   * 需求终身静默停摆，且除立项外无任何重新武装的路径。把装配错误暴露在启动期，是本次刻意的取舍：
   * **构造严格（响亮），投递宽容（deliverMessage 永不抛）**。
   */
  constructor(
    resolveAgents: () => unknown,
    idFactory: MessageIdFactory,
    plugin: string,
    /** FR-7（t5）：会话控制器解析器——冷会话 resume 用；缺省 = 不支持冷投递。 */
    resolveController?: () => unknown,
    /** FR-7（t5）：投递后的落盘确认（sessions.flush）；缺省 = 跳过确认。 */
    flushSession?: FlushSession,
    /**
     * 注入留痕口（REQ-261004222448-292a t-cc7233 FR-9）：`createRoundMessage` 造出来的回合消息
     * 是**唯一真进会话**的投递路径，此前**一条留痕都没有**（采集缺口）——页面因此答不出
     * 「这条提示词到底进了哪个窗口」。缺省 = 不记（老装配与既有测试逐字不变）。
     */
    injectionLog?: InjectionLogPort,
  ) {
    if (typeof idFactory !== 'function') {
      throw new TypeError(fmt('AgentDeliverer 装配错误：idFactory 必须是函数（收到 {got}）——请检查组合根是否按三参构造 (resolveAgents, idFactory, plugin)', {
        got: idFactory === undefined ? 'undefined' : typeof idFactory,
      }))
    }
    this.resolveAgents = resolveAgents
    this.idFactory = idFactory
    this.plugin = plugin
    this.resolveController = resolveController ?? (() => undefined)
    this.flushSession = flushSession
    this.injectionLog = injectionLog
  }

  /** Dive 专用：创建回合消息（带 round 元数据和 source.kind='dive'）。 */
  createRoundMessage(params: {
    requirementId: string
    revision: number
    round: number
    text: string
  }): { message: unknown; messageId: string } {
    const messageId = this.idFactory()
    const message = {
      id: messageId,
      role: 'user',
      content: [{ type: 'text', text: params.text }],
      source: {
        kind: 'dive',
        plugin: this.plugin,
        requirementId: params.requirementId,
        revision: params.revision,
        round: params.round,
      },
    }
    return { message, messageId }
  }

  /**
   * Dive 专用：投递回合消息（直接调用 agent.followup，但消息带 source.kind='dive'）。
   *
   * FR-9（t-cc7233）：**投递结果就地留痕**——这是唯一真进会话的路径，此前零留痕。
   * 为什么把留痕包在投递外层：下面五个早退分支（服务缺失 / 不在线 / 无 followup / 抛错 / 成功）
   * 都要记，写在里面就会出现「失败没留痕」的洞——失败恰恰是最该被看见的那种。
   */
  deliverMessage(windowKey: string, message: unknown): { delivered: boolean; reason?: string } {
    const result = this.deliverMessageRaw(windowKey, message)
    this.recordRoundDelivery(windowKey, message, result.delivered)
    return result
  }

  /** 记一条轮次投递留痕（只认 Dive 回合消息；跨窗口消息等不是「轮次」，不冒充）。 */
  private recordRoundDelivery(windowKey: string, message: unknown, delivered: boolean): void {
    if (this.injectionLog === undefined) return
    const text = roundTextOf(message)
    if (text === undefined) return
    this.injectionLog.record(injectionLogInputForRound({ windowKey, text, delivered }))
  }

  private deliverMessageRaw(windowKey: string, message: unknown): { delivered: boolean; reason?: string } {
    const agents = this.resolveAgents() as AgentsLike | undefined
    if (typeof agents?.get !== 'function') {
      return { delivered: false, reason: 'agents 服务不可得（未装配 ctx.agents）' }
    }
    let agent: unknown
    try {
      agent = agents.get(windowKey)
    } catch (error) {
      return { delivered: false, reason: fmt('agents.get 抛错：{err}', { err: reasonOf(error) }) }
    }
    if (agent === undefined || agent === null) {
      return { delivered: false, reason: fmt('窗口 {w} 不在线', { w: windowKey }) }
    }
    const followup = (agent as AgentLike).followup
    if (typeof followup !== 'function') {
      return { delivered: false, reason: 'agent 无 followup 投递能力' }
    }
    try {
      followup.call(agent, message)
      return { delivered: true }
    } catch (error) {
      return { delivered: false, reason: fmt('投递失败：{err}', { err: reasonOf(error) }) }
    }
  }

  /**
   * 跨窗口消息工厂（FR-7）：与 Dive 回合消息同款形状，**只有 source.kind 不同**。
   *
   * 为什么必须自署：`source.kind` 是"这条消息是谁说的"的唯一凭据。自署成
   * `reqboard-open-window` 这类 pm 专有值，任何按 `kind==='user'` 判"人类发话"的门
   * （goal 的授权、本仓的 requireDirectHuman）都不会被它骗过。
   */
  createMessage(params: { text: string; kind: string }): { message: unknown; messageId: string } {
    const messageId = this.idFactory()
    return {
      messageId,
      message: {
        id: messageId,
        role: 'user',
        content: [{ type: 'text', text: params.text }],
        source: { kind: params.kind, plugin: this.plugin },
      },
    }
  }

  /**
   * 投给**任意窗口**（FR-7）：热窗口直接投；冷会话先 resume 再投。
   *
   * 为什么与 deliverMessage 分开：Dive 的回合投递是同步契约（调用点不接受 await），
   * 而冷会话 resume 必然是异步的——硬塞进同一个方法会把同步调用点改成异步，波及面过大。
   * 故热路径行为逐字不变，冷路径单列在这里，供开窗/交棒这类**本就是异步**的用例使用。
   *
   * 永不抛：任何失败都收口成 `{delivered:false, reason}`，由调用方如实告知。
   */
  async deliver(windowKey: string, message: unknown): Promise<{ delivered: boolean; reason?: string }> {
    // ① 热路径：本进程内活着的窗口（与 deliverMessage 同口径）。
    const hot = this.deliverMessage(windowKey, message)
    if (hot.delivered) return hot

    // ② 冷路径：resume 之后再投（这正是修前"只会说窗口不在线"的那一段）。
    let controller: SessionControllerLike | undefined
    try {
      const raw = this.resolveController()
      controller = raw === null || typeof raw !== 'object' ? undefined : raw as SessionControllerLike
    } catch (error) {
      return { delivered: false, reason: fmt('会话控制器解析失败：{err}', { err: reasonOf(error) }) }
    }
    if (controller === undefined || typeof controller.resolveAgent !== 'function') {
      return { delivered: false, reason: fmt('窗口 {w} 不在线，且无冷会话 resume 能力；原因：{why}', { w: windowKey, why: hot.reason ?? '未知' }) }
    }
    let resolved: unknown
    try {
      resolved = await controller.resolveAgent(windowKey)
    } catch (error) {
      return { delivered: false, reason: fmt('冷会话 resume 失败：{err}', { err: reasonOf(error) }) }
    }
    // resolveAgent 的失败形状是 { error }（照 schedule 的用法），不是抛错。
    if (resolved === null || typeof resolved !== 'object' || !('agent' in (resolved as object))) {
      return { delivered: false, reason: fmt('冷会话 resume 未返回 agent：{got}', { got: describe(resolved) }) }
    }
    const agent = (resolved as { agent: unknown }).agent
    const followup = agent === null || typeof agent !== 'object' ? undefined : (agent as AgentLike).followup
    if (typeof followup !== 'function') {
      return { delivered: false, reason: 'resume 出来的 agent 无 followup 投递能力' }
    }
    try {
      followup.call(agent, message)
    } catch (error) {
      return { delivered: false, reason: fmt('冷会话投递失败：{err}', { err: reasonOf(error) }) }
    }
    // ③ 落盘确认（缺省跳过；失败只影响"是否确认"，不影响"是否已投"）。
    if (this.flushSession !== undefined) {
      try {
        const ok = await this.flushSession(agent)
        if (ok === false) return { delivered: false, reason: '投递后会话落盘未被确认（sessions.flush=false）' }
      } catch (error) {
        return { delivered: false, reason: fmt('投递后落盘确认失败：{err}', { err: reasonOf(error) }) }
      }
    }
    return { delivered: true }
  }
}

/**
 * 取 Dive 回合消息的正文（供留痕）。**只认 `source.kind === 'dive'`**：
 * 跨窗口消息（deliver 冷路径）虽同款形状但自署别的 kind，它不是「轮次投递」，
 * 记成 dive-round 会让页面把交棒消息读成阶段纪律注入。
 */
function roundTextOf(message: unknown): string | undefined {
  if (message === null || typeof message !== 'object') return undefined
  const m = message as { content?: unknown; source?: unknown }
  const source = m.source
  if (source === null || typeof source !== 'object') return undefined
  if ((source as { kind?: unknown }).kind !== 'dive') return undefined
  if (!Array.isArray(m.content)) return undefined
  const first = m.content[0] as { type?: unknown; text?: unknown } | undefined
  if (first === undefined || first.type !== 'text' || typeof first.text !== 'string') return undefined
  return first.text
}

/** 结构化描述一个不可预期的返回值（诊断用，不猜形状）。 */
function describe(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  return typeof value
}