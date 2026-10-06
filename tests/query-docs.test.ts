// serves: FR-2, FR-3, FR-11
/**
 * 文档面板**服务端聚合**的原型口径单测（REQ-261005105032-3b02 · t17）。
 *
 * 本文件只钉四件事（都是决议原文，不是排版偏好）：
 *   ① **原型进确定交付物**（决议 #30 / brief §9）：`prototypes/*.html` 与 `prototypes/INDEX.md`
 *      出现在 `documents` 且 `kind === 'prototype'`，**不再出现在任何 discovered 分组**；
 *      原型**截图**（`prototypes/*.png`）不是原型产物，继续留在「其它发现」按后缀分组。
 *   ② **恒等式**（决议 #34）：`documents` 中来自台账的行数 + Σ `discovered.count` ==
 *      `artifacts.length`——分类只许搬家、不许丢东西（搬运两侧同源同改才守得住）。
 *   ③ **权威 / 被取代投影**（决议 #32）：读 `prototypes/INDEX.md` 后给行注入
 *      `prototypeRole` / `supersededBy`；**没 INDEX / 读失败 / INDEX 没列它 → 两个键都不注入**
 *      （不伪造角色——猜错会把作废版标成权威）。
 *   ④ **台账 kind 不回填**：本次改动前登记为 `notes` 的原型行，服务端照实给 `notes`
 *      （展示侧按路径兜底归组，见 `tests/docs-panel.test.ts` ③）。
 *
 * 夹具口径与 `tests/query-report.test.ts` 同源：内存台账 + 真 `QueueTaskStore` + `FakeDocs`，
 * 只有文件与时钟是替身。
 *
 * @module dsh-pmboard/tests/query-docs
 */
import { describe, it, expect, vi } from 'vitest'
import { FakeDocs, makeHarness, type Harness } from './application/harness.js'
import { isDeliverableDocPath, prototypeRolesFromIndexText, queryDocs } from '../src/application/query/QueryDocs.js'
import type { PanelQueryDeps } from '../src/application/query/contracts.js'
import {
  isDegrade,
  type ActorRef,
  type PanelResult,
  type RequirementRecord,
  type StageArtifact,
  type StatusEvent,
} from '../src/shared/protocol.js'

const REQ_ID = 'REQ-3b02aa'
const DIR = 'docs/requirements/' + REQ_ID
const P_DIR = DIR + '/prototypes'
const HUMAN: ActorRef = { kind: 'human' }

/* --------------------------------------------------------------- 夹具 */

function event(status: RequirementRecord['status'], at: number): StatusEvent {
  return { status, at, by: HUMAN }
}

/** 最小需求（feature / brainstorming：分类模板要求设计文档，故会另出几条 unregistered 行）。 */
function makeReq(artifacts: StageArtifact[]): RequirementRecord {
  return {
    id: REQ_ID,
    title: '原型进流水线：文档面板投影',
    description: 'd',
    category: 'feature',
    status: 'brainstorming',
    blocked: false,
    sourceSessionId: 'session-w-001',
    comments: [],
    version: 1,
    createdAt: 1_000,
    updatedAt: 2_000,
    createdBy: HUMAN,
    updatedBy: HUMAN,
    statusHistory: [event('draft', 1_000), event('brainstorming', 2_000)],
    artifacts,
  }
}

/** 一条台账产物（stage/kind 都按真实形状给：自动扫描补登的走 notes/task_output）。 */
function artifact(
  kind: StageArtifact['kind'],
  path: string,
  registeredAt: number,
): StageArtifact {
  return { stage: kind === 'prototype' ? 'brainstorming' : 'implementing', kind, path, registeredAt, registeredBy: HUMAN }
}

/** 组装查询依赖（`queryDocs` 只用 store / tasks / docs 三个口）。 */
function makeDeps(h: Harness, docs: FakeDocs = h.docs): PanelQueryDeps {
  return {
    store: h.store,
    tasks: h.taskStore,
    injections: { readAll: async () => [] },
    sessions: h.session,
    docs,
  }
}

/** 非降级断言（降级信封当场失败，否则后面全是 undefined 噪声）。 */
function ok<T>(value: PanelResult<T>): T {
  if (isDegrade(value)) throw new Error('期望正常响应，实际降级：' + value.reason + ' / ' + value.note)
  return value
}

