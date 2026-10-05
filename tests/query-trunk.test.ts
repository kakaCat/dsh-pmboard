/**
 * 主干抽取（trunk）单测 —— REQ-261004222448-292a t-242dd9 / design/backend.md §S-5。
 * serves: FR-1, FR-2, FR-14, FR-15。
 *
 * 卡上验收三条（逐条有断言）：
 *   ① 缺节标本 → 该条 `missing === 'doc-section-missing'` 且 `summary` 为空数组；
 *   ② 有节标本 → 摘要文本必须是**原文子串**（`text.includes(summary[0])`）；
 *   ③ 反例 → `req.description` 非空但文档缺该节时，**不得**回退用描述填充。
 *
 * 夹具刻意写成"文档自己带结构"（领句 + 痛点表 + 列表），因为抽取只认文档既有节名与标签，
 * 不认我们心里的模型——夹具一旦"帮它总结"，断言就测不到"只截原文"这条纪律了。
 */
import { describe, expect, it } from 'vitest'
import {
  TRUNK_KEYS,
  TRUNK_SECTION_NAMES,
  assembleTrunk,
  extractSection,
  findSection,
  gateTraces,
  matchesSectionName,
  queryTrunk,
} from '../src/application/query/QueryTrunk.js'
import type { PanelQueryDeps } from '../src/application/query/contracts.js'
import type { RequirementRecord, TrunkItem } from '../src/shared/protocol.js'

const REQ_ID = 'REQ-trunk01'
const REQ_DOC = 'docs/requirements/' + REQ_ID + '/requirement.md'
const DESIGN_DIR = 'docs/requirements/' + REQ_ID + '/design'
const ARCH_DOC = DESIGN_DIR + '/architecture.md'
const SECOND_DESIGN_DOC = DESIGN_DIR + '/backend.md'

/** 只存在于台账 `description` 的句子——它绝不该出现在任何一条主干摘要里（③）。 */
const DESCRIPTION = '需求描述：这段文字只存在于台账 description 字段，文档里没有——绝不许拿来填缺节'

/* ── 有节标本（②）：需求文档 §产品定义 / §边界；设计文档 §架构 / §关键决策与取舍 / §技术方案与亮点 ── */

const REQUIREMENT_MD = [
  '# REQ-trunk01 主干抽取样例',
  '',
  '## 产品定义',
  '',
  '**一句话**：把需求详情页改成工作汇报，主干常驻。',
  '',
  '| 痛点（实测） | 本次解决 |',
  '|---|---|',
  '| 打开一屏读不出现在怎么样 | 首屏结论头 |',
  '| 数字不可得时显示 0 | 诚实空态 |',
  '',
  '**与现状的区别**：附件 Tab 按数据来源堆着。',
  '',
  '## 边界（不做什么）',
  '',
  '1. **不做成一份报告**：不做导出、不加封面。',
  '2. **不搬会话全文**：工具调用与推理不进页面。',
  '',
  '## 功能点',
  '',
  '**FR-1 主干四条**：主干常驻。',
  '',
  '**FR-2 关键决策与取舍**：含人的退回理由。',
  '',
  '**FR-3 做到哪了**：阶段 + 一行结论。',
  '',
].join('\n')

const ARCH_MD = [
  '# 架构文档（REQ-trunk01）',
  '',
  '## 架构 `serves: FR-1`',
  '',
  '主线：只读聚合 + 读时抽取，前端不做遍历。',
  '',
  '## 关键决策与取舍 `serves: FR-2`',
  '',
  '| 决策 | 理由 |',
  '|---|---|',
  '| 不缓存抽取结果 | 文档一改即生效 |',
  '| 不回退需求描述 | 否则缺节不可见 |',
  '',
  '## 技术方案与亮点 <!-- serves: FR-14 -->',
  '',
  '- 差异：按写死节名抽取，不做模型判断',
  '  为什么：抽错比抽不到更坏（抽错会伪装成有内容）',
  '  证据：src/application/query/QueryTrunk.ts、tests/query-trunk.test.ts',
  '- 差异：缺证据的亮点照实展示',
  '  为什么：这是反应付的机制保证',
  '',
].join('\n')

/** 缺节标本（①②③）：两份文档都没有那五个写死的节名。 */
const EMPTY_REQUIREMENT_MD = ['# REQ-trunk02 缺节样例', '', '## TL;DR', '', '一句话说明。', ''].join('\n')
const EMPTY_DESIGN_MD = ['# 设计（REQ-trunk02）', '', '## 模块改动地图', '', '| 文件 | 改动 |', '|---|---|', '| a.ts | 改 |', ''].join('\n')

