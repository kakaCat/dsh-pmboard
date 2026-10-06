/**
 * 两个 RTM 公开入口各自收敛为活卡（REQ-261005193546-1b1a t4 / FR-2 / FR-4）。
 *
 * 要证的三件事（卡面逐条）：
 *  ① **同标本两入口读数逐字段相等**：132 = 106 活卡 + 26 取消卡 ⇒ 覆盖度分母 = 106，
 *     `covered === 106` / `rate === 100` / `uncovered = []` / 门禁 `passed === true`；
 *  ② **对照改前口径**：同标本、同一条 vendor 生成链、只是不带入口那行剔卡 ⇒ 分母 132、
 *     `rate === 80`（压线通过但门禁仍点名 26 张取消卡）——即"分母错一位，完成度永久说谎"的形态；
 *  ③ **全取消标本不执法**：活卡 0 张 ⇒ `coverageGateOf` 返回 `undefined`（不是 0 分、也不是通过）
 *     ——`total <= 0` 的不执法边界**逐字未改**（`coverageGateOf` 一字未动）。
 *
 * 为什么还要**源码级**断言：两个入口的接线是"契约边界"（design/interfaces.md §5 / backend.md
 * §两个 RTM 公开入口）：看板三条路由（`requirements.ts:404`、`:464`、`tasks.ts:174`）**直调**
 * `syncRTMYamlWithSnapshot` 而绕过 `syncRTMYaml`，只给一个入口接线 = 漏三条路径。
 * 行为断言在这条上会**假绿**（两个入口逐个测也能都过，漏的只是"接线只有一处"这件事），
 * 故按函数名切区间做机械检查。
 *
 * 标本是真写盘（vendor 生成器 + 真 fs）：断言的是**返回的 coverage 与盘上 YAML**，
 * 不是 mock 的调用次数。
 *
 * @module dsh-pmboard/tests/rtm-yaml-live-tasks
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import {
  coverageGateOf,
  syncRTMYaml,
  syncRTMYamlWithSnapshot,
} from '../src/application/internal/rtm-yaml.js'
import { RTMGenerator, runRTMTrigger } from '../vendor/reqboard/src/rtm/generator.js'
import type { LedgerReader } from '../vendor/reqboard/src/rtm/context.js'
import type { RTMTaskLike, TestingCoverage } from '../vendor/reqboard/src/rtm/types.js'
import type { UseCaseDeps } from '../src/application/ports.js'
import type {
  ActorRef,
  RequirementRecord,
  TaskRecord,
  TaskStatus,
} from '../src/shared/protocol.js'

const REQ_ID = 'REQ-261005193546-t4'
const HUMAN: ActorRef = { kind: 'human' }

/** 标本规模（卡面：132 = 106 活 + 26 取消）。 */
const LIVE_COUNT = 106
const CANCELED_COUNT = 26
const TOTAL_COUNT = LIVE_COUNT + CANCELED_COUNT

/** 活卡状态轮转：覆盖除 `canceled` 外的全部真实状态（todo 也留在分母——真未完成的证据）。 */
const LIVE_STATUSES: readonly TaskStatus[] = [
  'done',
  'in_progress',
  'todo',
  'testing',
  'integrating',
  'in_review',
]

/** 卡 id：`t-` + 6 位十六进制（与 `newTaskId()` 同形）。 */
function taskIdAt(ordinal: number): string {
  return `t-${ordinal.toString(16).padStart(6, '0')}`
}

/** 活卡 id（前 106 个）。 */
const LIVE_IDS: readonly string[] = Array.from({ length: LIVE_COUNT }, (_, i) => taskIdAt(i + 1))
/** 取消卡 id（后 26 个）。 */
const CANCELED_IDS: readonly string[] = Array.from(
  { length: CANCELED_COUNT },
  (_, i) => taskIdAt(LIVE_COUNT + i + 1),
)

/** 一张卡的最小完整记录（状态由参数给，其余字段固定）。 */
function makeTask(ordinal: number, status: TaskStatus): TaskRecord {
  return {
    id: taskIdAt(ordinal),
    requirementId: REQ_ID,
    title: `标本卡 ${ordinal}`,
    description: 't4 标本',
    phase: 'implement',
    side: 'backend',
    dependsOn: [],
    scope: { apis: [], tables: [], files: [] },
    acceptance: 'n/a',
    implementation: 'design/backend.md#1',
    context: 't4 活卡分母标本',
    requirementRefs: ['FR-1'],
    status,
    blocked: false,
    executions: [],
    statusHistory: [],
    comments: [],
    version: 1,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_001,
    createdBy: HUMAN,
    updatedBy: HUMAN,
  }
}

