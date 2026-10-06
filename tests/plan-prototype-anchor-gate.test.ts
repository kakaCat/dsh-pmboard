/**
 * 拆分覆盖门的「UI 卡原型锚点」维（REQ-261005105032-3b02 t-cdb3ab / FR-5 · TC-17）。
 *
 * 锁死四件事（每条都是**可失败的断言**，不是"看着对"）：
 *  ① UI 需求（feature/refactor 且 sides 含 frontend）下，`side=frontend` 的卡没有
 *     `prototypes/<name>.html#FR-N` → 落库前被拒，且**逐卡点名该卡 key** 与补写位置；
 *  ② 补上锚点即放行；锚点指向 `superseded` 版本 → 仍拒（权威口径）；
 *  ③ 计划文档通道（`decomposition.md` 任务表「原型锚点」列）与任务对象通道等效——只认一条会
 *     把最常见的写法判成"没写"；
 *  ④ 非 UI 需求 / 存量需求（`req.artifacts` 为空）不受影响，且既有「某条 FR 无落点」的拒绝行为
 *     **零回归**（同一函数里的两个维度，先 FR 后锚点，判据互不干扰）。
 *
 * 另锁写侧（本卡补做的部分，见 notes/execution-decisions.md §2）：`PlanTask` 两键经
 * `normalizePlanTasks` 不被丢弃、且落库后 `TaskRecord.prototypeRefs` / `decisionRefs` 有值——
 * 没有写侧，门禁就没有数据可查。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { normalizePlanTasks } from '../src/shared/protocol.js'
import { assertClauseCoverageGate, requirementRefsOf } from '../src/application/internal/content-gate-wiring.js'
import { landPlanTasks, type PlanTaskDraft } from '../src/application/internal/plan-landing.js'
import { landApprovedPlan } from '../src/application/internal/approved-plan-landing.js'
import { makeHarness, req } from './application/harness.js'

const doc = (...lines: string[]) => lines.join('\n')

/** 需求文档：UI 需求（sides 含 frontend），两条根编号。 */
const UI_REQ = doc(
  '---',
  'req_id: REQ-t',
  'sides: [frontend, backend]',
  '---',
  '# 需求',
  '',
  '## 6. 功能点',
  '',
  '**FR-1 详情页**：按原型实现。',
  '',
  '**FR-4 详情页 Tab**：结构与几何量都要对得上原型。',
)

/** 非 UI 需求：只声明 backend。 */
const BE_REQ = UI_REQ.replace('sides: [frontend, backend]', 'sides: [backend]')

/** INDEX：唯一权威 = prototypes/detail.html；old.html 是它取代的旧版。 */
const INDEX = doc(
  '# 原型索引',
  '',
  '| 路径 | 状态 | 服务条款 | 被取代于 |',
  '|---|---|---|---|',
  '| prototypes/detail.html | authoritative | FR-1, FR-4 | — |',
  '| prototypes/old.html | superseded | FR-1 | prototypes/detail.html |',
)

// 路径口径与原型门同源：需求目录相对。
const PATH = 'docs/requirements/REQ-t/requirement.md'
const INDEX_PATH = 'docs/requirements/REQ-t/prototypes/INDEX.md'
const DEC_PATH = 'docs/requirements/REQ-t/decomposition.md'

const fakeDocs = (files: Record<string, string>) => ({
  exists: (p: string) => Object.prototype.hasOwnProperty.call(files, p),
  read: async (p: string) => files[p] ?? '',
})

/** 有产物簿的需求（artifacts 非空 = 非存量）；category 默认 feature。 */
const reqWith = (over: Record<string, unknown> = {}) => ({
  id: 'REQ-t',
  category: 'feature',
  artifacts: [{ stage: 'brainstorming', kind: 'requirement', path: PATH }],
  ...over,
} as never)

/** 一张 UI 卡：覆盖两条 FR（FR 落点门先过，才轮到锚点维）。 */
const uiCard = (over: Record<string, unknown> = {}) => ({
  key: 't3', side: 'frontend', requirement_refs: ['FR-1', 'FR-4'],
  title: '按原型实现详情页', implementation: '改 src/client/views/detail.ts',
  acceptance: '跑 npx vitest run tests/detail.test.ts 全绿',
  ...over,
})