/* ── 夹具 ─────────────────────────────────────────────────────────────────── */

function makeReq(overrides: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: REQ_ID,
    title: '主干抽取样例',
    description: DESCRIPTION,
    category: 'feature',
    status: 'implementing',
    blocked: false,
    comments: [],
    version: 1,
    createdAt: 1000,
    updatedAt: 2000,
    createdBy: { kind: 'human' },
    updatedBy: { kind: 'human' },
    ...overrides,
  }
}

/** 内存版 DocRepository：只实现抽取用到的 exists / read / list / stat（口径同 design-docs 的扫描）。 */
function makeDocs(files: Record<string, string>, mtimes: Record<string, number> = {}) {
  return {
    exists: (p: string): boolean => Object.prototype.hasOwnProperty.call(files, p),
    read: async (p: string): Promise<string> => {
      const v = files[p]
      if (v === undefined) throw new Error('ENOENT ' + p)
      return v
    },
    write: async (): Promise<void> => { /* 只读查询不该写 */ },
    list: (dir: string): readonly { name: string; isFile: boolean; mtimeMs: number; size: number }[] =>
      Object.keys(files)
        .filter(p => p.startsWith(dir + '/'))
        .map(p => ({ name: p.slice(dir.length + 1), isFile: true, mtimeMs: 0, size: 0 })),
    stat: (p: string): { mtimeMs: number; size: number } | undefined =>
      files[p] === undefined ? undefined : { mtimeMs: mtimes[p] ?? 1, size: files[p].length },
    resolve: (p: string): string => '/w/' + p,
    workspaceRoot: (): string => '/w',
  }
}

interface DepsOptions {
  req?: RequirementRecord | undefined
  getThrows?: string
  comments?: readonly { body: string }[]
  tasks?: readonly unknown[]
  files?: Record<string, string>
  mtimes?: Record<string, number>
  /** false = 不装配 docs 端口（contracts.ts 的加法式扩展缺省态）。 */
  withDocs?: boolean
  readThrows?: readonly string[]
}

function makeDeps(o: DepsOptions = {}): PanelQueryDeps {
  const files = o.files ?? {}
  const throwing = new Set(o.readThrows ?? [])
  const inner = makeDocs(files, o.mtimes ?? {})
  const docs = {
    ...inner,
    read: async (p: string): Promise<string> => {
      if (throwing.has(p)) throw new Error('EACCES ' + p)
      return inner.read(p)
    },
  }
  return {
    store: {
      get: async (): Promise<RequirementRecord | undefined> => {
        if (o.getThrows !== undefined) throw new Error(o.getThrows)
        return o.req
      },
      listComments: async (): Promise<readonly { body: string }[]> => o.comments ?? [],
    },
    tasks: { listByRequirement: async (): Promise<readonly unknown[]> => o.tasks ?? [] },
    injections: {},
    sessions: {},
    ...(o.withDocs === false ? {} : { docs }),
  } as unknown as PanelQueryDeps
}

const OK_FILES = { [REQ_DOC]: REQUIREMENT_MD, [ARCH_DOC]: ARCH_MD }
const MISSING_FILES = { [REQ_DOC]: EMPTY_REQUIREMENT_MD, [ARCH_DOC]: EMPTY_DESIGN_MD }

function itemOf(items: readonly TrunkItem[], key: TrunkItem['key']): TrunkItem {
  const found = items.find(i => i.key === key)
  if (found === undefined) throw new Error('缺少主干条目：' + key)
  return found
}

/* ── 纯函数：extractSection / findSection ─────────────────────────────────── */