/** 标本 132 张：前 106 张活卡（状态轮转）+ 后 26 张取消卡。 */
function makeSpecimen(): TaskRecord[] {
  const live = LIVE_IDS.map((_, i) => makeTask(i + 1, LIVE_STATUSES[i % LIVE_STATUSES.length] as TaskStatus))
  const canceled = CANCELED_IDS.map((_, i) => makeTask(LIVE_COUNT + i + 1, 'canceled'))
  return [...live, ...canceled]
}

/** 全取消标本（132 张全是 canceled）——覆盖度分母 0 的极端形态。 */
function makeAllCanceledSpecimen(): TaskRecord[] {
  return Array.from({ length: TOTAL_COUNT }, (_, i) => makeTask(i + 1, 'canceled'))
}

function makeRequirement(): RequirementRecord {
  return {
    id: REQ_ID,
    title: 't4 两个 RTM 公开入口收敛为活卡',
    description: '标本',
    category: 'feature',
    status: 'accepting',
    blocked: false,
    comments: [],
    version: 1,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_001,
    createdBy: HUMAN,
    updatedBy: HUMAN,
    statusHistory: [],
    artifacts: [
      { stage: 'brainstorming', kind: 'requirement', path: 'requirement.md', registeredAt: 1, registeredBy: HUMAN },
    ],
  }
}

/** `syncRTMYaml` 的最小依赖（只用 `docs.workspaceRoot()` + `store.listSummaries/get`）。 */
function makeDeps(root: string, req: RequirementRecord): UseCaseDeps {
  const store = {
    listSummaries: async () => ({ items: [req] }),
    get: async (id: string) => (id === req.id ? req : undefined),
  }
  return { docs: { workspaceRoot: () => root }, store } as unknown as UseCaseDeps
}

/**
 * 落盘标本：`requirement.md`（一条 FR）+ `verification.md`（106 条 `covers: t-xxxxxx`）。
 *
 * **刻意只给 106 张活卡写 `covers`**：26 张取消卡没有测试用例 ⇒ 改前口径下正好是 26 个
 * uncovered（106/132 = 80.3% 取整 80，压线通过但门禁点名 26 张——这正是要消解的病根）。
 */
function seedWorkspace(root: string): string {
  const reqDir = join(root, 'docs', 'requirements', REQ_ID)
  mkdirSync(reqDir, { recursive: true })
  writeFileSync(join(reqDir, 'requirement.md'), ['# 需求说明', '', '**FR-1: 活卡分母**', ''].join('\n'))
  writeFileSync(
    join(reqDir, 'verification.md'),
    ['## 测试证据（TC-1）', '', ...LIVE_IDS.map(id => `- covers: ${id}`), ''].join('\n'),
  )
  return reqDir
}

/** 读回盘上的 `rtm-accepting.yml` 的测试覆盖度（写盘与门禁同源的证据）。 */
function testingCoverageOnDisk(reqDir: string): TestingCoverage {
  interface AcceptingYaml { coverage?: { testing?: TestingCoverage } }
  const doc = parseYaml(readFileSync(join(reqDir, 'rtm-accepting.yml'), 'utf-8')) as AcceptingYaml
  const testing = doc.coverage?.testing
  if (testing === undefined) throw new Error('rtm-accepting.yml 缺 coverage.testing')
  return testing
}

/** 台账任务 → RTM 投影（与 `rtm-yaml.ts` 的 `toTaskLike` 同形；本用例不改那个私有函数）。 */
function toTaskLike(t: TaskRecord): RTMTaskLike {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    phase: t.phase,
    side: t.side,
    depends_on: [...t.dependsOn],
    implements: t.implementation,
    serves: t.requirementRefs,
  }
}

/**
 * **对照改前口径**：同一条 vendor 生成链、同一份台账投影，**只在入口少那行剔卡**
 * ——直接拿全量 132 张卡喂 `RTMGenerator`（改前两个入口内部的真实形态）。
 */
function coverageWithoutLiveFilter(root: string, req: RequirementRecord, tasks: readonly TaskRecord[]): TestingCoverage {
  const ledger: LedgerReader = {
    requirement: id => (id === req.id
      ? { id: req.id, title: req.title, category: req.category ?? '', status: req.status }
      : undefined),
    tasksOf: id => (id === req.id ? tasks.map(toTaskLike) : []),
  }
  const generator = new RTMGenerator({ workspaceRoot: root, ledger, generatedBy: 'control' })
  const result = runRTMTrigger(generator, 'submit:verification', req.id)
  expect(result.ok).toBe(true)
  const coverage = result.coverage as TestingCoverage | undefined
  if (coverage === undefined) throw new Error('对照标本没有覆盖度产出')
  return coverage
}

