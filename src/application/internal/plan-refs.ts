/**
 * 计划落库的 **refs 取数单点**（REQ-261002164800-d8f2 t2 / FR-1、FR-3）。
 *
 * 为什么必须单点：此前「哪张卡接哪几条 FR」有**两处各自拼装**——批准路径（confirm-settle）
 * 会读计划文档的覆盖对照表、手动路径（Decompose）不读；同一条已批准计划，两条入口落出的
 * 卡上引用因此不同（实测 277d：批准路径 0 卡、手动路径 11 卡全空）。取数只要有两份实现，
 * 迟早会分叉；这里把它收敛成唯一实现，两条入口都调它。
 *
 * 优先级（与 design/interfaces.md 一致）：
 *   ① 显式 `requirement_refs`（`reqboard_decompose` 的 tasks 与台账 `plan.tasks` 取并集）
 *   ② 计划文档的「覆盖对照表」（`planRefsFromDoc`，只在①为空时补齐）
 *   ③ 两处都没有 ⇒ 空 + `sources='none'`，由调用方**点名**（不再整批拒绝——纯文档卡天然无 FR）
 *
 * @module dsh-pmboard/application/internal/plan-refs
 */
import type { RequirementRecord } from '../../shared/protocol.js'
import { compareRefIds, normalizeRequirementRefs } from '../../domain/task/RequirementRefs.js'
import type { DocsReader } from './content-gates.js'
import { planRefsFromDoc, requirementRefsOf } from './content-gate-wiring.js'

/** 逐 key 的取数来源（进返回体，让「这条引用从哪来」可观测）。 */
export type RefSource = 'explicit' | 'doc' | 'none'

export interface RefsForLandingInput {
  /** 需求记录（文档覆盖表按 `req.id` 定位 `docs/requirements/<id>/decomposition.md`）。 */
  req: Pick<RequirementRecord, 'id'>
  /** 台账里已批准的计划（key 与其任务表都从这里来）。 */
  plan?: { tasks?: readonly unknown[] } | undefined
  /** `reqboard_decompose(tasks=…)` 传进来的创作表（key 集合必须与已批准计划一致，由调用方保证）。 */
  explicitTasks?: readonly unknown[] | undefined
  docs: DocsReader
}

export interface RefsForLandingResult {
  /** 计划 key → 需求条款编号（顺序为自然序）。 */
  refsByKey: Map<string, string[]>
  /** 计划 key → 这条引用从哪条通道来。 */
  sources: Map<string, RefSource>
}

/** 从任务对象上读 key（缺 key 的对象跳过——它不是一张卡）。 */
function keyOf(raw: unknown): string | undefined {
  const o = raw as { key?: unknown } | null
  return o !== null && typeof o === 'object' && typeof o.key === 'string' && o.key.length > 0 ? o.key : undefined
}

/**
 * 组装落库用的 refs（唯一实现）。
 *
 * 并集语义：同一 key 同时出现在显式 tasks 与 plan.tasks 时**取并集**，后写不覆盖前写
 * （沿用既有行为：否则"计划携带任务表"这条常见路径上，RTM 表会恒显示未声明接收任何条款）。
 * 校验语义：显式值一律过 `normalizeRequirementRefs`（非法即抛 `REQBOARD_BAD_REQUIREMENT_REF`），
 * 不把脏值带进落库。
 */
export async function refsForLanding(input: RefsForLandingInput): Promise<RefsForLandingResult> {
  const explicit = input.explicitTasks ?? []
  const planTasks = input.plan?.tasks ?? []

  // ① 显式通道：key 顺序 = 显式表在前、计划表在后（与既有并集顺序一致，便于比对）
  const refsByKey = new Map<string, string[]>()
  const sources = new Map<string, RefSource>()
  const absorb = (raw: unknown): void => {
    const key = keyOf(raw)
    if (key === undefined) return
    const refs = normalizeRequirementRefs(requirementRefsOf(raw), '计划任务 ' + key + ' 的 requirement_refs')
    const merged = new Set([...(refsByKey.get(key) ?? []), ...refs])
    refsByKey.set(key, [...merged].sort(compareRefIds))
    if (merged.size > 0) sources.set(key, 'explicit')
    else if (!sources.has(key)) sources.set(key, 'none')
  }
  for (const raw of explicit) absorb(raw)
  for (const raw of planTasks) absorb(raw)

  // ② 文档通道：只在①为空时补齐（显式优先；两处都有时不让文档覆盖显式）
  // 2026-10-06 如实标注：这是**存量 / 回填通道**——覆盖门禁（`assertClauseCoverageGate`）已收敛成
  // 「只认卡上 requirement_refs」的单口径，新计划走不到这条（卡上没 refs 在门禁那一关就被拒了）。
  // 保留它是为了规则生效前已批准的老计划：那些计划的卡上恒空，只能靠文档表把引用补回落库值。
  // 它被 `refsByKey.size > 0` 门住（没有显式 refs 的计划不进这条）——这正是实测 28% 落库率的来源，
  // 修法在门禁侧（要求显式），不在取数侧（把文档表升格成依据 = 又造一份会漂移的真相）。
  if (refsByKey.size > 0) {
    for (const [key, refs] of await planRefsFromDoc(input.docs, input.req)) {
      if (!refsByKey.has(key)) continue // 文档里提到、但不在本次计划里的 key 不进结果（避免噪声）
      if ((refsByKey.get(key) ?? []).length > 0) continue
      refsByKey.set(key, [...refs])
      sources.set(key, 'doc')
    }
  }

  return { refsByKey, sources }
}

/**
 * 无落点的计划 key（人读点名用）。
 *
 * 与 `planRefsMissing` 的**语义差别**：那个函数此前被用作"缺一即拒整批"的硬门禁，
 * 于是含纯文档卡（天然无 FR）的计划整批落不了库；本函数只回答"哪些卡没有落点"，
 * 是否拒绝由调用方决定——按设计，**卡级无落点一律只警告**，硬门只有"每个 FR 有落点"一道。
 */
export function unrefedKeys(keys: readonly string[], refs: ReadonlyMap<string, string[]>): string[] {
  return keys.filter((k) => (refs.get(k) ?? []).length === 0)
}