describe('extractSection / findSection（纯函数）', () => {
  it('按写死节名取节正文：undefined = 没有这一节，\'\' = 有节但为空（两者同处置但不是同一件事）', () => {
    expect(extractSection(REQUIREMENT_MD, TRUNK_SECTION_NAMES.productDefinition)).toContain('**一句话**')
    expect(extractSection(REQUIREMENT_MD, '不存在的节')).toBeUndefined()
    expect(extractSection('# t\n\n## 产品定义\n\n## 边界\n\n1. 不做。\n', TRUNK_SECTION_NAMES.productDefinition)).toBe('')
  })

  it('节名匹配先去掉装饰（serves 注记 / 括号后缀）：`## 边界（不做什么）` 能命中写死的「边界」', () => {
    const slice = findSection(REQUIREMENT_MD, TRUNK_SECTION_NAMES.boundary)
    expect(slice?.name).toBe('边界')
    expect(slice?.text).toContain('不做成一份报告')
    expect(extractSection(ARCH_MD, TRUNK_SECTION_NAMES.architecture)).toContain('只读聚合')
  })

  it('不做前后缀模糊匹配：`## 模块改动地图` 不等于「架构」（抽错比抽不到更坏）', () => {
    expect(extractSection(EMPTY_DESIGN_MD, TRUNK_SECTION_NAMES.architecture)).toBeUndefined()
  })

  it('代码围栏里的井号不是节标题，不截断节正文', () => {
    const doc = ['# t', '', '## 架构', '', '```', '# 这是代码注释不是标题', '```', '', '节尾一行。', '', '## 下一节', ''].join('\n')
    const text = extractSection(doc, TRUNK_SECTION_NAMES.architecture)
    expect(text).toContain('节尾一行。')
    expect(text).toContain('# 这是代码注释不是标题')
  })
})

/**
 * 节名匹配的容忍度（来自 t7 模板卡的实测证据）：
 *   ① 设计文档每个 H2 都被门禁要求带 serves 标注（content-gates.ts:270-277），真实标题是
 *      `## 目标与总体方案 \`serves: FR-11, FR-1\``；② 需求文档真实标题是 `## 边界（不做什么）`。
 * 所以判据是"剥装饰后**以节名开头**（或相等）"，而不是整行相等——但仍**不许**"包含/结尾"。
 */
describe('节名匹配容忍真实标题装饰（serves 标注 / 括号后缀 / HTML 注释）', () => {
  it('反引号 serves 标注：`## 架构 `serves: FR-1`` 命中「架构」', () => {
    expect(matchesSectionName('架构 `serves: FR-1`', TRUNK_SECTION_NAMES.architecture)).toBe(true)
    const slice = findSection(ARCH_MD, TRUNK_SECTION_NAMES.architecture)
    expect(slice?.title).toBe('架构')
    expect(slice?.rawTitle).toBe('架构 `serves: FR-1`')
  })

  it('HTML 注释 serves 标注：`## 技术方案与亮点 <!-- serves: FR-14 -->` 命中', () => {
    expect(matchesSectionName('技术方案与亮点 <!-- serves: FR-14 -->', TRUNK_SECTION_NAMES.highlight)).toBe(true)
    const slice = findSection(ARCH_MD, TRUNK_SECTION_NAMES.highlight)
    expect(slice?.title).toBe('技术方案与亮点')
    expect(slice?.rawTitle).toContain('<!-- serves: FR-14 -->')
  })

  it('括号后缀：`## 边界（不做什么）` 命中「边界」', () => {
    expect(matchesSectionName('边界（不做什么）', TRUNK_SECTION_NAMES.boundary)).toBe(true)
    expect(matchesSectionName('产品定义（含收益预期）', TRUNK_SECTION_NAMES.productDefinition)).toBe(true)
  })

  it('别名落地后：「目标与总体方案」算「架构」；但"包含式"误命中仍被挡住', () => {
    // 这一条原先断言「目标与总体方案 不算架构」——那正是**当时的真实缺口**：本仓设计模板里
    // 那一节的标题就叫「目标与总体方案」，只认「架构」时「实现思路」对任何真实文档都抽不到
    // 设计侧内容。别名表落地后该断言按新契约反转：同义命中，不再静默丢失。
    expect(matchesSectionName('目标与总体方案 `serves: FR-11`', TRUNK_SECTION_NAMES.architecture)).toBe(true)
    // 别名不放宽判据：不是别名、也不以别名开头 → 仍不算命中
    expect(matchesSectionName('模块改动地图', TRUNK_SECTION_NAMES.architecture)).toBe(false)
    expect(matchesSectionName('总体架构', TRUNK_SECTION_NAMES.architecture)).toBe(false)
  })

  it('H1 是文档标题：`# 架构文档（REQ-trunk01）` 不被当成「架构」节（否则整份文档会被抽走）', () => {
    const doc = ['# 架构文档（REQ-trunk01）', '', '导语一段。', ''].join('\n')
    expect(extractSection(doc, TRUNK_SECTION_NAMES.architecture)).toBeUndefined()
    expect(matchesSectionName('架构文档（REQ-trunk01）', TRUNK_SECTION_NAMES.architecture, 1)).toBe(false)
    // 单节文档（H1 恰好等于节名）仍算命中
    expect(matchesSectionName('架构', TRUNK_SECTION_NAMES.architecture, 1)).toBe(true)
    expect(extractSection('# 架构\n\n正文。\n', TRUNK_SECTION_NAMES.architecture)).toBe('正文。')
  })

  it('带装饰的标题命中后，openRefs 保留原标题原文与来源路径（判节容忍，出处不丢）', async () => {
    const res = await queryTrunk(makeDeps({ req: makeReq(), files: OK_FILES }), { requirementId: REQ_ID })
    if ('available' in res && res.available === false) throw new Error('不该降级')
    const approach = itemOf(res.items, 'approach')
    expect(approach.openRefs[0]?.path).toBe(ARCH_DOC)
    expect(approach.openRefs[0]?.doc).toBe('架构 `serves: FR-1`')
    expect(approach.openRefs[0]?.label).toContain('§ 架构')
    const scope = itemOf(res.items, 'scope')
    expect(scope.openRefs[0]?.doc).toBe('边界（不做什么）')
  })

  it('剥装饰只影响判节，不改正文：摘要仍是原文子串（带装饰的节也一样）', async () => {
    const res = await queryTrunk(makeDeps({ req: makeReq(), files: OK_FILES }), { requirementId: REQ_ID })
    if ('available' in res && res.available === false) throw new Error('不该降级')
    const decision = itemOf(res.items, 'decision')
    expect(decision.summary.every(l => ARCH_MD.includes(l))).toBe(true)
    expect(decision.summary.join('\n')).not.toContain('serves:')
  })
})

