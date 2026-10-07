/**
 * 归档渲染器测试（REQ-261006201841-944d t3 / FR-5、FR-6 / TC-17～TC-24）。
 *
 * 逐条锁死六件事：
 *   ① 分节齐且**顺序即契约**、`indexEntry` 原文逐字进渲染物；
 *   ② 机器产物**一行一类**（逐文件路径不铺开），且产量**等于** `matchArchiveExemption` 的分类；
 *   ③ `queue.json` 摘要五项与夹具实际值一一相等；
 *   ④ 坏 JSON → 渲染「无法解析，仅报体积」且**不抛错**（摘要是增益不是判据）；
 *   ⑤ 旧形态 `manualUpdates`（只有 `section`）渲染为 `path（旧：section）`；
 *   ⑥ 纯函数性：同一输入两次调用**字节级**相同；跨次提交只有「渲染时刻」行不同，
 *      剔除该行后逐字节相同（这正是写盘幂等的判据）。
 *
 * 另有两条自检：application 的 `ResolvedMergeTarget` 与渲染输入**结构同源**（编译期）、
 * 每条豁免规则都有类别人读名（新增规则忘起名时点名，而不是静默回落成 id）。
 */
import { describe, expect, it } from 'vitest'
import { ARCHIVE_EXEMPTIONS, matchArchiveExemption } from '../src/domain/requirement/archive-exemptions.js'
import {
  buildMachineGroups,
  machineLabelOf,
  renderArchiveManifest,
  stripRenderedAtLines,
  summarizeQueueJson,
  type ArchiveManifestInput,
  type MachineArtifactReading,
} from '../src/domain/requirement/archive-manifest.js'
import type { ResolvedMergeTarget as AppMergeTarget } from '../src/application/internal/archive-targets.js'

const DIR = 'docs/requirements/REQ-abc123'
const INDEX_ENTRY = '把归档声明的落地变成可证伪：目标必须真实存在'
/** 渲染时刻由调用方注入（渲染器不碰时钟）——固定值保证同一输入恒同一文本。 */
const RENDERED_AT = Date.UTC(2026, 9, 6, 12, 0, 0)

/** `queue.json` 夹具：五项摘要的每一格都对得上（任务 5 / 边 3 / 就绪 2 / 原始时刻 / 实测字节）。 */
const QUEUE_JSON = JSON.stringify({
  generated_at: '2026-10-06T10:30:00.000Z',
  tasks: [{ id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }, { id: 't5' }],
  edges: [{ from: 't1', to: 't2' }, { from: 't2', to: 't3' }, { from: 't3', to: 't4' }],
  ready: [{ id: 't1' }, { id: 't5' }],
  layers: [{ id: 'l1' }],
})
const QUEUE_BYTES = Buffer.byteLength(QUEUE_JSON, 'utf8')

/** 目录实测读数（相对需求目录）：四类机器产物各命中一条规则（含 `state/rtm-*.json` 不被 rtm-dir 抢走）。 */
const ENTRIES: MachineArtifactReading[] = [
  { path: 'rtm-design.yml', bytes: 120 },
  { path: 'rtm-implementing/t-1.yml', bytes: 80 },
  { path: 'queue.json', bytes: QUEUE_BYTES, text: QUEUE_JSON },
  { path: 'state/rtm-failures.json', bytes: 40 },
]

const DOCS = [
  { kind: 'requirement', path: DIR + '/requirement.md' },
  { kind: 'plan', path: DIR + '/decomposition.md' },
  { kind: 'verification', path: DIR + '/verification.md' },
  { kind: 'notes', path: DIR + '/archive.md' },
]

const MANUAL = [
  { path: 'docs/architecture/project-manual.md#收尾门', summary: '新增三条硬约束' },
  { path: 'docs/architecture/legacy.md', section: '收尾门', summary: '旧形态：章节名自由文本' },
]

function manifestInput(over: Partial<ArchiveManifestInput> = {}): ArchiveManifestInput {
  return {
    requirementId: 'REQ-abc123',
    title: '归档渲染器',
    category: 'feature',
    renderedAt: RENDERED_AT,
    indexEntry: INDEX_ENTRY,
    dir: DIR,
    docs: DOCS,
    mergedInto: [
      { path: 'docs/architecture/project-manual.md', root: '/proj', by: 'project-id', ok: true, bytes: 4321 },
      { path: 'docs/architecture/gone.md', root: '/proj', by: 'project-id', ok: false, reason: 'missing' },
    ],
    manualUpdates: MANUAL,
    machine: buildMachineGroups(ENTRIES),
    listedCount: DOCS.length,
    ...over,
  }
}

const render = (over: Partial<ArchiveManifestInput> = {}): string => renderArchiveManifest(manifestInput(over))

