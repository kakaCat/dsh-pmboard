// serves: FR-10
/**
 * 节点输入包的「证据指针」节带上原型与裁定（REQ-261005105032-3b02 t-30a9a2 · brief §7 / §10 #15 · FR-10）。
 *
 * 为什么这条必须端到端钉：节点边界的全部意义是"上下文可以被遗弃"——遗弃之后新窗口**只看输入包**
 * 就要知道原型在哪、有哪些 D-x 在管这条需求。故本文件既测纯投影（两行、缺省不注入），
 * 也真跑两条出包路径（`IsolateNodeContext` 同窗口替换 / `HandoffOwner` 交棒底稿），
 * 断言两者拿到的是**同一份投影**（同一处函数，不许各写一遍）。
 */
import { describe, it, expect } from 'vitest'
import type { StageArtifact } from '../src/shared/protocol.js'
import {
  buildNodeInputPackage,
  decisionRowsIn,
  projectNodeRefs,
} from '../src/application/internal/node-input-package.js'
import { isolateNodeContext } from '../src/application/use-cases/IsolateNodeContext.js'
import { handoffRequirement } from '../src/application/use-cases/HandoffOwner.js'
import { makeHarness, req } from './application/harness.js'

const REQ_ID = 'REQ-261005105032-3b02'
const DOC_PATH = 'docs/requirements/' + REQ_ID + '/requirement.md'
const W_OWNER = 'session-nip-owner'
const W_NEW = 'session-nip-new'

/** 需求文档标本：D-x 表（两行）+ 一节普通正文。 */
const DOC = [
  '# 需求',
  '',
  '## 讨论与裁定记录（D-x）',
  '',
  '| 编号 | 原话来源（引用） | 裁定 | 影响 FR | 判据 |',
  '| --- | --- | --- | --- | --- |',
  '| D-1 | 用户：「原型必须在需求阶段交」 | UI 需求需求阶段必交原型 | FR-1 | 验收标准 1 |',
  '| D-2 | 用户：「裁定要落账」 | 讨论裁定逐条落账并进追溯链 | FR-8 | 验收标准 10 |',
  '',
].join('\n')

function artifact(kind: StageArtifact['kind'], path: string): StageArtifact {
  return {
    stage: 'brainstorming', kind, path, registeredAt: 10,
    registeredBy: { kind: 'agent', sessionId: W_OWNER },
  }
}

/** 已登记原型的台账（两条：权威清单 INDEX 也是原型产物，决议 #1）。 */
const PROTO_ARTIFACTS = [
  artifact('prototype', DOC_PATH.replace(/requirement\.md$/, 'prototypes/INDEX.md')),
  artifact('prototype', DOC_PATH.replace(/requirement\.md$/, 'prototypes/detail.html')),
]

/** 「## 证据指针」节的正文（到下一个二级标题为止）。 */
function evidenceSection(text: string): string {
  const at = text.indexOf('## 证据指针')
  if (at < 0) throw new Error('输入包缺「## 证据指针」节')
  const rest = text.slice(at + '## 证据指针'.length)
  const next = rest.indexOf('\n## ')
  return next < 0 ? rest : rest.slice(0, next)
}

const PROTO_LINE = '- 原型（prototypeRefs）：'
const DECISION_LINE = '- 裁定（decisions）：'

describe('纯投影：两条行的内容与来源', () => {
  it('原型取台账 kind=prototype 的路径，裁定取 requirement.md 的 D-x 编号', () => {
    const refs = projectNodeRefs(
      req({ id: REQ_ID, artifacts: PROTO_ARTIFACTS }),
      DOC,
    )
    expect(refs.prototypeRefs).toEqual([
      'docs/requirements/' + REQ_ID + '/prototypes/INDEX.md',
      'docs/requirements/' + REQ_ID + '/prototypes/detail.html',
    ])
    expect(refs.decisions).toEqual(['D-1', 'D-2'])
  })

  it('D-x 表解析：只认「编号 | 原话来源 | 裁定 | 影响 FR | 判据」那张表，原话逐字（不概括）', () => {
    const rows = decisionRowsIn(DOC)
    expect(rows.map(r => r.id)).toEqual(['D-1', 'D-2'])
    expect(rows[0]?.source).toBe('用户：「原型必须在需求阶段交」')
    expect(rows[0]?.verdict).toBe('UI 需求需求阶段必交原型')
  })

  it('文档里没有 D-x 表 → 空数组（调用方据此不注入，不编造）', () => {
    expect(decisionRowsIn('# 需求\n\n没有裁定表。')).toEqual([])
  })
})

