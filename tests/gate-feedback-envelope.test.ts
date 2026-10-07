/**
 * 拒绝信封三要素契约测试（REQ-260924213231-b1c4 T-5 · serves: FR-2）
 *
 * 零信任核对（design/architecture.md「闸门拒绝信封」§零信任核对）：对 I-9 枚举的每个 code
 * 真实触发闸门（不是直接调 envelope 造串），断言 message 同时含 ——（why 分隔）与
 * 补齐：（how 分隔），且 how 段命中可执行锚点（reqboard_* / templates/ / design_exempt）；
 * 同时锁 code 与 gaps 未因改文案而变化。
 *
 * I-9 覆盖的 code（12 个）：design_doc_incomplete、design_orphan、dangling_reference、
 * requirement_uncovered、requirement_missing_clauses、requirement_clause_sequence_gap、
 * requirement_clause_duplicates、REQBOARD_MISSING_REQUIRED_DOC、REQBOARD_ARTIFACT_NOT_OPENABLE、
 * REQBOARD_FILE_MISSING、design_contains_decomposition、REQBOARD_EVIDENCE_FAKE。
 *
 * REQ-261005105032-3b02（t-094e28）追加：新门 7 码的**锚点扩容**与**传输码映射表**
 * （门实现尚未落库，故锁的是正则、映射表与设计里的 how 模板；接线后由各门的真实触发用例接棒）。
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { envelope, GATE_HOW_ANCHOR } from '../src/application/internal/gate-feedback.js'
// REQ-261005105032-3b02 §10 #35：内部码 → 传输码的显式映射表（导出仅为用例可直接锁它）。
import { transportCodeOf } from '../src/application/use-cases/MoveRequirement.js'
import {
  checkDesignCompletenessGate,
  checkDesignDecompositionGate,
  assertArtifactOpenable,
} from '../src/application/internal/design-gates.js'
import {
  assertClauseCoverageGate,
  checkDesignServesGate,
  checkNumberChainGate,
  checkRequirementDocFormatGate,
} from '../src/application/internal/content-gate-wiring.js'
import { definePlanSubmitTool, defineAskConfirmTool } from './helpers/tool-deps.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const W = 'session-t5-env'
const REQID = 'REQ-t5e'
const RDIR = 'docs/requirements/' + REQID
const REQP = RDIR + '/requirement.md'
const DDIR = RDIR + '/design'
const DESIGN_ALL = ['architecture.md', 'data-model.md', 'interfaces.md', 'test-cases.md', 'use-cases.md']

const REQ_DOC = [
  '---', 'req: ' + REQID, '---', '', '# 需求', '',
  '## 边界', '不做范围外的事。', '',
  '## 产品定义', 'x', '',
  '## 用户与角色', 'x', '',
  '## 功能点', '',
  '### FR-1: 甲', 'x', '',
  '### FR-4: 丁', 'x', '',
  // 2026-10-06 加固：feature 必填节多一节（夹具代表齐活的需求文档）。
  '## 失败与并发路径', '- 判据：`npx vitest run tests/x.test.ts` 全绿。', '',
].join('\n')

const live = {
  id: REQID, category: 'feature',
  artifacts: [{ stage: 'brainstorming', kind: 'requirement', path: REQP, registeredAt: 1 }],
} as unknown as RequirementRecord

const art = (name: string, confirmed = true) => ({
  stage: 'design', kind: 'design', path: DDIR + '/' + name, registeredAt: 1,
  ...(confirmed ? { confirmedAt: 1 } : {}),
})

/** 设计文件全落盘的 files 视图。 */
function designFiles(): Record<string, string> {
  const o: Record<string, string> = {}
  for (const n of DESIGN_ALL) o[DDIR + '/' + n] = '# ' + n + '\n'
  return o
}

const fakeDocs = (files: Record<string, string>) => ({
  exists: (p: string) => Object.prototype.hasOwnProperty.call(files, p),
  read: async (p: string) => files[p] ?? '',
  list: (dir: string) => Object.keys(files)
    .filter(k => k.startsWith(dir + '/'))
    .map(k => ({ name: k.slice(dir.length + 1), isFile: true })),
})

interface GateLike { code: string; message: string; gaps?: string[] }

function must<T>(v: T | undefined, label: string): NonNullable<T> {
  if (v === undefined) throw new Error(label + '：闸门未触发（应被拒却放行）')
  return v as NonNullable<T>
}

async function thrown(fn: () => unknown): Promise<GateLike> {
  try {
    await fn()
  } catch (e) {
    const err = e as { code?: string; message: string }
    return { code: err.code ?? '(no-code)', message: err.message }
  }
  throw new Error('预期被拒，但调用成功了')
}

let dir: string
let store: ReturnType<typeof makeTestStore>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-envelope-'))
  store = makeTestStore()
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

