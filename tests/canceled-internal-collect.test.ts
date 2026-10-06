/**
 * 服务端内部与用例面「活卡判据单点」收编守卫（REQ-261005193546-1b1a t7 / FR-1、FR-2、FR-4）。
 *
 * ## 标本
 * 与本仓真标本同形：**132 张 = 106 活卡 + 26 已取消**
 * （`docs/requirements/REQ-261005105032-3b02/queue.json` 实测 `done=106` + `canceled=26`）。
 * 所有断言的分母都落在 **106** 上——这正是本需求要钉死的那个数。
 *
 * ## 为什么断言分三层（少一层就会假绿）
 * 1. **逐收编点输出**：同一个标本喂给验收单投影 / 追溯投影 / 验收文档渲染 / 回填引用 / rollup 活卡集 /
 *    锚点失效探针，每处输出里取消卡条数必须 `=== 0`，分母必须 `=== 106`。
 * 2. **探针与落盘同分母**：`SubmitVerification` 的覆盖度探针（改前吃全量 = 132）与落盘写盘
 *    （改前吃过滤后 = 106）必须是同一个数——本用例用**真实用例跑两遍**取证：门禁被拒的那一遍
 *    盘上留下的是**探针写的那份** `rtm-accepting.yml`，通过的那一遍是**落盘写的那份**；两份的
 *    `coverage.testing.total` 必须逐字相等（都 106）。
 * 3. **源码级**：收编点里不得再出现手写取消比较（`status … 'canceled'`）。
 *    这一条是**逆验证的锚点**：把任一收编点（含落盘那处）改回手写 filter，本用例立刻变红。
 *
 * 另有两条边界：活卡 0 张（全取消）标本上，验收文档 / 追溯 / rollup 三处**空集不抛错**。
 *
 * ## 卡面「四处」之外的**有意扩两处**（依据 = acceptance 的同分母判据 + FR-5 界面零泄漏，收口窗口裁定）
 * - `SubmitVerification` 的 **RTM 探针**调用（`syncRTMYaml(deps, liveTargetTasks, …)`）：
 *   132 口径的字面来源就是它（design/backend.md:84-85、102-107 的 `:208` 探针 / `:363` 落盘）。
 * - `SubmitVerification` 的 **锚点失效探针**调用（`collectMissingAnchors(deps.docs, liveTargetTasks)`）：
 *   它决定验收文档里出现哪些「缺失锚点」条目，吃全量就是 FR-5 的真泄漏。
 *   （该函数内部另有一道"已取消就跳过"守卫 `content-gate-wiring.ts:497`，属 design §豁免清单的基线，
 *   本用例不动它；调用侧喂活卡后为双重保险，判据来源在调用侧也是单点。）
 *
 * 明确**不在**本用例范围（语义不同的守卫/写侧点，按 design §豁免清单登记为基线）：
 * `advance-select.ts` / `Decompose.ts` / `AdvanceChain.ts` / `rollback-tasks.ts` 等——
 * 它们「已取消就跳过」的 `continue` 守卫行为逐字未动。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeHarness, req, task } from './application/harness.js'
import { toSheetTasks } from '../src/application/internal/sheet-tasks.js'
import { clauseReceiveStatus } from '../src/application/internal/content-trace.js'
import { rewriteVerificationDoc } from '../src/application/internal/verification-doc-writer.js'
import { collectMissingAnchors } from '../src/application/internal/content-gate-wiring.js'
import { planBackfill } from '../src/application/internal/backfill-task-refs.js'
import { planRollup } from '../src/domain/workflow/RollupSpec.js'
import { ANCHOR_GAP_PREFIX } from '../src/domain/workflow/AcceptanceSheetSpec.js'
import { submitVerification } from '../src/application/use-cases/SubmitVerification.js'
import type { RequirementRecord, TaskRecord } from '../src/shared/protocol.js'

const REQ_ID = 'REQ-000001'
const EXEC = { agent: { id: 'session-w-001' } }
/** 标本规模（= 真标本 `REQ-261005105032-3b02` 的两个数，改前 132 / 改后 106）。 */
const LIVE = 106
const CANCELED = 26
const pad = (n: number): string => String(n).padStart(3, '0')
const liveId = (i: number): string => 't-live' + pad(i)
const canceledId = (i: number): string => 't-gone' + pad(i)
const liveIds = (): string[] => Array.from({ length: LIVE }, (_, i) => liveId(i))
const canceledIds = (): string[] => Array.from({ length: CANCELED }, (_, i) => canceledId(i))

