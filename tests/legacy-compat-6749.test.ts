/**
 * 兼容与迁移回归（REQ-261007100513-6749 **t7** · 子卡 t-6c1af5 研发段）。
 *
 * 本需求往系统里加的都是**加性可选**的东西：台账可选字段 `TaskRecord.budgetRequests`、
 * `reqboard_task_move` 的新入参 `tasks[]` / `budget`（含 CAS 值 `expectedWindowIndex`）、
 * 两个运行态文件（`state/subtask-budget.json` 与易变段/协调层状态）、system prompt 头部的
 * 「易变段让位」机制。本卡只回答一个问题：**旧数据与旧调用方有没有受影响**。
 *
 * 六条口径（每条都可失败）：
 *  ① 旧台账（无 `budgetRequests`）：校验通过 / 读取不报错 / 既有字段一字不变 / 开窗 limit=60；
 *  ② 旧单卡调用：`{task_id,to}` 与 acceptance-only 的回执键集合与改造前逐字一致（不含批量新键）；
 *  ③ 节流口径：子卡 done 仍豁免 60s 节流；存量卡/父卡仍受约束且拒绝回执含剩余毫秒（回归）；
 *  ④ 运行态缺失：预算文件**不存在/版本不对/坏 JSON** → 计数侧报「计数不可得」（不按 0 通过、
 *     不阻断开工）且**按真实归属去向**留痕；易变段通道状态缺失 → `available()`=false
 *     （头部继续承载易变段）且不抛错；
 *  ⑤ 版本与契约未变：SCHEMA=9 / QUEUE=1 逐字；`budgetRequests` 不在 REQUIRED_TASK_FIELDS
 *     且在 `TaskRecord` 上是可选（`?`）；入参 schema 已声明 `tasks` / `budget` /
 *     `budget.expectedWindowIndex`；
 *  ⑥ 无迁移需要：旧格式 queue.json 起**真实** store，读一次 + 写一次，产物仍只含旧字段。
 *
 * 另含返工项（2026-10-07 独立复核 P2/P3）：
 *  · R1：④ 的夹具一律用**实测真实形状**（`executions[].sessionId` 是**窗口码**，子会话是 UUID
 *    ⇒ 精确查表永不命中），并断言**真实的降级去向**（父窗口兜底 → 卡评论；多卡并行未归属 →
 *    需求级评论）。不再断言生产不可达的 `exact-session` 路径；
 *  · R2：按卡镜像写**有非空前哨**（`port.writes` 长度恰好 1）——删掉生产的 `port.write` 即红；
 *  · R3：运行态读的**版本/损坏判据**：行为面由与 `src/index.ts` 内联端口**逐条同判据**的替身覆盖
 *    （`v≠1` / 截断 JSON → 计数不可得），链路面由 ⑤ 的源码字面量断言钉住（删 `v === 1` 即红）；
 *  · R4：非法 `budgetRequests`（≤0 / 非整数）在**两条生产路径**上都落成可见诊断（⑦）；
 *  · R5：删掉「构造成必填即编译失败」这条**不可证伪**的断言，改为源码字面量断言
 *    （`TaskRecord` 块内必须是 `budgetRequests?: number`）。
 *
 * ⚠️ 文件名说明：`tests/legacy-compat.test.ts` 已被 REQ-261003215944-9e04 占用（tracked），
 * 本卡不改既有测试文件，故另起本文件（-6749 后缀标注需求号）。
 *
 * @module dsh-pmboard/tests/legacy-compat-6749
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { InMemoryQueueRepository, makeHarness, req, task } from './application/harness.js'
import { mkTask, queueOf } from './queue/fixtures.js'
import { expectCode } from './helpers/code-assert.js'
import { defineTaskMoveTool } from '../src/tools/index.js'
import { executeSubtask } from '../src/application/use-cases/ExecuteTask.js'
import { validateQueueFile } from '../src/domain/queue/validateQueue.js'
import { QUEUE_VERSION, type QueueTask } from '../src/domain/queue/QueueTypes.js'
import { JsonQueueRepository } from '../src/repositories/QueueRepository.js'
import { QueueTaskStore } from '../src/repositories/QueueTaskStore.js'
import { LIMITS } from '../src/domain/limits.js'
import {
  openBudgetWindow,
  resolveBudgetLimit,
  SUBTASK_BUDGET_REL,
} from '../src/application/internal/subtask-budget.js'
import { createRequestCounter } from '../src/application/internal/request-counter.js'
import { createSubtaskRuntime } from '../src/application/internal/subtask-runtime.js'
import { createNoticeReconciler } from '../src/application/internal/notice-reconciler.js'
import { BUDGET_MARKS } from '../src/application/internal/task-comment.js'
import { registerCaptureGuidance } from '../src/gate-wiring.js'
import type { RequirementStore, SubtaskBudgetPort, TaskStore } from '../src/application/ports.js'
import type { RequirementFacts } from '../src/domain/requirement/RequirementSummary.js'
import {
  REQBOARD_SCHEMA_VERSION,
  type SubtaskBudgetState,
  type TaskRecord,
} from '../src/shared/protocol.js'

const W = 'session-w-001'
const REQ = 'REQ-000001'
/** 旧账单（fixtures 的固定样本需求 id）。 */
const FIX_REQ = 'REQ-260927202051-f6df'
const NOW = 1_790_000_000_000
/** 子会话 id 按实测形状用 UUID。 */
const SUB = 'b7c1e0f2-9d34-4a6b-8f21-3c5e7a90d123'

/** 旧 11 键（**逐字**，design/interfaces.md §TaskMoveOutput）。 */
const OLD_11_KEYS = [
  'success', 'task_id', 'from', 'to', 'status', 'version', 'subtasks_created', 'task_card', 'acceptance', 'error', 'code',
] as const
/** 批量/t3 才有的新键：旧单卡路径的回执**一个都不许出现**。 */
const BATCH_ONLY_KEYS = ['results', 'partial', 'tree', 'tree_note', 'guidance'] as const

