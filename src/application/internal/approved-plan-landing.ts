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
import { liveRealCards } from '../../domain/task/ReworkPlaceholder.js'
import { checkDecomposeIdempotency } from '../../domain/workflow/DecomposeSpec.js'
import { assertClauseCoverageGate } from './content-gate-wiring.js'
import { refsForLanding, unrefedKeys, type RefSource } from './plan-refs.js'
import { landPlanTasks, type LandedTaskRef, type PlanTaskDraft } from './plan-landing.js'
import { cancelStaleReworkCards } from './stale-rework.js'
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
  /**
   * >0 = 已有**真卡**（未取消且非回退占位卡），本次跳过重复拆分（幂等）。
   *
   * REQ-261005122915-9f90 t3 / FR-1：**语义收窄**——此前计「未取消任务数」，回退物化出来的
   * 占位重做卡会让它恒 >0，于是新计划一张都不落（实测 23 卡计划 → createdCount 0）。
   */
  alreadyLanded: number
  /**
   * 本次顺带收掉的上一轮占位重做卡数（REQ-261005122915-9f90 t3 / FR-2）。
   * 非回退态恒为 0；>0 说明这是一次「回退后重新落库」。
   */
  staleReworkCanceled: number
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
    // 原型锚点 / 关联 D-x 透传（REQ-261005105032-3b02 FR-5、FR-9 / t12）：未申报不带键。
    // 与 stages 同一个坑：批准即落库这条路径漏传，卡上就永远没有锚点（门禁与子卡提示词双双取空）。
    ...(t.prototypeRefs !== undefined && t.prototypeRefs.length > 0 ? { prototypeRefs: [...t.prototypeRefs] } : {}),
    ...(t.decisionRefs !== undefined && t.decisionRefs.length > 0 ? { decisionRefs: [...t.decisionRefs] } : {}),
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
      staleReworkCanceled: 0,
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

  // ── 回退态：先收掉上一轮物化的占位重做卡（REQ-261005122915-9f90 t3 / FR-2）──────────
  // 顺序即语义：必须在幂等判定**之前**。先判定会把占位卡算成「真卡已在」而短路，
  // 正是 REQ-261005105032-3b02 实测的静默丢卡。
  // 判定口径与手动拆分路径共用同一处（`Decompose.ts` 同款）：只认「当前阶段 = 上次回退的目标」，
  // 非回退态的重复落库仍由下方 checkDecomposeIdempotency 拒死（事故 B 的幽灵卡防线不动）。
  const rollbackTo = fresh.rollback?.to === fresh.status ? fresh.rollback.to : undefined
  let staleReworkCanceled = 0
  if (rollbackTo !== undefined) {
    const collected = await cancelStaleReworkCards({
      deps,
      requirementId: input.requirementId,
      nowTs: input.nowTs,
      actor: { kind: 'agent', sessionId: input.windowKey },
    })
    staleReworkCanceled = collected.canceled
  }

  // 幂等（不抛）：已落库就不重复拆分，也不产生幽灵卡；调用方据此决定是否仍推进状态。
  // REQ-261005122915-9f90 t3 / FR-1：判据由「未取消任务数」换成**真卡数**，并复用 domain 单点
  // （`checkDecomposeIdempotency`）——不再在本文件里另写一份 ok 条件（那正是漂移的来源）。
  const liveReal = liveRealCards(await taskStoreOf(deps).listByRequirement(input.requirementId))
  const idempotency = checkDecomposeIdempotency(fresh.status, liveReal, { rollbackTo })
  // 回退态下 domain 单点会放行重建（`rollbackTo === status`）——那是给**还没重建**的场景留的门。
  // 但「已经重建过」与「还没重建」必须分得开，否则同一次回退里重复落库就是**双份活卡**
  // （本需求要消灭的正是幽灵卡）。判据取**顶层真卡**：回退刚结束时顶层卡一律是 canceled 或
  // 占位卡，真子卡则带 `parentId`（不升格）⇒ 顶层真卡非空 = 新计划确实已落过库。
  const landedReal = rollbackTo === undefined
    ? liveReal
    : liveReal.filter(t => (t.parentId ?? '') === '')
  if (!idempotency.ok || landedReal.length > 0) {
    return {
      created: [], createdCount: 0, unrefed, sources, alreadyLanded: landedReal.length,
      staleReworkCanceled,
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
    staleReworkCanceled,
    ...(warning === undefined ? {} : { warning }),
    ...(landed.rtm === undefined ? {} : { rtm: landed.rtm }),
  }
}
