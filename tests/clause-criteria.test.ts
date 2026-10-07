/**
 * 条款级判据软门禁（2026-10-06 文档质量门禁加固）——**含反向演练**。
 *
 * 验收口径（可证伪）：
 *   ① 条款块里有判据锚点 → 提示为空（不误报）；
 *   ② **把判据锚点删掉 → 提示必须出现并点名该条款**（判据不是空转）；
 *   ③ 扫窗口有边界：下一条款的判据不能冒充本条款的（假绿防线）；
 *   ④ 标题写法的条款（`### FR-1：`）与列表写法（`- **FR-1: **`）一视同仁。
 *
 * 为什么单独一份测试：`readability_warnings` 至今零测试，于是"软提示到底会不会响"没人知道。
 */
import { describe, expect, it } from 'vitest'
import { parseDocument } from '../src/application/internal/content-gates.js'
import { clauseCriteriaGaps, clauseCriteriaHints, CLAUSE_CRITERIA_WINDOW } from '../src/application/internal/clause-criteria.js'
import { CLAUSE_CRITERIA_ANCHOR, EVIDENCE_ANCHOR } from '../src/domain/workflow/EvidenceAnchor.js'

const docOf = (...lines: string[]) => parseDocument(['# 需求', '', '## 功能点', '', ...lines].join('\n'))

/** 带判据锚点的条款（对照标本）。 */
const WITH_ANCHOR = docOf(
  '- **FR-1: 提交即可打开性校验**——伪路径当场拒。',
  '  判据：`npx vitest run tests/artifact-openable.test.ts` 全绿；退出码 0。',
)

/** 反向标本：同一条款，只把判据那一行删掉。 */
const WITHOUT_ANCHOR = docOf(
  '- **FR-1: 提交即可打开性校验**——伪路径当场拒。',
)

describe('反向演练：删掉判据锚点，软提示必须出现', () => {
  it('有锚点 → 无缺口、无提示', () => {
    expect(clauseCriteriaGaps(WITH_ANCHOR)).toEqual([])
    expect(clauseCriteriaHints(WITH_ANCHOR)).toEqual([])
  })

  it('删掉锚点 → 点名该条款，且提示里给出修复锚点', () => {
    const gaps = clauseCriteriaGaps(WITHOUT_ANCHOR)
    expect(gaps.map(g => g.clause)).toEqual(['FR-1'])
    const hints = clauseCriteriaHints(WITHOUT_ANCHOR)
    expect(hints).toHaveLength(1)
    expect(hints[0]).toContain('FR-1')
    expect(hints[0]).toContain('不阻断提交')
    // 提示必须带可照抄的修复方式（命令 / 读数 / 明确取值各一个），不是"请补充判据"
    expect(hints[0]).toContain('npx vitest run')
    expect(hints[0]).toContain('退出码')
    expect(hints[0]).toContain('状态字段等于')
  })
})

describe('锚点词汇表：命令 / 路径 / 读数 / 明确取值都算，形容词不算', () => {
  it('EVIDENCE_ANCHOR 与条款判据扩展形态', () => {
    expect(EVIDENCE_ANCHOR.test('tests/a.test.ts')).toBe(true)
    expect(EVIDENCE_ANCHOR.test('npx vitest run')).toBe(true)
    expect(CLAUSE_CRITERIA_ANCHOR.test('返回 REQBOARD_INVALID_INPUT')).toBe(true)
    expect(CLAUSE_CRITERIA_ANCHOR.test('覆盖率 ≥ 90%')).toBe(true)
    expect(CLAUSE_CRITERIA_ANCHOR.test('状态字段等于 paused')).toBe(true)
    // 形容词与纯描述性数字都不是判据（否则"排版收敛"这类条款会靠"8 段进度带"侥幸过关）
    expect(CLAUSE_CRITERIA_ANCHOR.test('纵向占地收敛，减少无效留白')).toBe(false)
    expect(CLAUSE_CRITERIA_ANCHOR.test('8 段进度带与 6 Tab 的间距收敛')).toBe(false)
  })
})

describe('扫窗口有边界（假绿防线）', () => {
  it('下一条款的判据不算本条款的', () => {
    const d = docOf(
      '- **FR-1: 排版收敛**——间距更紧凑。',
      '- **FR-2: 详情页可打开**——判据：`npx vitest run tests/detail.test.ts` 全绿。',
    )
    expect(clauseCriteriaGaps(d).map(g => g.clause)).toEqual(['FR-1'])
  })

  it('标题写法的条款同样被扫（与编号门禁同一定义位口径）', () => {
    const d = docOf(
      '### FR-1：头部信息分层',
      '',
      '**功能描述**：标识行 + 操作区聚类。',
      '',
      '**验收标准**：`npx vitest run tests/header.test.ts` 全绿。',
      '',
      '### FR-2：状态带三格',
      '',
      '**功能描述**：缺口强化为视觉焦点，权重更清晰。',
    )
    expect(clauseCriteriaGaps(d).map(g => g.clause)).toEqual(['FR-2'])
  })

  it('更深的子标题不截断条款块（判据在 #### 里也算）', () => {
    const d = docOf(
      '### FR-1：头部信息分层',
      '',
      '#### 验收标准',
      '',
      '- `npx vitest run tests/header.test.ts` 退出码 0',
    )
    expect(clauseCriteriaGaps(d)).toEqual([])
  })

  it('窗口上限是常量（结构边界优先，长度只是兜底）', () => {
    expect(CLAUSE_CRITERIA_WINDOW).toBeGreaterThan(2)
  })

  it('长条款块不假红：判据落在定义行很远的下方，也必须算在本条款块内', () => {
    // 2026-10-06 dogfood 修正：本需求自己的 requirement.md 就把 3 条 FR 判成缺口——
    // 判据在「验收标准」里、落在定义行 15 行之后。假红会训练人忽略提示，故窗口放宽到 40 并锁住这条。
    const filler = Array.from({ length: 18 }, (_, i) => '- 详细说明第 ' + (i + 1) + ' 条（无锚点，纯散文）')
    const d = docOf(
      '### FR-1：拆分引用单口径',
      '',
      '**功能描述**：覆盖门禁只认卡上 requirement_refs。',
      '',
      ...filler,
      '',
      '**验收标准**：`npx vitest run tests/clause-coverage-gate.test.ts` 全绿。',
    )
    expect(clauseCriteriaGaps(d)).toEqual([])
  })
})

describe('逐条点名（不是"文档缺判据"一句带过）', () => {
  it('多条缺口一次列全，顺序 = 文档顺序', () => {
    const d = docOf(
      '- **FR-1: 排版收敛**——间距紧凑。',
      '',
      '- **FR-3: 视觉权重**——缺口强化。',
      '',
      '## 边界',
      '',
      '- 不做 A。',
    )
    expect(clauseCriteriaGaps(d).map(g => g.clause)).toEqual(['FR-1', 'FR-3'])
    expect(clauseCriteriaHints(d)[0]).toContain('2 条条款')
  })

  it('无条款定义的文档 → 没有缺口（不误报）', () => {
    expect(clauseCriteriaGaps(docOf('这段没有任何条款编号。'))).toEqual([])
  })
})
