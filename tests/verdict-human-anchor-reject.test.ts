/**
 * 人工自填无锚点 → 当场拒绝（REQ-261007160829-1991 FR-3 · design/backend.md S-2 / I-2 / I-4）serves: FR-2, FR-3
 *
 * 缺陷形态：人自己写下的结论没有可核验锚点（命令 / 路径 / 明确计数）时，旧实现**静默降级**成
 * `unverified`——状态停在"未复核"，却谁也说不清为什么（这正是本需求的病根：降级本身对，说不出缘由才错）。
 *
 * 本卡把判定收成**单点**（`judgePassedVerdict`）并分出两路：
 *   · **人真的动了原文**（`isHumanAuthored`：文本非空且与该项已有 `result` 不同）→ **抛错**，
 *     人能当场改；抛错发生在**写任何字段之前**，故台账零改动（调用方据此承诺原子性）；
 *   · **文本取自 agent 的 `result`**（零输入通过）→ 照旧降级 + 写原因——不把 agent 的历史欠账
 *     转嫁给点通过的人（拒绝零输入等于逼人替 agent 补作业）。
 *
 * 用例先行（TDD）：本文件在 `isHumanAuthored` 与拒绝分支落地之前就写好了。
 */
import { describe, it, expect } from 'vitest'
import {
  applyVerdicts,
  isHumanAuthored,
  type SheetItemLike,
  type SheetLike,
} from '../src/domain/workflow/AcceptanceSheetSpec.js'
import { hasErrorCode, REQBOARD_ERROR_CODES } from '../src/domain/errors.js'

const H = { kind: 'human', sessionId: 'w-abcdef12' } as const
/** agent 提交时落章的实测原文（带锚点：命令 + 读数）。 */
const AGENT_RESULT = 'npx vitest run tests/a.test.ts → 12 passed'
/** 人自己写的、无锚点的散文（`hasResultAnchor` 不认——没有命令 / 路径 / 明确计数）。 */
const HUMAN_PROSE = '我复跑了一遍，都正常'

/** 一张单：普通项一条，`result` 为 agent 原文（`undefined` = agent 没交过实测）。 */
function mkSheet(result: string | undefined): SheetLike {
  return {
    version: 3,
    items: [
      {
        id: 'v3-1',
        source: { kind: 'task', taskId: 't-a' },
        criterion: '单测全绿',
        evidence: ['e'],
        status: 'pending',
        ...(result !== undefined ? { result } : {}),
      },
    ],
    generatedAt: 1,
    generatedBy: H,
  }
}
const itemOf = (s: SheetLike): SheetItemLike => s.items[0]!
const run = (s: SheetLike, opinion: string | undefined) =>
  applyVerdicts(s, [{ itemId: 'v3-1', status: 'passed', ...(opinion !== undefined ? { opinion } : {}) }], H, 100, [])

describe('isHumanAuthored · 人是不是真的动了原文（I-2）', () => {
  it('写了与 agent 原文不同的文本 → true', () => {
    expect(isHumanAuthored({ result: AGENT_RESULT }, HUMAN_PROSE)).toBe(true)
  })

  it('没动原文（与原文字字相同，或只差首尾空白）→ false', () => {
    expect(isHumanAuthored({ result: AGENT_RESULT }, AGENT_RESULT)).toBe(false)
    expect(isHumanAuthored({ result: AGENT_RESULT }, `  ${AGENT_RESULT}  `)).toBe(false)
  })

  it('零输入（无 opinion）→ false：人没打字，谈不上"动"', () => {
    expect(isHumanAuthored({ result: AGENT_RESULT }, undefined)).toBe(false)
    expect(isHumanAuthored({ result: AGENT_RESULT }, '   ')).toBe(false)
  })

  it('该项本无 agent 实测结果 → false：没有"原文"可动（首次填写由 FR-1 在源头治理）', () => {
    expect(isHumanAuthored({ result: undefined }, HUMAN_PROSE)).toBe(false)
    expect(isHumanAuthored({}, HUMAN_PROSE)).toBe(false)
  })
})

