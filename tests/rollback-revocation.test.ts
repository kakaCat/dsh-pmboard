/**
 * 回退撤销语义单测（REQ-261003204149-1e80 t3 / FR-3）。
 *
 * 这是"回退不会白送人工门"的把关点：退回去以后，下游的章与计划批准必须**如实作废**。
 * 三条验收（对齐 t3 卡）：
 *  ① 目标 design 时 stage 晚于 design 的产物全部无章，且 design 自身不被误撤；
 *  ② plan.approvedAt === undefined；
 *  ③ 连续两次回退到同一目标，docSyncPending 无重复 source 条目。
 */
import { describe, expect, it } from 'vitest'
import { applyRollbackRevocation } from '../src/application/internal/rollback-revocation.js'
import { docSyncPendingOf } from '../src/domain/workflow/DocSyncSpec.js'
import type { RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

const REQ = 'REQ-rb0001'
const HUMAN = { kind: 'human' as const }

function art(stage: StageArtifact['stage'], kind: StageArtifact['kind'], path: string, confirmedAt?: number): StageArtifact {
  return {
    stage, kind, path,
    registeredAt: 1,
    registeredBy: { kind: 'agent', sessionId: 's-1' },
    ...(confirmedAt !== undefined ? { confirmedAt, confirmedBy: HUMAN } : {}),
  }
}

/** 造一个"走得最远"的需求：五份下游产物都已落章 + 计划已批准。 */
function makeReq(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: REQ, title: '回退撤销', description: '', status: 'implementing', category: 'feature',
    blocked: false, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: HUMAN, updatedBy: HUMAN,
    artifacts: [
      art('brainstorming', 'requirement', 'docs/requirements/' + REQ + '/requirement.md', 10),
      art('design', 'design', 'docs/requirements/' + REQ + '/design/architecture.md', 20),
      art('decomposing', 'decomposition', 'docs/requirements/' + REQ + '/decomposition.md', 30),
      art('implementing', 'task_detail', 'docs/requirements/' + REQ + '/tasks/t-1.md', 40),
      art('accepting', 'verification', 'docs/requirements/' + REQ + '/verification.md', 50),
    ],
    plan: { path: 'docs/requirements/' + REQ + '/decomposition.md', submittedAt: 25, approvedAt: 30, approvedBy: HUMAN, tasks: [] },
    ...over,
  } as unknown as RequirementRecord
}

let seq = 0
const commentId = () => 'c-' + String(++seq)

describe('applyRollbackRevocation · 撤章范围（FR-3 ①）', () => {
  it('目标 design：晚于 design 的产物全部无章，design 自身与更上游的章保留', () => {
    const req = makeReq()
    const out = applyRollbackRevocation(req, 'implementing', 'design', 100, HUMAN, commentId)

    const byStage = (s: string) => (req.artifacts ?? []).find(a => a.stage === s)!
    // 撤：decomposing / implementing / accepting
    for (const s of ['decomposing', 'implementing', 'accepting']) {
      expect(byStage(s).confirmedAt, s + ' 应被撤章').toBeUndefined()
      expect(byStage(s).confirmedBy, s + ' 的 confirmedBy 应一并清除').toBeUndefined()
    }
    // 留：brainstorming / design（**design 自身不被误撤**——它是回退的落点，不是下游）
    expect(byStage('design').confirmedAt).toBe(20)
    expect(byStage('brainstorming').confirmedAt).toBe(10)
    // 登记本身保留（只撤章，不是删产物）
    expect((req.artifacts ?? []).length).toBe(5)
    // 回执如实列出被撤 path
    expect(out.artifactsRevoked).toEqual([
      'docs/requirements/' + REQ + '/decomposition.md',
      'docs/requirements/' + REQ + '/tasks/t-1.md',
      'docs/requirements/' + REQ + '/verification.md',
    ])
  })

  it('目标 brainstorming：连 design 的章也要撤（它已在下游）', () => {
    const req = makeReq()
    applyRollbackRevocation(req, 'design', 'brainstorming', 100, HUMAN, commentId)
    const byStage = (s: string) => (req.artifacts ?? []).find(a => a.stage === s)!
    for (const s of ['design', 'decomposing', 'implementing', 'accepting']) {
      expect(byStage(s).confirmedAt, s).toBeUndefined()
    }
    expect(byStage('brainstorming').confirmedAt).toBe(10) // 需求文档是落点，保留
  })

  it('未落章的产物不进回执（不谎报"撤了一个本来就没章的"）', () => {
    const req = makeReq({
      artifacts: [art('implementing', 'task_detail', 'docs/requirements/' + REQ + '/tasks/t-1.md')],
    })
    const out = applyRollbackRevocation(req, 'implementing', 'design', 100, HUMAN, commentId)
    expect(out.artifactsRevoked).toEqual([])
  })
})

