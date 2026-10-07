// serves: FR-1, FR-2
/**
 * 读盘闸门的需求级根校正（REQ-260930193929-897b · serves FR-1, FR-2）
 *
 * 缺陷：`deps.docs` 是**宿主级、跨窗口共享**的单例，根会被别的窗口改掉。读盘类闸门
 * 若不在读文档前按需求自己的 `workspaceRoot` 再校正一次，就会去错误目录找文档——
 * 两个相反方向的坏结果：
 *   · 完整性门            → 报「requirement.md 不存在」（误拦，需求卡死）；
 *   · 拆分内容硬门        → `list(design/)` 读到空数组而**静默放行**（漏放）。
 *
 * 本文件锁住两件事（正反双向，缺一不可）：
 *   ① 会话根 ≠ 需求根、文档在需求根  → 必须放行（否则就是原缺陷）；
 *   ② 同一个「会话根 ≠ 需求根」下，需求根**确实缺文件** → 必须仍然拦（否则修成了永久放行）。
 *
 * ⚠️ 测试替身陷阱：`tests/application/harness.ts` 的 `FakeDocs` **没有根的概念、也没有
 * `setWorkspaceRoot`**，根校正走鸭子探测会被静默跳过 → 断言会「空过」（测试全绿但什么都没验证）。
 * 故本文件一律用**真实 `FileDocRepository`** 指向两个临时目录，并显式断言校正后的根。
 */
