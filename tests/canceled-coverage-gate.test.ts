/**
 * TC-5：覆盖度门两条入口同得分母；对照改前的**两种**失败形态（REQ-261005193546-1b1a t12 / FR-2）。
 *
 * ## 标本（本仓真标本同形：`REQ-261005105032-3b02` 的 `queue.json` = 132 卡 = 106 done + 26 canceled）
 * S-1：**106 活卡 + 26 已取消卡**，id 形如 `t-l000…t-l105` / `t-g000…t-g025`。
 * 覆盖度标注走**真落盘**（`docs/requirements/<REQ>/verification.md` 的 `covers: t-xxx`）——
 * RTM 生成器读真实文件系统，内存桩喂不进去（与 `canceled-internal-collect` 同款取样手法）。
 * **全部标本走临时工作区**（`mkdtempSync`），一个字节都不写生产需求目录。
 *
 * ## 主读数 + 四组对照（design/test-cases.md TC-5 + design/backend.md §覆盖度分母口径）
 * | 组 | 标本 | 分母 | 期望 |
 * |---|---|---|---|
 * | 主 | S-1，106 张活卡全有 `covers` | 106 | `106/106 = 100%` → `passed === true` |
 * | A | 改前口径（**不过滤**的 132 张喂 vendor 生成链），标注齐全 | 132 | `106/132 = 80.3%` → `rate === 80` **压线通过**，但 `uncovered` **仍点名 26 张**（两段历史里的第 ② 段） |
 * | B | `covers` 标注为 **0** | 132 / 106 | `rate === 0` → **真正被拒**（第 ① 段，上一条需求真实发生过的那次）+ 传输码 `REQBOARD_TESTING_COVERAGE_GATE` |
 * | C | S-1 再取消 5 张（从没标注 covers 的卡：全部 137 = 106 活 + 31 取消） | 137（改前）/ 106（现行） | 改前 `106/137 = 77 < 80` → 被拒；**现行 106/106 = 100% 不被惩罚**（可证伪外推） |
 * | 空 | 活卡 0 张（全取消） | 0 | 门**不执法**：`coverageGateOf(...) === undefined`（既不是 0 分被拒，也不是 100% 通过） |
 *
 * **两段历史必须分列**（假红防线 3）：A 的错因是「分母含取消卡」，B 的错因是「根本没标注」。
 * 合成一句「覆盖率不足」会把真正的回归面盖掉——故 A / B 各自一个 `it`，互不替代。
 *
 * ## 与设计的一处如实说明
 * 对照 C 的「被拒」只存在于**改前口径**：现行两个入口都在函数体第一行收敛为活卡，
 * 于是「再取消几张」不再进分母、不可能被拒（这正是本需求要撤销的惩罚）。故 C 的
 * 「同一传输码」由两条证据钉住：① 上面 B 组**真跑 `submitVerification`** 观测到的码；
 * ② 「accepting 门禁失败 → REQBOARD_TESTING_COVERAGE_GATE」在生产里只有一处（源码锚点）。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeHarness, req, task } from './application/harness.js'
import {
  coverageGateOf,
  syncRTMYaml,
  syncRTMYamlWithSnapshot,
  type RTMLedgerSnapshot,
} from '../src/application/internal/rtm-yaml.js'
import { submitVerification } from '../src/application/use-cases/SubmitVerification.js'
import { liveCountOf } from '../src/domain/status/Predicates.js'
import { RTMGenerator, runRTMTrigger, type RTMTriggerResult } from '../vendor/reqboard/src/rtm/generator.js'
import type { LedgerReader } from '../vendor/reqboard/src/rtm/context.js'
import type { GateResult, RTMTaskLike } from '../vendor/reqboard/src/rtm/types.js'
import type { RequirementRecord, TaskRecord } from '../src/shared/protocol.js'

const REQ_ID = 'REQ-000106'
const WINDOW = 'session-w-001'
const EXEC = { agent: { id: WINDOW } }
const HUMAN = { kind: 'human' as const }
/** 标本规模（= 真标本 `REQ-261005105032-3b02` 的两个数，改前 132 / 改后 106）。 */
const LIVE = 106
const CANCELED = 26
const DONE = 100
/** 在途活卡的 6 种状态（100 done + 6 在途 = 106）。 */
const NON_DONE: ReadonlyArray<TaskRecord['status']> = [
  'todo', 'in_progress', 'integrating', 'testing', 'in_review', 'in_progress',
]
const ACCEPTANCE = 'npx vitest run tests/canceled-coverage-gate.test.ts 全绿'
const DIR = 'docs/requirements/' + REQ_ID

