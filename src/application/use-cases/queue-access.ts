/**
 * 用例层的任务队列入口（REQ-260927202051-f6df t9 / FR-1, FR-2, FR-3）。
 *
 * 为什么需要它：台账 schema v9 起 `LedgerView` / `ReqboardLedger` / `LedgerChange` **不再有
 * `tasks`**（刻意不留，见 ports.ts:32 注释）——任务唯一事实源是 `TaskStore`。用例层有 53 处
 * 历史读点，若各自写 `deps.taskStore!`，装配缺失就会变成隐式 `undefined` 崩溃（栈里看不到原因）。
 * 这里把"取 store"收敛成单一入口：缺端口**当场响亮抛错**，不静默返回空数组（空数组会让看板
 * 静默空白——正是本需求要根治的最坏结果）。
 *
 * ⚠️ 契约现状（D11 同构问题，已报 Lead）：`UseCaseDeps.taskStore` 在 ports.ts 里仍是**可选**
 * （ports.ts 属 queue-core 写域，本卡不得改）。按 D11「可选字段 + 运行期抛错 = 把装配漏洞从
 * 编译期挪到运行期」的口径，它应改必填——届时本文件可用 `deps.taskStore` 直取，调用点零改动。
 *
 * @module dsh-pmboard/application/use-cases/queue-access
 */
import type { TaskRecord } from '../../shared/protocol.js'
import { isReadyTask } from '../../domain/status/Predicates.js'
import { REQUIREMENT_STORE_ERROR, type MutateResult, type MutationOutcome, type RequirementDraft, type RequirementStore, type TaskStore, type UseCaseDeps } from '../ports.js'
// 队列写盘收口用（调用时使用，不与本文件形成初始化期依赖）
import { assertWritableRequirementProject } from '../internal/support.js'

/** 取任务队列端口；未装配即抛（不静默降级为空任务集）。 */
export function taskStoreOf(deps: UseCaseDeps): TaskStore {
  const store = deps.taskStore
  if (store === undefined) {
    throw Object.assign(
      new Error('任务队列端口未装配（deps.taskStore 缺失）：用例无法读取任务，请检查组合根装配（REQ-260927202051-f6df）'),
      { code: 'REQBOARD_STORE_INCONSISTENT' },
    )
  }
  return store
}

/**
 * 取**新的需求存储端口**（REQ-261002161439-277d t8 搬迁期）。
 *
 * 与 `taskStoreOf` 同一个理由与同一个口径：搬迁期 `deps.store` 是**可选**的（否则 41 处测试
 * 构造点会一次性全红），但**已经搬到新端口的读点必须拿到它**——缺装配是组合根 bug，
 * 不能靠 `?.` 悄悄走回整册读（那正是"读点没真搬"的假绿）。
 *
 * 搬迁完成后（B12）本函数与 `deps.store` 的可选性一起消失。
 */
export function requirementStoreOf(deps: { readonly store?: RequirementStore }): RequirementStore {
  const store = deps.store
  if (store === undefined) {
    throw Object.assign(
      new Error('需求存储端口未装配（deps.store 缺失）：该读点已迁到新端口，请检查组合根装配（REQ-261002161439-277d t8）'),
      { code: 'REQBOARD_STORE_INCONSISTENT' },
    )
  }
  return store
}

/**
 * 就绪任务口径（UC-2 / TC-9.2）：日志与父卡取数共用同一个筛选，避免两处漂移。
 *
 * REQ-261005193546-1b1a FR-1 / D-8：**行为逐字不变**，实现改为复用单点 `isReadyTask`
 * （`domain/status/Predicates`）——本函数只做「按 id 建索引 + 逐条筛」这两步机械动作，
 * 「什么算就绪」不再写在这里（旧实现在此手写了第三份判据，与 `readyTasks` / `computeReady` 漂移）。
 *
 * 既有口径（D-8 语义源，保留）：自身 `todo`；依赖 `done` / `canceled` / **缺席（`undefined`）**
 * 均视为已满足。注意本函数的 `byId` 覆盖**全量**入参，缺席即"依赖 id 不在本需求任务集里"，
 * 按已满足放行（脏引用由 `validateQueue` 的 V-3 检出）——与 `computeReady` 的"悬空保守不放行"
 * 是**两处刻意不同的边界**：那处的 byId 也覆盖全量队列，缺席只能来自脏引用；本函数的调用方
 * 可能只喂活卡集合。
 */