// ─────────────────────────────────────────────────────────────────────────────
// 源码级接线断言：两个入口函数体各自都必须有那行
// ─────────────────────────────────────────────────────────────────────────────

const HOST_SRC = new URL('../src/application/internal/rtm-yaml.ts', import.meta.url)
const ENTRY_A = 'export async function syncRTMYaml('
const ENTRY_B = 'export function syncRTMYamlWithSnapshot('

/** 去掉行注释后的代码（注释里提到别的模块名不算"引用了入参 tasks"）。 */
function codeOnly(text: string): string {
  return text
    .split('\n')
    .map(line => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/**
 * 按函数名切区间取入口函数体。
 *
 * 用「下一个入口的起点」作右界而不是括号配对：本文件里有注释含反引号与花括号，
 * 括号计数会被字符串/注释里的括号带偏；两个入口的声明顺序在同一文件内是稳定的。
 */
function entrySource(source: string, header: string): string {
  const start = source.indexOf(header)
  if (start < 0) throw new Error(`源码里找不到入口：${header}`)
  const nextStart = header === ENTRY_A ? source.indexOf(ENTRY_B, start) : source.length
  return source.slice(start, nextStart < 0 ? source.length : nextStart)
}

/** 函数体（跳过签名）：从签名后第一个 `{` 开始到区间末尾。 */
function bodyOf(source: string, header: string): string {
  const slice = entrySource(source, header)
  const open = slice.indexOf('{', header.length)
  if (open < 0) throw new Error(`入口没有函数体：${header}`)
  return slice.slice(open + 1)
}

/** 函数体里第一条有意义的代码行（跳过注释与空行）。 */
function firstStatementOf(source: string, header: string): string {
  const lines = codeOnly(bodyOf(source, header)).split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length > 0) return trimmed
  }
  throw new Error(`入口函数体是空的：${header}`)
}

/** 那行之后的所有代码（用于断言"其后只用 live、不再引用入参 tasks"）。 */
function codeAfterLiveLine(source: string, header: string): string {
  const code = codeOnly(bodyOf(source, header))
  const at = code.indexOf('const live = liveTasksOf(tasks)')
  if (at < 0) throw new Error(`入口函数体里没有剔卡行：${header}`)
  return code.slice(at + 'const live = liveTasksOf(tasks)'.length)
}

