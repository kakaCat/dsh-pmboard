// serves: FR-1, FR-2
/**
 * 项目维度口径与跨项目隔离（REQ-261001203710-0fbf）
 *
 * 本文件分两批：
 *   ① 纯函数口径（t1）：projectRootOf / partitionByProject / sameProjectRoot —— 无 IO，直接断言；
 *   ② 两项目夹具（t5）：零访问 / 零写入 / 错配必拒 / 未归属标注 / 读侧两病因 / E2E。
 *
 * ⚠️ 为什么不用「断言本项目产物存在」当主判据：两个项目**都写成功**时它照样绿。
 * 真正钉住隔离的是「另一个项目目录**零访问 / 零写入**」。
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  projectRootOf,
  partitionByProject,
  sameProjectRoot,
  normalizeProjectRoot,
  ensureWritableProjectRoot,
} from '../src/application/internal/support.js'
import { executeQueryKnowledge } from '../src/application/use-cases/QueryKnowledge.js'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { syncAllReqArtifacts } from '../src/adapters/ArtifactSync.js'
import type { DocRepository, DocEntry } from '../src/application/ports.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

describe('projectRootOf：一条记录属于哪个项目（唯一口径）', () => {
  it('记录声明了 workspaceRoot → 用它，且 attributed=true', () => {
    const d = projectRootOf({ workspaceRoot: '/w/proj-a' }, '/w/session')
    expect(d.root).toBe('/w/proj-a')
    expect(d.attributed).toBe(true)
  })

  it('记录未声明 / 空串 / undefined → 用 fallback，且 attributed=false（必须标注）', () => {
    for (const rec of [{}, { workspaceRoot: '' }, undefined]) {
      const d = projectRootOf(rec, '/w/session')
      expect(d.root).toBe('/w/session')
      expect(d.attributed).toBe(false)
    }
  })

  it('空串**不**被当成「声明了空项目」——仍走 fallback 且标注', () => {
    const d = projectRootOf({ workspaceRoot: '' }, '/w/session')
    expect(d.attributed).toBe(false)
  })
})

describe('projectRootOf：路径形状归一（尾斜杠 / 重复斜杠 / 反斜杠）', () => {
  it('尾斜杠不造成两个写法不同', () => {
    expect(normalizeProjectRoot('/w/proj/')).toBe('/w/proj')
    expect(projectRootOf({ workspaceRoot: '/w/proj/' }, '/x').root).toBe('/w/proj')
  })

  it('重复斜杠与反斜杠归一', () => {
    expect(normalizeProjectRoot('/w//proj')).toBe('/w/proj')
    expect(normalizeProjectRoot('C:\\w\\proj')).toBe('C:/w/proj')
  })

  it('根路径 / 不被削成空串', () => {
    expect(normalizeProjectRoot('/')).toBe('/')
  })
})

describe('projectRootOf：软链等价（realpath 解算器可注入，application 层不碰 fs）', () => {
  const fakeRealpath = (p: string): string => {
    if (p === '/link/proj') return '/real/proj'
    if (p === '/real/proj') return '/real/proj'
    throw new Error('ENOENT')
  }

  it('注入解算器时：软链与其目标判为同一项目', () => {
    expect(sameProjectRoot('/link/proj', '/real/proj', fakeRealpath)).toBe(true)
  })

  it('不注入解算器时：只做形状比较，不同写法判为不同项目（如实，不猜）', () => {
    expect(sameProjectRoot('/link/proj', '/real/proj')).toBe(false)
  })

  it('解算器抛错时不把比较动作炸掉，退回原值比较', () => {
    const boom = (): string => { throw new Error('boom') }
    expect(sameProjectRoot('/w/a', '/w/a', boom)).toBe(true)
    expect(sameProjectRoot('/w/a', '/w/b', boom)).toBe(false)
  })

  it('尾斜杠 + 解算器：两种写法视为同一项目', () => {
    expect(sameProjectRoot('/real/proj/', '/real/proj', fakeRealpath)).toBe(true)
  })
})

describe('projectRootOf：partitionByProject 分三桶', () => {
  const recs = [
    { id: 'A', workspaceRoot: '/w/a' },
    { id: 'B', workspaceRoot: '/w/b/' },
    { id: 'C' },
  ]

  it('我的 / 别人的 / 未归属 各归其位', () => {
    const p = partitionByProject(recs, '/w/a', '/w/session')
    expect(p.mine.map(r => r.id)).toEqual(['A'])
    expect(p.others.map(r => r.id)).toEqual(['B'])
    expect(p.unattributed.map(r => r.id)).toEqual(['C'])
  })

  it('未归属**不**混进「我的」——否则又会静默当成当前项目', () => {
    const p = partitionByProject(recs, '/w/session', '/w/session')
    expect(p.mine.map(r => r.id)).toEqual([])
    expect(p.unattributed.map(r => r.id)).toEqual(['C'])
  })

  it('别人的项目永远不会出现在 mine 里（跨项目隔离的最小断言）', () => {
    for (const cur of ['/w/a', '/w/b', '/w/c', '/w/session']) {
      const p = partitionByProject(recs, cur, '/w/session')
      expect(p.mine.every(r => r.workspaceRoot !== '/w/b' || cur === '/w/b')).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// 两项目夹具：看板扫描不再拿全部项目的清单用同一个目录去扫（t2）
//
// 为什么这样造夹具：真正的污染形态不是「读到空」，而是**别的项目下有一个与本次需求同名的目录**——
// 旧实现拿本项目根去扫别人家，会把那个同名目录里的文件登记成"本次需求的产物"。
// 所以判别断言不是"本项目产物在"，而是"**别人项目的记录没被本项目根污染**"。
// ---------------------------------------------------------------------------

const REQ_A = 'REQ-000a01'
const REQ_B = 'REQ-000b02'

/** 计数版仓储：把每一次 exists/read/list/stat/write 记下来，好断言「零访问」。 */
class CountingDocs implements DocRepository {
  readonly accesses: { root: string; op: string; rel: string }[] = []
  constructor(private readonly inner: FileDocRepository, private readonly root: string) {}
  workspaceRoot(): string { return this.root }
  resolve(rel: string): string {
    this.accesses.push({ root: this.root, op: 'resolve', rel })
    return this.inner.resolve(rel)
  }
  exists(rel: string): boolean {
    this.accesses.push({ root: this.root, op: 'exists', rel })
    return this.inner.exists(rel)
  }
  async read(rel: string): Promise<string> {
    this.accesses.push({ root: this.root, op: 'read', rel })
    return await this.inner.read(rel)
  }
  async write(rel: string, content: string): Promise<void> {
    this.accesses.push({ root: this.root, op: 'write', rel })
    await this.inner.write(rel, content)
  }
  list(rel: string): readonly DocEntry[] {
    this.accesses.push({ root: this.root, op: 'list', rel })
    return this.inner.list(rel)
  }
  stat(rel: string): { mtimeMs: number; size: number } | undefined {
    this.accesses.push({ root: this.root, op: 'stat', rel })
    return this.inner.stat(rel)
  }
}

