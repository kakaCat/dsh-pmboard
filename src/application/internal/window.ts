/**
 * 窗口↔需求绑定投影（REQ-47939a t6）——从 host/capture.ts 逐字搬入的纯判定（无 I/O、无 ctx）。
 *
 * 为什么在 application：用例需要"本窗口绑定的 open 需求"这一投影（move/decompose/show-status
 * 都靠它做归属校验）。REQ-47939a t9：host/capture.ts 的同名实现（重复的第二份 OPEN 状态集合）
 * 已删除，本模块成为唯一实现处；windowKeyFromContext / draftRequirementsFor / shouldCaptureWindow
 * 也在 t9 从 host/capture.ts、host/capture-hook.ts 逐字搬入。行为与搬迁前一致。
 *
 * @module dsh-pmboard/application/internal/window
 */
import { isOpenRequirement } from '../../domain/status/Predicates.js'
import type { RequirementStore } from '../ports.js'
import type { LedgerView } from '../ports.js'
import type { RequirementFacts, RequirementSummary } from '../../domain/requirement/RequirementSummary.js'
import type { RequirementRecord, WindowSeat } from '../../shared/protocol.js'

/** 只读台账视图：直接取 ports 的 LedgerView 投影（此前 Pick<ReqboardLedger,...> 要求可变数组，
 *  与 repo.台账快照读（已删除）/read() 返回的只读视图不兼容——收敛为同一类型，消除两套口径）。 */
type View = Pick<LedgerView, 'requirements' | 'triages'>

// 进行中判据已单点至 domain（REQ-47939a 返工修复：此前此处私下定义 OPEN_REQ_STATUSES，
// 路由层却引用了不存在的 OPEN_STATUSES → /session/:id/progress 运行时 500、会话框流程节点不显示）
const isOpenReq = isOpenRequirement

/**
 * 需求席位（REQ-261003215944-9e04 FR-2）——**读端唯一折算处**。
 *
 * 三种形态（见 design/data-model.md「席位读取与折算」）：
 *  ① `seats` 有值 → 原样返回（权威）；
 *  ② `seats` 缺省但有 `sourceSessionId` → 折算为单 owner，`joinedAt` 取需求的 `createdAt`
 *     （owner 是立项那一刻入席的，不冒充 0）；
 *  ③ 两者都缺 → 空数组（**不伪造 owner**——无来源窗口的需求就是没人坐席）。
 *
 * 刻意不做的事：**不回写台账**。39 条存量若被批量改写，回滚就没有退路；折算放读端，
 * 删掉本函数即回到改前行为（零迁移）。也刻意不看 `lastSeenAt`：活跃度不参与授权。
 */
export function seatsOf(
  record: Pick<RequirementRecord, 'seats' | 'sourceSessionId' | 'createdAt'>,
): WindowSeat[] {
  if (record.seats !== undefined) return record.seats
  const windowKey = record.sourceSessionId
  if (typeof windowKey !== 'string' || windowKey.length === 0) return []
  // createdAt 在 RequirementRecord 上是必填，故直接取——刻意不写 `?? 0`：那会把"缺时间"伪装成 1970。
  return [{ windowKey, role: 'owner', joinedAt: record.createdAt }]
}

/**
 * 授权动作（REQ-261003215944-9e04 FR-3 / design/data-model.md）。
 *
 * 口径来自设计表：**推进阶段与把关人工门只归 owner**；领卡/汇报 owner 与 worker 都可；
 * 只读人人可。这不是"新发明一套权限"，而是把既有事实（谁能推阶段）写成一个可判定的枚举。
 */
export type SeatAction =
  | 'move-requirement'
  | 'confirm-gate'
  | 'submit-artifact'
  | 'claim-task'
  | 'report-task'
  | 'read'

