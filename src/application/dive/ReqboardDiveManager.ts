/**
 * Dive 模式服务（REQ-260926215013-1568 T-5 · serves: FR-5, FR-6, FR-9）；
 * REQ-261001213924-1441 FR-3 起：**订阅按作用域分组持有**（root 2 路 + per-agent 6 路）。
 *
 * 职责：**订阅持有者 + 端口提供者**。
 *   · root 组（插件 ctx）：reqboard/requirement-moved（自发事件）、agent/created（拿 agent 句柄的入口）；
 *   · per-agent 组（**agent.ctx**）：agent/status、agent/pre-step、agent/inbox/*、agent/error、agent/disposed；
 *   · 两组都委托给 round 半（round-driver），本服务不自己判定续跑；
 *   · 暴露 roundDriver() 供 session-driver 在 idle 拍定序，暴露 teardown() 供组合根收尾。
 *
 * 为什么 per-agent 组必须挂在 agent.ctx（修前挂插件 ctx ⇒ 全网失聪）：cordis 派发时用发射方作用域
 * 载体过滤监听器，dsh-scope 只放行未打标签或处于同一作用域链上的 ctx；agent 主题事件在 agent 自己的
 * 作用域里派发，因此插件 ctx 上的监听器会被**静默丢弃**。宿主的插件开发规范即要求在 agent/created
 * 里把 per-agent 行为注册到 agent.ctx。订阅不成立时本服务**响亮留痕**（warn + 诊断日志 + 需求 comment）。
 *
 * @module dsh-pmboard/application/dive/ReqboardDiveManager
 */
import { mutateIfPresent } from '../use-cases/queue-access.js'
import { Context, Service } from '@deepseek-ai/cordis'
import type { DiveRoundDriver, DiveRoundPorts } from './round-driver.js'
import { createDiveRoundDriver } from './round-driver.js'
import { wireDiveRoundSubscriptions, wireAgentSubscriptions, type WireLogger } from './round-subscriptions.js'
import { createWakeHeartbeat } from './wake-heartbeat.js'
import { wakeAcceptance } from './wake-liveness.js'
import { captureDiag } from '../internal/diag-log.js'
import { isOpenRequirement } from '../../domain/status/Predicates.js'

function agentIdOf(agent: unknown): string {
  const a = agent as { id?: unknown; session?: { id?: unknown } } | undefined
  return String(a?.session?.id ?? a?.id ?? 'unknown')
}

export default class ReqboardDiveManager extends Service {
  static inject = ['agents', 'reqboard']

  private readonly round: DiveRoundDriver
  private readonly ports: DiveRoundPorts
  private readonly wireLogger: WireLogger
  private readonly unsubscribeRound: () => void
  /** agent 标识 → 该 agent 的 per-agent 解绑函数（agent/disposed 与 teardown 都要用）。 */
  private readonly agentOffs = new Map<string, () => void>()
  private readonly boundAgents = new Set<string>()
  /** 订阅失败留痕（诊断面，供对账器/看板读）。 */
  private readonly failures: string[] = []
  private statusHandler?: (agent: unknown, status: unknown) => void
  /** 心跳兜底（FR-4）：只叫醒「看起来停着」的需求；叫不动就如实记健康位。 */
  private readonly heartbeat: { tick: () => Promise<unknown> }
  private heartbeatTimer?: ReturnType<typeof setInterval>