describe('两个 RTM 公开入口收敛为活卡（t4）', () => {
  let rootA: string
  let rootB: string
  let reqDirA: string
  let req: RequirementRecord

  beforeEach(() => {
    rootA = mkdtempSync(join(tmpdir(), 'rtm-live-a-'))
    rootB = mkdtempSync(join(tmpdir(), 'rtm-live-b-'))
    reqDirA = seedWorkspace(rootA)
    seedWorkspace(rootB)
    req = makeRequirement()
  })

  afterEach(() => {
    rmSync(rootA, { recursive: true, force: true })
    rmSync(rootB, { recursive: true, force: true })
  })

  it('① 同标本两入口读数逐字段相等：分母 106 / 100% / 通过 / 0 缺口（返回体与盘上 YAML 同源）', async () => {
    const specimen = makeSpecimen()
    expect(specimen).toHaveLength(TOTAL_COUNT) // 132 = 106 + 26（标本自检，别写错数）

    // 入口 A：syncRTMYaml（18 个业务调用点走它）
    const resultA = await syncRTMYaml(makeDeps(rootA, req), specimen, REQ_ID, 'submit:verification')
    expect(resultA?.ok).toBe(true)
    const coverageA = resultA?.coverage as TestingCoverage | undefined
    expect(coverageA).toBeDefined()
    if (coverageA === undefined) return

    // 入口 B：syncRTMYamlWithSnapshot（看板三条路由直调它，绕过 A）
    const resultB = syncRTMYamlWithSnapshot(
      rootA,
      { requirements: [req] },
      specimen,
      REQ_ID,
      'submit:verification',
    )
    expect(resultB?.ok).toBe(true)
    const coverageB = resultB?.coverage as TestingCoverage | undefined
    expect(coverageB).toBeDefined()
    if (coverageB === undefined) return

    // 逐字段相等（不是"都差不多"：两入口共用同一个剔卡口径）
    expect(coverageA).toEqual(coverageB)

    // 卡面逐条读数：分母 = 活卡 106
    expect(coverageA.total).toBe(LIVE_COUNT)
    expect(coverageA.covered).toBe(LIVE_COUNT)
    expect(coverageA.rate).toBe(100)
    expect(coverageA.uncovered).toEqual([])
    expect(coverageA.total_tasks).toBe(LIVE_COUNT)
    expect(coverageA.tested_tasks).toBe(LIVE_COUNT)
    expect(coverageA.untested).toEqual([])

    // 门禁：通过，且分母就是 106（文案里的 covered/total 天然可见）
    const gate = coverageGateOf('accepting', resultA)
    expect(gate?.passed).toBe(true)
    expect(gate?.coverage.total).toBe(LIVE_COUNT)

    // 写盘 YAML 与返回体同源（门禁读的就是这份 coverage，不可能两套口径）
    expect(testingCoverageOnDisk(reqDirA).total).toBe(LIVE_COUNT)
    expect(testingCoverageOnDisk(reqDirA)).toEqual(coverageA)
  })

  it('② 对照改前口径：不做活卡过滤 ⇒ 分母 132 / rate 80 / 缺口恰好 26 张取消卡', () => {
    const specimen = makeSpecimen()
    // 对照标本走**同一个种子工作区 B**（同标本、同生成链），只在入口少那行剔卡
    const control = coverageWithoutLiveFilter(rootB, req, specimen)

    expect(control.total).toBe(TOTAL_COUNT)
    expect(control.covered).toBe(LIVE_COUNT)
    expect(control.rate).toBe(80) // 106/132 = 80.3% → 80：压线通过，但缺口仍在
    expect(control.uncovered).toHaveLength(CANCELED_COUNT)
    expect(control.uncovered).toEqual([...CANCELED_IDS]) // 点名的正是 26 张取消卡
    expect(control.rate).toBeLessThan(100)
  })

  it('③ 全取消标本：活卡 0 张 ⇒ 门禁不执法（undefined，不是 0 分也不是通过）', async () => {
    const allCanceled = makeAllCanceledSpecimen()
    rmSync(rootA, { recursive: true, force: true })
    rootA = mkdtempSync(join(tmpdir(), 'rtm-live-canceled-'))
    reqDirA = seedWorkspace(rootA)

    const result = await syncRTMYaml(makeDeps(rootA, req), allCanceled, REQ_ID, 'submit:verification')
    expect(result?.ok).toBe(true)
    const coverage = result?.coverage as TestingCoverage | undefined
    expect(coverage?.total).toBe(0) // 分母 0：无项可判
    expect(coverage?.uncovered).toEqual([])

    // 不执法：`coverageGateOf` 的 `total <= 0 → undefined` 边界逐字保留（该函数一字未改）
    expect(coverageGateOf('accepting', result)).toBeUndefined()

    // 盘上 YAML 也如实写 0（不是"没写"、也不是假装 100% 已覆盖）
    expect(testingCoverageOnDisk(reqDirA).total).toBe(0)

    // 反面对照：同一入口在"有活卡"时是执法的（否则上面的 undefined 说明不了任何事）
    const specimen = makeSpecimen()
    const live = await syncRTMYaml(makeDeps(rootA, req), specimen, REQ_ID, 'submit:verification')
    expect(coverageGateOf('accepting', live)).toBeDefined()
  })

  it('④ 源码级接线：两个入口函数体顶部第一行都是 `const live = liveTasksOf(tasks)`，其后只用 live', () => {
    const source = readFileSync(HOST_SRC, 'utf-8')

    for (const header of [ENTRY_A, ENTRY_B]) {
      // 函数体顶部第一行（跳过注释后的第一条语句）
      expect(firstStatementOf(source, header)).toBe('const live = liveTasksOf(tasks)')

      // 函数体内必须出现剔卡调用（"哪个入口漏接线"一眼可见）
      const body = bodyOf(source, header)
      expect(body).toContain('liveTasksOf(')

      // 其后函数体内**只允许使用 live**：不得再引用入参 tasks
      expect(codeAfterLiveLine(source, header)).not.toMatch(/\btasks\b/)

      // 入参名仍是 tasks（签名不变），剔卡是"收敛"而不是"改名绕过"
      expect(entrySource(source, header)).toContain('tasks: readonly TaskRecord[]')
    }

    // 幂等锁：同一条剔卡口径来自 domain 单点，宿主不再自写 `!== 'canceled'`
    expect(source).not.toMatch(/status\s*!==\s*'canceled'/)
  })
})