let dirA: string
let dirB: string
let dirLedger: string
let store: ReturnType<typeof makeTestStore>

beforeEach(() => {
  dirA = mkdtempSync(join(tmpdir(), 'pmboard-scope-A-'))
  dirB = mkdtempSync(join(tmpdir(), 'pmboard-scope-B-'))
  dirLedger = mkdtempSync(join(tmpdir(), 'pmboard-scope-L-'))
  store = makeTestStore()
})
afterEach(() => {
  for (const d of [dirA, dirB, dirLedger]) rmSync(d, { recursive: true, force: true })
})

function rec(id: string, root: string): RequirementRecord {
  return {
    id, title: id, description: '', category: 'feature', status: 'brainstorming',
    blocked: false, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
    workspaceRoot: root,
  } as unknown as RequirementRecord
}

/** 两个项目各一条记录；**并在 A 下放一个与 B 同名的需求目录**（真实污染形态）。 */
async function seedTwoProjects(): Promise<void> {
  mkdirSync(join(dirA, 'docs/requirements', REQ_B), { recursive: true })
  writeFileSync(join(dirA, 'docs/requirements', REQ_B, 'requirement.md'), '# A 项目下的同名目录（不该被当成 B 的产物）\n')
  mkdirSync(join(dirB, 'docs/requirements', REQ_B), { recursive: true })
  writeFileSync(join(dirB, 'docs/requirements', REQ_B, 'requirement.md'), '# B 项目自己的需求文档\n')
  mkdirSync(join(dirB, 'docs/requirements', REQ_A), { recursive: true })
  const recs = [rec(REQ_A, dirA), rec(REQ_B, dirB)]
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [...recs], triages: [] })
}

