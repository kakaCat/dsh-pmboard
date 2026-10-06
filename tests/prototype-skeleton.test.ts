/**
 * 原型骨架落盘单测（REQ-261005105032-3b02 t11 · FR-2 / FR-4）。
 *
 * 三组断言：
 * ① **模板本身**——旧路径不留、新路径在；正文与落盘常量逐字节一致；恰好一块 geometry 注释位
 *    （用**生产解析器** `parsePrototypeMetadata` 判，不自己写正则）；INDEX 四列与 authoritative
 *    恰好一条的写法在场；占位符全在 R1 渲染映射表里登记。
 * ② **幂等与边界**——已存在一个字节都不写（先手改一行再跑仍不被覆盖）；非 UI 需求不落盘；
 *    声明了 `prototype_exempt` 不落盘；端口写失败只告警、**不抛**（不阻断阶段转移）。
 * ③ **两处接线**——`reqboard_create`（立项即落）与 `reqboard_move(to=brainstorming)` 在真实
 *    临时工作区上确实落了盘，且第二条路径不会覆盖 agent 已填的内容。
 * ④ **存在门只认显式登记**（FR-1「登记才算数」）——只有骨架被自动发现補登时存在门必须**拒**
 *    （否则看板每请求一次的目录扫描会让门自己绿掉：实测骨架不填即三门 PASS），显式登记后放行。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  CATEGORY_DEFAULT_SIDES, DEFAULT_PROTOTYPE_NAME, PROTOTYPE_DIR, PROTOTYPE_INDEX_NAME,
  PROTOTYPE_TEMPLATE_REL, landPrototypeSkeleton, type PrototypeSkeletonPort,
} from '../src/application/internal/prototype-skeleton.js'
import { PROTOTYPE_HTML_SKELETON } from '../src/application/internal/prototype-skeleton-template.js'
import { checkPrototypePresenceGate, parsePrototypeMetadata } from '../src/application/internal/prototype-gates.js'
import { syncReqArtifacts } from '../src/adapters/ArtifactSync.js'
import { submitPrototypeArtifacts } from '../src/application/use-cases/SubmitArtifact.js'
import { captureRequirement } from '../src/application/use-cases/CaptureRequirement.js'
import { createReqboardHandler } from '../src/http/routes.js'
import { taskStoreAt } from './queue/route-deps.js'
import { parseDocument } from '../src/application/internal/doc-parse.js'
import { designDocPolicyFrom } from '../src/application/internal/category-doc-sets.js'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { makeHarness } from './application/harness.js'
import { executeCreateRequirement } from '../src/application/use-cases/CreateRequirement.js'
import { executeMoveRequirement } from '../src/application/use-cases/MoveRequirement.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const REPO = resolve(__dirname, '..')
const TEMPLATE = join(REPO, PROTOTYPE_TEMPLATE_REL)
const OLD_TEMPLATE = join(REPO, 'templates/design/prototype.html')
const REQ_ID = 'REQ-000001'

/** 内存落盘端口（窄面三方法）；`deny` 命中即模拟写失败。 */
class MemPort implements PrototypeSkeletonPort {
  readonly files = new Map<string, string>()
  deny: string | undefined
  exists(relPath: string): boolean { return this.files.has(relPath) }
  async read(relPath: string): Promise<string> { return this.files.get(relPath) ?? '' }
  async write(relPath: string, content: string): Promise<void> {
    if (this.deny === relPath) throw new Error('EACCES: 模拟写失败')
    this.files.set(relPath, content)
  }
}

/** 最小需求记录（本模块只读 id / title / category 三个字段；其余字段与本卡无关）。 */
function rec(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return { id: REQ_ID, title: '原型骨架', category: 'feature', status: 'draft', ...over } as unknown as RequirementRecord
}

const tmpRoots: string[] = []
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-proto-skeleton-'))
  tmpRoots.push(root)
  return root
}
afterEach(() => {
  while (tmpRoots.length > 0) rmSync(tmpRoots.pop()!, { recursive: true, force: true })
})

const exec = (id: string, cwd: string): unknown => ({ agent: { id, session: { header: { cwd } } } })