const docsWithIndex = (extra: Record<string, string> = {}) =>
  fakeDocs({ [PATH]: UI_REQ, [INDEX_PATH]: INDEX, ...extra })

// ── ① 缺锚点 → 拒并逐卡点名 ─────────────────────────────────────────────────

describe('UI 卡原型锚点维（TC-17）', () => {
  it('① UI 卡 prototypeRefs 为空 → 落库前被拒，gaps 点名该卡 key 与补写位置', async () => {
    const r = await assertClauseCoverageGate(docsWithIndex(), reqWith(), [uiCard()])
    expect(r).toBeDefined()
    expect(r?.code).toBe('prototype_anchor_missing')
    expect(r?.kind).toBe('decomposition')
    const gaps = (r?.gaps ?? []).join('\n')
    expect(gaps).toContain('t3')                       // 逐卡点名
    expect(gaps).toContain('缺原型锚点')
    expect(gaps).toContain(DEC_PATH)                   // 补写位置
    expect(gaps).toContain('templates/decomposing/decomposition.md') // 模板
    expect(gaps).toContain('prototypeRefs')            // 另一条可执行补法
    expect(r?.message).toContain('templates/decomposing/decomposition.md')
  })

  it('① 两张 UI 卡只缺一张 → 只点名缺的那张（不误伤已齐备的卡）', async () => {
    const r = await assertClauseCoverageGate(docsWithIndex(), reqWith(), [
      uiCard({ key: 't2', prototypeRefs: ['prototypes/detail.html#FR-1'] }),
      uiCard({ key: 't5' }),
    ])
    const gaps = r?.gaps ?? []
    expect(gaps).toHaveLength(1)
    expect(gaps[0]?.startsWith('t5（UI 卡）')).toBe(true)
  })

  it('② 补上 prototypes/detail.html#FR-4（= INDEX 权威行）→ 放行', async () => {
    const r = await assertClauseCoverageGate(docsWithIndex(), reqWith(), [
      uiCard({ prototypeRefs: ['prototypes/detail.html#FR-4'] }),
    ])
    expect(r).toBeUndefined()
  })

  it('② 锚点指向非权威（superseded）版本 → 拒，gap 给出权威路径', async () => {
    const r = await assertClauseCoverageGate(docsWithIndex(), reqWith(), [
      uiCard({ prototypeRefs: ['prototypes/old.html#FR-4'] }),
    ])
    expect(r?.code).toBe('prototype_anchor_missing')
    const gaps = (r?.gaps ?? []).join('\n')
    expect(gaps).toContain('prototypes/old.html#FR-4')
    expect(gaps).toContain('非权威')
    expect(gaps).toContain('prototypes/detail.html')
  })

  it('② 写了原型路径但缺 #FR-N → 判「形态不合法」而不是静默当没写', async () => {
    const r = await assertClauseCoverageGate(docsWithIndex(), reqWith(), [
      uiCard({ prototypeRefs: ['prototypes/detail.html'] }),
    ])
    expect(r?.code).toBe('prototype_anchor_missing')
    expect((r?.gaps ?? []).join('\n')).toContain('形态不合法')
  })

  it('INDEX 缺失时降级为只判形态：有锚点放行、无锚点仍拒（版本门职责不重复报）', async () => {
    const noIndex = fakeDocs({ [PATH]: UI_REQ })
    expect(await assertClauseCoverageGate(noIndex, reqWith(), [uiCard({ prototypeRefs: ['prototypes/detail.html#FR-4'] })])).toBeUndefined()
    expect((await assertClauseCoverageGate(noIndex, reqWith(), [uiCard()]))?.code).toBe('prototype_anchor_missing')
  })

  // ── ③ 计划文档通道（两条通道等效） ──────────────────────────────────────────

  const DEC_TASK_TABLE = doc(
    '## 任务表',
    '',
    '| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 原型锚点（UI 卡必填） | 关联 D-x |',
    '|---|---|---|---|---|---|---|',
    '| t3 | （落库后回填） | 按原型实现详情页 | FR-1, FR-4 | P-1 + src/client/views/detail.ts | P-1 ↔ prototypes/detail.html#FR-4 | D-1 |',
  )

  it('③ 任务对象没传，但 decomposition.md 任务表写了「原型锚点」→ 放行（文档通道等效）', async () => {
    const r = await assertClauseCoverageGate(
      docsWithIndex({ [DEC_PATH]: DEC_TASK_TABLE }), reqWith(), [uiCard()],
    )
    expect(r).toBeUndefined()
  })

  it('③ 任务对象没传、文档表也只写「—」→ 仍拒（占位符不是锚点）', async () => {
    const r = await assertClauseCoverageGate(
      docsWithIndex({ [DEC_PATH]: DEC_TASK_TABLE.replace('P-1 ↔ prototypes/detail.html#FR-4', '—') }),
      reqWith(), [uiCard()],
    )
    expect(r?.code).toBe('prototype_anchor_missing')
    expect((r?.gaps ?? []).join('\n')).toContain('t3')
  })

  it('③ 文档表写的锚点指向非权威版本 → 同样拒（两条通道吃同一套权威判据）', async () => {
    const r = await assertClauseCoverageGate(
      docsWithIndex({ [DEC_PATH]: DEC_TASK_TABLE.replace('prototypes/detail.html#FR-4', 'prototypes/old.html#FR-4') }),
      reqWith(), [uiCard()],
    )
    expect(r?.code).toBe('prototype_anchor_missing')
    expect((r?.gaps ?? []).join('\n')).toContain('非权威')
  })

  // ── ④ 非 UI 需求 / 存量需求 / 零回归 ────────────────────────────────────────

  it('④ 非 UI 需求（sides 只含 backend）→ 前端卡没有锚点也放行', async () => {
    const r = await assertClauseCoverageGate(
      fakeDocs({ [PATH]: BE_REQ, [INDEX_PATH]: INDEX }), reqWith(), [uiCard()],
    )
    expect(r).toBeUndefined()
  })

  it('④ 存量需求（artifacts 为空）→ 一律放行（不追溯）', async () => {
    const r = await assertClauseCoverageGate(docsWithIndex(), reqWith({ artifacts: undefined }), [uiCard()])
    expect(r).toBeUndefined()
  })

  it('④ 非 frontend 卡不受本维约束（backend / doc / fullstack 都不算 UI 卡）', async () => {
    const r = await assertClauseCoverageGate(docsWithIndex(), reqWith(), [
      uiCard({ key: 't1', side: 'backend' }),
      uiCard({ key: 't2', side: 'doc' }),
      uiCard({ key: 't4', side: 'fullstack' }),
    ])
    expect(r).toBeUndefined()
  })

  it('④ 零回归：FR 有条款没人接时仍是 requirement_uncovered（FR 维度先判，锚点维不抢码）', async () => {
    const r = await assertClauseCoverageGate(docsWithIndex(), reqWith(), [
      uiCard({ requirement_refs: ['FR-1'] }),
    ])
    expect(r?.code).toBe('requirement_uncovered')
    expect(r?.gaps).toEqual(['FR-4'])
    expect(requirementRefsOf({ requirement_refs: ['FR-1'] })).toEqual(['FR-1'])
  })
})

