/**
 * 「失败与并发路径」必填节门（2026-10-06 文档质量门禁加固）——**含反向演练**。
 *
 * 为什么单独一门而不进 `CATEGORY_DELTAS`：DELTA 会经 `missingCategoryDocs` 复用到拆分提交 /
 * 设计门 / 文档自检，那是**追溯存量**（本仓纪律明确禁止）。故它按需求创建时间生效
 * （`docQualityRulesApply`），只在新需求的**需求文档提交**那一次硬拦。
 *
 * 验收口径（可证伪）：
 *   ① 新需求的 feature / refactor 缺该节 → 拒（反向演练：把节删掉必须红）；
 *   ② 有节即放行——**含**「不适用：<理由>」的写法（保留节能被机械判定，删节不能）；
 *   ③ 存量需求（createdAt 早于规则起点 / 读数不可得）不追溯；
 *   ④ 非 feature / refactor 类型不判；
 *   ⑤ 节名与模板同源：常量值必须逐字出现在两份模板里（模板改名而常量不改 = 照模板写会被拒）。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { docSectionGateFailure, FAILURE_CONCURRENCY_SECTION } from '../src/application/internal/content-gate-wiring.js'
import { DOC_QUALITY_RULES_SINCE } from '../src/domain/workflow/DocQualityRules.js'
import { makeHarness, req } from './application/harness.js'
import { submitRequirementArtifact } from '../src/application/use-cases/SubmitArtifact.js'

const ROOT = (p: string) => fileURLToPath(new URL('../' + p, import.meta.url))

const rootWith = (section: string | undefined) => [
  '# 需求',
  '',
  '## 边界', '不做范围外的事。',
  '',
  '## 产品定义', 'x',
  '',
  '## 用户与角色', 'x',
  '',
  '## 功能点', '',
  '### FR-1: 甲', 'x',
  '',
  ...(section === undefined ? [] : [section]),
].join('\n')

const SECTION_OK = ['## ' + FAILURE_CONCURRENCY_SECTION, '', '- 失败路径：依赖失败时停在该状态并可重试。', '- 并发：同一动作重复提交由幂等键收敛。'].join('\n')
const SECTION_NOT_APPLICABLE = ['## ' + FAILURE_CONCURRENCY_SECTION, '', '不适用：纯文案调整，无状态机与写路径。'].join('\n')

// 注意：**不用默认参数**——`codeOf('feature', text, undefined)` 会触发默认值，于是「读数不可得」
// 那条用例会假绿（默认参数只在实参为 undefined 时生效，正是这里要区分的两种情况之一）。
const NEW_REQ = DOC_QUALITY_RULES_SINCE
const codeOf = (category: string, text: string, createdAt: number | undefined) =>
  docSectionGateFailure(category, text, createdAt)?.code

describe('反向演练：删掉「失败与并发路径」节，新需求必须被拒', () => {
  it('feature / refactor 缺节 → requirement_section_missing', () => {
    expect(codeOf('feature', rootWith(undefined), NEW_REQ)).toBe('requirement_section_missing')
    expect(codeOf('refactor', rootWith(undefined), NEW_REQ)).toBe('requirement_section_missing')
  })

  it('有节（含「不适用」写法）→ 放行', () => {
    expect(codeOf('feature', rootWith(SECTION_OK), NEW_REQ)).toBeUndefined()
    expect(codeOf('refactor', rootWith(SECTION_NOT_APPLICABLE), NEW_REQ)).toBeUndefined()
  })

  it('缺口文案给出可执行补法（模板路径 + 写什么）', () => {
    const failure = docSectionGateFailure('feature', rootWith(undefined), NEW_REQ)
    const msg = failure?.message ?? ''
    expect(msg).toContain(FAILURE_CONCURRENCY_SECTION)
    expect(msg).toContain('templates/brainstorming/feature.md')
    expect(msg).toContain('不适用')
  })
})

describe('存量不追溯 / 类型边界（不误伤）', () => {
  it('规则起点之前立项的需求不判；读数不可得也不判', () => {
    expect(codeOf('feature', rootWith(undefined), NEW_REQ - 1)).toBeUndefined()
    expect(codeOf('feature', rootWith(undefined), undefined)).toBeUndefined()
  })

  it('非 feature / refactor 类型不判（bug / spike / doc / chore 模板本来就没有这一节）', () => {
    for (const c of ['bug', 'spike', 'doc', 'chore']) {
      expect(codeOf(c, rootWith(undefined), NEW_REQ), c).toBeUndefined()
    }
  })
})

describe('节名与模板同源（常量 ↔ 模板逐字一致）', () => {
  it('两份模板都含该节标题（模板改名而常量不改 = 照模板写的新需求会被拒）', () => {
    for (const rel of ['templates/brainstorming/feature.md', 'templates/brainstorming/refactor.md']) {
      const text = readFileSync(ROOT(rel), 'utf8')
      expect(text, rel).toContain('## ' + FAILURE_CONCURRENCY_SECTION)
    }
  })
})

/* ── e2e：走真提交编排（submitRequirementArtifact），不是只调纯函数 ────────────── */