/** 看板路由最小假请求/响应（与 tests/artifact-gates.test.ts 同款）。 */
interface BoardReq { url: string; method: string; [Symbol.asyncIterator]: () => AsyncGenerator<Buffer> }
interface BoardRes extends EventEmitter { statusCode: number; payload?: unknown; writeHead(code: number): BoardRes; end(text?: string): BoardRes }
function boardReq(body: unknown, url: string): BoardReq {
  const req = new EventEmitter() as unknown as BoardReq
  req.url = url
  req.method = 'POST'
  req[Symbol.asyncIterator] = async function* () { yield Buffer.from(JSON.stringify(body), 'utf8') }
  return req
}
function boardRes(): BoardRes {
  const res = new EventEmitter() as unknown as BoardRes
  res.statusCode = 0
  res.writeHead = (code: number) => { res.statusCode = code; return res }
  res.end = (text?: string) => { res.payload = text === undefined ? undefined : JSON.parse(text); return res }
  return res
}

describe('① 模板迁移与骨架正文', () => {
  it('旧路径不留、新路径在（git mv 的落点断言）', () => {
    expect(existsSync(OLD_TEMPLATE), 'templates/design/prototype.html 必须已迁走').toBe(false)
    expect(existsSync(TEMPLATE), 'templates/brainstorming/prototype.html 必须存在').toBe(true)
  })

  it('模板正文与落盘常量**逐字节一致**（否则人读的模板与落盘的骨架会各说各话）', () => {
    const tpl = readFileSync(TEMPLATE, 'utf8')
    expect(PROTOTYPE_HTML_SKELETON).toBe(tpl)
    expect(tpl).toContain('templates/brainstorming/prototype.html')
    expect(tpl).not.toContain('templates/design/prototype.html')
  })

  it('恰好一块 proto-geometry 注释位、无阈值字段、FR-1 锚点在（用生产解析器判）', () => {
    const meta = parsePrototypeMetadata(readFileSync(TEMPLATE, 'utf8'))
    expect(meta.blocks).toBe(1)
    expect(meta.violations).toEqual([])
    expect(meta.parseError).toBeUndefined()
    expect(meta.geometry.map(o => o.name)).toEqual(['tabsTop'])
    expect(meta.anchors.map(a => a.fr)).toEqual(['FR-1'])
  })

  it('INDEX 四列骨架 + 权威恰好一条 + 「每 FR 一个区块且覆盖全部 FR」的写法在场', () => {
    const tpl = readFileSync(TEMPLATE, 'utf8')
    for (const col of ['路径', '状态', '服务条款', '被取代于']) expect(tpl).toContain(col)
    expect(tpl).toContain('authoritative')
    expect(tpl).toContain('superseded')
    expect(tpl).toContain('恰好一条')
    expect(tpl).toContain('每个功能点（FR）一个')
    expect(tpl).toContain('覆盖 INDEX「服务条款」列声明的**全部** FR')
  })

  it('模板里的占位符全在 R1 渲染映射表里登记（新占位符没人管 = R1 exit 1 点名）', () => {
    const tpl = readFileSync(TEMPLATE, 'utf8')
    const used = [...new Set([...tpl.matchAll(/\{\{([A-Z_]+)\}\}/g)].map(m => m[1]!))]
    expect(used.sort()).toEqual(['DATE', 'REQ_ID', 'TITLE'])
    const map = JSON.parse(readFileSync(join(REPO, 'scripts/template-render-map.json'), 'utf8')) as { placeholders: Record<string, string> }
    for (const key of used) expect(map.placeholders[key], key + ' 未登记进 template-render-map.json').toBeTruthy()
  })

  it('缺省 sides 与 feature 文档模板的 front-matter 逐字一致（不许有两份真相）', () => {
    const fm = parseDocument(readFileSync(join(REPO, 'templates/brainstorming/feature.md'), 'utf8')).frontmatter
    expect([...designDocPolicyFrom(fm).sides].sort()).toEqual([...CATEGORY_DEFAULT_SIDES['feature']!].sort())
  })
})

