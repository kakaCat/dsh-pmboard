/**
 * manual 段链行为（REQ-261003203909-55f2 FR-2 · TC-5/TC-6）——「这步归人」的显式停链形态。
 *
 * 钉住的设计契约（design/interfaces.md §4 / architecture.md §3）：
 *  ① 链选中 manual 子卡时**不派 workflow run**：清单骨架落盘 → 子卡 in_progress → 停链
 *     awaiting-manual（autoRun 不变、noopStreak 不计、不是失败）；
 *  ② 幂等：重复触发不重写清单（防覆盖人正在填的核对结果）；
 *  ③ 防伪造：凭证门对 manual 的新鲜度基准 = 骨架生成时间之后（manualSkeletonAt+1）——
 *     骨架落盘后一个字不改就汇报，过不了门；人核对后更新文件才放行。
 */
import { describe, it, expect } from 'vitest'
import { advanceRequirement } from '../src/application/use-cases/AdvanceChain.js'
import { assertDoneEvidence } from '../src/application/internal/support.js'
import { makeHarness, task, req } from './application/harness.js'

const CHECKLIST = 'docs/requirements/REQ-000001/manual/t-m.md'

async function harnessWithManualCard() {
  const h = makeHarness()
  h.clock.t = 1_700_000_000_000
  h.seedRequirementSync(req({ id: 'REQ-000001', status: 'implementing', category: 'feature', autoRun: true, createdAt: 1_699_999_900_000 }))
  h.seedTasks('REQ-000001', [
    task({
      id: 't-p', requirementId: 'REQ-000001', status: 'in_progress', title: '看板徽标改造',
      acceptance: '跑 npx vitest run tests/x.test.ts 全绿；浏览器核对看板徽标颜色与设计稿一致',
      createdAt: 1_699_999_900_001,
    }),
    task({
      id: 't-m', requirementId: 'REQ-000001', parentId: 't-p', stageKind: 'manual' as never,
      status: 'todo', title: '看板徽标改造·人工核对', dependsOn: [], createdAt: 1_699_999_900_002,
    }),
  ])
  await h.seedSettled()
  return h
}

describe('TC-5 manual 段：不派 run、落清单、停链等人', () => {
  it('选中 manual 子卡 → 清单落盘 + 子卡 in_progress + stopped=awaiting-manual（autoRun 不变）', async () => {
    const h = await harnessWithManualCard()
    const before = h.clock.t

    const out = await advanceRequirement(h.deps, 'REQ-000001')

    // ① 停链形态：等人不是失败、不是停摆
    expect(out.stopped).toBe('awaiting-manual')
    // ② 清单骨架落盘，含时间戳锚与拆分自父卡验收的核对项
    expect(h.docs.exists(CHECKLIST)).toBe(true)
    const body = h.docs.files.get(CHECKLIST)!.content
    expect(body).toContain('骨架生成时间')
    expect(body).toContain(String(before))
    expect(body).toContain('- [ ]')
    expect(body).toContain('浏览器核对看板徽标颜色')
    // ③ 子卡开工（in_progress + 执行记录 + 防伪造锚点）
    const sub = (await h.tasksOf('REQ-000001')).find((t) => t.id === 't-m')!
    expect(sub.status).toBe('in_progress')
    expect(sub.manualSkeletonAt).toBe(before)
    expect(sub.executions).toHaveLength(1)
    // ④ 需求侧：autoRun 不动、noopStreak 不计、留痕齐全
    const r = await h.store.get('REQ-000001')
    expect(r?.autoRun).toBe(true)
    expect(r?.advance?.noopStreak ?? 0).toBe(0)
    expect(r?.comments.some((c) => c.body.includes('[人工核对]') && c.body.includes(CHECKLIST))).toBe(true)
    expect(r?.advance?.history?.some((e) => e.event === 'AWAIT_MANUAL' && e.outcome === 'ok')).toBe(true)
  })

  it('幂等：等人期间重复推进 → 不重写清单、不重复开工、不判失败', async () => {
    const h = await harnessWithManualCard()
    await advanceRequirement(h.deps, 'REQ-000001')
    const firstContent = h.docs.files.get(CHECKLIST)!.content
    const firstMtime = h.docs.files.get(CHECKLIST)!.mtimeMs

    // 人在填清单（改动尚未完成）：再次推进（孤儿回收/重试都可能触发到这里）
    const out2 = await advanceRequirement(h.deps, 'REQ-000001')

    expect(out2.stopped === 'awaiting-manual' || out2.stopped === 'noop').toBe(true)
    expect(h.docs.files.get(CHECKLIST)!.content).toBe(firstContent) // 未被重写
    expect(h.docs.files.get(CHECKLIST)!.mtimeMs).toBe(firstMtime)
    const sub = (await h.tasksOf('REQ-000001')).find((t) => t.id === 't-m')!
    expect(sub.executions).toHaveLength(1) // 未重复开执行记录
    expect((await h.store.get('REQ-000001'))?.autoRun).toBe(true)
  })
})

