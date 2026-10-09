/**
 * reqboard_capture 单测（REQ-e3b6a0 t8 / FR-7 / AC-7.2；REQ-260922012924-2e29 FR-1 问项同步历史名）——立项弹框（pm 专有）：一次调用一把梭。
 *
 * 覆盖：逐问同批弹出（名称/类型/难度/文档位置/工作区）→ 答案映射（自定义优先 / 缺项回落默认并记 defaults_used）→ 创建即立项
 * → 绑定本窗口 → 推进 brainstorming；通道不可用 → fallback=board **不伪造立项**；
 * 用户取消 → 中性失败；名称为空 → 响亮失败；窗口已绑定 → 拒绝（白弹一次框是最贵的浪费）。
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineCaptureTool } from './helpers/tool-deps.js'
import {
  CAPTURE_QUESTION_IDS,
  WORKSPACE_SENTINELS,
  buildCaptureIntentQuestions,
  buildCaptureQuestions,
  mapCaptureAnswers,
} from '../src/application/internal/capture-mapping.js'
import type { AskAnswer } from '../src/application/ports.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const W = 'session-capture-1'

let dir: string
let store: ReturnType<typeof makeTestStore>

/**
 * 假弹框服务：记录收到的问题，按给定作答返回（'abort' → 抛 ASK_ABORTED）。
 *
 * REQ-260924002956-f37c t1：`seen.calls` 逐段记录每次 ask 的题目，`seen.questions` **跨段累计**
 * ——"四问"口径对"一次 ask 四问"与"两段 ask（1+3）"两种实现都成立（肯定路径合计仍是 4 问），
 * 而 `seen.calls` 让"拒绝路径只发一段"变成可断言的事实。
 */
function makeSvc(answers: readonly AskAnswer[] | 'abort') {
  const seen: { questions: unknown[]; calls: Array<Array<{ id?: string }>> } = { questions: [], calls: [] }
  return {
    seen,
    ask: async (req: { questions?: unknown[] }) => {
      const qs = (req.questions ?? []) as Array<{ id?: string }>
      seen.calls.push(qs)
      seen.questions.push(...qs)
      if (answers === 'abort') throw Object.assign(new Error('aborted'), { code: 'ASK_ABORTED' })
      return { answers: [...answers] }
    },
  }
}

const NOW = 1_700_000_000_000

function makeTool(opts: { svc?: unknown; rejections?: unknown; workspaceRoot?: string } = {}) {
  const deps = {
    store,

    now: () => NOW,
    ...(opts.svc !== undefined ? { userQuestions: () => opts.svc } : {}),
    ...(opts.rejections !== undefined ? { rejections: opts.rejections } : {}),
    ...(opts.workspaceRoot !== undefined ? { workspaceRoot: opts.workspaceRoot } : {}),
  } as never
  return defineCaptureTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }
}

const run = (tool: { execute: (a: unknown, e: unknown) => Promise<any> }, args: unknown = {}) =>
  tool.execute(args, { agent: { id: W } })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-capture-'))
  store = makeTestStore()
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

