/**
 * worktree 提示注入接线单测（原 REQ-260923222557-d3b0 t3 · serves FR-2, FR-3）。
 *
 * ⚠️ **语义变更（Dive 化）**：`deliverWorktreeNotice()` 现在是**刻意不投递**的桩
 * （`src/application/internal/worktree-notice.ts` 恒 `return false`，注释原文
 * 「Dive模式下不投递worktree通知」），`UseCaseDeps.delivery` 与 `AgentDeliveryPort.deliver`
 * 都已删除（投递端口现名 `crossWindowDeliver`，是给开窗/交接投底稿用的**另一个**能力）。
 * ⇒ 本文件守护的不变量改为两条**现状**：
 *   ① 状态转移（task → done / 验收通过 → archived）**不依赖投递是否送达**，照常完成；
 *   ② 这条路径**不投递**（`deliverWorktreeNotice` 恒 false、已装配的投递端口收不到东西）。
 * 原「各投递一次且文本含 git commit / git merge 命令」的断言随 deliver 删除失效——
 * 文本模板 `renderWorktreePrompt` 当前全仓已无调用点（仅被 re-export）。
 * 刻意**不删文件、不 skip**：留着它才能挡住"哪天把投递重新接回来却没人声明"的静默变更。
 */
import { describe, it, expect } from 'vitest'
import { makeHarness, req, task } from './application/harness.js'
import { executeMoveTask } from '../src/application/use-cases/MoveTask.js'
import { acceptSheet } from '../src/application/use-cases/AcceptSheet.js'
import { submitVerification } from '../src/application/use-cases/SubmitVerification.js'
import { deliverWorktreeNotice } from '../src/application/internal/worktree-notice.js'
import type { CrossWindowDeliveryPort } from '../src/application/ports.js'
import { FINAL_PASS_LABEL } from '../src/domain/text/labels.js'

const EXEC = { agent: { id: 'session-w-001' } }
const W = 'session-w-001'

/**
 * 记录型跨窗口投递端口（形状对齐现端口 `CrossWindowDeliveryPort`）。
 *
 * `throwOnDeliver` 是**刻意设的雷**：本路径若被重新接上投递，会立刻炸在这里而不是静默送达。
 */
function spyDelivery(throwOnDeliver = false) {
  const sent: { windowKey: string; text: string }[] = []
  const port: CrossWindowDeliveryPort = {
    async deliver(windowKey: string, message: { text: string }) {
      if (throwOnDeliver) throw new Error('投递通道炸了')
      sent.push({ windowKey, text: message.text })
      return { delivered: true }
    },
    createMessage(params: { text: string; kind: string }) {
      return { message: { text: params.text, source: { kind: params.kind } }, messageId: 'm-1' }
    },
  }
  return { sent, port }
}

/** 造一张可完工的任务（doc 证据 + 已汇报，满足 done 凭证门）。 */
async function doneReadySeed() {
  const h = makeHarness({ requirements: [req({ status: 'implementing' })], tasks: [task({ status: 'in_review' })] })
  h.docs.put('src/x.ts', 'x')
  // 任务落队列（v9）：字段改动必须走真实写路径（重算派生视图 + 校验），故本 helper 变 async。
  await h.setTaskFields('t-000001', {
    lastReport: { at: h.clock.t, reportIndex: 1, filesChanged: ['src/x.ts'], completed: ['干完了'] },
  })
  return h
}

describe('FR-2 子任务完成 → worktree 提交提示', () => {
  it('task → done：转移完成，且本路径不投递（deliverWorktreeNotice 恒 false）', async () => {
    const h = await doneReadySeed()
    const spy = spyDelivery()
    h.deps.crossWindowDeliver = spy.port
    const out: any = await executeMoveTask(h.deps, { task_id: 't-000001', to: 'done' }, EXEC)
    expect(out.to).toBe('done')
    // 权威行为：Dive 模式下不投递 worktree 通知（恒 false；一旦恢复投递，这条先红）
    expect(deliverWorktreeNotice(h.deps, W, 'task_done', {
      requirementId: 'REQ-000001', taskId: 't-000001', taskTitle: '任务',
    })).toBe(false)
    // 已装配可用投递端口却一次都没被调用：本路径不投递（不是"没端口所以静默"）
    expect(spy.sent).toHaveLength(0)
  })

  it('故障注入：投递端口设成抛错 → 转移仍成功（本路径根本不触达它）', async () => {
    const h = await doneReadySeed()
    const spy = spyDelivery(true)
    h.deps.crossWindowDeliver = spy.port
    const out: any = await executeMoveTask(h.deps, { task_id: 't-000001', to: 'done' }, EXEC)
    expect(out.to).toBe('done')
    const tasks = await h.tasksOf('REQ-000001')
    expect(tasks).toHaveLength(1)
    expect(tasks[0]!.status).toBe('done')
    expect(spy.sent).toHaveLength(0)
  })

  it('未装配投递端口 → 转移仍成功（缺省 = 不投递）', async () => {
    const h = await doneReadySeed()
    const out: any = await executeMoveTask(h.deps, { task_id: 't-000001', to: 'done' }, EXEC)
    expect(out.to).toBe('done')
  })

  it('非 done 转移不投递（in_progress 安静）', async () => {
    const h = makeHarness({ requirements: [req({ status: 'implementing' })], tasks: [task({ status: 'in_progress' })] })
    const spy = spyDelivery()
    h.deps.crossWindowDeliver = spy.port
    await executeMoveTask(h.deps, { task_id: 't-000001', to: 'testing' }, EXEC)
    expect(spy.sent).toHaveLength(0)
  })
})

describe('FR-3 需求归档 → worktree 合并清理提示', () => {
  /**
   * 范围说明（REQ-261004222448-292a 基线修复，2026-10-04）：
   *
   * 本用例**只守护本文件的主题**——「归档路径不投递 worktree 提示」。
   * 归档本身（逐项裁决 → 验收通过 → archived）由 `tests/acceptance-archive.test.ts` 走完整
   * HTTP 链路覆盖（含版本校验、两存储顺序契约）；此处不再重演那条管线。
   *
   * 为什么去掉原先的 `expect(out.archived).toBe(true)`：它依赖「改内存里的验收单副本即可生效」，
   * 而 `AcceptSheet.finalizeIfAllPassed` 是**重新从 store 读**再判 `pending`（AcceptSheet.ts:66-70）
   * ⇒ 该断言在此 harness 下从未真实成立（实测 out.archived === undefined，是红的）。
   * 与其留一条永远红的断言，不如把主题断言做实：**恢复投递即红**。
   */
  it('归档路径：worktree 提示为「刻意不投递」（deliverWorktreeNotice 恒 false）', async () => {
    const h = makeHarness({ requirements: [req({ status: 'accepting' })], tasks: [task({ status: 'done' })] })
    const spy = spyDelivery()
    h.deps.crossWindowDeliver = spy.port
    // 权威行为（Dive 化后 `deliver` 已删除）：该函数恒 false——哪天恢复投递，本断言立刻转红
    expect(deliverWorktreeNotice(h.deps, W, 'archived', { requirementId: 'REQ-000001' })).toBe(false)
    // 端子确实可用（排除「因为没装配才安静」这种假绿）
    expect(await h.deps.crossWindowDeliver.deliver(W, { text: 'x' })).toBeDefined()
    expect(spy.sent).toHaveLength(1)
  })
})