describe('② 幂等落盘与边界', () => {
  it('UI 需求：落 HTML + INDEX；含几何量注释位与 INDEX 骨架，且无占位符残留', async () => {
    const ports = new MemPort()
    const r = await landPrototypeSkeleton(ports, rec(), { nowMs: 1_000_000, sides: ['frontend', 'backend'] })
    expect(r).toEqual({
      landed: true,
      files: ['docs/requirements/' + REQ_ID + '/prototypes/detail.html', 'docs/requirements/' + REQ_ID + '/prototypes/INDEX.md'],
      reason: 'landed',
    })
    const html = ports.files.get('docs/requirements/' + REQ_ID + '/prototypes/detail.html')!
    const index = ports.files.get('docs/requirements/' + REQ_ID + '/prototypes/INDEX.md')!
    expect(html).not.toContain('{{')
    expect(html).toContain('原型骨架')
    expect(html).toContain('1970-01-01') // {{DATE}} 由 nowMs 渲染（时间源单点在 deps.clock）
    expect(parsePrototypeMetadata(html).blocks).toBe(1)
    expect(parsePrototypeMetadata(html).violations).toEqual([])
    expect(index).toContain('| 路径 | 状态 | 服务条款 | 被取代于 |')
    expect(index).toContain('| prototypes/' + DEFAULT_PROTOTYPE_NAME + ' | authoritative | FR-1 | |')
    // INDEX 里只许有一条 authoritative（I1：0 条 / 多条都拒）
    expect(index.split('\n').filter(l => l.includes('authoritative'))).toHaveLength(1)
  })

  it('幂等：再跑一次内容逐字节不变；**先手改一行**再跑也不被覆盖', async () => {
    const ports = new MemPort()
    const htmlPath = 'docs/requirements/' + REQ_ID + '/prototypes/detail.html'
    const indexPath = 'docs/requirements/' + REQ_ID + '/prototypes/INDEX.md'
    await landPrototypeSkeleton(ports, rec(), { nowMs: 1_000_000, sides: ['frontend'] })
    const before = ports.files.get(htmlPath)!
    const second = await landPrototypeSkeleton(ports, rec(), { nowMs: 2_000_000, sides: ['frontend'] })
    expect(second.landed).toBe(false)
    expect(second.files).toEqual([])
    expect(second.reason).toBe('already-exists')
    expect(ports.files.get(htmlPath)).toBe(before)
    // 手改（agent 已开始填原型）后再进入一次：一个字节都不许动
    ports.files.set(htmlPath, before + '\n<!-- 手改一行：这段是 agent 填的内容 -->')
    ports.files.set(indexPath, '# 手改的清单\n')
    await landPrototypeSkeleton(ports, rec(), { nowMs: 3_000_000, sides: ['frontend'] })
    expect(ports.files.get(htmlPath)).toBe(before + '\n<!-- 手改一行：这段是 agent 填的内容 -->')
    expect(ports.files.get(indexPath)).toBe('# 手改的清单\n')
  })

  it('非 UI 需求（sides 不含 frontend）不落盘', async () => {
    const ports = new MemPort()
    const r = await landPrototypeSkeleton(ports, rec(), { nowMs: 1_000_000, sides: ['backend'] })
    expect(r).toEqual({ landed: false, files: [], reason: 'not-ui' })
    expect(ports.files.size).toBe(0)
  })

  it('非 UI 需求（refactor 未声明 sides → 判不了）不落盘', async () => {
    const ports = new MemPort()
    ports.files.set('docs/requirements/' + REQ_ID + '/requirement.md', '---\ncategory: refactor\n---\n')
    const r = await landPrototypeSkeleton(ports, rec({ category: 'refactor' }), { nowMs: 1_000_000 })
    expect(r.reason).toBe('not-ui')
    expect(ports.files.size).toBe(1) // 只多了我们塞进去的 requirement.md
  })

  it('requirement.md 不在时按类型模板的缺省 sides 判：feature 落、bug 不落', async () => {
    const a = new MemPort()
    expect((await landPrototypeSkeleton(a, rec(), { nowMs: 1_000_000 })).reason).toBe('landed')
    const b = new MemPort()
    expect((await landPrototypeSkeleton(b, rec({ category: 'bug' }), { nowMs: 1_000_000 })).reason).toBe('not-ui')
    expect(b.files.size).toBe(0)
  })

  it('已声明 prototype_exempt（理由非空）→ 不硬塞骨架', async () => {
    const ports = new MemPort()
    ports.files.set('docs/requirements/' + REQ_ID + '/requirement.md', '---\nsides: [frontend]\nprototype_exempt: 纯后端改动，界面复用既有页面\n---\n')
    const r = await landPrototypeSkeleton(ports, rec(), { nowMs: 1_000_000 })
    expect(r.reason).toBe('exempt')
    expect(ports.files.size).toBe(1)
  })

  it('落盘失败只告警、**不抛**（不阻断阶段转移）', async () => {
    const ports = new MemPort()
    ports.deny = 'docs/requirements/' + REQ_ID + '/prototypes/detail.html'
    const warnings: string[] = []
    const r = await landPrototypeSkeleton(ports, rec(), { nowMs: 1_000_000, sides: ['frontend'], warn: m => warnings.push(m) })
    expect(r).toEqual({ landed: false, files: [], reason: 'error' })
    expect(warnings.join(' ')).toContain('原型骨架落盘失败')
    expect(ports.files.size).toBe(0)
  })
})

