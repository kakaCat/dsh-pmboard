/**
 * 收尾指令（工具面，对齐宿主 `tool-goal/src/wrapup.ts`）；pm 差异三处逐条钉住：
 *   ① 完成 ≠ 阶段完成（不许模型自宣布）；② blocked 要指名"需要人做什么"；
 *   ③ 只有 complete / block 两个动作收尾（其余动作与停手闸都不收尾）。
 */
import { describe, it, expect } from 'vitest'
import { renderWrapupPrompt, wrapupKindOf } from 'tool-pm-goal/wrapup.js'

describe('wrapupKindOf · 动作闭集', () => {
  it('只有 complete / block 两个动作收尾', () => {
    expect(wrapupKindOf('complete')).toBe('goal-complete')
    expect(wrapupKindOf('block')).toBe('goal-blocked')
  })
  it('pause / resume / undefined → 不收尾（非终态；停手闸更不是终态）', () => {
    for (const a of ['pause', 'resume', undefined]) expect(wrapupKindOf(a)).toBeUndefined()
  })
})

describe('renderWrapupPrompt · goal-complete', () => {
  const t = renderWrapupPrompt({
    kind: 'goal-complete', objective: '完成登录页', taskId: 't-1', stageProgress: { done: 2, total: 7 },
  })

  it('含目标原样回显 + 产出指向 + 阶段进度背景', () => {
    expect(t).toContain('"完成登录页"')
    expect(t).toContain('挂载卡：t-1')
    expect(t).toContain('2/7 段已达成')
  })

  it('三问收尾 + 事实纪律 + 本回合不再调工具', () => {
    expect(t).toContain('① 结论')
    expect(t).toContain('② 怎么验证的')
    expect(t).toContain('③ 产出在哪')
    expect(t).toContain('不要编')
    expect(t).toContain('不要再调任何工具')
  })

  it('**完成 ≠ 阶段完成**：明令不许自行宣布阶段完成（pm 与 dsh 的关键差异）', () => {
    expect(t).toContain('完成 ≠ 阶段完成')
    expect(t).toContain('不要自行宣布阶段完成')
    expect(t).toContain('弹框请人裁决')
  })
})

describe('renderWrapupPrompt · goal-blocked', () => {
  const t = renderWrapupPrompt({
    kind: 'goal-blocked', objective: '完成登录页', taskId: 't-2', blockedReason: '等 D-3 裁定',
  })

  it('含卡点原文 + 三问（做到哪 / 卡在哪 / 需要人做什么）', () => {
    expect(t).toContain('"等 D-3 裁定"')
    expect(t).toContain('① 已经完成到什么程度')
    expect(t).toContain('② 卡点是什么')
    expect(t).toContain('③ 明确需要人做什么')
  })

  it('指路 pm 的恢复路径（人：看板继续 / 裁决）', () => {
    expect(t).toContain('看板「继续」')
  })

  it('blocked 文案不出现"完成 ≠ 阶段完成"（那是 complete 分支的话）', () => {
    expect(t).not.toContain('完成 ≠ 阶段完成')
  })
})