async function seedReq(o: { id: string; status: string }): Promise<void> {
  const r = {
    id: o.id, title: '信封', description: '', category: 'feature', status: o.status,
    blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
  } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

const run = (tool: { execute: (a: unknown, e: unknown) => Promise<any> }, args: unknown) =>
  tool.execute(args, { agent: { id: W } })

describe('envelope 拼接契约（唯一入口）', () => {
  it('三要素按 <what> —— <why>。补齐：<how> 拼接，lead 可前置', () => {
    expect(envelope({ what: 'A.md', why: '缺章', how: '调 reqboard_submit' }))
      .toBe('A.md —— 缺章。补齐：调 reqboard_submit')
    expect(envelope({ lead: 'reqboard_move 未执行：', what: 'A.md', why: '缺章', how: '调 reqboard_submit' }))
      .toBe('reqboard_move 未执行：A.md —— 缺章。补齐：调 reqboard_submit')
  })
})

describe('TC-21 逐 code 三要素（真实触发闸门，不是拼串）', () => {
  it('I-9 的每个 code：含 —— 与 补齐：，且 how 命中可执行锚点', async () => {
    const cases: Array<{ label: string; code: string; produce: () => Promise<GateLike> }> = [
      {
        label: 'design_doc_incomplete（未登记）', code: 'design_doc_incomplete',
        produce: async () => must(await checkDesignCompletenessGate(
          fakeDocs({ [REQP]: REQ_DOC, ...designFiles() }) as never,
          { ...live, artifacts: DESIGN_ALL.slice(0, 4).map(n => art(n)) } as never,
        ), '未登记'),
      },
      {
        label: 'design_doc_incomplete（待确认）', code: 'design_doc_incomplete',
        produce: async () => must(await checkDesignCompletenessGate(
          fakeDocs({ [REQP]: REQ_DOC, ...designFiles() }) as never,
          { ...live, artifacts: DESIGN_ALL.map(n => art(n, n !== 'use-cases.md')) } as never,
        ), '待确认'),
      },
      {
        label: 'design_orphan', code: 'design_orphan',
        produce: async () => must(await checkDesignServesGate(
          fakeDocs({ [DDIR + '/architecture.md']: '# 架构\n\n## D-ARCH-1 有映射 serves: FR-1\n正文\n\n## D-ARCH-2 忘了标注\n正文\n' }) as never,
          live,
        ), 'design_orphan'),
      },
      {
        label: 'dangling_reference', code: 'dangling_reference',
        produce: async () => must((await checkNumberChainGate(
          fakeDocs({
            [REQP]: '# 需求\n\n**FR-1 甲**\n',
            [DDIR + '/architecture.md']: '# 架构\n\n## D-ARCH-1 悬空 serves: FR-99\n正文\n',
          }) as never,
          live,
        )).failure, 'dangling_reference'),
      },
      {
        label: 'requirement_uncovered', code: 'requirement_uncovered',
        produce: async () => must(await assertClauseCoverageGate(
          fakeDocs({ [REQP]: REQ_DOC }) as never,
          live,
          [{ requirement_refs: ['FR-1'] }] as never,
        ), 'requirement_uncovered'),
      },
      {
        label: 'requirement_missing_clauses', code: 'requirement_missing_clauses',
        produce: async () => must(await checkRequirementDocFormatGate(
          fakeDocs({ [REQP]: '# 需求\n\n没有编号\n' }) as never, live,
        ), 'requirement_missing_clauses'),
      },
      {
        label: 'requirement_clause_sequence_gap', code: 'requirement_clause_sequence_gap',
        produce: async () => must(await checkRequirementDocFormatGate(
          fakeDocs({ [REQP]: '# 需求\n\n**FR-1 甲**\n\n**FR-3 丙**\n' }) as never, live,
        ), 'requirement_clause_sequence_gap'),
      },
      {
        label: 'requirement_clause_duplicates', code: 'requirement_clause_duplicates',
        produce: async () => must(await checkRequirementDocFormatGate(
          fakeDocs({ [REQP]: '# 需求\n\n**FR-1 甲**\n\n**FR-1 重复**\n' }) as never, live,
        ), 'requirement_clause_duplicates'),
      },
      {
        label: 'design_contains_decomposition', code: 'design_contains_decomposition',
        produce: async () => must(await checkDesignDecompositionGate(
          fakeDocs({ [DDIR + '/architecture.md']: '# 架构\n\n## 拆分计划\n正文\n' }) as never, live,
        ), 'design_contains_decomposition'),
      },
      {
        label: 'REQBOARD_ARTIFACT_NOT_OPENABLE', code: 'REQBOARD_ARTIFACT_NOT_OPENABLE',
        produce: () => thrown(() => assertArtifactOpenable(fakeDocs({}) as never, DDIR + '/{a,b}.md')),
      },
      {
        label: 'REQBOARD_FILE_MISSING', code: 'REQBOARD_FILE_MISSING',
        produce: () => thrown(() => assertArtifactOpenable(fakeDocs({}) as never, DDIR + '/architecture.md')),
      },
      {
        label: 'REQBOARD_MISSING_REQUIRED_DOC', code: 'REQBOARD_MISSING_REQUIRED_DOC',
        produce: async () => {
          const id = 'REQ-t5e-doc'
          const rdir = 'docs/requirements/' + id
          mkdirSync(join(dir, rdir), { recursive: true })
          writeFileSync(join(dir, rdir, 'requirement.md'), '# 需求\n\n### FR-1: 甲\nx\n')
          writeFileSync(join(dir, rdir, 'decomposition.md'), '# 拆分计划\n')
          await seedReq({ id, status: 'decomposing' })
          const tool = definePlanSubmitTool({ store, now: () => 1000, workspaceRoot: dir } as never) as never as { execute: (a: unknown, e: unknown) => Promise<any> }
          return thrown(() => run(tool, { path: rdir + '/decomposition.md', summary: '目标：x；做法：y' }))
        },
      },
      {
        label: 'REQBOARD_EVIDENCE_FAKE', code: 'REQBOARD_EVIDENCE_FAKE',
        produce: async () => {
          await seedReq({ id: 'REQ-t5e-ev', status: 'design' })
          const tool = defineAskConfirmTool({
            store, now: () => 1000, workspaceRoot: dir, recentUserMsgs: new Map(),
          } as never) as never as { execute: (a: unknown, e: unknown) => Promise<any> }
          return thrown(() => run(tool, {
            target: 'artifact', kind: 'design', question: '确认？', options: ['确认'], evidence: '用户同意了',
          }))
        },
      },
    ]

    for (const c of cases) {
      const f = await c.produce()
      expect(f.code, c.label).toBe(c.code)
      expect(f.message, c.label).toContain('——')
      expect(f.message, c.label).toContain('补齐：')
      const how = f.message.slice(f.message.indexOf('补齐：') + '补齐：'.length)
      expect(GATE_HOW_ANCHOR.test(how), c.label + ' 的 how 缺可执行锚点：' + how).toBe(true)
    }
  })
})

describe('TC-21 负例：code 与 gaps 结构未因改文案而变化（护栏强度不降）', () => {
  it('design_doc_incomplete.gaps 仍逐份点名，且区分未登记/待确认', async () => {
    const unreg = must(await checkDesignCompletenessGate(
      fakeDocs({ [REQP]: REQ_DOC, ...designFiles() }) as never,
      { ...live, artifacts: DESIGN_ALL.slice(0, 4).map(n => art(n)) } as never,
    ), '未登记')
    expect(unreg.code).toBe('design_doc_incomplete')
    expect(unreg.gaps).toEqual([DDIR + '/use-cases.md 未登记（产物簿无此条，先调 reqboard_submit(kind=design)）'])

    const unconf = must(await checkDesignCompletenessGate(
      fakeDocs({ [REQP]: REQ_DOC, ...designFiles() }) as never,
      { ...live, artifacts: DESIGN_ALL.map(n => art(n, n !== 'use-cases.md')) } as never,
    ), '待确认')
    expect(unconf.gaps).toEqual([DDIR + '/use-cases.md 待确认（已登记未落章，先调 reqboard_ask_confirm(target=artifact, kind=design)）'])
  })

  it('requirement_uncovered.gaps 仍是结构化编号清单', async () => {
    const f = must(await assertClauseCoverageGate(fakeDocs({ [REQP]: REQ_DOC }) as never, live, [{ requirement_refs: ['FR-1'] }] as never), 'uncovered')
    expect(f.gaps).toEqual(['FR-4'])
  })

  it('assertArtifactOpenable 仍抛原名 code（形态判定未动）', async () => {
    const brace = await thrown(() => assertArtifactOpenable(fakeDocs({}) as never, DDIR + '/{a,b}.md'))
    expect(brace.code).toBe('REQBOARD_ARTIFACT_NOT_OPENABLE')
    const missing = await thrown(() => assertArtifactOpenable(fakeDocs({}) as never, DDIR + '/architecture.md'))
    expect(missing.code).toBe('REQBOARD_FILE_MISSING')
  })
})

// ---------------------------------------------------------------------------
// REQ-261005105032-3b02（t-094e28）：新码的**锚点 / 传输码**契约（§10 #35/#38/#39/#40/#44）
// ---------------------------------------------------------------------------

/**
 * 新门（原型三门 + 裁定门 + 验收缺对照项 + 阶段门逾期）的内部码 → 传输码，
 * 逐字取自 interfaces.md「错误码总表」（§10 #35 钉五条、#38/#39 钉另两条）。
 *
 * 为什么在本卡就锁：门实现分属别的卡（prototype-gates / decision-gates / SubmitVerification /
 * StageGateTimeline），接线前没有任何真实触发点能覆盖这些码。码表若等到接线时才补，
 * 中间任何一次"顺手隐式推导"都会把新码静默降级成 MISSING_ARTIFACT——先用例钉死再接线。
 */
const NEW_CODE_TRANSPORT: ReadonlyArray<readonly [internal: string, transport: string]> = [
  ['prototype_missing', 'REQBOARD_MISSING_PROTOTYPE'],
  ['prototype_version_conflict', 'REQBOARD_PROTOTYPE_VERSION_CONFLICT'],
  ['prototype_anchor_missing', 'REQBOARD_PROTOTYPE_ANCHOR_MISSING'],
  ['decision_log_missing', 'REQBOARD_DECISION_LOG_MISSING'],
  ['decision_entry_invalid', 'REQBOARD_DECISION_ENTRY_INVALID'],
  ['verification_prototype_compare_missing', 'REQBOARD_VERIFICATION_INCOMPLETE'],
  ['stage_gate_overdue', 'REQBOARD_STAGE_GATE_OVERDUE'],
]

describe('REQ-261005105032-3b02 新码契约：GATE_HOW_ANCHOR 扩容（§10 #40/#44）', () => {
  it('prototype_exempt / decision_ 命中（实测旧正则漏 prototype_exempt）', () => {
    // 旧式 `/reqboard_[a-z_]+|templates\/|design_exempt/` 对这两类**单独出现**判 false：
    // 「写豁免」「补裁定」这两条补救路径反被判成"缺可执行锚点"（后端实测发现）。
    expect(GATE_HOW_ANCHOR.test('prototype_exempt')).toBe(true)
    expect(GATE_HOW_ANCHOR.test('decision_log_missing')).toBe(true)
  })

  it('#40 点名的两类必含锚点命中，且既有锚点与负例都不变', () => {
    // 所有新门的 how 必须含 `reqboard_submit(kind=prototype)` 或 `templates/…`
    expect(GATE_HOW_ANCHOR.test('reqboard_submit(kind=prototype)')).toBe(true)
    expect(GATE_HOW_ANCHOR.test('templates/brainstorming/prototype.html')).toBe(true)
    // 既有锚点不许被这次扩容挤掉
    expect(GATE_HOW_ANCHOR.test('reqboard_move')).toBe(true)
    expect(GATE_HOW_ANCHOR.test('design_exempt')).toBe(true)
    // 负例：空话仍不命中——扩容 ≠ 放宽
    expect(GATE_HOW_ANCHOR.test('请检查文档后重试')).toBe(false)
  })

  it('设计契约：interfaces.md 中新门 how 模板逐条命中可执行锚点', () => {
    // 门实现尚未落库（t4/t5），此刻能机械核验的只有**设计里的 how 模板**；
    // 实现落库后由真实触发用例接棒（原型门/裁定门各自的三要素用例）。
    const md = readFileSync(
      new URL('../docs/requirements/REQ-261005105032-3b02/design/interfaces.md', import.meta.url),
      'utf8',
    )
    const hows = [...md.matchAll(/^- \*\*how\*\*：(.*)$/gm)].map(m => (m[1] ?? '').trim())
    expect(hows.length).toBeGreaterThanOrEqual(7)
    for (const how of hows) {
      expect(GATE_HOW_ANCHOR.test(how), '缺可执行锚点：' + how).toBe(true)
    }
    // #40 的必含 token：原型门的 how 必须点名"交原型"这一条命令
    expect(hows.some(h => h.includes('reqboard_submit(kind=prototype'))).toBe(true)
  })
})

describe('REQ-261005105032-3b02 新码契约：transportCodeOf 显式映射表（§10 #35）', () => {
  it('七个新码逐条映射到对应 REQBOARD_*（不静默降级为 MISSING_ARTIFACT）', () => {
    for (const [internal, transport] of NEW_CODE_TRANSPORT) {
      expect(transportCodeOf(internal), internal).toBe(transport)
      expect(transportCodeOf(internal), internal).not.toBe('REQBOARD_MISSING_ARTIFACT')
    }
  })

  it('既有两条映射逐字不变（e2e-design-handoff / design-gate-messages 契约锁着）', () => {
    expect(transportCodeOf('artifact_not_confirmed')).toBe('REQBOARD_ARTIFACT_NOT_CONFIRMED')
    expect(transportCodeOf('missing_artifact')).toBe('REQBOARD_MISSING_ARTIFACT')
  })

  it('未知内部码原样透传（不猜一个"看起来合理"的码）', () => {
    expect(transportCodeOf('some_unknown')).toBe('some_unknown')
    expect(transportCodeOf('requirement_uncovered')).toBe('requirement_uncovered')
  })
})
