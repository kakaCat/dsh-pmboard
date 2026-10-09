/**
 * 任务状态迁移的唯一收敛点（REQ-260927100007-b8ba FR-8）——与需求级 transitionRequirement 对称。
 *
 * 背景事故：任务状态曾被四处直接赋值（ExecuteTask / AdvanceChain / failure-handling /
 * http 路由），其中只有 http 路由调 assertTaskTransition → 自动链（无人值守）反而最松。
 * 本函数让"任务状态只能经收敛点改变"，非法/越权流转一律在此抛错且**不改动任何字段**。
 *
 * @module dsh-pmboard/application/internal/task-transition
 */
import { assertTaskTransition, type TaskRole, type TaskStatus } from '../../domain/task/TaskStatus.js'
import { markCanceled, recordStatus, type ActorRef, type TaskRecord } from '../../shared/protocol.js'

export interface TaskTransitionOpts {
  /** 迁移时刻 */
  at: number
  /** 操作者 */
  actor: ActorRef
  /** 迁移理由（可选，进状态事件） */
  reason?: string
  /** 任务角色（parent/subtask/legacy）——决定用哪张转移表；缺省 legacy（既有行为不变） */
  role?: TaskRole
  /** 逃生舱（默认 false=校验收紧）：**只允许迁移/回填等非业务写入**使用 */
  allowIllegalTransition?: boolean
}

/**
 * 任务角色判定：子卡（有 parentId）/ 父卡（有子卡）/ 存量卡。
 *
 * 与工具面 `MoveTask.roleOf` 同口径（**单源**）：三个调用方（工具面、HTTP 面）
 * 必须用同一张转移表，否则看板就成了绕过角色门的第二个入口（H2-role 事故根因：
 * `handleTaskMove` 不传 role → 缺省 legacy → 子卡可进 integrating/testing/in_review 非法态）。
 */
export function roleOfTask(task: TaskRecord, tasks: readonly TaskRecord[]): TaskRole {
  if (typeof task.parentId === 'string' && task.parentId.length > 0) return 'subtask'
  return tasks.some(t => t.parentId === task.id) ? 'parent' : 'legacy'
}

/**
 * 唯一任务状态迁移助手：校验收敛 + 迁移状态 + 记录状态事件。
 * 成功 = 就地改 status/version/updatedAt/updatedBy + 追加 statusHistory；
 * 失败 = 抛错且**不改动任何字段**（禁止半迁移态）。
 *
 * 取消留痕（REQ-261005193546-1b1a FR-3）：`to === 'canceled'` 时在 `task.status = to` 的**同一处**
 * 调 `markCanceled`（同对象、同一次写事务、同 `at`/`by`/`reason`）——取消卡的三字段与状态事件
 * 同源同刻。复活（`canceled → todo`）**不清空**三字段（覆盖式语义：三字段 = 最近一次取消）。
 */
export function transitionTask(task: TaskRecord, to: TaskStatus, opts: TaskTransitionOpts): void {
  const from = task.status
  if (opts.allowIllegalTransition !== true) {
    assertTaskTransition(from, to, opts.actor.kind, opts.role ?? 'legacy')
  }
  task.status = to
  // 与 status 同一处、同一对象：取消留痕三字段（人工门已在上面把住；非人路径不写 canceledBy）
  if (to === 'canceled') {
    markCanceled(task, { at: opts.at, by: opts.actor, reason: opts.reason })
  }
  task.version += 1
  task.updatedAt = opts.at
  task.updatedBy = opts.actor
  recordStatus(task, to, opts.at, opts.actor, opts.reason)
}