/* ── ① 缺节标本 ───────────────────────────────────────────────────────────── */

describe('① 缺节标本：七条全 missing + summary 为空数组', () => {
  it('文档里那五个节名一个都没有 → 每条都 missing:doc-section-missing 且 summary:[]', async () => {
    const res = await queryTrunk(makeDeps({ req: makeReq({ id: REQ_ID }), files: MISSING_FILES }), { requirementId: REQ_ID })
    expect('available' in res && res.available === false).toBe(false)
    if ('available' in res && res.available === false) throw new Error('不该降级')
    expect(res.items.map(i => i.key)).toEqual([...TRUNK_KEYS])
    for (const item of res.items) {
      expect(item.missing, item.key).toBe('doc-section-missing')
      expect(item.summary, item.key).toEqual([])
    }
  })

  it('节存在但为空 → 同样按 missing（空节 ≠ 有内容）', async () => {
    const files = {
      [REQ_DOC]: ['# t', '', '## 产品定义', '', '## 边界（不做什么）', '', '1. 不做导出。', ''].join('\n'),
      [ARCH_DOC]: ['# d', '', '## 架构', '', '## 关键决策与取舍', '', '## 技术方案与亮点', ''].join('\n'),
    }
    const res = await queryTrunk(makeDeps({ req: makeReq(), files }), { requirementId: REQ_ID })
    if ('available' in res && res.available === false) throw new Error('不该降级')
    expect(itemOf(res.items, 'why').missing).toBe('doc-section-missing')
    expect(itemOf(res.items, 'problem').missing).toBe('doc-section-missing')
    expect(itemOf(res.items, 'decision').missing).toBe('doc-section-missing')
    expect(itemOf(res.items, 'tech').missing).toBe('doc-section-missing')
    // 有内容的节不受影响
    expect(itemOf(res.items, 'scope').missing).toBeUndefined()
    expect(itemOf(res.items, 'scope').summary).toEqual(['1. 不做导出。'])
  })

  it('deps.docs 未装配 → 文档类条目全部 missing（缺省即降级，不是 500）；自动事实照常出', async () => {
    const tasks = [{ id: 't-1', requirementRefs: ['FR-1'], lastReport: { filesChanged: ['src/a.ts'], completed: [] } }]
    const res = await queryTrunk(makeDeps({ req: makeReq(), withDocs: false, tasks }), { requirementId: REQ_ID })
    if ('available' in res && res.available === false) throw new Error('不该降级')
    for (const key of ['why', 'problem', 'approach', 'scope', 'decision', 'tech', 'highlight'] as const) {
      expect(itemOf(res.items, key).missing, key).toBe('doc-section-missing')
      expect(itemOf(res.items, key).summary, key).toEqual([])
    }
    expect(itemOf(res.items, 'highlight').facts?.map(f => f.label)).toEqual(['改动规模', '新增测试文件'])
  })

  it('设计文档不可读 → 该条 missing（不是 500）', async () => {
    const res = await queryTrunk(
      makeDeps({ req: makeReq(), files: OK_FILES, readThrows: [ARCH_DOC] }),
      { requirementId: REQ_ID },
    )
    if ('available' in res && res.available === false) throw new Error('不该降级')
    expect(itemOf(res.items, 'approach').missing).toBe('doc-section-missing')
    expect(itemOf(res.items, 'why').summary.length).toBeGreaterThan(0)
  })
})

