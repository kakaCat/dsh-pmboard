/**
 * 存量任务卡「需求条款引用」回填器（REQ-261002164800-d8f2 t6 / FR-5）。
 *
 * 背景：修好生成链之前落下的卡，`requirementRefs` 全空——实测全仓 590 卡里 531 张为空（90%），
 * 导致 RTM 的 serves 与覆盖度长期失真。本模块把「按计划文档的覆盖对照表把引用补回卡上」
 * 做成可 dry-run、可复核、可还原的一次性动作。
 *
 * 三条纪律：
 *   ① **只经端口**（`TaskStore` + `DocsReader`）：不直接读写队列文件，与在途的分片迁移解耦；
 *   ② **只补不覆写**：已有非空引用的卡一律跳过（进 skipped 并说明），不制造二次变更；
 *   ③ **可还原**：报告里记 `before`，`restoreBackfill` 据此还原——数据变更必须有退路。
 *
 * 复用补写用例（`amendTaskRefs`）作为**唯一写路径**；整批场景传 `comment:false, rtm:false`，
 * 由本模块每个需求写一条汇总评论并同步一次 RTM（避免 531 条评论与 531 次 YAML 写）。
 *
 * @module dsh-pmboard/application/internal/backfill-task-refs
 */
import type { UseCaseDeps } from '../ports.js'
import { fmt } from '../../domain/text/fmt.js'
import { planRefsFromDoc } from './content-gate-wiring.js'
import { syncRTMYaml } from './rtm-yaml.js'
import { amendTaskRefs } from '../use-cases/AmendTaskRefs.js'
import { requirementStoreOf, taskStoreOf, mutateIfPresent } from '../use-cases/queue-access.js'
// REQ-261005193546-1b1a FR-1/FR-4：活卡判据单点（回填的处置对象不再自写取消比较）
import { liveTasksOf } from '../../domain/status/Predicates.js'

export interface BackfillCandidate {
  requirement_id: string
  task_id: string
  /** 计划 key（由标题对回计划表得到）。 */
  key: string
  title: string
  /** 回填前的引用（回滚凭据）。 */
  before: string[]
  refs: string[]
}

export interface BackfillNote {
  requirement_id: string
  task_id: string
  why: string
}

export interface BackfillRequirementPlan {
  requirement_id: string
  title: string
  status: string
  candidates: BackfillCandidate[]
  unresolved: BackfillNote[]
  skipped: BackfillNote[]
  applied: number
}

export interface BackfillReport {
  generated_at: string
  dry_run: boolean
  requirements: BackfillRequirementPlan[]
  totals: { candidates: number; unresolved: number; skipped: number; applied: number }
  /** 复核读数：仍"空引用且文档表有来源"的卡数（回填干净后应为 0）。 */
  empty_with_doc_coverage: number
}

/** 归档/取消的需求只报告、不回填。 */
const FROZEN_STATUS = new Set(['archived', 'canceled'])

/**
 * 计算回填计划（**只读**，不写盘）。
 * 逐需求：读计划文档的覆盖对照表 + 队列任务，给出候选 / 无来源 / 跳过三张清单。
 */
export async function planBackfill(deps: UseCaseDeps): Promise<BackfillReport> {
  const store = taskStoreOf(deps)
  // t8/B11：整册读 → 摘要列 id + 按需取整条（scope: all 保持旧语义：原本整册含归档）
  const reqStore = requirementStoreOf(deps)
  const reqIds = (await reqStore.listSummaries({ scope: 'all' })).items.map((s) => s.id)
  const out: BackfillRequirementPlan[] = []

  for (const id of reqIds) {
    const req = await reqStore.get(id)
    if (req === undefined) continue
    const planTasks = req.plan?.tasks ?? []
    // 标题 → key：同名（或缺失）一律判为无法确定，宁可不回填也不写错卡
    const candidatesByKey = new Map<string, string>()
    const dupTitles = new Set<string>()
    for (const t of planTasks) {
      if (t.title === undefined || t.title.length === 0) continue
      if (candidatesByKey.has(t.title)) dupTitles.add(t.title)
      else candidatesByKey.set(t.title, t.key)
    }
    for (const d of dupTitles) candidatesByKey.delete(d)

    const tasks = liveTasksOf(await store.listByRequirement(req.id))
    if (tasks.length === 0) continue
    const frozen = FROZEN_STATUS.has(req.status)
    const docRefs = frozen ? new Map<string, string[]>() : await planRefsFromDoc(deps.docs, req)

    const plan: BackfillRequirementPlan = {
      requirement_id: req.id, title: req.title, status: req.status,
      candidates: [], unresolved: [], skipped: [], applied: 0,
    }
    for (const task of tasks) {
      const before = [...(task.requirementRefs ?? [])]
      if (frozen) {
        plan.skipped.push({ requirement_id: req.id, task_id: task.id, why: '需求已归档/取消：只报告不回填' })
        continue
      }
      if (task.parentId !== undefined) {
        plan.skipped.push({ requirement_id: req.id, task_id: task.id, why: '子卡：随父卡语义，不单独补' })
        continue
      }
      if (before.length > 0) {
        plan.skipped.push({ requirement_id: req.id, task_id: task.id, why: '已有引用：不覆写（' + before.join('、') + '）' })
        continue
      }
      const key = candidatesByKey.get(task.title)
      // 覆盖表两种写法都认：机器生成的 §1 表用**任务 id**，人手写的对照表用**计划 key**
      // （与 content-trace 的读法同口径）。只认一种会漏掉一半存量卡——实测 dry-run 从 10 → 数十张。
      const refs = docRefs.get(task.id) ?? (key === undefined ? undefined : docRefs.get(key)) ?? []
      if (refs.length === 0) {
        plan.unresolved.push({
          requirement_id: req.id,
          task_id: task.id,
          why: key === undefined
            ? '覆盖表既没按任务 id 写它，标题也对不上计划表'
            : '覆盖对照表未写它（计划 key ' + key + '）',
        })
        continue
      }
      plan.candidates.push({
        requirement_id: req.id, task_id: task.id, key: key ?? task.id, title: task.title,
        before, refs: [...refs].sort(),
      })
    }
    out.push(plan)
  }

  const totals = {
    candidates: out.reduce((n, p) => n + p.candidates.length, 0),
    unresolved: out.reduce((n, p) => n + p.unresolved.length, 0),
    skipped: out.reduce((n, p) => n + p.skipped.length, 0),
    applied: 0,
  }
  return {
    generated_at: new Date(deps.clock.now()).toISOString(),
    dry_run: true,
    requirements: out,
    totals,
    // dry-run 时"待回填"就是复核读数本身
    empty_with_doc_coverage: totals.candidates,
  }
}

