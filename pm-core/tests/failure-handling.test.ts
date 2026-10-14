/**
 * 失败暂停、告警与返工测试（REQ-4842fe t8）——对应 design/test-cases.md §5。
 *
 * 口径：失败不自动重试；子卡退回 + attempt+1 + revisions(rollback)；autoRun=false；
 * 高优告警发出；弹框三选各自生效；退上游重批准后卡数不变且有 revisions(update)；
 * 自动链不产生 done→in_progress。
 *
 * 2026-10-11 退役 workflow 引擎：失败注入点由 `FlakyRunner(failOn)` 换成团队口径
 * ——「第 N 次派发的 Worker 不写台账」（见 `installFlakyTeam`）。链的失败原因因此是
 * `team_report_missing`（引擎时代的 `'error: child failed'` 不再出现），其余读数不变。
 */
import { describe, it, expect } from 'vitest'
import { advanceRequirement } from 'pm-core/application/use-cases/AdvanceChain.js'
import { openFailurePopup, handleFailureChoice, FAILURE_CHOICE_LABELS } from 'pm-core/application/use-cases/HandleFailure.js'
import { applyReworkUpdate } from 'pm-core/application/internal/rework-update.js'
import { planTask } from 'tests/helpers/plan-task.js'
import type { FailureAlertPort } from 'pm-core/application/ports.js'
import type { TaskRecord } from 'pm-core/protocol-domain.js'
import { makeHarness, task, req } from 'tests/application/harness.js'
import { installTeamProducer } from 'tests/application/teams-fake.js'

const FILE = 'pm-core/src/domain/x.ts'
/**
 * 绑定窗口的 live agent 读数（`deps.agents`）：团队派发要求「caller 是 live agent」。
 * 生产里由组合根装配；这里等价装配一次，使**不带 exec 的入口**（如 `handleFailureChoice`
 * 内部那次 `advanceRequirement`）也能解到句柄——否则链会如实拒绝（engine_unavailable）。
 */
function wireLiveWindow(h: ReturnType<typeof makeHarness>): void {
  h.deps.agents = () => ({ get: (id: string) => (id === 'session-w-001' ? { id: 'session-w-001' } : undefined) })
}

/**
 * 引擎时代的 `FlakyRunner(failOn)` 的**团队等价物**：第 `failOn` 次派发的 Worker 不写台账
 * （`produce` 返回 undefined ⇒ 假件一个字节都不写 = 那次执行失败）。
 * 其余派发写一条「有落盘文件」的正常产出。
 */
function installFlakyTeam(h: ReturnType<typeof makeHarness>, failOn: number): void {
  let calls = 0
  installTeamProducer(h, () => {
    calls += 1
    if (calls === failOn) return undefined
    return { filesChanged: [FILE], completed: ['子卡完成'] }
  })
}

async function seed() {
  const h = makeHarness()
  h.docs.put(FILE, 'x')
  // B12 阶段②e：播种进新端口
  h.seedRequirementSync(req({ id: 'REQ-000001', status: 'implementing', category: 'feature', autoRun: true, sourceSessionId: 'session-w-001' }))
  h.seedTasks('REQ-000001', [task({ id: 't-p', requirementId: 'REQ-000001', status: 'todo', title: '父卡' })])
  const alerts: Array<{ requirementId: string; title: string; content: string }> = []
  const port: FailureAlertPort = { alert: (i) => { alerts.push(i) } }
  h.deps.alert = port
  wireLiveWindow(h)
  await h.seedSettled()
  return { h, alerts }
}

describe('失败暂停与回退（5.1/5.2/5.5）', () => {
  it('子卡失败 → 退回 todo + attempt+1 + revisions(rollback) + 失败评论；autoRun=false；高优告警发出', async () => {
    const { h, alerts } = await seed()
    installFlakyTeam(h, 2)
    const out = await advanceRequirement(h.deps, 'REQ-000001')
    expect(out.stopped).toBe('paused')
    const rolled = (await h.tasksOf('REQ-000001')).find(t => t.parentId === 't-p' && (t.attempt ?? 0) > 0)!
    expect(rolled).toBeDefined()
    expect(rolled.status).toBe('todo')
    expect(rolled.attempt).toBe(1)
    expect(rolled.revisions?.map(r => r.kind)).toEqual(['rollback'])
    expect(rolled.revisions?.[0]?.changes.join(' ')).toContain('attempt: 0→1')
    expect(rolled.comments.some(c => c.body.includes('子卡失败'))).toBe(true)
    // 防空转锚：这次失败确实来自团队口径的「Worker 没写台账」（引擎时代是 'error: child failed'）
    expect(String(rolled.lastRun?.stopReason)).toContain('team_report_missing')
    expect((await h.store.get('REQ-000001'))!.autoRun).toBe(false)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]!.title).toContain('实施链暂停')
    expect(alerts[0]!.content).toContain('重跑该卡')
  })

  it('5.2 不自动重试：失败后再次触发不产生新 run（autoRun=false）', async () => {
    const { h } = await seed()
    installFlakyTeam(h, 2)
    await advanceRequirement(h.deps, 'REQ-000001')
    const attemptsAfterFail = (await h.tasksOf('REQ-000001')).filter(t => (t.attempt ?? 0) > 0).length
    const again = await advanceRequirement(h.deps, 'REQ-000001')
    expect(again.stopped).toBe('not_autorun')
    // 引擎时代读的是 runner.calls；团队路径等价读数是「没有新的一次派发」（attempt 不改写 = 没重跑）
    expect((await h.tasksOf('REQ-000001')).filter(t => (t.attempt ?? 0) > 0).length).toBe(attemptsAfterFail)
  })

  it('5.6 自动链不产生 done→in_progress 转移', async () => {
    const { h } = await seed()
    installFlakyTeam(h, -1)
    await advanceRequirement(h.deps, 'REQ-000001')
    for (const t of await h.tasksOf('REQ-000001')) {
      const hist = (t.statusHistory ?? []).map(x => x.status)
      const di = hist.indexOf('done')
      expect(di === -1 || !hist.slice(di + 1).includes('in_progress'), t.id).toBe(true)
    }
  })
})