/* ── ② 有节标本：摘要必须是原文子串 ───────────────────────────────────────── */

describe('② 有节标本：摘要只截原文（不许生成叙述）', () => {
  it('七条都有内容，且每一行摘要都是文档原文的子串', async () => {
    const res = await queryTrunk(makeDeps({ req: makeReq(), files: OK_FILES }), { requirementId: REQ_ID })
    if ('available' in res && res.available === false) throw new Error('不该降级')
    const sources = [REQUIREMENT_MD, ARCH_MD]
    for (const item of res.items) {
      expect(item.summary.length, item.key).toBeGreaterThan(0)
      expect(item.missing, item.key).toBeUndefined()
      for (const line of item.summary) {
        expect(sources.some(t => t.includes(line)), item.key + ' / ' + line).toBe(true)
      }
    }
  })

  it('为何做取「一句话」领句、解决什么取痛点表首列（同节但不同面，不是同一段抄两遍）', async () => {
    const res = await queryTrunk(makeDeps({ req: makeReq(), files: OK_FILES }), { requirementId: REQ_ID })
    if ('available' in res && res.available === false) throw new Error('不该降级')
    const why = itemOf(res.items, 'why')
    const problem = itemOf(res.items, 'problem')
    expect(why.summary[0]).toBe('**一句话**：把需求详情页改成工作汇报，主干常驻。')
    expect(problem.summary).toEqual(['打开一屏读不出现在怎么样', '数字不可得时显示 0'])
  })

  it('每条都给「点开原文」入口，path 指向来源文档；同一节在多份文档出现 → 合并并逐份保留路径', async () => {
    const second = ARCH_MD.replace('主线：只读聚合 + 读时抽取，前端不做遍历。', '主线（后端）：读时抽取落在 application/query。')
    const res = await queryTrunk(
      makeDeps({ req: makeReq(), files: { ...OK_FILES, [SECOND_DESIGN_DOC]: second } }),
      { requirementId: REQ_ID },
    )
    if ('available' in res && res.available === false) throw new Error('不该降级')
    const approach = itemOf(res.items, 'approach')
    expect(approach.openRefs.map(r => r.path)).toEqual([ARCH_DOC, SECOND_DESIGN_DOC])
    expect(approach.summary).toContain('主线（后端）：读时抽取落在 application/query。')
    expect(itemOf(res.items, 'why').openRefs[0]?.path).toBe(REQ_DOC)
  })

  it('文档最后更新时间取文档 mtime（页面要标「读到的是哪一版」）', async () => {
    const res = await queryTrunk(
      makeDeps({ req: makeReq(), files: OK_FILES, mtimes: { [REQ_DOC]: 111, [ARCH_DOC]: 222 } }),
      { requirementId: REQ_ID },
    )
    if ('available' in res && res.available === false) throw new Error('不该降级')
    expect(res.docLastUpdated).toBe(222)
  })
})

/* ── ③ 反例：绝不回退用需求描述填充 ───────────────────────────────────────── */

describe('③ 反例：req.description 非空但文档缺节 → 不许回退填充', () => {
  it('缺节标本下产出里不含台账描述文本', async () => {
    const res = await queryTrunk(makeDeps({ req: makeReq({ description: DESCRIPTION }), files: MISSING_FILES }), { requirementId: REQ_ID })
    if ('available' in res && res.available === false) throw new Error('不该降级')
    expect(JSON.stringify(res)).not.toContain(DESCRIPTION)
    expect(JSON.stringify(res)).not.toContain('这段文字只存在于台账')
  })

  it('结构性保证：assembleTrunk 的入参里根本没有 description 这条通道', () => {
    const withDescription = assembleTrunk({
      requirementId: REQ_ID,
      docs: { requirementPath: REQ_DOC, requirementText: EMPTY_REQUIREMENT_MD, designDir: DESIGN_DIR, designDocs: [] },
      ledger: { comments: [], tasks: [] },
    })
    expect(JSON.stringify(withDescription)).not.toContain(DESCRIPTION)
    expect(withDescription.items).toHaveLength(7)
  })
})