const pad3 = (n: number): string => String(n).padStart(3, '0')
const liveId = (i: number): string => 't-l' + pad3(i)
const goneId = (i: number): string => 't-g' + pad3(i)
const liveIds = (): string[] => Array.from({ length: LIVE }, (_, i) => liveId(i))
const goneIds = (): string[] => Array.from({ length: CANCELED }, (_, i) => goneId(i))
/** 对照 C：再取消的 5 张（**从没标注过 covers** 的卡，与 S-1 那 26 张同形）。 */
const fiveMoreGoneId = (i: number): string => 't-x' + pad3(i)
const fiveMoreGoneIds = (): string[] => Array.from({ length: 5 }, (_, i) => fiveMoreGoneId(i))

/* ───────────────────────────────────────────────────────── 标本 */

/** 106 活卡（100 done + 6 在途）+ 26 已取消卡。 */
function specimenTasks(): TaskRecord[] {
  const live: TaskRecord[] = []
  for (let i = 0; i < LIVE; i += 1) {
    live.push(task({
      id: liveId(i),
      requirementId: REQ_ID,
      title: '活卡 ' + liveId(i),
      status: i < DONE ? 'done' : NON_DONE[i - DONE]!,
      acceptance: ACCEPTANCE,
      requirementRefs: ['FR-1'],
    }))
  }
  const canceled: TaskRecord[] = []
  for (let i = 0; i < CANCELED; i += 1) {
    canceled.push(task({
      id: goneId(i),
      requirementId: REQ_ID,
      title: '已取消卡 ' + goneId(i),
      status: 'canceled',
      acceptance: ACCEPTANCE,
      requirementRefs: ['FR-1'],
    }))
  }
  return [...live, ...canceled]
}

/**
 * 对照 C 的标本：S-1 **再取消 5 张**（这 5 张从没标注过 covers，与那 26 张同形）——
 * 全部卡 137 = 106 活卡（全有 covers）+ 31 已取消（一张都没有 covers）。
 *
 * 为什么不是"把 5 张活卡改成取消"：那样改前口径的分母仍是 132、分子仍是 106 ⇒ `rate` 恒为 80
 * （压线通过），得不到 design/backend.md §可证伪的风险触发条件里那个"再取消即被拒"的读数
 * （分母 133/134、分子固定 106）。**取消掉的卡本来就没有测试**才是真标本的形态。
 */
function specimenWithFiveMoreCanceled(): TaskRecord[] {
  const extra: TaskRecord[] = fiveMoreGoneIds().map(id => task({
    id,
    requirementId: REQ_ID,
    title: '再取消卡 ' + id,
    status: 'canceled',
    acceptance: ACCEPTANCE,
    requirementRefs: ['FR-1'],
  }))
  return [...specimenTasks(), ...extra]
}

/** 活卡 0 张（全取消）——空集合边界。 */
function allCanceledTasks(): TaskRecord[] {
  return specimenTasks().map(t => ({ ...t, status: 'canceled' as const }))
}

function specimenRequirement(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return req({
    id: REQ_ID,
    title: '覆盖度门标本（132 = 106 活卡 + 26 已取消）',
    category: 'feature',
    status: 'implementing',
    sourceSessionId: WINDOW,
    artifacts: [{
      stage: 'design', kind: 'plan', path: DIR + '/plan.md',
      registeredAt: 1, registeredBy: HUMAN,
    }],
    ...over,
  })
}

/** 台账任务 → RTM 投影（与 `rtm-yaml.ts` 的私有 `toTaskLike` 同形；本用例不改那个私有函数）。 */
function toTaskLike(t: TaskRecord): RTMTaskLike {
  return {
    id: t.id, title: t.title, status: t.status, phase: t.phase, side: t.side,
    depends_on: [...(t.dependsOn ?? [])], implements: t.implementation, serves: t.requirementRefs,
  }
}

/* ───────────────────────────────────────── 真落盘：临时工作区（不碰生产需求目录） */

const roots: string[] = []
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }) })

function newRoot(tag: string): string {
  const root = mkdtempSync(join(tmpdir(), 'pmboard-cov-gate-' + tag + '-'))
  roots.push(root)
  return root
}