/** 该窗口在这条需求上的席位（无席位 → undefined；存量记录按折算的单 owner 判定）。 */
export function seatOf(
  record: Pick<RequirementRecord, 'seats' | 'sourceSessionId' | 'createdAt'>,
  windowKey: string,
): WindowSeat | undefined {
  return seatsOf(record).find((s) => s.windowKey === windowKey)
}

/**
 * 这个席位能不能做这个动作（纯函数，零 IO）。
 *
 * 返回 `{ok:false, code}` 而不是抛错：调用方要按自己的错误码体系上报
 * （工具层 `REQBOARD_*`、看板层 HTTP 状态码），判定本身保持中立。
 */
export function canWrite(seat: WindowSeat | undefined, action: SeatAction): { ok: true } | { ok: false; code: string } {
  // 只读动作不需要席位（看板/只读面板）——但**写**动作必须有席位。
  if (action === 'read') return { ok: true }
  if (seat === undefined) return { ok: false, code: 'REQBOARD_NO_SEAT' }
  if (seat.role === 'observer') return { ok: false, code: 'REQBOARD_SEAT_READONLY' }
  const ownerOnly: SeatAction[] = ['move-requirement', 'confirm-gate']
  if (ownerOnly.includes(action) && seat.role !== 'owner') {
    return { ok: false, code: 'REQBOARD_SEAT_NOT_OWNER' }
  }
  return { ok: true }
}

/** 摘要层同口径的席位判定（摘要没有 seats 时按折算的单 owner 看）。 */
export function seatOfSummary(
  summary: Pick<RequirementSummary, 'seats' | 'sourceSessionId'>,
  windowKey: string,
): WindowSeat | undefined {
  if (summary.seats !== undefined) return summary.seats.find((s) => s.windowKey === windowKey)
  return summary.sourceSessionId === windowKey
    ? { windowKey, role: 'owner', joinedAt: 0 }
    : undefined
}

/**
 * 从「本窗口的绑定列表」里取第一条**该窗口真有写权限**的（FR-3）。
 *
 * 为什么单列一个函数而不是各处直接取「绑定列表第一条」：那个写法的隐含语义是"第一条就是我的"，
 * 在单值绑定时代成立；引入席位之后必须显式问一句"我在这条上是什么角色"。
 * 存量记录（无 seats）经折算仍是单 owner ⇒ 行为与改造前逐字一致。
 */
export function firstWritableBound<T extends Pick<RequirementSummary, 'seats' | 'sourceSessionId'>>(
  bound: readonly T[],
  windowKey: string,
  action: SeatAction = 'submit-artifact',
): T | undefined {
  for (const item of bound) {
    if (canWrite(seatOfSummary(item, windowKey), action).ok) return item
  }
  return undefined
}

/** 该窗口是否已绑定进行中的需求。规则（B：从需求记录判断）：
 *  1. 台账存在 open req 且 sourceSessionId === windowKey（窗口直接立项/自动立项）；
 *  2. 该窗口某条 triage 已确认（bind_req/create_req）且其 resultRequirementId(s)
 *     指向仍 open 的 req（bind 场景 req.sourceSessionId 可能不是本窗口，需窗口侧锚点）。
 */
export function isWindowBound(ledger: View, windowKey: string): boolean {
  if (ledger.requirements.some(r => r.sourceSessionId === windowKey && isOpenReq(r))) return true
  for (const tri of ledger.triages) {
    if (tri.sessionId !== windowKey) continue
    const anchorIds: string[] = []
    if (tri.resultRequirementId) anchorIds.push(tri.resultRequirementId)
    if (Array.isArray(tri.resultRequirementIds)) anchorIds.push(...tri.resultRequirementIds)
    for (const reqId of anchorIds) {
      const req = ledger.requirements.find(r => r.id === reqId)
      if (req && isOpenReq(req)) return true
    }
  }
  return false
}