const run = (t: unknown, args: unknown): Promise<Record<string, any>> =>
  (t as { execute: (a: unknown, e: unknown) => Promise<Record<string, any>> }).execute(args, { agent: { id: W } })

/** 去 `layer`（队列专有派生字段，不属于 TaskRecord）。 */
function withoutLayer(t: QueueTask): Record<string, unknown> {
  const copy = { ...t } as unknown as Record<string, unknown>
  delete copy.layer
  return copy
}

/** 临时预算运行态文件（`state/subtask-budget.json`；缺失/版本/坏 JSON 三种形态都由用例自己造）。 */
function tempBudgetFile(): { file: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'reqboard-budget-'))
  return {
    file: join(root, SUBTASK_BUDGET_REL),
    cleanup: () => { rmSync(root, { recursive: true, force: true }) },
  }
}

// ---------------------------------------------------------------------------
// 源码级判据（**不可导出**的实现细节：本仓既有做法就是读源码文本，判据移位即红）
// ---------------------------------------------------------------------------

/**
 * `REQUIRED_TASK_FIELDS` 的**字面块**。
 *
 * 为什么要读源码而不是读导出：该常量刻意不导出（它是校验实现的内部口径）。而本卡的命题
 * 恰恰是「`budgetRequests` **不在**这个清单里」——把它加进去就是一种**破坏性**契约变更
 * （旧文件全被判成缺必填字段 ⇒ 读成 0 张任务）。前缀找不到时**抛错**（判据移位即红）。
 */
const VALIDATE_SRC = readFileSync(new URL('../src/domain/queue/validateQueue.ts', import.meta.url), 'utf8')
function requiredTaskFieldsBlock(): string {
  const start = VALIDATE_SRC.indexOf('const REQUIRED_TASK_FIELDS')
  if (start < 0) throw new Error('validateQueue.ts 里找不到 REQUIRED_TASK_FIELDS（判据移位，测试须同步）')
  // 切片起点是 `= [`（**数组字面量**），不是声明里 `readonly (keyof TaskRecord)[]` 的那个 `]`。
  const literalStart = VALIDATE_SRC.indexOf('= [', start)
  if (literalStart < 0) throw new Error('REQUIRED_TASK_FIELDS 不是数组字面量（判据移位，测试须同步）')
  const end = VALIDATE_SRC.indexOf(']', literalStart)
  if (end < 0) throw new Error('REQUIRED_TASK_FIELDS 的字面块未闭合（判据移位，测试须同步）')
  return VALIDATE_SRC.slice(start, end + 1)
}

/** `TaskRecord` 接口声明块（R5：可选性只能靠**字面量**钉，vitest 不做类型检查）。 */
const PROTOCOL_SRC = readFileSync(new URL('../src/shared/protocol.ts', import.meta.url), 'utf8')
function taskRecordBlock(): string {
  const start = PROTOCOL_SRC.indexOf('export interface TaskRecord {')
  if (start < 0) throw new Error('protocol.ts 里找不到 TaskRecord（判据移位，测试须同步）')
  const end = PROTOCOL_SRC.indexOf('\n}', start)
  if (end < 0) throw new Error('TaskRecord 声明未闭合（判据移位，测试须同步）')
  return PROTOCOL_SRC.slice(start, end)
}

/**
 * `src/index.ts` 里**内联**预算端口（`const budgetPort: SubtaskBudgetPort = {…}`）的源码块。
 *
 * 为什么只能这样钉（R3 的链路面）：该端口是 `apply()` 内的内联字面量，**没有导出**、也不能在
 * 单测里实例化（要拉起整个插件装配）。它的**行为面**由下面与它**逐条同判据**的替身覆盖
 * （`v≠1` / 截断 JSON → `undefined` = 计数不可得）；它的**链路面**由本函数钉住：只要有人删掉
 * `v === 1` 这一判据，本断言即红。找不到该块 → 抛错（判据移位即红，不静默空过）。
 */
const INDEX_SRC = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
function indexBudgetPortBlock(): string {
  const start = INDEX_SRC.indexOf('const budgetPort: SubtaskBudgetPort')
  const end = INDEX_SRC.indexOf('const useCaseDeps: UseCaseDeps', start)
  if (start < 0 || end <= start) throw new Error('index.ts 里找不到内联预算端口（判据移位，测试须同步）')
  return INDEX_SRC.slice(start, end)
}

// ---------------------------------------------------------------------------
// ① 旧台账：不含 budgetRequests 的 queue.json
// ---------------------------------------------------------------------------