/**
 * 同一份标本：106 张 done 活卡 + 26 张 canceled。
 * **标题里带 id**：锚点失效清单按「卡标题 → 路径」渲染，带 id 才能让"取消卡条目 === 0"这条断言
 * 同时覆盖 id 与标题两条渲染通道。
 */
const specimen = (): TaskRecord[] => [
  ...Array.from({ length: LIVE }, (_, i) => task({
    id: liveId(i), status: 'done', title: '活卡 ' + liveId(i),
    acceptance: 'npx vitest run tests/canceled-internal-collect.test.ts 通过',
    requirementRefs: ['FR-1'],
  })),
  ...Array.from({ length: CANCELED }, (_, i) => task({
    id: canceledId(i), status: 'canceled', title: '已取消卡 ' + canceledId(i),
    acceptance: 'npx vitest run tests/canceled-internal-collect.test.ts 通过',
    requirementRefs: ['FR-1'],
  })),
]
/** 活卡全取消的标本（空集边界的输入）。 */
const allCanceled = (): TaskRecord[] => specimen().filter(t => t.status === 'canceled')
/** 输出里出现了几张取消卡（按 id 计；0 = 合格）。 */
const canceledHits = (text: string): number => canceledIds().filter(id => text.includes(id)).length

// ── ① 逐收编点的输出 ───────────────────────────────────────────────────────

