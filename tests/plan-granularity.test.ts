/**
 * 粒度门禁测试（REQ-261007125552-32cb）。
 *
 * 覆盖：FR-1 清单节门 / FR-2 对照表门 / FR-4 接口数门（词法 + 豁免）/ FR-5 形态软门。
 * 本文件按卡逐步生长：t1 落词法与软门纯函数用例，t2 落豁免字段透传，t3/t4 落门禁集成，t6 收口。
 */
import { describe, expect, it } from 'vitest'
import { countInterfaceDeclarations, granularityWarningsOf } from '../src/domain/task/Granularity.js'
import { LIMITS } from '../src/domain/limits.js'
import { normalizePlanTasks } from '../src/shared/protocol.js'

describe('countInterfaceDeclarations 词法（TC-7）', () => {
  it('识别 HTTP 路由声明（大写动词 + 路径）', () => {
    expect(countInterfaceDeclarations('新增 `POST /api/login` 与 `GET /api/me` 两个接口')).toEqual([
      'GET /api/me',
      'POST /api/login',
    ])
  })

  it('同一声明重复出现（正文+示例）去重后计 1', () => {
    const text = '实现 POST /api/a。示例：POST /api/a 返回 200。'
    expect(countInterfaceDeclarations(text)).toEqual(['POST /api/a'])
  })

  it('小写动词不计（散文里的 post 不是声明）', () => {
    expect(countInterfaceDeclarations('然后 post /api/a 一下试试')).toEqual([])
  })

  it('裸动词（无路径）不计', () => {
    expect(countInterfaceDeclarations('这里会 POST 一下，再 GET 一把')).toEqual([])
  })

  it('散文里的「接口」「API」字样不计', () => {
    expect(countInterfaceDeclarations('本卡改两个接口的内部实现，不动 API 形态')).toEqual([])
  })

  it('识别工具定义声明（tool: / 工具：，半角全角冒号都认）', () => {
    expect(countInterfaceDeclarations('新增 tool: reqboard_foo；另注册 工具：reqboard_bar')).toEqual([
      'tool: reqboard_bar',
      'tool: reqboard_foo',
    ])
  })

  it('HTTP 与工具声明混合时合并去重', () => {
    expect(countInterfaceDeclarations('POST /api/x 调 tool: alpha，还是 POST /api/x')).toEqual([
      'POST /api/x',
      'tool: alpha',
    ])
  })
})