const REQ_PATH = 'docs/requirements/REQ-000001/requirement.md'
const EXEC = { agent: { id: 'session-w-001' } }

/** 需求文档正文：front-matter 行 + 一条无可核验判据的条款 + 可选的新必填节。 */
const reqDoc = (frontmatter: string[], withSection: boolean) => [
  '---', 'req_id: REQ-000001', ...frontmatter, '---', '',
  '# 需求', '',
  '## 功能点', '',
  '**FR-1 甲**：把界面收拾得更清爽。', '',
  ...(withSection ? ['## ' + FAILURE_CONCURRENCY_SECTION, '', '- 并发：重复提交由幂等键收敛。', ''] : []),
].join('\n')

describe('e2e · 新需求的提交编排（存量不追溯 + 两条硬门 + 一条软提示）', () => {
  it('缺 sides → 拒 requirement_sides_invalid', async () => {
    const h = makeHarness({ requirements: [req({ status: 'brainstorming', createdAt: NEW_REQ })] })
    h.docs.put(REQ_PATH, reqDoc([], true))
    await expect(submitRequirementArtifact(h.deps, { path: REQ_PATH, summary: 's' }, EXEC))
      .rejects.toMatchObject({ code: 'requirement_sides_invalid' })
  })

  it('sides 合法但缺「失败与并发路径」→ 拒 requirement_section_missing', async () => {
    const h = makeHarness({ requirements: [req({ status: 'brainstorming', createdAt: NEW_REQ })] })
    h.docs.put(REQ_PATH, reqDoc(['sides: [frontend]'], false))
    await expect(submitRequirementArtifact(h.deps, { path: REQ_PATH, summary: 's' }, EXEC))
      .rejects.toMatchObject({ code: 'requirement_section_missing' })
  })

  it('存量需求（规则起点之前立项）同样文档不完整 → 放行（不追溯）', async () => {
    const h = makeHarness({ requirements: [req({ status: 'brainstorming', createdAt: NEW_REQ - 1 })] })
    h.docs.put(REQ_PATH, reqDoc([], false))
    const out: any = await submitRequirementArtifact(h.deps, { path: REQ_PATH, summary: 's' }, EXEC)
    expect(out.success).toBe(true)
  })

  it('两条硬门都过 → 放行；条款缺判据只进软提示 clause_criteria_warnings（不阻断）', async () => {
    const h = makeHarness({ requirements: [req({ status: 'brainstorming', createdAt: NEW_REQ })] })
    h.docs.put(REQ_PATH, reqDoc(['sides: [frontend]'], true))
    const out: any = await submitRequirementArtifact(h.deps, { path: REQ_PATH, summary: 's' }, EXEC)
    expect(out.success).toBe(true)
    expect(out.clause_criteria_warnings).toHaveLength(1)
    expect(out.clause_criteria_warnings[0]).toContain('FR-1')
    expect(out.note).toContain('条款判据提示（不阻断）')
  })

  it('条款自带判据锚点 → 软提示键整体省略（不误报、键不空转）', async () => {
    const h = makeHarness({ requirements: [req({ status: 'brainstorming', createdAt: NEW_REQ })] })
    h.docs.put(REQ_PATH, [
      '---', 'req_id: REQ-000001', 'sides: [frontend]', '---', '',
      '# 需求', '',
      '## 功能点', '',
      '**FR-1 甲**：把界面收拾得更清爽。',
      '判据：`npx vitest run tests/x.test.ts` 全绿；退出码 0。', '',
      '## ' + FAILURE_CONCURRENCY_SECTION, '', '- 并发：重复提交由幂等键收敛。', '',
    ].join('\n'))
    const out: any = await submitRequirementArtifact(h.deps, { path: REQ_PATH, summary: 's' }, EXEC)
    expect(out.success).toBe(true)
    expect('clause_criteria_warnings' in out).toBe(false)
  })
})
