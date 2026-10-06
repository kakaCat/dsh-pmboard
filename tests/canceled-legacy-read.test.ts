/**
 * 旧分片读取 + 零写回 + 读侧宽容 + V-5 两档（REQ-261005193546-1b1a · t10 / FR-3, FR-5, FR-6）。
 *
 * 契源：`design/migration.md` §兼容期行为 / §风险 ④、`design/backend.md` §兼容与零迁移 / §错误处理、
 * `design/interfaces.md` §3.3「读侧重算 vs 写侧强校验」。
 *
 * ## 标本（`legacyShardText()`）
 * 三张卡、**全量需求目录之外的临时工作区**（绝不写真实 `docs/requirements`）：
 *
 * | 卡 | 状态 | dependsOn | 磁盘 `layer` | 三字段（canceledAt/By/Reason） |
 * |---|---|---|---|---|
 * | `t-c` | `canceled` | — | 0 | **全缺**（= 留痕上线前取消的存量卡，"未采集"） |
 * | `t-a` | `todo` | — | 0 | — |
 * | `t-l` | `todo` | `['t-c']` | 1（全量口径分层） | — |
 *
 * 磁盘 `ready[]` = `['t-a']`，即**旧口径**（`computeReady` 曾要求依赖 `done` ⇒ 被取消卡钉死的 `t-l`
 * 不在其中）——这就是"漏就绪 = 陈旧派生值"的现实形态，也是旧读法会把整份队列读成 0 张的扳机。
 *
 * ## 本用例钉住的四条
 * 1. **读侧宽容**：`load` 返回**非** `undefined`（`listByRequirement` 拿得到真实卡数，不是 `[]`）；
 *    读取路径至少给出一条 warning，且「漏就绪」以 **warning 级**上报。
 * 2. **读侧重算**：返回对象的 `ready` 含 `t-l`（内存现算，**不读落盘 `ready[]`**）、
 *    活卡 `layer`/`layers` 按 `liveLayers`/`layerInputOf` 现算，取消卡的 `layer` 冻结不动。
 * 3. **写侧仍严格**：同一标本 `save` 照旧强校验（此标本按新判据已自洽 ⇒ 不抛；刻意写坏的 ready
 *    仍被 `QUEUE_VALIDATION_FAILED` 拦死）。
 * 4. **零写回 / 零迁移**：读取前后标本 `sha256` 与 `mtimeMs` 逐份不变、全量需求目录 `queue.json`
 *    逐份不变、`docs/requirements` 工作树无新增变更；版本常量（`QUEUE_VERSION`=1 /
 *    `REQBOARD_SCHEMA_VERSION`=9）一字不动；仓库不新增 `migrate-*` 脚本。
 *
 * ## 已知张力（如实记录，待人拍板；不由本用例断言）
 * `t10` 按 `design/interfaces.md` §3.3 把**活卡层号**也重算进返回对象：`t-l` 的层号由磁盘的 1
 * 变成 `liveLayers` 的 0，而它的 `dependsOn` 仍写着已取消的 `t-c` ⇒ 对**重算后视图**跑
 * `validateQueueFile` 会命中 V-4 的两条（`layer=0 却有依赖` / `层号未随依赖递增`）。
 * V-4 按裁定**不动、对取消卡不豁免**，故读路径把这些条目并入告警（读侧宽容：告警后照样返回）。
 * 本用例只断言"读侧照常返回 + 告警非空"，不钉 V-4 的条数——两种拍板（保留 / 不重算活卡层号）
 * 下都成立。细节见 t10 汇报的"需拍板"一节。
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { QUEUE_VERSION } from '../src/domain/queue/QueueTypes.js'
import type { QueueFile, QueueTask } from '../src/domain/queue/QueueTypes.js'
import { levelOf, validateQueueFile } from '../src/domain/queue/validateQueue.js'
import { JsonQueueRepository, QUEUE_ERROR } from '../src/repositories/QueueRepository.js'
import { QueueTaskStore } from '../src/repositories/QueueTaskStore.js'
import { REQBOARD_SCHEMA_VERSION } from '../src/shared/protocol.js'
import type { TaskRecord, TaskStatus } from '../src/shared/protocol.js'

const REQ = 'REQ-261005193546-1b1a'
const ACTOR = { kind: 'agent' as const, sessionId: 'session-canceled-legacy-read' }
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** 构造一条字段齐全的 TaskRecord（自足，不依赖 `tests/queue/fixtures.ts`）。 */
function task(id: string, status: TaskStatus, dependsOn: string[] = []): TaskRecord {
  return {
    id,
    requirementId: REQ,
    title: `旧分片标本 ${id}`,
    description: '旧分片读取 + 零写回标本',
    phase: 'implement',
    side: 'backend',
    scope: { apis: [], tables: [], files: [] },
    acceptance: '样本验收（含可执行锚点）',
    context: '样本背景',
    dependsOn,
    status,
    blocked: false,
    executions: [],
    comments: [],
    version: 1,
    createdAt: 1759000000000,
    updatedAt: 1759000000000,
    createdBy: ACTOR,
    updatedBy: ACTOR,
  }
}

