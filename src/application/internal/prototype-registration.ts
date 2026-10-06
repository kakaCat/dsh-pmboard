/**
 * 「原型**已登记**」的唯一判据（REQ-261005105032-3b02 t11 · FR-1「登记才算数」）。
 *
 * 为什么单独成模块、而不是在两个门里各写一份 filter：**三处要的是同一个口径**——
 *   ① 存在门：判「这条 UI 需求交没交原型」；
 *   ② `reqboard_submit(kind=prototype)`：判「本次是不是新登记」（幂等、回执 registered_count、
 *      逐份登记态投影都读它）；
 *   ③ 自动发现条目被显式登记时的**升级**判定（`registerArtifact`）。
 * 两头各写一份必然漂移，而漂移的症状正是本卡实测到的那一种：产物发现
 * （`artifact-discovery` 的「落进目录即产物」，看板 stages 路由**每请求**跑一次
 * `syncAllReqArtifacts`）把磁盘上的文件自动補登成台账条目（`autoDiscovered: true`），
 * 于是**一份没人填的骨架**被当成"已交"，存在门当场自己绿掉（实测：只落骨架、人一个字没填 →
 * 存在门 / 版本门 / 锚点门全 PASS）。
 *
 * 口径（与门的 how 文案「**登记才算数，落盘未登记不算**」逐字对齐）：
 *   · **已登记** = 台账里有该 kind 的产物且 `autoDiscovered !== true`（自动发现是補登，不是登记）；
 *   · **未登记的落盘文件** = `autoDiscovered === true`（存在门据此把消息写成"有文件但没登记"）。
 *
 * @module dsh-pmboard/application/internal/prototype-registration
 */
import type { RequirementRecord, StageArtifact } from '../../shared/protocol.js'

/** 该条产物是不是**显式登记**的（自动发现補登的条目不算）。 */
export function isRegisteredArtifact(a: StageArtifact): boolean {
  return a.autoDiscovered !== true
}

/** 台账里**显式登记**的原型产物（存在门、登记的幂等判据、回执投影共用同一条判据）。 */
export function registeredPrototypesOf(req: RequirementRecord): StageArtifact[] {
  return (req.artifacts ?? []).filter(a => a.kind === 'prototype' && isRegisteredArtifact(a))
}

/** 台账里"**落盘被发现、但还没人显式登记**"的原型（存在门据此区分两种缺失）。 */
export function unregisteredDiscoveredPrototypesOf(req: RequirementRecord): StageArtifact[] {
  return (req.artifacts ?? []).filter(a => a.kind === 'prototype' && a.autoDiscovered === true)
}

/**
 * 存在门的**缺口文案**（单一出处）。
 *
 * 为什么要区分两种"没交"：补救动作不同——「一个文件都没有」要从模板落一份；
 * 「目录里有文件、只是没人登记」只差一次 `reqboard_submit(kind=prototype)`。
 * 只说前一句会让 agent 去重复落盘（而落盘是幂等的，白跑一圈）。
 */
export function prototypePresenceGaps(req: RequirementRecord): string[] {
  const gaps = ['无已登记 kind=prototype 产物（需求阶段必交原型：登记才算数，落盘未登记不算）']
  const discovered = unregisteredDiscoveredPrototypesOf(req).map(a => a.path)
  if (discovered.length > 0) {
    gaps.push('目录里已有原型文件但**未登记**（自动发现不算已交）：' + discovered.join('、')
      + '——调 reqboard_submit(kind=prototype) 登记后才算数')
  }
  return gaps
}