describe('① 旧台账（无 budgetRequests）：校验通过 / 读取不报错 / 既有字段一字不变 / 开窗 limit=60', () => {
  it('旧 queue.json 校验通过，经真实 QueueTaskStore 读出后既有字段逐字不变（读不写盘）', async () => {
    // 手工构造一份**改造前形状**的 queue.json（照既有 fixture 风格：mkTask/queueOf；不含 budgetRequests）。
    const legacyTask = mkTask('t-old')
    expect('budgetRequests' in legacyTask).toBe(false)
    const file = queueOf(FIX_REQ, [legacyTask])

    // ①-a 校验通过（该字段不在 REQUIRED_TASK_FIELDS ⇒ 缺它不是 V-1 问题）
    const verdict = validateQueueFile(file)
    expect(verdict.issues).toEqual([])
    expect(verdict.passed).toBe(true)

    // ①-b 读取不报错、不丢卡（校验不过会让 load 摊成 []，症状是「任务凭空消失」）
    const repo = new InMemoryQueueRepository()
    repo.seedSync(FIX_REQ, file)
    const rawBefore = repo.rawOf(FIX_REQ)
    const warnings: string[] = []
    const store = new QueueTaskStore({ repo, now: () => NOW, onWarn: (m) => warnings.push(m) })
    const tasks = await store.listByRequirement(FIX_REQ)
    expect(warnings).toEqual([])
    expect(tasks).toHaveLength(1)

    // ①-c 状态与既有字段一字不变（严格相等：键集合也一致）
    expect(tasks[0]).toStrictEqual(withoutLayer(legacyTask))
    expect(Object.keys(tasks[0]!).sort()).toEqual(Object.keys(withoutLayer(legacyTask)).sort())
    // 读不写盘：仓储里的原始字节一个都没动
    expect(repo.rawOf(FIX_REQ)).toBe(rawBefore)
    // 落盘视图的既有字段逐字保留（version/schemaVersion 未因新字段而升）
    const onDisk = JSON.parse(rawBefore!) as { version: number; schemaVersion: number; tasks: Record<string, unknown>[] }
    expect(onDisk.version).toBe(1)
    expect(onDisk.schemaVersion).toBe(9)
    expect(onDisk.tasks[0]).toStrictEqual(legacyTask as unknown as Record<string, unknown>)
    expect('budgetRequests' in onDisk.tasks[0]!).toBe(false)

    // ①-d 开预算窗口：limit 取缺省单一落点（=60），不是别处的第二份数字
    const opened = openBudgetWindow(tasks[0]!, NOW)
    expect(LIMITS.subtaskRequestBudget).toBe(60)
    expect(opened.window).toStrictEqual({ windowIndex: 0, used: 0, limit: 60, windowStartAt: NOW })
    expect(opened.note).toBeUndefined() // 字段缺失 = 正常缺省，不是「非法覆盖值」诊断
    expect(resolveBudgetLimit(tasks[0]!).limit).toBe(LIMITS.subtaskRequestBudget)
  })

  it('budgetRequests 不在 REQUIRED_TASK_FIELDS（源码级：加进去即红）', () => {
    const block = requiredTaskFieldsBlock()
    expect(block).toContain("'acceptance'") // 切片自检：确实切到了字段清单（不是空串/别处）
    expect(block).toContain("'status'")
    expect(block).not.toContain('budgetRequests')
  })
})

// ---------------------------------------------------------------------------
// ② 旧单卡调用：回执键集合与改造前逐字一致
// ---------------------------------------------------------------------------

/** 存量卡（in_review + 已汇报）：done 凭证门①②两项靠它过。 */
function reviewCard(id: string, over: Partial<TaskRecord> = {}): TaskRecord {
  return task({
    id,
    requirementId: REQ,
    status: 'in_review',
    createdAt: 1,
    lastReport: { at: 2, reportIndex: 1, filesChanged: [], completed: ['完成 ' + id] },
    ...over,
  })
}

/** 绑定窗口的夹具（t-keep 停留 todo，避免 rollup 把需求推走）。 */
function boundHarness(tasks: readonly TaskRecord[]) {
  const h = makeHarness({ tasks: [...tasks] })
  h.seedRequirementSync(req({ status: 'implementing' }))
  return h
}

/** 断言：回执的键一个都不在批量/t3 新键里，且全部属于旧 11 键。 */
function expectNoNewKeys(out: Record<string, unknown>): void {
  for (const k of BATCH_ONLY_KEYS) expect(k in out, '旧单卡回执不该出现新键：' + k).toBe(false)
  for (const k of Object.keys(out)) expect(OLD_11_KEYS as readonly string[]).toContain(k)
}

describe('② 旧单卡调用：回执键集合与改造前逐字一致', () => {
  it('{task_id,to} 认领：回执 = 旧键里的确定子集（无 results/partial/tree/tree_note/guidance）', async () => {
    const h = boundHarness([
      task({ id: 't-a1', requirementId: REQ, status: 'todo' }),
      task({ id: 't-keep', requirementId: REQ, status: 'todo' }),
    ])
    await h.seedSettled()
    const out = await run(defineTaskMoveTool(h.deps), { task_id: 't-a1', to: 'in_progress' })

    expect(out.success).toBe(true)
    expectNoNewKeys(out)
    // 逐字：开工路径的旧形状（task_card 是开工时才有的旧键）
    expect(Object.keys(out)).toEqual(['success', 'task_id', 'from', 'to', 'status', 'version', 'task_card'])
    expect(out.task_card).toStrictEqual({
      doc_path: 'docs/requirements/REQ-000001/tasks/t-a1.md',
      implementation: '改 x.ts',
    })
  })

  it('{task_id,to} 收尾：回执 = 6 个旧键（不含 subtasks_created / task_card）', async () => {
    const h = boundHarness([
      reviewCard('t-a1'),
      task({ id: 't-keep', requirementId: REQ, status: 'todo' }),
    ])
    await h.seedSettled()
    const out = await run(defineTaskMoveTool(h.deps), { task_id: 't-a1', to: 'done' })

    expect(out.success).toBe(true)
    expectNoNewKeys(out)
    expect(Object.keys(out)).toEqual(['success', 'task_id', 'from', 'to', 'status', 'version'])
  })

  it('acceptance-only 形态同样不变：回执 = {success, task_id, acceptance}', async () => {
    const h = boundHarness([
      task({ id: 't-a1', requirementId: REQ, status: 'todo', acceptance: '功能正常' }),
      task({ id: 't-keep', requirementId: REQ, status: 'todo' }),
    ])
    await h.seedSettled()
    const out = await run(defineTaskMoveTool(h.deps), {
      task_id: 't-a1',
      acceptance: '命令：node_modules/.bin/vitest run tests/a.test.ts → 看到 1 passed',
    })

    expect(out.success).toBe(true)
    expectNoNewKeys(out)
    expect(Object.keys(out)).toEqual(['success', 'task_id', 'acceptance'])
    expect(String(out.acceptance)).toContain('vitest run')
    // 状态未变（只修订语义未变）
    expect((await h.tasksOf(REQ)).find((t) => t.id === 't-a1')?.status).toBe('todo')
  })
})

