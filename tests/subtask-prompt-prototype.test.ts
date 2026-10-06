// serves: FR-6, FR-9
/**
 * 子卡提示词带上原型与 D-x（REQ-261005105032-3b02 t-30a9a2 · brief §7 / §10 #12 · FR-6/FR-9）。
 *
 * 钉四件事：
 *  ① UI 卡（`side === 'frontend'`）出【本卡原型（UI 卡）】小节，且路径取 `prototypes/INDEX.md`
 *     的**权威版本**——本需求点名的坑是"取目录里第一个 html"，故标本把 superseded 版本排在前面；
 *  ② 非 UI 卡**不得**出现该小节（不给非 UI 需求加仪式）；
 *  ③ 带 `decisionRefs` 的卡出【本卡裁定（D-x 原话）】小节，且原话来源与裁定**逐字**等于
 *     requirement.md「讨论与裁定记录（D-x）」表里的单元格（不概括、不重写）；
 *  ④ 只追加：既有指令文本（父卡/阶段/验收标准/产出契约/路径口径）逐字保留。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildSubtaskPrompt, executeSubtask } from '../src/application/use-cases/ExecuteTask.js'
import { makeHarness, req, task } from './application/harness.js'

const REQ_ID = 'REQ-261005105032-3b02'
const REQUIREMENT_MD = fileURLToPath(
  new URL('../docs/requirements/' + REQ_ID + '/requirement.md', import.meta.url),
)

/**
 * 权威清单标本：**先出现的是被取代版本**。取"目录里第一个 html"会命中 `old.html`，
 * 只有真的读 INDEX 的 `authoritative` 行才会得到 `detail.html`——标本本身就带逆验证。
 */
const INDEX = [
  '| 路径 | 状态 | 服务条款 | 被取代于 |',
  '| --- | --- | --- | --- |',
  '| prototypes/old.html | superseded | FR-1 | prototypes/detail.html |',
  '| prototypes/detail.html | authoritative | FR-4 | |',
  '',
].join('\n')

/** INDEX 有两条 authoritative（必须"恰好一条"才算权威明确）→ 不猜，如实不注入。 */
const INDEX_TWO_AUTH = [
  '| 路径 | 状态 | 服务条款 | 被取代于 |',
  '| --- | --- | --- | --- |',
  '| prototypes/a.html | authoritative | FR-1 | |',
  '| prototypes/detail.html | authoritative | FR-4 | |',
  '',
].join('\n')

const requirementDoc = (): string => readFileSync(REQUIREMENT_MD, 'utf8')

/**
 * requirement.md 的 D-x 表里某一行某一列的**原文**。
 * 刻意用独立读法（本文件自己切表格），不调被测模块的解析器——否则"解析器与断言同源"，
 * 解析器把原话改写了也照样绿（这条断言的全部价值就在"逐字"两个字上）。
 * 列号：1=编号 / 2=原话来源 / 3=裁定 / 4=影响 FR / 5=判据。
 */
function decisionCell(id: string, column: number): string {
  const line = requirementDoc().split('\n').find(l => l.trim().startsWith('| ' + id + ' |'))
  if (line === undefined) throw new Error('requirement.md 的 D-x 表里找不到 ' + id)
  return (line.split('|')[column] ?? '').trim()
}

const parent = (): ReturnType<typeof task> =>
  task({ id: 't-parent', requirementId: REQ_ID, title: '父卡', implementation: '改 x.ts', context: '' })

describe('UI 卡：原型小节取 INDEX 的权威版本', () => {
  const uiCard = () => task({
    id: 't-ui', requirementId: REQ_ID, side: 'frontend',
    prototypeRefs: ['prototypes/detail.html#FR-4'], acceptance: '断言 A 通过',
  })
  const prompt = (): string => buildSubtaskPrompt(parent(), uiCard(), '研发', '/ws', {
    prototypeIndex: INDEX, requirementDoc: requirementDoc(),
  })

  it('含小节标题、权威原型路径与本卡锚点', () => {
    expect(prompt()).toContain('【本卡原型（UI 卡）】')
    expect(prompt()).toContain('prototypes/detail.html')
    expect(prompt()).toContain('#FR-4')
  })

  it('不取「目录里第一个 html」：superseded 版本一个字都不进提示词', () => {
    expect(prompt()).not.toContain('prototypes/old.html')
  })

  it('【验收判据】节存在，且把原型锚点列成可复核项', () => {
    const p = prompt()
    expect(p).toContain('【验收判据】')
    expect(p).toContain('prototypes/detail.html#FR-4')
  })
})