/** 覆盖度标注文档：有 id 就写 `covers:`，没有就**一个标注都不写**（对照 B 的标本）。 */
function coversDoc(ids: readonly string[]): string {
  return [
    '## 测试证据',
    '',
    ...(ids.length > 0 ? ['- covers: ' + ids.join(' ')] : ['本文件刻意不写任何覆盖标注。']),
    '',
  ].join('\n')
}

/** 真落盘 `requirement.md` + `verification.md`（后者带 `covers:` 标注）。 */
function seedWorkspace(root: string, ids: readonly string[]): void {
  const dir = join(root, DIR)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'requirement.md'), ['# 需求说明', '', '**FR-1: 覆盖度门**', ''].join('\n'))
  writeFileSync(join(dir, 'verification.md'), coversDoc(ids))
}

/* ───────────────────────────────────────────────── 读数（门禁结果 → 可断言字段） */

function mustGate(gate: GateResult | undefined): GateResult {
  if (gate === undefined) throw new Error('期望拿到门禁读数，实际 undefined（= 不执法）')
  return gate
}

/** 门禁结果的**逐字段**投影（两入口「逐字段相等」的比对基准）。 */
function gateFields(gate: GateResult): Record<string, unknown> {
  return {
    stage: gate.stage,
    threshold: gate.threshold,
    passed: gate.passed,
    message: gate.message ?? null,
    total: gate.coverage.total,
    covered: gate.coverage.covered,
    rate: gate.coverage.rate,
    uncovered: [...gate.coverage.uncovered],
  }
}

/** 触发结果里的测试覆盖度读数（`total_tasks` / `untested` 一并在内，别只比 rate）。 */
function coverageFields(result: RTMTriggerResult | undefined): Record<string, unknown> {
  if (result?.coverage === undefined) throw new Error('本次触发没有覆盖度产出')
  const c = result.coverage as { total: number; covered: number; rate: number; uncovered: string[]; total_tasks?: number; untested?: string[] }
  return {
    total: c.total, covered: c.covered, rate: c.rate,
    uncovered: [...c.uncovered],
    total_tasks: c.total_tasks ?? null,
    untested: [...(c.untested ?? [])],
  }
}

/* ───────────────────────────────────────── 入口 ①：syncRTMYaml（会话工具侧） */

function entryOne(root: string, tasks: readonly TaskRecord[]): Promise<RTMTriggerResult | undefined> {
  const h = makeHarness({ requirements: [specimenRequirement()] })
  h.seedTasks(REQ_ID, tasks)
  // RTM 生成器走**真实文件系统**（工作区根来自 deps.docs.workspaceRoot()）。
  h.docs.workspaceRoot = () => root
  return syncRTMYaml(h.deps, tasks, REQ_ID, 'submit:verification')
}

/* ───────────────────────────────────────── 入口 ②：syncRTMYamlWithSnapshot（看板路由侧） */

function entryTwo(root: string, tasks: readonly TaskRecord[]): RTMTriggerResult | undefined {
  const snapshot: RTMLedgerSnapshot = { requirements: [specimenRequirement()] }
  return syncRTMYamlWithSnapshot(root, snapshot, tasks, REQ_ID, 'submit:verification')
}

/**
 * **对照改前口径**：同一份台账、同一条 vendor 生成链，只在入口少那行剔卡
 * ——直接拿全量喂 `RTMGenerator`（改前入口内部的真实形态）。
 */
function legacyProbe(root: string, tasks: readonly TaskRecord[]): RTMTriggerResult {
  const record = specimenRequirement()
  const ledger: LedgerReader = {
    requirement: id => (id === record.id
      ? { id: record.id, title: record.title, category: record.category ?? '', status: record.status }
      : undefined),
    tasksOf: id => (id === record.id ? tasks.map(toTaskLike) : []),
  }
  const result = runRTMTrigger(
    new RTMGenerator({ workspaceRoot: root, ledger, generatedBy: 'legacy-caliber' }),
    'submit:verification',
    REQ_ID,
  )
  expect(result.ok, '改前口径标本没有产出覆盖度：' + String(result.error)).toBe(true)
  expect(result.coverage, '改前口径标本的触发点没有覆盖度产出').toBeDefined()
  return result
}

/* ═══════════════════════════════════════════════ ① 两条入口同得分母 ═══════════════════════════ */