describe('buildNodeInputPackage：证据指针节两行', () => {
  const buildText = (over: Partial<Parameters<typeof buildNodeInputPackage>[0]> = {}): string =>
    buildNodeInputPackage({
      stage: 'implementing', category: 'feature',
      requirement: req({ id: REQ_ID, artifacts: PROTO_ARTIFACTS }),
      requirementDoc: DOC, requirementDocPath: DOC_PATH,
      ...over,
    }).text

  it('两行都渲染在「证据指针」节内', () => {
    const section = evidenceSection(buildText())
    expect(section).toContain(PROTO_LINE)
    expect(section).toContain(DECISION_LINE)
    // 两行 = 两行（不是拼成一行，也不是散落在别处）
    const lines = section.split('\n').filter(l => l.startsWith('- '))
    expect(lines).toEqual([
      PROTO_LINE + 'docs/requirements/' + REQ_ID + '/prototypes/INDEX.md、docs/requirements/' + REQ_ID + '/prototypes/detail.html',
      DECISION_LINE + 'D-1、D-2',
    ])
  })

  it('缺省不注入：没有原型产物、也没有 D-x 表 → 证据指针节仍是旧形态（不塞空数组冒充）', () => {
    const text = buildNodeInputPackage({
      stage: 'implementing', category: 'feature',
      requirement: req({ id: REQ_ID, artifacts: [] }),
      requirementDoc: '# 需求\n\n没有裁定表。', requirementDocPath: DOC_PATH,
    }).text
    expect(text).not.toContain(PROTO_LINE)
    expect(text).not.toContain(DECISION_LINE)
    expect(evidenceSection(text).trim()).toBe('（无）')
  })

  it('显式给空数组 = 调用方声明"没有"：不回落投影（缺省与"声明为空"两态可区分）', () => {
    const text = buildText({ prototypeRefs: [], decisions: [] })
    expect(text).not.toContain(PROTO_LINE)
    expect(text).not.toContain(DECISION_LINE)
  })
})

describe('两条出包路径同源复用同一投影', () => {
  /** 台账 + 文档 + 时钟（内存端口夹具）；需求带原型产物，文档带 D-x 表。 */
  function seedHarness() {
    const h = makeHarness({
      requirements: [req({
        id: REQ_ID, status: 'implementing', sourceSessionId: W_OWNER,
        seats: [{ windowKey: W_OWNER, role: 'owner', joinedAt: 1 }],
        artifacts: PROTO_ARTIFACTS,
      })],
    })
    h.docs.put(DOC_PATH, DOC)
    return h
  }

  const expectedLines = (text: string): string[] =>
    text.split('\n').filter(l => l.startsWith(PROTO_LINE) || l.startsWith(DECISION_LINE))

  it('节点隔离：packageText 带两行（新窗口只看输入包即可见原型与裁定）', async () => {
    const h = seedHarness()
    const result = await isolateNodeContext(
      { store: h.store, docs: h.docs, clock: h.clock, taskStore: h.taskStore },
      { windowKey: W_OWNER, stage: 'implementing', category: 'feature', requirementId: REQ_ID, persistArtifacts: () => 1 },
    )
    const lines = expectedLines(result.packageText)
    expect(lines).toContain(PROTO_LINE + 'docs/requirements/' + REQ_ID + '/prototypes/INDEX.md、docs/requirements/' + REQ_ID + '/prototypes/detail.html')
    expect(lines).toContain(DECISION_LINE + 'D-1、D-2')
  })

  it('交棒底稿：投递正文带**同一份**两行（同一处投影，不是各写一遍）', async () => {
    const h = seedHarness()
    const captured: { to: string; message: unknown }[] = []
    h.deps.crossWindowDeliver = {
      createMessage: (params: { text: string; kind: string }) => ({
        messageId: 'm-nip-1',
        message: {
          id: 'm-nip-1', role: 'user',
          content: [{ type: 'text', text: params.text }],
          source: { kind: params.kind, plugin: 'dsh-pmboard' },
        },
      }),
      deliver: async (to: string, message: unknown) => {
        captured.push({ to, message })
        return { delivered: true }
      },
    }

    const out = await handoffRequirement(
      h.deps, { to_window: W_NEW, reason: '水位到顶，阶段边界交棒' }, { agent: { id: W_OWNER } },
    )
    expect(out.success).toBe(true)
    const raw = captured[0]?.message as { content?: { text?: string }[] } | undefined
    const seed = raw?.content?.[0]?.text ?? ''
    expect(seed).toContain('## 证据指针')

    // 与纯函数出包逐行相等 —— 「同源」的机械判据（两处各写一遍就会在这里露出差异）
    const pure = buildNodeInputPackage({
      stage: 'implementing', category: 'feature',
      requirement: req({ id: REQ_ID, status: 'implementing', artifacts: PROTO_ARTIFACTS }),
      requirementDoc: DOC, requirementDocPath: DOC_PATH,
    }).text
    expect(expectedLines(seed)).toEqual(expectedLines(pure))
    expect(expectedLines(seed)).toHaveLength(2)
  })
})
