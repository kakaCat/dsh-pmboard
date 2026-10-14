// serves: FR-10, FR-11
/**
 * 子卡执行面开工预检（REQ-261004065652-5c1c · t7 / TC-11）。
 *
 * ## 复现的现场
 *
 * 2026-10-03：本 profile 的 agent preset 用 `isolate: { workflowEngine: true }` 把引擎圈在 agent
 * 作用域，profile 级插件**永远取不到**——实测同一条需求连挂 4 次，每次都得到一句无法行动的原因
 * （`subtask_engine_unreachable`），诱使操作者反复重试；另一条需求的 10 张父卡最终只有 1 张落了子卡。
 *
 * ## 本文件钉住三件事
 *
 * ① **开工前**预检：不可达 → `stopped='engine_unreachable'`、**本次未落任何子卡**、回话含两条出路；
 * ② **幂等短路**：连续推进 3 次只有第 1 次写台账，后两次**零写入**（revision 不变）；
 * ③ **不误伤**：执行面缺省（未装配 teams）或明确可用时，行为与改动前逐字一致（照常落子卡、照常跑）。
 *
 * ## 判据（2026-10-11 退役 workflow 引擎时换的口径）
 *
 * 原判据 = 引擎探针 `deps.workflow.reachable?.()`。引擎适配器与其端口一并删除后**只剩团队一条
 * 执行面**，判据随之改为 `deps.teams.available()`：缺席（未装配）= 未知 → **不设门槛**
 * （与旧探针「缺省按可达处理」同款纪律，保持行为不变）；**明确不可用**才拦。
 * 事故出处不变——病灶是"环境前提不满足却让人反复重试"，与判据取自哪个执行面无关。
 */
import { describe, it, expect } from 'vitest'
import { advanceRequirement, ENGINE_UNREACHABLE_MARK } from 'pm-core/application/use-cases/AdvanceChain.js'
import { installTeamProducer, installTeamUnavailable } from 'tests/application/teams-fake.js'
import { makeHarness, task, req } from 'tests/application/harness.js'

/** 自动链的调用方句柄：工具入口自带 exec.agent（团队派发要求 caller 是 live agent）。 */
const EXEC = { agent: { id: 'session-w-001' } }

/** 一条 implementing + autoRun 的需求，带一张待开工的父卡（开工后会懒展开子卡）。 */
async function seed() {
  const h = makeHarness()
  h.seedRequirementSync(req({ id: 'REQ-000001', status: 'implementing', category: 'feature', autoRun: true }))
  h.seedTasks('REQ-000001', [
    task({ id: 't-p1', requirementId: 'REQ-000001', status: 'todo', title: '父卡', scope: { apis: [], tables: [], files: [] } }),
  ])
  await h.seedSettled()
  return h
}

const childCount = async (h: Awaited<ReturnType<typeof seed>>): Promise<number> =>
  (await h.taskStore.listByRequirement('REQ-000001')).filter((t) => t.parentId !== undefined).length