describe('REQ-261005193546-1b1a t7：收编点输出不含取消卡（标本 106 活 + 26 取消）', () => {
  it('验收单投影 `toSheetTasks`：取消卡 0 条，分母 106', () => {
    const projected = toSheetTasks(specimen())
    expect(projected).toHaveLength(LIVE)
    expect(canceledHits(projected.map(t => t.id).join('\n'))).toBe(0)
  })

  it('追溯投影 `clauseReceiveStatus`：取消卡不算"交付了这条"（活卡仍算）', () => {
    const tasks = specimen()
    const refs = [
      { id: liveId(0), requirement_refs: ['FR-1'] },
      { id: canceledId(0), requirement_refs: ['FR-1'] },
      // 台账未覆盖的 id：缺席 ≠ 已取消，必须原样保留（改前改后逐字一致）
      { id: 't-unknown', requirement_refs: ['FR-1'] },
    ]
    const [onlyCanceled] = clauseReceiveStatus(['FR-1'], [{ id: canceledId(0), requirement_refs: ['FR-1'] }], tasks)
    // 只有取消卡接收 → 回落为"未被接收"（取消 = 不算交付）
    expect(onlyCanceled.state).toBe('unreceived')
    const [mixed] = clauseReceiveStatus(['FR-1'], refs, tasks)
    expect(mixed.by).toEqual([liveId(0), 't-unknown'])
    expect(canceledHits(mixed.by.join('\n'))).toBe(0)
  })

  it('验收文档渲染 `rewriteVerificationDoc`：缺失任务卡清单只点活卡（26 张取消卡不出现）', async () => {
    const h = makeHarness()
    const rec = req({
      id: REQ_ID, title: '收编标本', status: 'implementing',
      verification: {
        summary: '交付', evidence: [],
        submittedAt: 1, submittedBy: { kind: 'agent', sessionId: 'session-w-001' },
        sheet: {
          version: 1,
          generatedAt: 1,
          generatedBy: { kind: 'agent', sessionId: 'session-w-001' },
          items: liveIds().slice(0, 3).map((id, i) => ({
            id: 'v1-' + (i + 1), criterion: 'c' + i, status: 'passed' as const,
            evidence: ['e' + i],
            source: { kind: 'task' as const, taskId: id },
          })),
        },
      },
    }) as unknown as RequirementRecord

    const wrote = await rewriteVerificationDoc(
      { repo: { get: async () => rec }, docs: h.docs },
      REQ_ID,
      specimen(),
    )
    expect(wrote).toBe(true)
    const md = h.docs.files.get('docs/requirements/' + REQ_ID + '/verification.md')?.content ?? ''
    // 目录为空 ⇒ 9 类文档全缺，任务卡逐张点名（每张活卡一行）；取消卡一行都不该有
    expect(md).toContain('tasks/' + liveId(0) + '.md')
    expect(md).toContain('tasks/' + liveId(LIVE - 1) + '.md')
    expect(canceledHits(md)).toBe(0)
  })

  it('回填引用 `planBackfill`：处置对象只含活卡（26 张取消卡不进任何清单）', async () => {
    const h = makeHarness({ requirements: [req({ id: REQ_ID, status: 'implementing' })], tasks: [] })
    await h.addTasks(REQ_ID, specimen())
    const report = await planBackfill(h.deps)
    const plan = report.requirements.find(p => p.requirement_id === REQ_ID)
    expect(plan).toBeDefined()
    const listed = [
      ...plan!.candidates.map(c => c.task_id),
      ...plan!.unresolved.map(u => u.task_id),
      ...plan!.skipped.map(s => s.task_id),
    ]
    expect(listed).toHaveLength(LIVE)
    expect(canceledHits(listed.join('\n'))).toBe(0)
  })

  it('锚点失效探针 `collectMissingAnchors`：清单只由活卡产生（取消卡锚点条目 === 0）', () => {
    const h = makeHarness()
    // 探针护栏要求工作区里有 `tests/`（否则整段跳过）；本处只放目录标记，卡片锚点一律不在册。
    h.docs.put('tests', 'dir')
    const gaps = collectMissingAnchors(h.docs, specimen())
    expect(gaps).toHaveLength(LIVE)
    expect(gaps.join('\n')).toContain(liveId(0))
    expect(canceledHits(gaps.join('\n'))).toBe(0)
  })

  it('rollup 活卡集 `activeTasksOf`（经 `planRollup`）：计数 106，取消卡不进分母', () => {
    const view = {
      requirements: [{ id: REQ_ID, status: 'implementing' as const }],
      tasks: specimen().map(t => ({ requirementId: t.requirementId, status: t.status, id: t.id })),
      triages: [],
    }
    const moves = planRollup(view as never, REQ_ID)
    expect(moves).toHaveLength(1)
    expect(moves[0].to).toBe('accepting')
    // 理由文案里的 count 就是 activeTasksOf 的分母（132 → 会写 132）
    expect(moves[0].reason).toContain(String(LIVE))
    expect(canceledHits(moves[0].reason)).toBe(0)
  })
})

// ── ② 空集边界：活卡 0 张不抛错 ──────────────────────────────────────────────

describe('REQ-261005193546-1b1a t7：活卡 0 张（全取消）标本上三处空集不抛错', () => {
  it('追溯投影：只有取消卡的条款回落为"未被接收"，不抛错', () => {
    const [st] = clauseReceiveStatus(['FR-1'], [{ id: canceledId(0), requirement_refs: ['FR-1'] }], allCanceled())
    expect(st.state).toBe('unreceived')
  })

  it('验收文档渲染：没有活卡时照样写得出来（任务卡清单为空），不抛错', async () => {
    const h = makeHarness()
    const rec = req({
      id: REQ_ID, title: '全取消', status: 'implementing',
      verification: {
        summary: 's', evidence: [],
        submittedAt: 1, submittedBy: { kind: 'agent', sessionId: 'session-w-001' },
        sheet: { version: 1, items: [], generatedAt: 1, generatedBy: { kind: 'agent', sessionId: 'session-w-001' } },
      },
    }) as unknown as RequirementRecord
    await expect(rewriteVerificationDoc(
      { repo: { get: async () => rec }, docs: h.docs }, REQ_ID, allCanceled(),
    )).resolves.toBe(true)
    const md = h.docs.files.get('docs/requirements/' + REQ_ID + '/verification.md')?.content ?? ''
    expect(canceledHits(md)).toBe(0)
  })

  it('rollup 活卡集：分母 0 ⇒ 不产出推进决策（也不抛错）', () => {
    const view = {
      requirements: [{ id: REQ_ID, status: 'implementing' as const }],
      tasks: allCanceled().map(t => ({ requirementId: t.requirementId, status: t.status })),
      triages: [],
    }
    expect(planRollup(view as never, REQ_ID)).toEqual([])
  })
})