describe('非 UI 卡：不出现原型小节', () => {
  it('side=backend 的卡即使带 prototypeRefs 也不追加该节', () => {
    const be = task({
      id: 't-be', requirementId: REQ_ID, side: 'backend',
      prototypeRefs: ['prototypes/detail.html#FR-4'],
    })
    const p = buildSubtaskPrompt(parent(), be, '研发', '/ws', {
      prototypeIndex: INDEX, requirementDoc: requirementDoc(),
    })
    expect(p).not.toContain('【本卡原型（UI 卡）】')
    expect(p).not.toContain('prototypes/detail.html')
  })
})

describe('INDEX 读不到 / 权威不唯一 → 如实不注入（不编造路径）', () => {
  const uiCard = () => task({
    id: 't-ui', requirementId: REQ_ID, side: 'frontend',
    prototypeRefs: ['prototypes/detail.html#FR-4'],
  })

  it('没读到 prototypes/INDEX.md：整个原型小节不注入（不写"取 INDEX 权威版本"的路径行）', () => {
    const p = buildSubtaskPrompt(parent(), uiCard(), '研发', '/ws', { requirementDoc: requirementDoc() })
    expect(p).not.toContain('【本卡原型（UI 卡）】')
    expect(p).not.toContain('状态=authoritative')
  })

  it('authoritative 两条：不猜权威版本，同样不注入', () => {
    const p = buildSubtaskPrompt(parent(), uiCard(), '研发', '/ws', {
      prototypeIndex: INDEX_TWO_AUTH, requirementDoc: requirementDoc(),
    })
    expect(p).not.toContain('【本卡原型（UI 卡）】')
    expect(p).not.toContain('状态=authoritative')
  })
})

describe('D-x 原话逐字进提示词', () => {
  it('带 decisionRefs 的卡：原话来源与裁定原文与 requirement.md 逐字一致', () => {
    const card = task({ id: 't-d', requirementId: REQ_ID, decisionRefs: ['D-1', 'D-11'] })
    const p = buildSubtaskPrompt(parent(), card, '研发', '/ws', { requirementDoc: requirementDoc() })
    expect(p).toContain('【本卡裁定（D-x 原话）】')
    for (const id of ['D-1', 'D-11']) {
      expect(p, id + ' 的原话来源原文').toContain(decisionCell(id, 2))
      expect(p, id + ' 的裁定原文').toContain(decisionCell(id, 3))
    }
  })

  it('无 decisionRefs 的卡不追加该节', () => {
    const card = task({ id: 't-nod', requirementId: REQ_ID })
    const p = buildSubtaskPrompt(parent(), card, '研发', '/ws', { requirementDoc: requirementDoc() })
    expect(p).not.toContain('【本卡裁定（D-x 原话）】')
  })

  it('读不到 requirement.md：不编造原话，如实标注"未读到这一条"', () => {
    const card = task({ id: 't-d2', requirementId: REQ_ID, decisionRefs: ['D-1'] })
    const p = buildSubtaskPrompt(parent(), card, '研发', '/ws', {})
    expect(p).toContain('【本卡裁定（D-x 原话）】')
    expect(p).toContain('未读到')
    expect(p).not.toContain(decisionCell('D-1', 3))
  })
})