/**
 * 执行回填（**写盘**）：逐卡走唯一写路径 `amendTaskRefs`（comment/rtm 关掉），
 * 每个需求结束时写一条汇总评论并同步一次 RTM。幂等：已回填的卡在 plan 阶段就进不了候选。
 */
export async function applyBackfill(deps: UseCaseDeps, plan: BackfillReport): Promise<BackfillReport> {
  let applied = 0
  for (const p of plan.requirements) {
    if (p.candidates.length === 0) {
      p.applied = 0
      continue
    }
    for (const c of p.candidates) {
      await amendTaskRefs(deps, {
        taskId: c.task_id,
        requirementRefs: c.refs,
        reason: '存量回填（REQ-261002164800-d8f2 t6 / FR-5）：按计划文档覆盖对照表补齐',
        comment: false,
        rtm: false,
        actor: { kind: 'agent' },
      })
      applied += 1
    }
    p.applied = p.candidates.length
    // 一个需求一条汇总评论（留痕不丢，也不把看板刷爆）
    await mutateIfPresent(requirementStoreOf(deps), p.requirement_id, (r) => {
      r.comments.push({
        id: deps.ids.comment(),
        body: fmt('[条款引用回填] 按计划文档覆盖对照表补齐 {n} 张历史卡（未覆写已有引用；明细见回填报告）', { n: p.candidates.length }),
        createdAt: deps.clock.now(),
        createdBy: { kind: 'agent' },
      })
      r.updatedAt = deps.clock.now()
      return { changed: true }
    })
    // 同步一次 RTM（serves ← 卡上 refs）：用需求级触发点 `confirm:plan`（一次重生成整需求的
    // implementing 视图）；`task:status` 是**单卡**触发点——不传 taskId 会报"缺少 taskId"，
    // 逐卡调用又是上百次写盘，故整批回填用需求级触发。
    try {
      await syncRTMYaml(deps, await taskStoreOf(deps).listByRequirement(p.requirement_id), p.requirement_id, 'confirm:plan')
    } catch { /* RTM 是增强层：失败不阻断回填（与既有口径一致） */ }
  }
  const after = await checkBackfill(deps)
  return { ...plan, dry_run: false, totals: { ...plan.totals, applied }, empty_with_doc_coverage: after.empty_with_doc_coverage }
}

/** 复核读数：仍"空引用且文档表有来源"的卡数（回填干净后应为 0）。 */
export async function checkBackfill(deps: UseCaseDeps): Promise<{ empty_with_doc_coverage: number }> {
  const fresh = await planBackfill(deps)
  return { empty_with_doc_coverage: fresh.totals.candidates }
}

/** 按报告里的 `before` 还原（数据变更有退路）。 */
export async function restoreBackfill(deps: UseCaseDeps, report: BackfillReport): Promise<{ restored: number }> {
  let restored = 0
  for (const p of report.requirements) {
    for (const c of p.candidates) {
      await amendTaskRefs(deps, {
        taskId: c.task_id,
        requirementRefs: c.before,
        reason: '回填还原（按回填报告的 before 值）',
        comment: false,
        rtm: false,
        actor: { kind: 'agent' },
      })
      restored += 1
    }
    try {
      await syncRTMYaml(deps, await taskStoreOf(deps).listByRequirement(p.requirement_id), p.requirement_id, 'confirm:plan')
    } catch { /* 同上 */ }
  }
  return { restored }
}