  constructor(ctx: Context, ports: DiveRoundPorts) {
    super(ctx, 'dive-manager')
    const logger = this.ctx.logger('dive-manager')
    this.ports = ports
    // 双写：宿主日志（进程面）+ 端口日志（组合根/测试可断言面）。
    // 为什么必须可断言：订阅不成立是**静默故障**，如果 warn 只进宿主 logger，
    // 在测试与嵌入式装配下就没人能证明它响过——本仓铁律「失败要响亮」要有可检验面。
    const pl = (ports as { logger?: { debug?: (m: string) => void; warn?: (m: string, e?: unknown) => void } }).logger
    this.wireLogger = {
      debug: (m) => { logger.debug(m); pl?.debug?.(m) },
      warn: (m, e) => { logger.warn(m, e); pl?.warn?.(m, e) },
    }
    this.round = createDiveRoundDriver(ports)
    this.heartbeat = createWakeHeartbeat({
      // B12 阶段②c：心跳的读与写都走新端口（WakeHeartbeatDeps.store 已必填）
      store: ports.store,
      now: ports.now,
      // 唤醒请求走与看板同一条路（requirement-moved → requestDrive → 整 agent 空闲时起轮）。
      // FR-5（N-1，REQ-261003222428-3556）：受理前先校验绑定窗口是活 agent——
      // 死窗口叫不动：返回 false，心跳失败路径记 paused + 诊断、不刷 lastWakeAt，
      // 不再「受理即算成功」假装健康（2026-10-02 实测 armed 两分钟 roundsInStage 恒 0）。
      wake: async (id) => {
        const verdict = await wakeAcceptance({ store: ports.store, agents: ports.agents }, id)
        if (!verdict.accepted) {
          this.wireLogger.warn('dive-wake [N-1] ' + (verdict.reason ?? '不受理'))
          return false
        }
        this.round.onRequirementMoved(id)
        return true
      },
      // REQ-261002141430-a5ef FR-4④：停手对账（台账写着等弹框、实际无在途 → 恢复，防静默停摆）
      ...(ports.dialogInFlight === undefined ? {} : { dialogInFlight: ports.dialogInFlight }),
      // REQ-261006170150-52cc FR-3：过期对账**清位成功即请求一次驱动**——与 `wake` 走同一条路
      // （`onRequirementMoved` → requestDrive → 预留→投递→准入），故不新增任何进会话的投递路径。
      // 不接这里的话，对账只会把停手位清掉却没人叫，需求不再"等人"但也不跑起来。
      notifyDrivable: (id) => this.round.onRequirementMoved(id),
      // REQ-261004065652-5c1c FR-1：全局闩在闸 → 心跳整趟跳过（不叫醒、不刷 lastWakeAt、不碰健康位）
      ...(ports.providerLatch === undefined ? {} : { providerLatchOpen: () => ports.providerLatch!.isOpen() }),
      logger: this.wireLogger,
    })
    this.startHeartbeat()
    this.unsubscribeRound = wireDiveRoundSubscriptions(
      this.ctx as never, this.round, this.wireLogger, (agent) => this.bindAgent(agent),
    )
    logger.info('Dive 服务已装配：root 2 路（requirement-moved / agent-created）+ per-agent 6 路（注册在 agent.ctx）')
  }

  /**
   * 订阅会话事件（session/event）——**Dive 是该订阅的持有者**（采集/簿记路）。
   *
   * 用户裁定（2026-09-26）：CaptureHook 废弃，会话驱动能力归 Dive。driver 只提供处理函数，
   * 订阅生命周期由本服务负责（谁拥有会话事件在调用方看得见，不藏在装配函数里）。
   * 宿主不提供 ctx.on → 返回 undefined（调用方按"订阅未成立"留痕）。
   */
  attachSessionDriver(handler: (session: unknown, event: unknown) => void): (() => void) | undefined {
    const ctx = this.ctx as unknown as {
      on?: (event: string, listener: (session: unknown, event: unknown) => void) => (() => void) | void
    }
    return ctx.on?.('session/event', handler) ?? undefined
  }

  /**
   * 登记 agent 状态处理函数（**订阅本身**由 agent/created → agent.ctx 那一路持有，见 bindAgent）。
   *
   * 对齐 `@deepseek-ai/dsh-goal-round-driver`：`agent/status === "idle"`（整 agent 空闲）是唯一驱动点，
   * session/event 只做簿记。driver 只提供处理函数，订阅生命周期归本服务。
   */
  attachAgentStatus(handler: (agent: unknown, status: unknown) => void): (() => void) | undefined {
    this.statusHandler = handler
    return () => { if (this.statusHandler === handler) this.statusHandler = undefined }
  }

  /** 诊断面：订阅现状（已绑定 agent 与失败留痕）。 */
  subscriptionState(): { boundAgents: string[]; failures: string[] } {
    return { boundAgents: [...this.boundAgents], failures: [...this.failures] }
  }

