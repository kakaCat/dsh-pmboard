/**
 * 对照项由「可选」改「硬判据」（REQ-261006201649-cc89 t3 · FR-3）。
 *
 * ## 这份文件为什么存在
 *
 * 改动前：`prototype-compare` 项**按产出条件化**组装——只有台账里登记了 `.html` 原型产物才组装。
 * 于是「压根没交原型」与「交了但没人对照」在验收单上**长得一样**（都只是少一项）。
 * 实测台账：15 条有原型目录的需求里，只有 4 条真的有这一项。
 *
 * ## 反向演练 B 的写法（比"删掉分支"更硬）
 *
 * 光把分支删掉，测试仍可能因为别的原因红。这里用**判据本身**做靶子：
 * 台账里登记的产物路径与 `INDEX.md` 的权威行**故意指向不同文件**，然后断言
 * 验收单上的 `prototypePath` 必须等于 **INDEX 的权威行**。
 *   · 退回旧行为（按台账排序首项取数）→ 这条断言必红；
 *   · 只有真的"消费版本门的结论"才可能绿。
 *
 * 这个靶子还有独立价值：它测的不是"有没有这一项"，而是**"对照的是哪一版"**——
 * 后者才是人会据以判断"这份对照该不该信"的信息。
 */
import { describe, it, expect } from 'vitest'
import { makeHarness, req } from './application/harness.js'
import { submitVerification } from '../src/application/use-cases/SubmitVerification.ts'

const REQ_ID = 'REQ-0000a3'
const W = 'session-t3-001'
// 窗口键取自 `agent.id`（`agentIdFromExec`）——它必须等于台账的 `sourceSessionId`，否则绑定读为空
const EXEC = { agent: { id: W, session: { id: W, header: { cwd: process.cwd() } } } }
const DIR = 'docs/requirements/' + REQ_ID

/** 规则生效日之后 / 之前：新判据适用 / 存量。 */
const FRESH = Date.parse('2026-10-07T00:00:00.000Z')
const STALE = Date.parse('2026-10-05T00:00:00.000Z')

/**
 * 需求文档：front-matter **按行拼**（sides / prototype_exempt 都在里面）。
 *
 * 为什么不用字符串替换：`replace('---\n# 需求', '---\n' + exempt + '# 需求')` 会把豁免行写到
 * front-matter **之外**（body 里），于是豁免静默不生效——实测被这条坑过一次，故改成结构化拼装，
 * 让"豁免在不在 front-matter 里"由结构保证，而不是由替换式保证。
 */
function requirementMd(sides: string, exempt: string | undefined): string {
  const front = ['---', 'req_id: ' + REQ_ID, 'sides: ' + sides]
  if (exempt !== undefined) front.push('prototype_exempt: ' + exempt)
  front.push('---')
  return [...front, '# 需求', '', '## 讨论与裁定记录（D-x）', '', '（本节无裁定）', ''].join('\n')
}

/** 台账里登记的产物 = `prototypes/zz-ledger.html`（**故意**与 INDEX 的权威行不同）。 */
const LEDGER_PROTO = DIR + '/prototypes/zz-ledger.html'
/** INDEX 的权威行 = `prototypes/aa-authoritative.html`。 */
const AUTH = 'prototypes/aa-authoritative.html'

const INDEX_MD = [
  '# 原型清单', '',
  '| 路径 | 状态 | 服务条款 | 被取代于 |', '|---|---|---|---|',
  '| ' + AUTH + ' | authoritative | FR-1 | |',
].join('\n')

function seed(opts: {
  createdAt?: number
  sides?: string
  index?: string | null
  ledgerPrototype?: boolean
  exempt?: string
} = {}) {
  const h = makeHarness()
  h.docs.put(DIR + '/requirement.md', requirementMd(opts.sides ?? '[frontend, backend]', opts.exempt))
  if (opts.index !== null) h.docs.put(DIR + '/prototypes/INDEX.md', opts.index ?? INDEX_MD)
  // 九类验收前置文档（脚手架，与本用例要测的东西无关）：不齐会在组装验收单**之前**被拒，
  // 于是这条用例就测不到"对照项组装"——它要测的是组装结果，不是文档齐不齐。
  for (const [rel, body] of [
    ['design/architecture.md', '# 架构\n## 一\n<!-- serves: FR-1 -->\n内容\n'],
    ['design/data-model.md', '# 数据模型\n## 一\n<!-- serves: FR-1 -->\n内容\n'],
    ['design/interfaces.md', '# 接口\n## 一\n<!-- serves: FR-1 -->\n内容\n'],
    ['design/test-cases.md', '# 测试用例\n## 一\n<!-- serves: FR-1 -->\n内容\n'],
    ['decomposition.md', '# 拆分计划\n## 一\n内容\n'],
    ['reviews/review-1.md', '# 评审'],
    ['tests/notes.md', '测试证据'],
  ] as const) h.docs.put(DIR + '/' + rel, body)
  if (opts.ledgerPrototype !== false) h.docs.put(LEDGER_PROTO, '<html><section id="FR-1">x</section></html>')
  h.seedRequirementSync(req({
    id: REQ_ID, status: 'accepting', category: 'feature', sourceSessionId: W,
    createdAt: opts.createdAt ?? FRESH,
    artifacts: [
      { stage: 'brainstorming', kind: 'requirement', path: DIR + '/requirement.md', confirmedAt: 1 },
      ...(opts.ledgerPrototype === false ? [] : [{
        stage: 'brainstorming', kind: 'prototype', path: LEDGER_PROTO, registeredAt: 1,
      }]),
    ],
  } as never))
  return h
}

