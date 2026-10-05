// serves: FR-1, FR-2
/**
 * 长文本入参约定（REQ-261002115204-ba52 · serves: FR-1 / FR-2）——文案契约与覆盖守护。
 * 来源：原需求 REQ-261002110908-81d0（因落库死锁停摆），本条重开需求复用同一份实现与用例。
 *
 * 为什么要有这个文件：约定若只是"写进描述"，删掉一个字都不会有人发现。
 * 「三条锚点 + 覆盖清单遍历 + 两条反向证伪」才让"约定在场"成为可证伪的事实。
 *
 * 由来事故（2026-10-02，实测两次）：模型在中文串里漏转义半角双引号 →
 * 工具参数 JSON 非法 → DSH 适配器判 MALFORMED_RESPONSE → **整个回合报废**（任务卡汇报永远落不了库）。
 *
 * 用例编号对应 design/test-cases.md：TC-1 / TC-1b / TC-2 / TC-4 / TC-5。
 */
import { describe, it, expect } from 'vitest'
import { LONG_TEXT_ARG_NOTE, LONG_TEXT_FIELDS } from '../src/tools/shared.js'
import {
  defineTaskReportTool,
  defineSubmitTool,
  defineAskConfirmTool,
  defineTaskMoveTool,
  defineCaptureTool,
  defineNoteInterruptionTool,
  defineTaskAdoptTool,
  defineRegenerateTool,
} from '../src/tools/index.js'
import { TASK_REPORT_PROMPT } from '../src/tools/TaskReportTool/prompt.js'

/** 三条锚点：文案丢任一条，本文件必须红。 */
const ANCHORS: readonly { readonly id: string; readonly hit: (text: string) => boolean }[] = [
  { id: '短句上限', hit: t => t.includes('短句') && t.includes('60') },
  { id: '「」代引号', hit: t => t.includes('「」') },
  { id: '拆多次调用', hit: t => t.includes('拆成多次调用') },
]

/** 返回缺失的锚点 id（空数组 = 通过）。反向用例直接喂假文本给它，证明断言不是恒真。 */
export function assertNoteAnchors(description: string): string[] {
  return ANCHORS.filter(a => !a.hit(description)).map(a => a.id)
}

/** 覆盖清单里的工具名 → 工具壳工厂（清单新增工具时这里必须同步，否则用例红）。 */
const FACTORIES: Record<string, (deps: never) => { parameters?: { properties?: Record<string, { description?: string }> } }> = {
  reqboard_task_report: defineTaskReportTool as never,
  reqboard_submit: defineSubmitTool as never,
  reqboard_ask_confirm: defineAskConfirmTool as never,
  reqboard_task_move: defineTaskMoveTool as never,
  reqboard_capture: defineCaptureTool as never,
  reqboard_note_interruption: defineNoteInterruptionTool as never,
  reqboard_task_adopt: defineTaskAdoptTool as never,
  reqboard_task_regenerate: defineRegenerateTool as never,
}

const descriptionOf = (tool: string, field: string): string => {
  const factory = FACTORIES[tool]
  if (factory === undefined) return ''
  const def = factory({} as never) as { parameters?: { properties?: Record<string, { description?: string }> } }
  return def.parameters?.properties?.[field]?.description ?? ''
}