async function seedBound(): Promise<void> {
  const r = {
    id: 'REQ-bound1', title: '在途需求', description: '', status: 'brainstorming', blocked: false,
    sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [{ status: 'draft', at: 1, by: { kind: 'human' } }],
  } as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

const FOUR: AskAnswer[] = [
  { id: CAPTURE_QUESTION_IDS.name, selected: ['候选名称'] },
  { id: CAPTURE_QUESTION_IDS.category, selected: ['bug'] },
  { id: CAPTURE_QUESTION_IDS.difficulty, selected: ['advanced'] },
  // 第 4 问（t1 起「文档位置 + 工作区」合并为「文件落点」；相对路径 = 会话工作区下的该目录）
  { id: CAPTURE_QUESTION_IDS.location, selected: ['docs/requirements/<REQ>/'] },
]

describe('reqboard_capture · 四问口径（t1：5 问收口为 4 问）', () => {
  const WS_OPTS = { sessionCwd: '/proj/session', hostCwd: '/proj/host' }

  it('buildCaptureQuestions：恰好四问，id 顺序 = 名称/类型/算力档位/文件落点；名称题首项 = 推荐候选（label 带（推荐）后缀）、✖️ 居末', () => {
    const qs = buildCaptureQuestions(['候选一', '候选二'], WS_OPTS)
    expect(qs.map(q => q.id)).toEqual(['name', 'category', 'difficulty', 'location'])
    expect(qs).toHaveLength(4)
    // 宿主推荐契约（D-9）：只有首项 label 带（推荐）后缀才会被预选——✖️ 绝不能再排第一
    expect(qs[0]!.options?.[0]).toMatchObject({ label: '候选一（推荐）' })
    expect(qs[0]!.options?.[0]!.label).not.toContain('✖️')
    expect(qs[0]!.options?.at(-1)!.label).toContain('✖️')
    expect(qs[0]!.options?.map(o => o.label)).toContain('⚡ 全部按推荐值立项')
    expect(qs[1]!.options?.map(o => o.label)).toContain('feature（推荐）')
    expect(qs[2]!.options?.map(o => o.label)).toEqual(['simple', 'standard（推荐）', 'advanced', 'expert'])
    // 文件落点（D-8 方案 A）：选项即拼好的绝对路径预览，首项带推荐后缀
    expect(qs[3]!.options?.[0]!.label).toBe('/proj/session/docs/requirements/<REQ>/（推荐）')
    expect(qs[3]!.options?.[1]!.label).toBe('/proj/host/docs/requirements/<REQ>/')
  })

  it('buildCaptureIntentQuestions：题干带一句话立项理由（截断到 60 字）', () => {
    const long = '理'.repeat(120)
    const qs = buildCaptureIntentQuestions(['候选一'], { reasonLine: long.slice(0, 60) })
    expect(qs[0]!.question).toContain('建议立项：《候选一》')
    expect(qs[0]!.question).toContain('理'.repeat(60))
    expect(qs[0]!.question).not.toContain('理'.repeat(61))
  })

  /**
   * AC-3 第 4 条「无裸哨兵标签」（FR-3 / 裁定 D-9③ / REQ-261007223647-da5d t14 补测）：
   * 2026-10-07 现场实锤之一，是弹框直接把内部哨兵 `session-workspace` 显示给用户看。
   * 哨兵语义必须**内化**在映射层（t2 的拆分），任何面向人的字符串都不许出现机器词。
   */
  it('全部问项的人可见文案零机器词：无裸哨兵 / 无 description 式推荐标记（AC-3④）', () => {
    const qs = buildCaptureQuestions(['候选一', '候选二'], WS_OPTS, { reasonLine: '一句话理由' })
    const humanText = qs.flatMap(q => [
      q.header ?? '', q.question,
      ...(q.options ?? []).flatMap(o => [o.label, o.description ?? '']),
    ]).join('\n')
    for (const machineWord of ['session-workspace', 'host-default', 'workspaceRoot', 'docBasePath']) {
      expect(humanText, machineWord + ' 不该出现在人眼前').not.toContain(machineWord)
    }
    // 推荐标记只走 label 后缀这一种写法：description 里再写一遍英文 Recommended 是伪标记
    // （宿主只认 label 后缀，description 里的字样它根本不看——这正是「死弹框」的根因）
    expect(humanText).not.toContain('Recommended')
    expect(humanText).not.toContain('recommended')
  })

  it('mapCaptureAnswers：名称自定义优先于选项；类型/难度取选项', () => {
    const m = mapCaptureAnswers([
      { id: 'name', selected: ['候选名称'], custom: '  用户自定义名称  ' },
      { id: 'category', selected: ['spike'] },
      { id: 'difficulty', selected: ['expert'] },
      { id: 'location', selected: ['/proj/session/docs/rfcs/'] },
    ], WS_OPTS)
    expect(m.title).toBe('用户自定义名称')
    expect(m.category).toBe('spike')
    expect(m.difficulty).toBe('expert')
    // 文件落点：命中会话根前缀 → 会话哨兵 + 余下相对段（IF-2 规则②）
    expect(m.workspace).toBe(WORKSPACE_SENTINELS.session)
    expect(m.docLocation).toBe('docs/rfcs')
    expect(m.defaultsUsed).toEqual([])
  })

  it('mapCaptureAnswers：推荐后缀必须剥离（宿主原样回传带后缀 label，不剥就静默回落默认）', () => {
    const m = mapCaptureAnswers([
      { id: 'name', selected: ['候选名称（推荐）'] },
      { id: 'category', selected: ['feature（推荐）'] },
      { id: 'difficulty', selected: ['standard（推荐）'] },
      { id: 'location', selected: ['/proj/session/docs/requirements/<REQ>/（推荐）'] },
    ], WS_OPTS)
    expect(m.title).toBe('候选名称')
    expect(m.category).toBe('feature')
    expect(m.difficulty).toBe('standard')
    expect(m.docLocation).toBe('docs/requirements/<REQ>')
    expect(m.defaultsUsed).toEqual([])
  })

  it('mapCaptureAnswers：缺项/非法值 → 回落既有默认并记进 defaultsUsed（不静默猜）', () => {
    const m = mapCaptureAnswers([{ id: 'name', selected: ['只要名称'] }])
    expect(m.category).toBe('feature')
    expect(m.difficulty).toBe('standard')
    expect(m.workspace).toBe(WORKSPACE_SENTINELS.session)
    expect(m.defaultsUsed).toEqual(['category', 'difficulty', 'location'])
    const bad = mapCaptureAnswers([
      { id: 'name', selected: ['x'] },
      { id: 'category', selected: ['不存在的类型'] },
      { id: 'difficulty', selected: ['不存在的难度'] },
    ])
    expect(bad.category).toBe('feature')
    expect(bad.difficulty).toBe('standard')
    expect(bad.workspace).toBe(WORKSPACE_SENTINELS.session)
    expect(bad.defaultsUsed).toEqual(['category', 'difficulty', 'location'])
  })

  it('mapCaptureAnswers：⚡ 一键过 → 名称不由控制项充当，后 3 问全走默认', () => {
    const m = mapCaptureAnswers([{ id: 'name', selected: ['⚡ 全部按推荐值立项'] }])
    expect(m.acceptAllRecommended).toBe(true)
    expect(m.title).toBe('')
    expect(m.category).toBe('feature')
    expect(m.difficulty).toBe('standard')
    expect(m.docLocation).toBe('docs/requirements/<REQ>/')
    expect(m.defaultsUsed).toEqual(['category', 'difficulty', 'location'])
  })
})

describe('reqboard_capture · 一次调用一把梭（AC-7.2）', () => {
  it('四问分两段弹出（1+3）→ 创建即立项 → 绑定本窗口 → 推进 brainstorming', async () => {
    const svc = makeSvc(FOUR)
    const out = await run(makeTool({ svc, workspaceRoot: dir }), { title_options: ['候选名称'] })
    // 两段合计四问（t1 收口：名称 / 类型 / 算力档位 / 文件落点）
    expect(svc.seen.questions).toHaveLength(4)
    expect((svc.seen.questions as { id?: string }[]).map(q => q.id)).toEqual(['name', 'category', 'difficulty', 'location'])
    // 立项成功 + 绑定 + 推进
    expect(out.success).toBe(true)
    expect(out.requirement_id).toMatch(/^REQ-/)
    expect(out.status).toBe('brainstorming')
    expect(out.answers).toMatchObject({ title: '候选名称', category: 'bug', difficulty: 'advanced' })
    expect(out.defaults_used).toEqual([])
    const req = store.peekAll().find(r => r.id === out.requirement_id)!
    expect(req.sourceSessionId).toBe(W)
    expect(req.status).toBe('brainstorming')
    expect(req.category).toBe('bug')
    expect(req.promptDifficulty).toBe('advanced')
    // RTM 触发点 1：**窗口绑定之后**生成 rtm-lifecycle.yml，并把绑定窗口写进快照
    const lcPath = join(dir, 'docs', 'requirements', out.requirement_id, 'rtm-lifecycle.yml')
    expect(existsSync(lcPath)).toBe(true)
    const lcText = readFileSync(lcPath, 'utf-8')
    expect(lcText).toContain('source_session: ' + W)
    expect(lcText).toContain('current_stage: brainstorming')
    // 绝对路径自定位（读快照的一方不必先知道工作区根）
    expect(lcText).toContain('dir: ' + join(dir, 'docs', 'requirements', out.requirement_id))
    expect(lcText).toContain('file_path: ' + lcPath)
    // 节点清单 + 计数：本需求是 bug（档案跳过 brainstorming）→ 6 个节点
    expect(lcText).toContain('stage_count: 6')
    expect(lcText).toContain('stage_list:')
  })

  it('用户自定义名称优先（选项在场也不用它）', async () => {
    const svc = makeSvc([
      { id: 'name', selected: ['候选名称'], custom: '我自己起的名字' },
      { id: 'category', selected: ['doc'] },
      { id: 'difficulty', selected: ['simple'] },
    ])
    const out = await run(makeTool({ svc }), {})
    expect(out.answers.title).toBe('我自己起的名字')
    expect(store.peekAll()[0]!.title).toBe('我自己起的名字')
  })

  it('弹框通道不可用 → fallback=board，且**不创建任何需求**', async () => {
    const out = await run(makeTool({}), {})
    expect(out.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f)：无码可断——notCreated 软失败回执只带 note/fallback（无 code/error），实现缺口只上报。
    expect(out.requirement_id).toBe('')
    expect(out.fallback).toBe('board')
    expect(store.peekAll()).toHaveLength(0)
  })

  it('用户取消（ASK_ABORTED）→ 中性失败，不创建需求', async () => {
    const out = await run(makeTool({ svc: makeSvc('abort') }), {})
    expect(out.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f)：无码可断——notCreated 软失败回执只带 note（无 code/error），实现缺口只上报。
    expect(out.fallback).toBeUndefined()
    expect(out.note).toContain('未作答')
    expect(store.peekAll()).toHaveLength(0)
  })

  it('名称为空 → 响亮失败（名称没有默认值，不猜不补）', async () => {
    const svc = makeSvc([{ id: 'category', selected: ['bug'] }, { id: 'difficulty', selected: ['expert'] }])
    const out = await run(makeTool({ svc }), {})
    expect(out.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f)：无码可断——notCreated 软失败回执只带 note（无 code/error），实现缺口只上报。
    expect(out.note).toContain('需求名称')
    expect(store.peekAll()).toHaveLength(0)
  })

  // REQ-261003215944-9e04 FR-4（t6）：本条原断言「已绑定 → 一律拒绝」。
  // 需求明确把这里从"拒绝"改成**显式选择**：缺省 = 本窗口接第二个项目（second），
  // 另一条分支 handoff = 开新窗口并把需求交给它。故拆成三条：
  //   a) 缺省（不传）= second，成功立项且仍归属本窗口；
  //   b) 显式 handoff：交给新窗口（新窗口能力缺失时如实拒绝，不静默降级成 second）；
  //   c) 「不白弹一次框」这条**初衷**依然由 reqboard_create 那条守卫守住（见 support.ts）。
  it('窗口已绑定进行中需求 → 缺省走 second：本窗口接第二个项目（不再一律拒绝）', async () => {
    await seedBound()
    const svc = makeSvc(FOUR)
    const out = await run(makeTool({ svc }), {})
    expect(out.success).toBe(true)
    expect(out.bound_policy).toBe('second')
    expect(svc.seen.questions.length).toBeGreaterThan(0) // 这次确实弹了框（用户选择了接第二个）
  })

  it('窗口已绑定 + on_window_bound=handoff 但无开窗能力 → 如实拒绝（不静默降级成 second）', async () => {
    await seedBound()
    const svc = makeSvc(FOUR)
    await expect(run(makeTool({ svc }), { on_window_bound: 'handoff' }))
      .rejects.toMatchObject({ code: 'REQBOARD_OPEN_WINDOW_UNAVAILABLE' })
  })
})

describe('reqboard_capture · 拒绝即终端（REQ-260924002956-f37c BUG-1）', () => {
  it('选「✖️ 不需要立项」→ 只发一段 ask，第二段问题（类型/难度/文档位置）从未下发', async () => {
    const svc = makeSvc([{ id: 'name', selected: ['✖️ 不需要立项'] }])
    const rejections = { record: () => {}, readAll: async () => [] }
    const out = await run(makeTool({ svc, rejections }), {})

    expect(out.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f)：无码可断——拒绝即终端的软失败回执只带 note（无 code/error），实现缺口只上报。
    expect(out.requirement_id).toBe('')
    // 只发一段：后续问题根本没有机会被问到（BUG-1 的现象就是"还继续问类型"）
    expect(svc.seen.calls).toHaveLength(1)
    expect(svc.seen.questions.map(q => (q as { id?: string }).id)).toEqual(['name'])
    expect(store.peekAll()).toHaveLength(0)
  })
})

describe('reqboard_capture · 拒绝粘滞（REQ-260922012924-2e29 FR-5）', () => {
  it('rejected 分支写留痕：用户点"✖️ 不需要立项"→ 记录 {windowKey, at} 并返回未立项', async () => {
    const recorded: unknown[] = []
    const rejections = { record: (e: unknown) => { recorded.push(e) }, readAll: async () => [] }
    const svc = makeSvc([{ id: 'name', selected: ['✖️ 不需要立项'] }])
    const out = await run(makeTool({ svc, rejections }), {})
    expect(out.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f)：无码可断——拒绝留痕分支的软失败回执只带 note（无 code/error），实现缺口只上报。
    expect(out.requirement_id).toBe('')
    expect(out.note).toContain('不立项')
    // t5：留痕带类型（reject）——旧记录无 kind 仍按 reject 处理
    expect(recorded).toEqual([{ windowKey: W, at: NOW, kind: 'reject' }])
    expect(store.peekAll()).toHaveLength(0)
  })

  it('留痕写失败 → 降级不阻断「未立项」返回（留痕是增强不是门槛）', async () => {
    const rejections = { record: () => { throw new Error('disk full') }, readAll: async () => [] }
    const svc = makeSvc([{ id: 'name', selected: ['✖️ 不需要立项'] }])
    const out = await run(makeTool({ svc, rejections }), {})
    expect(out.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f)：无码可断——留痕写失败降级分支只带 note（无 code/error），实现缺口只上报。
    expect(out.note).toContain('不立项')
    expect(store.peekAll()).toHaveLength(0)
  })

  it('前置检查命中近期拒绝（30 分钟内）→ 不弹框直接返回未立项（超时重弹被拦截）', async () => {
    const rejections = { record: () => {}, readAll: async () => [{ windowKey: W, at: NOW - 5 * 60 * 1000 }] }
    const svc = makeSvc(FOUR)
    const out = await run(makeTool({ svc, rejections }), {})
    expect(out.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f)：无码可断——拒绝粘滞分支只带 note（无 code/error），实现缺口只上报。
    expect(out.note).toContain('30 分钟')
    expect(svc.seen.questions).toHaveLength(0) // 弹框根本没发生
    expect(store.peekAll()).toHaveLength(0)
  })

  it('拒绝留痕超 30 分钟 → 不粘滞，正常弹框立项', async () => {
    const svc = makeSvc(FOUR)
    const stale = makeTool({
      svc,
      rejections: { record: () => {}, readAll: async () => [{ windowKey: W, at: NOW - 31 * 60 * 1000 }] },
    })
    const out = await run(stale, { title_options: ['候选名称'] })
    expect(out.success).toBe(true)
    expect(svc.seen.questions).toHaveLength(4)
  })

  it('其他窗口的拒绝留痕 → 本窗口不粘滞，正常弹框立项', async () => {
    const svc = makeSvc(FOUR)
    const other = makeTool({
      svc,
      rejections: { record: () => {}, readAll: async () => [{ windowKey: 'session-other', at: NOW }] },
    })
    const out = await run(other, { title_options: ['候选名称'] })
    expect(out.success).toBe(true)
    expect(svc.seen.questions).toHaveLength(4)
  })

  it('留痕读损坏 → 按无记录降级，正常弹框（绝不因留痕故障误拦截）', async () => {
    const svc = makeSvc(FOUR)
    const rejections = { record: () => {}, readAll: async () => { throw new Error('corrupt json') } }
    const out = await run(makeTool({ svc, rejections }), { title_options: ['候选名称'] })
    expect(out.success).toBe(true)
    expect(svc.seen.questions).toHaveLength(4)
  })
})
