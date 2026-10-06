/**
 * 挂起确认的判定口径**单点**（REQ-260927123256-196b · serves: FR-2 / FR-4）——停手守卫与回执
 * 共用同一份「台账是否已落章」谓词，杜绝两处口径漂移。
 *
 * 为什么要抽出来：`targetConfirmedInLedger` 原先私有在 ConfirmReceipt.ts（台账事实：target=plan 看
 * 计划批准章；target=artifact 看该 kind 全部产物是否成组落章）。停手守卫升级为「未作答 **且** 台账
 * 未落章才拦」后，同一判定要被回执与守卫同时使用——留两份拷贝必然漂移（判定口径只留一处）。
 *
 * 语义：
 *  - `livePendingConfirm` = 本窗口**仍然有意义**的未作答确认：已 settle / 已过期由注册表
 *    `pendingForWindow` 过滤（过期基准 (interruptedAt ?? createdAt) + ttl），台账已落章的陈旧记录
 *    在这里再被滤掉——人已通过看板/证据通道作答时，守卫必须放行（否则死锁）；
 *  - 「**不是门的票**」与「**没有东西可落章的票**」也放行（REQ-261005200052-ce40 FR-2）：前者拦不住任何
 *    下游产物（如 kind=prototype，它根本不在门值域里），后者谁也答不了（看板确认同样要求产物在册）；
 *  - 台账查不到该需求时**保守留挂**（无法证明已落章 → 不静默释放守卫）。
 *
 * @module dsh-pmboard/application/internal/pending-guard
 */
import type { UseCaseDeps } from '../ports.js'
import { requirementStoreOf } from '../use-cases/queue-access.js'
import { ARTIFACT_CONFIRM_GATES, type PendingConfirmation, type RequirementRecord } from '../../shared/protocol.js'
import { LIMITS } from '../../domain/limits.js'

/**
 * 被停手守卫拦下的写路径名单（design/interfaces.md I-2 `pending_confirms[].blocked_tools`）。
 *
 * 挂载点与 design I-3 一致：`reqboard_submit` / `reqboard_decompose` / `reqboard_move` /
 * `reqboard_task_move`。`reqboard_status` 与 `reqboard_confirm_receipt` **刻意不在列**——
 * 否则人无法解除挂起。
 */
export const PENDING_CONFIRM_BLOCKED_TOOLS: readonly string[] = [
  'reqboard_submit',
  'reqboard_decompose',
  'reqboard_move',
  'reqboard_task_move',
]

/**
 * 一句话恢复指引（design/interfaces.md I-2 `pending_confirms[].recovery`，文案契约 FR-4）：
 * 必含「收到作答前不得产出下游产物」与两条可用路径（取回执 / 看板确认）。
 */
export const PENDING_CONFIRM_RECOVERY =
  '收到作答前不得产出下游产物。解除挂起：① 调 reqboard_confirm_receipt(ticket="pc-…") 取回执；'
  + '② 到项目看板点确认按钮。'

/**
 * 该 kind 在流水线里**是不是一道人工确认门**（G1~G4 的 requiredKind）。
 *
 * 门值域的唯一事实源是 `ARTIFACT_CONFIRM_GATES`（由 `GATE_CATALOG` 派生），此处**不另写 kind 名单**
 * ——新增产物种类时忘了配门，也不会悄悄获得「钉死窗口」的副作用（REQ-261005200052-ce40 FR-2）。
 */
export function isConfirmGateKind(kind: string | undefined): boolean {
  if (kind === undefined) return false
  return (Object.values(ARTIFACT_CONFIRM_GATES) as readonly string[]).includes(kind)
}

/**
 * 这张票**是不是一道门**（FR-2 谓词④）：`target='plan'` 走 G3「批准拆分计划」（有门）；
 * `target='artifact'` 看 kind 是否命中门值域。
 *
 * 无门的票（如 `kind=prototype`）拦不住任何下游产物，看板也没有可点的控件——它不该进拦截面。
 */
