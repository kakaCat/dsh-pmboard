/**
 * FR-11 路线 A：executeSubtask 的**团队分支**用例（executeSubtaskTeam）。
 *
 * 口径：团队服务可用且 caller 是 live agent → 派给 Worker；Worker 经 reqboard_task_report
 * 写台账，链把产出读回来合成同款形状 → 下游（解析/落账/凭证门）逐字复用。
 *
 * 2026-10-11（退役 workflow 引擎 / `pm-workflow` 删包）：**团队是唯一执行面**——
 * 原先"服务不可用 → 退回 workflow 兼容路径"的两条用例改成"服务不可用 / 无 caller → 如实拒绝、
 * 一张卡都不派"；假件统一用 `tests/application/teams-fake.js`。
 */
import { describe, it, expect } from 'vitest'
import { executeSubtask } from 'pm-core/application/use-cases/ExecuteTask.js'
import { makeHarness, task, req, type Harness } from 'tests/application/harness.js'
import { installTeamProducer, installTeamUnavailable } from 'tests/application/teams-fake.js'

const SRC = 'packages/pages/dsh-pmboard/src/domain/task/TaskStatus.ts'
/** pages 源改动会触发构建新鲜度分支 → 必须同时放构建产物。 */
const CLIENT = 'packages/pages/dsh-pmboard/lib/client.js'

function seed(): Harness {
  const h = makeHarness()
  h.seedRequirementSync(req({ id: 'REQ-000001', status: 'implementing' }))
  h.seedTasks('REQ-000001', [
    task({ id: 't-p', requirementId: 'REQ-000001', status: 'in_progress', title: '父卡' }),
    task({ id: 't-s', requirementId: 'REQ-000001', status: 'todo', parentId: 't-p', stageKind: 'dev' as never, title: '研发', acceptance: '改动落盘并跑通测试' }),
  ])
  return h
}
const exec = { agent: { id: 'session-w-001' } }