// ---------------------------------------------------------------------------
// ③ 节流豁免口径：子卡仍豁免；存量卡/父卡仍受约束
// ---------------------------------------------------------------------------

/** 子卡（写入族 dev）：lastRun 成功 + 汇报给出真实存在的文件。 */
function devSubtask(id: string, parentId: string): TaskRecord {
  return task({
    id,
    requirementId: REQ,
    parentId,
    stageKind: 'dev' as never,
    status: 'in_progress',
    createdAt: 1,
    lastRun: { at: 2, ok: true, stopReason: 'completed', valueNonEmpty: true },
    lastReport: { at: 2, reportIndex: 1, filesChanged: ['docs/req/a.md'], completed: ['做了 ' + id] },
  })
}

describe('③ 60s 批量关闭节流：子卡豁免 / 存量卡与父卡仍受约束（回归，非新行为）', () => {
  it('存量卡仍受约束：拒绝回执含确定剩余毫秒（REQBOARD_BULK_CLOSE）', async () => {
    const h = boundHarness([
      reviewCard('t-a1'),
      reviewCard('t-a2'),
      task({ id: 't-keep', requirementId: REQ, status: 'todo' }),
    ])
    await h.seedSettled()
    h.deps.doneThrottleMs = LIMITS.doneThrottleMs // harness 缺省 0 = 关闭节流；本用例显式打开
    const t = defineTaskMoveTool(h.deps)

    const first = await run(t, { task_id: 't-a1', to: 'done' })
    expect(first.success).toBe(true)

    const out = await run(t, { task_id: 't-a2', to: 'done' })
    expect(out.success).toBe(false)
    expectCode(out, 'REQBOARD_BULK_CLOSE')
    expect(out.throttleRemainingMs).toBeGreaterThan(0)
    expect(out.throttleRemainingMs).toBeLessThanOrEqual(LIMITS.doneThrottleMs)
    expect(String(out.guidance)).toContain('确定等待')
    expect((await h.tasksOf(REQ)).find((t2) => t2.id === 't-a2')?.status).toBe('in_review')
  })

  it('父卡仍受约束：子卡链已收尾也不能绕过节流（拒绝回执含剩余毫秒）', async () => {
    const h = boundHarness([
      reviewCard('t-a1'),
      task({
        id: 't-p',
        requirementId: REQ,
        status: 'in_progress',
        createdAt: 1,
        lastReport: { at: 2, reportIndex: 1, filesChanged: [], completed: ['父卡收尾'] },
      }),
      task({ id: 't-s1', requirementId: REQ, parentId: 't-p', status: 'done' }),
      task({ id: 't-keep', requirementId: REQ, status: 'todo' }),
    ])
    await h.seedSettled()
    h.deps.doneThrottleMs = LIMITS.doneThrottleMs
    const t = defineTaskMoveTool(h.deps)

    expect((await run(t, { task_id: 't-a1', to: 'done' })).success).toBe(true)

    const out = await run(t, { task_id: 't-p', to: 'done', reason: '父卡收尾' })
    expect(out.success).toBe(false)
    expectCode(out, 'REQBOARD_BULK_CLOSE')
    expect(out.throttleRemainingMs).toBeGreaterThan(0)
    expect((await h.tasksOf(REQ)).find((t2) => t2.id === 't-p')?.status).toBe('in_progress')
  })

  it('子卡 done 仍豁免：批外刚关过一张卡，子卡照关（本条是回归，不是新行为）', async () => {
    const h = boundHarness([
      reviewCard('t-a1'),
      task({ id: 't-p', requirementId: REQ, status: 'in_progress', createdAt: 1 }),
      devSubtask('t-s1', 't-p'),
      task({ id: 't-keep', requirementId: REQ, status: 'todo' }),
    ])
    await h.seedSettled()
    h.docs.put('docs/req/a.md')
    h.deps.doneThrottleMs = LIMITS.doneThrottleMs
    const t = defineTaskMoveTool(h.deps)

    expect((await run(t, { task_id: 't-a1', to: 'done' })).success).toBe(true)

    const out = await run(t, { task_id: 't-s1', to: 'done', reason: '子卡完成' })
    expect(out.code).toBeUndefined()
    expect(out.success).toBe(true)
    expect((await h.tasksOf(REQ)).find((t2) => t2.id === 't-s1')?.status).toBe('done')
  })
})

// ---------------------------------------------------------------------------
// ④ 运行态文件缺失：计数不可得 + 易变段通道状态缺失（头部继续承载）
// ---------------------------------------------------------------------------

/**
 * 读 `state/subtask-budget.json` 的端口替身——**与 `src/index.ts` 内联端口逐条同判据**
 * （R3：旧版本的替身与 prod 不等价，删掉 prod 的 `v === 1` 也测不出来）：
 *   · 文件缺失（ENOENT）/ 坏 JSON（截断）→ `undefined`；
 *   · `v !== 1` 或 `tasks` 不是对象 → `undefined`（**版本不对不算可用态**）；
 *   · 写：建目录 + 覆盖写（prod 走 persistAtomic，语义一致）。
 */
class ProdBudgetPort implements SubtaskBudgetPort {
  readonly writes: SubtaskBudgetState[] = []
  constructor(private readonly file: string) {}
  async read(): Promise<SubtaskBudgetState | undefined> {
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.file, 'utf8'))
    } catch {
      return undefined // 缺失 / 坏 JSON → 计数不可得
    }
    const s = parsed as { v?: unknown; tasks?: unknown } | null
    return s !== null && typeof s === 'object' && s.v === 1 && typeof s.tasks === 'object' && s.tasks !== null
      ? (parsed as SubtaskBudgetState)
      : undefined
  }
  async write(next: SubtaskBudgetState): Promise<void> {
    this.writes.push(next)
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(next, null, 2))
  }
}