export function hasConfirmGateOf(rec: PendingConfirmation): boolean {
  if (rec.target === 'plan') return true
  return isConfirmGateKind(rec.kind)
}

/**
 * 这张票**现在有东西可落章吗**（FR-2 谓词⑤）：没有产物 = 人点看板也答不了（看板确认同样要求产物在册），
 * agent 也覆盖不掉 ⇒ 拦住它只会把窗口钉死。
 *
 * **读时谓词**：产物一旦出现（含看板打开详情触发的自动发现補登），下一次判定即恢复拦截。
 */
export function hasConfirmableArtifactOf(req: RequirementRecord, rec: PendingConfirmation): boolean {
  if (rec.target === 'plan') return req.plan !== undefined
  return (req.artifacts ?? []).some(a => a.kind === rec.kind)
}

/**
 * 台账事实：target=plan 看计划批准章；target=artifact 看该 kind 全部产物是否成组落章。
 * （逐字提取自 ConfirmReceipt.ts:76-80——判定口径只留这一处。）
 */
export function targetConfirmedInLedger(req: RequirementRecord, rec: PendingConfirmation): boolean {
  if (rec.target === 'plan') return req.plan?.approvedAt !== undefined
  const arts = (req.artifacts ?? []).filter(a => a.kind === rec.kind)
  return arts.length > 0 && arts.every(a => a.confirmedAt !== undefined)
}

/**
 * 本窗口**仍然有意义**的挂起确认（没有则 undefined）：注册表的 `pendingForWindow` 已滤掉
 * 已 settle / 已过期 / 跨窗口；这里只再滤「台账已落章」的陈旧记录。
 *
 * 台账查不到目标需求 → 无法证明已落章，保守返回该记录（守卫继续拦，不静默释放）。
 */
export async function livePendingConfirm(deps: UseCaseDeps, windowKey: string): Promise<PendingConfirmation | undefined> {
  const pending = deps.pendingConfirms?.pendingForWindow(windowKey)
  if (pending === undefined) return undefined
  // t8/B11：单条查找 → 新端口 get（原为整册 find）
  const req = await requirementStoreOf(deps).get(pending.requirementId)
  if (req === undefined) return pending
  if (targetConfirmedInLedger(req, pending)) return undefined
  // REQ-261005200052-ce40 FR-2：**无门的票不拦**（拦的东西不是门）……
  if (!hasConfirmGateOf(pending)) return undefined
  // ……**无产物的票也不拦**（没有东西可落章 ⇒ 人点看板也答不了）。两者都是读时谓词，产物出现即恢复拦截。
  if (!hasConfirmableArtifactOf(req, pending)) return undefined
  return pending
}

/**
 * 挂起票的**诊断投影**（REQ-261005200052-ce40 FR-3）：读时生成、**不落盘**。
 *
 * 修前 agent 只被告知「有个待作答的确认门」+ 三条固定出路，既不知道为什么挂着（哪条需求、哪份产物、
 * 人当初没盖哪一章），也不知道哪条出路**真的走得通**（例如需求已归档时，曾经那条「重新发起覆盖」
 * 必失败——该条已随 REQ-261006164732-6503 t9 删除）。
 */
export interface PendingConfirmFacts {
  /** 目标需求当前状态（终态时文案写明 agent 侧无解）。 */
  requirementStatus: string
  /** 是不是一道确认门（FR-2 谓词④）：false = 这张票拦不住任何下游产物。 */
  gate: boolean
  /** 该 kind 在册产物数（0 = 没有东西可以被确认）。 */
  artifactCount: number
  /** 自动失效时刻（ms）＝ (interruptedAt ?? createdAt) + TTL。 */
  expiresAt: number
  /** **真实可用**的出路（走不通的路不列）。 */
  usableRecovery: readonly string[]
}

