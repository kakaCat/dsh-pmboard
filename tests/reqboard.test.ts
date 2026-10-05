/**
 * Reqboard M1 单测：状态机、闸门、DAG 校验、Store 并发与持久化。
 * 运行：cd agent-dh && npx vitest run packages/pages/dsh-pmboard/tests/
 */
import { describe, it, expect } from 'vitest'
import {
  assertReqTransition,
  assertTaskTransition,
  assertDagAcyclic,
  readyTasks,
  type TaskRecord,
} from '../src/shared/protocol.js'

/** vitest toThrow 检查 message 而非 code；用 helper 断言 code。 */
function throwsCode(fn: () => void, expectedCode: string): void {
  try { fn(); expect.fail('期望抛错但未抛') } catch (e: any) { expect(e.code).toBe(expectedCode) }
}

// ---------------------------------------------------------------------------
// Requirement 状态机
// ---------------------------------------------------------------------------

describe('Requirement state machine', () => {
  it('allows legal transitions', () => {
    expect(() => assertReqTransition('draft', 'brainstorming', 'human')).not.toThrow()
    expect(() => assertReqTransition('brainstorming', 'design', 'human')).not.toThrow()
    expect(() => assertReqTransition('design', 'decomposing', 'human')).not.toThrow()
    expect(() => assertReqTransition('decomposing', 'implementing', 'human')).not.toThrow()
    expect(() => assertReqTransition('implementing', 'accepting', 'system')).not.toThrow()
    // REQ-9f4a44：验收通过 → 直接归档（done 节点已移除）
    expect(() => assertReqTransition('accepting', 'archived', 'human')).not.toThrow()
    expect(() => assertReqTransition('canceled', 'archived', 'human')).not.toThrow()
  })

  it('rejects illegal transitions', () => {
    throwsCode(() => assertReqTransition('draft', 'done', 'human'), 'invalid_transition')
    throwsCode(() => assertReqTransition('done', 'draft', 'human'), 'invalid_transition')
    throwsCode(() => assertReqTransition('archived', 'draft', 'human'), 'invalid_transition')
  })

  it('human gate：取消/归档/验收通过/需求文档确认/拆分清单确认为人工闸门，其余在途推进 agent 可做', () => {
    // 在途推进：agent 自己就能推（2026-09-11 裁定；2026-09-14 五门裁定部分回调——
    // 需求文档确认 brainstorming>design 与拆分清单确认 decomposing>implementing 入人工门）
    expect(() => assertReqTransition('draft', 'brainstorming', 'agent')).not.toThrow()
    expect(() => assertReqTransition('design', 'decomposing', 'agent')).not.toThrow()
    expect(() => assertReqTransition('implementing', 'accepting', 'agent')).not.toThrow()
    // 五门裁定（2026-09-14）：两道在途硬门，agent 不可越过
    throwsCode(() => assertReqTransition('brainstorming', 'design', 'agent'), 'human_gate')
    throwsCode(() => assertReqTransition('decomposing', 'implementing', 'agent'), 'human_gate')
    // 验收通过是人工审核（用户裁定：验收 有人工审核）——agent 到不了 archived
    throwsCode(() => assertReqTransition('accepting', 'archived', 'agent'), 'human_gate')
    expect(() => assertReqTransition('brainstorming', 'draft', 'agent')).not.toThrow()
    // 破坏性/终态动作仍是人工闸门
    throwsCode(() => assertReqTransition('accepting', 'canceled', 'agent'), 'human_gate')
    throwsCode(() => assertReqTransition('canceled', 'archived', 'agent'), 'human_gate')
  })

  it('system gate: 派生链放行、白名单外一律拒绝、人工闸门优先', () => {
    // 白名单：接手推进 + 任务驱动链（拆分/验收）；2026-09-14 五门裁定移除 decomposing>implementing
    expect(() => assertReqTransition('draft', 'brainstorming', 'system')).not.toThrow()
    expect(() => assertReqTransition('design', 'decomposing', 'system')).not.toThrow()
    expect(() => assertReqTransition('implementing', 'accepting', 'system')).not.toThrow()
    // 五门裁定：拆分清单确认是人工闸门 → system 不可自动越过
    throwsCode(() => assertReqTransition('decomposing', 'implementing', 'system'), 'human_gate')
    // 白名单外：system 不可发起
    throwsCode(() => assertReqTransition('draft', 'canceled', 'system'), 'human_gate')
    throwsCode(() => assertReqTransition('brainstorming', 'draft', 'system'), 'system_gate')
    // 验收通过（accepting>archived）是人工闸门 → 优先级高于 system 白名单
    throwsCode(() => assertReqTransition('accepting', 'archived', 'system'), 'human_gate')
    // 人工闸门优先于 system：取消/归档永不被自动越过
    throwsCode(() => assertReqTransition('implementing', 'canceled', 'system'), 'human_gate')
  })
})

