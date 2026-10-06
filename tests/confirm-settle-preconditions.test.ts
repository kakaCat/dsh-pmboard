/**
 * 落章两前提：被取代 / 已推进的作答不得改台账（REQ-261006164732-6503 t6 · serves: FR-4, FR-5）。
 *
 * 现场（拆分门事故）：门 A 被取代后，人 2.5 秒后又点了它，那次作答仍走完整落章路径，
 * 把 `plan.approvedAt` 从 16:42:10.890 覆写成 16:42:13.402、审批证据原文换成门 A 的题干——
 * **审计链上的"谁在何时批准了什么"就此失真**。
 *
 * 本文件直接打**唯一落章实现** `applyConfirmDecision`（三条作答通道的收敛点），钉两件事：
 * ① 已落章的交接再走一次 ⇒ 时间戳与证据原文**逐字节不变**（首写即事实）；
 * ② 需求已离开该门的来源阶段时作答 ⇒ 台账零新时间戳，只多一条评论、回执 confirmed:false。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeTestStore } from './application/harness.js'
import { taskStoreAt } from './queue/route-deps.js'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { RandomIdFactory } from '../src/adapters/RandomIdFactory.js'
import { SessionProbeAdapter } from '../src/adapters/SessionProbeAdapter.js'
import { applyConfirmDecision, gateTransitionOf } from '../src/application/internal/confirm-settle.js'
import { UserQuestionsAdapter } from '../src/adapters/UserQuestionsAdapter.js'
import { defineAskConfirmTool } from '../src/tools/index.js'
import type { UseCaseDeps } from '../src/application/ports.js'
import type { RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

const W = 'session-t6-settle'
const REQ = 'REQ-t6settle'

let dir: string
let store: ReturnType<typeof makeTestStore>
let deps: UseCaseDeps

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-t6-'))
  store = makeTestStore()
  deps = {
    store,
    // 落章后的 RTM 同步要读任务（confirm-settle → taskStoreOf）
    taskStore: taskStoreAt(dir),
    docs: new FileDocRepository({ workspaceRoot: dir }),
    clock: { now: () => 1000 },
    ids: new RandomIdFactory(),
    session: new SessionProbeAdapter({}),
  } as unknown as UseCaseDeps
})

afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

async function seed(r: RequirementRecord): Promise<void> {
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

const baseRec = (over: Partial<RequirementRecord>): RequirementRecord => ({
  id: REQ, title: '落章前提', description: '', status: 'implementing', blocked: false,
  sourceSessionId: W, comments: [], version: 2, createdAt: 1, updatedAt: 2,
  createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
  ...over,
} as unknown as RequirementRecord)

describe('落章前提（FR-4 / FR-5）', () => {
  it('已批准且已推进到实施 ⇒ 再作答按迟到处理：时间戳与证据原文逐字节不变，只多一条留痕', async () => {
    await seed(baseRec({
      status: 'implementing',
      plan: {
        path: 'docs/requirements/' + REQ + '/decomposition.md', summary: 'x', tasks: [], submittedAt: 1,
        approvedAt: 9, approvedBy: { kind: 'human', sessionId: W }, approvedVia: 'session', approvedEvidence: '第一次批准的原话',
      },
    } as unknown as Partial<RequirementRecord>))
    const before = store.peek(REQ)!
    const commentsBefore = before.comments.length

    const out = await applyConfirmDecision(deps, {}, {
      requirementId: REQ, windowKey: W, target: 'plan', kind: 'decomposition',
      question: '拆分计划已提交，请批准', picked: '确认，推进到下一阶段 (Recommended)', nowTs: 999, advance: true,
    })

    expect(out.stale?.reason).toContain('该门守的迁移已经发生过')
    expect(out.note).toContain('不改变状态')
    const after = store.peek(REQ)!
    expect(after.plan?.approvedAt).toBe(9)                    // 首写即事实
    expect(after.plan?.approvedEvidence).toBe('第一次批准的原话')
    expect(after.comments.length).toBe(commentsBefore + 1)    // 只留痕
  })

  it('需求已离开该门的来源阶段 ⇒ 零新时间戳（产物不落章），只多一条留痕', async () => {
    await seed(baseRec({
      status: 'decomposing',   // design 门的来源阶段是 design ⇒ 已离开
      artifacts: [{
        stage: 'design', kind: 'design',
        path: 'docs/requirements/' + REQ + '/design/architecture.md', registeredAt: 1,
      } as StageArtifact],
    }))
    const commentsBefore = store.peek(REQ)!.comments.length

    const out = await applyConfirmDecision(deps, {}, {
      requirementId: REQ, windowKey: W, target: 'artifact', kind: 'design',
      question: '设计文档已提交，请确认', picked: '确认，推进到下一阶段 (Recommended)', nowTs: 999, advance: true,
    })

    expect(out.stale?.reason).toContain('已推进到 decomposing')
    const after = store.peek(REQ)!
    expect(after.artifacts?.find(a => a.kind === 'design')?.confirmedAt).toBeUndefined()
    expect(after.status).toBe('decomposing')                  // 状态未被推走
    expect(after.comments.length).toBe(commentsBefore + 1)
    expect(after.comments[after.comments.length - 1]?.body).toContain('迟到作答未生效')
  })

  it('部分落章：已盖过的产物不被改写，未盖的补上（首写即事实的承重面）', async () => {
    // 为什么单列这条：前提检查只拦「整门已落章」；门里**部分**产物已盖过时前提照样通过，
    // 这时挡在覆写前面的只有「首写不变」。删掉它，这条必红（演练记录见 t10）。
    await seed(baseRec({
      status: 'design',
      artifacts: [
        {
          stage: 'design', kind: 'design', path: 'docs/requirements/' + REQ + '/design/architecture.md',
          registeredAt: 1, confirmedAt: 9, confirmedBy: { kind: 'human' }, confirmedVia: 'session',
          confirmedEvidence: '第一次的原话',
        },
        {
          stage: 'design', kind: 'design', path: 'docs/requirements/' + REQ + '/design/data-model.md',
          registeredAt: 1,
        },
      ] as StageArtifact[],
    }))

    const out = await applyConfirmDecision(deps, {}, {
      requirementId: REQ, windowKey: W, target: 'artifact', kind: 'design',
      question: '设计文档已提交，请确认', picked: '确认，推进到下一阶段 (Recommended)', nowTs: 999, advance: false,
    })

    expect(out.stale).toBeUndefined()          // 门没整门落章 ⇒ 前提通过，正常走落章
    const arts = store.peek(REQ)!.artifacts!.filter(a => a.kind === 'design')
    const stamped = arts.find(a => a.path.endsWith('architecture.md'))!
    const fresh = arts.find(a => a.path.endsWith('data-model.md'))!
    expect(stamped.confirmedAt).toBe(9)                    // 已盖过：时间戳不动
    expect(stamped.confirmedEvidence).toBe('第一次的原话')  // 证据原文不动
    expect(fresh.confirmedAt).toBe(999)                    // 没盖过的补上
  })

  it('门守的迁移由门值域反查（不另写映射表）：四类门各归其位', () => {
    expect(gateTransitionOf('requirement')).toEqual({ from: 'brainstorming', to: 'design' })
    expect(gateTransitionOf('design')).toEqual({ from: 'design', to: 'decomposing' })
    expect(gateTransitionOf('decomposition')).toEqual({ from: 'decomposing', to: 'implementing' })
    expect(gateTransitionOf('verification')).toEqual({ from: 'accepting', to: 'archived' })
    expect(gateTransitionOf('prototype')).toBeUndefined()   // 不是门 ⇒ 不判迁移
  })

  it('经 ask_confirm 通道作答：回执 confirmed:false（不谎报已确认）', async () => {
    await seed(baseRec({
      status: 'decomposing',
      artifacts: [{
        stage: 'design', kind: 'design',
        path: 'docs/requirements/' + REQ + '/design/architecture.md', registeredAt: 1,
      } as StageArtifact],
    }))
    const depsWithAsk = {
      ...deps,
      questions: new UserQuestionsAdapter(() => ({
        ask: async () => ({ answers: [{ id: 'confirm', selected: ['确认，推进到下一阶段 (Recommended)'] }] }),
      })),
    } as unknown as UseCaseDeps
    const tool = defineAskConfirmTool(depsWithAsk) as unknown as { execute: (a: unknown, e: unknown) => Promise<Record<string, unknown>> }

    const out = await tool.execute(
      { target: 'artifact', kind: 'design', question: '设计文档已提交，请确认' },
      { agent: { id: W } },
    )
    expect(out.confirmed).toBe(false)
    expect(out.advanced).toBe(false)
    expect(String(out.note)).toContain('不改变状态')
    expect(store.peek(REQ)?.artifacts?.find(a => a.kind === 'design')?.confirmedAt).toBeUndefined()
  })

  it('门合并块（章已落 + 迁移未发生）⇒ decomposition 产物不被覆写、不再重复写门合并评论', async () => {
    // 独立复核的**阻断-1**：补推进路径上，门合并块原本无条件赋值——
    // 迟到作答会在那里把 decomposition 产物的 confirmedAt 与证据原文覆写（事故形态从 plan 挪到这里）。
    await seed(baseRec({
      status: 'decomposing',
      plan: {
        path: 'docs/requirements/' + REQ + '/decomposition.md', summary: 'x', tasks: [], submittedAt: 1,
        approvedAt: 9, approvedBy: { kind: 'human', sessionId: W }, approvedVia: 'session', approvedEvidence: '第一次批准的原话',
      },
      artifacts: [
        {
          stage: 'decomposing', kind: 'decomposition',
          path: 'docs/requirements/' + REQ + '/decomposition.md', registeredAt: 1,
          confirmedAt: 9, confirmedBy: { kind: 'human' }, confirmedVia: 'session', confirmedEvidence: '第一次落章的原文',
        } as StageArtifact,
      ],
    } as unknown as Partial<RequirementRecord>))

    const out = await applyConfirmDecision(deps, {}, {
      requirementId: REQ, windowKey: W, target: 'plan', kind: 'decomposition',
      question: '拆分计划已提交，请批准（迟到的第二个框）', picked: '确认，推进到下一阶段 (Recommended)', nowTs: 999, advance: true,
    })

    expect(out.stale).toBeUndefined()                       // 迁移未发生 ⇒ 不是迟到（补推进路径保留）
    const after = store.peek(REQ)!
    const art = after.artifacts?.find(a => a.kind === 'decomposition')!
    expect(art.confirmedAt).toBe(9)                          // 首写即事实
    expect(art.confirmedEvidence).toBe('第一次落章的原文')
    expect(after.plan?.approvedAt).toBe(9)
    expect(after.plan?.approvedEvidence).toBe('第一次批准的原话')
    expect(after.comments.map(c => c.body).join('\n'))
      .not.toContain('[门合并] 批准拆分计划：decomposition 产物自动落章')
  })
})