// ── ③ SubmitVerification：探针与落盘同分母（走真实用例，读盘上留下的事实）─────────
//
// 覆盖度门禁在**探针**处执法；探针写盘（`rtm-accepting.yml`）发生在执法之前，
// 落盘写盘发生在用例尾部。于是：
//   · 门禁被拒的那一遍 → 盘上留的是**探针写的**那份 ⇒ 读到的分母就是「探针读数」；
//   · 门禁通过的那一遍 → 盘上留的是**落盘写的**那份 ⇒ 读到的分母就是「落盘读数」。
// 两份必须逐字相等；改前是 132（探针吃全量）/ 106（落盘吃过滤后）。

const roots: string[] = []
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }) })

const REQ_MD = [
  '# ' + REQ_ID + ' 收编标本',
  '',
  '## 6. 功能点',
  '',
  '**FR-1 活卡判据单点**：全仓只留一处判断。',
  '',
  '## 10. 测试策略',
  '',
  '| 层级 | 数量 | 说明 |',
  '|---|---|---|',
  '| 单元 | 1 | 纯函数 |',
].join('\n')

/** RTM 生成器读**真实文件系统**（见 doc-gate-e2e 的同款说明），故覆盖度声明必须真落盘。 */
function realWorkspace(testsMd: string): string {
  const root = mkdtempSync(join(tmpdir(), 'collect-e2e-'))
  roots.push(root)
  const p = join(root, 'docs/requirements/' + REQ_ID, 'tests/coverage.md')
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, testsMd)
  return root
}

async function submitHarness(testsMd: string) {
  const h = makeHarness({
    requirements: [req({
      id: REQ_ID, title: '收编标本', status: 'implementing',
      artifacts: [{
        stage: 'design', kind: 'plan', path: 'docs/requirements/' + REQ_ID + '/plan.md',
        registeredAt: 1, registeredBy: { kind: 'agent', sessionId: 'session-w-001' },
      }],
    })],
    tasks: [],
  })
  await h.addTasks(REQ_ID, specimen())
  const dir = 'docs/requirements/' + REQ_ID + '/'
  h.docs.put(dir + 'requirement.md', REQ_MD)
  h.docs.put(dir + 'plan.md', '# 计划')
  h.docs.put(dir + 'decomposition.md', '# 拆分清单')
  h.docs.put(dir + 'design/architecture.md', '# 架构')
  h.docs.put(dir + 'design/data-model.md', '# 数据模型')
  h.docs.put(dir + 'design/interfaces.md', '# 接口')
  h.docs.put(dir + 'design/test-cases.md', '# 测试用例')
  h.docs.put(dir + 'reviews/review-1.md', '# 评审')
  h.docs.put(dir + 'tests/coverage.md', testsMd)
  // 锚点失效探针的护栏要求工作区里**有 `tests/` 目录**（`collectMissingAnchors` 开头即判），
  // 这里放一个目录标记让探针真正跑起来；卡片验收标准引用的 tests/*.test.ts 一律不在册 ⇒ 必产缺口。
  h.docs.put('tests', 'dir')
  for (const t of specimen()) h.docs.put(dir + 'tasks/' + t.id + '.md', '# 任务卡')
  // 根**只解析一次**：`realWorkspace` 每次都新建临时目录，而 `workspaceRoot()` 在多处被调用，
  // 若每次返回新目录，断言读的就是另一个空目录（本用例踩过：ENOENT）。
  const root = realWorkspace(testsMd)
  h.docs.workspaceRoot = () => root
  return { h, root }
}

