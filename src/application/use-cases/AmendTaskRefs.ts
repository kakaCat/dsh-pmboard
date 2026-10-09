/**
 * 任务卡「需求条款引用」补写用例（REQ-261002164800-d8f2 t5 / FR-4）。
 *
 * 为什么需要：卡一旦落库，`requirementRefs` **没有任何写入口**——
 *   重交计划 + 重批 → 撞「已落库」幂等；重跑拆分 → 撞幂等守卫；看板改卡路由不收这个字段。
 * 实测代价：修好生成链之前落下的 531 张空引用卡，谁也补不回来（全仓 590 卡里 90% 为空）。
 * 本用例是**唯一**写入口：工具 `reqboard_task_amend(op=refs)` 与看板改卡路由共用它。
 *
 * 语义（三条硬口径）：
 *   ① **全量替换**（不是追加）——空数组合法，用于"这条引用本来就不该有"；
 *   ② **值相同不写盘**（幂等；判据是队列写入序号不变）；
 *   ③ 写完同步 RTM（`rtm-implementing/<id>.yml` 的 serves = 卡上 refs）+ 需求评论留痕。
 *
 * @module dsh-pmboard/application/use-cases/AmendTaskRefs
 */
import type { UseCaseDeps } from '../ports.js'
import { boundSummariesOf } from '../internal/binding-read.js'
import { fmt } from '../../domain/text/fmt.js'
import { normalizeText } from '../../shared/protocol.js'
import { RequirementRefError, normalizeRequirementRefs } from '../../domain/task/RequirementRefs.js'
import { agentIdFromExec, reject, requireLiveDriver } from '../internal/support.js'
import { syncRTMYaml } from '../internal/rtm-yaml.js'
import { requirementStoreOf, taskStoreOf, mutateIfPresent, mutateQueue } from './queue-access.js'

export interface AmendTaskRefsInput {
  taskId: string
  /** 目标引用集（全量替换）；空数组 = 清空。非法编号 → REQBOARD_BAD_REQUIREMENT_REF。 */
  requirementRefs: unknown
  /** 改这条引用的原因（必填；进需求评论留痕）。 */
  reason: string
  /** 权限口径：传了就必须命中（工具路径 = 本窗口绑定需求）；不传 = 不做窗口校验（看板人操作）。 */
  boundRequirementIds?: readonly string[]
  /**
   * 是否写需求评论留痕（默认 true）。
   * 存量回填要改上百张卡——逐卡写评论会把看板刷爆、也给数据层添无谓体积；
   * 回填路径置 false，改由回填器**每个需求写一条汇总评论**，留痕不丢。
   */
  comment?: boolean
  /** 是否逐卡同步 RTM（默认 true）。整批回填置 false，由回填器每个需求同步一次（等价且便宜得多）。 */
  rtm?: boolean
  actor: { kind: 'agent' | 'human'; sessionId?: string }
}

/**
 * 返回体**统一用工具面拼法**（`task_id` / `rtm_synced`…）。
 * 为什么不留 camelCase：输出契约门禁按"工厂 → 响应源文件"静态扫描 return 键，
 * 一个文件里两种拼法会被判成"有未声明字段"；统一拼法既是门禁要求，也让看板路由与工具读同一形状。
 */
export interface AmendTaskRefsResult {
  task_id: string
  requirement_id: string
  before: string[]
  after: string[]
  /** false = 值没变，未写盘（幂等）。 */
  changed: boolean
  /** 是否已同步 RTM（失败不阻断，但如实报 false）。 */
  rtm_synced: boolean
}