/** 真实形状的**在制子卡**：`executions[].sessionId` 是**窗口码**（实测全仓 100%）。 */
function realShapeSubtask(id: string, over: Partial<TaskRecord> = {}): TaskRecord {
  return task({
    id,
    requirementId: REQ,
    parentId: 't-p',
    stageKind: 'dev' as never,
    status: 'in_progress',
    createdAt: 1,
    executions: [{ id: 'e-' + id, sessionId: W, trigger: 'manual', startedAt: 1, outcome: 'running' }],
    ...over,
  })
}

/** 真实形状的**子会话**（正向判据命中：`origin='subagent'` + `delegationDepth=1`）。 */
const childSession = (id: string = SUB, parent: string = W): unknown => ({
  id, header: { parentSession: parent, delegationDepth: 1, origin: 'subagent' },
})

interface BudgetCounterFixture {
  counter: ReturnType<typeof createRequestCounter>
  cardComments: { taskId: string; body: string }[]
  reqComments: { requirementId: string; body: string }[]
  stops: string[]
  diags: string[]
}

function makeBudgetCounter(port: SubtaskBudgetPort, cards: readonly TaskRecord[]): BudgetCounterFixture {
  const cardComments: { taskId: string; body: string }[] = []
  const reqComments: { requirementId: string; body: string }[] = []
  const stops: string[] = []
  const diags: string[] = []
  const counter = createRequestCounter({
    port,
    runtime: createSubtaskRuntime(),
    tasks: () => cards,
    tasksOf: async () => cards,
    requirementForWindow: () => REQ,
    appendComment: (input) => { cardComments.push({ taskId: input.taskId, body: input.body }) },
    appendRequirementComment: (input) => { reqComments.push({ requirementId: input.requirementId, body: input.body }) },
    stopSubagent: (input) => { stops.push(input.sessionId); return true },
    notifyOwner: () => true,
    now: () => NOW,
    diagnose: (m) => diags.push(m),
  })
  return { counter, cardComments, reqComments, stops, diags }
}

/**
 * 走**真实链路**计一次数：先经 `onSessionEvent` 登记 `parentSession`（非 assistant 事件只登记、
 * 不计数——这正是生产里 `parents` 映射的来源），再用 `charge` 取回执（它的文档口径就是
 * 「供测试与诊断直接驱动某个会话」）。**不**手工塞 `executions[].sessionId = 子会话 id`
 * （那是生产不可达的假形状：实测 executions 里的 sessionId 100% 是窗口码）。
 */
async function chargeChild(fx: BudgetCounterFixture): Promise<Record<string, unknown>> {
  fx.counter.onSessionEvent(childSession(), { type: 'session/start' })
  return await fx.counter.charge(SUB) as unknown as Record<string, unknown>
}

