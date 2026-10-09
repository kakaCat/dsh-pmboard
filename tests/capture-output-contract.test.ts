/**
 * reqboard_capture 回执 ↔ 输出 schema 契约（REQ-261003204143-3219 FR-2）——**反向用例**。
 *
 * 事故（2026-10-03 实测）：五问答案含 workspace（REQ-260929210741-30ae 加的第五问），
 * 但 CaptureTool 的 output.schema.answers 只声明 4 键 + additionalProperties:false，
 * 绑定层（dsh-tools validateJsonSchemaValue）把**每一份**回执判非法——弹框立项必炸：
 *   "value.answers.workspace" is not a declared property (additionalProperties: false)
 *
 * 本用例 = 最小重现：直调 execute 拿**真实回执**（成功 + 取消两条路径），
 * 用 dsh-tools 自带的同一个校验器过工具自己声明的 output.schema——
 * 与绑定层同口径，不是另写一套"差不多"的检查。
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { defineCaptureTool } from './helpers/tool-deps.js'
import {
  CAPTURE_ANSWER_KEYS,
  CAPTURE_QUESTION_IDS,
  mapCaptureAnswers,
} from '../src/application/internal/capture-mapping.js'
import type { AskAnswer } from '../src/application/ports.js'

const W = 'session-capture-contract'

let dir: string
let store: ReturnType<typeof makeTestStore>
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-capture-contract-'))
  store = makeTestStore()
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const NOW = 1_700_000_000_000

function makeSvc(answers: readonly AskAnswer[] | 'abort') {
  return {
    ask: async () => {
      if (answers === 'abort') throw Object.assign(new Error('aborted'), { code: 'ASK_ABORTED' })
      return { answers: [...answers] }
    },
  }
}

/** 与 capture-tool.test.ts 同款的 deps 形状；额外暴露工具声明的 output.schema。 */
function makeTool(svc: unknown) {
  const deps = {
    store,
    now: () => NOW,
    userQuestions: () => svc,
    workspaceRoot: dir,
  } as never
  return defineCaptureTool(deps) as never as {
    execute: (a: unknown, e: unknown) => Promise<unknown>
    output: { schema: unknown }
  }
}

const FOUR_ANSWERS: AskAnswer[] = [
  { id: CAPTURE_QUESTION_IDS.name, selected: ['契约候选'] },
  { id: CAPTURE_QUESTION_IDS.category, selected: ['bug'] },
  { id: CAPTURE_QUESTION_IDS.difficulty, selected: ['standard'] },
  // t1 收口（REQ-261007223647-da5d）：文档位置与工作区合并为「文件落点」，键名 = location
  { id: CAPTURE_QUESTION_IDS.location, selected: ['docs/requirements/<REQ>/'] },
]

describe('reqboard_capture · 回执必须过自己声明的 output.schema（与绑定层同校验器）', () => {
  it('成功路径：四问作答立项的回执通过 output.schema 校验', async () => {
    const tool = makeTool(makeSvc(FOUR_ANSWERS))
    const receipt = await tool.execute({}, { agent: { id: W } })
    expect(validateJsonSchemaValue(tool.output.schema as never, receipt)).toEqual([])
  })

  it('取消路径：用户中止的回执（notCreated 默认 answers 也含 location）通过 output.schema 校验', async () => {
    const tool = makeTool(makeSvc('abort'))
    const receipt = await tool.execute({}, { agent: { id: W } })
    expect(validateJsonSchemaValue(tool.output.schema as never, receipt)).toEqual([])
  })

  // FR-3：answers 键集三方同源——用例产出键 / 共享常量 / schema 声明键。
  // 反向演练②的哨兵：从 CAPTURE_ANSWER_KEYS 摘一个键 → 本用例红并点名缺失键
  // （同时 CaptureTool 的 Record<CaptureAnswerKey> 描述表缺键 → tsc 报错）。
  it('answers 键集同源：mapCaptureAnswers 产出键 === CAPTURE_ANSWER_KEYS === schema 声明键', () => {
    const produced = Object.keys(mapCaptureAnswers(FOUR_ANSWERS).answers).sort()
    const expected = [...CAPTURE_ANSWER_KEYS].sort()
    expect(produced, 'mapCaptureAnswers 的 answers 键集与 CAPTURE_ANSWER_KEYS 漂移').toEqual(expected)

    const tool = makeTool(makeSvc('abort'))
    const declared = Object.keys(
      (tool.output.schema as { properties: { answers: { properties: Record<string, unknown> } } })
        .properties.answers.properties,
    ).sort()
    expect(declared, 'output.schema.answers 声明键与 CAPTURE_ANSWER_KEYS 漂移').toEqual(expected)
  })
})