// ── 三条入口自动复用（签名不变） ──────────────────────────────────────────────

describe('三条落库 / 预检入口自动复用同一道门（既有调用点签名不变）', () => {
  const read = (rel: string): string =>
    readFileSync(fileURLToPath(new URL('../src/' + rel, import.meta.url)), 'utf8')

  it('门签名仍是三参（加维不加参 = 既有调用点一字不改）', () => {
    expect(assertClauseCoverageGate.length).toBe(3)
  })

  it('三条入口都调它（Decompose / approved-plan-landing / SubmitArtifact 的 kind=plan 分支）', () => {
    expect(read('application/use-cases/Decompose.ts')).toContain('assertClauseCoverageGate(')
    expect(read('application/internal/approved-plan-landing.ts')).toContain('assertClauseCoverageGate(')
    expect(read('application/use-cases/SubmitArtifact.ts')).toContain('assertClauseCoverageGate(')
  })
})

// ── 落库入口复用（签名不变的那个单点，真的被落库路径调用） ──────────────────────

describe('落库入口复用：approved-plan-landing 走同一道门（无需任何新接线）', () => {
  const REQ_ID = 'REQ-0000a1'
  const WINDOW = 'session-w-001'
  const DEC_PATH_MARK = doc('# 拆分清单', '', '## §2 任务清单', '', '（锚点在计划任务表里，本表只是路径占位）')

  /** 已批准计划 + 需求文档 + INDEX 的完整标本；planTasks 可覆写（缺 / 有锚点）。 */
  function seed(frontTaskOver: Record<string, unknown>) {
    const h = makeHarness()
    h.seedRequirementSync(req({
      id: REQ_ID, status: 'decomposing', category: 'feature', sourceSessionId: WINDOW,
      artifacts: [{
        stage: 'decomposing', kind: 'decomposition',
        path: 'docs/requirements/' + REQ_ID + '/decomposition.md',
        registeredAt: 1, registeredBy: { kind: 'agent', sessionId: WINDOW },
      } as never],
      plan: {
        path: 'docs/requirements/' + REQ_ID + '/decomposition.md',
        summary: '把活拆成 1 张 UI 卡',
        tasks: [{
          key: 't3', title: '按原型实现详情页', phase: 'implement', side: 'frontend',
          dependsOn: [], acceptance: '跑 npx vitest run tests/detail.test.ts 全绿',
          implementation: '改 src/client/views/detail.ts', requirement_refs: ['FR-1', 'FR-4'],
          ...frontTaskOver,
        }],
        submittedAt: h.clock.t, submittedBy: { kind: 'agent', sessionId: WINDOW },
        approvedAt: h.clock.t, approvedBy: { kind: 'human', sessionId: WINDOW },
      },
    }))
    h.docs.put('docs/requirements/' + REQ_ID + '/requirement.md', UI_REQ)
    h.docs.put('docs/requirements/' + REQ_ID + '/prototypes/INDEX.md', INDEX)
    h.docs.put('docs/requirements/' + REQ_ID + '/decomposition.md', DEC_PATH_MARK)
    return h
  }

  it('UI 卡缺锚点 → 落库被拒（点名卡 key），队列零新增', async () => {
    const h = seed({})
    await h.seedSettled()
    await expect(landApprovedPlan(h.deps, {
      requirementId: REQ_ID, windowKey: WINDOW, nowTs: h.clock.t, source: 'confirm',
    })).rejects.toThrow(/缺原型锚点/)
    expect(await h.tasksOf(REQ_ID)).toHaveLength(0)
  })

  it('补上锚点 + D-x → 落库成功，台账两个键都有值（端到端：门禁→落库→写侧）', async () => {
    const h = seed({
      prototypeRefs: ['prototypes/detail.html#FR-4'], decisionRefs: ['D-1'],
    })
    await h.seedSettled()
    const out = await landApprovedPlan(h.deps, {
      requirementId: REQ_ID, windowKey: WINDOW, nowTs: h.clock.t, source: 'confirm',
    })
    expect(out.createdCount).toBe(1)
    const tasks = await h.tasksOf(REQ_ID)
    expect(tasks[0]?.prototypeRefs).toEqual(['prototypes/detail.html#FR-4'])
    expect(tasks[0]?.decisionRefs).toEqual(['D-1'])
  })
})

