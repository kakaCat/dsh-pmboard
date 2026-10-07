/**
 * 回归：任务**读取**入口必须与写入入口同根（REQ-261003191948-e94a）。
 *
 * ## 为什么要这条测试
 *
 * 2026-10-03 实测事故：插件热重载后，`reqboard_task_tree` / `reqboard_task_run` 一律报
 * 「任务不存在 / 0 张卡」，而 `docs/requirements/<REQ>/queue.json` 明明有 10 张卡。
 *
 * 机制：`workspaceRoot` 在 apply 时取自 `process.cwd()`（宿主启动目录，desktop profile 下是
 * `~/.dsh/profiles/desktop`，**不是**会话工作区）。仓库早有唯一收敛点
 * `agentIdFromExec()` 会用 `exec.agent.session.header.cwd` 校正 docs 与 queueRepo 的根，
 * 但**任务读取入口绕过了它**（TaskTree / AdvanceTool / RunStatusTool 直连
 * `deps.session.windowKey(exec)`）。旧实例之所以正常，只是因为此前的写入类调用顺手把根校正过。
 *
 * 本文件用**真实 JsonQueueRepository + QueueTaskStore** 复现那个形态：
 * 仓储根故意指向空目录（= 重载后的 process.cwd()），队列实际在另一个目录，
 * 只有 `exec` 里的会话 cwd 指向真实位置。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { makeHarness, req, task } from '../application/harness.js'
import { executeTaskTree } from '../../src/application/use-cases/TaskTree.js'
import { JsonQueueRepository } from '../../src/repositories/QueueRepository.js'
import { QueueTaskStore } from '../../src/repositories/QueueTaskStore.js'
import { expectCode } from '../helpers/code-assert.js'

const REQ_ID = 'REQ-000001'
const WINDOW = 'session-w-root-sync'

const roots: string[] = []
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }) })

function tempRoot(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  roots.push(dir)
  return dir
}

/** 造一次「队列在 workRoot，但仓储根被设成 staleRoot」的重载后形态。 */
async function arrangeReloadedInstance(): Promise<{ store: QueueTaskStore; workRoot: string }> {
  const workRoot = tempRoot('pm-root-work-')
  const staleRoot = tempRoot('pm-root-stale-')
  // 先按真实工作区根落队列（等价于重载前那次成功的拆分写入）
  const writer = new QueueTaskStore({
    repo: new JsonQueueRepository({ workspaceRoot: workRoot }),
    now: () => 1_000_000,
  })
  await writer.createMany(REQ_ID, [
    task({ id: 't-parent', status: 'in_progress', createdAt: 1 }),
    task({ id: 't-sub-dev', parentId: 't-parent', stageKind: 'dev', status: 'in_progress', dependsOn: [], createdAt: 1 }),
  ])
  // 再按**过期的宿主 cwd** 建一个实例（= 热重载后新实例的处境）
  const store = new QueueTaskStore({
    repo: new JsonQueueRepository({ workspaceRoot: staleRoot }),
    now: () => 1_000_000,
  })
  return { store, workRoot }
}

describe('任务读取入口的工作区根校正（REQ-261003191948-e94a）', () => {
  it('exec 带会话 cwd 时 TaskTree 能校正根并读到队列（修复前恒为空树）', async () => {
    const { store, workRoot } = await arrangeReloadedInstance()
    const h = makeHarness({
      requirements: [req({ status: 'implementing', sourceSessionId: WINDOW, createdAt: 1 })],
    })
    h.deps.taskStore = store

    const exec = { agent: { id: WINDOW, session: { header: { cwd: workRoot } } } }
    const res = (await executeTaskTree(h.deps, { requirement_id: REQ_ID, parent_id: 't-parent' }, exec)) as {
      success: boolean
      parents: { parent: { id: string }; subtasks: { id: string }[] }[]
    }

    expect(res.success).toBe(true)
    expect(res.parents).toHaveLength(1)
    expect(res.parents[0]?.parent.id).toBe('t-parent')
    expect(res.parents[0]?.subtasks.map(s => s.id)).toEqual(['t-sub-dev'])
  })

  it('反向对照：exec 无会话 cwd 时读不到（证明上一条真的在验校正，而不是仓储本来就对）', async () => {
    const { store } = await arrangeReloadedInstance()
    const h = makeHarness({
      requirements: [req({ status: 'implementing', sourceSessionId: WINDOW, createdAt: 1 })],
    })
    h.deps.taskStore = store

    const res = (await executeTaskTree(h.deps, { requirement_id: REQ_ID, parent_id: 't-parent' }, { agent: { id: WINDOW } })) as {
      success: boolean
      parents: unknown[]
    }

    // 根无法校正 → 读的是空目录 → 找不到父卡（响亮失败，不静默返回空树当成功）
    expect(res.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f): 由中文文案兜底升级为断码（根校正失败 ⇒ 父卡找不到 → REQBOARD_TASK_NOT_FOUND）
    expectCode(res, 'REQBOARD_TASK_NOT_FOUND')
    expect(res.parents).toEqual([])
  })
})
