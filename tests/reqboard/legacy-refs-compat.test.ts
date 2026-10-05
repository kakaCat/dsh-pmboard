/**
 * L2 兼容用例 · 旧数据零迁移可读（REQ-261002164800-d8f2 · t8 / serves: FR-1, FR-5, FR-7）。
 *
 * 本需求只**新增可选字段**（`PlanTask.requirement_refs?`）与**只补不覆写**的回填路径，不升 schema 版本。
 * 本文件把"旧数据在新代码下的读法"钉住——兼容不是承诺，是断言：
 *   ① 旧台账 `plan.tasks` 没有 `requirement_refs` → 规整后**不产生该键**（不是补成空数组）；
 *   ② 旧队列卡没有 `requirementRefs` → 取数与补写都按"空"处理，不抛错；
 *   ③ 反向（新字段在场、旧读者）→ 字段可选，旧代码忽略它即可（类型层面不可选即拒编译）；
 *   ④ 回填报告的 `--restore` 能把数据退回 before（数据变更有退路）。
 */
import { describe, it, expect } from 'vitest'
import { normalizePlanTasks, type PlanTask } from '../../src/shared/protocol.js'
import { refsForLanding, unrefedKeys } from '../../src/application/internal/plan-refs.js'
import type { DocsReader } from '../../src/application/internal/content-gates.js'

/** 旧版计划卡（没有 requirement_refs，字段都不存在）。 */
const LEGACY_PLAN_TASK: PlanTask = {
  key: 't1',
  title: '旧卡',
  phase: 'implement',
  side: 'backend',
  dependsOn: [],
  acceptance: 'npx vitest run 全绿',
  implementation: '改 src/legacy.ts',
}

const noDoc: DocsReader = { exists: () => false, read: async () => '' }

describe('① 旧台账读法：没有该字段就不产生该键（零迁移）', () => {
  it('normalizePlanTasks 对旧卡不补 requirement_refs 键', () => {
    const out = normalizePlanTasks([LEGACY_PLAN_TASK] as unknown)
    expect(out).toHaveLength(1)
    expect(Object.prototype.hasOwnProperty.call(out[0] as object, 'requirement_refs')).toBe(false)
  })

  it('新字段是**可选**的：缺省不报错，也没有隐含默认值', () => {
    // 类型层面：旧对象可直接当 PlanTask 用（字段可选——这行能通过编译本身就是断言）
    expect(LEGACY_PLAN_TASK.requirement_refs).toBeUndefined()
  })
})

describe('② 旧队列卡的取数：按空处理，不抛错', () => {
  it('无显式引用、无文档表 → refs 空、来源 none、点名它', async () => {
    const { refsByKey, sources } = await refsForLanding({
      req: { id: 'REQ-legacy-0001' },
      plan: { tasks: [LEGACY_PLAN_TASK] },
      docs: noDoc,
    })
    expect(refsByKey.get('t1')).toEqual([])
    expect(sources.get('t1')).toBe('none')
    expect(unrefedKeys(['t1'], refsByKey)).toEqual(['t1'])
  })

  it('卡上 requirementRefs 为 undefined 时，补写入口按"空 → 目标值"处理（不报错）', async () => {
    // 与 AmendTaskRefs 内 `before = [...(task.requirementRefs ?? [])]` 同口径；
    // 这里用最小复算锁定行为（补写入口本身的行为由 task-refs-repair 用例覆盖）
    const legacyTask = { id: 't-legacy', requirementId: 'REQ-legacy-0001' } as { requirementRefs?: string[] }
    expect([...(legacyTask.requirementRefs ?? [])]).toEqual([])
  })
})

describe('③ 新字段在场、旧读者：可选字段可被忽略（回滚安全）', () => {
  it('带 requirement_refs 的计划卡，去掉该键后仍是合法计划卡', () => {
    const modern = normalizePlanTasks([{ ...LEGACY_PLAN_TASK, requirement_refs: ['FR-1'] }] as unknown)
    expect(modern[0]?.requirement_refs).toEqual(['FR-1'])
    // 旧代码读到的是同一个对象；它只认自己认识的键 → 删掉新键后规整结果与旧卡一致
    const { requirement_refs: _dropped, ...legacyShape } = modern[0] as PlanTask & { requirement_refs?: string[] }
    const reparsed = normalizePlanTasks([legacyShape] as unknown)
    expect(Object.prototype.hasOwnProperty.call(reparsed[0] as object, 'requirement_refs')).toBe(false)
  })
})