// ── 写侧（本卡补做）：计划层两键 → 台账两键 ────────────────────────────────────

describe('写侧：prototypeRefs / decisionRefs 从计划一路落到任务卡', () => {
  it('normalizePlanTasks 不丢两键（camel 与 snake 两种写法都认）', () => {
    const out = normalizePlanTasks([
      {
        key: 't1', title: '按原型实现详情页', side: 'frontend',
        acceptance: '跑 npx vitest run tests/detail.test.ts 全绿',
        implementation: '改 src/client/views/detail.ts',
        prototypeRefs: ['prototypes/detail.html#FR-4'], decisionRefs: ['D-1'],
      },
      {
        key: 't2', title: '补原型锚点', side: 'frontend',
        acceptance: '跑 npx vitest run tests/detail.test.ts 全绿',
        implementation: '改 src/client/views/detail.ts',
        prototype_refs: ['prototypes/detail.html#FR-1'], decision_refs: ['D-3'],
      },
    ])
    expect(out[0]?.prototypeRefs).toEqual(['prototypes/detail.html#FR-4'])
    expect(out[0]?.decisionRefs).toEqual(['D-1'])
    expect(out[1]?.prototypeRefs).toEqual(['prototypes/detail.html#FR-1'])
    expect(out[1]?.decisionRefs).toEqual(['D-3'])
    // 未申报 = 不带键（缺省 = 未采集，不冒充空数组）
    expect(Object.prototype.hasOwnProperty.call(normalizePlanTasks([
      { key: 't9', title: 'x', acceptance: '跑 npx vitest run tests/x.test.ts 全绿', implementation: '改 x.ts' },
    ])[0], 'prototypeRefs')).toBe(false)
  })

  it('落库后 TaskRecord.prototypeRefs / decisionRefs 有值（无写侧则门禁无数据可查）', async () => {
    const REQ_ID = 'REQ-000001'
    const h = makeHarness({ requirements: [req({ id: REQ_ID, status: 'decomposing', category: 'feature' })] })
    const draft: PlanTaskDraft[] = [{
      key: 't1', title: '按原型实现详情页', description: '', phase: 'implement', side: 'frontend',
      acceptance: '跑 npx vitest run tests/detail.test.ts 全绿',
      implementation: '改 src/client/views/detail.ts', context: '', dependsOn: [],
      prototypeRefs: ['prototypes/detail.html#FR-4'], decisionRefs: ['D-1'],
    }]
    await landPlanTasks(h.deps, {
      requirementId: REQ_ID, windowKey: 'session-w-001', nowTs: h.clock.t,
      draft, refsByKey: new Map([['t1', ['FR-4']]]),
    })
    const tasks = await h.tasksOf(REQ_ID)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.prototypeRefs).toEqual(['prototypes/detail.html#FR-4'])
    expect(tasks[0]?.decisionRefs).toEqual(['D-1'])
    expect(tasks[0]?.requirementRefs).toEqual(['FR-4'])
  })
})