describe('只追加：既有指令文本逐字保留', () => {
  it('原五段与验收标准原文一字不动，新内容只接在验收标准之后', () => {
    const ui = task({
      id: 't-ui', requirementId: REQ_ID, side: 'frontend',
      prototypeRefs: ['prototypes/detail.html#FR-4'], acceptance: '断言 A 通过',
    })
    const p = buildSubtaskPrompt(parent(), ui, '研发', '/ws', {
      prototypeIndex: INDEX, requirementDoc: requirementDoc(),
    })
    for (const marker of [
      '你是实施子代理，只完成这一张子卡的工作，做完即止（不要扩大范围）。',
      '【父卡】', '【本卡阶段】', '【本卡验收标准（怎么算做完）】',
      '【父卡实施方案（上下文）】', '【父卡需求背景】', '【产出要求】',
      '【路径口径（凭证门按工作区根解析，写错会被判"文件不存在"）】',
    ]) {
      expect(p, '缺既有标记 ' + marker).toContain(marker)
    }
    expect(p).toContain('断言 A 通过')
    // 顺序：验收标准 → 新小节 → 父卡实施方案（判据与锚点/裁定在同一处读）
    expect(p.indexOf('断言 A 通过')).toBeLessThan(p.indexOf('【本卡原型（UI 卡）】'))
    expect(p.indexOf('【本卡原型（UI 卡）】')).toBeLessThan(p.indexOf('【父卡实施方案（上下文）】'))
  })
})

// ---------------------------------------------------------------------------
// 接线：用例侧经注入端口读文档 → 真的进 run 脚本（别让"读了但没接上"漏过去）
// ---------------------------------------------------------------------------

/** 假引擎：只捕获 run 入参（脚本里就嵌着提示词）。 */
class CapturingRunner {
  calls: { script: string }[] = []
  async start(input: unknown): Promise<{ ok: boolean; value: unknown }> {
    this.calls.push(input as { script: string })
    return { ok: true, value: { ok: true, output: '{"filesChanged":[],"summary":"只做接线断言"}' } }
  }
}

describe('executeSubtask 接线：文档经端口读入并落进脚本', () => {
  it('UI 子卡的 run 脚本含【本卡原型（UI 卡）】与【本卡裁定（D-x 原话）】', async () => {
    const reqDir = 'docs/requirements/' + REQ_ID + '/'
    const h = makeHarness({
      requirements: [req({
        id: REQ_ID, status: 'implementing',
        artifacts: [
          { stage: 'brainstorming', kind: 'prototype', path: reqDir + 'prototypes/INDEX.md', registeredAt: 1, registeredBy: { kind: 'agent' } },
          { stage: 'brainstorming', kind: 'prototype', path: reqDir + 'prototypes/detail.html', registeredAt: 2, registeredBy: { kind: 'agent' } },
        ],
      })],
    })
    h.docs.put(reqDir + 'requirement.md', requirementDoc())
    h.docs.put(reqDir + 'prototypes/INDEX.md', INDEX)
    h.seedTasks(REQ_ID, [
      task({ id: 't-p', requirementId: REQ_ID, status: 'in_progress', title: '父卡' }),
      task({
        id: 't-s', requirementId: REQ_ID, status: 'todo', parentId: 't-p',
        stageKind: 'dev' as never, side: 'frontend',
        prototypeRefs: ['prototypes/detail.html#FR-4'], decisionRefs: ['D-1'], acceptance: '对照原型与 D-1',
      }),
    ])
    const runner = new CapturingRunner()
    h.deps.workflow = runner as never

    await executeSubtask(h.deps, { subtaskId: 't-s', windowKey: 'session-w-001' })

    const script = runner.calls[0]?.script ?? ''
    expect(script).toContain('【本卡原型（UI 卡）】')
    expect(script).toContain('prototypes/detail.html')
    expect(script).toContain('#FR-4')
    expect(script).toContain('【本卡裁定（D-x 原话）】')
    // 脚本把提示词嵌进 JS 字符串字面量 ⇒ 半角双引号在脚本文本里是转义形态；断言前还原转义
    // （判据是"原话逐字"，不是它在脚本里的转义写法）。
    expect(script.replace(/\\"/g, '"')).toContain(decisionCell('D-1', 3))
    expect(script).not.toContain('prototypes/old.html')
  })
})