describe('③ 两处接线（真实临时工作区）', () => {
  it('立项即落：reqboard_create 后 prototypes/<name>.html 与 INDEX.md 都在盘上', async () => {
    const root = tempRoot()
    const h = makeHarness()
    const deps = { ...h.deps, docs: new FileDocRepository({ workspaceRoot: root }) }
    const res = await executeCreateRequirement(
      deps as never,
      { title: 'UI 需求', category: 'feature', summary: '摘要', reason: '理由', workspace_root: root },
      exec('session-a', root),
    ) as Record<string, unknown>
    const id = String(res.requirement_id)
    const html = join(root, 'docs/requirements', id, PROTOTYPE_DIR, DEFAULT_PROTOTYPE_NAME)
    const index = join(root, 'docs/requirements', id, PROTOTYPE_DIR, PROTOTYPE_INDEX_NAME)
    expect(existsSync(html)).toBe(true)
    expect(existsSync(index)).toBe(true)
    expect(parsePrototypeMetadata(readFileSync(html, 'utf8')).blocks).toBe(1)
    expect(readFileSync(index, 'utf8')).toContain('| 路径 | 状态 | 服务条款 | 被取代于 |')
  })

  it('进入需求阶段时落盘，且**不覆盖** agent 已填内容（立项 → 手改 → move）', async () => {
    const root = tempRoot()
    const h = makeHarness()
    const deps = { ...h.deps, docs: new FileDocRepository({ workspaceRoot: root }) }
    const res = await executeCreateRequirement(
      deps as never,
      { title: 'UI 需求', category: 'feature', summary: '摘要', reason: '理由', workspace_root: root },
      exec('session-a', root),
    ) as Record<string, unknown>
    const id = String(res.requirement_id)
    const html = join(root, 'docs/requirements', id, PROTOTYPE_DIR, DEFAULT_PROTOTYPE_NAME)
    writeFileSync(html, readFileSync(html, 'utf8') + '\n<!-- agent 已填的第 2 个 FR 区块 -->\n')
    // 需求文档声明含 frontend（move 路径的判据来源）
    mkdirSync(join(root, 'docs/requirements', id), { recursive: true })
    writeFileSync(join(root, 'docs/requirements', id, 'requirement.md'), '---\nsides: [frontend, backend]\ncategory: feature\n---\n\n# 需求说明\n')
    await executeMoveRequirement(deps as never, { requirement_id: id, to: 'brainstorming' }, exec('session-a', root))
    expect((await h.store.get(id))?.status).toBe('brainstorming')
    expect(readFileSync(html, 'utf8')).toContain('agent 已填的第 2 个 FR 区块')
  })

  it('非 UI 需求进入需求阶段**不落盘**（sides 不含 frontend）', async () => {
    const root = tempRoot()
    const h = makeHarness()
    const deps = { ...h.deps, docs: new FileDocRepository({ workspaceRoot: root }) }
    const res = await executeCreateRequirement(
      deps as never,
      { title: '纯后端需求', category: 'feature', summary: '摘要', reason: '理由', workspace_root: root },
      exec('session-a', root),
    ) as Record<string, unknown>
    const id = String(res.requirement_id)
    const dir = join(root, 'docs/requirements', id, PROTOTYPE_DIR)
    rmSync(dir, { recursive: true, force: true }) // 清掉立项那份，再看 move 会不会重新落
    writeFileSync(join(root, 'docs/requirements', id, 'requirement.md'), '---\nsides: [backend]\ncategory: feature\n---\n\n# 需求说明\n')
    await executeMoveRequirement(deps as never, { requirement_id: id, to: 'brainstorming' }, exec('session-a', root))
    expect(existsSync(dir)).toBe(false)
  })
})