describe('TC-11 · 不可达 → 开工前拦下、不落假子卡', () => {
  it('第一次推进：stopped=engine_unreachable、回话含「本次未落任何子卡」与两条出路、父卡未开工', async () => {
    const h = await seed()
    installTeamUnavailable(h)

    const out = await advanceRequirement(h.deps, 'REQ-000001', EXEC)

    expect(out.stopped).toBe('engine_unreachable')
    const detail = out.steps.map((s) => s.detail).join('\n')
    expect(detail).toContain('子卡执行面不可用')
    expect(detail).toContain('本次未落任何子卡')
    expect(detail).toContain('reqboard_task_report')
    // 旧文案「重试无解」随引擎退役改写成本条；这里钉的仍是"回话必须给出可行动的出路"这一条。
    expect(detail).toContain('两条出路')
    // 父卡仍是 todo（**没有假装开工**），也没有落任何子卡
    const parent = (await h.taskStore.listByRequirement('REQ-000001')).find((t) => t.id === 't-p1')
    expect(parent?.status).toBe('todo')
    expect(await childCount(h)).toBe(0)
  })

  it('连续推进 3 次：只有第 1 次写台账，后两次 revision 不变（幂等短路）', async () => {
    const h = await seed()
    installTeamUnavailable(h)

    const first = await advanceRequirement(h.deps, 'REQ-000001', EXEC)
    expect(first.stopped).toBe('engine_unreachable')
    const rev1 = (await h.store.head()).revision
    const historyAfterFirst = ((await h.store.get('REQ-000001'))?.advance?.history ?? []).filter((r) => r.detail.includes(ENGINE_UNREACHABLE_MARK))
    expect(historyAfterFirst, '第 1 次如实记一条').toHaveLength(1)

    const second = await advanceRequirement(h.deps, 'REQ-000001', EXEC)
    const third = await advanceRequirement(h.deps, 'REQ-000001', EXEC)
    expect(second.stopped).toBe('engine_unreachable')
    expect(third.stopped).toBe('engine_unreachable')
    expect((await h.store.head()).revision, '短路必须零写入').toBe(rev1)
    const historyNow = ((await h.store.get('REQ-000001'))?.advance?.history ?? []).filter((r) => r.detail.includes(ENGINE_UNREACHABLE_MARK))
    expect(historyNow, '后两次不该再刷历史').toHaveLength(1)
    // 回话仍然如实（不是静默）
    expect(second.steps.map((s) => s.detail).join(' ')).toContain('本次未落任何子卡')
  })

  it('标记常量钉住对外码（防两处字面量漂移）', () => {
    // 引擎适配器（pm-workflow）退役后，`subtask_engine_unreachable` 的唯一定义处是
    // AdvanceChain；但码本身仍是对外契约（失败分类器 / 看板诊断 / 本文件的历史出处都按它认），
    // 故在这里钉住字面量——原先钉的是"与适配器错误码同值"。
    expect(ENGINE_UNREACHABLE_MARK).toBe('subtask_engine_unreachable')
  })
})

describe('TC-11 · 不误伤：可达或缺省时行为不变', () => {
  it('团队服务明确可用 → 照常落子卡并照常跑（预检不是新门槛）', async () => {
    const h = await seed()
    installTeamProducer(h, undefined)   // Worker 什么都不写：本用例只问「预检拦不拦、子卡落不落」

    const out = await advanceRequirement(h.deps, 'REQ-000001', EXEC)

    expect(out.stopped).not.toBe('engine_unreachable')
    expect(await childCount(h), '可达时子卡照常落').toBeGreaterThan(0)
    expect(out.steps.some((s) => s.event === 'RUN_SUBTASK'), '照常跑到派卡').toBe(true)
  })

  it('未装配 teams（缺省 undefined）→ 不预检、行为与改动前一致', async () => {
    const h = await seed()

    const out = await advanceRequirement(h.deps, 'REQ-000001', EXEC)

    expect(out.stopped).not.toBe('engine_unreachable')
    expect(await childCount(h)).toBeGreaterThan(0)
  })

  it('available() 抛错 → 按可达处理（预检是保险，不是新门槛）', async () => {
    const h = await seed()
    const teams = installTeamProducer(h, undefined)
    teams.available = () => { throw new Error('探针炸了') }

    // 既有纪律（与旧引擎探针逐字同款）：**预检坏了不该拦住链**——判据抛错 ⇒ 按可达处理，
    // 照常落子卡；真派卡失败会在子卡上响亮失败（而不是把"探针抛错"变成链级阻断）。
    const out = await advanceRequirement(h.deps, 'REQ-000001', EXEC)
    expect(out.stopped).not.toBe('engine_unreachable')
    expect(await childCount(h)).toBeGreaterThan(0)
  })
})