/** 跑一次查询：播种一条需求 + 文档端口（可换成"读 INDEX 会抛"的替身）。 */
async function docsOf(artifacts: StageArtifact[], docs?: FakeDocs) {
  const h = makeHarness({ requirements: [makeReq(artifacts)] })
  return ok(await queryDocs(makeDeps(h, docs ?? h.docs), { requirementId: REQ_ID }))
}

/** 读 `prototypes/INDEX.md` 时抛错的端口：存在但读不动（模拟磁盘/权限故障）。 */
class BoomIndexDocs extends FakeDocs {
  async read(relPath: string): Promise<string> {
    if (relPath.endsWith('/prototypes/INDEX.md')) throw new Error('模拟：INDEX.md 读取失败')
    return await super.read(relPath)
  }
}

/** 权威清单正文（列名逐字取自 data-model §2.1）。 */
const INDEX_MD = [
  '# 原型权威清单',
  '',
  '| 路径 | 状态 | 服务条款 | 被取代于 |',
  '|---|---|---|---|',
  '| prototypes/detail-v2.html | authoritative | FR-3, FR-4 | |',
  '| prototypes/detail.html | superseded | FR-3 | prototypes/detail-v2.html |',
  '',
].join('\n')

/** 三条原型产物的台账行（两版 + 权威清单自身）。 */
function protoArtifacts(): StageArtifact[] {
  return [
    artifact('prototype', P_DIR + '/detail-v2.html', 1_100),
    artifact('prototype', P_DIR + '/detail.html', 1_200),
    artifact('prototype', P_DIR + '/INDEX.md', 1_300),
  ]
}

/* --------------------------------------------------------------- ① 原型进交付物 */