/* ── decision：设计节 + 人工门往返留痕 ───────────────────────────────────── */

describe('decision：设计文档节 + 人工门往返留痕（措辞取原文）', () => {
  it('设计节命中 → 取节原文，来源标 doc + new-section', async () => {
    const res = await queryTrunk(makeDeps({ req: makeReq(), files: OK_FILES }), { requirementId: REQ_ID })
    if ('available' in res && res.available === false) throw new Error('不该降级')
    const decision = itemOf(res.items, 'decision')
    expect(decision.summary).toContain('| 不回退需求描述 | 否则缺节不可见 |')
    expect(decision.source).toEqual(['doc', 'new-section'])
    expect(decision.openRefs.some(r => r.label.includes('人工门往返留痕'))).toBe(true)
  })

  it('设计缺节但留痕命中 → 命中留痕即有内容（missing 不置位），措辞取台账原文', async () => {
    const files = { [REQ_DOC]: REQUIREMENT_MD, [ARCH_DOC]: ['# d', '', '## 架构', '', '主线：只读聚合。', ''].join('\n') }
    const comment = { body: '[确认弹框] 用户未确认（选择：需要修改）——节点未推进。问题：取舍写清了吗。用户意见：把「不回退描述」写进决策' }
    const req = makeReq({
      plan: {
        path: 'docs/requirements/' + REQ_ID + '/decomposition.md',
        summary: '目标：把主干七条抽出来。',
        tasks: [],
        submittedAt: 1,
        submittedBy: { kind: 'human' },
        rejectedReason: '理由不充分：为什么不做缓存要写进取舍',
      },
    })
    const res = await queryTrunk(makeDeps({ req, files, comments: [comment] }), { requirementId: REQ_ID })
    if ('available' in res && res.available === false) throw new Error('不该降级')
    const decision = itemOf(res.items, 'decision')
    expect(decision.missing).toBeUndefined()
    expect(decision.source).toEqual(['ledger', 'human', 'new-section'])
    expect(decision.summary[0]).toBe('理由不充分：为什么不做缓存要写进取舍')
    expect(decision.summary).toContain(comment.body)
  })

  it('设计节与留痕都有 → 合并（FR-2 明写「含人的退回理由」，只取文档就把人的决定丢了）', async () => {
    const comment = { body: '[回退] implementing → design：取舍没写清，退回重写' }
    const res = await queryTrunk(makeDeps({ req: makeReq(), files: OK_FILES, comments: [comment] }), { requirementId: REQ_ID })
    if ('available' in res && res.available === false) throw new Error('不该降级')
    const decision = itemOf(res.items, 'decision')
    expect(decision.summary).toContain('| 不回退需求描述 | 否则缺节不可见 |')
    expect(decision.summary).toContain(comment.body)
    expect(decision.source).toEqual(['doc', 'ledger', 'human', 'new-section'])
    expect(decision.missing).toBeUndefined()
  })

  it('gateTraces 只认人工门标记：agent 的过程叙述不算「人的决定」', () => {
    expect(gateTraces({
      comments: [
        { body: '[状态] → in_progress：开工（reqboard_task_move）' },
        { body: '[回退] implementing → design' },
        { body: '我决定不做缓存（agent 过程叙述）' },
      ],
      tasks: [],
    })).toEqual(['[回退] implementing → design'])
  })

  it('两处都没有 → 空态 + 说辞（missing 置位、summary 空、openRefs 指出去哪补写/去哪看）', async () => {
    const res = await queryTrunk(
      makeDeps({ req: makeReq(), files: MISSING_FILES }),
      { requirementId: REQ_ID },
    )
    if ('available' in res && res.available === false) throw new Error('不该降级')
    const decision = itemOf(res.items, 'decision')
    expect(decision.summary).toEqual([])
    expect(decision.missing).toBe('doc-section-missing')
    expect(decision.openRefs.map(r => r.label).join(' / ')).toContain('关键决策与取舍')
    expect(decision.openRefs.map(r => r.label).join(' / ')).toContain('人工门往返留痕')
  })
})

/* ── highlight：自动事实 / 人写条目（evidence 空即空）/ 成果清单 ─────────── */