describe('TC-17 节序与结论原文', () => {
  it('六个分节按契约顺序出现，且 indexEntry 逐字进渲染物', () => {
    const out = render()
    expect(out.startsWith('# 归档结论（REQ-abc123 归档渲染器）')).toBe(true)
    expect(out).toContain(INDEX_ENTRY)
    // 顺序即契约（逐节取下标，必须严格递增）
    const sections = ['## 一句话结论', '## 合并去向', '## 人读材料', '## 机器产物（可重建，折叠）', '## 说明书更新点', '## 相关']
    let at = -1
    for (const h of sections) {
      const i = out.indexOf(h)
      expect(i, '缺少分节或顺序不对：' + h).toBeGreaterThan(at)
      at = i
    }
    // 头部三行读数（归档目录 / 类型 / 渲染时刻）
    expect(out).toContain('> 归档目录：`' + DIR + '` ｜ 类型：feature')
    expect(out).toContain('渲染时刻：2026-10-06T12:00:00.000Z')
  })
})

describe('TC-18 合并去向逐条读数', () => {
  it('通过项含路径 + 「✅ 存在 N 字节」+ 生效根 + 判据来源 by', () => {
    const out = render()
    expect(out).toContain('- `docs/architecture/project-manual.md` — ✅ 存在 4321 字节（生效根 /proj，判据来源 by=project-id）')
  })

  it('缺失项含「❌ 不存在」；空文件项与缺失**可区分**（缺失 ≠ 0）', () => {
    const missing = render()
    expect(missing).toContain('- `docs/architecture/gone.md` — ❌ 不存在（生效根 /proj，判据来源 by=project-id）')
    const empty = render({
      mergedInto: [{ path: 'docs/architecture/empty.md', root: '/proj', by: 'path-fallback', ok: false, reason: 'empty', bytes: 0 }],
    })
    expect(empty).toContain('❌ 空文件（0 字节）')
    expect(empty).not.toContain('❌ 不存在')
    expect(empty).toContain('by=path-fallback')
  })
})

describe('TC-19 机器产物一行一类（FR-6）', () => {
  const groups = buildMachineGroups(ENTRIES)

  it('产量等于 matchArchiveExemption 的分类结果（类别 / 数量 / 体积逐项对得上）', () => {
    expect(groups.map(g => g.rule)).toEqual(['rtm-reports', 'rtm-dir', 'ledger-mirror', 'runtime-state'])
    for (const g of groups) {
      const hit = ENTRIES.filter(e => matchArchiveExemption(e.path)?.id === g.rule)
      expect(g.count, g.rule + ' 数量').toBe(hit.length)
      expect(g.bytes, g.rule + ' 体积').toBe(hit.reduce((n, e) => n + e.bytes, 0))
    }
    // 逐路径分类与聚合分区一一对应（不多收、不漏收）
    const classified = ENTRIES.map(e => matchArchiveExemption(e.path)?.id)
    expect(classified).toEqual(['rtm-reports', 'rtm-dir', 'ledger-mirror', 'runtime-state'])
    expect(new Set(groups.map(g => g.rule))).toEqual(new Set(classified))
  })

  it('渲染只有「类别名 · 数量 · 体积」行，逐文件路径不铺开（M-3）', () => {
    const out = render({ machine: groups })
    expect(out).toContain('- 追溯报告（rtm-*.yml） · 1 个 · 120 字节')
    expect(out).toContain('- 追溯报告目录（rtm-*/） · 1 个 · 80 字节')
    expect(out).toContain('- 台账镜像（queue.json） · 1 个 · ' + QUEUE_BYTES + ' 字节')
    expect(out).toContain('- 运行态留痕（state/） · 1 个 · 40 字节')
    // 逐文件路径不铺开：`queue.json` 只作为**类别名**出现在那一行里，没有逐文件行
    // （它出现在类别名里是 FR-6 的明文要求：「`queue.json` 附摘要」——与"逐文件铺开"不是一回事）。
    for (const e of ENTRIES.filter(x => x.path !== 'queue.json')) {
      expect(out, '逐文件路径被铺开了：' + e.path).not.toContain(e.path)
    }
    expect(out).not.toContain('- `queue.json`')
    expect(out).toContain('- 台账镜像（queue.json） · 1 个 · ' + QUEUE_BYTES + ' 字节')
  })

  it('渲染物自己（archive.md）不算机器产物——它进的是人读清单', () => {
    expect(buildMachineGroups([{ path: 'archive.md', bytes: 999 }])).toEqual([])
    expect(matchArchiveExemption('archive.md')).toBeUndefined()
  })

  it('每条豁免规则都有类别人读名（新增规则忘起名 → 这里点名，而不是静默回落成 id）', () => {
    for (const rule of ARCHIVE_EXEMPTIONS) {
      expect(machineLabelOf(rule.id), '缺人读名：' + rule.id).not.toBe(rule.id)
    }
  })
})

