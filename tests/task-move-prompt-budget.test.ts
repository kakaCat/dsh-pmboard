/**
 * reqboard_task_move description 预算与「细则下沉不丢」的断言（REQ-261008020552-4aa0 · U3 · FR-3）。
 *
 * ## 为什么需要它
 *
 * FR-3 做的是**减法**：把 budget 放行与批量推进的细则从每轮常驻的 schema 描述挪进
 * 拒绝回执（它们的家本来就在那里）。减法最容易出的两种事故，各用一条判据兜住：
 *
 * ① **没减够**：description + parameters 描述又长回去（每轮请求为少数场景付费）。
 *    故断言合计 ≤ 630（基线 1265，减半档；测量口径 = 需求文档「实测基线」同口径）。
 * ② **减过头**：细则从 schema 删了、回执里又没有 → agent 再也读不到规则。
 *    故逐条断言「细则之家」真的带着要点（优先调**导出的真实函数**拿 message，不 grep 源码）。
 *
 * 判据边界：这些断言判「细则文本在不在它该在的地方」，不判门禁/节流判定逻辑
 * （那是 task-move-batch / subtask-budget / done-throttle-* 的事）。
 *
 * @module tests/task-move-prompt-budget
 */

import { describe, expect, it } from 'vitest'
import { defineTaskMoveTool } from '../src/tools/TaskMoveTool/TaskMoveTool.js'
import { throttleGuidance } from '../src/application/use-cases/MoveTask.js'
import { readSubtaskBudgetArg } from '../src/application/internal/subtask-budget.js'

/** 递归求和 parameters 里的全部 description（与需求文档「实测基线」同口径）。 */
function sumDescriptions(node: unknown): number {
  if (node === null || typeof node !== 'object') return 0
  let sum = 0
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === 'description' && typeof v === 'string') sum += v.length
    else sum += sumDescriptions(v)
  }
  return sum
}

/** 构造只建对象（define 不触 deps）；与基线测量同一 stub 口径。 */
const stubDeps = new Proxy({}, { get: () => () => { throw new Error('stub') } }) as never

describe('reqboard_task_move description 预算（FR-3）', () => {
  it('没减够：description + parameters 描述合计 ≤ 630（基线 1265）', () => {
    const tool = defineTaskMoveTool(stubDeps) as unknown as {
      description: string
      parameters: Record<string, unknown>
    }
    const total = tool.description.length + sumDescriptions(tool.parameters)
    expect(total, '模型可见文本 ' + String(total) + ' 字符，超预算 630').toBeLessThanOrEqual(630)
  })

  it('减过头①：节流细则之家——throttleGuidance 仍给「确定等待」与可做之事', () => {
    const g = throttleGuidance(62_000)
    expect(g).toContain('确定等待 62000 毫秒')
    expect(g).toContain('不要试探/轮询')
  })

  it('减过头②：budget 形状细则之家——readSubtaskBudgetArg 形状报错逐条带规则', () => {
    // 非对象 → 报错给出完整形状说明
    const bad1 = readSubtaskBudgetArg('not-an-object', 't-x')
    expect(bad1.kind).toBe('error')
    if (bad1.kind !== 'error') return
    expect(bad1.receipt.error).toContain('{release:true, add?, expectedWindowIndex?}')
    // release 缺失 → 不静默忽略
    const bad2 = readSubtaskBudgetArg({}, 't-x')
    expect(bad2.kind).toBe('error')
    if (bad2.kind !== 'error') return
    expect(bad2.receipt.error).toContain('budget.release 必须为 true')
  })

  it('减过头③：CAS 细则之家——expectedWindowIndex 校验报错带 CAS 语义', () => {
    const bad = readSubtaskBudgetArg({ release: true, expectedWindowIndex: -1 }, 't-x')
    expect(bad.kind).toBe('error')
    if (bad.kind !== 'error') return
    expect(bad.receipt.error).toContain('CAS')
    expect(bad.receipt.error).toContain('不匹配即拒')
  })

  it('行为不变式：参数形状键集与扁平四参描述锚点保持（只压文案，不动形状）', () => {
    const tool = defineTaskMoveTool(stubDeps) as unknown as {
      parameters: { properties: Record<string, { type?: string; additionalProperties?: boolean }> }
    }
    const props = tool.parameters.properties
    // 键集逐字保持（FR-3 铁律：形状零变化）
    expect(Object.keys(props).sort()).toEqual(
      ['acceptance', 'budget', 'reason', 'task_id', 'tasks', 'to'].sort(),
    )
    // budget 子对象封闭形状保持
    expect(props.budget?.additionalProperties).toBe(false)
    // 扁平 reason 的长文本写法锚点在场（arg-guidance 机械锁同一口径）
    const reasonDesc = (props.reason as unknown as { description?: string }).description ?? ''
    expect(reasonDesc).toContain('短句')
    expect(reasonDesc).toContain('「」')
  })
})
