/**
 * RTM 新两节 + 新字段的回归用例（REQ-261005105032-3b02 t7 / FR-5 / FR-9 / FR-11）。
 *
 * 标本 = 一个临时工作区里的 UI 需求：两份原型（一份权威、一份 superseded）+ INDEX 权威清单
 * + requirement.md 的 D-x 表 + 一份引了锚点与 D-x 的设计文档。跑**真生成器**（RTMGenerator）
 * 后读回盘上的 YAML——不 mock 生成器、不读仓库里的真实需求文件（避免用例随本仓库状态漂移）。
 *
 * 覆盖的验收锚点（逐条对应 t7 卡面）：
 *   ① rtm-brainstorming.yml `outputs.prototypes` 非空且每条带 `authoritative` 与 `anchors`；
 *   ② `outputs.decisions` 非空（D-x 五要素）；
 *   ③ `metadata.rtm_version === '2.0'` 而 `metadata.version` 仍是**写入计数**；
 *   ④ rtm-decomposing.yml `task_coverage` 每项含 `covers_prototypes` / `covers_decisions`；
 *   ⑤ 设计章节文本里的 `prototypes/x.html#FR-4` 经 strip 后**不进 serves**，而进 `protoRefs`。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { RTMGenerator } from '../vendor/reqboard/src/rtm/generator.js'
import type { LedgerArtifactLike, LedgerReader } from '../vendor/reqboard/src/rtm/context.js'
import type { RTMDecomposing, RTMDesign, RTMBrainstorming, RTMTaskLike } from '../vendor/reqboard/src/rtm/types.js'
import {
  decisionsOf,
  parsePrototypeIndexRows,
  prototypeMetaFromHtml,
} from '../vendor/reqboard/src/rtm/brainstorming-generator.js'

const REQ_ID = 'REQ-PROTO-1'

/** requirement.md 标本：FR 明细 + 「讨论与裁定记录（D-x）」表（FR-8 的五要素）。 */
const REQ_MD = [
  '# 需求说明',
  '',
  '**FR-1: 权威原型**',
  '',
  '**FR-4: 锚点区块**',
  '',
  '## 讨论与裁定记录（D-x）',
  '',
  '| 编号 | 原话来源（引用） | 裁定 | 影响 FR | 判据 |',
  '|---|---|---|---|---|',
  '| D-1 | 用户：「原型要单列」 | 原型必须有唯一权威版本 | FR-1、FR-4 | 验收标准 1：两版并存时点名 |',
  '| D-2 | 用户：「阈值别写原型里」 | 阈值由设计阶段定死 | FR-4 | 验收标准 4 |',
  '| 说明 | 这一行没有 D-x 编号，不是裁定条目 | — | — | — |',
  '',
].join('\n')

/** 设计文档标本：第 1 节的 serves 里同时有 FR、**原型锚点**、D-x（正是要分流的三类文本）。 */
const DESIGN_MD = [
  '# 后端设计',
  '',
  '## 1. 原型与裁定 serves: FR-1, prototypes/x.html#FR-4, D-1',
  '',
  '正文说明（本节引了锚点，锚点不得算作 serves）。',
  '',
  '## 2. 另一节 serves: FR-4',
  '',
  '正文说明。',
  '',
].join('\n')

/** 权威原型：两个 FR 锚点 + 单块 proto-geometry（两条观测，含闭值域 unit / at.state）。 */
const DETAIL_HTML = [
  '<!doctype html>',
  '<html><body>',
  '<section id="FR-1">标题区</section>',
  '<section id="FR-4">页签区</section>',
  '<!-- proto-geometry {"observations":[',
  '{"name":"tabsTop","value":12,"unit":"px","at":{"width":1280,"state":"terminal"}},',
  '{"name":"tabCount","value":4,"unit":"count","at":{"width":1280,"state":"terminal"}}]} -->',
  '</body></html>',
  '',
].join('\n')

/** 被取代版：观测值由人给（source: human）。 */
const DETAIL_V2_HTML = [
  '<!doctype html>',
  '<html><body>',
  '<section id="FR-4">页签区（旧稿）</section>',
  '<!-- proto-geometry {"observations":[{"name":"tabsTop","value":20,"unit":"px",',
  '"at":{"width":1280,"state":"inflight"},"source":"human"}]} -->',
  '</body></html>',
  '',
].join('\n')

