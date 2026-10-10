/**
 * goal 工具面（对齐宿主 tool-goal 的三工具设计：get / create / update）。
 *
 * 【守护什么】
 *   ① 登记面不空转：工厂键集合 == `GOAL_TOOL_REGISTRY` 的 key 集合，且注册名与工厂名可从
 *      `src/index.ts` 里逐字扫到（漏登记/改名都红）；
 *   ② 协议面：参数不全 → 如实报错；block 无原因 → 拒绝；
 *   ③ 授权面：`resume` 缺省（autonomous）被拒并指路看板；注入真人判定后放行；
 *   ④ 行为面：create 的 objective 缺省取卡片 acceptance；update 写后如实回读相位。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { repoPath } from 'tests/helpers/repo-root.js'
import { GOAL_TOOL_REGISTRY } from 'tool-pm-goal/registry.js'
import { GOAL_TOOL_FACTORIES } from 'tool-pm-goal'

function fakeUseCases(
  initial: { tasks?: Array<Record<string, unknown>>; goals?: unknown[] } = {},
  over: { roundsInStage?: number; activation?: string } = {},
) {
  const tasks = initial.tasks ?? [{ id: 't-1', status: 'running', acceptance: '登录页可用且测试全绿' }]
  const req: Record<string, unknown> = {
    id: 'REQ-x', goals: initial.goals, updatedAt: 1,
    // 缺口③④的事实来源：自动跑意图 + 已准入回合数（默认给够阈值，便于测正常路径）
    dive: { activation: over.activation ?? 'armed', roundsInStage: over.roundsInStage ?? 3 },
  }
  let writes = 0
  return {
    tasks,
    get writes() { return writes },
    useCases: {
      taskStore: {
        get: async (id: string) => tasks.find((t) => t.id === id),
        listByRequirement: async () => tasks,
        mutate: async (_r: string, fn: (t: Array<Record<string, unknown>>) => unknown) => {
          const out = fn(tasks)
          if (out === undefined) return tasks
          writes += 1
          return tasks
        },
      },
      store: {
        get: async () => req,
        mutate: async (_id: string, fn: (d: Record<string, unknown>) => unknown) => {
          const out = fn(req)
          if (out === undefined) return { changed: false }
          writes += 1
          return { changed: true }
        },
      },
    } as never,
  }
}

type Executable = { execute: (a: Record<string, unknown>, exec?: unknown) => Promise<Record<string, unknown>> }

function tools(
  initial?: Parameters<typeof fakeUseCases>[0],
  human = false,
  over: {
    verifyCaller?: (exec: unknown) => { ok: boolean; reason?: string }
    resolveAuthority?: (exec: unknown) => { kind: 'direct-human' | 'autonomous' } | undefined
    useCasesOverride?: { roundsInStage?: number; activation?: string }
  } = {},
) {
  const f = fakeUseCases(initial, over.useCasesOverride)
  const deps = {
    useCases: f.useCases,
    ...(human ? { resolveAuthority: () => ({ kind: 'direct-human' as const }) } : {}),
    ...(over.resolveAuthority === undefined ? {} : { resolveAuthority: over.resolveAuthority }),
    ...(over.verifyCaller === undefined ? {} : { verifyCaller: over.verifyCaller }),
  }
  return {
    f,
    get: GOAL_TOOL_FACTORIES.TaskGoalGet(deps as never) as unknown as Executable,
    create: GOAL_TOOL_FACTORIES.TaskGoalCreate(deps as never) as unknown as Executable,
    update: GOAL_TOOL_FACTORIES.TaskGoalUpdate(deps as never) as unknown as Executable,
    stageGet: GOAL_TOOL_FACTORIES.StageGoalGet(deps as never) as unknown as Executable,
    stageCreate: GOAL_TOOL_FACTORIES.StageGoalCreate(deps as never) as unknown as Executable,
    stageDone: GOAL_TOOL_FACTORIES.StageGoalDone(deps as never) as unknown as Executable,
  }
}

describe('登记面自洽（三工具设计）', () => {
  it('工厂键集合 == 登记表 key 集合', () => {
    expect(Object.keys(GOAL_TOOL_FACTORIES).sort()).toEqual(GOAL_TOOL_REGISTRY.map((e) => e.key).sort())
  })

  it('工具名与工厂名可从 src/index.ts 逐字扫到（漏登记/改名即红）', () => {
    const src = readFileSync(repoPath('goal/tool-pm-goal/src/index.ts'), 'utf8')
    for (const e of GOAL_TOOL_REGISTRY) {
      expect(src, e.toolName).toContain("name: '" + e.toolName + "'")
      expect(src, e.factory).toContain('export function ' + e.factory)
    }
  })
})

describe('协议面：参数与拒绝', () => {
  it('缺 requirement_id → 如实报错（三个工具各自）', async () => {
    const t = tools()
    for (const tool of [t.get, t.create, t.update]) {
      const out = await tool.execute({ action: 'pause' })
      expect(out.success).toBe(false)
      expect(String(out.error)).toContain('requirement_id')
    }
  })

  it('create/update 缺 task_id → 如实报错', async () => {
    const t = tools()
    expect(String((await t.create.execute({ requirement_id: 'REQ-x' })).error)).toContain('task_id')
    expect(String((await t.update.execute({ requirement_id: 'REQ-x', action: 'complete' })).error)).toContain('task_id')
  })

  it('block 无 reason → 拒绝（不编造原因）', async () => {
    const out = await tools().update.execute({ requirement_id: 'REQ-x', task_id: 't-1', action: 'block' })
    expect(out.success).toBe(false)
    expect(String(out.error)).toContain('reason')
  })
})

describe('授权面：resume 真人专属', () => {
  it('agent 自行 resume → 拒绝并指路看板', async () => {
    const t = tools()
    await t.create.execute({ requirement_id: 'REQ-x', task_id: 't-1' })
    await t.update.execute({ requirement_id: 'REQ-x', task_id: 't-1', action: 'pause', reason: '中断' })
    const denied = await t.update.execute({ requirement_id: 'REQ-x', task_id: 't-1', action: 'resume' })
    expect(denied.success).toBe(false)
    expect(String(denied.error)).toContain('需要人显式发起')
  })

  it('注入真人判定 → resume 放行', async () => {
    const t = tools(undefined, true)
    await t.create.execute({ requirement_id: 'REQ-x', task_id: 't-1' })
    await t.update.execute({ requirement_id: 'REQ-x', task_id: 't-1', action: 'pause', reason: '中断' })
    const ok = await t.update.execute({ requirement_id: 'REQ-x', task_id: 't-1', action: 'resume' })
    expect(ok.success).toBe(true)
    expect((ok.goal as { phase?: string }).phase).toBe('active')
  })
})

describe('行为面：建 / 改 / 读', () => {
  it('create：objective 缺省取卡片 acceptance（D-1 判据复用）', async () => {
    const t = tools()
    const out = await t.create.execute({ requirement_id: 'REQ-x', task_id: 't-1' })
    expect(out.success).toBe(true)
    expect((t.f.tasks[0].goal as Record<string, unknown>).objective).toBe('登录页可用且测试全绿')
  })

  it('create 幂等重放：changed=false（相位不被重置）', async () => {
    const t = tools()
    await t.create.execute({ requirement_id: 'REQ-x', task_id: 't-1', objective: '目标' })
    const again = await t.create.execute({ requirement_id: 'REQ-x', task_id: 't-1', objective: '目标' })
    expect(again.success).toBe(true)
    expect(again.changed).toBe(false)
  })

  it('get：无 goal 的卡返回 goal:null；有阶段目标时回有界计数', async () => {
    const t = tools({ tasks: [{ id: 't-1', status: 'todo' }], goals: [{ stage: 'design', statement: 's', doneCriteria: [], state: 'done' }] })
    const out = await t.get.execute({ requirement_id: 'REQ-x', task_id: 't-1' })
    expect(out.success).toBe(true)
    expect(out.goal).toBeNull()
    expect(out.stage).toEqual({ total: 1, done: 1 })
  })

  it('update complete：写后如实回读相位', async () => {
    const t = tools()
    await t.create.execute({ requirement_id: 'REQ-x', task_id: 't-1', objective: '目标' })
    const done = await t.update.execute({ requirement_id: 'REQ-x', task_id: 't-1', action: 'complete' })
    expect(done.success).toBe(true)
    expect((done.goal as { phase?: string }).phase).toBe('complete')
  })
})

describe('L1 阶段目标：登记 / 读 / 落章', () => {
  it('登记表后：get 回全表 + 收口判据 false（尚有 pending）', async () => {
    const t = tools()
    const created = await t.stageCreate.execute({
      requirement_id: 'REQ-x',
      goals: [
        { stage: 'design', statement: '设计定稿', done_criteria: ['评审通过'] },
        { stage: 'implementing', statement: '实现完成', done_criteria: ['测试全绿'] },
      ],
    })
    expect(created.success).toBe(true)
    expect(created.changed).toBe(true)
    const got = await t.stageGet.execute({ requirement_id: 'REQ-x' })
    expect(got.success).toBe(true)
    expect((got.goals as unknown[]).length).toBe(2)
    expect(got.ready_to_close).toBe(false)
  })

  it('登记幂等：同值重放 changed=false（不写盘）', async () => {
    const t = tools()
    const goals = [{ stage: 'design', statement: '设计定稿', done_criteria: ['评审通过'] }]
    await t.stageCreate.execute({ requirement_id: 'REQ-x', goals })
    const again = await t.stageCreate.execute({ requirement_id: 'REQ-x', goals })
    expect(again.changed).toBe(false)
  })

  it('登记校验：stage 重复 / statement 空 → 如实报错（不静默丢弃）', async () => {
    const t = tools()
    const dup = await t.stageCreate.execute({
      requirement_id: 'REQ-x',
      goals: [{ stage: 'design', statement: 'a' }, { stage: 'design', statement: 'b' }],
    })
    expect(dup.success).toBe(false)
    expect(String(dup.error)).toContain('重复')
    const empty = await t.stageCreate.execute({
      requirement_id: 'REQ-x', goals: [{ stage: 'design', statement: '  ' }],
    })
    expect(empty.success).toBe(false)
    expect(String(empty.error)).toContain('statement')
  })

  it('登记非法阶段键 → 当场报错并点名合法键（真缺口回归：以前错了还不报错）', async () => {
    const t = tools()
    const out = await t.stageCreate.execute({
      requirement_id: 'REQ-x', goals: [{ stage: 'nonsense', statement: 'x' }],
    })
    expect(out.success).toBe(false)
    expect(String(out.error)).toContain('阶段键非法：nonsense')
    expect(String(out.error)).toContain('implementing')
  })

  it('落章授权：agent 自行落章 → 拒绝（D-4 人落章）', async () => {
    const t = tools()
    await t.stageCreate.execute({ requirement_id: 'REQ-x', goals: [{ stage: 'design', statement: '设计定稿' }] })
    const denied = await t.stageDone.execute({ requirement_id: 'REQ-x', stage: 'design' })
    expect(denied.success).toBe(false)
    expect(String(denied.error)).toContain('需要人显式发起')
  })

  it('落章（人）：全部落章 ⇒ ready_to_close=true', async () => {
    const t = tools(undefined, true)
    await t.stageCreate.execute({ requirement_id: 'REQ-x', goals: [{ stage: 'design', statement: '设计定稿' }] })
    const done = await t.stageDone.execute({ requirement_id: 'REQ-x', stage: 'design' })
    expect(done.success).toBe(true)
    expect(done.ready_to_close).toBe(true)
  })

  it('落章缺 stage / 表外阶段 → 如实报错或零变更', async () => {
    const t = tools(undefined, true)
    expect(String((await t.stageDone.execute({ requirement_id: 'REQ-x' })).error)).toContain('stage')
    await t.stageCreate.execute({ requirement_id: 'REQ-x', goals: [{ stage: 'design', statement: 'x' }] })
    const outside = await t.stageDone.execute({ requirement_id: 'REQ-x', stage: 'accepting' })
    expect(outside.success).toBe(true)
    expect(outside.changed).toBe(false)
  })
})

describe('两层都有工具（用户裁定：工具面必须两层都在）', () => {
  it('登记面覆盖 L2-task 与 L1-stage 各三工具', () => {
    const byLayer = (layer: string) => GOAL_TOOL_REGISTRY.filter((e) => e.layer === layer).length
    expect(byLayer('L2-task')).toBe(3)
    expect(byLayer('L1-stage')).toBe(3)
  })

  it('注册名带层前缀：task_* 属 L2、stage_* 属 L1', () => {
    for (const e of GOAL_TOOL_REGISTRY) {
      const want = e.layer === 'L2-task' ? 'reqboard_task_goal_' : 'reqboard_stage_goal_'
      expect(e.toolName.startsWith(want), e.toolName).toBe(true)
    }
  })
})

describe('阶段序列从项目创建开始（draft → archived）', () => {
  it('首尾两端都合法：draft（创建）与 archived（归档）都能登记', async () => {
    const t = tools(undefined, true)
    const created = await t.stageCreate.execute({
      requirement_id: 'REQ-x',
      goals: [
        { stage: 'draft', statement: '立项：目标与范围落定', done_criteria: ['需求文档立得住'] },
        { stage: 'archived', statement: '归档：材料齐备', done_criteria: ['归档清单齐'] },
      ],
    })
    expect(created.success).toBe(true)
    const stages = (created.goals as Array<{ stage: string }>).map((g) => g.stage)
    expect(stages).toEqual(['draft', 'archived'])
  })

  it('全序列登记 ⇒ 全落章后 ready_to_close（"项目完成"= 所有阶段达成）', async () => {
    const t = tools(undefined, true)
    const all = ['draft', 'brainstorming', 'design', 'decomposing', 'implementing', 'accepting', 'archived']
    await t.stageCreate.execute({
      requirement_id: 'REQ-x',
      goals: all.map((stage) => ({ stage, statement: stage + ' 阶段目标' })),
    })
    for (const stage of all.slice(0, -1)) {
      const out = await t.stageDone.execute({ requirement_id: 'REQ-x', stage })
      expect(out.ready_to_close, stage + ' 尚未全达成').toBe(false)
    }
    const last = await t.stageDone.execute({ requirement_id: 'REQ-x', stage: 'archived' })
    expect(last.ready_to_close).toBe(true)
  })

  it('阶段键必须在序列里：序列外的键（含 legacy done/canceled）被拒', async () => {
    const t = tools()
    for (const bad of ['done', 'canceled', 'whatever']) {
      const out = await t.stageCreate.execute({
        requirement_id: 'REQ-x', goals: [{ stage: bad, statement: 'x' }],
      })
      expect(out.success, bad).toBe(false)
      expect(String(out.error)).toContain('阶段键非法：' + bad)
    }
  })
})

describe('收尾注入（对齐宿主 tool-goal：自主回合判终态 → deferContext）', () => {
  function withDefer(over: Parameters<typeof tools>[1] = false) {
    const captured: Array<Record<string, unknown>> = []
    const t = tools(undefined, over)
    const exec = { agent: { id: 'A-1' }, deferContext: (m: Record<string, unknown>) => { captured.push(m) } }
    return { t, exec, captured }
  }

  it('complete（自主回合）→ 注入一段收尾指令，且写明"完成 ≠ 阶段完成"', async () => {
    const { t, exec, captured } = withDefer()
    await t.create.execute({ requirement_id: 'REQ-x', task_id: 't-1', objective: '完成登录页' }, exec)
    const out = await t.update.execute({ requirement_id: 'REQ-x', task_id: 't-1', action: 'complete' }, exec)
    expect(out.success).toBe(true)
    expect(captured).toHaveLength(1)
    expect(captured[0].role).toBe('user')
    const text = ((captured[0].content as Array<{ text: string }>)[0]).text
    expect(text).toContain('<goal_complete>')
    expect(text).toContain('完成 ≠ 阶段完成')
  })

  it('block（自主回合）→ 注入收尾并带上卡点原文', async () => {
    const { t, exec, captured } = withDefer()
    await t.create.execute({ requirement_id: 'REQ-x', task_id: 't-1', objective: '完成登录页' }, exec)
    await t.update.execute({ requirement_id: 'REQ-x', task_id: 't-1', action: 'block', reason: '等 D-3 裁定' }, exec)
    const text = ((captured[0].content as Array<{ text: string }>)[0]).text
    expect(text).toContain('<goal_blocked>')
    expect(text).toContain('等 D-3 裁定')
  })

  it('pause / resume **不**注入（非终态不收尾）', async () => {
    const { t, exec, captured } = withDefer(true)
    await t.create.execute({ requirement_id: 'REQ-x', task_id: 't-1', objective: 'x' }, exec)
    await t.update.execute({ requirement_id: 'REQ-x', task_id: 't-1', action: 'pause', reason: '中断' }, exec)
    await t.update.execute({ requirement_id: 'REQ-x', task_id: 't-1', action: 'resume' }, exec)
    expect(captured).toHaveLength(0)
  })

  it('**人**直接操作（direct-human）→ 不注入（人就在场上，收尾话是噪音）', async () => {
    const { t, exec, captured } = withDefer(true)
    await t.create.execute({ requirement_id: 'REQ-x', task_id: 't-1', objective: 'x' }, exec)
    await t.update.execute({ requirement_id: 'REQ-x', task_id: 't-1', action: 'complete' }, exec)
    expect(captured).toHaveLength(0)
  })

  it('宿主不提供 deferContext → 静默跳过（收尾尽力而为，不挡主流程）', async () => {
    const t = tools()
    await t.create.execute({ requirement_id: 'REQ-x', task_id: 't-1', objective: 'x' })
    const out = await t.update.execute({ requirement_id: 'REQ-x', task_id: 't-1', action: 'complete' })
    expect(out.success).toBe(true)
  })
})


describe('对齐宿主 tool-goal：五处缺口的回归', () => {
  it('① CAS：revision 对不上 → 写前拒（不覆盖别人的决定）', async () => {
    const t = tools()
    await t.create.execute({ requirement_id: 'REQ-x', task_id: 't-1', objective: 'x' })
    const stale = await t.update.execute({ requirement_id: 'REQ-x', task_id: 't-1', action: 'complete', revision: 99 })
    expect(stale.success).toBe(false)
    expect(String(stale.error)).toContain('已被别处改过')
  })

  it('① CAS：revision 对上 → 放行（先 get 再改）', async () => {
    const t = tools()
    await t.create.execute({ requirement_id: 'REQ-x', task_id: 't-1', objective: 'x' })
    const got = await t.get.execute({ requirement_id: 'REQ-x', task_id: 't-1' })
    const rev = (got.goal as { revision: number }).revision
    expect((await t.update.execute({ requirement_id: 'REQ-x', task_id: 't-1', action: 'complete', revision: rev })).success).toBe(true)
  })

  it('② 存活校验：verifyCaller 判否 → 三个工具都拒', async () => {
    const t = tools(undefined, false, { verifyCaller: () => ({ ok: false, reason: '调用者不是正在运行的 agent' }) })
    for (const out of [
      await t.get.execute({ requirement_id: 'REQ-x', task_id: 't-1' }),
      await t.create.execute({ requirement_id: 'REQ-x', task_id: 't-1', objective: 'x' }),
      await t.update.execute({ requirement_id: 'REQ-x', task_id: 't-1', action: 'complete' }),
    ]) {
      expect(out.success).toBe(false)
      expect(String(out.error)).toContain('不是正在运行的 agent')
    }
  })

  it('③ blocked 阈值：自主回合不足 3 回合 → 拒；够 → 放行', async () => {
    const low = tools({ tasks: [{ id: 't-1', status: 'running', acceptance: 'a' }] })
    // 默认假台账 roundsInStage=3；这里换一个 roundsInStage=0 的台账
    const t0 = tools(undefined, false, { useCasesOverride: { roundsInStage: 0 } })
    await t0.create.execute({ requirement_id: 'REQ-x', task_id: 't-1', objective: 'x' })
    const denied = await t0.update.execute({ requirement_id: 'REQ-x', task_id: 't-1', action: 'block', reason: '等上游' })
    expect(denied.success).toBe(false)
    expect(String(denied.error)).toContain('连续 3 个回合')

    const t3 = tools()
    await t3.create.execute({ requirement_id: 'REQ-x', task_id: 't-1', objective: 'x' })
    expect((await t3.update.execute({ requirement_id: 'REQ-x', task_id: 't-1', action: 'block', reason: '等上游' })).success).toBe(true)
    void low
  })

  it('③ 阈值只挡自主回合：人直接说"卡住了"不受限', async () => {
    const t = tools(undefined, true, { useCasesOverride: { roundsInStage: 0 } })
    await t.create.execute({ requirement_id: 'REQ-x', task_id: 't-1', objective: 'x' })
    expect((await t.update.execute({ requirement_id: 'REQ-x', task_id: 't-1', action: 'block', reason: '卡住了' })).success).toBe(true)
  })

  it('④ activation 曝光：get / update 都回自动跑意图（disarmed = 人关了自动跑）', async () => {
    const t = tools(undefined, false, { useCasesOverride: { activation: 'disarmed' } })
    await t.create.execute({ requirement_id: 'REQ-x', task_id: 't-1', objective: 'x' })
    expect((await t.get.execute({ requirement_id: 'REQ-x', task_id: 't-1' })).activation).toBe('disarmed')
    expect((await t.update.execute({ requirement_id: 'REQ-x', task_id: 't-1', action: 'pause', reason: 'x' })).activation).toBe('disarmed')
  })

  it('⑤ 授权判定返回 undefined（既非人、也非续跑回合）→ 终态动作被拒', async () => {
    const t = tools(undefined, false, { resolveAuthority: () => undefined })
    await t.create.execute({ requirement_id: 'REQ-x', task_id: 't-1', objective: 'x' })
    const denied = await t.update.execute({ requirement_id: 'REQ-x', task_id: 't-1', action: 'complete' })
    expect(denied.success).toBe(false)
    expect(String(denied.error)).toContain('需要人直接发起的回合')
  })
})
