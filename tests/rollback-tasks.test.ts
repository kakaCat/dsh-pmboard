/**
 * 回退的旧任务卡处置单测（REQ-261003204149-1e80 t4 / FR-4）。
 *
 * 三条验收（对齐 t4 卡）：
 *  ① 2 张旧卡（done + in_progress）全部 canceled；
 *  ② 重做卡数 = 2，且 reworkOf 一一指向旧卡、dependsOn 为空、status === 'todo'；
 *  ③ 每张旧卡 revisions 含 1 条 kind = 'rollback'。
 *
 * 另测纯函数性（不改传入数组）与边界（已取消卡不参与）。
 */
import { describe, expect, it } from 'vitest'
import { planRollbackTasks, type TaskIdFactory } from '../src/application/internal/rollback-tasks.js'
import type { ActorRef, RequirementRecord, TaskRecord, TaskStatus } from '../src/shared/protocol.js'

const REQ = 'REQ-rb0001'
const HUMAN: ActorRef = { kind: 'human' }

function task(id: string, status: TaskStatus, over: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id, requirementId: REQ, title: '卡 ' + id, description: '',
    phase: 'implement', side: 'backend', dependsOn: [], scope: { apis: [], tables: [], files: [] },
    acceptance: '跑 npx vitest run 全绿', context: '', implementation: '改 A 文件',
    status, blocked: false, executions: [], comments: [],
    version: 1, createdAt: 1, updatedAt: 1, createdBy: HUMAN, updatedBy: HUMAN,
    ...over,
  } as TaskRecord
}

/** 确定 id 生成器（不用随机数，断言才能一一对应）。 */
function ids(prefix = 't-new'): TaskIdFactory {
  let n = 0
  return { task: () => prefix + String(++n) }
}

const req = { id: REQ } as RequirementRecord

describe('planRollbackTasks · 旧卡取消（FR-4 ①③）', () => {
  it('done 与 in_progress 两张旧卡全部 canceled，各带 1 条 rollback 修订', () => {
    const tasks = [task('t-old1', 'done'), task('t-old2', 'in_progress')]
    const plan = planRollbackTasks(req, tasks, 'design', 100, HUMAN, ids(), '需求边界与真实意图不符')

    expect(plan.canceled.map(t => t.id).sort()).toEqual(['t-old1', 't-old2'])
    for (const c of plan.canceled) {
      expect(c.status, c.id).toBe('canceled')
      const rollbacks = (c.revisions ?? []).filter(r => r.kind === 'rollback')
      expect(rollbacks.length, c.id + ' 应恰好 1 条 rollback 修订').toBe(1)
      expect(rollbacks[0]!.reason).toBe('需求边界与真实意图不符')
      expect(rollbacks[0]!.changes[0]).toContain('→canceled')
    }
  })

  it('不改传入的旧卡对象（纯函数：调用方数组不被就地改）', () => {
    const tasks = [task('t-old1', 'done')]
    planRollbackTasks(req, tasks, 'design', 100, HUMAN, ids(), 'r')
    expect(tasks[0]!.status).toBe('done')
    expect(tasks[0]!.revisions).toBeUndefined()
  })

  it('已取消的卡不参与（没有可放弃的东西，不重复留痕）', () => {
    const tasks = [task('t-old1', 'canceled'), task('t-old2', 'done')]
    const plan = planRollbackTasks(req, tasks, 'design', 100, HUMAN, ids(), 'r')
    expect(plan.canceled.map(t => t.id)).toEqual(['t-old2'])
    expect(plan.reworkDrafts.length).toBe(1)
  })

  it('别的需求的卡不参与（只处置本需求的卡）', () => {
    const tasks = [task('t-x', 'done', { requirementId: 'REQ-other' })]
    const plan = planRollbackTasks(req, tasks, 'design', 100, HUMAN, ids(), 'r')
    expect(plan.canceled).toEqual([])
    expect(plan.reworkDrafts).toEqual([])
  })
})