/** 读回盘上的 `rtm-accepting.yml`（探针或落盘留下的那份）。 */
function acceptingYml(root: string): string {
  const p = join(root, 'docs/requirements/' + REQ_ID, 'rtm-accepting.yml')
  return readFileSync(p, 'utf8')
}
/** `coverage.testing.total`（分母）。 */
function denominatorOf(yml: string): number {
  const m = yml.match(/coverage:\s*\n\s*testing:\s*\n\s*total:\s*(\d+)/)
  expect(m, 'rtm-accepting.yml 里应当有 coverage.testing.total').not.toBeNull()
  return Number(m![1])
}

describe('REQ-261005193546-1b1a t7：SubmitVerification 的探针与落盘同分母（106）', () => {
  it('门禁被拒那一遍：盘上（探针写的）分母 = 106，且没有一张取消卡', async () => {
    // 只声明 1 张活卡有测试 ⇒ 覆盖度远低于 80% ⇒ **探针**阶段被拒（落盘写盘不会发生）
    const { h, root } = await submitHarness('covers: ' + liveId(0) + '\n')
    const message = await submitVerification(h.deps, { summary: '交付', evidence: ['npx vitest run 全绿'] }, EXEC)
      .then(() => { throw new Error('这一遍本应被覆盖度门禁拒绝') }, (err: Error) => String(err.message))
    expect(message).toMatch(/覆盖度门禁/)
    // 门禁读数的分母 = 活卡：点名清单只点未被覆盖的**活卡**（= 106 - 1）；
    // 改前 132 口径会把 26 张取消卡一并点名（这正是真标本「点名 26 张」的由来）。
    const named = liveIds().filter(id => message.includes(id))
    expect(named).toHaveLength(LIVE - 1)
    expect(named).not.toContain(liveId(0))
    expect(canceledHits(message)).toBe(0)
    const yml = acceptingYml(root)
    expect(denominatorOf(yml)).toBe(LIVE)
    expect(canceledHits(yml)).toBe(0)
    expect(yml).not.toContain('status: canceled')
  })

  it('门禁通过那一遍：盘上（落盘写的）分母 = 106，返回体 `tasks_total` 也是 106', async () => {
    // 106 张活卡全部声明 covers ⇒ 106/106 = 100%（改前探针吃全量会读成 106/132 = 80）
    const covers = 'covers: ' + liveIds().join(' ') + '\n'
    const { h, root } = await submitHarness(covers)
    const out = (await submitVerification(h.deps, { summary: '交付', evidence: ['npx vitest run 全绿'] }, EXEC)) as {
      success?: boolean; tasks_total?: number; tasks_done?: number
    }
    expect(out.success).toBe(true)
    expect(out.tasks_total).toBe(LIVE)
    expect(out.tasks_done).toBe(LIVE)
    // ── 锚点失效条目（收口窗口裁定 (b)）：验收文档里取消卡条目 === 0 ──
    // 探针清单（`collectMissingAnchors` 的输出）是验收单/验收文档里那一条「缺失锚点」项的渲染源：
    // 验收单里应点名全部 106 张活卡，26 张取消卡一条都不出现。
    const sheet = (await h.store.get(REQ_ID))?.verification?.sheet
    const gapItems = (sheet?.items ?? []).filter(i => i.criterion.startsWith(ANCHOR_GAP_PREFIX))
    expect(gapItems).toHaveLength(1)
    const gapText = gapItems.map(i => i.criterion).join('\n')
    // 条目的 criterion 只渲染前 6 条（`anchorGaps.slice(0, 6)`，domain 侧既有口径）；
    // 顺序即探针输出顺序 ⇒ 出现的就是前 6 张活卡，取消卡一条都不该有。
    expect(liveIds().slice(0, 6).every(id => gapText.includes(id))).toBe(true)
    expect(canceledHits(gapText)).toBe(0)
    // 落盘的验收文档：任何渲染通道里都不该出现取消卡
    const md = h.docs.files.get('docs/requirements/' + REQ_ID + '/verification.md')?.content ?? ''
    expect(md.length).toBeGreaterThan(0)
    expect(canceledHits(md)).toBe(0)
    const yml = acceptingYml(root)
    expect(denominatorOf(yml)).toBe(LIVE)
    expect(canceledHits(yml)).toBe(0)
    expect(yml).not.toContain('status: canceled')
  })
})