// ── 豁免（prototype_exempt）在本维的消费 · REQ-261006091755-1c9e t2 · TC-1～TC-9 ──
// serves: FR-1, FR-2, FR-3, FR-4
describe('锚点维的豁免四组合（REQ-261006091755-1c9e FR-1～FR-3）', () => {
  /** 已落章的需求产物（豁免生效的必要条件之一）。 */
  const SEALED = { stage: 'brainstorming', kind: 'requirement', path: PATH, confirmedAt: 1 }
  /** 显式登记的原型产物（autoDiscovered 缺省 = 已登记）。 */
  const PROTO = { stage: 'brainstorming', kind: 'prototype', path: 'docs/requirements/REQ-t/prototypes/detail.html', confirmedAt: 1 }

  const sealed = () => reqWith({ artifacts: [SEALED] })
  const withProto = () => reqWith({ artifacts: [SEALED, PROTO] })
  const autoDiscoveredProto = () => reqWith({ artifacts: [SEALED, { ...PROTO, autoDiscovered: true }] })

  /** 豁免理由非空（人已确认需求文档时才生效）。 */
  const EXEMPT = UI_REQ.replace('sides: [frontend, backend]', 'sides: [frontend, backend]\nprototype_exempt: 零可视变化，本需求豁免原型')
  /** 豁免理由为空的畸形写法。 */
  const EXEMPT_EMPTY = UI_REQ.replace('sides: [frontend, backend]', 'sides: [frontend, backend]\nprototype_exempt:')

  it('TC-1 豁免生效 + 无已登记原型 → 整维跳过（连 INDEX / decomposition 都不需要）', async () => {
    // 刻意只给 requirement.md：若早退发生在读 INDEX / 计划文档之后，这里会因缺文件而走别的分支
    const r = await assertClauseCoverageGate(fakeDocs({ [PATH]: EXEMPT }), sealed(), [uiCard()])
    expect(r).toBeUndefined()
  })

  it('TC-2 目录里有「自动发现補登」的原型（未登记）→ 仍跳过（已登记才算数）', async () => {
    const r = await assertClauseCoverageGate(fakeDocs({ [PATH]: EXEMPT }), autoDiscoveredProto(), [uiCard()])
    expect(r).toBeUndefined()
  })

  it('TC-3 豁免理由为空 → 未豁免，照旧拒（FR-2）', async () => {
    const r = await assertClauseCoverageGate(docsWithIndex({ [PATH]: EXEMPT_EMPTY }), sealed(), [uiCard()])
    expect(r?.code).toBe('prototype_anchor_missing')
  })

  it('TC-4 理由非空但 requirement 产物未落章 → 未豁免，照旧拒（不许 agent 自己豁免自己）', async () => {
    const r = await assertClauseCoverageGate(docsWithIndex({ [PATH]: EXEMPT }), reqWith(), [uiCard()])
    expect(r?.code).toBe('prototype_anchor_missing')
  })

  it('TC-5 无 prototype_exempt 键 → 照旧拒，且 gaps 与改动前逐字一致（零回归）', async () => {
    const r = await assertClauseCoverageGate(docsWithIndex(), sealed(), [uiCard()])
    const gaps = (r?.gaps ?? []).join('\n')
    expect(r?.code).toBe('prototype_anchor_missing')
    expect(gaps).toContain('t3')
    expect(gaps).toContain('缺原型锚点')
    expect(gaps).toContain(DEC_PATH)
  })

  it('TC-6 豁免生效但已登记原型 + 卡无锚点 → 仍拒（交了就要合格，FR-3）', async () => {
    const r = await assertClauseCoverageGate(docsWithIndex({ [PATH]: EXEMPT }), withProto(), [uiCard()])
    expect(r?.code).toBe('prototype_anchor_missing')
    expect((r?.gaps ?? []).join('\n')).toContain('t3')
  })

  it('TC-7 豁免生效 + 已登记原型 + 锚点指向权威路径 → 放行（FR-3）', async () => {
    const r = await assertClauseCoverageGate(docsWithIndex({ [PATH]: EXEMPT }), withProto(), [
      uiCard({ prototypeRefs: ['prototypes/detail.html#FR-4'] }),
    ])
    expect(r).toBeUndefined()
  })

  it('TC-8 非 UI 需求（sides 只含 backend）+ 豁免 → 放行（既有最早分支，与本维无关）', async () => {
    const r = await assertClauseCoverageGate(fakeDocs({ [PATH]: BE_REQ }), sealed(), [uiCard()])
    expect(r).toBeUndefined()
  })

  it('TC-9 存量需求（artifacts 为空）→ 一律放行（不追溯，豁免与否都不判）', async () => {
    const r = await assertClauseCoverageGate(fakeDocs({ [PATH]: EXEMPT }), reqWith({ artifacts: [] }), [uiCard()])
    expect(r).toBeUndefined()
  })
})

