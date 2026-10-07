/**
 * 子卡落库回填（REQ-261006201920-2adc FR-1 · TC-3 / TC-4 / TC-6 · D-2）serves: FR-1
 *
 * 缺陷形态：子卡验收标准来自 `STAGE_ACCEPTANCE` 的**模板字面量**，落库时原样照抄——
 * 于是卡上写着 `npx vitest run <相关测试文件>`，读者照着跑必然失败（实测历史 944/2005 张卡如此）。
 *
 * 本文件同时是**反向演练 RV-2 的载体**：注释掉 `makeChild` 里的回填调用，
 * 「尖括号残留为 0」的断言必然变红；还原即绿。两次输出进验收材料。
 */
import { describe, it, expect } from 'vitest'
import { expandSubtasks, regenerateChain } from '../src/application/internal/lazy-expand.js'
import { STAGE_ACCEPTANCE } from '../src/domain/task/SubtaskTemplate.js'
import { task } from './application/harness.js'
import type { IdFactory } from '../src/application/ports.js'

const ids = (): IdFactory => {
  let n = 0
  return { requirement: () => 'REQ-x', task: () => 't-c' + String(++n), execution: () => 'e-1', comment: () => 'c-1' }
}
const ANGLE = /<[^>]{2,40}>/
/** 需求投影（`expandSubtasks` 只用到 category）。 */
const REQ = { category: 'feature' } as const

describe('子卡落库回填（FR-1 · TC-3）', () => {
  it('全部 STAGE_ACCEPTANCE 阶段各展开一遍：acceptance 与 implementation 里尖括号残留为 0', () => {
    expect(Object.keys(STAGE_ACCEPTANCE).length).toBeGreaterThan(15)
    for (const [kind, template] of Object.entries(STAGE_ACCEPTANCE)) {
      const parent = task({ id: 't-p', stages: [kind] as never, acceptance: 'npx vitest run tests/x.test.ts → 12 passed' })
      const kids = expandSubtasks([], parent, REQ, 1, ids())
      expect(kids, kind).toHaveLength(1)
      const kid = kids[0]!
      expect(kid.acceptance, kind + ' · acceptance').not.toMatch(ANGLE)
      expect(kid.implementation, kind + ' · implementation').not.toMatch(ANGLE)
      // 两处同源：实现里嵌入的那段验收描述必须与验收标准**同一份文本**（不许一处回填一处原样）
      expect(kid.implementation, kind + ' · 两处同源').toContain(kid.acceptance)
      // 模板原文确实带占位符的段，才谈得上「回填真的发生了」（不是碰巧模板本来就干净）
      if (ANGLE.test(template)) expect(kid.acceptance, kind + ' · 应已回填').not.toEqual(template)
    }
  })

  it('须回填的阶段不止一个（防止「碰巧全干净」让本用例空转）', () => {
    const withPlaceholder = Object.values(STAGE_ACCEPTANCE).filter(v => ANGLE.test(v))
    expect(withPlaceholder.length).toBeGreaterThanOrEqual(10)
  })
})

describe('回填取值与兜底（FR-1 · TC-4）', () => {
  it('父卡点名测试文件 → 被搬进子卡标准（dev 与 review 段都拿到）', () => {
    const parent = task({ id: 't-p', stages: ['dev', 'review'] as never, acceptance: 'npx vitest run tests/a.test.ts tests/b.test.ts 全绿' })
    const kids = expandSubtasks([], parent, REQ, 1, ids())
    expect(kids[0]!.acceptance).toContain('tests/a.test.ts')
    expect(kids[0]!.acceptance).toContain('tests/b.test.ts')
    expect(kids[1]!.acceptance).toContain('tests/a.test.ts')
  })

  it('父卡未点名任何测试文件 → 落声明的兜底（仍是可跑命令），且无尖括号', () => {
    const parent = task({ id: 't-p', stages: ['dev'] as never, acceptance: '改完自证' })
    const [kid] = expandSubtasks([], parent, REQ, 1, ids())
    expect(kid!.acceptance).toContain('npx vitest run tests/')
    expect(kid!.acceptance).not.toMatch(ANGLE)
  })

  it('需求 id 与子卡 id 被替换成真实值（review 段的 design 路径、manual 段的清单落点）', () => {
    const parent = task({ id: 't-p', requirementId: 'REQ-real01', stages: ['review', 'manual'] as never })
    const kids = expandSubtasks([], parent, REQ, 1, ids())
    expect(kids[0]!.acceptance).toContain('docs/requirements/REQ-real01/design/')
    expect(kids[1]!.acceptance).toContain('docs/requirements/REQ-real01/manual/' + kids[1]!.id + '.md')
    for (const k of kids) expect(k.acceptance).not.toMatch(ANGLE)
  })

  it('补链路径同口径（regenerateChain 与 expandSubtasks 共用 makeChild）', () => {
    const parent = task({ id: 't-p', stages: ['dev', 'review'] as never, acceptance: 'npx vitest run tests/a.test.ts 全绿' })
    const existing = task({ id: 't-dev0', parentId: 't-p', stageKind: 'dev' as never })
    const kids = regenerateChain([existing], parent, REQ, 1, ids())
    expect(kids.map(k => k.stageKind)).toEqual(['review'])
    expect(kids[0]!.acceptance).not.toMatch(ANGLE)
    expect(kids[0]!.acceptance).toContain('tests/a.test.ts')
  })
})

describe('存量卡不追溯（FR-1 · TC-6）', () => {
  it('幂等路径不动既存子卡：历史卡里的占位符原样保留（逐字节不变）', () => {
    const historical = task({ id: 't-old', parentId: 't-p', stageKind: 'dev' as never, acceptance: 'npx vitest run <相关测试文件> 全绿' })
    const before = JSON.stringify(historical)
    const out = expandSubtasks([historical], task({ id: 't-p' }), REQ, 1, ids())
    expect(out).toEqual([]) // 已有子卡 → 整体跳过
    expect(JSON.stringify(historical)).toBe(before)
    // 历史卡**故意**保持占位符（不追溯、不改写）——这正是本需求的边界
    expect(historical.acceptance).toMatch(ANGLE)
  })

  it('入参数组不被就地修改（expandSubtasks 零副作用）', () => {
    const tasks = [task({ id: 't-a' })]
    const before = JSON.stringify(tasks)
    expandSubtasks(tasks, task({ id: 't-p' }), REQ, 1, ids())
    expect(JSON.stringify(tasks)).toBe(before)
  })

  it('子卡自身不再展开（parentId 非空 → 空数组）', () => {
    expect(expandSubtasks([], task({ id: 't-c', parentId: 't-p' }), REQ, 1, ids())).toEqual([])
  })
})