describe('原型进确定交付物（决议 #30 / brief §9）', () => {
  it('prototypes/*.html 与 prototypes/INDEX.md 进 documents 且 kind=prototype，不再出现在 discovered', async () => {
    const artifacts: StageArtifact[] = [
      artifact('requirement', DIR + '/requirement.md', 1_000),
      ...protoArtifacts(),
      // 原型**截图**不是原型产物：继续留在「其它发现」按后缀分组
      artifact('notes', P_DIR + '/shot-1.png', 1_400),
      artifact('task_output', 'src/application/query/QueryDocs.ts', 1_500),
    ]
    const res = await docsOf(artifacts)

    const fromLedger = res.documents.filter(d => artifacts.some(a => a.path === d.path))
    const byPath = new Map(fromLedger.map(d => [d.path, d]))
    expect(byPath.get(P_DIR + '/detail-v2.html')?.kind).toBe('prototype')
    expect(byPath.get(P_DIR + '/detail.html')?.kind).toBe('prototype')
    expect(byPath.get(P_DIR + '/INDEX.md')?.kind).toBe('prototype')

    // 不再出现在任何 discovered 分组（样例与分组两侧都不许有它）
    const discovered = res.discovered ?? []
    for (const g of discovered) {
      for (const p of [P_DIR + '/detail-v2.html', P_DIR + '/detail.html', P_DIR + '/INDEX.md']) {
        expect(g.samples, g.kind).not.toContain(p)
      }
    }
    expect(discovered.filter(g => g.kind === 'html')).toEqual([])
    expect(discovered.filter(g => g.kind === 'md')).toEqual([])
    // 截图仍在「其它发现」里（原型单列 ≠ 把 prototypes/ 目录里所有东西都收编）
    expect(discovered.find(g => g.kind === 'png')?.count).toBe(1)
    expect(discovered.find(g => g.kind === 'ts')?.count).toBe(1)

    // 恒等式（决议 #34）：台账来源行数 + Σ discovered.count == artifacts.length
    expect(fromLedger.length + discovered.reduce((n, g) => n + g.count, 0)).toBe(artifacts.length)
    expect(artifacts.length).toBe(6)
  })

  it('白名单：权威路径 / 权威清单 / 旧路径都在，截图 / .bak / 需求目录外都不算交付物', () => {
    expect(isDeliverableDocPath(REQ_ID, P_DIR + '/detail.html')).toBe(true)
    expect(isDeliverableDocPath(REQ_ID, P_DIR + '/INDEX.md')).toBe(true)
    // 旧路径（REQ-292a 形态）兼容期：`NAME_TO_KIND` 认它是 prototype，白名单也必须认它，
    // 否则 kind 是原型、判据却不是交付物 → 又落回「其它发现」（"交了原型"仍等于没交）
    expect(isDeliverableDocPath(REQ_ID, DIR + '/prototype/detail-report.html')).toBe(true)
    expect(isDeliverableDocPath(REQ_ID, P_DIR + '/shot.png')).toBe(false)
    expect(isDeliverableDocPath(REQ_ID, P_DIR + '/detail.html.bak')).toBe(false)
    expect(isDeliverableDocPath(REQ_ID, P_DIR + '/INDEX.md.bak')).toBe(false)
    // 旧路径下的非 .html（README / 截图）仍不是交付物
    expect(isDeliverableDocPath(REQ_ID, DIR + '/prototype/README.md')).toBe(false)
    expect(isDeliverableDocPath(REQ_ID, DIR + '/prototype/shot-1.png')).toBe(false)
    // 需求目录外同名路径不是**这条需求**的交付物
    expect(isDeliverableDocPath(REQ_ID, 'other/REQ-x/prototypes/detail.html')).toBe(false)
    expect(isDeliverableDocPath(REQ_ID, 'other/REQ-x/prototype/detail.html')).toBe(false)
  })

  it('旧路径 prototype/*.html：进 documents 且不再出现在任何 discovered 分组（截图仍留 discovered）', async () => {
    const old = DIR + '/prototype/detail-report.html'
    const artifacts: StageArtifact[] = [
      artifact('prototype', old, 1_000),
      artifact('prototype', P_DIR + '/detail.html', 1_100), // 权威路径，做对照
      artifact('notes', DIR + '/prototype/shot-1.png', 1_200), // 旧路径下的截图不是原型产物
    ]
    const res = await docsOf(artifacts)
    const fromLedger = res.documents.filter(d => artifacts.some(a => a.path === d.path))
    const byPath = new Map(fromLedger.map(d => [d.path, d]))
    expect(byPath.get(old)?.kind).toBe('prototype')
    expect(byPath.get(P_DIR + '/detail.html')?.kind).toBe('prototype')

    const discovered = res.discovered ?? []
    for (const g of discovered) {
      for (const p of [old, P_DIR + '/detail.html']) expect(g.samples, g.kind).not.toContain(p)
    }
    expect(discovered.filter(g => g.kind === 'html')).toEqual([]) // 旧路径的 html 也不在"其它发现"里
    expect(discovered.find(g => g.kind === 'png')?.count).toBe(1)
    expect(byPath.has(DIR + '/prototype/shot-1.png')).toBe(false)

    // 恒等式照旧（决议 #34）：搬运两侧同源同改，和不变
    expect(fromLedger.length + discovered.reduce((n, g) => n + g.count, 0)).toBe(artifacts.length)
  })
})

/* --------------------------------------------------------------- ② INDEX → 角色投影 */