// ── 判据单点（源码锚点）· REQ-261006091755-1c9e t2 · TC-10 ─────────────────────
// serves: FR-4
describe('判据单点：豁免只由既有函数回答（REQ-261006091755-1c9e FR-4 · TC-10）', () => {
  const read = (rel: string): string =>
    readFileSync(fileURLToPath(new URL('../src/' + rel, import.meta.url)), 'utf8')

  /** 只取 `assertUiCardPrototypeAnchors` 的函数体，避免命中文件里别处的同名调用。 */
  const anchorsBody = (): string => {
    const src = read('application/internal/content-gate-wiring.ts')
    const start = src.indexOf('async function assertUiCardPrototypeAnchors')
    expect(start).toBeGreaterThan(-1)
    const end = src.indexOf('\n}\n', start)
    expect(end).toBeGreaterThan(start)
    return src.slice(start, end)
  }

  it('TC-10 函数体内只调 prototypeExemptOf / registeredPrototypesOf，无手写豁免判据', () => {
    const body = anchorsBody()
    expect(body).toContain('prototypeExemptOf(')
    expect(body).toContain('registeredPrototypesOf(')
    // 手写判据（自己读 front-matter 字符串）出现即缺陷：豁免口径只能有一处
    expect(body.includes('prototype_exempt')).toBe(false)
  })
})