describe('处置弹框三选（5.3）', () => {
  it('openFailurePopup 返回人工选择（重跑/退回上游/取消）', async () => {
    const { h } = await seed()
    installFlakyTeam(h, 2)
    expect(FAILURE_CHOICE_LABELS.rerun).toBe('重跑该卡')
    h.questions.answers = [{ selected: [FAILURE_CHOICE_LABELS.upstream] }]
    const choice = await openFailurePopup(h.deps, 'REQ-000001')
    expect(choice).toBe('upstream')
    expect(h.questions.asked[0]?.options?.map(o => o.label)).toContain(FAILURE_CHOICE_LABELS.cancel)
  })

  it('选「重跑该卡」→ autoRun 开启并继续推进', async () => {
    const { h } = await seed()
    installFlakyTeam(h, 2)
    await advanceRequirement(h.deps, 'REQ-000001')
    expect((await h.store.get('REQ-000001'))!.autoRun).toBe(false)
    const r = await handleFailureChoice(h.deps, 'REQ-000001', 'rerun')
    expect(r.ok).toBe(true)
    expect((await h.store.get('REQ-000001'))!.status).toBe('accepting')
  })

  it('选「退回上游」→ 需求回 design（人工门）', async () => {
    const { h } = await seed()
    installFlakyTeam(h, 2)
    await advanceRequirement(h.deps, 'REQ-000001')
    const r = await handleFailureChoice(h.deps, 'REQ-000001', 'upstream')
    expect(r.ok).toBe(true)
    expect((await h.store.get('REQ-000001'))!.status).toBe('design')
  })

  it('选「取消」→ 需求 canceled', async () => {
    const { h } = await seed()
    installFlakyTeam(h, 2)
    await advanceRequirement(h.deps, 'REQ-000001')
    const r = await handleFailureChoice(h.deps, 'REQ-000001', 'cancel')
    expect(r.ok).toBe(true)
    expect((await h.store.get('REQ-000001'))!.status).toBe('canceled')
  })
})

describe('返工就地更新（5.4/5.5）', () => {
  it('重批准计划后：卡数不变、受影响父卡字段被更新且有 revisions(update)', async () => {
    const h = makeHarness()
    // B12 阶段⑤族 B：播种进新端口
    h.seedRequirementSync(req({ id: 'REQ-000001', status: 'design', category: 'feature' }))
    await h.seedSettled()
    await h.setTasks('REQ-000001', [
      task({ id: 't-p', requirementId: 'REQ-000001', title: '父卡', acceptance: '旧验收', description: '旧描述', status: 'in_progress' }),
    ])
    const before = (await h.tasksOf('REQ-000001')).length
    // C-1（D4 签名裂变）：`applyReworkUpdate(tasks, requirementId, planTasks, now)` —— 就地改**队列任务**
    // 并返回被更新的卡；调用方（本用例模拟生产写路径）在 `taskStore.mutate` 回调内 `return tasks` 落盘。
    let updated: TaskRecord[] = []
    await h.taskStore.mutate('REQ-000001', (tasks) => {
      updated = applyReworkUpdate(tasks, 'REQ-000001', [
        planTask({ key: 't1', title: '父卡', acceptance: '新验收（可跑：vitest 绿）', description: '新描述', implementation: '改 y.ts', phase: 'implement', side: 'backend' }),
      ], h.clock.t)
      return tasks
    })
    const after = await h.tasksOf('REQ-000001')
    expect(after.length).toBe(before)
    expect(updated).toHaveLength(1)
    const card = after[0]!
    expect(card.acceptance).toBe('新验收（可跑：vitest 绿）')
    expect(card.revisions?.map(r => r.kind)).toEqual(['update'])
    expect(card.revisions?.[0]?.changes).toContain('acceptance')
  })
})