/** 该窗口进行中的需求（简要投影，供引导文本与 reqboard_status 使用）。 */
/**
 * 经**新端口**实现同样的语义（B12 前的过渡口）——**按席位取用**（REQ-261003215944-9e04 FR-3）。
 *
 * 绑定 = 三条来源的并集（去重后逐条复核开放态）：
 *  ① `sourceSessionId === windowKey`（我立的；**存量记录的唯一入口**，无 seats 的按单 owner 折算）；
 *  ② `seatWindowKey === windowKey`（别人立项、席位派给了我——改造前取不到，于是"worker 推自己的卡"
 *     在入口就被"本窗口没有绑定中的需求"挡掉，压根走不到角色判定）；
 *  ③ triage 锚定（bind 场景，`sourceSessionId` 可能不是本窗口）——**不要求带席位**：锚点是窗口侧
 *     已确认的记录（席位由 `reqboard_bind` 落座，见 t-845a64）。
 *
 * ⚠️ **席位是权威**：显式 `seats` 里没有本窗口、又不是 ③ 锚定的记录，一律不算绑定
 * （即便 `sourceSessionId === windowKey`——交接之后原窗口不该再算绑定）。
 * ⚠️ **这是候选集，不是授权**：本函数只回答"看得见谁"（observer 席位也看得见，只读场景需要它）。
 * 写动作必须再由 `canWrite(seatOf(...), action)` 判角色，否则 observer 会顺着这里拿到写权限。
 *
 * 读量 = 两个定向筛（各 ≤ 端口首页）+ 一次 meta（triages）+ 逐条 `get`（通常 0~3 条），
 * 不再是 `scope:'all'` 的全表扫。
 */
export async function openRequirementsForVia(store: RequirementStore, windowKey: string): Promise<RequirementRecord[]> {
  const [direct, seated] = await Promise.all([
    store.listSummaries({ sourceSessionId: windowKey }),
    store.listSummaries({ seatWindowKey: windowKey }),
  ])
  const tris = await store.listTriages({ sessionId: windowKey })
  const ids = new Set<string>()
  for (const sm of [...direct.items, ...seated.items]) if (isOpenReq(sm)) ids.add(sm.id)
  // ③ triage 锚定（口径与 `openRequirementsFor` 逐字一致）：窗口侧锚点，不要求它带席位。
  const anchored = new Set<string>()
  for (const tr of tris) {
    if (tr.resultRequirementId !== undefined) anchored.add(tr.resultRequirementId)
    for (const x of tr.resultRequirementIds ?? []) anchored.add(x)
  }
  for (const id of anchored) ids.add(id)
  const recs: RequirementRecord[] = []
  for (const id of ids) {
    const r = await store.get(id)
    if (r === undefined || !isOpenReq(r)) continue
    // 席位权威：显式 seats 里没有本窗口、又不是锚定的 → 不算绑定。
    if (anchored.has(id) || seatOf(r, windowKey) !== undefined) recs.push(r)
  }
  return recs
}

export function openRequirementsFor(ledger: View, windowKey: string): RequirementRecord[] {
  const direct = ledger.requirements.filter(r => r.sourceSessionId === windowKey && isOpenReq(r))
  const anchored = new Map<string, RequirementRecord>()
  for (const tri of ledger.triages) {
    if (tri.sessionId !== windowKey) continue
    const ids: string[] = []
    if (tri.resultRequirementId) ids.push(tri.resultRequirementId)
    if (Array.isArray(tri.resultRequirementIds)) ids.push(...tri.resultRequirementIds)
    for (const reqId of ids) {
      const req = ledger.requirements.find(r => r.id === reqId)
      if (req && isOpenReq(req) && !anchored.has(req.id)) anchored.set(req.id, req)
    }
  }
  const seen = new Set<string>()
  const out: RequirementRecord[] = []
  for (const r of [...direct, ...anchored.values()]) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    out.push(r)
  }
  return out
}

