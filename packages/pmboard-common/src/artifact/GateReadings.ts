/**
 * 卡面产物门读数的**领域判定单点**（REQ-261006175040-12d4 · t1 / FR-1、FR-3、FR-5 · D-2）。
 *
 * ## 为什么要有这个模块
 *
 * 「需求文档 / 设计文档 / 拆分计划 / 验收材料」四个 chip 的三态（✓ 已确认 / ⏳ 待确认 / ✗ 缺失）
 * 原先由**客户端**从 `req.artifacts` 现算（`views/artifacts.ts` 的 `computeGateStatuses`）。
 * 而首屏 `GET /state` 自 B12 阶段⑥-① 起只下发**摘要**（`artifacts` 属大字段，不下发）——
 * 于是每条需求都被算成「四门缺失」，卡面常年四红 + `产物 0/6`（缺陷现场见
 * `docs/requirements/REQ-261006175040-12d4/evidence/before-repro.md`）。
 *
 * 修法（D-2 原话：「摘要补「有界门读数」，服务端算、客户端只渲染（推荐）」）：
 * 判定下沉到本模块，由**服务端**在摘要投影里算好；客户端只渲染读数。
 *
 * ## 两条纪律（写在类型签名里，不靠人记）
 *
 * 1. **零 IO、纯函数**：输入是「门清单 + 产物事实子集」，输出是读数数组。便于逆验证（改坏必红）。
 * 2. **不 import shared**：本仓 `domain` 层不许 import `shared`
 *    （`docs/architecture/live-card-single-source.md` §1 明文），故入参一律**结构化**
 *    （`GateArtifactFact` 只有 `kind` / `confirmedAt`），门清单由调用方传入——
 *    「哪些门生效」的真相仍在 `shared/protocol.ts` 的 `ARTIFACT_CONFIRM_GATES` / `flowProfileFor`。
 *
 * @module dsh-pmboard/domain/artifact/GateReadings
 */

/** 门三态：与卡面 chip 一一对应（confirmed = 绿 ✓ / pending = 橙 ⏳ 可点 / missing = 红 ✗）。 */
export type GateStatus = 'confirmed' | 'pending' | 'missing'

/**
 * 一门读数。
 *
 * `count` = 该 kind 的产物条数（`design` 即份数）：卡面「确认产物（全部 N 份）」的 N 取自它，
 * 这样客户端就不必为了数份数去读 `artifacts`（那正是本次缺陷的成因）。
 */
export interface GateReading {
  readonly kind: string
  readonly status: GateStatus
  readonly count: number
}

/** 门判定只读的产物事实子集（结构化入参，见模块头注纪律 2）。 */
export interface GateArtifactFact {
  readonly kind: string
  readonly confirmedAt?: number
}

/** 计划状态：缺省 = 键不出现（记录里没有计划对象）。 */
export type PlanState = 'pending' | 'approved' | 'rejected'

/**
 * 成组确认的门种类（多份产物共同构成一道门）。
 *
 * 为什么单列常量而不是散在判定里：`design` 的语义（任一份未落章 ⇒ 整门待确认）是**契约**，
 * 卡面文案「确认产物（全部 N 份）」与门禁的成组落章都依赖它；写在一处才改得动。
 */
const GROUP_CONFIRM_KINDS: readonly string[] = ['design']

/**
 * 按门清单算读数。输出**顺序 = 传入的 `confirmKinds` 顺序**（不排序、不去重）——
 * 卡面 chips 的位置必须稳定，否则人每次刷新都在重新找位置。
 */
export function gateReadingsOf(
  confirmKinds: readonly string[],
  artifacts: readonly GateArtifactFact[],
): GateReading[] {
  const out: GateReading[] = []
  for (const kind of confirmKinds) {
    const matched = artifacts.filter(a => a.kind === kind)
    out.push({ kind, status: statusOf(kind, matched), count: matched.length })
  }
  return out
}

/**
 * 单门三态。
 *
 * 判定口径（与改动前客户端的 `computeGateStatuses` **逐字一致**，只是搬了家）：
 *   · 该 kind 一条产物都没有 → `missing`（真实缺失，卡面红）；
 *   · 成组确认的门（design）→ **任一份**未落章即 `pending`，全部落章才 `confirmed`；
 *   · 其余门 → 取该 kind 的**第一条**（登记唯一）：未落章即 `pending`，已落章即 `confirmed`。
 */
function statusOf(kind: string, matched: readonly GateArtifactFact[]): GateStatus {
  if (matched.length === 0) return 'missing'
  if (GROUP_CONFIRM_KINDS.includes(kind)) {
    return matched.some(a => a.confirmedAt === undefined) ? 'pending' : 'confirmed'
  }
  const first = matched[0]
  return first !== undefined && first.confirmedAt !== undefined ? 'confirmed' : 'pending'
}

/**
 * 计划状态三态。
 *
 * 为什么「被退」必须能表达：它是拆分阶段**唯一**要人点头的地方，被退回去重写时卡面若不显示，
 * 人只看得到「没有计划」——那正是本需求要修的那类谎报（FR-5）。
 *
 * 缺省语义：`plan === undefined` ⇒ 返回 `undefined`（键不出现）。计划 chip 没有「缺失」态
 * （没有计划就是没有这个 chip），故它与「读数不可得」在渲染上同形——已在 `design/data-model.md` §5 写明。
 */
export function planStateOf(
  plan: { readonly approvedAt?: number; readonly rejectedAt?: number } | undefined,
): PlanState | undefined {
  if (plan === undefined) return undefined
  if (plan.approvedAt !== undefined) return 'approved'
  if (plan.rejectedAt !== undefined) return 'rejected'
  return 'pending'
}

/**
 * 归档材料是否已备。
 *
 * 判据与领域谓词 `domain/status/Predicates.closingGapOf` **同源**：
 * `archive` 记录在册 **∨** 产物里存在 `kind='archive'`。
 * 为什么必须同源：`closingGapOf` 是「归档需求是否闭环」的唯一判定，看板列表行的
 * 「归档材料待补」若另写一套，就会出现「看板说补过了、谓词说没闭环」——正是本需求要修的病。
 */
export function archivePreparedOf(
  input: { readonly archive?: unknown; readonly hasArchiveArtifact: boolean },
): boolean {
  // 显式 null 视作没有记录——与 `closingGapOf` 的 `!== undefined && !== null` 逐字同口径，
  // 否则「记录被置 null」这种形态会被读成「材料已备」，列表行的预警就漏了。
  const hasRecord = input.archive !== undefined && input.archive !== null
  return hasRecord || input.hasArchiveArtifact
}