describe('TC-5 · 两条入口同得分母（S-1：132 = 106 活卡 + 26 已取消，106 张活卡全有 covers）', () => {
  it('两条入口都 106/106 = 100% 通过，且门禁读数逐字段相等（不许一条 106、一条 132）', async () => {
    const tasks = specimenTasks()
    expect(tasks).toHaveLength(LIVE + CANCELED)
    expect(liveCountOf(tasks)).toBe(LIVE)

    const rootA = newRoot('entry-a')
    seedWorkspace(rootA, liveIds())
    const probeA = await entryOne(rootA, tasks)

    const rootB = newRoot('entry-b')
    seedWorkspace(rootB, liveIds())
    const probeB = entryTwo(rootB, tasks)

    expect(probeA?.ok, '入口 ①（syncRTMYaml）本次没有成功产出').toBe(true)
    expect(probeB?.ok, '入口 ②（syncRTMYamlWithSnapshot）本次没有成功产出').toBe(true)

    // 探针本身的读数也必须一致（覆盖度是同一份，不是"门禁读一份、文件写另一份"）
    expect(coverageFields(probeA)).toEqual(coverageFields(probeB))
    expect(coverageFields(probeA)).toMatchObject({
      total: LIVE, covered: LIVE, rate: 100, uncovered: [], total_tasks: LIVE, untested: [],
    })

    const gateA = mustGate(coverageGateOf('accepting', probeA))
    const gateB = mustGate(coverageGateOf('accepting', probeB))

    // 逐字段相等（不是"看着像"）：改一条入口 ⇒ 本断言立刻分叉
    expect(Object.keys(gateFields(gateA)).sort()).toEqual(Object.keys(gateFields(gateB)).sort())
    expect(gateFields(gateA)).toEqual(gateFields(gateB))

    // 主读数逐项点明（假红防线 4：断言等式与关系式，不把标量当契约）
    expect(gateA.coverage.total).toBe(LIVE)
    expect(gateA.coverage.total).toBe(liveCountOf(tasks))
    expect(gateA.coverage.total).not.toBe(LIVE + CANCELED) // 132 是改前口径
    expect(gateA.coverage.covered).toBe(LIVE)
    expect(gateA.coverage.rate).toBe(100)
    expect(gateA.coverage.uncovered).toEqual([])
    expect(gateA.passed).toBe(true)
    expect(gateA.stage).toBe('accepting')
    expect(gateA.threshold).toBe(80) // 测试阈值语义**不动**
  })
})

/* ═════════════════════════════════════════ ② 对照 A：压线通过但点名 26 张 ═══════════════════ */

describe('TC-5 · 对照 A（改前口径 ①：分母含取消卡，标注齐全）', () => {
  it('132 分母、rate 80 恰好压线通过 —— 但 uncovered 仍点名 26 张取消卡', () => {
    const root = newRoot('legacy-a')
    seedWorkspace(root, liveIds())
    const result = legacyProbe(root, specimenTasks())

    const gate = mustGate(coverageGateOf('accepting', result))

    expect(result.coverage!.total).toBe(LIVE + CANCELED) // 132 = 改前的分母
    expect(result.coverage!.covered).toBe(LIVE)
    expect(result.coverage!.rate).toBe(80) // 106/132 = 80.3% → 取整 80，恰好压阈值
    expect(gate.passed).toBe(true) // **压线通过**（80 >= 80）——不是被拒
    expect(gate.threshold).toBe(80)
    expect(gate.message).toBeUndefined()

    // 通过归通过，门禁/落盘**仍然点名 26 张**（写进 rtm-accepting.yml 的 coverage.testing.untested[]）
    const uncovered = [...result.coverage!.uncovered]
    expect(uncovered).toHaveLength(CANCELED)
    expect([...uncovered].sort()).toEqual([...goneIds()].sort())
    expect(uncovered.some(id => liveIds().includes(id))).toBe(false)
    const untested = (result.coverage as { untested?: string[] }).untested ?? []
    expect(untested).toHaveLength(CANCELED)

    // 与主读数的差值恰好 == 台账取消卡数（改前口径的错因：**分母含取消卡**）
    expect(gate.coverage.total - LIVE).toBe(CANCELED)
  })
})

/* ═════════════════════════════════════════ ③ 对照 B：covers 为 0，真被拒 ══════════════════════ */

