/**
 * 恢复入口（REQ-261001201200-8f8b FR-4 起始；REQ-261001213924-1441 FR-2/FR-5 升级）——
 * 把「运行时被暂停」或「历史上被误解除武装」的需求重新交给 Dive。

 * 修前：disarm 是**事实终态**（除立项外全仓无第二条重新武装路径），一次基础设施抖动就让该需求
 * 终身停在手动模式，表现为「人工门确认后不自动续跑」，且没有任何恢复入口与提示。

 * 现在有两类可恢复形态（其余一律零写入）：
 *  ① **运行时暂停**：driverHealth.state=paused（投递失败/检查点失败/达上限/agent 错误…）→ 清回 healthy；
 *  ② **存量误停摆**：activation=disarmed 且 phase=active（老语义）→ 恢复意图为 armed；
 * 而「人主动 clear_pause」（disarmed+idle）与「人手动关掉自动化」**永不**被本函数改写。

 * 三条纪律：幂等（条件写在 mutate 内）、永不抛（调用点在事件/请求路径上）、恢复必留痕。
 *
 * @module dsh-pmboard/application/internal/rearm
 */
import type { RequirementStore } from '../ports.js'
// FR-9：dive 写盘唯一入口（幂等 / 永不抛 / 弹框在途守卫都在它里面）
import { applyDiveTransition } from '../dive/applyDiveTransition.js'
import type { RequirementRecord } from '../../shared/protocol.js'
import { isRecoverableDisarm } from '../dive/round-state.js'

/** 触发恢复的来源（进 comment 留痕，便于事后判断这次是谁把它叫醒的）。 */
export type RearmTrigger = 'requirement-moved' | 'board-resume'

export interface RearmDeps {
  /**
   * 新需求存储端口（B12 阶段②c / B 组）：本模块的**写**走它。
   *
   * 为什么与 `repo` 并存：`repo` 仍供尚未迁的读点；本批只把**写**迁过去。
   * 删桥（2c 后段）时 `repo` 会整体消失，届时本字段成为唯一入口。
   */
  store: RequirementStore
  now: () => number
  /**
   * 在途弹框判据（REQ-261002141430-a5ef FR-4①）：为真 → 本函数**拒绝越权**、零写入。
   *
   * 为什么必须挡住：`driverHealth=paused` 现在有两种病因——"基础设施故障"（该恢复）与
   * "正在等人工作答"（不该被别人清掉，人还在看框）。缺省 undefined = 不判定，行为与改动前逐字一致。
   */
  dialogInFlight?: (requirementId: string) => boolean
}

/** 可恢复判定（纯函数，零 IO）：运行时暂停，或存量误停摆。 */
export function isRecoverableRequirement(req: RequirementRecord | undefined): boolean {
  const dive = req?.dive
  if (dive === undefined) return false
  if (dive.driverHealth?.state === 'paused') return true
  return isRecoverableDisarm(req)
}

/**
 * 可恢复才写；返回**本次是否真的恢复了**。
 * 不满足条件（已健康／人主动暂停／需求不存在／**正在等人工确认**）→ 直接 false，**零写入**。
 */
export async function recoverHealth(
  deps: RearmDeps, requirementId: string, trigger: RearmTrigger,
): Promise<boolean> {
  // B12 阶段②c：改**权威定点读**（原先借桥镜像；本函数本就是 async）。
  const target = await deps.store.get(requirementId)
  if (!isRecoverableRequirement(target)) return false
  // REQ-261002141430-a5ef FR-4①：弹框在途时不得清停手位（看板「继续」也不例外）——
  // 否则会出现"框还在屏幕上、链已经跑起来"，正是本需求要消灭的形态。
  if (deps.dialogInFlight?.(requirementId) === true) return false
  // FR-9：规则与写盘都走唯一入口（本函数是异步的、不嵌在别人的 mutate 里，故可整体委托）。
  const outcome = await applyDiveTransition(
    { store: deps.store, now: deps.now, ...(deps.dialogInFlight !== undefined ? { dialogInFlight: deps.dialogInFlight } : {}) },
    requirementId,
    'recover-auto',
    { kind: 'system' },
    { trigger },
  )
  return outcome.changed
}

/** 兼容旧名（既有调用点与测试用）：语义与 recoverHealth 相同。 */
export const rearmIfRecoverable = recoverHealth

/**
 * **人显式**要求「继续」→ 把需求交回 Dive（REQ-261002173819-69c7 FR-3）。
 *
 * 与 {@link recoverHealth} 的分工是本次最关键的纪律：
 *  · `recoverHealth` 服务**自动路径**（requirement-moved / 心跳后置），只碰"误停摆"与"运行时暂停"；
 *  · `armExplicit` 服务**人**（看板「继续」），额外覆盖 `disarmed + idle`——即人自己按过
 *    `reqboard_clear_pause` 的那个形态。
 *
 * 为什么必须分开：`clear_pause` 与"人主动关掉自动化"在台账上同形，自动改写会把人的意图改掉；
 * 而人点「继续」是**显式**表达，只有这条路径可以改。agent 侧没有入口（改"人的意图"只能由人）。
 *
 * 幂等：条件全部写在 mutate 内；已 armed 且 driverHealth 非 paused → 零写入返回 false。
 * 越权守卫：弹框在途（`dialogInFlight`）时一律不动——否则会出现"框还在屏幕上、链已经跑起来"。
 */
export async function armExplicit(
  deps: RearmDeps, requirementId: string, trigger: 'board-resume',
): Promise<boolean> {
  if (deps.dialogInFlight?.(requirementId) === true) return false
  // FR-9：人显式「继续」= `arm-explicit` 事件——**唯一**能把 activation 改回 armed 的入口。
  // 弹框在途守卫由写入口统一实现（本函数不再自己判一遍）。
  const outcome = await applyDiveTransition(
    { store: deps.store, now: deps.now, ...(deps.dialogInFlight !== undefined ? { dialogInFlight: deps.dialogInFlight } : {}) },
    requirementId,
    'arm-explicit',
    { kind: 'human' },
    { trigger },
  )
  return outcome.changed
}