describe('④ 运行态缺失：计数不可得（不按 0 通过、不阻断开工）/ 易变段通道不可用', () => {
  it('文件不存在 + 单张在制卡（父窗口兜底归属）→ 计数不可得、卡评论留痕、按卡镜像恰好 1 条', async () => {
    expect(SUBTASK_BUDGET_REL).toBe('state/subtask-budget.json')
    const { file, cleanup } = tempBudgetFile()
    try {
      const port = new ProdBudgetPort(file) // 刻意**不创建**该文件
      expect(await port.read()).toBeUndefined()

      const cards = [realShapeSubtask('t-s1')]
      const fx = makeBudgetCounter(port, cards)
      const receipt = await chargeChild(fx)

      // 归属：真形状下**必然**走父窗口兜底（精确查表永不命中），不是不可达的 exact-session
      expect(receipt['attribution']).toBe('parent-unique-in-progress')
      expect(receipt['reportTo']).toBe('task')
      expect(receipt['decision']).toBe('unknown')   // 显式未知（不是 ok）
      expect(receipt['accepted']).toBe(false)       // 绝不按「已用 0 次所以放行」通过
      expect(receipt['countable']).toBe(false)
      expect(String(receipt['reason'])).toContain('计数不可得')
      expect(receipt['limit']).toBe(60)
      expect(receipt['stopped']).toBeUndefined()    // 不阻断开工：没有停手动作
      expect(fx.stops).toEqual([])

      // 显式降级要留痕（不许静默）：卡评论点名「计数不可得」+「不按 0 通过」
      expect(fx.cardComments).toHaveLength(1)
      expect(fx.cardComments[0]!.taskId).toBe('t-s1')
      expect(fx.cardComments[0]!.body).toContain(BUDGET_MARKS.uncountable)
      expect(fx.cardComments[0]!.body).toContain('不按 0 通过')
      expect(fx.reqComments).toEqual([])

      // R2：计数本身照记（按卡镜像**非空**前哨）——删掉生产的 `port.write` 即红
      expect(port.writes).toHaveLength(1)
      expect(port.writes[0]!.tasks['t-s1']).toMatchObject({ windowIndex: 0, used: 1, limit: 60 })
    } finally {
      cleanup()
    }
  })

  it('文件不存在 + 多张在制卡（真实并行形态，未归属）→ 需求级评论留痕，不写任何卡评论', async () => {
    const { file, cleanup } = tempBudgetFile()
    try {
      const port = new ProdBudgetPort(file)
      const cards = [realShapeSubtask('t-s1'), realShapeSubtask('t-s2')]
      const fx = makeBudgetCounter(port, cards)
      const receipt = await chargeChild(fx)

      expect(receipt['attribution']).toBe('unattributed')
      expect(receipt['reportTo']).toBe('requirement') // 归属只决定**汇报去向**
      expect(receipt['decision']).toBe('unknown')
      expect(receipt['countable']).toBe(false)
      expect(String(receipt['reason'])).toContain('计数不可得')
      expect(receipt['limit']).toBe(60)

      // 降级去向 = 需求级评论（不是卡评论：不猜归属）
      expect(fx.reqComments).toHaveLength(1)
      expect(fx.reqComments[0]!.requirementId).toBe(REQ)
      expect(fx.reqComments[0]!.body).toContain(BUDGET_MARKS.uncountable)
      expect(fx.reqComments[0]!.body).toContain('不按 0 通过')
      expect(fx.cardComments).toEqual([])
      // 未归属 ⇒ 按卡的键根本不存在，故没有镜像写（生产口径）
      expect(port.writes).toHaveLength(0)
    } finally {
      cleanup()
    }
  })

  it('运行态版本不对（v:2）→ 不当作可用态：仍报计数不可得', async () => {
    const { file, cleanup } = tempBudgetFile()
    try {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify({ v: 2, tasks: {} }))
      const port = new ProdBudgetPort(file)
      expect(await port.read()).toBeUndefined() // 与 prod 的 `v === 1` 判据同口径

      const fx = makeBudgetCounter(port, [realShapeSubtask('t-s1')])
      const receipt = await chargeChild(fx)
      expect(receipt['decision']).toBe('unknown')
      expect(receipt['countable']).toBe(false)
      expect(String(receipt['reason'])).toContain('计数不可得')
      expect(fx.cardComments[0]!.body).toContain(BUDGET_MARKS.uncountable)
    } finally {
      cleanup()
    }
  })

  it('运行态是截断 JSON（损坏）→ 计数不可得，且**不抛**（不阻断开工）', async () => {
    const { file, cleanup } = tempBudgetFile()
    try {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, '{"v":1,"tasks":{"t-s1":{') // 截断（写一半被杀）
      const port = new ProdBudgetPort(file)
      expect(await port.read()).toBeUndefined()

      const fx = makeBudgetCounter(port, [realShapeSubtask('t-s1')])
      // 不抛：await 本身不 reject；回执仍是正常的降级回执（不是 error 形态）
      const receipt = await chargeChild(fx)
      expect(receipt['decision']).toBe('unknown')
      expect(receipt['accepted']).toBe(false)
      expect(String(receipt['reason'])).toContain('计数不可得')
      expect(fx.stops).toEqual([])
    } finally {
      cleanup()
    }
  })

  it('易变段通道状态缺失 → available()=false（头部继续承载易变段），且不抛错', async () => {
    // 传输层替身：通道不可投（状态缺失）。协调层只关心回执，不看它内部。
    const delivery = {
      submit: () => ({ delivered: false, channel: 'system-prompt-fallback' as const, reason: '通道状态缺失' }),
      sendImmediate: () => ({ delivered: false, channel: 'system-prompt-fallback' as const, reason: '通道状态缺失' }),
      isSent: () => true,
      flush: () => { /* 无待发 */ },
      drop: () => { /* 无在途 */ },
      dispose: () => { /* 无定时器 */ },
    }
    const reconciler = createNoticeReconciler({
      delivery,
      contentFor: () => undefined,
      now: () => 0,
      diagnose: () => { /* 静默 */ },
    })

    // ① 全新窗口（没有任何在途/到达确认状态）：available() 恒 false，且是**返回值**而不是抛错
    expect(() => reconciler.available(W)).not.toThrow()
    expect(reconciler.available(W)).toBe(false)

    // ② 通道不可用 ⇒ 装配走回落整段：易变段照旧由**头部**承载（不静默丢）
    const spec = await sectionWith(
      { available: (w: string) => reconciler.available(w) },
      () => [FACTS_IMPL],
      () => [task({ id: 't-x', requirementId: REQ, status: 'in_progress' })],
    )
    expect(() => spec.text(CTX)).not.toThrow()
    expect(spec.text(CTX)).toContain('【当前任务执行中】')

    // ③ 通道自身抛错（形状异常）→ 按不可用处理，装配绝不炸（同缝的 peekFacts 同款兜底）
    const specThrows = await sectionWith(
      { available: () => { throw new Error('通道状态缺失') } },
      () => [FACTS_IMPL],
      () => [task({ id: 't-x', requirementId: REQ, status: 'in_progress' })],
    )
    expect(() => specThrows.text(CTX)).not.toThrow()
    expect(specThrows.text(CTX)).toContain('【当前任务执行中】')

    // ④ 正向对照（证明 ① 的 false 不是恒真）：确认送达后 available()=true，头部只留绑定关系
    reconciler.noteSent({ windowKey: W, kind: 'stage', hash: 'h-1', messageId: 'm-1', delivered: true, channel: 'inbox-next-step' })
    reconciler.noteClaimed(W, 'm-1')
    expect(reconciler.available(W)).toBe(true)
    const specHead = await sectionWith(
      { available: (w: string) => reconciler.available(w) },
      () => [FACTS_IMPL],
      () => [task({ id: 't-x', requirementId: REQ, status: 'in_progress' })],
    )
    expect(specHead.text(CTX)).toContain(REQ)                  // 头部仍承载绑定关系
    expect(specHead.text(CTX)).not.toContain('【当前任务执行中】') // 易变段已让位给尾部通道
  })
})

// ---------------------------------------------------------------------------
// ⑤ 版本与契约未变
// ---------------------------------------------------------------------------