describe('人工自填无锚点 → 拒绝（I-4：抛错在写任何字段之前）', () => {
  it('抛域错误，且点名 itemId + 回显人写文本 + 说清补法 + 声明 agent 原文未被改动', () => {
    const s = mkSheet(AGENT_RESULT)
    const before = JSON.stringify(itemOf(s))
    let thrown: unknown
    try {
      run(s, HUMAN_PROSE)
    } catch (err) {
      thrown = err
    }
    expect(thrown, '人自填无锚点必须抛错（静默降级正是本需求要消灭的形态）').toBeDefined()
    expect(hasErrorCode(thrown, REQBOARD_ERROR_CODES.invalidInput)).toBe(true)
    const msg = (thrown as Error).message
    expect(msg).toContain('v3-1')          // 点名 itemId
    expect(msg).toContain(HUMAN_PROSE)     // 回显人写文本（前 40 字内）
    expect(msg).toContain('命令')          // 补法：一条命令 + 读数
    expect(msg).toContain('路径')          //        / 一个证据路径
    expect(msg).toContain('计数')          //        / 一个明确计数
    expect(msg).toContain('未被改动')      // agent 的实测原文没被抹掉
    // 抛错先于任何写入：该项字段逐个照旧（台账零改动，调用方据此承诺原子性）
    expect(JSON.stringify(itemOf(s))).toBe(before)
    expect(itemOf(s).status).toBe('pending')
    expect(itemOf(s).decidedAt).toBeUndefined()
    expect(itemOf(s).decidedBy).toBeUndefined()
    expect(itemOf(s).opinion).toBeUndefined()
    expect(itemOf(s).unverifiedReason).toBeUndefined()
  })

  it('回显只取人写文本的前 40 字（报错不把整段结论抄进去）', () => {
    const long = '我复跑了一遍结果都正常没有任何问题然后我又重新检查了别的地方也都没发现任何异常现象'
    expect(long.length).toBeGreaterThan(40)
    const s = mkSheet(AGENT_RESULT)
    let thrown: unknown
    try {
      run(s, long)
    } catch (err) {
      thrown = err
    }
    const msg = (thrown as Error).message
    expect(msg).toContain(long.slice(0, 40))
    expect(msg).not.toContain(long.slice(40))
  })

  it('同一项改成带锚点文本 → passed，且 unverifiedReason 缺席（拒绝只针对"没锚点"）', () => {
    const s = mkSheet(AGENT_RESULT)
    run(s, '我复跑了一遍：npx vitest run tests/a.test.ts → 12 passed')
    expect(itemOf(s).status).toBe('passed')
    expect(itemOf(s).unverifiedReason).toBeUndefined()
    expect('unverifiedReason' in itemOf(s)).toBe(false)
  })
})

describe('回归：零输入通过的路由不变（不把 agent 的欠账转嫁给人）', () => {
  it('零输入通过（opinion 取自 item.result、带回锚）→ passed', () => {
    const s = mkSheet(AGENT_RESULT)
    expect(() => run(s, undefined)).not.toThrow()
    expect(itemOf(s).status).toBe('passed')
    expect(itemOf(s).opinion).toBe(AGENT_RESULT) // 留痕：谁都没打字，但结果有出处
    expect(itemOf(s).unverifiedReason).toBeUndefined()
  })

  it('item.result 无锚点且人零输入 → unverified(anchor_missing)，**不是**抛错', () => {
    const s = mkSheet('功能正常，没有问题')
    expect(() => run(s, undefined)).not.toThrow()
    expect(itemOf(s).status).toBe('unverified')
    expect(itemOf(s).unverifiedReason).toBe('anchor_missing')
  })
})

describe('unverifiedReason 的写与清（状态跟着原因走）', () => {
  it('降级写原因：无文本点通过 → unverified + reason=blank_pass', () => {
    const s = mkSheet(undefined)
    run(s, undefined)
    expect(itemOf(s).status).toBe('unverified')
    expect(itemOf(s).unverifiedReason).toBe('blank_pass')
  })

  it('降级写原因：agent 的 result 无锚点（人零输入）→ unverified + reason=anchor_missing', () => {
    const s = mkSheet('（未附实际结果…待补复核）')
    run(s, undefined)
    expect(itemOf(s).status).toBe('unverified')
    expect(itemOf(s).unverifiedReason).toBe('anchor_missing')
  })

  it('通过清原因：老台账残留的 unverifiedReason 在 status 变 passed 时被清空（不残留）', () => {
    const s = mkSheet(AGENT_RESULT)
    itemOf(s).unverifiedReason = 'anchor_missing' // 模拟上一轮降级留下的原因
    run(s, undefined)
    expect(itemOf(s).status).toBe('passed')
    expect('unverifiedReason' in itemOf(s)).toBe(false)
  })

  it('不通过同样清原因（failed 是人的结论，不是"未复核"）', () => {
    const s = mkSheet(AGENT_RESULT)
    itemOf(s).unverifiedReason = 'blank_pass'
    applyVerdicts(s, [{ itemId: 'v3-1', status: 'failed', opinion: '边界没覆盖' }], H, 100, [])
    expect(itemOf(s).status).toBe('failed')
    expect('unverifiedReason' in itemOf(s)).toBe(false)
  })
})