/** 跑一次验收材料提交，返回验收单项（需要时）。 */
async function sheetOf(h: ReturnType<typeof makeHarness>): Promise<{ items: Array<{ source?: { kind?: string; prototypePath?: string }; criterion: string }> } | undefined> {
  // 播种是**排队**的（harness 的同步入口只排队）：不 await 就提交，会退化成"窗口没绑定需求"
  await h.seedSettled()
  try {
    await submitVerification(h.deps, { summary: '交付', evidence: [DIR + '/requirement.md'] }, EXEC)
  } catch {
    // 门禁可能拒（本用例只关心"组装出了什么"）——下面直接读台账
  }
  return (await h.store.get(REQ_ID))?.verification?.sheet as never
}

const compareOf = (sheet: { items: Array<{ source?: { kind?: string; prototypePath?: string }; criterion?: string }> } | undefined) =>
  (sheet?.items ?? []).filter(i => i.source?.kind === 'prototype-compare')

describe('对照项必出（有权威原型 ⇒ 必组装）', () => {
  it('INDEX 有唯一 authoritative → 验收单必含 prototype-compare，且路径 = INDEX 权威行', async () => {
    const h = seed()
    const sheet = await sheetOf(h)
    const items = compareOf(sheet)
    expect(items, '这一项缺席＝"交了原型但没人对照"在验收单上与"没交"长得一样').toHaveLength(1)
    // 反向演练 B 的靶心：台账登记的是 zz-ledger.html，权威行是 aa-authoritative.html
    expect(items[0]?.source?.prototypePath).toBe(AUTH)
    expect(items[0]?.source?.prototypePath).not.toBe(LEDGER_PROTO)
  })

  it('台账里**没有**原型产物登记，但 INDEX 有权威行 → 仍必组装（不再按产出条件化）', async () => {
    const h = seed({ ledgerPrototype: false })
    const items = compareOf(await sheetOf(h))
    expect(items, '旧行为在这里是"少一项"（静默放过）').toHaveLength(1)
    expect(items[0]?.source?.prototypePath).toBe(AUTH)
  })

  it('该项标 needsHuman 且有理由（视觉对照只能人看）', async () => {
    const sheet = await sheetOf(seed())
    const item = compareOf(sheet)[0] as unknown as { needsHuman?: boolean; humanReason?: string }
    expect(item?.needsHuman).toBe(true)
    expect((item?.humanReason ?? '').length).toBeGreaterThan(0)
  })
})

describe('降级与边界（不改既有出现条件）', () => {
  it('INDEX 缺权威行 → 退回台账取数，且**在项上如实标注降级**', async () => {
    const noAuth = INDEX_MD.replace('| authoritative |', '| superseded |')
    const sheet = await sheetOf(seed({ index: noAuth }))
    const items = compareOf(sheet)
    expect(items).toHaveLength(1)
    expect(items[0]?.source?.prototypePath).toBe(LEDGER_PROTO)
    expect(items[0]?.criterion, '降级必须写在人能看到的地方').toMatch(/降级/)
  })

  it('INDEX 文件不存在 → 退回台账取数 + 降级标注（不新增码）', async () => {
    const sheet = await sheetOf(seed({ index: null }))
    const items = compareOf(sheet)
    expect(items).toHaveLength(1)
    expect(items[0]?.source?.prototypePath).toBe(LEDGER_PROTO)
    expect(items[0]?.criterion).toMatch(/降级/)
  })

  it('非 UI 需求（sides 只含 backend）→ 不组装（既有出现条件不变）', async () => {
    const sheet = await sheetOf(seed({ sides: '[backend]' }))
    expect(compareOf(sheet)).toHaveLength(0)
  })

  it('豁免生效 → 渲染豁免说明行，不组装对照项、不阻塞提交', async () => {
    const h = seed({ exempt: '零可视变化，本需求豁免原型' })
    const sheet = await sheetOf(h)
    expect(compareOf(sheet)).toHaveLength(0)
    const exemptItem = (sheet?.items ?? []).find(i => i.criterion.includes('豁免'))
    expect(exemptItem, '豁免说明行必须在场（否则人不知道为什么不要求对照）').toBeDefined()
  })
})

describe('存量零回归（createdAt 早于规则生效日 → 逐字不变）', () => {
  it('存量需求 + 台账有产物 + INDEX 权威行不同 → 仍按**台账排序首项**取数（旧行为逐字一致）', async () => {
    const sheet = await sheetOf(seed({ createdAt: STALE }))
    const items = compareOf(sheet)
    expect(items).toHaveLength(1)
    expect(items[0]?.source?.prototypePath, '存量走新取数＝追溯改动').toBe(LEDGER_PROTO)
    expect(items[0]?.criterion).not.toMatch(/降级/)
  })

  it('存量需求 + 没有台账产物 → 与改动前一致：不组装、不降级', async () => {
    const sheet = await sheetOf(seed({ createdAt: STALE, ledgerPrototype: false }))
    expect(compareOf(sheet)).toHaveLength(0)
  })
})
