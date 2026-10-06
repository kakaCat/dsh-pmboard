// serves: FR-10
/**
 * Dive 回合指令带上"裁定落账 + 原型"（REQ-261005105032-3b02 t-30a9a2 · brief §7 · FR-10）。
 *
 * 口径：**只追加**——brainstorming / design / implementing 三段各补原型与 D-x 指针；
 * 既有指令文本逐字保留（拆分段与验收段的正文一字不动，本文件用整串 `toBe` 把这条钉死）。
 */
import { describe, it, expect } from 'vitest'
import { renderDiveRoundText } from '../src/application/dive/round-state.js'

const REQ = 'REQ-261005105032-3b02'
const text = (status: string): string => renderDiveRoundText({ requirementId: REQ, round: 2, status })

/** 既有指令行（改造前就在的原文）——逐字保留，缺一句即红。 */
const KEPT: Readonly<Record<string, readonly string[]>> = {
  brainstorming: [
    '**本阶段任务：调研用户意图，写需求文档**',
    '- 参考模板：docs/requirements/' + REQ + '/requirement.md',
    '- 写完后调 reqboard_submit(kind=requirement) 登记产物',
    '- 然后调 reqboard_ask_confirm(target=artifact, kind=requirement) 请人确认',
  ],
  design: [
    '**本阶段任务：写设计文档**',
    '- 目录：docs/requirements/' + REQ + '/design/',
    '- 写完后调 reqboard_submit(kind=design) 登记',
    '- 然后调 reqboard_ask_confirm(target=artifact, kind=design) 请人确认',
  ],
  implementing: [
    '**本阶段任务：执行任务卡**',
    '- 用 reqboard_status() 查看当前任务',
    '- 按任务说明执行，完成后调 reqboard_task_move 推进状态',
  ],
}

describe('回合头与既有指令逐字保留', () => {
  for (const [status, lines] of Object.entries(KEPT)) {
    it(status + '：既有指令一行不动', () => {
      const t = text(status)
      expect(t.startsWith('继续执行需求 ' + REQ + '（Dive 模式自动续跑，第 2 回合）\n\n当前状态：' + status)).toBe(true)
      for (const l of lines) expect(t, status + ' 缺既有行：' + l).toContain(l)
    })
  }

  it('未改动的两段（decomposing / accepting）正文与改造前逐字相同', () => {
    expect(text('decomposing')).toBe(
      '继续执行需求 ' + REQ + '（Dive 模式自动续跑，第 2 回合）\n\n当前状态：decomposing'
      + '\n\n**本阶段任务：写拆分计划**'
      + '\n- 路径：docs/requirements/' + REQ + '/decomposition.md'
      + '\n- 写完后调 reqboard_submit(kind=plan) 提交'
      + '\n- 然后调 reqboard_ask_confirm(target=plan) 请人批准',
    )
    expect(text('accepting')).toBe(
      '继续执行需求 ' + REQ + '（Dive 模式自动续跑，第 2 回合）\n\n当前状态：accepting'
      + '\n\n**本阶段任务：准备验收材料**'
      + '\n- 调 reqboard_submit(kind=verification) 提交验收材料'
      + '\n- 等待人工逐项验收',
    )
  })
})

describe('brainstorming：裁定落账 + 交原型', () => {
  const t = text('brainstorming')

  it('提「讨论与裁定记录（D-x）」逐条落账', () => {
    expect(t).toContain('讨论与裁定记录（D-x）')
    expect(t).toContain('原话来源')
    expect(t).toContain('禁只留概括')
  })

  it('提原型交付：权威版本走 INDEX，登记走 reqboard_submit(kind=prototype)', () => {
    expect(t).toContain('prototypes/INDEX.md')
    expect(t).toContain('状态=authoritative')
    expect(t).toContain('reqboard_submit(kind=prototype)')
    expect(t).toContain('docs/requirements/' + REQ + '/prototypes/')
  })
})

describe('design：frontend.md 与原型锚点', () => {
  const t = text('design')

  it('点名 design/frontend.md 的「原型页面」节 + 权威原型 + #FR-N 锚点', () => {
    expect(t).toContain('design/frontend.md')
    expect(t).toContain('原型页面')
    expect(t).toContain('prototypes/INDEX.md')
    expect(t).toContain('#FR-N')
  })

  it('不许指向 superseded 版本，并要求引用 D-x', () => {
    expect(t).toContain('superseded')
    expect(t).toContain('D-x')
  })
})

describe('implementing：本卡锚点与 D-x 指针', () => {
  const t = text('implementing')

  it('开工先对照权威原型的锚点区块，并逐条兑现本卡关联 D-x', () => {
    expect(t).toContain('prototypes/INDEX.md')
    expect(t).toContain('原型锚点')
    expect(t).toContain('#FR-N')
    expect(t).toContain('D-x')
    expect(t).toContain('reqboard_task_tree')
  })
})