/** 权威清单（决议 #1：INDEX 自身也是 kind=prototype 产物，但不是一份原型页面）。 */
const INDEX_MD = [
  '# 原型权威清单',
  '',
  '| 路径 | 状态 | 服务条款 | 被取代于 |',
  '|---|---|---|---|',
  '| prototypes/detail.html | authoritative | FR-1、FR-4 | — |',
  '| prototypes/detail-v2.html | superseded | FR-4 | prototypes/detail.html |',
  '',
].join('\n')

describe('RTM prototypes / decisions / task_coverage（t7 标本）', () => {
  let root: string
  let reqDir: string
  let ledger: LedgerReader
  let gen: RTMGenerator

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rtm-proto-sections-'))
    reqDir = join(root, 'docs', 'requirements', REQ_ID)
    mkdirSync(join(reqDir, 'design'), { recursive: true })
    mkdirSync(join(reqDir, 'prototypes'), { recursive: true })
    writeFileSync(join(reqDir, 'requirement.md'), REQ_MD)
    writeFileSync(join(reqDir, 'design', 'backend.md'), DESIGN_MD)
    writeFileSync(join(reqDir, 'prototypes', 'detail.html'), DETAIL_HTML)
    writeFileSync(join(reqDir, 'prototypes', 'detail-v2.html'), DETAIL_V2_HTML)
    writeFileSync(join(reqDir, 'prototypes', 'INDEX.md'), INDEX_MD)

    const artifacts: LedgerArtifactLike[] = [
      { kind: 'requirement', path: 'requirement.md', stage: 'brainstorming', confirmedAt: 1_700_000_000_000 },
      { kind: 'prototype', path: 'prototypes/detail.html', stage: 'brainstorming', registeredAt: 1 },
      { kind: 'prototype', path: 'prototypes/detail-v2.html', stage: 'brainstorming', registeredAt: 2 },
      { kind: 'prototype', path: 'prototypes/INDEX.md', stage: 'brainstorming', registeredAt: 3 },
    ]
    const tasks: RTMTaskLike[] = [
      {
        id: 't-aaaaaa', title: 'UI 卡', status: 'in_progress', phase: 'implement', side: 'frontend',
        depends_on: [], implements: 'design/backend.md#1', serves: ['FR-1'],
        prototypeRefs: ['prototypes/detail.html#FR-4'], decisionRefs: ['D-1'],
      },
      {
        // 字段缺失的卡：两维必须给空数组（不编造），且不得让用例只覆盖"有值"的一条路
        id: 't-bbbbbb', title: '无锚点卡', status: 'todo', phase: 'implement', side: 'backend',
        depends_on: ['t-aaaaaa'], implements: 'design/backend.md#2', serves: ['FR-4'],
      },
    ]
    ledger = {
      requirement: id => (id === REQ_ID
        ? { id: REQ_ID, title: '原型进流水线标本', category: 'feature', status: 'implementing', artifacts }
        : undefined),
      tasksOf: id => (id === REQ_ID ? tasks : []),
    }
    gen = new RTMGenerator({ workspaceRoot: root, ledger })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const readYml = <T,>(name: string): T =>
    parse(readFileSync(join(reqDir, name), 'utf-8')) as T

  it('brainstorming：prototypes 非空且每条带 authoritative/anchors；decisions 投影 D-x 五要素', () => {
    gen.generateBrainstorming(REQ_ID)
    const yml = readYml<RTMBrainstorming>('rtm-brainstorming.yml')
    const outputs = yml.outputs

    // ① 原型节（来源＝台账 kind=prototype 产物 + INDEX 权威角色）
    expect(outputs.prototypes).toBeDefined()
    const prototypes = outputs.prototypes ?? []
    expect(prototypes).toHaveLength(2) // INDEX.md 自身不算一份原型页面
    for (const p of prototypes) {
      expect(Object.keys(p)).toContain('authoritative')
      expect(Object.keys(p)).toContain('anchors')
      expect(Array.isArray(p.anchors)).toBe(true)
      expect(p.anchors.length).toBeGreaterThan(0) // 每条都真抽到了锚点（标本 HTML 有 id="FR-N"）
    }

    const authoritative = prototypes.find(p => p.path === 'prototypes/detail.html')
    expect(authoritative?.authoritative).toBe(true)
    expect(authoritative?.superseded_by).toBeUndefined()
    expect(authoritative?.serves).toEqual(['FR-1', 'FR-4'])
    expect(authoritative?.anchors).toEqual([
      { fr: 'FR-1', selector: '#FR-1' },
      { fr: 'FR-4', selector: '#FR-4' },
    ])
    // 观测条形状与 StageArtifact.prototypeMeta.geometry 元素同源（决议 #41/#49）
    expect(authoritative?.geometry).toEqual([
      { name: 'tabsTop', value: 12, unit: 'px', at: { width: 1280, state: 'terminal' } },
      { name: 'tabCount', value: 4, unit: 'count', at: { width: 1280, state: 'terminal' } },
    ])
    expect(Object.keys(authoritative?.geometry[0] ?? {})).not.toContain('source') // 缺省不带键

    const superseded = prototypes.find(p => p.path === 'prototypes/detail-v2.html')
    expect(superseded?.authoritative).toBe(false)
    expect(superseded?.superseded_by).toBe('prototypes/detail.html')
    expect(superseded?.geometry[0]).toEqual({
      name: 'tabsTop', value: 20, unit: 'px', at: { width: 1280, state: 'inflight' }, source: 'human',
    })

    // ② 裁定节：逐行投影 requirement.md 的 D-x 表（没有编号的行不是条目 ⇒ 跳过）
    expect(outputs.decisions).toEqual([
      {
        id: 'D-1', source: '用户：「原型要单列」', verdict: '原型必须有唯一权威版本',
        serves: ['FR-1', 'FR-4'], criterion: '验收标准 1：两版并存时点名',
      },
      {
        id: 'D-2', source: '用户：「阈值别写原型里」', verdict: '阈值由设计阶段定死',
        serves: ['FR-4'], criterion: '验收标准 4',
      },
    ])

    // ③ 既有 requirements 节形状逐字不变（键集合与取数口径都没动）
    const lines = REQ_MD.split('\n')
    expect(outputs.requirements).toEqual([
      { id: 'FR-1', title: '权威原型', source: 'requirement.md', line: lines.indexOf('**FR-1: 权威原型**') + 1 },
      { id: 'FR-4', title: '锚点区块', source: 'requirement.md', line: lines.indexOf('**FR-4: 锚点区块**') + 1 },
    ])
  })

  it('rtm_version 升位 2.0，而 metadata.version 仍是写入计数', () => {
    gen.generateBrainstorming(REQ_ID)
    const first = readYml<RTMBrainstorming>('rtm-brainstorming.yml')
    expect(first.metadata.rtm_version).toBe('2.0')
    expect(first.metadata.version).toBe(1) // 首次写入 = 1（prev 0 + 1）

    gen.generateBrainstorming(REQ_ID)
    const second = readYml<RTMBrainstorming>('rtm-brainstorming.yml')
    expect(second.metadata.rtm_version).toBe('2.0') // schema 版本不随写入漂移
    expect(second.metadata.version).toBe(2) // 计数 +1 —— 两个键不是同一个
    expect(second.metadata.version).not.toBe(second.metadata.rtm_version)
  })

  it('design：锚点不进 serves 而进 protoRefs；serves 允许引用 D-x', () => {
    gen.generateBrainstorming(REQ_ID)
    gen.generateDesign(REQ_ID)
    const yml = readYml<RTMDesign>('rtm-design.yml')
    const sections = yml.outputs.design_sections
    expect(sections.map(s => s.ref)).toEqual(['design/backend.md#1', 'design/backend.md#2'])

    const first = sections[0]
    // ⑤ 锚点被 strip：假引用 FR-4 不进 serves（parser 原样会把它算进来），锚点原文进 protoRefs
    expect(first?.serves).not.toContain('FR-4')
    expect(first?.serves).toEqual(['FR-1', 'D-1'])
    expect(first?.protoRefs).toEqual(['prototypes/x.html#FR-4'])

    const second = sections[1]
    expect(second?.serves).toEqual(['FR-4']) // 正常编号引用照旧
    expect(second?.protoRefs).toBeUndefined() // 没引锚点的章节不带该键

    // D-x 与 FR 同为可引用编号，故 buildFRToDesign 对 servd 编号建键（覆盖度分母只数 FR，见下）
    expect(yml.traceability.fr_to_design['D-1']).toEqual(['design/backend.md#1'])
    expect(yml.traceability.fr_to_design['FR-1']).toEqual(['design/backend.md#1'])
    expect(yml.traceability.fr_to_design['FR-4']).toEqual(['design/backend.md#2'])
    expect(yml.coverage.design.total_frs).toBe(2)
    expect(yml.coverage.design.rate).toBe(100)
    expect(yml.metadata.rtm_version).toBe('2.0')
  })

  it('decomposing：task_coverage 每项含 covers_prototypes/covers_decisions；缺字段给空数组', () => {
    gen.generateBrainstorming(REQ_ID)
    gen.generateDesign(REQ_ID)
    gen.generateDecomposing(REQ_ID)
    const yml = readYml<RTMDecomposing>('rtm-decomposing.yml')

    const coverage = yml.task_coverage ?? []
    expect(coverage).toHaveLength(2)
    for (const item of coverage) {
      expect(Object.keys(item)).toContain('covers_prototypes')
      expect(Object.keys(item)).toContain('covers_decisions')
    }
    expect(coverage[0]).toEqual({
      task_id: 't-aaaaaa',
      covers_prototypes: ['prototypes/detail.html#FR-4'],
      covers_decisions: ['D-1'],
    })
    // 字段缺失 = 未采集 ⇒ 空数组（不编造）
    expect(coverage[1]).toEqual({
      task_id: 't-bbbbbb', covers_prototypes: [], covers_decisions: [],
    })

    // 既有 outputs.tasks 形状不变（不得顺手加字段）
    expect(Object.keys(yml.outputs.tasks[0] ?? {})).toEqual([
      'id', 'title', 'implements', 'serves', 'depends_on', 'phase', 'side',
    ])
    expect(yml.metadata.rtm_version).toBe('2.0')
    expect(yml.metadata.version).toBe(1) // 仍是写入计数（本文件首次写入）
  })

  it('纯函数：坏数据降级为空集合，缺表/缺节返回空（不猜、不编造）', () => {
    // 锚点仍能抽到，但坏 JSON / 多块 geometry 一律不落
    const bad = prototypeMetaFromHtml('<div id="FR-2"></div><!-- proto-geometry {oops -->')
    expect(bad.anchors).toEqual([{ fr: 'FR-2', selector: '#FR-2' }])
    expect(bad.geometry).toEqual([])
    const twoBlocks = prototypeMetaFromHtml(
      '<i id="FR-3"></i><!-- proto-geometry {"observations":[]} --><!-- proto-geometry {"observations":[]} -->',
    )
    expect(twoBlocks.geometry).toEqual([]) // 块数 ≠ 1 ⇒ 不猜（多块由原型门点名）
    // 值域外 / 重名的观测条目丢弃，不落假数据
    const mixed = prototypeMetaFromHtml(
      '<i id="FR-3"></i><!-- proto-geometry {"observations":['
      + '{"name":"a","value":1,"unit":"em","at":{"width":800,"state":"terminal"}},'
      + '{"name":"b","value":2,"unit":"px","at":{"width":800,"state":"terminal"}},'
      + '{"name":"b","value":3,"unit":"px","at":{"width":800,"state":"terminal"}}]} -->',
    )
    expect(mixed.geometry).toEqual([{ name: 'b', value: 2, unit: 'px', at: { width: 800, state: 'terminal' } }])

    expect(parsePrototypeIndexRows(null).size).toBe(0)
    const noServes = parsePrototypeIndexRows('| 路径 | 状态 |\n|---|---|\n| a.html | authoritative |\n')
    expect(noServes.get('a.html')).toEqual({ status: 'authoritative', serves: [] })

    expect(decisionsOf(null)).toEqual([])
    expect(decisionsOf('# 需求\n\n**FR-1: 无裁定节**\n')).toEqual([])
    expect(decisionsOf('## 讨论与裁定记录（D-x）\n\n> 本节无裁定\n')).toEqual([])
  })
})