export function readyTasksOf(tasks: readonly TaskRecord[]): TaskRecord[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  return tasks.filter((t) => isReadyTask(t, byId))
}

/**
 * 按 id 变更需求，**找不到 = 无变更**（B12 阶段②a 的统一收口）。
 *
 * 为什么必须有它：旧整册 `mutate` 的惯用写法是"在册里 `find`，找不到就 `return undefined`"
 * ——**静默无操作**；而新端口 `mutate(id, …)` 在需求不存在时**抛 `REQBOARD_NOT_FOUND`**
 * （写操作不隐式建档，见 ports.ts:265 与 writer 的 applyMutation）。59 处调用点若逐个直改，
 * 凡是"需求可能已被并发删掉"的路径都会从静默变成抛错——那是行为变化，不是本次迁移的目的。
 *
 * 故统一走本口：语义与旧写法逐点对应，一处定义、一处可测。
 *
 * @returns `undefined` = 需求不存在（调用方按旧语义处理，多数是"没找到就跳过"）；
 *   否则为本次结果——回调返回 `undefined` / `{changed:false}` 时 `changed=false`（不写盘、不 bump）。
 */
export async function mutateIfPresent(
  store: RequirementStore,
  id: string,
  fn: (draft: RequirementDraft) => MutationOutcome | undefined,
): Promise<MutateResult | undefined> {
  try {
    return await store.mutate(id, fn)
  } catch (err) {
    if ((err as { code?: string }).code === REQUIREMENT_STORE_ERROR.NOT_FOUND) return undefined
    throw err
  }
}

// ---------------------------------------------------------------------------
// 队列写盘收口（REQ-261001203710-0fbf t7 / FR-2）
// ---------------------------------------------------------------------------

/**
 * **队列写盘的两个唯一入口**——`queue.json` 住在工作区里（`docs/requirements/<REQ>/queue.json`），
 * 而队列仓储的根取自**宿主级共享单例**（会被别的窗口改掉）。原始事故正是写队列时发生的：
 * 计划落库把 `queue.json` 与任务卡写进了另一个项目。
 *
 * 故所有队列写都必须经此二口：写入前按需求 id 核验「即将写的根 = 该需求声明的根」，
 * 不一致即抛 `REQBOARD_PROJECT_ROOT_MISMATCH`（给两个绝对路径），**绝不静默写别处**。
 *
 * 注：本文件与 `internal/support.js` 互相 import，但两边的用法都只发生在**调用时**
 * （函数体内），不涉及模块初始化期取值，故不构成初始化死锁。
 */
export async function mutateQueue(
  deps: UseCaseDeps,
  reqId: string,
  fn: Parameters<TaskStore['mutate']>[1],
): Promise<Awaited<ReturnType<TaskStore['mutate']>>> {
  await assertWritableRequirementProject(deps, reqId)
  return await taskStoreOf(deps).mutate(reqId, fn)
}

/** 队列批量建卡（收口见 `mutateQueue` 注释）。 */
export async function createManyQueue(
  deps: UseCaseDeps,
  reqId: string,
  drafts: Parameters<TaskStore['createMany']>[1],
): Promise<Awaited<ReturnType<TaskStore['createMany']>>> {
  await assertWritableRequirementProject(deps, reqId)
  return await taskStoreOf(deps).createMany(reqId, drafts)
}