describe('planRollbackTasks · 重做卡物化（FR-4 ②）', () => {
  it('数量一一对应，reworkOf 指向旧卡、dependsOn 为空、status=todo', () => {
    const tasks = [task('t-old1', 'done'), task('t-old2', 'in_progress')]
    const plan = planRollbackTasks(req, tasks, 'design', 100, HUMAN, ids(), 'r')

    expect(plan.reworkDrafts.length).toBe(2)
    expect(plan.reworkDrafts.map(t => t.reworkOf).sort()).toEqual(['t-old1', 't-old2'])
    for (const d of plan.reworkDrafts) {
      expect(d.status, d.id).toBe('todo')
      expect(d.dependsOn, d.id + ' 的旧依赖必须清空（旧卡已取消）').toEqual([])
      expect(d.title.startsWith('[重做] '), d.title).toBe(true)
      expect(d.requirementId).toBe(REQ)
      expect(d.id).not.toBe(d.reworkOf) // 新 id，不冒充旧卡
    }
  })

  it('继承旧卡的施工信息（acceptance／implementation／phase／side／scope），不继承其执行痕迹', () => {
    const tasks = [task('t-old1', 'done', { attempt: 2, lastRun: { at: 1, ok: true, stopReason: 'completed', valueNonEmpty: true } })]
    const plan = planRollbackTasks(req, tasks, 'design', 100, HUMAN, ids(), 'r')
    const d = plan.reworkDrafts[0]!
    expect(d.acceptance).toBe('跑 npx vitest run 全绿')
    expect(d.implementation).toBe('改 A 文件')
    expect(d.phase).toBe('implement')
    expect(d.side).toBe('backend')
    expect(d.attempt, '重做卡从 0 计次，不继承旧卡的失败次数').toBeUndefined()
    expect(d.lastRun, '重做卡没有历史 run 证据').toBeUndefined()
    expect(d.statusHistory?.[0]?.reason).toContain('t-old1')
  })

  it('无活卡时是空计划（迁移/回填等无卡需求不报错）', () => {
    const plan = planRollbackTasks(req, [], 'design', 100, HUMAN, ids(), 'r')
    // REQ-261004121649-bfa7 FR-1：契约新增 resetTasks（子卡原地复位清单）——无活卡时同样为空
    expect(plan).toEqual({ canceled: [], reworkDrafts: [], resetTasks: [] })
  })
})

describe('planRollbackTasks · 占位重做卡不得被复位（REQ-261005122915-9f90 t5 / FR-4）', () => {
  /** 上一轮回退留下的占位卡：`reworkOf` 非空、无 parentId（顶层）。 */
  const placeholder = (id: string) => task(id, 'todo', { title: '[重做] 卡 ' + id, reworkOf: 't-old' + id })

  it('第二轮回退：占位卡保持 canceled，不得回到 todo', () => {
    const tasks = [placeholder('t-p1'), placeholder('t-p2')]
    const plan = planRollbackTasks(req, tasks, 'decomposing', 200, HUMAN, ids(), '再来一次')

    // 未修复前：它们落进 resetTasks 被改回 todo ⇒ 每一轮回退都清不掉，持续污染落库幂等判据
    expect(plan.resetTasks.map(t => t.id), '占位卡没有子卡身份，不该走「子卡复位」').toEqual([])
    expect(plan.canceled.map(t => t.id).sort()).toEqual(['t-p1', 't-p2'])
    for (const c of plan.canceled) expect(c.status, c.id).toBe('canceled')
  })

  it('占位卡不产生「重做卡的重做卡」', () => {
    const plan = planRollbackTasks(req, [placeholder('t-p1')], 'decomposing', 200, HUMAN, ids(), 'r')
    expect(plan.reworkDrafts).toEqual([])
  })

  it('真子卡（有 parentId）仍按既有规则复位为 todo —— 本改动不得误伤', () => {
    const sub = task('t-sub', 'in_progress', { parentId: 't-parent', stageKind: 'dev' })
    const plan = planRollbackTasks(req, [sub], 'decomposing', 200, HUMAN, ids(), 'r')
    expect(plan.resetTasks.map(t => t.id)).toEqual(['t-sub'])
    expect(plan.resetTasks[0]!.status).toBe('todo')
    expect(plan.resetTasks[0]!.parentId).toBe('t-parent')
  })
})
