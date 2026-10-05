/**
 * 「计划已获批 → 落库任务卡」的**唯一实现**（REQ-261002164800-d8f2 t3 / FR-1、FR-6、FR-7）。
 *
 * 为什么要有这一层：此前"落库"这件事在三条入口里各写一遍——批准弹框路径（confirm-settle）、
 * 看板批准（http 路由，压根不落库）、手动 reqboard_decompose。三份实现必然漂移，实测就是
 * 「弹框批准会读计划文档的覆盖对照表、手动路径不读」「一张卡缺引用在一条路径上整批拒、另一条照落」。
 * 本层把**取数（refsForLanding）+ 门禁（FR 覆盖硬门）+ 落库（landPlanTasks）+ 幂等**收成一处；
 * 各入口只决定"要不要顺带推进状态"。
 *
 * 不做什么：不落章产物、不推进状态、不写评论（那些按入口语义不同，留在调用方）。
 *
 * @module dsh-pmboard/application/internal/approved-plan-landing
 */
import type { UseCaseDeps } from '../ports.js'
import type { PlanTask } from '../../shared/protocol.js'
import { fmt } from '../../domain/text/fmt.js'
import { assertClauseCoverageGate } from './content-gate-wiring.js'
import { refsForLanding, unrefedKeys, type RefSource } from './plan-refs.js'
import { landPlanTasks, type LandedTaskRef, type PlanTaskDraft } from './plan-landing.js'
import { requirementStoreOf, taskStoreOf } from '../use-cases/queue-access.js'

/** 触发落库的入口（进留痕，便于复盘"这次是谁触发的"）。 */
export type LandingSource = 'confirm' | 'board'

export interface LandApprovedPlanInput {
  requirementId: string
  windowKey: string
  nowTs: number
  source: LandingSource
  /** DSH todo_write（真实会话才有；测试/直连调用没有 → 跳过）。 */
  tools?: { todo_write?: (a: unknown) => Promise<unknown> } | undefined
}

export interface LandApprovedPlanResult {
  created: LandedTaskRef[]
  createdCount: number
  /** 无需求条款落点的计划 key（人读点名用；**不拒绝**落库）。 */
  unrefed: string[]
  /** 逐 key 的取数来源（explicit / doc / none），可观测。 */
  sources: Map<string, RefSource>
  /** >0 = 已有未取消任务，本次跳过重复拆分（幂等）。 */
  alreadyLanded: number
  /** 无落点卡的可见警告文案（有才给）。 */
  warning?: string
  /** RTM 覆盖度读数（取自**真实任务记录**，不是投影）。 */
  rtm?: Awaited<ReturnType<typeof landPlanTasks>>['rtm']
}

/** 台账计划任务 → 落库草稿（与创作路径同一形状）。 */
function draftOf(planTasks: readonly PlanTask[]): PlanTaskDraft[] {
  return planTasks.map(t => ({
    key: t.key,
    title: t.title,
    description: t.description ?? '',
    phase: t.phase ?? 'implement',
    side: t.side ?? 'fullstack',
    acceptance: t.acceptance ?? '',
    implementation: t.implementation ?? '',
    context: '',
    dependsOn: [...(t.dependsOn ?? [])],
    ...(t.stages !== undefined ? { stages: [...t.stages] } : {}),
    ...(t.skipIntegration === true ? { skipIntegration: true } : {}),
    // 体量声明透传（REQ-261002175818-80a8 t2 / FR-7）：未声明不带键（不冒充 0）。
    ...(t.footprint !== undefined ? { footprint: t.footprint } : {}),
  }))
}

/**
 * 把**已批准**计划落库（幂等）。
 *
 * 前置（调用方负责）：计划已批准、需求处于 decomposing。
 * 失败语义（FR-6）：FR 覆盖缺口 → **抛**（带原 code，调用方响亮留痕）；
 * 卡级无落点 → **不抛**，进 `unrefed` + `warning`（纯文档卡天然无 FR，拒它会锁死整批）。
 */
export async function landApprovedPlan(deps: UseCaseDeps, input: LandApprovedPlanInput): Promise<LandApprovedPlanResult> {
  const fresh = await requirementStoreOf(deps).get(input.requirementId)
  if (fresh === undefined) {
    return {
      created: [], createdCount: 0, unrefed: [], sources: new Map(), alreadyLanded: 0,
      warning: fmt('需求 {id} 不在台账中，未落库', { id: input.requirementId }),
    }
  }

  const planTasks: readonly PlanTask[] = fresh.plan?.tasks ?? []
  // 硬门（三入口同一道）：需求里每条根编号都必须有落点（被卡接收，或显式标「本轮不做」）。
  const coverageFailure = await assertClauseCoverageGate(deps.docs, fresh, planTasks as readonly unknown[])
  if (coverageFailure !== undefined) {
    throw Object.assign(new Error(coverageFailure.message), { code: coverageFailure.code })
  }

  // 取数单点：显式优先 → 文档覆盖表兜底 → 来源 none（由 unrefed 点名）
  const { refsByKey, sources } = await refsForLanding({ req: fresh, plan: fresh.plan, docs: deps.docs })
  const draft = draftOf(planTasks)
  const unrefed = unrefedKeys(draft.map(d => d.key), refsByKey)
  const warning = unrefed.length > 0
    ? fmt('⚠️ {n} 张卡没有需求条款落点（{keys}）——卡已落库，但 RTM 的 serves 会缺这几条；补法：在计划文档覆盖对照表补「FR-N ↔ 计划 key」，或用补写入口给卡补 requirement_refs', {
        n: unrefed.length,
        keys: unrefed.join('、'),
      })
    : undefined

  // 幂等（不抛）：已落库就不重复拆分，也不产生幽灵卡；调用方据此决定是否仍推进状态。
  const existing = (await taskStoreOf(deps).listByRequirement(input.requirementId)).filter(t => t.status !== 'canceled')
  if (existing.length > 0) {
    return {
      created: [], createdCount: 0, unrefed, sources, alreadyLanded: existing.length,
      ...(warning === undefined ? {} : { warning }),
    }
  }

  const landed = await landPlanTasks(deps, {
    requirementId: input.requirementId,
    windowKey: input.windowKey,
    nowTs: input.nowTs,
    draft,
    refsByKey,
    tools: input.tools,
  })
  return {
    created: landed.created,
    createdCount: landed.created.length,
    unrefed,
    sources,
    alreadyLanded: 0,
    ...(warning === undefined ? {} : { warning }),
    ...(landed.rtm === undefined ? {} : { rtm: landed.rtm }),
  }
}