// ---------------------------------------------------------------------------
// Task 状态机
// ---------------------------------------------------------------------------

describe('Task state machine', () => {
  it('allows legal transitions', () => {
    expect(() => assertTaskTransition('todo', 'in_progress', 'human')).not.toThrow()
    expect(() => assertTaskTransition('in_progress', 'integrating', 'human')).not.toThrow()
    expect(() => assertTaskTransition('in_progress', 'testing', 'human')).not.toThrow() // skip integration
    expect(() => assertTaskTransition('integrating', 'testing', 'human')).not.toThrow()
    expect(() => assertTaskTransition('testing', 'in_review', 'human')).not.toThrow()
    expect(() => assertTaskTransition('in_review', 'done', 'human')).not.toThrow()
    expect(() => assertTaskTransition('canceled', 'todo', 'human')).not.toThrow()
  })

  it('rejects illegal transitions', () => {
    throwsCode(() => assertTaskTransition('todo', 'done', 'human'), 'invalid_transition')
    throwsCode(() => assertTaskTransition('done', 'todo', 'human'), 'invalid_transition')
  })

  it('human gate: 2026-09-13 起仅取消/复活是人工闸门（agent 可把任务跑完）', () => {
    // 用户裁定：任务完成若仅人可点，任务卡停在验收 → 需求永远进不了验收（看板静止）
    expect(() => assertTaskTransition('in_review', 'done', 'agent')).not.toThrow()
    expect(() => assertTaskTransition('todo', 'in_progress', 'agent')).not.toThrow()
    // 破坏性动作仍是代码级人工闸门
    throwsCode(() => assertTaskTransition('in_progress', 'canceled', 'agent'), 'human_gate')
    throwsCode(() => assertTaskTransition('in_review', 'canceled', 'agent'), 'human_gate')
    throwsCode(() => assertTaskTransition('canceled', 'todo', 'agent'), 'human_gate')
    // system 仍受白名单限制（只有开始/退回执行）
    throwsCode(() => assertTaskTransition('in_review', 'done', 'system'), 'system_gate')
  })
})

// ---------------------------------------------------------------------------
// DAG 校验
// ---------------------------------------------------------------------------

function makeTasks(reqId: string, defs: Array<{ id: string; deps: string[] }>): TaskRecord[] {
  return defs.map(d => ({
    id: d.id, requirementId: reqId, title: d.id, description: '', phase: 'implement' as const,
    side: 'backend' as const, dependsOn: d.deps, scope: { apis: [], tables: [], files: [] },
    acceptance: '', context: '', status: 'todo', blocked: false, executions: [], comments: [],
    version: 1, createdAt: 0, updatedAt: 0, createdBy: { kind: 'human' as const }, updatedBy: { kind: 'human' as const },
  }))
}

describe('DAG validation', () => {
  const reqId = 'REQ-000001'

  it('passes on acyclic DAG', () => {
    const tasks = makeTasks(reqId, [
      { id: 't-01', deps: [] },
      { id: 't-02', deps: ['t-01'] },
      { id: 't-03', deps: ['t-01'] },
      { id: 't-04', deps: ['t-02', 't-03'] },
    ])
    expect(() => assertDagAcyclic(tasks, reqId)).not.toThrow()
  })

  it('detects self-dependency', () => {
    const tasks = makeTasks(reqId, [{ id: 't-01', deps: ['t-01'] }])
    throwsCode(() => assertDagAcyclic(tasks, reqId), 'invalid_dag')
  })

  it('detects missing dependency', () => {
    const tasks = makeTasks(reqId, [{ id: 't-01', deps: ['t-99'] }])
    throwsCode(() => assertDagAcyclic(tasks, reqId), 'invalid_dag')
  })

  it('detects indirect cycle', () => {
    const tasks = makeTasks(reqId, [
      { id: 't-01', deps: ['t-03'] },
      { id: 't-02', deps: ['t-01'] },
      { id: 't-03', deps: ['t-02'] },
    ])
    throwsCode(() => assertDagAcyclic(tasks, reqId), 'invalid_dag')
  })

  it('readyTasks selects todo with all deps done', () => {
    const tasks: TaskRecord[] = [
      ...makeTasks(reqId, [
        { id: 't-01', deps: [] },
        { id: 't-02', deps: ['t-01'] },
        { id: 't-03', deps: ['t-01'] },
        { id: 't-04', deps: ['t-02', 't-03'] },
      ]),
    ]
    tasks[0].status = 'done'
    const ready = readyTasks(tasks, reqId)
    expect(ready.map(t => t.id)).toEqual(['t-02', 't-03'])
  })
})

// B12 阶段⑤：原 `describe('ReqboardStore')` 整块删除——**其 subject 就是被删的旧实现**
// （JSON 单册的持久化重载、snapshot 冻结语义、损坏文件隔离），随实现一同消失。
// 前三个 describe（需求/任务状态机、DAG 校验）是纯 domain 用例，原样保留。