// ── ④ 源码级：收编点不得复活手写取消比较（逆验证锚点）────────────────────────
//
// **逆验证 A**：把落盘那处（`SubmitVerification.ts` 的 `liveTasksOf(await store.listByRequirement(...))`）
// 改回 `(await store.listByRequirement(target.id)).filter(t => t.status !== 'canceled')`，
// 本节的 (a) 断言立刻变红——「同分母」这件事只靠手写 filter 再抄一遍是守不住的。
// **逆验证 B**（收口窗口裁定 (b)）：把锚点失效探针的入参 `liveTargetTasks` 改回 `targetTasks`，
// 本节的 (d) 断言立刻变红——否则「取消卡锚点条目 === 0」只会靠探针内部的守卫侥幸成立。

describe('REQ-261005193546-1b1a t7：收编点只认单点判据（手写 filter 复活即红）', () => {
  /** 断言域内的收编点（t7 负责的六个文件）。 */
  const COLLECTED = [
    'src/application/internal/sheet-tasks.ts',
    'src/application/internal/content-trace.ts',
    'src/application/internal/verification-doc-writer.ts',
    'src/application/internal/backfill-task-refs.ts',
    'src/application/use-cases/SubmitVerification.ts',
    'src/domain/workflow/RollupSpec.ts',
  ]
  /** 手写取消比较（design/backend.md §防漂移 断言 2 的同一正则）。 */
  const HANDWRITTEN = /status\s*(?:!==|===)\s*['"]canceled['"]/
  const SINGLE_POINT = /isLiveTask\(|liveTasksOf\(|liveCountOf\(/

  it('(a) 六个收编点里没有手写取消比较；(b) 都含单点调用', () => {
    for (const rel of COLLECTED) {
      const src = readFileSync(fileURLToPath(new URL('../' + rel, import.meta.url)), 'utf8')
      expect(HANDWRITTEN.test(src), rel + ' 复活了手写取消比较').toBe(false)
      expect(SINGLE_POINT.test(src), rel + ' 没有走单点判据').toBe(true)
    }
  })

  it('(c) SubmitVerification 的探针与落盘都吃活卡（同一判据来源）', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../src/application/use-cases/SubmitVerification.ts', import.meta.url)), 'utf8',
    )
    // 落盘取数：活卡单点过滤（改回手写 filter ⇒ 本节与 (a) 同时红）
    expect(src).toMatch(/liveTasksOf\(await store\.listByRequirement\(target\.id\)\)/)
    // 探针取数：同一份活卡集合（改前是 targetTasks 全量 → 探针 132 / 落盘 106）
    expect(src).toMatch(/syncRTMYaml\(deps, liveTargetTasks, target\.id, 'submit:verification'\)/)
    expect(src).toMatch(/const liveTargetTasks = liveTasksOf\(targetTasks\)/)
  })

  it('(d) 锚点失效探针吃活卡（逆验证 B：改回 targetTasks 即红）', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../src/application/use-cases/SubmitVerification.ts', import.meta.url)), 'utf8',
    )
    expect(src).toMatch(/collectMissingAnchors\(deps\.docs, liveTargetTasks\)/)
  })
})