describe('⑤ 版本与契约未变（加性可选字段不升版）', () => {
  it('REQBOARD_SCHEMA_VERSION=9 / QUEUE_VERSION=1 逐字；budgetRequests 是**可选**字段', async () => {
    expect(REQBOARD_SCHEMA_VERSION).toBe(9)
    expect(QUEUE_VERSION).toBe(1)
    expect(requiredTaskFieldsBlock()).not.toContain('budgetRequests')

    // 可选性判据（R5）：vitest **不做类型检查**，所以「构造成必填就编译失败」是**不可证伪**的断言，
    // 已删。可选性只有两条能失败的判据：① 上面的 REQUIRED_TASK_FIELDS 字面量不含它；
    // ② TaskRecord 声明块里必须带 `?`（去掉 `?` 即红——那正是破坏性契约变更）。
    const recordBlock = taskRecordBlock()
    expect(recordBlock).toContain('export interface TaskRecord {') // 切片自检
    expect(recordBlock).toMatch(/budgetRequests\?: number/)
    expect(recordBlock).not.toMatch(/^\s*budgetRequests: number$/m)

    // 运行时面：夹具不得凭空补一个默认值（缺字段 = 真缺，而不是被填成 60）
    const withoutBudget: TaskRecord = task()
    expect('budgetRequests' in withoutBudget).toBe(false)
    expect(task({ budgetRequests: 5 }).budgetRequests).toBe(5)
    // 非正整数不是「非法拒绝」而是「按缺省 + 诊断」（不阻断开工）
    expect(resolveBudgetLimit({ budgetRequests: 0 } as unknown as Pick<TaskRecord, 'budgetRequests'>).limit).toBe(60)
  })

  it('入参 schema 已声明 tasks / budget / budget.expectedWindowIndex（additionalProperties:false 下不声明即拒收）', () => {
    const tool = defineTaskMoveTool(makeHarness({}).deps) as unknown as {
      parameters?: { properties?: Record<string, any> }
    }
    const params = (tool.parameters?.properties ?? {}) as Record<string, any>

    expect(params['tasks']?.type).toBe('array')
    expect(params['tasks']?.items?.additionalProperties).toBe(false)
    expect(Object.keys(params['tasks']?.items?.properties ?? {}).sort()).toEqual(['acceptance', 'reason', 'task_id', 'to'])

    const budget = params['budget']
    expect(budget?.type).toBe('object')
    expect(budget?.additionalProperties).toBe(false)
    expect(Object.keys(budget?.properties ?? {})).toEqual(['release', 'add', 'expectedWindowIndex'])
    expect(budget?.properties?.['expectedWindowIndex']?.type).toBe('number')

    // 旧四参仍在（只增不减）
    for (const k of ['task_id', 'to', 'reason', 'acceptance']) expect(k in params).toBe(true)
  })

  it('生产运行态端口的版本/损坏判据仍在（源码字面量：删掉 v === 1 即红）', () => {
    // 该端口是 apply() 里的**内联字面量**、没有导出，无法在单测里实例化 ⇒ 链路面只能这样钉
    // （行为面已由 ④ 的三条用例用与它同判据的替身覆盖）。判据移位 → indexBudgetPortBlock 抛错。
    const block = indexBudgetPortBlock()
    expect(block).toContain('JSON.parse')            // 坏 JSON 由 try/catch 兜住
    expect(block).toMatch(/\.v === 1/)               // 版本不对 **不算**可用态
    expect(block).toContain('budgetState = undefined')
    expect(block).toContain("code !== 'ENOENT'")     // 缺文件是正常态（不告警），坏文件才告警
  })
})

// ---------------------------------------------------------------------------
// ⑥ 无迁移需要：旧格式 queue.json → 真实 store 读一次 + 写一次
// ---------------------------------------------------------------------------