describe('TC-20 queue.json 摘要（FR-6 验收标准 2）', () => {
  it('五项（任务数 / 依赖边数 / 就绪数 / 生成时间 / 字节数）与夹具队列一一相等', () => {
    const g = buildMachineGroups(ENTRIES).find(x => x.rule === 'ledger-mirror')
    expect(g?.queueSummary).toEqual({
      tasks: 5,
      edges: 3,
      ready: 2,
      generatedAt: '2026-10-06T10:30:00.000Z',
      bytes: QUEUE_BYTES,
    })
    expect(render()).toContain('- 摘要：任务 5 · 依赖边 3 · 就绪 2 · 生成时间 2026-10-06T10:30:00.000Z · ' + QUEUE_BYTES + ' 字节')
  })

  it('缺 generated_at → 不编时间（如实报「未知」），其余四项照常', () => {
    const text = '{"tasks":[1],"edges":[],"ready":[1,2]}'
    const bytes = Buffer.byteLength(text, 'utf8')
    const summary = summarizeQueueJson(text, bytes)
    expect(summary).toEqual({ tasks: 1, edges: 0, ready: 2, bytes })
    expect(summary?.generatedAt).toBeUndefined()
    const out = render({ machine: buildMachineGroups([{ path: 'queue.json', bytes, text }]) })
    expect(out).toContain('摘要：任务 1 · 依赖边 0 · 就绪 2 · 生成时间 未知（原文缺失） · ' + bytes + ' 字节')
  })
})

describe('TC-21 queue.json 解析失败降级', () => {
  it('坏 JSON → 摘要 undefined、渲染「无法解析，仅报体积」，函数**不抛错**', () => {
    expect(summarizeQueueJson('{ 这不是 JSON', 7)).toBeUndefined()
    // 能 parse 但形状不符（缺 tasks/edges/ready）也算"读不出摘要"，不把"读不到"渲染成 0
    expect(summarizeQueueJson('{"tasks":[]}', 7)).toBeUndefined()
    expect(summarizeQueueJson(undefined, 7)).toBeUndefined()
    const groups = buildMachineGroups([{ path: 'queue.json', bytes: 7, text: '{ 坏的' }])
    expect(groups[0]?.queueSummary).toBeUndefined()
    let out = ''
    expect(() => { out = render({ machine: groups }) }).not.toThrow()
    expect(out).toContain('- 台账镜像（queue.json） · 1 个 · 7 字节')
    expect(out).toContain('- 摘要：无法解析，仅报体积（7 字节）')
    // 其余分区照常输出（降级只作用于摘要这一行）
    expect(out).toContain('## 说明书更新点')
    expect(out).toContain(INDEX_ENTRY)
  })
})

describe('TC-22 纯函数性（I-3 纪律）', () => {
  it('同一输入两次调用字节级相等（不读时钟 / 环境变量 / 文件系统）', () => {
    expect(render()).toBe(render())
  })

  it('跨次提交只有「渲染时刻」行不同：剔除该行后逐字节相同（写盘幂等的判据）', () => {
    const first = render()
    const second = render({ renderedAt: RENDERED_AT + 3_600_000 })
    expect(second).not.toBe(first) // 时刻行确实变了
    expect(stripRenderedAtLines(second)).toBe(stripRenderedAtLines(first))
    expect(stripRenderedAtLines(first)).not.toContain('渲染时刻')
  })
})

describe('TC-23 说明书更新点（含旧形态读侧兼容）', () => {
  it('新形态渲染 `path#anchor`，旧形态渲染 `path（旧：section）`', () => {
    const out = render()
    expect(out).toContain('- `docs/architecture/project-manual.md#收尾门` — 新增三条硬约束')
    expect(out).toContain('- `docs/architecture/legacy.md（旧：收尾门）` — 旧形态：章节名自由文本')
  })

  it('无 manualUpdates 时渲染 manualNote；两者皆无 → 「（无）」', () => {
    expect(render({ manualUpdates: [], manualNote: '纯维护，不改变项目认知' }))
      .toContain('- 无（纯维护，不改变项目认知）')
    expect(render({ manualUpdates: [] })).toContain('- （无）')
  })
})

describe('TC-24 人读 / 机器计数对照', () => {
  it('人读分区含人读份数与机器类别数，且与实测计数相等', () => {
    const machine = buildMachineGroups(ENTRIES)
    const machineFiles = machine.reduce((n, g) => n + g.count, 0)
    const machineBytes = machine.reduce((n, g) => n + g.bytes, 0)
    const out = render({ machine })
    expect(out).toContain('清单 ' + DOCS.length + ' 份 · 对照机器产物 ' + machine.length + ' 类 / ' + machineFiles + ' 份')
    expect(out).toContain('已折叠 ' + machine.length + ' 类 / ' + machineFiles + ' 份 · 共 ' + machineBytes + ' 字节')
    // kind 分组计数与清单一致
    expect(out).toContain('**requirement**（1 份）')
    expect(out).toContain('**notes**（1 份）')
    expect(out).toContain('- `' + DIR + '/archive.md`')
  })
})

describe('类型同源与分区边界自检', () => {
  it('application 的判据结果可直接喂进渲染器（两处形状漂移 → 编译期就红）', () => {
    const sameShape = (t: readonly AppMergeTarget[]): ArchiveManifestInput['mergedInto'] => t
    expect(sameShape([]).length).toBe(0)
  })

  it('空机器产物分区 → 渲染「（无）」，不留空标题', () => {
    const out = render({ machine: [] })
    expect(out).toContain('## 机器产物（可重建，折叠）\n\n- （无）')
    expect(out).toContain('对照机器产物 0 类 / 0 份')
  })
})