import { makeHarness, makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { EventEmitter } from 'node:events'
import { createReqboardHandler } from '../src/http/routes.js'
import { taskStoreAt } from './queue/route-deps.js'
import { applyRequirementWorkspaceRoot } from '../src/application/internal/support.js'
import { checkDesignDecompositionGate } from '../src/application/internal/design-gates.js'
import { askConfirm } from '../src/application/use-cases/AskConfirm.js'
import { toUseCaseDeps } from './helpers/tool-deps.js'
import type { RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

const W = 'session-g2ws-001'
const REQ = 'REQ-g2ws01'
const DESIGN5 = ['architecture.md', 'data-model.md', 'interfaces.md', 'test-cases.md', 'use-cases.md']
const DESIGN_DIR = 'docs/requirements/' + REQ + '/design'

/** 会话/别名根（外来的、过期的根）与需求根——刻意是两个不同目录。 */
let dirA: string
let dirB: string
let store: ReturnType<typeof makeTestStore>

beforeEach(() => {
  dirA = mkdtempSync(join(tmpdir(), 'pmboard-g2ws-A-'))
  dirB = mkdtempSync(join(tmpdir(), 'pmboard-g2ws-B-'))
  store = makeTestStore()
})
afterEach(() => {
  rmSync(dirA, { recursive: true, force: true })
  rmSync(dirB, { recursive: true, force: true })
})

/** feature 必填节（边界 + 类型专属三节）齐全的最小需求文档。 */
function reqDoc(): string {
  return '---\nreq: ' + REQ + '\n---\n\n# 需求\n\n## 边界\n不做范围外的事。\n\n'
    + '## 产品定义\nx\n\n## 用户与角色\nx\n\n## 功能点\n\n- **FR-1: 甲**\n'
}

/** 在需求根 B 下落盘文档集；`archExtra` 用于注入拆分内容特征。 */
function writeDocsetIntoB(opts: { withRequirement?: boolean; archExtra?: string } = {}): void {
  mkdirSync(join(dirB, 'docs/requirements', REQ, 'design'), { recursive: true })
  if (opts.withRequirement !== false) {
    writeFileSync(join(dirB, 'docs/requirements', REQ, 'requirement.md'), reqDoc())
  }
  for (const n of DESIGN5) {
    const body = n === 'architecture.md' && opts.archExtra !== undefined
      ? '# architecture\n\n| depends_on | 说明 |\n|---|---|\n| t1 | x |\n'
      : '# ' + n + '\n'
    writeFileSync(join(dirB, DESIGN_DIR, n), body)
  }
}

async function seed(opts: { workspaceRoot?: string } = {}): Promise<void> {
  // 刻意**不**置 confirmedAt：要走的正是「用户确认 → 落章 → 自动推进」这条真实路径。
  // 若预置成已确认，AskConfirm 会走「已确认 → 早返回不推进」分支，绕开被验的闸门。
  const artifacts: StageArtifact[] = DESIGN5.map(name => ({
    stage: 'design', kind: 'design', path: DESIGN_DIR + '/' + name,
    registeredAt: 1, registeredBy: { kind: 'agent', sessionId: W },
  }) as StageArtifact)
  const r = {
    id: REQ, title: '根校正', description: '', category: 'feature', status: 'design',
    blocked: false, sourceSessionId: W, comments: [], version: 1,
    createdAt: 1, updatedAt: 1, createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [], artifacts,
    ...(opts.workspaceRoot !== undefined ? { workspaceRoot: opts.workspaceRoot } : {}),
  } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

/** 会话根 A ≠ 需求根 B：deps 的 docs 指向 A，需求记录声明 B。 */
function deps(sessionRoot: string) {
  return toUseCaseDeps({
    store,
    now: () => 1000,
    workspaceRoot: sessionRoot,
    userQuestions: () => ({ ask: async () => ({ answers: [{ id: 'confirm', selected: ['确认，进入拆分'] }] }) }),
  } as never)
}

const ASK_ARGS = {
  target: 'artifact', kind: 'design', question: '设计文档已完成，是否确认进入拆分？',
  options: ['确认，进入拆分', '需要修改'],
}

async function runAsk(uc: unknown): Promise<any> {
  return await askConfirm(uc as never, ASK_ARGS, { agent: { id: W } })
}

describe('正向：会话根 ≠ 需求根，文档在需求根 → 放行并推进（原缺陷的修复）', () => {
  it('弹框确认后自动推进放行，且读盘前根已校正到需求根', async () => {
    writeDocsetIntoB()
    await seed({ workspaceRoot: dirB })
    const uc = deps(dirA)

    // 前置：docs 的根确实是「外来的」会话根 A，A 下没有任何需求文档
    expect(uc.docs.workspaceRoot()).toBe(dirA)
    expect(uc.docs.exists('docs/requirements/' + REQ + '/requirement.md')).toBe(false)

    const out = await runAsk(uc)

    expect(out.confirmed).toBe(true)
    expect(out.gate_failure).toBeUndefined()
    expect(out.advanced).toBe(true)
    // 「读盘前根确实等于需求根」——把替身空过变成可证伪的断言
    expect(uc.docs.workspaceRoot()).toBe(dirB)
    expect(store.peekAll()[0].status).toBe('decomposing')
  })
})

describe('反向：同样的「会话根 ≠ 需求根」，但需求根下确实缺文件 → 仍拦（防修成永久放行）', () => {
  it('缺 requirement.md → design_doc_incomplete，且缺口就是「requirement.md 不存在」', async () => {
    writeDocsetIntoB({ withRequirement: false })
    await seed({ workspaceRoot: dirB })
    const uc = deps(dirA)

    const out = await runAsk(uc)

    expect(out.advanced).toBe(false)
    expect(out.gate_failure?.code).toBe('design_doc_incomplete')
    expect((out.gate_failure?.gaps ?? []).join(' ')).toContain('requirement.md 不存在')
    // 关键：根**已经**校正到需求根 B——所以这次拦是「B 下真没有」，不是「读错目录」的假象
    expect(uc.docs.workspaceRoot()).toBe(dirB)
    expect(store.peekAll()[0].status).toBe('design')
  })

  it('需求根 B 下补齐 requirement.md 后，同一套夹具立即放行（证明上一条拦的是文件缺失本身）', async () => {
    writeDocsetIntoB({ withRequirement: false })
    await seed({ workspaceRoot: dirB })
    expect((await runAsk(deps(dirA))).advanced).toBe(false)

    writeFileSync(join(dirB, 'docs/requirements', REQ, 'requirement.md'), reqDoc())
    const out = await runAsk(deps(dirA))
    // 第二次调用会走「同一产物不重复弹框」的早返回分支（首次确认已落章），故 advanced 本就为 false。
    // 关键差异只有一个：**缺口消失了**——同一套夹具、同一个「外来根」，补齐文件后闸门不再报缺失。
    expect(out.gate_failure).toBeUndefined()
    expect(String(out.note)).not.toContain('requirement.md 不存在')
  })
})

describe('拆分内容硬门：错误根下会静默放行，校正后必须拦住', () => {
  it('直接对「会话根 A」跑硬门 → 读到空数组而无声通过（记录 fail-open 现象）', async () => {
    writeDocsetIntoB({ archExtra: 'yes' })
    await seed({ workspaceRoot: dirB })
    const docsAtA = new FileDocRepository({ workspaceRoot: dirA })
    const req = store.peekAll()[0]

    // A 下没有 design/ 目录 → 扫描不到任何文档 → 门禁静默放行（这正是缺陷的第二种后果）
    expect(await checkDesignDecompositionGate(docsAtA, req)).toBeUndefined()
  })

  it('校正到需求根后，同一份设计文档被 design_contains_decomposition 拒', async () => {
    writeDocsetIntoB({ archExtra: 'yes' })
    await seed({ workspaceRoot: dirB })

    await expect(runAsk(deps(dirA))).rejects.toThrow(/design_contains_decomposition/)
  })
})

describe('存量兼容：需求未声明 workspaceRoot → 校正为 no-op（行为不变）', () => {
  it('applyRequirementWorkspaceRoot 不改根、不抛错', () => {
    const docs = new FileDocRepository({ workspaceRoot: dirA })
    applyRequirementWorkspaceRoot({ docs }, {})
    expect(docs.workspaceRoot()).toBe(dirA)
    applyRequirementWorkspaceRoot({ docs }, undefined)
    expect(docs.workspaceRoot()).toBe(dirA)
    applyRequirementWorkspaceRoot({ docs }, { workspaceRoot: '' })
    expect(docs.workspaceRoot()).toBe(dirA)
  })

  it('声明了 workspaceRoot → 校正到它（docs 与 queue 同根口径）', () => {
    const docs = new FileDocRepository({ workspaceRoot: dirA })
    applyRequirementWorkspaceRoot({ docs }, { workspaceRoot: dirB })
    expect(docs.workspaceRoot()).toBe(dirB)
  })

  it('替身没有 setWorkspaceRoot → 鸭子探测跳过，绝不抛错', () => {
    expect(() => applyRequirementWorkspaceRoot({ docs: {} }, { workspaceRoot: dirB })).not.toThrow()
  })
})

describe('防新增旁路：两个读盘闸门的每个调用点，读盘前都必须先校正根', () => {
  const FILES = [
    'src/application/use-cases/AskConfirm.ts',
    'src/application/internal/confirm-settle.ts',
    'src/application/use-cases/ConfirmArtifact.ts',
    'src/http/routers/requirements.ts',
  ]
  const GATE = /checkDesignCompletenessGate\(|checkDesignDecompositionGate\(/
  const FIX = /applyRequirementWorkspaceRoot\(/
  /**
   * 注释行必须排除——否则「把调用注释掉」仍会被正则匹配到，
   * 静态断言就变成了自欺（这是实测踩到的：注释掉 :103 的调用，断言照样绿）。
   */
  const isComment = (l: string): boolean => /^\s*(\/\/|\*|\/\*)/.test(l)
  const pkgRoot = fileURLToPath(new URL('..', import.meta.url))

  it('四个文件的闸门调用点全部有前置校正（新增旁路即失败）', () => {
    let total = 0
    for (const f of FILES) {
      const lines = readFileSync(join(pkgRoot, f), 'utf8').split('\n')
      const code = lines.map((l, i) => [l, i] as const).filter(([l]) => !isComment(l))
      const gateLines = code.filter(([l]) => GATE.test(l))
      expect(gateLines.length, f + ' 里没有闸门调用点？').toBeGreaterThan(0)
      for (const [, i] of gateLines) {
        const before = lines.slice(Math.max(0, i - 12), i).filter(l => !isComment(l))
        expect(before.some(l => FIX.test(l)), f + ':' + (i + 1) + ' 读盘前缺少根校正').toBe(true)
        total += 1
      }
    }
    // 本需求接线的是 7 处（完整性门 4 + 拆分内容硬门 3）；少一处即说明被误删
    expect(total).toBeGreaterThanOrEqual(7)
  })

  it('写侧入口仍然存在且委托同一实现（契约不被删）', () => {
    const src = readFileSync(join(pkgRoot, 'src/application/internal/support.ts'), 'utf8')
    expect(/export function applyRequirementWorkspaceRoot\(/.test(src)).toBe(true)
    expect(/export function syncWorkspaceRootForRequirement\(/.test(src)).toBe(true)
    expect(/applyRequirementWorkspaceRoot\(deps, requirement\)/.test(src)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// t4（兼容与回滚）：补上 t3 复核时如实披露的缺口——看板通道此前只有「接线位置」的
// 静态断言，没有行为用例。这里用真实 HTTP 处理链跑一遍看板一键确认。
// ---------------------------------------------------------------------------

function fakeReq(method: string, url: string, body?: unknown): any {
  const req = new EventEmitter() as any
  req.url = url
  req.method = method
  req[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8')
  }
  return req
}

function fakeRes(): any {
  const res: any = new EventEmitter()
  res.statusCode = 0
  res.payload = undefined
  res.writeHead = (code: number) => { res.statusCode = code; return res }
  res.end = (text?: string) => { res.payload = text === undefined ? undefined : JSON.parse(text); return res }
  return res
}

async function post(handler: unknown, url: string, body: unknown): Promise<any> {
  const res = fakeRes()
  await (handler as (q: unknown, s: unknown) => Promise<void>)(fakeReq('POST', url, body), res)
  return res
}

describe('E2E：错根下的完整链路（真实 HTTP → 仓储 → 状态机，断言可观察终态）', () => {
  it('会话根 A 下无该需求任何文档、需求声明 B → 看板一键确认后推进到 decomposing，并留下推进留痕', async () => {
    writeDocsetIntoB()
    await seed({ workspaceRoot: dirB })
    const handler = createReqboardHandler({ requirementStore: store,
      taskStore: taskStoreAt(dirA),
    // t2（REQ-261007135258-331a）：看板「确认即推进」改走单点 ⇒ 需完整用例依赖
    applicationDeps: { ...makeHarness().deps, store } as never,

      now: () => 1000,
      // 错根：A 下没有该需求的任何文档（下方前置断言把它钉死，证明这一跑确实是「错根」场景）
      docs: new FileDocRepository({ workspaceRoot: dirA }),
      agents: () => ({ get: () => ({ id: W, session: {} }) }),
    })

    // ── 前置（场景成立性）：同一时刻、同一文件——错根 A 下读不到，需求根 B 下读得到 ──
    expect(new FileDocRepository({ workspaceRoot: dirA }).exists('docs/requirements/' + REQ + '/requirement.md')).toBe(false)
    expect(new FileDocRepository({ workspaceRoot: dirB }).exists('docs/requirements/' + REQ + '/requirement.md')).toBe(true)

    const res = await post(handler, '/dashboard/api/reqboard/req/artifact/confirm', { id: REQ, kind: 'design' })

    // ── 可观察终态 1：接口层 ──
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.advanced).toBe(true)
    expect(res.payload.data.gate_failure).toBeUndefined()

    // ── 可观察终态 2：台账状态机 ──
    const req = store.peekAll()[0]
    expect(req.status).toBe('decomposing')
    expect((req.statusHistory ?? []).length).toBeGreaterThan(0)

    // ── 可观察终态 3：推进留痕（人能在看板/回执上看到的证据） ──
    expect((req.comments ?? []).some(c => String(c.body).includes('看板一键确认产物'))).toBe(true)
  })

  it('E2E 反向：错根 + 需求根 B 下确实缺文件 → 不推进、状态留在 design，且缺口显式报出（不静默）', async () => {
    writeDocsetIntoB({ withRequirement: false })
    await seed({ workspaceRoot: dirB })
    const handler = createReqboardHandler({ requirementStore: store,
      taskStore: taskStoreAt(dirA),
    // t2（REQ-261007135258-331a）：看板「确认即推进」改走单点 ⇒ 需完整用例依赖
    applicationDeps: { ...makeHarness().deps, store } as never,

      now: () => 1000,
      docs: new FileDocRepository({ workspaceRoot: dirA }),
      agents: () => ({ get: () => ({ id: W, session: {} }) }),
    })

    const res = await post(handler, '/dashboard/api/reqboard/req/artifact/confirm', { id: REQ, kind: 'design' })

    // ── 可观察终态 1：接口层如实报缺口（不静默降级） ──
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.advanced).toBe(false)
    expect(res.payload.data.gate_failure?.code).toBe('design_doc_incomplete')
    expect((res.payload.data.gate_failure?.gaps ?? []).join(' ')).toContain('requirement.md 不存在')

    // ── 可观察终态 2：状态**留在** design（没有被错误地推进） ──
    expect(store.peekAll()[0].status).toBe('design')
  })
})

describe('存量兼容（行为级）：需求未声明 workspaceRoot → 校正为 no-op，按会话根照常工作', () => {
  it('会话根恰好是文档所在根 → 正常确认并推进，且根保持不动', async () => {
    writeDocsetIntoB()
    await seed({}) // 刻意不声明 workspaceRoot（存量/默认形态）
    const uc = deps(dirB)

    const out = await runAsk(uc)

    expect(out.confirmed).toBe(true)
    expect(out.gate_failure).toBeUndefined()
    expect(out.advanced).toBe(true)
    // no-op 语义：没有需求级值就不动根——修复没有改变存量行为
    expect(uc.docs.workspaceRoot()).toBe(dirB)
    expect(store.peekAll()[0].status).toBe('decomposing')
  })
})
