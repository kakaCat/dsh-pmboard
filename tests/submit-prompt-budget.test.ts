/**
 * reqboard_submit description 预算与「细则下沉不丢」的断言（REQ-261007200706-89b7 · 卡 t-ee9299 · FR-3）。
 *
 * ## 为什么需要它
 *
 * G3 做的是**减法**：把 plan/archive/requirement 的细则从每轮常驻的 description 挪进拒绝回执。
 * 减法最容易出的两种事故，这里各用一条判据兜住：
 *
 * ① **减过头**：细则从 description 删了、回执里又没有 → agent 再也读不到规则。
 *    故逐条断言「细则之家」真的带着要点（优先调**导出的纯函数**拿真实 message，不是 grep 源码）。
 * ② **没减够**：description 又长回去（每轮请求为少数违规场景付费）。故断言字符预算 ≤ 1300，
 *    并断言漏掉的 prototype 支在场、旧的「五类」计数不在场。
 *
 * 判据边界：这些断言判「细则文本在不在它该在的地方」，不判门禁判定逻辑（那是各门自己的测试）。
 *
 * @module tests/submit-prompt-budget
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SUBMIT_PROMPT } from '../src/tools/SubmitTool/prompt.js'
import { assertArchiveMaterials } from '../src/shared/protocol.js'
import { docSectionGateFailure } from '../src/application/internal/content-gate-wiring.js'
import { sidesDeclarationGap } from '../src/application/internal/category-doc-sets.js'

const ROOT = process.cwd()
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8')

/** 取一次 throw 的 message（负例断言用；不 throw = 判据空转，直接失败）。 */
function messageOf(fn: () => unknown): string {
  try {
    fn()
  } catch (e) {
    return (e as Error).message
  }
  throw new Error('期望抛错但没有抛——该门禁已不再拦截，回执断言空转')
}

describe('reqboard_submit description 预算（FR-3）', () => {
  it('① 预算：SUBMIT_PROMPT ≤ 1300 字符（基线 1966 / report §3.3 口径实测）', () => {
    expect(SUBMIT_PROMPT.length).toBeLessThanOrEqual(1300)
  })

  it('② 六类：prototype 支在场、旧「五类」计数不在场', () => {
    expect(SUBMIT_PROMPT).toContain('kind=prototype')
    expect(SUBMIT_PROMPT).toContain('prototypes/*.html')
    expect(SUBMIT_PROMPT).not.toContain('五类')
    expect(SUBMIT_PROMPT).not.toContain('五个提交入口')
    // 分派表实际键集必须与文案一致（六支）
    const dispatchSource = read('src/tools/SubmitTool/SubmitTool.ts')
    for (const kind of ['requirement', 'design', 'plan', 'prototype', 'verification', 'archive']) {
      expect(SUBMIT_PROMPT).toContain('kind=' + kind)
      expect(dispatchSource).toContain('\n  ' + kind + ':')
    }
  })

  it('③ 细则之家·requirement：sides 与「失败与并发路径」节由回执给全文', () => {
    const sides = sidesDeclarationGap('feature', {})
    expect(sides).toBeDefined()
    expect(String(sides)).toContain('sides')
    const section = docSectionGateFailure('feature', '# 需求说明\n\n（没有那一节）\n', Date.now())
    expect(section).toBeDefined()
    expect(section!.message).toContain('失败与并发路径')
    expect(section!.message).toContain('不适用')
    expect(SUBMIT_PROMPT).toContain('由校验回执逐条给出')
  })

  it('④ 细则之家·archive：必填文档与合法去向的拒绝回执带分类限定与规则说明', () => {
    const missingDoc = messageOf(() => assertArchiveMaterials('feature', {
      dir: 'docs/requirements/REQ-261007200706-89b7',
      docs: [{ kind: 'plan', path: 'docs/requirements/REQ-261007200706-89b7/decomposition.md' }],
      mergedInto: ['docs/architecture/x.md'],
      indexEntry: 'x',
      manualUpdates: [{ path: 'docs/architecture/project-manual.md#§1', summary: 's' }],
      manualNote: '',
    }))
    expect(missingDoc).toContain('必填文档')
    expect(missingDoc).toContain('feature 类要求')

    const badTarget = messageOf(() => assertArchiveMaterials('feature', {
      dir: 'docs/requirements/REQ-261007200706-89b7',
      docs: [
        { kind: 'requirement', path: 'r.md' },
        { kind: 'plan', path: 'p.md' },
        { kind: 'verification', path: 'v.md' },
      ],
      mergedInto: ['docs/not-allowed/x.md'],
      indexEntry: 'x',
      manualUpdates: [{ path: 'docs/architecture/project-manual.md#§1', summary: 's' }],
      manualNote: '',
    }))
    expect(badTarget).toContain('不在本类型允许的位置')
  })

  it('⑤ 细则之家·plan：refs / 任务表 / 工作量列三条在各自回执源地有全文', () => {
    // refs 唯一覆盖通道（含「只补文档表 = 依旧红」的关键纠偏）
    const coverage = read('src/application/internal/content-gate-wiring.ts')
    expect(coverage).toContain('requirement_refs')
    expect(coverage).toContain('不再是门禁依据')
    // 文档任务表覆盖 tasks[].key
    const submitArtifact = read('src/application/use-cases/SubmitArtifact.ts')
    expect(submitArtifact).toContain('计划 key')
    expect(submitArtifact).toContain('批准所见')
    // 「验收」「工作量」列的软披露
    const planDocTable = read('src/application/internal/plan-doc-table.ts')
    expect(planDocTable).toContain('工作量')
  })
})