  /**
   * 为一个新建 agent 注册 per-agent 组（注册到 **agent.ctx**）。
   * 拿不到可订阅的 ctx 时**响亮失败**：warn + 诊断日志 + 需求 comment 三者齐备，绝不静默降级。
   */
  private bindAgent(agent: unknown): void {
    if (agent === undefined || agent === null) return
    const id = agentIdOf(agent)
    const agentCtx = (agent as { ctx?: { on?: unknown } }).ctx
    if (typeof agentCtx?.on !== 'function') {
      const reason = 'agent/created 提供的 agent 没有可订阅的 ctx（agent.ctx 缺失）——per-agent 订阅未成立，'
        + 'agent/status 收不到 ⇒ Dive 永不被唤醒（表现为人工门确认后不自动续跑）'
      this.failures.push(reason + ' [agent=' + id + ']')
      captureDiag('[WAKE-FAIL] ' + reason + ' agent=' + id)
      this.wireLogger.warn(reason + '（agent=' + id + '）')
      this.commentOnWindow(id, '[dive-diag] ' + reason + '（agent=' + id + '）')
      return
    }
    const off = wireAgentSubscriptions(agentCtx as never, agent, this.round, {
      // [WAKE-RX]：**收到的证明**。订阅"成立"（on 返回了解绑函数）不等于事件真的送达；
      // 有了这一行，下一次"没被唤醒"就能在诊断日志里一眼分开两种病：
      //   有 [WAKE-RX] 无后续 → 事件到了、驱动侧断；一条都没有 → 事件没到（订阅/作用域问题）。
      onStatus: (a, s) => { captureDiag('[WAKE-RX] agent/status=' + String(s) + ' agent=' + agentIdOf(a)); this.statusHandler?.(a, s) },
      onDisposed: (a) => this.unbindAgent(a),
    }, this.wireLogger)
    this.agentOffs.set(id, off)
    this.boundAgents.add(id)
    captureDiag('[WAKE-OK] per-agent 订阅已注册到 agent.ctx agent=' + id)
  }

  /** agent 处置（或插件卸载）：注销该 agent 的 per-agent 订阅（幂等）。 */
  private unbindAgent(agent: unknown): void {
    const id = agentIdOf(agent)
    const off = this.agentOffs.get(id)
    if (off === undefined) return
    this.agentOffs.delete(id)
    this.boundAgents.delete(id)
    try { off() } catch { /* 解绑失败不抛 */ }
    captureDiag('[WAKE-OK] agent 已处置，per-agent 订阅已注销 agent=' + id)
  }

  /** 在该 agent 窗口绑定的进行中需求上留一条诊断 comment（人看得见的失败面）。 */
  private commentOnWindow(agentId: string, body: string): void {
    try {
      // B12 阶段①-a：只需 id/sourceSessionId/status ⇒ 走同步窄投影，不再借桥。
      const req = this.ports.peekFacts()
        .find((r) => r.sourceSessionId === agentId && isOpenRequirement(r))
      if (req === undefined) return
      // B12 阶段②c：写改走新端口（`DiveRoundPorts.store` 已必填）。
      const p = mutateIfPresent(this.ports.store, req.id, (r) => {
        r.comments.push({
          id: 'c-dive-diag-' + this.ports.now(),
          body,
          createdAt: this.ports.now(),
          createdBy: { kind: 'system' },
        })
        r.updatedAt = this.ports.now()
        return { changed: true }
      })
      p.catch(() => { /* 诊断写入失败不得影响主流程 */ })
    } catch { /* 诊断失败静默 */ }
  }

  /**
   * 起心跳（缺省 60s 一趟）。为什么需要：驱动点只有「agent 空闲」一处，那一路一旦没送达，
   * 需求就永远停着而台账无异常；心跳对账把「该跑却停着」变成可判定的健康位与 comment。
   * 只在「可驱动 + 停滞超过 10 分钟」时唤醒，不会反复推正常在跑的需求。
   */
  startHeartbeat(intervalMs = 60_000): void {
    if (this.heartbeatTimer !== undefined) return
    this.heartbeatTimer = setInterval(() => {
      void Promise.resolve(this.heartbeat.tick()).catch((err: unknown) => {
        this.wireLogger.warn('dive-manager: 心跳对账失败（不冒泡）', err)
      })
    }, intervalMs)
    // 不因这颗定时器把进程吊住（宿主卸载/测试退出时不该等它）
    const t = this.heartbeatTimer as unknown as { unref?: () => void }
    t.unref?.()
  }

  /** 手动跑一趟心跳（看板/诊断用）。 */
  async wakeTick(): Promise<unknown> {
    return this.heartbeat.tick()
  }

  /** round 半句柄：session-driver 在 idle 拍定序用；组合根登记 teardown 用。 */
  roundDriver(): DiveRoundDriver { return this.round }

  /** 卸载/停用：先解绑（root + 全部 per-agent 订阅），再 fail-closed 收尾（关准入 → 暂停 → 取消在飞 → 等静默）。 */
  async teardown(): Promise<void> {
    if (this.heartbeatTimer !== undefined) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = undefined }
    try { this.unsubscribeRound() } catch { /* 解绑失败不抛 */ }
    for (const id of [...this.agentOffs.keys()]) {
      const off = this.agentOffs.get(id)
      this.agentOffs.delete(id)
      if (off !== undefined) { try { off() } catch { /* 解绑失败不抛 */ } }
    }
    this.boundAgents.clear()
    await this.round.teardown()
  }
}