/** 该窗口绑定的 open 需求里，仍处 draft 的（接手推进信号 R1 用）。 */
export function draftRequirementsFor(ledger: View, windowKey: string): RequirementRecord[] {
  return openRequirementsFor(ledger, windowKey).filter(r => r.status === 'draft')
}

/** 该窗口是否「需要走一次立项捕获」：unbound 即需要。 */
export function shouldCaptureWindow(ledger: View, windowKey: string): boolean {
  return !isWindowBound(ledger, windowKey)
}

// ---------------------------------------------------------------------------
// 同步投影版（design/backend.md §同步口的处置）：只吃**摘要**，供提示词/引导组装等
// 「同步回调、过期不致命、不参与门禁与写判定」的场景使用。
//
// 与上面的 View 版的差别（**必须知道**）：摘要里没有 `triages`，所以这里**不做 triage 锚定**
// —— 即"某窗口的 triage 已确认但 req.sourceSessionId 不是本窗口"这一形态在这里判不出来。
// 因此它只可用于引导文本；任何门禁/写判定必须走 await 的权威读（openRequirementsForVia ✓）。
// ---------------------------------------------------------------------------

/** 摘要版「该窗口是否已绑定进行中需求」（无 triage 锚定，见上）。 */
export function isWindowBoundFromSummaries(
  list: readonly RequirementSummary[], windowKey: string,
): boolean {
  return list.some((r) => r.sourceSessionId === windowKey && isOpenReq(r))
}

/** 摘要版「该窗口是否需要走一次立项捕获」：unbound 即需要。 */
export function shouldCaptureWindowFromSummaries(
  list: readonly RequirementSummary[], windowKey: string,
): boolean {
  return !isWindowBoundFromSummaries(list, windowKey)
}

// ---------------------------------------------------------------------------
// 提示词缝窄投影版（B12 阶段①-a）：与上面的摘要版**同口径**（同样只做直接锚定、不做 triage
// 锚定——`RequirementFacts` 里没有 triages 字段，理由与摘要版一致，见上）。
// 粒度比摘要版多一个 `description`（提示词段推断难度要用），故单列一组。
// ---------------------------------------------------------------------------

/** 窄投影版「该窗口是否已绑定进行中需求」。 */
export function isWindowBoundFromFacts(
  list: readonly RequirementFacts[], windowKey: string,
): boolean {
  return list.some((r) => r.sourceSessionId === windowKey && isOpenReq(r))
}

/** 窄投影版「该窗口是否**需要**走一次立项捕获」：unbound 即需要。 */
export function shouldCaptureWindowFromFacts(
  list: readonly RequirementFacts[], windowKey: string,
): boolean {
  return !isWindowBoundFromFacts(list, windowKey)
}

/** 窄投影版「该窗口进行中的需求」。 */
export function openPromptFactsFor(
  list: readonly RequirementFacts[], windowKey: string,
): RequirementFacts[] {
  return list.filter((r) => r.sourceSessionId === windowKey && isOpenReq(r))
}

/** 窄投影版「该窗口绑定的 open 需求里，仍处 draft 的」（接手推进信号 R1 用）。 */
export function draftPromptFactsFor(
  list: readonly RequirementFacts[], windowKey: string,
): RequirementFacts[] {
  return openPromptFactsFor(list, windowKey).filter((r) => r.status === 'draft')
}

// ---------------------------------------------------------------------------
// systemPrompt 组装上下文 → 窗口键（REQ-47939a t9：从 host/capture.ts 逐字搬入）
// ---------------------------------------------------------------------------

/** 从组装 context 提取窗口键：agent.id（'session-<uuid>'）优先，scope 兜底。 */
export function windowKeyFromContext(context: { agent?: { id?: unknown }; scope?: unknown } | undefined): string | undefined {
  const agentId = context?.agent?.id
  if (typeof agentId === 'string' && agentId.length > 0) return agentId
  const scope = context?.scope
  if (typeof scope === 'string' && scope.length > 0) return scope
  return undefined
}