describe('④ 存在门只认**显式登记**（FR-1「登记才算数」）', () => {
  /** 只读 docs 桩：给门读 requirement.md（front-matter 是 UI 判定的来源）。 */
  const docsOf = (reqId: string, sides: string) => ({
    exists: (p: string): boolean => p === 'docs/requirements/' + reqId + '/requirement.md',
    read: async (): Promise<string> => '---\nsides: [' + sides + ']\ncategory: feature\n---\n\n# 需求说明\n',
    list: () => [],
  })

  it('只有自动发现補登（autoDiscovered:true）→ 拒 prototype_missing，且点名「有文件但未登记」', async () => {
    const req = rec({
      artifacts: [
        { stage: 'brainstorming', kind: 'prototype', path: 'docs/requirements/' + REQ_ID + '/prototypes/detail.html', autoDiscovered: true, registeredAt: 1 },
        { stage: 'brainstorming', kind: 'prototype', path: 'docs/requirements/' + REQ_ID + '/prototypes/INDEX.md', autoDiscovered: true, registeredAt: 1 },
      ],
    } as never)
    const fail = await checkPrototypePresenceGate(docsOf(REQ_ID, 'frontend') as never, req)
    expect(fail?.code).toBe('prototype_missing')
    expect((fail?.gaps ?? []).join(' ')).toContain('未登记')
    expect((fail?.gaps ?? []).join(' ')).toContain('prototypes/detail.html')
    expect((fail?.gaps ?? []).join(' ')).toContain('reqboard_submit(kind=prototype)')
  })

  it('显式登记条目（无 autoDiscovered 标记）→ 放行', async () => {
    const req = rec({
      artifacts: [
        { stage: 'brainstorming', kind: 'prototype', path: 'docs/requirements/' + REQ_ID + '/prototypes/detail.html', registeredAt: 2, registeredBy: { kind: 'agent' } },
      ],
    } as never)
    expect(await checkPrototypePresenceGate(docsOf(REQ_ID, 'frontend') as never, req)).toBeUndefined()
  })

  it('端到端：骨架被自动补登 → 门拒；调 submit 后**升级为显式**并放行（不留死结）', async () => {
    const root = tempRoot()
    const h = makeHarness()
    const docs = new FileDocRepository({ workspaceRoot: root })
    const deps = { ...h.deps, docs }
    const res = await executeCreateRequirement(
      deps as never,
      { title: 'UI 需求', category: 'feature', summary: '摘要', reason: '理由', workspace_root: root },
      exec('session-a', root),
    ) as Record<string, unknown>
    const id = String(res.requirement_id)
    writeFileSync(join(root, 'docs/requirements', id, 'requirement.md'),
      '---\nsides: [frontend]\ncategory: feature\n---\n\n# 需求说明\n\n- **FR-1: 一句话写清这条做什么**\n')
    await executeMoveRequirement(deps as never, { requirement_id: id, to: 'brainstorming' }, exec('session-a', root))

    // ① 看板 stages 路由每请求都会跑的那次扫描：骨架被自动補登成 kind=prototype
    expect(await syncReqArtifacts(h.store, id, root)).toBeGreaterThan(0)
    const discovered = await h.store.get(id)
    expect((discovered?.artifacts ?? []).filter(a => a.kind === 'prototype').every(a => a.autoDiscovered === true)).toBe(true)
    const blocked = await checkPrototypePresenceGate(docs as never, discovered!)
    expect(blocked?.code, '自动补登不算已交：存在门必须拒').toBe('prototype_missing')
    expect((blocked?.gaps ?? []).join(' ')).toContain('未登记')

    // ② agent 按门的 how 文案登记 → 自动发现条目被**升级**（清标记 + 写 prototypeMeta），门放行
    const out = await submitPrototypeArtifacts(deps as never, { requirement_id: id }, exec('session-a', root)) as Record<string, unknown>
    expect(out['registered_count']).toBe(1)
    const after = await h.store.get(id)
    const html = (after?.artifacts ?? []).find(a => a.path.endsWith('/prototypes/' + DEFAULT_PROTOTYPE_NAME))
    expect(html?.autoDiscovered, '升级后不得再带自动发现标记').toBeUndefined()
    expect(html?.prototypeMeta?.anchors.map(a => a.fr)).toEqual(['FR-1'])
    expect(await checkPrototypePresenceGate(docs as never, after!)).toBeUndefined()
  })
})