describe('团队分支：executeSubtask 走 Agent Teams', () => {
  it('团队可用 + live agent → 派 Worker → 读回台账产出 → 子卡 done', async () => {
    const h = seed()
    await h.seedSettled()
    h.docs.put(SRC, 'x', h.clock.t)
    h.docs.put(CLIENT, 'x', h.clock.t)
    const teams = installTeamProducer(h, { filesChanged: [SRC], completed: ['改完'] })

    const r = await executeSubtask(h.deps, { subtaskId: 't-s', windowKey: 'session-w-001', exec })

    expect(r.ok).toBe(true)
    const t = (await h.tasksOf('REQ-000001')).find((x) => x.id === 't-s')!
    expect(t.status).toBe('done')
    expect(t.teamTaskId).toBe('tt-1')                 // team task ↔ 子卡 的持久映射
    expect(teams.spawns).toHaveLength(1)              // 起了一次 Worker
    expect(teams.spawns[0]!.name).toBe('reqboard-t-p')// 名字 = 幂等键
    expect(teams.created).toHaveLength(1)
    expect(teams.created[0]!.description).toContain('t-s')          // 必须带台账子卡 id，否则 Worker 写不回来
    expect(teams.created[0]!.description.startsWith('[reqboard:parent=t-p]')).toBe(true)  // 一个父卡 = 一个团队
    expect(teams.spawns[0]!.prompt).toContain('[reqboard:parent=t-p]')                    // Worker 只认本队
  })

  it('父卡 = 一个团队：派第 N 张卡时一次性建全队任务并串 blockedBy（原生 DAG，DSH 自动算 ready）', async () => {
    const h = makeHarness()
    h.seedRequirementSync(req({ id: 'REQ-000001', status: 'implementing' }))
    h.seedTasks('REQ-000001', [
      task({ id: 't-p', requirementId: 'REQ-000001', status: 'in_progress', title: '父卡' }),
      task({ id: 't-1', requirementId: 'REQ-000001', status: 'done', parentId: 't-p', stageKind: 'dev' as never, title: '研发' }),
      task({ id: 't-2', requirementId: 'REQ-000001', status: 'todo', parentId: 't-p', stageKind: 'review' as never, title: '复核' }),
      task({ id: 't-3', requirementId: 'REQ-000001', status: 'todo', parentId: 't-p', stageKind: 'test' as never, title: '测试' }),
    ])
    h.docs.put(SRC, 'x', h.clock.t)
    h.docs.put(CLIENT, 'x', h.clock.t)
    const teams = installTeamProducer(h, (subtaskId) =>
      subtaskId === 't-2' ? { filesChanged: [], completed: ['复核完毕：无偏离'] } : undefined)

    const r = await executeSubtask(h.deps, { subtaskId: 't-2', windowKey: 'session-w-001', exec })

    expect(r.ok).toBe(true)
    // 只建未收口的 2 张（t-1 已 done → 不重放回板上），链序 = [review, test]
    expect(teams.created.map((c) => c.subject)).toEqual(['[review] 复核', '[test] 测试'])
    expect(teams.created[0]!.blockedBy).toBeUndefined()      // 队首无前置
    expect(teams.created[1]!.blockedBy).toEqual(['tt-1'])    // test blockedBy review → 原生 DAG
    expect((await h.tasksOf('REQ-000001')).find((x) => x.id === 't-2')!.teamTaskId).toBe('tt-1')
    expect((await h.tasksOf('REQ-000001')).find((x) => x.id === 't-3')!.teamTaskId).toBe('tt-2')
    // review 属结论族：无 diff 但有结论 → L2 放行（与 D17 修复咬合）
    expect((await h.tasksOf('REQ-000001')).find((x) => x.id === 't-2')!.status).toBe('done')
  })

  it('团队服务 available()=false → 不派卡，如实拒绝（引擎路径已退役）', async () => {
    const h = seed()
    await h.seedSettled()
    h.docs.put(SRC, 'x', h.clock.t)
    const teams = installTeamUnavailable(h)

    const r = await executeSubtask(h.deps, { subtaskId: 't-s', windowKey: 'session-w-001' })

    expect(r.ok).toBe(false)
    expect(String(r.reason)).toContain('engine_unavailable')   // 码不变：失败分类器按它归类
    expect(teams.created).toHaveLength(0)
  })

  it('无 caller（system 驱动）→ 不派卡，如实拒绝', async () => {
    const h = seed()
    await h.seedSettled()
    h.docs.put(SRC, 'x', h.clock.t)
    const teams = installTeamProducer(h, { filesChanged: [SRC], completed: ['改完'] })

    const r = await executeSubtask(h.deps, { subtaskId: 't-s', windowKey: 'system' })   // 无 exec.agent

    expect(r.ok).toBe(false)
    expect(String(r.reason)).toContain('engine_unavailable')
    expect(teams.created).toHaveLength(0)
  })

  it('Worker 没写台账 → team_report_missing（不得合成"格式合法的空产出"，否则结论族假通过）', async () => {
    const h = seed()
    await h.seedSettled()
    h.docs.put(SRC, 'x', h.clock.t)
    h.docs.put(CLIENT, 'x', h.clock.t)
    // Worker 把任务 complete 了，但**没有**调 reqboard_task_report（策略 = 什么都不写）
    installTeamProducer(h, undefined)

    const r = await executeSubtask(h.deps, { subtaskId: 't-s', windowKey: 'session-w-001', exec })

    expect(r.ok).toBe(false)
    expect(r.reason).toContain('team_report_missing')
    expect((await h.tasksOf('REQ-000001')).find((x) => x.id === 't-s')!.status).not.toBe('done')
  })

  it('台账报告早于本次派发（历史报告）→ team_report_stale（不让早前交付侥幸通过）', async () => {
    const h = seed()
    await h.seedSettled()
    h.docs.put(SRC, 'x', h.clock.t)
    h.docs.put(CLIENT, 'x', h.clock.t)
    // 预置一份"早前直接执行"留下的历史报告（t-c42bc0 真实事故的同款）
    await h.setTaskFields('t-s', { lastReport: {
      at: h.clock.t - 10_000, reportIndex: 1, filesChanged: [SRC], completed: ['早前交付'],
    } })
    installTeamProducer(h, undefined)   // 本次 Worker 没再写

    const r = await executeSubtask(h.deps, { subtaskId: 't-s', windowKey: 'session-w-001', exec })

    expect(r.ok).toBe(false)
    expect(r.reason).toContain('team_report_stale')
    expect((await h.tasksOf('REQ-000001')).find((x) => x.id === 't-s')!.status).not.toBe('done')
  })

  it('凭证门拒绝 → 团队任务被 reopen（堵住"completed 空转"死循环）', async () => {
    const h = seed()
    await h.seedSettled()
    h.docs.put(SRC, 'x', h.clock.t)
    h.docs.put(CLIENT, 'x', h.clock.t)
    // Worker 对 dev（写入族）报了空 filesChanged → L2 判"没落盘" → 门拒
    const teams = installTeamProducer(h, { filesChanged: [], completed: ['我做完了'] })

    const r = await executeSubtask(h.deps, { subtaskId: 't-s', windowKey: 'session-w-001', exec })

    expect(r.ok).toBe(false)
    expect((await h.tasksOf('REQ-000001')).find((x) => x.id === 't-s')!.status).not.toBe('done')
    expect(teams.updates.map((u) => u.action)).toContain('reopen')   // ← 不放回板上就死循环
  })

  it('团队建任务抛错 → 子卡不 done（失败要响亮，不静默成功）', async () => {
    const h = seed()
    await h.seedSettled()
    h.docs.put(SRC, 'x', h.clock.t)
    const teams = installTeamProducer(h, { filesChanged: [SRC], completed: ['改完'] })
    teams.failCreate = true

    const r = await executeSubtask(h.deps, { subtaskId: 't-s', windowKey: 'session-w-001', exec })

    expect(r.ok).toBe(false)
    expect(r.reason).toContain('DSH_TEAMS_UNAVAILABLE')
    expect((await h.tasksOf('REQ-000001')).find((x) => x.id === 't-s')!.status).not.toBe('done')
  })
})