describe('highlight：a 类自动事实 + b 类人写（evidence 为空原样返回）+ 成果清单', () => {
  const TASKS = [
    { id: 't-1', requirementRefs: ['FR-1', 'FR-2'], lastReport: { filesChanged: ['src/a.ts', 'tests/a.test.ts', 'src/a.ts'], completed: ['x'] } },
    { id: 't-2', requirementRefs: ['FR-2'], lastReport: { filesChanged: ['src/b.ts', 'docs/x.md'], completed: [] } },
    { id: 't-3' },
  ]

  it('事实全部可计算：改动规模去重计数、新增测试文件数、FR 覆盖度', async () => {
    const res = await queryTrunk(makeDeps({ req: makeReq(), files: OK_FILES, tasks: TASKS }), { requirementId: REQ_ID })
    if ('available' in res && res.available === false) throw new Error('不该降级')
    const facts = itemOf(res.items, 'highlight').facts ?? []
    expect(facts.map(f => f.label)).toEqual(['改动规模', '新增测试文件', 'FR 覆盖度'])
    expect(facts[0]?.value).toBe('4 个文件（去重）')
    expect(facts[0]?.evidence).toEqual(['docs/x.md', 'src/a.ts', 'src/b.ts', 'tests/a.test.ts'])
    expect(facts[1]?.value).toBe('1 个')
    expect(facts[1]?.evidence).toEqual(['tests/a.test.ts'])
    // 需求文档里定义了 FR-1/2/3，任务只引用了 FR-1/2
    expect(facts[2]?.value).toBe('2/3 条')
    expect(facts[2]?.evidence).toEqual(['FR-1', 'FR-2'])
  })

  it('没有执行记录 → 自动事实与成果清单都不编（不是 0）', async () => {
    const res = await queryTrunk(makeDeps({ req: makeReq(), files: OK_FILES, tasks: [{ id: 't-9' }] }), { requirementId: REQ_ID })
    if ('available' in res && res.available === false) throw new Error('不该降级')
    const highlight = itemOf(res.items, 'highlight')
    expect(highlight.facts?.map(f => f.label)).toEqual(['FR 覆盖度'])
    expect(highlight.achievement).toEqual([])
  })

  it('人写条目：抽到差异/为什么/证据；缺证据的那条照实在，evidence 原样空数组', async () => {
    const res = await queryTrunk(makeDeps({ req: makeReq(), files: OK_FILES }), { requirementId: REQ_ID })
    if ('available' in res && res.available === false) throw new Error('不该降级')
    const highlights = itemOf(res.items, 'highlight').highlights ?? []
    expect(highlights).toHaveLength(2)
    expect(highlights[0]?.diff).toBe('差异：按写死节名抽取，不做模型判断')
    expect(highlights[0]?.why).toBe('抽错比抽不到更坏（抽错会伪装成有内容）')
    expect(highlights[0]?.evidence).toEqual(['src/application/query/QueryTrunk.ts', 'tests/query-trunk.test.ts'])
    expect(highlights[1]?.evidence).toEqual([])
    expect(itemOf(res.items, 'highlight').source).toEqual(['doc', 'auto'])
  })

  it('成果清单由改动文件清单汇总（去重排序）', async () => {
    const res = await queryTrunk(makeDeps({ req: makeReq(), files: OK_FILES, tasks: TASKS }), { requirementId: REQ_ID })
    if ('available' in res && res.available === false) throw new Error('不该降级')
    expect(itemOf(res.items, 'highlight').achievement).toEqual(['docs/x.md', 'src/a.ts', 'src/b.ts', 'tests/a.test.ts'])
  })

  it('人写节整节缺失 → highlight 置 missing，但自动事实仍然出（缺的是人写，不是数据）', async () => {
    const files = { [REQ_DOC]: REQUIREMENT_MD, [ARCH_DOC]: ['# d', '', '## 架构', '', '主线：只读聚合。', ''].join('\n') }
    const res = await queryTrunk(
      makeDeps({ req: makeReq(), files, tasks: [{ id: 't-1', lastReport: { filesChanged: ['src/a.ts'], completed: [] } }] }),
      { requirementId: REQ_ID },
    )
    if ('available' in res && res.available === false) throw new Error('不该降级')
    const highlight = itemOf(res.items, 'highlight')
    expect(highlight.missing).toBe('doc-section-missing')
    expect(highlight.summary).toEqual([])
    expect(highlight.facts?.map(f => f.label)).toEqual(['改动规模', '新增测试文件', 'FR 覆盖度'])
    // 该卡没声明 requirementRefs → 覆盖度是算出来的 0/3（这是"确实没覆盖"，不是"不可得"）
    expect(highlight.facts?.[2]?.value).toBe('0/3 条')
    expect(highlight.achievement).toEqual(['src/a.ts'])
  })
})