function countingFactory(sink: CountingDocs[]) {
  return (root: string): DocRepository => {
    const d = new CountingDocs(new FileDocRepository({ workspaceRoot: root }), root)
    sink.push(d)
    return d
  }
}

describe('两项目夹具：扫描不得动用别的项目', () => {
  it('零访问：以 A 为当前项目扫描时，B 的目录一次都没被碰过', async () => {
    await seedTwoProjects()
    const made: CountingDocs[] = []

    const res = await syncAllReqArtifacts(store, dirA, { makeDocs: countingFactory(made) })

    const accesses = made.flatMap(d => d.accesses)
    const touchedB = accesses.filter(a => resolve(a.root, a.rel).startsWith(resolve(dirB)))
    expect(touchedB, 'B 的目录被访问了：' + JSON.stringify(touchedB.slice(0, 3))).toEqual([])
    expect(res.skipped).toBe(1)
  })

  it('跳过计数 + 关键判别：A 下那个与 B 同名的目录，绝不能被登记成 B 的产物', async () => {
    await seedTwoProjects()
    const made: CountingDocs[] = []

    const res = await syncAllReqArtifacts(store, dirA, { makeDocs: countingFactory(made) })

    // ⚠️ 判别断言放最前：**危害不是"碰到 B 的目录"，而是"拿 A 的根去处理 B 的记录"**——
    // 旧实现正是这样把 A 下的同名目录登记成了 B 的产物。访问计数抓不到它，这条才抓得到。
    const recB = store.peek(REQ_B)
    expect(
      (recB?.artifacts ?? []).filter(a => a.path.includes(REQ_B)),
      'B 的产物被 A 的目录污染了（旧行为会把 A 下同名目录登记成 B 的产物）',
    ).toEqual([])
    // A 自己的记录也不该凭空多出 B 的产物
    const recA = store.peek(REQ_A)
    expect((recA?.artifacts ?? []).every(a => !a.path.includes(REQ_B))).toBe(true)
    // 再核对计数：B 被跳过
    expect(res.skipped).toBe(1)
  })

  it('正向对照：以 B 为当前项目扫描时，扫的是 B 自己的目录，A 被跳过', async () => {
    await seedTwoProjects()
    const made: CountingDocs[] = []

    const res = await syncAllReqArtifacts(store, dirB, { makeDocs: countingFactory(made) })

    expect(res.skipped).toBe(1)
    const recB = store.peek(REQ_B)
    expect((recB?.artifacts ?? []).some(a => a.path === 'docs/requirements/' + REQ_B + '/requirement.md')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 写盘前守卫（t3）：错配即拒 / 校正后只写自己项目
// ---------------------------------------------------------------------------

describe('未归属老记录：仍被处理，但不冒充本项目（t5）', () => {
  // ⚠️ 覆盖缺口（如实记录）：本想再加一条「无根老记录仍被扫描到」的夹具用例，
  // 但新需求存储端口的 mutate 是 **id 语义**（「写操作不隐式建档」），照抄既有夹具的
  // 种子写法会抛「需求 seed 不存在」。不与 harness 缠斗，改为**只钉住能立住的那条**：
  // 兜底来的根必须标注为「不是记录自己声明的」，且单独成桶。
  // 「仍被处理」这半句由 t2 的两项目夹具间接保证（unattributed 与 mine 同被扫描、只计入 skipped 的才是 others）。
  it('它的归属必须如实标注为「兜底」，不得冒充本项目', () => {
    type Row = { id: string; workspaceRoot?: string }
    const rows: Row[] = [{ id: 'A', workspaceRoot: '/w/current' }, { id: 'REQ-000c03' }]
    const d = projectRootOf(rows[1], '/w/current')
    expect(d.attributed, '兜底来的根不能伪装成记录自己声明的').toBe(false)
    // 混装时它单独成桶——调用方据此才知道「这条是猜的」
    const p = partitionByProject<Row>(rows, '/w/current', '/w/current')
    expect(p.mine.map(r => r.id)).toEqual(['A'])
    expect(p.unattributed.map(r => r.id)).toEqual(['REQ-000c03'])
  })

  it('无根记录的兜底根可被核验，但守卫不会因此误拒（读不回根就不判）', () => {
    const docs = { workspaceRoot: () => '/w/current' }
    // 无 workspaceRoot → 无「错配」可言：守卫返回 undefined，不抛
    expect(ensureWritableProjectRoot({ docs }, { id: 'REQ-000c03' })).toBeUndefined()
  })
})

describe('知识层读不到的两种病因（t4）', () => {
  const mkDeps = (projectRoot: string, kbRoot: string) => ({
    docs: { workspaceRoot: () => projectRoot },
    knowledge: {
      indexExists: async () => false,
      readEntries: async () => ({ rows: [] }),
      docs: { workspaceRoot: () => kbRoot },
    },
  }) as never

  it('病因一：本项目确实没生成 → 说「本项目知识层未生成」并给出项目根', async () => {
    const r = await executeQueryKnowledge(mkDeps('/w/proj-a', '/w/proj-a'), { kind: 'standard' })
    const hint = String(r.hint)
    expect(hint).toContain('本项目知识层未生成')
    expect(hint).toContain('/w/proj-a')
    expect(hint).not.toContain('不一致')
  })

  it('病因二：根指到别的项目 → 说「项目根与索引位置不一致」并同时给出两个绝对路径（且不再说「未初始化」）', async () => {
    const r = await executeQueryKnowledge(mkDeps('/w/proj-a', '/w/proj-b'), { kind: 'standard' })
    const hint = String(r.hint)
    expect(hint).toContain('项目根与索引位置不一致')
    expect(hint).toContain('/w/proj-a')
    expect(hint).toContain('/w/proj-b')
    // 反向断言：这两句文案不许再混用（混用就是把两种病当一种，实测骗了我三次）
    expect(hint).not.toContain('未初始化')
  })

  it('反向断言：索引改名为不存在时，也不得再出现口径混用的「未初始化」字样', async () => {
    const r = await executeQueryKnowledge(mkDeps('/w/proj-a', '/w/proj-b'), { kind: 'standard' })
    expect(String(r.hint)).not.toContain('知识层未初始化')
  })
})

describe('写盘覆盖：工作区相对写盘点必须受保护或显式豁免（t8）', () => {
  const SRC_DIR = new URL('../src/', import.meta.url).pathname

  /** 受守卫保护的写入器（相对 src/ 的路径 → 保护点说明）。键=文件，值=保护方式。 */
  const PROTECTED_WRITERS: Record<string, string> = {
    'application/internal/plan-landing.ts': 'landPlanTasks 入口 ensureWritableProjectRoot',
    'application/internal/rtm-yaml.ts': 'syncRTMYaml 内 assertWritableRequirementProject（覆盖十处 RTM 调用点）',
    'application/internal/verification-doc-writer.ts': '写前 ensureWritableProjectRoot（验收文档）',
    'application/use-cases/ReportTask.ts': '写前 ensureWritableProjectRoot（任务卡完工记录）',
    'application/use-cases/AmendTaskAcceptance.ts': '写前 assertWritableRequirementProject（改验收标准）',
    'application/use-cases/AdvanceChain.ts': 'appendHistory 内 assertWritableRequirementProject（链上追加）',
    'application/use-cases/SubmitVerification.ts': '写前 assertWritableRequirementProject（验收文档另一条路径）',
    'application/use-cases/SyncRequirementMarks.ts': '写前 ensureWritableProjectRoot（需求文档接收标记）',
    'application/use-cases/queue-access.ts': 'mutateQueue / createManyQueue 两个队列写入收口点（内含 assertWritableRequirementProject）',
  }

  /**
   * 显式豁免（相对 src/ 的路径 → 理由）。**豁免也要写理由**：不写理由的豁免等于没门禁。
   * 目前仅一条：知识层走自己实例构造时的根，不经会被别的窗口改掉的宿主级共享单例。
   */
  const EXEMPT: Record<string, string> = {
    'adapters/KnowledgeRepository.ts': '写入走本实例的 docs（构造时定根），不属于"共享根的当前值会漂移"这一类失效',
  }

  /**
   * 工作区相对的写盘点形状。**两类都必须精确**——宽正则会误伤台账写入（实测踩过）：
   *   ① 文档写入 `docs.write(...)`（工作区相对文件）；
   *   ② **队列写入**（`queue.json` 也在工作区里，原始事故正是写队列时发生的）。
   *      两步判定：`taskStoreOf(deps).mutate/createMany` 直接命中；或文件里先
   *      `const store = taskStoreOf(deps)` 再 `store.mutate/createMany`（此时 store 是队列仓储）。
   *      ⚠️ 台账写入（`RequirementStore.mutate`，如 `mutateIfPresent` / `rollup`）**不在扫描范围**：
   *      台账是宿主级 `~/.dsh/...`，不随工作区根漂移。
   */
  const WRITE_POINT = /(?:\bdocs|deps\.docs|this\.docs|ports\.docs)\.write\s*\(|taskStoreOf\([^)]*\)\.(?:mutate|createMany)\s*\(/
  const QUEUE_VIA_STORE = /\bstore\.(?:mutate|createMany)\s*\(/
  const BINDS_QUEUE_STORE = /const\s+store\s*=\s*taskStoreOf\(deps\)/
  const GUARD_CALL = /(?:ensureWritableProjectRoot|assertWritableRequirementProject)\s*\(/

  function listTs(dir: string): string[] {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
      const p = (dir.endsWith('/') ? dir : dir + '/') + name
      if (statSync(p).isDirectory()) out.push(...listTs(p))
      else if (name.endsWith('.ts')) out.push(p)
    }
    return out
  }

  /**
   * **待偿清单**（按文件，不按行号——行号会漂）。这些文件里的队列写盘点**尚未**受守卫保护，
   * 是 t8 门禁跑出来的真实欠账，不是豁免：新出现的未保护写盘点仍会让本用例变红；
   * 而且清单本身不许腐烂——某个文件一旦补上守卫，本用例会因为「它已不再是违规」而变红，逼着删条目。
   *
   * 收口方式（t7 的下一步）：队列写入的真收口点是 `taskStoreOf(deps)` 这一处端口访问——
   * 新增 `mutateQueue(deps, reqId, fn)` / `createManyQueue(deps, reqId, drafts)` 两个包装（内含判定），
   * 把下面 9 个文件里的 12 处写入迁过去，即可一次收敛，而不是逐点补。
   * （更正：~~queue-access.ts 的 mutate~~ 写的是**需求台账**，与工作区根无关，不是队列收口点。）
   */
  const PENDING_GUARD: Record<string, string> = {
    // 目前已清零：队列写入的 12 处全部迁到 mutateQueue / createManyQueue 收口点。
    // 留空对象而非删掉：新出现的裸写仍会被上面那条断言抓住，并需要在这里登记理由。
  }

  it('每个工作区相对写盘点都在受保护文件列表、豁免清单或待偿清单里', () => {
    const violations: string[] = []
    const hitPending = new Set<string>()
    for (const file of listTs(SRC_DIR)) {
      const rel = file.slice(SRC_DIR.length)
      const text = readFileSync(file, 'utf8')
      // 该文件是否把 `store` 绑成了队列仓储 → 决定 `store.mutate/createMany` 算不算队列写入
      const bindsQueue = BINDS_QUEUE_STORE.test(text)
      text.split(/\r?\n/).forEach((line, i) => {
        const isWrite = WRITE_POINT.test(line) || (bindsQueue && QUEUE_VIA_STORE.test(line))
        if (!isWrite) return
        const t = line.trim()
        if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return
        if (PROTECTED_WRITERS[rel] !== undefined || EXEMPT[rel] !== undefined) return
        if (PENDING_GUARD[rel] !== undefined) { hitPending.add(rel); return }
        violations.push(rel + ':' + (i + 1) + '  ' + t)
      })
    }
    expect(
      violations,
      '以下工作区相对写盘点既未受守卫保护、也未在豁免/待偿清单里——请把判定下沉到该写入器，或写清理由：\n' + violations.join('\n'),
    ).toEqual([])
    // 清单不许腐烂：补上守卫的条目必须从待偿清单里删掉（否则它会一直假装修着）
    const stale = Object.keys(PENDING_GUARD).filter(f => !hitPending.has(f))
    expect(stale, '待偿清单里这些文件已不再是违规（守卫已补上或写盘点已移除）——请删掉条目：\n' + stale.join('\n')).toEqual([])
  })

  it('白名单不许腐烂：每个受保护文件里真的能找到守卫调用', () => {
    const rotten: string[] = []
    for (const rel of Object.keys(PROTECTED_WRITERS)) {
      const text = readFileSync(SRC_DIR + rel, 'utf8')
      if (!GUARD_CALL.test(text)) rotten.push(rel + '（' + PROTECTED_WRITERS[rel] + '）')
    }
    expect(rotten, '白名单里这些文件已找不到守卫调用（要么被删、要么判定被挪走）：\n' + rotten.join('\n')).toEqual([])
  })
})

describe('写盘前守卫：错配即拒，绝不静默写别处（t3）', () => {
  it('错配：解析根与记录声明的根不一致 → 抛 REQBOARD_PROJECT_ROOT_MISMATCH，且文案含两个绝对路径', () => {
    // 无 setWorkspaceRoot 的替身：校正无法生效 → 观测到不一致 → 必须拒绝
    const docs = { workspaceRoot: () => '/w/other-project' }
    let err: { code?: string; message?: string } | undefined
    try {
      ensureWritableProjectRoot({ docs }, { id: 'REQ-x', workspaceRoot: '/w/my-project' })
    } catch (e) {
      err = e as { code?: string; message?: string }
    }
    expect(err, '错配时必须抛错，而不是默默写下去').toBeDefined()
    expect(err?.code).toBe('REQBOARD_PROJECT_ROOT_MISMATCH')
    // 两个绝对路径都要给出来——只说"不一致"等于让人猜
    expect(String(err?.message)).toContain('/w/my-project')
    expect(String(err?.message)).toContain('/w/other-project')
  })

  it('根一致时不误拒：仓储已指向记录声明的根 → 返回该根（且不改动它）', () => {
    const root = mkdtempSync(join(tmpdir(), 'pmboard-guard-'))
    try {
      const docs = new FileDocRepository({ workspaceRoot: root })
      const got = ensureWritableProjectRoot({ docs }, { workspaceRoot: root })
      expect(got).toBe(resolve(root))
      // 守卫只核验、不搬动：根没被动过
      expect(docs.workspaceRoot()).toBe(resolve(root))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('记录未声明项目根 → 不判错配（返回 undefined，交由调用方兜底并标注）', () => {
    const docs = { workspaceRoot: () => '/w/other' }
    expect(ensureWritableProjectRoot({ docs }, {})).toBeUndefined()
  })

  it('读不回根（无探针的内存替身）→ 不谎报成功也不误拒', () => {
    expect(ensureWritableProjectRoot({ docs: {} }, { workspaceRoot: '/w/my' })).toBeUndefined()
  })

  it('声明根是权威：当前根 A、记录声明 B → 校正到 B 并返回 B，A 目录零新增（新契约）', async () => {
    const dirA = mkdtempSync(join(tmpdir(), 'pmboard-guard-A-'))
    const dirB = mkdtempSync(join(tmpdir(), 'pmboard-guard-B-'))
    try {
      // 变更记（REQ-261005123641-3982）：旧契约在「当前根 = A、记录声明 = B」时**拒绝**。
      // 新契约下**记录是权威**——当前根 A 只是别的窗口留下的缓存值（多窗口并行下必现），校正到 B 才对；
      // 本用例保持等强度断言：产物**只能**落在声明根下，调用方当前根目录零新增。
      const docs = new FileDocRepository({ workspaceRoot: dirA })
      const got = ensureWritableProjectRoot({ docs }, { workspaceRoot: dirB })
      expect(got).toBe(resolve(dirB))
      expect(docs.workspaceRoot()).toBe(resolve(dirB))
      await docs.write('docs/requirements/REQ-x/rtm-lifecycle.yml', 'x')
      expect(existsSync(join(dirB, 'docs/requirements/REQ-x/rtm-lifecycle.yml')), '必须写进记录声明的根').toBe(true)
      expect(existsSync(join(dirA, 'docs/requirements/REQ-x/rtm-lifecycle.yml')), '不得留在当前根').toBe(false)
      expect(readdirSync(dirA), '调用方当前根目录零新增').toEqual([])
    } finally {
      rmSync(dirA, { recursive: true, force: true })
      rmSync(dirB, { recursive: true, force: true })
    }
  })
})