describe('TC-5 · 对照 B（改前口径 ②：covers 标注为 0 —— 上一条需求真实发生过的那次）', () => {
  it('改前口径 0/132：rate 0、passed false（错因是"没标注"，不是分母）', () => {
    const root = newRoot('legacy-b')
    seedWorkspace(root, []) // 一个 covers 标注都不写
    const result = legacyProbe(root, specimenTasks())
    const gate = mustGate(coverageGateOf('accepting', result))

    expect(result.coverage!.total).toBe(LIVE + CANCELED)
    expect(result.coverage!.covered).toBe(0)
    expect(result.coverage!.rate).toBe(0)
    expect(gate.passed).toBe(false)
    expect(gate.stage).toBe('accepting')
    expect(gate.message).toBeDefined()
    expect(gate.message).toContain('覆盖度不足')
    // **点名的对象是"全部卡"**（不是"26 张取消卡"）：与对照 A 的错因不同，不许混成一条
    expect([...result.coverage!.uncovered].sort()).toEqual(
      [...liveIds(), ...goneIds()].sort(),
    )
  })

  it('现行口径 0/106 同样是 rate 0 → passed false（"没标注"这类失败与分母口径无关）', async () => {
    const root = newRoot('now-b')
    seedWorkspace(root, [])
    const probe = await entryOne(root, specimenTasks())
    const gate = mustGate(coverageGateOf('accepting', probe))

    expect(probe!.coverage!.total).toBe(LIVE) // 分母已剔卡
    expect(probe!.coverage!.covered).toBe(0)
    expect(probe!.coverage!.rate).toBe(0)
    expect(gate.passed).toBe(false)
    expect(gate.message).toContain('覆盖度不足')
  })

  it('真跑 submitVerification：传输码 REQBOARD_TESTING_COVERAGE_GATE（门禁确实在传输层执法）', async () => {
    const { h } = await submitHarness(coversDoc([]), specimenTasks())
    const err = await submitVerification(
      h.deps,
      { summary: '交付', evidence: ['npx vitest run 全绿'] },
      EXEC,
    ).then(() => undefined, (e: Error & { code?: string }) => e)
    expect(err, 'covers 为 0 的标本本应被覆盖度门禁拒绝').toBeDefined()
    expect(err!.code).toBe('REQBOARD_TESTING_COVERAGE_GATE')
    expect(err!.message).toContain('测试覆盖度门禁')
  })

  it('源码锚点：accepting 门禁失败 → REQBOARD_TESTING_COVERAGE_GATE 在生产里只有一处', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../src/application/use-cases/SubmitVerification.ts', import.meta.url)), 'utf8',
    )
    expect(src).toMatch(/coverageGateOf\('accepting', verifyGateProbe\)/)
    // 全仓只有这一处产生该传输码（对照 C 的"同一码"由此钉住）
    expect(src.split('REQBOARD_TESTING_COVERAGE_GATE').length - 1).toBe(1)
  })
})

/* ═══════════════════════════════════════ ④ 对照 C：再取消 5 张（可证伪外推） ═════════════════ */

describe('TC-5 · 对照 C（再取消 5 张：分母 132 → 137 越过阈值；现行口径不再被惩罚）', () => {
  it('改前口径 106/137 = 77 < 80 → 被拒（同一 accepting 门禁）', () => {
    const root = newRoot('legacy-c')
    seedWorkspace(root, liveIds()) // 标注照旧覆盖最初那 106 张活卡
    const tasks = specimenWithFiveMoreCanceled()
    expect(liveCountOf(tasks)).toBe(LIVE)
    expect(tasks.length - liveCountOf(tasks)).toBe(CANCELED + 5)

    const result = legacyProbe(root, tasks)
    const gate = mustGate(coverageGateOf('accepting', result))

    expect(result.coverage!.total).toBe(LIVE + CANCELED + 5) // 137
    expect(result.coverage!.covered).toBe(LIVE)
    expect(result.coverage!.rate).toBe(77) // 106/137 = 77.4% → 77 < 80
    expect(gate.passed).toBe(false)
    expect(gate.threshold).toBe(80)
    expect(gate.message).toContain('覆盖度不足')
  })

  it('现行口径同一标本 106/106 = 100% 通过：取消动作不再被门禁惩罚', async () => {
    const tasks = specimenWithFiveMoreCanceled()
    const root = newRoot('now-c')
    seedWorkspace(root, liveIds())
    const probe = await entryOne(root, tasks)
    const gate = mustGate(coverageGateOf('accepting', probe))

    expect(probe!.coverage!.total).toBe(LIVE)
    expect(probe!.coverage!.covered).toBe(LIVE)
    expect(probe!.coverage!.rate).toBe(100)
    expect(probe!.coverage!.uncovered).toEqual([])
    expect(gate.passed).toBe(true)
    // 同一标本、同一份标注：两个口径的分母差值恰好 == 台账取消卡数（26 + 5 = 31），分子不变。
    // 这条等式就是"惩罚消失"的量化形式，也是改前口径错因（分母含取消卡）的直接证据。
    expect((LIVE + CANCELED + 5) - probe!.coverage!.total).toBe(CANCELED + 5)
    expect(probe!.coverage!.covered).toBe(LIVE)
  })
})