describe('⑤ 另外两条进需求阶段的**真实入口**也落盘（弹框立项 / 看板移动）', () => {
  it('弹框立项（reqboard_capture 的 draft→brainstorming 原子推进）后骨架在盘上', async () => {
    const root = tempRoot()
    const h = makeHarness()
    const deps = { ...h.deps, docs: new FileDocRepository({ workspaceRoot: root }) }
    // 五问作答（id 口径见 capture-mapping 的 CAPTURE_QUESTION_IDS）
    h.questions.answers = [
      { id: 'name', selected: [], custom: '看板 UI 需求' },
      { id: 'category', selected: ['feature'], custom: '' },
      { id: 'difficulty', selected: ['standard'], custom: '' },
      { id: 'doc_location', selected: ['docs/requirements/<REQ>/'], custom: '' },
      { id: 'workspace', selected: [], custom: root },
    ]
    const out = await captureRequirement(deps as never, {}, exec('session-a', root) as never) as Record<string, unknown>
    const id = String(out['requirement_id'])
    expect(out['status']).toBe('brainstorming')
    expect(existsSync(join(root, 'docs/requirements', id, PROTOTYPE_DIR, DEFAULT_PROTOTYPE_NAME))).toBe(true)
    expect(existsSync(join(root, 'docs/requirements', id, PROTOTYPE_DIR, PROTOTYPE_INDEX_NAME))).toBe(true)
  })

  it('看板移动 /req/move to=brainstorming 后骨架在盘上', async () => {
    const root = tempRoot()
    const prevCwd = process.cwd()
    try {
      process.chdir(root) // 看板路由按 cwd 口径建 taskStore（与 artifact-gates 用例同款）
      const id = 'REQ-board1'
      const h = makeHarness({ requirements: [{ id, title: '看板 UI 需求', category: 'feature', status: 'draft', sourceSessionId: 'session-a' } as never] })
      const docs = new FileDocRepository({ workspaceRoot: root })
      mkdirSync(join(root, 'docs/requirements', id), { recursive: true })
      writeFileSync(join(root, 'docs/requirements', id, 'requirement.md'), '---\nsides: [frontend]\ncategory: feature\n---\n\n# 需求说明\n')
      const handler = createReqboardHandler({ requirementStore: h.store, taskStore: taskStoreAt(root), now: () => Date.now(), docs })
      const res = boardRes()
      await handler(boardReq({ id, to: 'brainstorming', actor: 'human' }, '/dashboard/api/reqboard/req/move') as never, res as never)
      expect(res.statusCode).toBe(200)
      expect((await h.store.get(id))?.status).toBe('brainstorming')
      expect(existsSync(join(root, 'docs/requirements', id, PROTOTYPE_DIR, DEFAULT_PROTOTYPE_NAME))).toBe(true)
    } finally {
      process.chdir(prevCwd)
    }
  })
})