describe('TC-1 约定常量（FR-2）', () => {
  it('LONG_TEXT_ARG_NOTE 同时含三锚点，且 ≤120 字（不挤占注入预算）', () => {
    expect(assertNoteAnchors(LONG_TEXT_ARG_NOTE)).toEqual([])
    expect(LONG_TEXT_ARG_NOTE.length).toBeLessThanOrEqual(120)
  })

  it('反向：缺锚点必须报缺（证明断言非恒真）', () => {
    expect(assertNoteAnchors('随便一段没有约定的文本')).toEqual(['短句上限', '「」代引号', '拆多次调用'])
    expect(assertNoteAnchors(LONG_TEXT_ARG_NOTE.replace('「」', ''))).toEqual(['「」代引号'])
    expect(assertNoteAnchors(LONG_TEXT_ARG_NOTE.replace('拆成多次调用', ''))).toEqual(['拆多次调用'])
    expect(assertNoteAnchors(LONG_TEXT_ARG_NOTE.replace('60', ''))).toEqual(['短句上限'])
  })

  it('覆盖清单登记 ≥7 个工具，且每个工具名都已登记工厂', () => {
    expect(new Set(LONG_TEXT_FIELDS.map(f => f.tool)).size).toBeGreaterThanOrEqual(7)
    for (const f of LONG_TEXT_FIELDS) expect(FACTORIES[f.tool], f.tool).toBeTypeOf('function')
  })
})

describe('TC-1b 报告工具描述（FR-1）', () => {
  it('TASK_REPORT_PROMPT 含三锚点', () => {
    expect(assertNoteAnchors(TASK_REPORT_PROMPT)).toEqual([])
  })

  it('summary / completed / next_step 的参数说明各含三锚点', () => {
    for (const field of ['summary', 'completed', 'next_step']) {
      expect(assertNoteAnchors(descriptionOf('reqboard_task_report', field)), field).toEqual([])
    }
  })

  it('completed 的说明点明"每条短句"与「」（事故原文正是裸半角引号）', () => {
    const d = descriptionOf('reqboard_task_report', 'completed')
    expect(d).toContain('每条短句')
    expect(d).toContain('「」')
  })
})

describe('TC-2 覆盖清单遍历（FR-2）', () => {
  it('清单内每个「工具.字段」的描述都带约定；缺失时报出名单', () => {
    const missing: string[] = []
    for (const f of LONG_TEXT_FIELDS) {
      const d = descriptionOf(f.tool, f.field)
      if (d.length === 0) {
        missing.push(f.tool + '.' + f.field + '（字段不存在或描述为空）')
        continue
      }
      const gaps = assertNoteAnchors(d)
      if (gaps.length > 0) missing.push(f.tool + '.' + f.field + '（缺 ' + gaps.join('/') + '）')
    }
    expect(missing).toEqual([])
  })
})

describe('TC-4 反向：未接约定的字段会被拦住（FR-2）', () => {
  it('未接约定的长文本描述 → 断言报缺；遍历口径同样点名', () => {
    const raw = '完成项列表（1-50 条）'
    expect(assertNoteAnchors(raw)).not.toEqual([])
    const fake = [{ tool: 'reqboard_task_report', field: 'completed' }]
    const missing: string[] = []
    for (const f of fake) {
      const desc = raw
      const gaps = assertNoteAnchors(desc)
      if (gaps.length > 0) missing.push(f.tool + '.' + f.field)
    }
    expect(missing).toEqual(['reqboard_task_report.completed'])
  })
})

describe('TC-5 零变更核验（FR-1 / FR-2 · design/data-model.md §3 表）', () => {
  it('reqboard_task_report 入参：字段名集合与必填集合与基线一致', () => {
    const def = defineTaskReportTool({} as never) as unknown as {
      parameters: { properties: Record<string, unknown>; required: string[] }
    }
    expect(Object.keys(def.parameters.properties).sort()).toEqual([
      'completed', 'files_changed', 'next_step', 'summary', 'task_id',
    ])
    expect([...def.parameters.required].sort()).toEqual(['summary', 'task_id'])
  })

  it('reqboard_task_report 返回体：schema 键集合与基线一致', () => {
    const def = defineTaskReportTool({} as never) as unknown as {
      output: { schema: { properties: Record<string, unknown> } }
    }
    expect(Object.keys(def.output.schema.properties).sort()).toEqual([
      'artifact_registered', 'doc_path', 'note', 'report_index', 'requirement_id', 'success', 'task_id',
    ])
  })
})