describe('applyRollbackRevocation · 撤计划批准（FR-3 ②）', () => {
  it('目标早于拆分阶段 → plan.approvedAt 消失', () => {
    const req = makeReq()
    const out = applyRollbackRevocation(req, 'implementing', 'design', 100, HUMAN, commentId)
    expect(req.plan?.approvedAt).toBeUndefined()
    expect(req.plan?.approvedBy).toBeUndefined()
    expect(out.planApprovalRevoked).toBe(true)
  })

  it('目标就是拆分阶段 → 批准保留（改了计划才作废，那是 submit 的职责）', () => {
    const req = makeReq()
    const out = applyRollbackRevocation(req, 'implementing', 'decomposing', 100, HUMAN, commentId)
    expect(req.plan?.approvedAt).toBe(30)
    expect(out.planApprovalRevoked).toBe(false)
  })
})

describe('applyRollbackRevocation · 留痕与幂等（FR-3 ③）', () => {
  it('写入 rollback 留痕与一条 [回退] 评论', () => {
    const req = makeReq()
    applyRollbackRevocation(req, 'implementing', 'design', 100, HUMAN, commentId, '需求边界与真实意图不符')
    expect(req.rollback).toEqual({
      from: 'implementing', to: 'design', at: 100, by: HUMAN, reason: '需求边界与真实意图不符',
    })
    const comment = req.comments[req.comments.length - 1]!
    expect(comment.body).toContain('[回退] implementing → design')
    expect(comment.body).toContain('需求边界与真实意图不符')
    expect(comment.body).toContain('计划批准：已作废')
  })

  it('连续两次回退到同一目标：docSyncPending 无重复 source 条目', () => {
    const req = makeReq()
    applyRollbackRevocation(req, 'implementing', 'design', 100, HUMAN, commentId)
    applyRollbackRevocation(req, 'implementing', 'design', 200, HUMAN, commentId)

    const pending = docSyncPendingOf(req)
    expect(pending.length, '同源标记应被替换而不是叠加').toBe(1)
    expect(pending[0]!.source).toBe('plan') // 拆分计划被作废 ⇒ 下游按 plan 变更口径重算
    expect(pending[0]!.downstream).toEqual(['decomposition'])
  })

  it('目标就是拆分阶段时，待同步按需求文档口径（source=requirement）', () => {
    // to=decomposing：拆分阶段在**落点**而非下游 ⇒ 计划批准保留、source 取 'requirement'
    // （对比 to=design 的情形：拆分阶段在下游 ⇒ source='plan'）。
    const req = makeReq()
    applyRollbackRevocation(req, 'implementing', 'decomposing', 100, HUMAN, commentId)
    expect(docSyncPendingOf(req)[0]!.source).toBe('requirement')
  })

  it('无 artifacts 的存量需求不报错（读出即旧行为）', () => {
    const req = makeReq({ artifacts: undefined, plan: undefined })
    const out = applyRollbackRevocation(req, 'implementing', 'design', 100, HUMAN, commentId)
    expect(out.artifactsRevoked).toEqual([])
    expect(out.planApprovalRevoked).toBe(false)
    expect(req.rollback?.to).toBe('design')
  })
})