describe('TC-6 manual 段防伪造：骨架不更新 → 凭证门拒', () => {
  async function seedAwaited() {
    const h = await harnessWithManualCard()
    await advanceRequirement(h.deps, 'REQ-000001') // 链停，骨架落盘（mtime = clock.t）
    // 模拟窗口 agent 汇报（filesChanged 指向清单）
    await h.mutateTask('t-m', (t) => {
      t.lastReport = { at: h.clock.t, reportIndex: 1, filesChanged: [CHECKLIST], completed: ['已生成核对清单'] }
    })
    return h
  }

  it('骨架落盘后一个字不改就汇报 → 拒（mtime 未晚于骨架生成时间）', async () => {
    const h = await seedAwaited()
    const tasks = await h.tasksOf('REQ-000001')
    const sub = tasks.find((t) => t.id === 't-m')!
    expect(() =>
      assertDoneEvidence(h.deps, 'session-w-001', sub, 1_699_999_900_000, tasks),
    ).toThrow(/REQBOARD_SUBTASK_GATE/)
  })

  it('人核对后更新清单（mtime 晚于骨架）→ 放行', async () => {
    const h = await seedAwaited()
    h.clock.t += 60_000 // 人核对花了一分钟
    h.docs.put(CHECKLIST, h.docs.files.get(CHECKLIST)!.content + '\n## 核对结论\n全部通过（真人核对）。\n')
    const tasks = await h.tasksOf('REQ-000001')
    const sub = tasks.find((t) => t.id === 't-m')!
    expect(() =>
      assertDoneEvidence(h.deps, 'session-w-001', sub, 1_699_999_900_000, tasks),
    ).not.toThrow()
  })

  it('非 manual 子卡不受收紧影响（基准仍是链出身，旧行为不变）', async () => {
    const h = await harnessWithManualCard()
    const createdAt = 1_699_999_900_000
    const devSub = task({
      id: 't-d', requirementId: 'REQ-000001', parentId: 't-p', stageKind: 'dev' as never,
      status: 'in_progress', title: '研发', createdAt: createdAt + 2,
    })
    await h.addTasks('REQ-000001', [devSub])
    // 文件 mtime ≥ 链出身即可（无 manualSkeletonAt 收紧）
    h.docs.put('src/x.ts', 'code', createdAt + 3)
    await h.mutateTask('t-d', (t) => {
      t.lastReport = { at: h.clock.t, reportIndex: 1, filesChanged: ['src/x.ts'], completed: ['改完'] }
    })
    const tasks = await h.tasksOf('REQ-000001')
    const sub = tasks.find((t) => t.id === 't-d')!
    expect(() =>
      assertDoneEvidence(h.deps, 'session-w-001', sub, createdAt, tasks),
    ).not.toThrow()
  })
})