/** 全量替换一张卡的需求条款引用（唯一写入口）。 */
export async function amendTaskRefs(deps: UseCaseDeps, input: AmendTaskRefsInput): Promise<AmendTaskRefsResult> {
  const taskId = normalizeText(input.taskId, 'task_id', 64)
  if (taskId.length === 0) {
    reject('reqboard_task_amend(op=refs) 未执行：task_id 不能为空', 'REQBOARD_INVALID_INPUT')
  }
  const reason = normalizeText(input.reason, 'reason', 500)
  if (reason.length === 0) {
    reject('reqboard_task_amend(op=refs) 未执行：reason 不能为空（谁改的、为什么改必须留痕）', 'REQBOARD_INVALID_INPUT')
  }
  let next: string[]
  try {
    next = normalizeRequirementRefs(input.requirementRefs, 'requirement_refs')
  } catch (err) {
    if (err instanceof RequirementRefError) {
      reject('reqboard_task_amend(op=refs) 未执行：' + err.message, err.code)
    }
    throw err
  }

  const store = taskStoreOf(deps)
  const task = await store.get(taskId)
  if (task === undefined) {
    reject(fmt('reqboard_task_amend(op=refs) 未执行：任务 {id} 不存在', { id: taskId }), 'REQBOARD_TASK_NOT_FOUND')
  }
  if (input.boundRequirementIds !== undefined && !input.boundRequirementIds.includes(task.requirementId)) {
    reject(
      fmt('reqboard_task_amend(op=refs) 未执行：任务 {id} 属于需求 {rid}，不在本窗口绑定的需求里（只能补自己的需求）', {
        id: taskId,
        rid: task.requirementId,
      }),
      'REQBOARD_TASK_NOT_BOUND',
    )
  }

  const before = [...(task.requirementRefs ?? [])].sort()
  const same = before.length === next.length && before.every((v, i) => v === next[i])
  if (same) {
    return { task_id: taskId, requirement_id: task.requirementId, before, after: next, changed: false, rtm_synced: false }
  }

  const nowTs = deps.clock.now()
  // 任务写经 TaskStore（唯一写路径；队列文件被真实改写才会 bump 写入序号）
  await mutateQueue(deps, task.requirementId, (tasks) => {
    const t = tasks.find(x => x.id === taskId)
    if (t === undefined) return undefined
    t.requirementRefs = [...next]
    t.updatedAt = nowTs
    t.version += 1
    return tasks
  })

  // 留痕（需求评论：看板可见，验收/复盘可查"谁在什么时候把引用改成了什么"）
  if (input.comment !== false) await mutateIfPresent(requirementStoreOf(deps), task.requirementId, (r) => {
    r.comments.push({
      id: deps.ids.comment(),
      body: fmt('[条款引用补写] {id}：{before} → {after}（{why}）', {
        id: taskId,
        before: before.length > 0 ? before.join('、') : '（空）',
        after: next.length > 0 ? next.join('、') : '（空）',
        why: reason,
      }),
      createdAt: nowTs,
      createdBy: input.actor,
    })
    r.updatedAt = nowTs
    return { changed: true }
  })

  // RTM 同步：serves ← 卡上 refs（失败不阻断主流程，但如实回报 false）
  let rtmSynced = false
  if (input.rtm !== false) {
    try {
      await syncRTMYaml(deps, await store.listByRequirement(task.requirementId), task.requirementId, 'task:status', { taskId })
      rtmSynced = true
    } catch {
      rtmSynced = false
    }
  }

  return { task_id: taskId, requirement_id: task.requirementId, before, after: next, changed: true, rtm_synced: rtmSynced }
}

/** 工具入口：绑定本窗口并做权限校验（与看板路由共用同一个用例）。 */
export async function executeTaskRefs(deps: UseCaseDeps, args: unknown, exec: unknown): Promise<unknown> {
  const windowKey = agentIdFromExec(deps, exec)
  requireLiveDriver(deps, exec)
  const a = (args ?? {}) as { task_id?: unknown; requirement_refs?: unknown; reason?: unknown }
  // t8/B11：绑定读走新端口（只读摘要，且这里**只要 id** ⇒ 连整条都不用取）
  const bound = (await boundSummariesOf(requirementStoreOf(deps), windowKey)).map((r) => r.id)
  const out = await amendTaskRefs(deps, {
    taskId: normalizeText(a.task_id, 'task_id', 64),
    requirementRefs: a.requirement_refs,
    reason: normalizeText(a.reason, 'reason', 500),
    boundRequirementIds: bound,
    actor: { kind: 'agent', sessionId: windowKey },
  })
  return {
    success: true,
    ...out,
    note: out.changed
      ? fmt('已写入 {n} 条条款引用（全量替换）并同步 RTM', { n: out.after.length })
      : '引用集未变，未写盘（幂等）',
  }
}
