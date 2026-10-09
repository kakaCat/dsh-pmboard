// serves: FR-5
/**
 * 工具描述 / 提示词文案契约（REQ-260927123256-196b t4 · serves: FR-5 / I-5；
 * REQ-261007220012-bd29 FR-2 并入取回执路径后口径更新）。
 *
 * 「缺省阻塞」是可证伪锚点：文案写不清，用户与 agent 就仍以为「弹框出现=门已放行」。
 * FR-2 起取回执路径也走本工具（ticket 入参），故「凭 ticket 取回执」的指引必须留在本文案里。
 */
import { describe, it, expect } from 'vitest'
import { ASK_CONFIRM_PROMPT } from '../src/tools/AskConfirmTool/prompt.js'
import { defineAskConfirmTool } from '../src/tools/index.js'

describe('FR-5 文案契约', () => {
  it('ASK_CONFIRM_PROMPT 含「缺省阻塞」，并说明显式宽限 = 主动放弃阻塞', () => {
    expect(ASK_CONFIRM_PROMPT).toContain('缺省阻塞')
    expect(ASK_CONFIRM_PROMPT).toContain('主动放弃阻塞')
    expect(ASK_CONFIRM_PROMPT).toContain('REQBOARD_CONFIRM_PENDING')
  })

  it('FR-2：文案含取回执路径（ticket 入参），且不再指向已删除的独立回执工具', () => {
    expect(ASK_CONFIRM_PROMPT).toContain('取回执')
    expect(ASK_CONFIRM_PROMPT).toContain('被中止')
    // 工具面精简后取件口就是本工具：旧工具名不得再出现在 agent 可见文案里
    expect(ASK_CONFIRM_PROMPT).not.toContain('reqboard_confirm_receipt')
  })

  it('inline_grace_ms 参数 description 含「缺省」与「阻塞」', () => {
    const tool = defineAskConfirmTool({} as never) as any
    const desc: string = tool.parameters?.properties?.inline_grace_ms?.description ?? ''
    expect(desc).toContain('缺省')
    expect(desc).toContain('阻塞')
    expect(desc).toContain('主动放弃阻塞')
  })

  it('拦截清单是定性表述「全部写路径」，且不再枚举工具名（枚举必漂移）', () => {
    // 为什么不定枚举：实测挂 assertNoPendingConfirm 的工具面已有 9 个，而文案长期只列 4 个
    // （REQ-261007200706-89b7 FR-6 / 体检 C-5）——枚举清单与实现之间没有任何机械对账。
    expect(ASK_CONFIRM_PROMPT).toContain('全部写路径')
    expect(ASK_CONFIRM_PROMPT).not.toContain('reqboard_submit / reqboard_decompose')
    // 定性表述的适用范围必须与真实拦截面同域：挂载点全在 src/tools 下的工具壳里
    for (const tool of ['reqboard_submit', 'reqboard_decompose', 'reqboard_move', 'reqboard_task_move',
      'reqboard_task_amend', 'reqboard_kb']) {
      expect(ASK_CONFIRM_PROMPT).not.toContain(tool)
    }
  })

  it('FR-2：取回执路径的 schema 入参（ticket）已在工具面声明', () => {
    const tool = defineAskConfirmTool({} as never) as any
    const props = tool.parameters?.properties ?? {}
    expect(Object.keys(props)).toContain('ticket')
  })
})