describe('INDEX → 面板角色投影（决议 #32）', () => {
  it('一条 authoritative + 一条 superseded：两行分别带 prototypeRole 与 supersededBy', async () => {
    const h = makeHarness({ requirements: [makeReq(protoArtifacts())] })
    h.docs.put(P_DIR + '/INDEX.md', INDEX_MD)
    const res = ok(await queryDocs(makeDeps(h), { requirementId: REQ_ID }))
    const byPath = new Map(res.documents.map(d => [d.path, d]))

    const v2 = byPath.get(P_DIR + '/detail-v2.html')
    expect(v2?.prototypeRole).toBe('authoritative')
    expect(v2?.supersededBy).toBeUndefined() // 权威行不给「被取代于」
    const v1 = byPath.get(P_DIR + '/detail.html')
    expect(v1?.prototypeRole).toBe('superseded')
    expect(v1?.supersededBy).toBe('prototypes/detail-v2.html')

    // INDEX 没列到的路径 → 两个键**都不注入**（旧形状不变：`in` 判据，不是"值为 undefined"）
    const idx = byPath.get(P_DIR + '/INDEX.md')
    expect(idx).toBeDefined()
    expect(idx !== undefined && 'prototypeRole' in idx).toBe(false)
    expect(idx !== undefined && 'supersededBy' in idx).toBe(false)
  })

  it('没有 INDEX（文件不在）→ 两个键都不注入（不伪造角色）', async () => {
    const h = makeHarness({ requirements: [makeReq(protoArtifacts())] })
    const res = ok(await queryDocs(makeDeps(h), { requirementId: REQ_ID }))
    for (const p of [P_DIR + '/detail.html', P_DIR + '/detail-v2.html']) {
      const row = res.documents.find(d => d.path === p)
      expect(row, p).toBeDefined()
      expect(row !== undefined && 'prototypeRole' in row, p).toBe(false)
      expect(row !== undefined && 'supersededBy' in row, p).toBe(false)
    }
  })

  it('INDEX 存在但读失败 → 两个键都不注入，且留一条 warn（读不动 ≠ 没有权威清单）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* 断言用，不打印 */ })
    try {
      const h = makeHarness({ requirements: [makeReq(protoArtifacts())] })
      h.docs.put(P_DIR + '/INDEX.md', INDEX_MD) // 文件在盘上
      const boom = new BoomIndexDocs(() => 0)
      boom.files = h.docs.files // 同一份文件表：exists 为真，read 抛错
      const res = ok(await queryDocs(makeDeps(h, boom), { requirementId: REQ_ID }))
      for (const p of [P_DIR + '/detail.html', P_DIR + '/detail-v2.html']) {
        const row = res.documents.find(d => d.path === p)
        expect(row !== undefined && 'prototypeRole' in row, p).toBe(false)
        expect(row !== undefined && 'supersededBy' in row, p).toBe(false)
      }
      // 读失败要留痕（不当成"没有权威清单"静默吞掉）
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('INDEX 解析：两种路径写法都认；状态认不出 / 伪路径 / 越界一律跳过（不猜角色）', () => {
    const text = [
      '| 路径 | 状态 | 服务条款 | 被取代于 |',
      '|---|---|---|---|',
      '| docs/requirements/' + REQ_ID + '/prototypes/a.html | authoritative | FR-1 | |',
      '| prototypes/b.html | superseded | FR-1 | prototypes/a.html |',
      '| prototypes/c.html | draft | | |',
      '| ../escape.html | authoritative | | |',
      '| prototypes/{a,b}.html | authoritative | | |',
      '| prototypes/d.html | superseded | | |',
      '',
    ].join('\n')
    const roles = prototypeRolesFromIndexText(text, REQ_ID)
    // 决议 #2 是需求目录相对；台账口径（工作区相对）指的是同一个文件，也得认
    expect(roles.get(P_DIR + '/a.html')?.role).toBe('authoritative')
    expect(roles.get(P_DIR + '/b.html')?.supersededBy).toBe('prototypes/a.html')
    // 认不出的状态 / 伪路径 / 越界路径 → 当"没列"（不猜）
    expect(roles.has(P_DIR + '/c.html')).toBe(false)
    expect(roles.has(P_DIR + '/{a,b}.html')).toBe(false)
    expect([...roles.keys()].some(k => k.includes('escape'))).toBe(false)
    // 违反 I2（superseded 行没写「被取代于」）→ 角色照给，但**不注入** supersededBy（不给空串）
    expect(roles.get(P_DIR + '/d.html')?.role).toBe('superseded')
    expect(roles.get(P_DIR + '/d.html')?.supersededBy).toBeUndefined()
  })

  it('INDEX 里没有「路径」列的表整张跳过（不是随便找张表就当权威清单）', () => {
    const text = [
      '| 项 | 值 |',
      '|---|---|',
      '| prototypes/a.html | authoritative |',
      '',
    ].join('\n')
    expect(prototypeRolesFromIndexText(text, REQ_ID).size).toBe(0)
  })
})

/* --------------------------------------------------------------- ③ 旧登记不回填 */

describe('本次改动前登记为 notes 的原型行（台账 kind 不回填）', () => {
  it('路径在白名单内 → 仍进 documents，但 kind 照实是 notes（展示侧按路径兜底归组）', async () => {
    const artifacts: StageArtifact[] = [
      artifact('notes', P_DIR + '/INDEX.md', 1_000),
      artifact('notes', P_DIR + '/detail.html', 1_100),
    ]
    const res = await docsOf(artifacts)
    const byPath = new Map(res.documents.map(d => [d.path, d]))
    // 服务端不替台账改写 kind：兜底归组是**展示侧**的事（docs.ts 的 prototypeGroupOf）
    expect(byPath.get(P_DIR + '/INDEX.md')?.kind).toBe('notes')
    expect(byPath.get(P_DIR + '/detail.html')?.kind).toBe('notes')
    // 但它们在确定文档里（不在「其它发现」里），展示侧才有"可兜底的行"
    const discovered = res.discovered ?? []
    expect(discovered.flatMap(g => g.samples)).not.toContain(P_DIR + '/detail.html')
    expect(res.documents.filter(d => artifacts.some(a => a.path === d.path))).toHaveLength(2)
  })

  it('旧路径的 notes 旧登记行：白名单按路径认它 → 也在 documents（prototype/ 兜底分支因此可达）', async () => {
    const old = DIR + '/prototype/detail-report.html'
    const res = await docsOf([artifact('notes', old, 1_000)])
    const row = res.documents.find(d => d.path === old)
    expect(row?.kind).toBe('notes') // 台账 kind 不回填（兜底归组是展示侧的事）
    expect((res.discovered ?? []).flatMap(g => g.samples)).not.toContain(old)
  })
})

/* --------------------------------------------------------------- ④ 原型判据（锚点）投影 */

describe('原型判据（锚点）→ 面板投影（frontend.md「呈现项」第 3 行）', () => {
  it('只投影锚点条数与定位串，缺省不注入；几何量 / 阈值一律不上载荷', async () => {
    const withMeta: StageArtifact = {
      ...artifact('prototype', P_DIR + '/detail.html', 1_000),
      prototypeMeta: {
        anchors: [{ fr: 'FR-3', selector: '#FR-3' }, { fr: 'FR-4', selector: '#FR-4' }],
        geometry: [{ name: 'tabsTop', value: 576, unit: 'px', at: { width: 1280, state: 'inflight' } }],
      },
    }
    const withoutMeta = artifact('prototype', P_DIR + '/detail-v2.html', 1_100)
    const res = await docsOf([withMeta, withoutMeta])
    const byPath = new Map(res.documents.map(d => [d.path, d]))

    const withAnchors = byPath.get(P_DIR + '/detail.html')
    expect(withAnchors?.prototypeMeta?.anchors).toEqual([
      { fr: 'FR-3', selector: '#FR-3' },
      { fr: 'FR-4', selector: '#FR-4' },
    ])
    // 阈值红线：几何量的值（含实测数字）不许进面板载荷——阈值由设计阶段定，原型不自证
    expect(JSON.stringify(withAnchors)).not.toContain('tabsTop')
    expect(JSON.stringify(withAnchors)).not.toContain('geometry')
    expect(JSON.stringify(withAnchors)).not.toContain('576')

    // 未采集 prototypeMeta → 该键**不注入**（"未采集"与"采集到 0 条"必须能分辨）
    const none = byPath.get(P_DIR + '/detail-v2.html')
    expect(none !== undefined && 'prototypeMeta' in none).toBe(false)
  })

  it('采集到但零条锚点 → prototypeMeta.anchors 为空数组（真实的"缺"，不是"没采集"）', async () => {
    const empty: StageArtifact = {
      ...artifact('prototype', P_DIR + '/detail.html', 1_000),
      prototypeMeta: { anchors: [], geometry: [] },
    }
    const res = await docsOf([empty])
    const row = res.documents.find(d => d.path === P_DIR + '/detail.html')
    expect(row?.prototypeMeta?.anchors).toEqual([])
  })

  it('脏数据（anchors 不是数组 / 元素是 null）不把聚合打崩，照实降级', async () => {
    const dirty = {
      ...artifact('prototype', P_DIR + '/detail.html', 1_000),
      prototypeMeta: { anchors: null, geometry: [] },
    } as unknown as StageArtifact
    const res = await docsOf([dirty])
    const row = res.documents.find(d => d.path === P_DIR + '/detail.html')
    expect(row !== undefined && 'prototypeMeta' in row).toBe(false)

    const mixed = {
      ...artifact('prototype', P_DIR + '/detail-v2.html', 1_100),
      prototypeMeta: { anchors: [null, { fr: 'FR-1', selector: '#FR-1' }], geometry: [] },
    } as unknown as StageArtifact
    const res2 = await docsOf([mixed])
    const row2 = res2.documents.find(d => d.path === P_DIR + '/detail-v2.html')
    expect(row2?.prototypeMeta?.anchors).toEqual([{ fr: 'FR-1', selector: '#FR-1' }])
  })
})