/**
 * 标本的**磁盘口径**任务（顺序 `[t-c, t-a, t-l]`）：`layer` 按**全量节点**分层回填
 * （取消卡照旧占层、活卡被它压层）——这正是"落盘 `layer` 仅历史派生值"的形状。
 */
function legacyTasks(): QueueTask[] {
  return [
    { ...task('t-c', 'canceled'), layer: 0 },
    { ...task('t-a', 'todo'), layer: 0 },
    { ...task('t-l', 'todo', ['t-c']), layer: 1 },
  ]
}

/** 旧分片 JSON 文本：`ready[]` 为旧口径（漏掉 `t-l`）、三字段全缺、版本常量未 bump。 */
function legacyShardText(): string {
  const file: QueueFile = {
    version: QUEUE_VERSION,
    requirement_id: REQ,
    schemaVersion: REQBOARD_SCHEMA_VERSION,
    generated_at: '2026-10-05T00:00:00.000Z',
    tasks: legacyTasks(),
    edges: [{ from: 't-c', to: 't-l' }],
    layers: [
      { layer: 0, tasks: ['t-c', 't-a'] },
      { layer: 1, tasks: ['t-l'] },
    ],
    ready: ['t-a'], // ← 旧口径：被取消卡钉死的 t-l 不在其中（陈旧派生值）
  }
  return `${JSON.stringify(file, null, 2)}\n`
}

let root: string
let repo: JsonQueueRepository
let warnings: string[]

/** 标本文件所在的需求目录（临时工作区内）。 */
const dirOf = (): string => join(root, 'docs', 'requirements', REQ)
const queuePath = (): string => join(dirOf(), 'queue.json')

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-canceled-legacy-'))
  warnings = []
  repo = new JsonQueueRepository({ workspaceRoot: root, onWarn: (m) => warnings.push(m) })
  const { mkdir } = await import('node:fs/promises')
  await mkdir(dirOf(), { recursive: true })
  await writeFile(queuePath(), legacyShardText(), 'utf8')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** 一份文件的零写回凭据：内容摘要 + mtime（mtime 是"有没有被写过"最直接的读数）。 */
async function fingerprint(path: string): Promise<{ sha256: string; mtimeMs: number; size: number }> {
  const bytes = await readFile(path)
  const info = await stat(path)
  return { sha256: createHash('sha256').update(bytes).digest('hex'), mtimeMs: info.mtimeMs, size: info.size }
}

/** 全量需求目录里每一份 `queue.json` 的零写回凭据（按路径排序，便于逐份比对）。 */
async function workspaceQueueFingerprints(): Promise<Record<string, string>> {
  const reqRoot = join(REPO_ROOT, 'docs', 'requirements')
  const out: Record<string, string> = {}
  let ids: string[]
  try {
    ids = (await readdir(reqRoot)).filter((n) => n.startsWith('REQ-')).sort()
  } catch {
    return out
  }
  for (const id of ids) {
    const p = join(reqRoot, id, 'queue.json')
    try {
      const fp = await fingerprint(p)
      out[`${id}/queue.json`] = `${fp.sha256}@${fp.mtimeMs}`
    } catch {
      // 该需求没有 queue.json：不是本用例的事
    }
  }
  return out
}

