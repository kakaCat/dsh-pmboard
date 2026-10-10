/**
 * 回合投递提示词（内容不变量：逐字钉住"该说什么"）。
 * 四件事必须有：阶段目标、达成判据、这一轮做什么、边界与停手条件。
 */
import { describe, it, expect } from 'vitest'
import { renderRoundPrompt } from 'pm-goal-round-driver/prompt.js'

const base = {
  requirementId: 'REQ-x', round: 3, status: 'implementing',
  stageStatement: '实现全部任务卡且测试全绿',
  doneCriteria: ['约定测试全绿', '验收单无返工项'],
  stageProgress: { done: 2, total: 7 },
} as const

describe('renderRoundPrompt · 共同内容', () => {
  it('含需求/回合/阶段（阶段序列从创建起的进度也在）', () => {
    const t = renderRoundPrompt({ ...base, goalPhase: 'active' })
    expect(t).toContain('REQ-x')
    expect(t).toContain('第 3 回合')
    expect(t).toContain('implementing')
    expect(t).toContain('2/7 段已达成')
  })

  it('阶段目标与达成判据逐条列出（agent 不必猜标准）', () => {
    const t = renderRoundPrompt({ ...base, goalPhase: 'active' })
    expect(t).toContain('【本阶段目标】实现全部任务卡且测试全绿')
    expect(t).toContain('1) 约定测试全绿')
    expect(t).toContain('2) 验收单无返工项')
  })

  it('边界三条与停手条件常在（人工门纪律翻译成可执行规则）', () => {
    for (const phase of [undefined, 'active', 'complete', 'paused'] as const) {
      const t = renderRoundPrompt({ ...base, goalPhase: phase })
      expect(t).toContain('不许自己把阶段判成"完成"')
      expect(t).toContain('不许改人的意图')
      expect(t).toContain('不要空转')
    }
  })

  it('未登记阶段目标时如实提示（不假装有判据）', () => {
    const t = renderRoundPrompt({ requirementId: 'REQ-y', round: 1, status: 'design', goalPhase: 'active' })
    expect(t).toContain('未登记阶段目标')
    expect(t).not.toContain('达成判据：')
  })
})

describe('renderRoundPrompt · 按 goal 相位分支', () => {
  it('无 goal → 先建 goal（objective 取 acceptance）', () => {
    const t = renderRoundPrompt({ ...base, nextTaskId: 't-1' })
    expect(t).toContain('reqboard_task_goal_create(task_id=t-1)')
    expect(t).toContain('acceptance')
  })

  it('active → 干活 + 完成时 complete（卡状态另走 task_move）', () => {
    const t = renderRoundPrompt({ ...base, goalPhase: 'active' })
    expect(t).toContain('action=complete')
    expect(t).toContain('reqboard_task_move')
  })

  it('complete → **完成不等于本阶段完成**（pm 与 dsh 的关键语义差写进提示词）', () => {
    const t = renderRoundPrompt({ ...base, goalPhase: 'complete' })
    expect(t).toContain('完成不等于本阶段完成')
    expect(t).toContain('不要自行宣布阶段完成')
  })

  it('paused/blocked → 不自己继续，说明卡点', () => {
    const t = renderRoundPrompt({ ...base, goalPhase: 'blocked' })
    expect(t).toContain('不要自己继续')
    expect(t).toContain('blocked')
  })
})