/* ═══════════════════════════════════════════ ⑤ 空集合：门不执法（不是 0 分） ═══════════════ */

describe('TC-5 · 活卡 0 张：无项可判 ⇒ 门不执法', () => {
  it('全取消标本上 coverageGateOf === undefined（既不是 100% 通过，也不是 0 分被拒）', async () => {
    const tasks = allCanceledTasks()
    expect(liveCountOf(tasks)).toBe(0)

    const root = newRoot('empty')
    seedWorkspace(root, [])
    const probe = await entryOne(root, tasks)

    expect(probe?.ok).toBe(true)
    expect(probe!.coverage).toBeDefined()
    expect(probe!.coverage!.total).toBe(0)
    // `rateOf(0, 0)` 按 vacuous truth 给 100 —— 这正是"不能把空集合当满分"的原因：
    expect(probe!.coverage!.rate).toBe(100)
    expect(probe!.coverage!.uncovered).toEqual([])
    // 门禁的既有早退分支（total <= 0 → undefined）**一字不改**：不拦截，也不判 0 分
    expect(coverageGateOf('accepting', probe)).toBeUndefined()
    expect(coverageGateOf('accepting', undefined)).toBeUndefined()
  })
})

/* ═══════════════════════════════════ submitVerification 的真标本（对照 B 用） ═══════════════ */

const REQ_MD = [
  '# ' + REQ_ID + ' 覆盖度门标本',
  '',
  '## 6. 功能点',
  '',
  '**FR-1 覆盖度分母剔卡**：取消卡不进分母。',
  '',
  '## 10. 测试策略',
  '',
  '| 层级 | 数量 | 说明 |',
  '|---|---|---|',
  '| 单元 | 1 | 纯函数 |',
].join('\n')

/** 真工作区：`verification.md` 里的 `covers:` 标注必须真落盘，生成器才读得到。 */
function realWorkspace(verificationMd: string): string {
  const root = mkdtempSync(join(tmpdir(), 'cov-gate-e2e-'))
  roots.push(root)
  const p = join(root, DIR, 'verification.md')
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, verificationMd)
  return root
}

/**
 * `submitVerification` 的真标本（9 类文档齐 + 需求绑定本窗口 + artifacts 非空 ⇒ 不豁免）。
 * 与 `canceled-internal-collect` 的同一套取样手法：门禁读的是它自己那条生产路径。
 */
async function submitHarness(
  verificationMd: string,
  tasks: readonly TaskRecord[],
): Promise<{ h: ReturnType<typeof makeHarness>; root: string }> {
  const h = makeHarness({ requirements: [specimenRequirement()], tasks: [] })
  await h.addTasks(REQ_ID, tasks)
  const dir = DIR + '/'
  h.docs.put(dir + 'requirement.md', REQ_MD)
  h.docs.put(dir + 'plan.md', '# 计划')
  h.docs.put(dir + 'decomposition.md', '# 拆分清单')
  h.docs.put(dir + 'design/architecture.md', '# 架构')
  h.docs.put(dir + 'design/data-model.md', '# 数据模型')
  h.docs.put(dir + 'design/interfaces.md', '# 接口')
  h.docs.put(dir + 'design/test-cases.md', '# 测试用例')
  h.docs.put(dir + 'reviews/review-1.md', '# 评审')
  h.docs.put(dir + 'tests/coverage.md', verificationMd)
  h.docs.put('tests', 'dir')
  for (const t of tasks) h.docs.put(dir + 'tasks/' + t.id + '.md', '# 任务卡')
  const root = realWorkspace(verificationMd)
  h.docs.workspaceRoot = () => root
  return { h, root }
}
