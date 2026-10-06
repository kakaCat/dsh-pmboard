/**
 * 指南与回执不得再"叫 agent 去弹框"（REQ-261006164732-6503 t8 · serves: FR-3）。
 *
 * 为什么用生成物做断言对象：阶段指南的**唯一消费面**就是注入用的 `GENERATED_FRAGMENTS`
 * （片段 → 生成物 → 提示词），所以断言打在生成物上，等于约束真正进上下文的那份文本；
 * 而 `check-prompt-fragments.mjs`（C-17）保证生成物与片段源一致——两层合起来才锁得住"改了源没重生成"。
 *
 * 现场：拆分门事故里 agent 照做的正是指南那句「提交后调 reqboard_ask_confirm 弹框请人批准」；
 * 而 submit 早已自动弹过框。机制与文案双写 ⇒ 必然漂移，故文案改成**条件式**。
 */
import { describe, it, expect } from 'vitest'
import { GENERATED_FRAGMENTS } from '../src/domain/prompt/generated/fragments.js'

/** 取某片段 id 的正文（生成物形态：{ id, stage, difficulty, category, priority, text }）。 */
function fragText(id: string): string {
  const f = GENERATED_FRAGMENTS.find(x => x.id === id)
  expect(f, '片段缺失：' + id).toBeDefined()
  return f!.text
}

describe('t8 · 指南条件式（不再无条件叫人弹框）', () => {
  it('拆分轻档：批准闸门改为「先看回执，已有门在等就不要重复发起」', () => {
    const t = fragText('decomposing/light')
    expect(t).toContain('先看回执')
    expect(t).toContain('不要重复发起')
    // 旧的无条件指令不得再出现（它正是双框事故里被照做的那句）
    expect(t).not.toContain('**批准闸门**：调 `reqboard_ask_confirm(target=plan)` 弹框请人批准')
  })

  it('拆分完整档：同样条件式', () => {
    const t = fragText('decomposing/heavy')
    expect(t).toContain('不要重复发起')
    expect(t).toContain('先看回执')
  })

  it('需求分析完整档（覆盖 1 · 交棒）：补发确认前先看回执', () => {
    const t = fragText('brainstorming/heavy/overrides')
    expect(t).toContain('产物登记回执')
    expect(t).toContain('不要再发起')
  })
})