/** `docs/requirements` 工作树的脏文件行（与 git 状态对照，证明本用例没让它更脏）。 */
function requirementsGitLines(): string[] {
  return execFileSync('git', ['status', '--porcelain', 'docs/requirements'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

describe('旧分片读取：读侧宽容 + 内存重算（FR-6 / migration §风险 ④）', () => {
  it('load 返回非 undefined；listByRequirement 返回真实卡数（不是 []、不是 0 张）', async () => {
    const loaded = await repo.load(REQ)

    expect(loaded).not.toBeUndefined()
    expect(loaded!.tasks.map((t) => t.id)).toEqual(['t-c', 't-a', 't-l'])

    const store = new QueueTaskStore({ repo, now: () => 1_800_000_000_000 })
    const listed = await store.listByRequirement(REQ)

    expect(listed).toHaveLength(3) // 读成 0 张 / [] 是本次要消灭的形态（看板空白）
    expect(listed.map((t) => t.id)).toEqual(['t-c', 't-a', 't-l'])
  })

  it('读取路径给出 ≥ 1 条 warning，且「漏就绪」以 warning 级上报（两档的第一档）', async () => {
    await repo.load(REQ)

    expect(warnings.length).toBeGreaterThanOrEqual(1)
    expect(warnings.some((w) => w.includes('未通过校验') && w.includes('继续返回队列'))).toBe(true)

    // 落盘视图（磁盘现状）的判据：漏就绪 = warning ⇒ `passed` 仍为 true（不判失败、不拦读写）
    const onDisk = JSON.parse(legacyShardText()) as QueueFile
    const result = validateQueueFile(onDisk)
    const missed = result.issues.filter((i) => i.rule === 'V-5' && i.message.includes('漏就绪'))
    expect(missed).toHaveLength(1)
    expect(levelOf(missed[0]!)).toBe('warning')
    expect(result.passed).toBe(true)
  })

  it('返回的 ready 来自内存重算：含被取消卡解锁的 t-l（**不读落盘 ready[]**）', async () => {
    const loaded = await repo.load(REQ)
    const onDisk = JSON.parse(await readFile(queuePath(), 'utf8')) as QueueFile

    expect(loaded!.ready).toContain('t-l')
    expect(loaded!.ready).toEqual(['t-a', 't-l'])
    // 磁盘值一个字节没动（陈旧 ready 仍在文件里）⇒ 只能来自内存重算
    expect(onDisk.ready).toEqual(['t-a'])
    expect(onDisk.ready).not.toContain('t-l')
  })

  it('活卡 layer / layers 按 liveLayers 现算，取消卡的 layer 冻结不动（FR-1 / interfaces §3.3）', async () => {
    const loaded = await repo.load(REQ)
    const onDisk = JSON.parse(await readFile(queuePath(), 'utf8')) as QueueFile

    // 活卡：删掉指向取消卡的边后重算 ⇒ t-l 由磁盘的 1 层落到 0 层
    expect(loaded!.tasks.find((t) => t.id === 't-l')!.layer).toBe(0)
    expect(loaded!.tasks.find((t) => t.id === 't-a')!.layer).toBe(0)
    expect(loaded!.layers).toEqual([{ layer: 0, tasks: ['t-a', 't-l'] }])
    // 取消卡：保留取消时刻的冻结值（`liveLayers` 只含活卡，取不到即不动）
    expect(loaded!.tasks.find((t) => t.id === 't-c')!.layer).toBe(0)
    // 磁盘侧仍是历史派生值 ⇒ 证明"重算只在内存里"
    expect(onDisk.tasks.find((t) => t.id === 't-l')!.layer).toBe(1)
    expect(onDisk.layers).toEqual([
      { layer: 0, tasks: ['t-c', 't-a'] },
      { layer: 1, tasks: ['t-l'] },
    ])
  })

  it('旧分片三字段全缺：读出不报错、读出 undefined（未采集），且不被回填', async () => {
    const loaded = await repo.load(REQ)
    const canceled = loaded!.tasks.find((t) => t.id === 't-c')!

    expect(canceled.status).toBe('canceled')
    expect(canceled.canceledAt).toBeUndefined()
    expect(canceled.canceledBy).toBeUndefined()
    expect(canceled.cancelReason).toBeUndefined()
    expect(await readFile(queuePath(), 'utf8')).toBe(legacyShardText()) // 原样，无回填
  })
})

describe('加强标本：陈旧 ready[] 漏了解锁活卡 → 读侧以重算为准、磁盘未变', () => {
  /**
   * t5 复盘转来的加强标本：`t5` 指出读侧降级落地**之前**，「陈旧 `ready[]`」只剩**顺序**一维
   * 可构造（成员集合无从陈旧）。读侧重算落地后，本标本直接钉住"**成员**也陈旧"这一维：
   * 文件里的 `ready[]` 漏了那张因取消而新解锁的活卡，`load` 仍必须给出它——**来自内存重算**。
   */
  it('load 返回的 ready 含该卡；同时磁盘 ready[] 仍缺该卡、磁盘 layer 仍是旧值', async () => {
    const before = await fingerprint(queuePath())

    const loaded = await repo.load(REQ)

    // ① 内存重算侧：解锁的活卡在 ready 里
    expect(loaded!.ready).toContain('t-l')
    // ② 磁盘侧：一个字节都没变（陈旧值原样留在文件里）⇒ "读侧以重算为准，不读落盘值"
    const after = await fingerprint(queuePath())
    expect(after).toEqual(before)
    const onDisk = JSON.parse(await readFile(queuePath(), 'utf8')) as QueueFile
    expect(onDisk.ready).toEqual(['t-a'])
    expect(onDisk.tasks.find((t) => t.id === 't-l')!.layer).toBe(1)
    // ③ 读方拿到的队列仍旧是同一份（不是"读一次改一次"）
    expect(JSON.stringify(JSON.parse(await readFile(queuePath(), 'utf8')))).toBe(JSON.stringify(JSON.parse(legacyShardText())))
  })
})

describe('零写回（FR-6：读取前后逐字节一致，mtime 亦不变）', () => {
  it('标本文件 sha256 / mtimeMs / size 逐份不变；全量需求目录 queue.json 逐份不变', async () => {
    const specimenBefore = await fingerprint(queuePath())
    const workspaceBefore = await workspaceQueueFingerprints()
    const gitBefore = requirementsGitLines()

    // 读路径全跑一遍（load + 缓存装载 + 列表），只读不写
    const store = new QueueTaskStore({ repo, now: () => 1_800_000_000_000 })
    await repo.load(REQ)
    await store.readQueue(REQ)
    await store.listByRequirement(REQ)

    expect(await fingerprint(queuePath())).toEqual(specimenBefore)
    expect(await workspaceQueueFingerprints()).toEqual(workspaceBefore)
    expect(Object.keys(workspaceBefore).length).toBeGreaterThan(0) // 对照非空（防"扫了个空目录"式假绿）
    // 本用例不得让 `docs/requirements` 新增任何变更（工作树可能本来就脏：只断言**没有新增**）
    expect(requirementsGitLines().filter((l) => !gitBefore.includes(l))).toEqual([])
  })

  it('仓库不新增 migrate-* 脚本，且没有任何脚本回填三字段 / 重写 ready', async () => {
    const scriptsDir = join(REPO_ROOT, 'scripts')
    const names = (await readdir(scriptsDir)).sort()

    // ① 迁移脚本清单钉死基线：本需求（零迁移）不得新增任何 migrate-* 落点
    expect(names.filter((n) => n.startsWith('migrate-'))).toEqual([
      'migrate-ledger-to-sqlite.ts',
      'migrate-ledger-v10.ts',
      'migrate-ledger.ts',
      'migrate-support.ts',
    ])
    // ② 没有任何脚本在回填取消留痕三字段（回填会篡改审计事实：FR-3 / FR-6 明令不做）
    const backfillers: string[] = []
    for (const name of names) {
      if (!/\.(ts|mts|mjs)$/.test(name)) continue
      const source = await readFile(join(scriptsDir, name), 'utf8')
      if (/canceledAt|canceledBy|cancelReason/.test(source)) backfillers.push(name)
    }
    expect(backfillers).toEqual([])
  })

  it('零迁移：QUEUE_VERSION=1 与 REQBOARD_SCHEMA_VERSION=9 一字不动', () => {
    expect(QUEUE_VERSION).toBe(1)
    expect(REQBOARD_SCHEMA_VERSION).toBe(9)
  })
})

describe('读路径绝不抛错 + 宽容的边界（别把降级变成崩溃 / 别把垃圾交给上层）', () => {
  it('畸形 JSON：null / 数组 / 标量根 → undefined（与"解析失败"同类），且不抛错', async () => {
    for (const text of ['null', '[]', '42', '"x"']) {
      await writeFile(queuePath(), text, 'utf8')
      let loaded: QueueFile | undefined
      await expect(async () => {
        loaded = await repo.load(REQ)
      }).not.toThrow()
      expect(loaded).toBeUndefined()
    }
    expect(warnings.some((w) => w.includes('根不是 JSON 对象'))).toBe(true)
  })

  it('对象根但内容不合规（字段全缺）→ 宽容返回，不抛错', async () => {
    // 只有对象条目、但字段全缺：V-1 会报，读侧宽容照旧返回（上层拿得到"这张卡存在"）
    await writeFile(queuePath(), JSON.stringify({ tasks: [{}] }), 'utf8')

    const loaded = await repo.load(REQ)

    expect(loaded).not.toBeUndefined()
    expect(loaded!.tasks).toEqual([{}])
    expect(warnings.some((w) => w.includes('未通过校验'))).toBe(true)
  })

  it('tasks 含非对象条目（null / 数字）：仍按不可用处理——下游 toRecord 会对它当场抛', async () => {
    await writeFile(queuePath(), JSON.stringify({ tasks: [null, 42] }), 'utf8')

    const store = new QueueTaskStore({ repo, now: () => 1_800_000_000_000 })
    // 不抛错是第一条断言（抛了就是"降级变崩溃"）
    const listed = await store.listByRequirement(REQ)

    expect(listed).toEqual([]) // 旧行为保持：宁可降级成 0 张，也不让 structuredClone(null) 崩
    expect(warnings.some((w) => w.includes('非对象条目'))).toBe(true)
  })
})

describe('V-5 两档：漏就绪 warning / 假就绪 issue（FR-1 / migration §风险 ④ 对策 3）', () => {
  it('漏就绪标本：passed === true 且该条 level === warning', () => {
    const result = validateQueueFile(JSON.parse(legacyShardText()) as QueueFile)

    expect(result.passed).toBe(true)
    const missed = result.issues.filter((i) => i.rule === 'V-5' && i.message.includes('漏就绪'))
    expect(missed).toHaveLength(1)
    expect(missed[0]!.level).toBe('warning')
  })

  it('假就绪标本：passed === false、level 缺省（= issue）、save 抛 QUEUE_VALIDATION_FAILED', async () => {
    // 刻意写坏：把**已取消**的 `t-c` 塞进 ready（可执行集只应含 todo）——真写坏，不是陈旧
    const broken: QueueFile = {
      ...(JSON.parse(legacyShardText()) as QueueFile),
      ready: ['t-a', 't-c'],
    }
    const result = validateQueueFile(broken)

    expect(result.passed).toBe(false)
    const fake = result.issues.filter((i) => i.rule === 'V-5' && i.message.includes('假就绪'))
    expect(fake).toHaveLength(1)
    expect(fake[0]!.level).toBeUndefined() // 缺省 = issue（加性可选字段的兼容形状）
    expect(levelOf(fake[0]!)).toBe('issue')

    // 写路径仍 fail-closed：一个字节都不落盘
    const before = await fingerprint(queuePath())
    await expect(repo.save(REQ, broken)).rejects.toMatchObject({ code: QUEUE_ERROR.VALIDATION_FAILED })
    expect(await fingerprint(queuePath())).toEqual(before)
  })

  it('同一标本 save **不抛**（写路径强校验，但该标本按新判据已自洽）', async () => {
    const file = JSON.parse(legacyShardText()) as QueueFile

    await expect(repo.save(REQ, file)).resolves.toBeUndefined()

    // 落盘后 `ready[]` 仍是入参里的旧口径（save 不替调用方重算派生视图：那是 normalizeQueueFile 的活）
    const saved = JSON.parse(await readFile(queuePath(), 'utf8')) as QueueFile
    expect(saved.ready).toEqual(['t-a'])
  })
})