/* ── tech / approach 的多来源合并与台账摘要 ───────────────────────────────── */

describe('tech / approach：设计两节合并 + 计划摘要（台账原文）', () => {
  it('tech = §技术方案与亮点 + §架构（两处都来）', async () => {
    const res = await queryTrunk(makeDeps({ req: makeReq(), files: OK_FILES }), { requirementId: REQ_ID })
    if ('available' in res && res.available === false) throw new Error('不该降级')
    const tech = itemOf(res.items, 'tech')
    expect(tech.summary[0]).toBe('- 差异：按写死节名抽取，不做模型判断')
    expect(tech.source).toEqual(['doc', 'new-section'])
  })

  it('设计缺「架构」但台账有 plan.summary → approach 有内容（来源标 ledger）', async () => {
    const files = { [REQ_DOC]: REQUIREMENT_MD, [ARCH_DOC]: EMPTY_DESIGN_MD }
    const req = makeReq({
      plan: {
        path: 'docs/requirements/' + REQ_ID + '/decomposition.md',
        summary: '目标：主干七条读时抽取，不落库。',
        tasks: [],
        submittedAt: 1,
        submittedBy: { kind: 'human' },
      },
    })
    const res = await queryTrunk(makeDeps({ req, files }), { requirementId: REQ_ID })
    if ('available' in res && res.available === false) throw new Error('不该降级')
    const approach = itemOf(res.items, 'approach')
    expect(approach.summary).toEqual(['目标：主干七条读时抽取，不落库。'])
    expect(approach.source).toEqual(['ledger'])
    expect(approach.openRefs.some(r => r.path?.endsWith('decomposition.md'))).toBe(true)
  })
})

/* ── 降级：台账不可读 ─────────────────────────────────────────────────────── */

describe('降级：台账读不到 → Degrade（不是 500，也不是空数组）', () => {
  it('需求不在册 → available:false + ledger-unreadable', async () => {
    const res = await queryTrunk(makeDeps({ req: undefined }), { requirementId: REQ_ID })
    expect(res.available).toBe(false)
    if (!('reason' in res)) throw new Error('应为 Degrade')
    expect(res.reason).toBe('ledger-unreadable')
    expect(res.note).toContain(REQ_ID)
  })

  it('store.get 抛错 → 同样走 Degrade，并把原始消息带进 note', async () => {
    const res = await queryTrunk(makeDeps({ getThrows: '磁盘坏了' }), { requirementId: REQ_ID })
    expect(res.available).toBe(false)
    if (!('reason' in res)) throw new Error('应为 Degrade')
    expect(res.note).toContain('磁盘坏了')
  })
})

/**
 * 节名别名表（真实文档验出来的缺口，主窗口收尾时补）。
 *
 * 缺口长这样：设计文档里写的节名是「架构」，而**本仓设计模板里那一节的标题是「目标与总体方案」**
 * → 只认「架构」时，「实现思路」对任何真实文档都抽不到设计侧内容，只能回退计划摘要。
 * 这种缺失不报错、不显眼，属于最坏的一种静默，故用别名表固定住。
 */
describe('节名别名：架构 ≡ 目标与总体方案', () => {
  it('设计文档用模板真实标题时，抽「架构」也能命中', () => {
    const doc = [
      '# 架构文档（REQ-test）',
      '',
      '## 目标与总体方案 `serves: FR-1`',
      '',
      '方案主线：先说结论。',
      '',
      '## 模块改动地图 `serves: FR-1`',
      '',
      '无关内容。',
    ].join('\n')
    const s = extractSection(doc, '架构')
    expect(s).toContain('方案主线')
  })

  it('别名不放宽判据：仍不许"包含"式误命中，H1 仍只认全等', () => {
    const doc = ['', '## 模块改动地图 `serves: FR-1`', '', 'x'].join('\n')
    expect(extractSection(doc, '架构')).toBeUndefined()
    // H1（文档标题）仍只认"规范化后全等"：带括号后缀算等价，带额外词的不算命中
    expect(extractSection('# 目标与总体方案详解\n\n正文', '架构')).toBeUndefined()
  })

  it('没有别名时行为逐字不变：边界/产品定义等仍按原判据', () => {
    expect(extractSection('## 边界（不做什么）\n\n不做 A。', '边界')).toContain('不做 A')
    expect(extractSection('## 别的节\n\nx', '边界')).toBeUndefined()
  })
})