describe('granularityWarningsOf 形态软门（TC-8 纯函数部分）', () => {  it('footprint.files 超阈值 → 点名警告（阈值跟随 LIMITS 单一源）', () => {
    const warnings = granularityWarningsOf({
      key: 't1',
      footprint: { files: LIMITS.footprintFilesSoftMax + 1 },
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('t1')
    expect(warnings[0]).toContain(String(LIMITS.footprintFilesSoftMax))
  })

  it('恰好等于阈值不算超（严格大于才超）', () => {
    expect(
      granularityWarningsOf({ key: 't1', footprint: { files: LIMITS.footprintFilesSoftMax } }),
    ).toEqual([])
  })

  it('未声明 footprint 不判第一维（未声明 ≠ 0）', () => {
    expect(granularityWarningsOf({ key: 't1' })).toEqual([])
  })

  it('UI 卡一卡多锚点 → 警告；非 UI 卡不判', () => {
    expect(
      granularityWarningsOf({ key: 'u1', side: 'frontend', prototypeRefs: ['p#a', 'p#b'] }),
    ).toHaveLength(1)
    expect(
      granularityWarningsOf({ key: 'b1', side: 'backend', prototypeRefs: ['p#a', 'p#b'] }),
    ).toEqual([])
  })
})

describe('豁免字段透传：normalizePlanTasks 透传 granularity_exempt（TC-6 字段部分 / t2）', () => {
  const base = { key: 't1', title: 'x', implementation: '改 a.ts', acceptance: 'npx vitest run x 全绿' }

  it('snake 拼法透传保留', () => {
    const [t] = normalizePlanTasks([{ ...base, granularity_exempt: '契约卡：一次定 3 个接口契约' }])
    expect(t?.granularity_exempt).toBe('契约卡：一次定 3 个接口契约')
  })

  it('camel 拼法兼容透传', () => {
    const [t] = normalizePlanTasks([{ ...base, granularityExempt: '聚合组装卡' }])
    expect(t?.granularity_exempt).toBe('聚合组装卡')
  })

  it('超 300 字符截断', () => {
    const [t] = normalizePlanTasks([{ ...base, granularity_exempt: '长'.repeat(400) }])
    expect(t?.granularity_exempt).toHaveLength(300)
  })

  it('空串 / 未填 = 键不出现（不冒充豁免）', () => {
    const [a] = normalizePlanTasks([{ ...base, granularity_exempt: '' }])
    const [b] = normalizePlanTasks([{ ...base }])
    expect(a && 'granularity_exempt' in a).toBe(false)
    expect(b && 'granularity_exempt' in b).toBe(false)
  })
})

// ── FR-1：清单节门（checkDesignContentGate 聚合新维）──────────────────────────
import { checkDesignContentGate } from '../src/application/internal/content-gate-wiring.js'
import { DOC_QUALITY_RULES_SINCE } from '../src/domain/workflow/DocQualityRules.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

/** 最小 in-memory DocsReader：exists/read/list 三件套（与本仓门禁取数口径一致）。 */
const fakeDocs = (files: Record<string, string>) => ({
  exists: (p: string) => p in files,
  read: async (p: string) => files[p] ?? '',
  list: (dir: string) =>
    Object.keys(files)
      .filter(f => f.startsWith(dir + '/'))
      .map(f => ({ name: f.slice(dir.length + 1), isFile: true as const })),
})

const REQ_ID = 'REQ-granularity-test'
const REQ_DOC = [
  '---',
  'sides: [backend]',
  '---',
  '# 需求',
  '',
  '### FR-1: 甲',
  'x',
].join('\n')
/** 设计文档最小合法形态（文档级 serves + H2 带 serves——隔离掉既有维度，只让新维发声）。 */
const designDoc = (h2: string, body: string) =>
  ['---', 'serves: FR-1', '---', '# 设计', '', h2, body].join('\n')

const reqRecord = (createdAt: number | undefined) =>
  ({ id: REQ_ID, category: 'feature', createdAt, artifacts: [{ kind: 'requirement' }] }) as unknown as RequirementRecord

const filesOf = (interfacesMd: string, extra: Record<string, string> = {}) => ({
  [`docs/requirements/${REQ_ID}/requirement.md`]: REQ_DOC,
  [`docs/requirements/${REQ_ID}/design/interfaces.md`]: interfacesMd,
  ...extra,
})

describe('清单节门：feature 设计文档必备接口清单节（TC-1）', () => {
  const NEW = DOC_QUALITY_RULES_SINCE + 1000

  it('interfaces.md 缺「接口清单」节 → 拒，聚合法点名', async () => {
    const failure = await checkDesignContentGate(
      fakeDocs(filesOf(designDoc('## 新增接口 `serves: FR-1`', '散文提到了接口但没有清单表'))),
      reqRecord(NEW),
    )
    expect(failure?.code).toBe('REQBOARD_DESIGN_CONTENT_GATE')
    expect(failure?.message).toContain('interfaces.md')
    expect(failure?.message).toContain('接口清单')
    expect(failure?.message).toContain('templates/design/interfaces.md')
  })

  it('有「接口清单」节但没有机器可扫的清单表 → 拒（散文列举不算）', async () => {
    const failure = await checkDesignContentGate(
      fakeDocs(filesOf(designDoc('## 接口清单 `serves: FR-1`', 'IF-1 登录接口、IF-2 刷新接口（散文）'))),
      reqRecord(NEW),
    )
    expect(failure?.code).toBe('REQBOARD_DESIGN_CONTENT_GATE')
    expect(failure?.message).toContain('接口 id')
  })

  it('清单节 + 接口表（表头含「接口 id」）→ 放行', async () => {
    const ok = await checkDesignContentGate(
      fakeDocs(filesOf(designDoc('## 接口清单 `serves: FR-1`', '| 接口 id | 形态 | 职责 | serves |\n|---|---|---|---|\n| IF-1 | POST /api/login | 登录 | FR-1 |'))),
      reqRecord(NEW),
    )
    expect(ok).toBeUndefined()
  })

  it('「不适用：」豁免行 → 放行（保留节能被机械判定）', async () => {
    const ok = await checkDesignContentGate(
      fakeDocs(filesOf(designDoc('## 接口清单 `serves: FR-1`', '不适用：纯内部重构，无对外接口面。'))),
      reqRecord(NEW),
    )
    expect(ok).toBeUndefined()
  })

  it('front-matter design_exempt 豁免 interfaces.md → 放行', async () => {
    const files = filesOf(designDoc('## 新增接口 `serves: FR-1`', 'x'))
    files[`docs/requirements/${REQ_ID}/requirement.md`] = REQ_DOC.replace(
      'sides: [backend]',
      'sides: [backend]\ndesign_exempt: interfaces.md=纯文档需求无接口面',
    )
    const ok = await checkDesignContentGate(fakeDocs(files), reqRecord(NEW))
    expect(ok).toBeUndefined()
  })

  it('sides 含 frontend 时 frontend.md 缺「组件树」节 → 拒并点名', async () => {
    const files = filesOf(
      designDoc('## 接口清单 `serves: FR-1`', '| 接口 id | 形态 | 职责 | serves |\n|---|---|---|---|\n| IF-1 | POST /api/x | x | FR-1 |'),
      { [`docs/requirements/${REQ_ID}/design/frontend.md`]: designDoc('## 页面 `serves: FR-1`', '一整页直接做。') },
    )
    files[`docs/requirements/${REQ_ID}/requirement.md`] = REQ_DOC.replace('sides: [backend]', 'sides: [frontend, backend]')
    const failure = await checkDesignContentGate(fakeDocs(files), reqRecord(NEW))
    expect(failure?.code).toBe('REQBOARD_DESIGN_CONTENT_GATE')
    expect(failure?.message).toContain('frontend.md')
    expect(failure?.message).toContain('组件树')
  })
})

describe('清单节门存量豁免：规则起点前立项的需求不追溯（TC-2）', () => {
  it('createdAt 早于起点 → 缺清单节也放行', async () => {
    const ok = await checkDesignContentGate(
      fakeDocs(filesOf(designDoc('## 新增接口 `serves: FR-1`', 'x'))),
      reqRecord(DOC_QUALITY_RULES_SINCE - 1),
    )
    expect(ok).toBeUndefined()
  })

  it('createdAt 不可得（旧台账/夹具）→ 不判', async () => {
    const ok = await checkDesignContentGate(
      fakeDocs(filesOf(designDoc('## 新增接口 `serves: FR-1`', 'x'))),
      reqRecord(undefined),
    )
    expect(ok).toBeUndefined()
  })

  it('非 feature 类型不判（bug 没有接口清单义务）', async () => {
    const bugReq = { ...reqRecord(DOC_QUALITY_RULES_SINCE + 1000), category: 'bug' } as RequirementRecord
    const ok = await checkDesignContentGate(
      fakeDocs(filesOf(designDoc('## 修复方案 `serves: FR-1`', 'x'))),
      bugReq,
    )
    expect(ok).toBeUndefined()
  })
})

// ── FR-2 / FR-4 / FR-5：assertGranularityGates 判定单点（unit 级，fakeDocs）──────
import { assertGranularityGates } from '../src/application/internal/plan-granularity.js'

const NEW_REQ_TS = DOC_QUALITY_RULES_SINCE + 1000

const GR_REQ_MD = [
  '---', 'sides: [backend]', '---',
  '# 需求', '',
  '### FR-1: 甲', 'x',
].join('\n')

const GR_INTERFACES_MD = [
  '---', 'serves: FR-1', '---',
  '# 接口设计', '',
  '## 接口清单 `serves: FR-1`', '',
  '| 接口 id | 形态 | 职责 | serves |',
  '|---|---|---|---|',
  '| IF-1 | POST /api/a | 甲接口 | FR-1 |',
  '| IF-2 | POST /api/b | 乙接口 | FR-1 |',
].join('\n')

/** 计划文档：任务表（计划 key 列）+ 对照表（接口 | 接收卡 key）。mapRows 可控缺行/悬空。 */
const grPlanDoc = (taskKeys: string[], mapRows: string[]) => [
  '# 拆分计划', '',
  '## 任务表', '',
  '| 计划 key | 任务 | 验收 | 工作量 | 依赖 |',
  '|---|---|---|---|---|',
  ...taskKeys.map(k => '| ' + k + ' | 任务' + k + ' | 跑测试 | S | — |'),
  '',
  '## 接口清单 ↔ 卡 key（对照表）', '',
  '| 接口 | 接收卡 key |',
  '|---|---|',
  ...mapRows,
].join('\n')

const grReq = () => reqRecord(NEW_REQ_TS)

const grDocs = (opts: { interfacesMd?: string; planMd?: string }) => {
  const files: Record<string, string> = { [`docs/requirements/${REQ_ID}/requirement.md`]: GR_REQ_MD }
  if (opts.interfacesMd !== undefined) files[`docs/requirements/${REQ_ID}/design/interfaces.md`] = opts.interfacesMd
  if (opts.planMd !== undefined) files[`docs/requirements/${REQ_ID}/decomposition.md`] = opts.planMd
  return fakeDocs(files)
}

const PLAN_PATH = `docs/requirements/${REQ_ID}/decomposition.md`
const twoCards = [
  { key: 't1', title: '实现甲接口', implementation: '改 src/a.ts', acceptance: 'npx vitest run a 全绿', requirement_refs: ['FR-1'] },
  { key: 't2', title: '实现乙接口', implementation: '改 src/b.ts', acceptance: 'npx vitest run b 全绿', requirement_refs: ['FR-1'] },
]

describe('对照表门（TC-3）', () => {
  it('清单条目无对照行 → 拒 plan_interface_map_missing，点名 IF-2', async () => {
    const report = await assertGranularityGates(
      grDocs({ interfacesMd: GR_INTERFACES_MD, planMd: grPlanDoc(['t1', 't2'], ['| IF-1 | t1 |']) }),
      grReq(), twoCards, PLAN_PATH,
    )
    expect(report.failure?.code).toBe('plan_interface_map_missing')
    expect(report.failure?.message).toContain('IF-2')
    expect(report.failure?.message).toContain('没有卡接收')
  })

  it('对照行指向任务表外的 key → 拒，点名悬空 key', async () => {
    const report = await assertGranularityGates(
      grDocs({ interfacesMd: GR_INTERFACES_MD, planMd: grPlanDoc(['t1', 't2'], ['| IF-1 | t1 |', '| IF-2 | t9 |']) }),
      grReq(), twoCards, PLAN_PATH,
    )
    expect(report.failure?.code).toBe('plan_interface_map_missing')
    expect(report.failure?.message).toContain('t9')
  })

  it('对照表整段缺失 → 拒并给出表头形态指引（含词法避让提醒）', async () => {
    const planNoMap = grPlanDoc(['t1', 't2'], []).replace('## 接口清单 ↔ 卡 key（对照表）', '## 其它').replace('| 接口 | 接收卡 key |', '| x | y |')
    const report = await assertGranularityGates(
      grDocs({ interfacesMd: GR_INTERFACES_MD, planMd: planNoMap }),
      grReq(), twoCards, PLAN_PATH,
    )
    expect(report.failure?.code).toBe('plan_interface_map_missing')
    expect(report.failure?.message).toContain('接收卡 key')
  })

  it('清单全覆盖（一对多合法）→ 放行', async () => {
    const report = await assertGranularityGates(
      grDocs({ interfacesMd: GR_INTERFACES_MD, planMd: grPlanDoc(['t1', 't2'], ['| IF-1 | t1, t2 |', '| IF-2 | t2 |']) }),
      grReq(), twoCards, PLAN_PATH,
    )
    expect(report.failure).toBeUndefined()
  })
})

describe('对照表门降级（TC-4）', () => {
  it('设计无接口清单节 → 降级 warn（带原因），不拒', async () => {
    const noList = GR_INTERFACES_MD.replace('## 接口清单 `serves: FR-1`', '## 新增接口 `serves: FR-1`').replace('| 接口 id | 形态 | 职责 | serves |', '| 说明 |').replace('| IF-1 | POST /api/a | 甲接口 | FR-1 |', '| 散文 |').replace('| IF-2 | POST /api/b | 乙接口 | FR-1 |', '')
    const report = await assertGranularityGates(
      grDocs({ interfacesMd: noList, planMd: grPlanDoc(['t1', 't2'], []) }),
      grReq(), twoCards, PLAN_PATH,
    )
    expect(report.failure).toBeUndefined()
    expect(report.warnings.join('\n')).toContain('降级')
  })

  it('存量需求（createdAt 早于起点）→ 整门跳过（不追溯）', async () => {
    const old = reqRecord(DOC_QUALITY_RULES_SINCE - 1)
    const report = await assertGranularityGates(
      grDocs({ interfacesMd: GR_INTERFACES_MD, planMd: grPlanDoc(['t1', 't2'], []) }),
      old, twoCards, PLAN_PATH,
    )
    expect(report.failure).toBeUndefined()
    expect(report.warnings).toEqual([])
  })

  it('计划文档读不到 → 降级 warn（不把 IO 故障伪装成违规）', async () => {
    const report = await assertGranularityGates(
      grDocs({ interfacesMd: GR_INTERFACES_MD }),
      grReq(), twoCards, PLAN_PATH,
    )
    expect(report.failure).toBeUndefined()
    expect(report.warnings.join('\n')).toContain('读不到')
  })
})

describe('接口数门（TC-5）', () => {
  it('一卡声明 2 个接口 → 拒 plan_card_multi_interface，点名卡与接口清单', async () => {
    const fat = [{ key: 't1', title: '登录全做', implementation: '新增 POST /api/login 与 GET /api/me', acceptance: 'npx vitest run x 全绿' }]
    const report = await assertGranularityGates(grDocs({}), grReq(), fat, PLAN_PATH)
    expect(report.failure?.code).toBe('plan_card_multi_interface')
    expect(report.failure?.message).toContain('t1')
    expect(report.failure?.message).toContain('POST /api/login')
    expect(report.failure?.message).toContain('GET /api/me')
    expect(report.failure?.message).toContain('granularity_exempt')
  })

  it('单接口卡 → 过；散文提「接口」不误判', async () => {
    const ok = [
      { key: 't1', title: '实现登录', implementation: '新增 POST /api/login，改 src/auth.ts', acceptance: 'npx vitest run x 全绿' },
      { key: 't2', title: '散文卡', implementation: '这里涉及两个接口的内部联动，但不新增声明', acceptance: 'npx vitest run y 全绿' },
    ]
    const report = await assertGranularityGates(grDocs({}), grReq(), ok, PLAN_PATH)
    expect(report.failure).toBeUndefined()
  })
})

describe('接口数门豁免（TC-6 门禁部分）', () => {
  const fat = [{ key: 't0', title: '契约卡', implementation: '定 POST /api/login 与 GET /api/me 的契约', acceptance: 'npx vitest run x 全绿' }]

  it('granularity_exempt 有理由 → 放行，理由进 warnings（豁免不静默）', async () => {
    const report = await assertGranularityGates(
      grDocs({}), grReq(),
      [{ ...fat[0], granularity_exempt: '契约卡：一次定两个接口的契约，实现另拆' }], PLAN_PATH,
    )
    expect(report.failure).toBeUndefined()
    expect(report.warnings.join('\n')).toContain('契约卡')
  })

  it('granularity_exempt 空串 → 仍拒（空串 ≠ 豁免）', async () => {
    const report = await assertGranularityGates(
      grDocs({}), grReq(), [{ ...fat[0], granularity_exempt: '' }], PLAN_PATH,
    )
    expect(report.failure?.code).toBe('plan_card_multi_interface')
  })
})

describe('形态软门经门禁出口（TC-8 集成部分）', () => {
  it('files 超阈值 + UI 卡多锚点 → 只警告不拒', async () => {
    const cards = [
      { key: 't1', title: '宽卡', implementation: '改 a.ts', acceptance: 'npx vitest run a 全绿', footprint: { files: 6, anchors: 2, chars: 100 } },
      { key: 'u1', title: 'UI 卡', implementation: '改 b.tsx', acceptance: '打开页面看到组件', side: 'frontend', prototypeRefs: ['p.html#FR-1', 'p.html#FR-2'] },
    ]
    const report = await assertGranularityGates(grDocs({}), grReq(), cards, PLAN_PATH)
    expect(report.failure).toBeUndefined()
    const w = report.warnings.join('\n')
    expect(w).toContain('t1')
    expect(w).toContain('文件面过宽')
    expect(w).toContain('u1')
    expect(w).toContain('一卡多锚点')
  })
})

// ── TC-10：三条入口同一判定单点（集成级，真实用例 + harness）────────────────────
import { makeHarness, req as mkReq } from './application/harness.js'
import { submitPlanArtifact } from '../src/application/use-cases/SubmitArtifact.js'
import { executeDecompose } from '../src/application/use-cases/Decompose.js'
import { landApprovedPlan } from '../src/application/internal/approved-plan-landing.js'

const E2E_REQ = 'REQ-261007000000-aaaa'
const E2E_WIN = 'session-gran-e2e'

/** 三入口共用夹具：清单 IF-1/IF-2，对照表只接 IF-1 → 三个入口都必须报 plan_interface_map_missing 点名 IF-2。 */
function seedE2E() {
  const h = makeHarness()
  const base = 'docs/requirements/' + E2E_REQ
  const tasks = [
    { key: 't1', title: '实现甲接口', implementation: '改 src/a.ts', acceptance: 'npx vitest run a 全绿', requirement_refs: ['FR-1'] },
    { key: 't2', title: '实现乙接口', implementation: '改 src/b.ts', acceptance: 'npx vitest run b 全绿', requirement_refs: ['FR-1'] },
  ]
  h.seedRequirementSync(mkReq({
    id: E2E_REQ,
    status: 'decomposing',
    category: 'feature',
    createdAt: NEW_REQ_TS,
    sourceSessionId: E2E_WIN,
    artifacts: [{ stage: 'decomposing', kind: 'decomposition', path: base + '/decomposition.md', registeredAt: 1, registeredBy: { kind: 'agent', sessionId: E2E_WIN } } as never],
    plan: {
      path: base + '/decomposition.md',
      summary: '接口级拆分',
      tasks: tasks as never,
      submittedAt: 1,
      submittedBy: { kind: 'agent', sessionId: E2E_WIN },
      approvedAt: 1,
      approvedBy: { kind: 'human', sessionId: E2E_WIN },
    },
  }))
  h.docs.put(base + '/requirement.md', ['---', 'sides: [backend]', '---', '# 需求', '', '## 边界', '不做范围外的事。', '', '## 产品定义', 'x', '', '## 用户与角色', 'x', '', '## 功能点', '', '### FR-1: 甲', 'x'].join('\n'))
  // 设计文档集（feature 五份 + backend 条件份）：每份至少一个带 serves 的 H2，隔离其他门
  const designDoc = (h2: string, body: string) => ['---', 'serves: FR-1', '---', '# 设计', '', h2 + ' `serves: FR-1`', body].join('\n')
  h.docs.put(base + '/design/architecture.md', designDoc('## 方案', 'x'))
  h.docs.put(base + '/design/data-model.md', designDoc('## 模型', 'x'))
  h.docs.put(base + '/design/interfaces.md', designDoc('## 接口清单', '| 接口 id | 形态 | 职责 | serves |\n|---|---|---|---|\n| IF-1 | POST /api/a | 甲 | FR-1 |\n| IF-2 | POST /api/b | 乙 | FR-1 |'))
  h.docs.put(base + '/design/test-cases.md', designDoc('## 用例', 'x'))
  h.docs.put(base + '/design/use-cases.md', designDoc('## 旅程', 'x'))
  h.docs.put(base + '/design/backend.md', designDoc('## 实现', 'x'))
  // 计划文档：任务表收齐两张卡 + 对照表只接 IF-1（IF-2 无落点）
  h.docs.put(base + '/decomposition.md', [
    '# 拆分计划', '',
    '## 任务表', '',
    '| 计划 key | 任务 | 验收 | 工作量 | 依赖 |',
    '|---|---|---|---|---|',
    '| t1 | 实现甲接口 | 跑测试 | S | — |',
    '| t2 | 实现乙接口 | 跑测试 | S | — |',
    '',
    '## 接口清单 ↔ 卡 key（对照表）', '',
    '| 接口 | 接收卡 key |',
    '|---|---|',
    '| IF-1 | t1 |',
  ].join('\n'))
  return { h, tasks }
}

const codeOfErr = (e: unknown) => (e as { code?: string })?.code

describe('三入口同款拦截（TC-10）', () => {
  it('submitPlanArtifact：对照表缺 IF-2 → plan_interface_map_missing 点名 IF-2', async () => {
    const { h, tasks } = seedE2E()
    await h.seedSettled()
    const err = await submitPlanArtifact(h.deps, {
      requirement_id: E2E_REQ, path: 'docs/requirements/' + E2E_REQ + '/decomposition.md',
      summary: '重交', tasks, change_note: '对齐对照表',
    }, { agent: { id: E2E_WIN } }).then(() => undefined, (e: unknown) => e)
    expect(codeOfErr(err)).toBe('plan_interface_map_missing')
    expect(String((err as Error).message)).toContain('IF-2')
  })

  it('executeDecompose：同一夹具 → 同码同点名', async () => {
    const { h } = seedE2E()
    await h.seedSettled()
    const err = await executeDecompose(h.deps, { requirement_id: E2E_REQ }, { agent: { id: E2E_WIN } })
      .then(() => undefined, (e: unknown) => e)
    expect(codeOfErr(err)).toBe('plan_interface_map_missing')
    expect(String((err as Error).message)).toContain('IF-2')
  })

  it('landApprovedPlan（看板批准直落）：同一夹具 → 同码同点名', async () => {
    const { h } = seedE2E()
    await h.seedSettled()
    const err = await landApprovedPlan(h.deps, {
      requirementId: E2E_REQ, windowKey: E2E_WIN, nowTs: 1, source: 'confirm',
    }).then(() => undefined, (e: unknown) => e)
    expect(codeOfErr(err)).toBe('plan_interface_map_missing')
    expect(String((err as Error).message)).toContain('IF-2')
  })
})

// ── 传输码映射（内部码 → REQBOARD_* 传输码，两侧各报各的码）────────────────────
import { transportCodeOf } from '../src/application/use-cases/MoveRequirement.js'

describe('粒度门禁传输码登记', () => {
  it('三个内部码都有显式传输码（不走「未知码原样透传」降级）', () => {
    expect(transportCodeOf('plan_interface_map_missing')).toBe('REQBOARD_PLAN_INTERFACE_MAP_MISSING')
    expect(transportCodeOf('plan_component_map_missing')).toBe('REQBOARD_PLAN_COMPONENT_MAP_MISSING')
    expect(transportCodeOf('plan_card_multi_interface')).toBe('REQBOARD_PLAN_CARD_MULTI_INTERFACE')
  })
})

// ── TC-11 / TC-12：提示词档与模板/探针同口径 ──────────────────────────────────
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repoFile = (p: string) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8')

describe('提示词档含粒度规则（TC-11）', () => {
  it('decomposing 档含接口级/组件级规则，design 档含清单节要求', () => {
    // 规则全文在 heavy 档（§3.5）；feature 类型档带压缩版（一接口一卡/组件级）。
    // light 档有 2500 字符硬预算（prompt-tiers 门禁）：实测 decomposing light 在 HEAD 即 2493，
    // 塞不下规则全文——预算纪律优先，light 由类型档一句话覆盖（预算出处见 t5 复核汇报）。
    expect(repoFile('src/domain/prompt/fragments/decomposing/heavy.md')).toContain('接口级')
    expect(repoFile('src/domain/prompt/fragments/decomposing/feature.md')).toContain('一接口一卡')
    expect(repoFile('src/domain/prompt/fragments/decomposing/feature.md')).toContain('组件级')
    expect(repoFile('src/domain/prompt/fragments/design/feature.md')).toContain('接口清单')
    expect(repoFile('src/domain/prompt/fragments/design/heavy/overrides.md')).toContain('组件树')
  })

  it('生成物与源一致（generated/fragments.ts 含新规则文本——不手改生成物的回归）', () => {
    expect(repoFile('src/domain/prompt/generated/fragments.ts')).toContain('接口级')
  })
})

describe('模板与探针同口径（TC-12）', () => {
  it('interfaces.md 模板含「接口清单」节与「接口 id」表头', () => {
    const t = repoFile('templates/design/interfaces.md')
    expect(t).toContain('接口清单')
    expect(t).toContain('接口 id')
  })

  it('frontend.md 模板含「组件树」节', () => {
    expect(repoFile('templates/design/frontend.md')).toContain('组件树')
  })

  it('decomposition 模板含两段对照表（接收卡 key 列）', () => {
    const t = repoFile('templates/decomposing/decomposition.md')
    expect(t).toContain('接口清单 ↔ 接收卡 key')
    expect(t).toContain('组件树 ↔ 接收卡 key')
  })

  it('探 probe 判据与门禁词法同源（接收卡 key / 接口 id / 组件树 / 接口清单）', () => {
    const probe = repoFile('scripts/template-gate-probe.mts')
    for (const lexeme of ['接收卡 key', '接口 id', '组件树', '接口清单']) {
      expect(probe).toContain(lexeme)
    }
    // 门禁侧词法（plan-granularity + content-gate-wiring）必须含同一套词表
    expect(repoFile('src/application/internal/plan-granularity.ts')).toContain('接收卡 key')
    expect(repoFile('src/application/internal/content-gate-wiring.ts')).toContain('接口清单')
  })
})

// ── TC-9 落库侧：接口级计划完整落库，卡上 refs 逐卡在位 ────────────────────────
describe('RTM 一对多落库（TC-9 落库侧）', () => {
  it('3 张接口卡同接 FR-1：新门禁放行、落库成功、卡上 requirementRefs 逐卡在位', async () => {
    const h = makeHarness()
    const base = 'docs/requirements/' + E2E_REQ
    const tasks = [1, 2, 3].map(i => ({
      key: 't' + String(i),
      title: '实现接口 ' + String(i),
      implementation: '新增 POST /api/if' + String(i) + '，改 src/if' + String(i) + '.ts',
      acceptance: 'npx vitest run tests/if' + String(i) + '.test.ts 全绿',
      requirement_refs: ['FR-1'],
    }))
    h.seedRequirementSync(mkReq({
      id: E2E_REQ,
      status: 'decomposing',
      category: 'feature',
      createdAt: NEW_REQ_TS,
      sourceSessionId: E2E_WIN,
      artifacts: [{ stage: 'decomposing', kind: 'decomposition', path: base + '/decomposition.md', registeredAt: 1, registeredBy: { kind: 'agent', sessionId: E2E_WIN } } as never],
      plan: {
        path: base + '/decomposition.md',
        summary: '接口级拆分',
        tasks: tasks as never,
        submittedAt: 1,
        submittedBy: { kind: 'agent', sessionId: E2E_WIN },
        approvedAt: 1,
        approvedBy: { kind: 'human', sessionId: E2E_WIN },
      },
    }))
    h.docs.put(base + '/requirement.md', ['---', 'sides: [backend]', '---', '# 需求', '', '### FR-1: 甲', 'x'].join('\n'))
    h.docs.put(base + '/design/interfaces.md', [
      '---', 'serves: FR-1', '---', '# 接口设计', '',
      '## 接口清单 `serves: FR-1`', '',
      '| 接口 id | 形态 | 职责 | serves |',
      '|---|---|---|---|',
      '| IF-1 | POST /api/if1 | 甲 | FR-1 |',
      '| IF-2 | POST /api/if2 | 乙 | FR-1 |',
      '| IF-3 | POST /api/if3 | 丙 | FR-1 |',
    ].join('\n'))
    h.docs.put(base + '/decomposition.md', [
      '# 拆分计划', '',
      '## 任务表', '',
      '| 计划 key | 任务 | 验收 | 工作量 | 依赖 |',
      '|---|---|---|---|---|',
      '| t1 | 实现接口 1 | 跑测试 | S | — |',
      '| t2 | 实现接口 2 | 跑测试 | S | — |',
      '| t3 | 实现接口 3 | 跑测试 | S | — |',
      '',
      '## 接口清单 ↔ 卡 key（对照表）', '',
      '| 接口 | 接收卡 key |',
      '|---|---|',
      '| IF-1 | t1 |',
      '| IF-2 | t2 |',
      '| IF-3 | t3 |',
    ].join('\n'))
    await h.seedSettled()

    const out = await executeDecompose(h.deps, { requirement_id: E2E_REQ }, { agent: { id: E2E_WIN } }) as {
      success: boolean; tasks_created: number; granularity_warnings?: string[]
    }
    expect(out.success).toBe(true)
    expect(out.tasks_created).toBe(3)
    // 卡上 refs 逐卡在位（一对多的每一张都挂着 FR-1，不是只有文档表有）
    const landed = await h.taskStore.listByRequirement(E2E_REQ)
    expect(landed).toHaveLength(3)
    for (const t of landed) {
      expect(t.requirementRefs).toEqual(['FR-1'])
    }
  })
})
