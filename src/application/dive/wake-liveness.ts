/**
 * wake 受理前的活性校验（REQ-261003222428-3556 FR-5 / N-1）。
 *
 * 缺口（《自动链契约》§5 N-1，2026-10-02 实测）：wake 端口「受理即算成功」
 * （ReqboardDiveManager 恒返 true）——绑定窗口已死也照刷 lastWakeAt、driverHealth 恒
 * healthy，需求 armed 着却永远原地不动（实测 roundsInStage 两分钟恒 0）。
 *
 * 修复口径：**受理 = 绑定窗口解析得到活 agent**。只读依赖（agents 注册表）经参数注入——
 * application/dive 不反向依赖宿主。不受理时返回 false + 人话原因：
 * 心跳的既有失败路径（连续 N 次 → driverHealth=paused + 诊断评论、不刷 lastWakeAt）自动接住，
 * 本模块不重复造失败语义。
 *
 * @module dsh-pmboard/application/dive/wake-liveness
 */
import type { RequirementStore } from '../ports.js'

export interface WakeLivenessDeps {
  /** 需求存储（读绑定窗口）。 */
  store: RequirementStore
  /** 活 agent 注册表（宿主 agents 服务的最小面：只读 get）。 */
  agents: { get(id: string): unknown | undefined }
}

export interface WakeVerdict {
  accepted: boolean
  /** 不受理时的人话原因（进 warn 日志；诊断评论由心跳失败路径统一写）。 */
  reason?: string
}

/**
 * wake 受理判据：需求存在 + 有绑定窗口 + 窗口是活 agent。
 * 任一不满足 → 不受理（返回 false，心跳失败路径接管 paused/留痕）。
 */
export async function wakeAcceptance(deps: WakeLivenessDeps, requirementId: string): Promise<WakeVerdict> {
  const req = await deps.store.get(requirementId)
  if (req === undefined) {
    return { accepted: false, reason: '需求 ' + requirementId + ' 不在台账（唤醒目标不存在）' }
  }
  const bound = req.sourceSessionId
  if (bound === undefined || bound.length === 0) {
    return { accepted: false, reason: '需求 ' + requirementId + ' 没有绑定窗口（无唤醒对象）' }
  }
  if (deps.agents.get(bound) === undefined) {
    return {
      accepted: false,
      reason: '需求 ' + requirementId + ' 的绑定窗口 ' + bound + ' 不可达（无活 agent）——唤醒不受理',
    }
  }
  return { accepted: true }
}