describe('⑥ 无迁移需要：旧格式 queue.json 起真实 store，读一次 + 写一次仍只含旧字段', () => {
  it('读不写盘；写回的产物顶层只多 updated_at，任务键集合一个不变（旧消费方可继续消费）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'reqboard-legacy-store-'))
    try {
      const reqDir = join(root, 'docs', 'requirements', FIX_REQ)
      mkdirSync(reqDir, { recursive: true })
      const queuePath = join(reqDir, 'queue.json')

      // 旧格式：不含 budgetRequests，也没有写入路径才会补的 updated_at
      const legacyFile = queueOf(FIX_REQ, [mkTask('t-old')])
      delete legacyFile.updated_at
      const rawBefore = JSON.stringify(legacyFile, null, 2)
      writeFileSync(queuePath, rawBefore)
      const before = JSON.parse(rawBefore) as { tasks: Record<string, unknown>[] }

      const warnings: string[] = []
      const repo = new JsonQueueRepository({ workspaceRoot: root, onWarn: (m) => warnings.push(m) })
      const store = new QueueTaskStore({ repo, now: () => NOW, onWarn: (m) => warnings.push(m) })

      // ── 读一次 ──────────────────────────────────────────────────────────
      const read1 = await store.listByRequirement(FIX_REQ)
      expect(warnings).toEqual([])
      expect(read1).toHaveLength(1)
      expect('budgetRequests' in read1[0]!).toBe(false)
      expect(read1[0]).toStrictEqual(withoutLayer(mkTask('t-old')))
      expect(readFileSync(queuePath, 'utf8')).toBe(rawBefore) // 读路径一个字节都不写盘（更不许顺手迁移）

      // ── 写一次 ──────────────────────────────────────────────────────────
      await store.mutate(FIX_REQ, (tasks) => tasks.map((t) => ({ ...t, title: t.title + '（改）' })))
      const rawAfter = readFileSync(queuePath, 'utf8')
      const after = JSON.parse(rawAfter) as {
        version: number
        schemaVersion: number
        tasks: Record<string, unknown>[]
      }
      expect(rawAfter).not.toBe(rawBefore) // 写确实发生了（否则下面的断言是恒真）

      // 版本未升；派生视图仍由拓扑重算（不是迁移）
      expect(after.version).toBe(QUEUE_VERSION)
      expect(after.schemaVersion).toBe(REQBOARD_SCHEMA_VERSION)
      // 顶层唯一新增 = 写入路径自带的 updated_at（没有任何迁移标记/回填字段）
      const addedTop = Object.keys(after).filter((k) => !(k in (before as unknown as Record<string, unknown>)))
      expect(addedTop).toEqual(['updated_at'])
      // 任务键集合不变：不做迁移也能工作（旧消费方看到的还是那批字段）
      expect(Object.keys(after.tasks[0]!).sort()).toEqual(Object.keys(before.tasks[0]!).sort())
      expect('budgetRequests' in after.tasks[0]!).toBe(false)
      expect(String(after.tasks[0]!['title'])).toContain('（改）')
      expect(validateQueueFile(after as never).passed).toBe(true)

      // ── 产物仍可被旧字段消费：换一个**新** store 实例重读 ────────────────
      const store2 = new QueueTaskStore({
        repo: new JsonQueueRepository({ workspaceRoot: root, onWarn: (m) => warnings.push(m) }),
        now: () => NOW,
        onWarn: (m) => warnings.push(m),
      })
      const read2 = await store2.listByRequirement(FIX_REQ)
      expect(read2).toHaveLength(1)
      expect(read2[0]!.title).toContain('（改）')
      expect('budgetRequests' in read2[0]!).toBe(false)
      expect(warnings).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// ⑦ R4：非法 budgetRequests（≤0 / 非整数）⇒ 按缺省起算 **且留可见诊断**
//    （design/data-model.md §运行态文件 1；两条生产路径此前都把 note 丢了）
// ---------------------------------------------------------------------------

describe('⑦ 非法 budgetRequests 的「按缺省 + 诊断」在读侧两条路径上都可见', () => {
  it('计数读侧（request-counter）：非法覆盖值 → limit=60 且 diag 收到 note，不改裁决、不阻断', async () => {
    const { file, cleanup } = tempBudgetFile()
    try {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify({ v: 1, tasks: {} }))
      const port = new ProdBudgetPort(file)
      const fx = makeBudgetCounter(port, [realShapeSubtask('t-s1', { budgetRequests: 0 })])

      const receipt = await chargeChild(fx)
      expect(receipt['limit']).toBe(60)                 // 按缺省起算（不阻断开工）
      expect(receipt['decision']).toBe('ok')            // 运行态可读 ⇒ 正常计数，不因非法值降级
      expect(receipt['accepted']).toBe(true)
      const notes = fx.diags.filter((d) => d.includes('budgetRequests=0'))
      expect(notes).toHaveLength(1)                     // R4：note 不再被丢弃
      expect(notes[0]).toContain('不是正整数')
      expect(notes[0]).toContain('按缺省')
    } finally {
      cleanup()
    }
  })

  it('开窗侧（ExecuteTask.executeSubtask）：非法覆盖值 → 窗口按缺省定格，并写一条可见诊断', async () => {
    const { file, cleanup } = tempBudgetFile()
    // captureDiag 的**可靠观测面**是文件、但它必定 console.log 一条；用 spy 观测，避免动进程级单例 diagFile
    const spy = vi.spyOn(console, 'log').mockImplementation(() => { /* 静音 */ })
    try {
      const h = makeHarness()
      h.seedRequirementSync(req({ id: REQ, status: 'implementing' }))
      h.seedTasks(REQ, [
        task({ id: 't-p', requirementId: REQ, status: 'in_progress', title: '父卡' }),
        task({
          id: 't-s', requirementId: REQ, status: 'todo', parentId: 't-p', stageKind: 'dev' as never,
          title: '研发', acceptance: '改动落盘并跑通测试', budgetRequests: 0, // 非法：0 不是正整数
        }),
      ])
      await h.seedSettled()
      const port = new ProdBudgetPort(file)
      h.deps.subtaskBudget = port
      // 引擎不可达也会先开窗（开窗在派发之前）；本用例只钉开窗 + 诊断这一件事。
      h.deps.workflow = { start: async () => ({ ok: false, reason: 'test-stop' }) } as never

      await executeSubtask(h.deps, { subtaskId: 't-s', windowKey: W, exec: { agent: { id: W } } })

      expect(port.writes[0]?.tasks['t-s']).toMatchObject({ windowIndex: 0, used: 0, limit: 60 }) // 按缺省定格
      const lines = spy.mock.calls.map((c) => String(c[0]))
      const diagLine = lines.find((l) => l.includes('t-s') && l.includes('budgetRequests=0'))
      expect(diagLine).toBeDefined()                    // R4：note 不再被丢弃
      expect(String(diagLine)).toContain('按缺省起算')
    } finally {
      spy.mockRestore()
      cleanup()
    }
  })
})

// ---------------------------------------------------------------------------
// 装配缝夹具（走真实注册点 gate-wiring；与 volatile-notice.test.ts 同款最小桩）
// ---------------------------------------------------------------------------

interface SectionSpec { text: (context: unknown) => string }

const CTX = { agent: { id: W } }

const FACTS_IMPL: RequirementFacts = {
  id: REQ,
  title: '兼容与迁移回归',
  description: '旧数据与旧调用方不受影响',
  status: 'implementing',
  category: 'feature',
  updatedAt: 100,
  version: 1,
  sourceSessionId: W,
  artifacts: [],
}

async function sectionWith(
  channel: { available: (windowKey: string) => boolean },
  factsRef: () => readonly RequirementFacts[],
  tasksRef: () => readonly TaskRecord[],
): Promise<SectionSpec> {
  let spec: SectionSpec | undefined
  const fakeCtx = {
    inject: (_services: string[], cb: (c: unknown) => void) => {
      cb({ effect: (fn: () => void) => { fn() }, systemPrompt: { section: (s: never) => { spec = s; return (): void => {} } } })
    },
  }
  registerCaptureGuidance(fakeCtx as unknown as Context, {
    disposers: [],
    requirementStore: { peekFacts: () => factsRef() } as unknown as RequirementStore,
    pendingCapture: new Map(),
    injectionLog: { record: (): void => {} } as never,
    taskStore: {
      listAll: async () => tasksRef(),
      subscribe: () => (): void => {},
    } as unknown as TaskStore,
    logger: { info: (): void => {}, warn: (): void => {} },
    plugin: 'test',
    sectionName: 'reqboard:capture',
    sectionOrder: 10,
    onSystemPrompt: (): void => {},
    volatileChannel: channel,
  })
  await Promise.resolve()
  await Promise.resolve()
  if (spec === undefined) throw new Error('section 未注册')
  return spec
}
