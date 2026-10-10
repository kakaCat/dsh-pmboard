/**
 * QueryRunStatus 用例
 *
 * 查询实施链运行状态：直读台账活字段（`advance.runId` = 链锁）+ job 状态，返回快照投影。
 *
 * REQ-261008011118-defe BUG-1（DD-1）：本用例原先经 `CheckpointManager.readCheckpoint` 读
 * `stepIndex/currentSubtaskId/heartbeatAt`——而写侧（`writeCheckpoint`）在生产代码**0 调用方**
 * （链只写 `advance.runId/lockAt/history`），于是 run 节**恒报第 0 步 / 无当前子卡**：读一个
 * 永远没人写的字段。修法 = 删字段（连同其死代码），run 节只报活字段；进度信息由任务台账
 * （`reqboard_task_tree`）承载，不再由这儿给第二份。
 */

import type { RequirementRecord, TaskRecord } from '../../client-types.js'

/**
 * 运行状态
 */
export interface RunStatus {
  /** 运行ID，没有则为 null */
  runId: string | null
  /** 下一批 ready 的任务ID列表 */
  nextReady: string[]
  /** Job 状态 */
  jobStatus: 'running' | 'completed' | 'failed' | 'not_found'
  /** 暂停原因（如果已暂停） */
  pauseReason?: string
  /** 是否自动运行 */
  autoRun: boolean
}

/**
 * 查询参数
 */
export interface QueryParams {
  /** 需求ID */
  requirementId: string
  /** 获取需求记录 */
  getRequirement: () => Promise<RequirementRecord>
  /** 获取任务列表 */
  getTasks: () => Promise<TaskRecord[]>
  /**
   * Job 查询适配器（可选）：调用方注入优先（测试 / 宿主 JobsPort），
   * 缺省才尝试 DshJobsAdapter(globalThis)——且仅当宿主真的暴露 ctx.jobs。
   * 收紧为结构性接口，避免调用方为了构造 DshJobsAdapter（私有字段 → 名义类型）而绕远路。
   */
  dshJobsAdapter?: { getJob(jobId: string): Promise<{ status: string } | null> }
}

/**
 * QueryRunStatus 用例
 * 
 * @param params 查询参数
 * @returns 运行状态快照
 */
export async function queryRunStatus(params: QueryParams): Promise<RunStatus> {
  const { getRequirement, getTasks } = params

  // 获取需求记录
  const requirement = await getRequirement()

  // 「有没有 run 在跑」的唯一凭据 = 台账活锁字段 `advance.runId`（AdvanceChain 认领时写、finally 清）。
  const activeRunId = requirement.advance?.runId

  if (activeRunId === undefined || activeRunId.length === 0) {
    // 没有运行中的任务
    const tasks = await getTasks()
    const nextReady = findReadyTasks(tasks).map(t => t.id)

    return {
      runId: null,
      nextReady,
      jobStatus: 'not_found',
      autoRun: false
    }
  }

  // 有 active run，查询 job 状态。适配器可能取不到（宿主未暴露 ctx.jobs）——
  // 取不到时如实报 not_found，绝不把「查不到」伪装成运行中，也绝不因此让整个查询抛错。
  let jobStatus: 'running' | 'completed' | 'failed' | 'not_found' = 'not_found'

  try {
    const adapter = resolveJobsAdapter(params)
    const jobSnapshot = adapter === undefined ? null : await adapter.getJob(activeRunId)

    if (jobSnapshot) {
      switch (jobSnapshot.status) {
        case 'running':
          jobStatus = 'running'
          break
        case 'completed':
          jobStatus = 'completed'
          break
        case 'failed':
          jobStatus = 'failed'
          break
        default:
          jobStatus = 'not_found'
      }
    }
  } catch (error) {
    // Job 不存在或查询失败
    jobStatus = 'not_found'
  }
  
  // 获取下一批 ready 任务
  const tasks = await getTasks()
  const nextReady = findReadyTasks(tasks).map(t => t.id)
  
  // 判断暂停原因
  let pauseReason: string | undefined
  if (jobStatus === 'completed' && nextReady.length === 0) {
    const allDone = tasks.every(t => t.status === 'done')
    if (!allDone) {
      pauseReason = '有任务但都不 ready（可能在等待依赖）'
    }
  }
  
  // FR-10 同口径：undefined 值属性会被 PTC lossless 校验拦下——有条件才展开
  return {
    runId: activeRunId,
    nextReady,
    jobStatus,
    ...(pauseReason !== undefined ? { pauseReason } : {}),
    autoRun: jobStatus === 'running'
  }
}

/**
 * 解析 Job 查询适配器：**只认调用方注入**（依赖倒置，REQ-261009174713-7bc8 t14）。
 *
 * 为什么 core 不再自己构造（原实现：`DshJobsAdapter.isAvailable(globalThis)` 就 new 一个）：
 *   · 宿主 jobs 服务是**组合根**的职责（`src/index.ts` 已按同一可用性判据注入 `deps.jobs`），
 *     core 自己摸 `globalThis` 等于把「谁碰宿主全局」这条边界搬到 L1；
 *   · 而且 `DshJobsAdapter` 住在根包的 adapters/，core import 它是**包级反向依赖**，
 *     十九包重构的依赖门禁会（也应该）当场拒绝。
 * 缺省（嵌入调用 / 测试没注入）→ 不查 job 状态、如实按「无运行态」返回（不猜、不静默编造 running）。
 */
function resolveJobsAdapter(
  params: QueryParams,
): { getJob(jobId: string): Promise<{ status: string } | null> } | undefined {
  return params.dshJobsAdapter
}

/**
 * 查找 ready 状态的任务
 * 
 * @param tasks 任务列表
 * @returns ready 任务列表
 */
function findReadyTasks(tasks: TaskRecord[]): TaskRecord[] {
  return tasks.filter(task => {
    // 只处理 todo 状态
    if (task.status !== 'todo') {
      return false
    }
    
    // 检查依赖是否全部完成
    const deps = task.dependsOn || []
    const allDepsDone = deps.every(depId => {
      const depTask = tasks.find(t => t.id === depId)
      return depTask?.status === 'done'
    })
    
    return allDepsDone
  })
}