/** 需求终态（这些状态下不会再产出下游产物，agent 侧也无法覆盖挂起票）。 */
const TERMINAL_STATUSES: readonly string[] = ['archived', 'done', 'canceled']

/** 时刻 → 本地 hh:mm（文案用；不引时区库）。 */
function clockText(at: number): string {
  const d = new Date(at)
  const p = (n: number): string => String(n).padStart(2, '0')
  return p(d.getHours()) + ':' + p(d.getMinutes())
}

/** 由台账记录 + 票生成诊断四要素与可用出路（纯函数，单点）。 */
export function pendingConfirmFactsOf(req: RequirementRecord, rec: PendingConfirmation, now: number): PendingConfirmFacts {
  const gate = hasConfirmGateOf(rec)
  const artifactCount = rec.target === 'plan'
    ? (req.plan === undefined ? 0 : 1)
    : (req.artifacts ?? []).filter(a => a.kind === rec.kind).length
  const expiresAt = (rec.interruptedAt ?? rec.createdAt) + LIMITS.pendingConfirmTtlMs
  const terminal = TERMINAL_STATUSES.includes(req.status)
  const usableRecovery: string[] = ['① 调 reqboard_confirm_receipt(ticket="' + rec.ticket + '") 取回执']
  // ② 需要「有门 **且** 产物在册」：看板确认要求产物已登记，否则点了也落不了章。
  if (gate && artifactCount > 0) usableRecovery.push('② 到项目看板点确认按钮（该产物有确认门且已在册，卡面有控件）')
  // REQ-261006164732-6503 t9（serves: FR-3）：**删掉「③ 重新发起 reqboard_ask_confirm 覆盖旧记录」**——
  // 那句是本次双框事故里 agent 照做的第三条文案源；而且"覆盖"的真实行为是再开一个框，
  // 与"同门只留一个在等的框"直接冲突。要人再发起时，建门唯一入口会自动复用同一道门，不需要专门列一条。
  usableRecovery.push('本票将于 ' + clockText(expiresAt) + '（约 ' + Math.max(0, Math.round((expiresAt - now) / 60000)) + ' 分钟后）自动失效')
  if (artifactCount === 0) usableRecovery.push('该产物未登记：先登记产物（reqboard_submit）后再确认')
  if (terminal) usableRecovery.push('该需求已 ' + req.status + '（终态）：agent 侧无法覆盖，请人点看板或等自动失效')
  return { requirementStatus: req.status, gate, artifactCount, expiresAt, usableRecovery }
}

/**
 * 停手守卫的拒绝文案（三要素：what=ticket+需求 id+状态 / why=不得产出下游产物 / how=**真实可用**的出路）。
 *
 * `facts` 缺省时逐字保持旧文案（兼容既有调用点与既有断言）；给了 facts 就按可用性生成，走不通的路不列。
 */
export function pendingConfirmRejectMessage(p: PendingConfirmation, facts?: PendingConfirmFacts): string {
  if (facts === undefined) {
    return '本窗口有一个**待作答**的确认门（ticket=' + p.ticket + '，需求 ' + p.requirementId + '）——'
      + '收到作答前不得产出下游产物。解除挂起：① 调 reqboard_confirm_receipt(ticket="' + p.ticket + '") 取回执；'
      + '② 或在项目看板点确认按钮。'
  }
  return '本窗口有一个**待作答**的确认门（ticket=' + p.ticket + '，需求 ' + p.requirementId
    + '，需求状态 ' + facts.requirementStatus + '；target=' + p.target
    + (p.kind === undefined ? '' : '，kind=' + p.kind)
    + '，该 kind 在册产物 ' + facts.artifactCount + ' 份）——'
    + '收到作答前不得产出下游产物。'
    + (facts.gate ? '' : '**这张票不是确认门**（该 kind 无人工确认门）：它拦不住下游产物，也不该走看板。')
    + '可用出路：' + facts.usableRecovery.join('；') + '。'
}
