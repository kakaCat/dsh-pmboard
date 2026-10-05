/**
 * L1/L2 单测 · 需求条款引用（refs）通道（REQ-261002164800-d8f2 · t1 / serves: FR-2）。
 *
 * 修前必红（2026-10-02 实测，HEAD 上跑同一段调用）：
 *   `normalizePlanTasks([{…, requirement_refs:['FR-1']}])` 的输出里**没有** requirement_refs ——
 *   协议层按白名单搬运，字段被静默丢弃，落库时卡上 refs 恒空（全仓 590 卡 531 空）。
 *
 * 这组用例守三件事：
 *   ① 合法值去重 + 自然序（FR-2 在 FR-10 前面，不是字典序）；
 *   ② 非法值（X-1 / FR-99x / 空串 / 非字符串）在**提交计划那一刻**就被拒，且点名卡 key 与非法值；
 *   ③ 入参 schema 的声明位置正确——字段必须在 `parameters` 里（曾只声明在返回体上，
 *      入参 additionalProperties:false 直接拒收，等于"没有通道"）。
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  REF_ID_RE,
  REQUIREMENT_REF_ERROR,
  RequirementRefError,
  normalizeRequirementRefs,
  refInvalidReason,
} from '../../src/domain/task/RequirementRefs.js'
import { normalizePlanTasks } from '../../src/shared/protocol.js'
import * as toolModules from '../../src/tools/index.js'

/** 一张最小的合法计划卡（只补 key/标题/实施方案/验收，其余走缺省）。 */
function card(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    key: 't1',
    title: '把 refs 通道接上',
    implementation: '改 src/domain/task/RequirementRefs.ts 与 src/shared/protocol.ts',
    acceptance: 'npx vitest run tests/reqboard/requirement-refs.test.ts 全绿',
    ...extra,
  }
}

describe('normalizeRequirementRefs · 去重与自然序', () => {
  it('缺省（undefined / null）⇒ 空数组，不抛错（存量台账没有该字段是正常态）', () => {
    expect(normalizeRequirementRefs(undefined)).toEqual([])
    expect(normalizeRequirementRefs(null)).toEqual([])
  })

  it('去重并按自然序排列：FR-2 在 FR-10 之前', () => {
    expect(normalizeRequirementRefs(['FR-10', 'FR-2', 'FR-2', 'BUG-1'])).toEqual(['BUG-1', 'FR-2', 'FR-10'])
  })

  it('两侧空白被规整（FR-1 与「 FR-1 」是同一个引用）', () => {
    expect(normalizeRequirementRefs([' FR-1 ', 'FR-1'])).toEqual(['FR-1'])
  })

  it('每条合法前缀都能收下（FR / BUG / RF / SP / DOC / CH）', () => {
    const all = ['FR-1', 'BUG-2', 'RF-3', 'SP-4', 'DOC-5', 'CH-6']
    // 收得下（集合相等）且顺序确定（同前缀按编号，跨前缀按前缀字典序）
    expect(new Set(normalizeRequirementRefs(all))).toEqual(new Set(all))
    expect(normalizeRequirementRefs(all)).toEqual(['BUG-2', 'CH-6', 'DOC-5', 'FR-1', 'RF-3', 'SP-4'])
  })
})

describe('normalizeRequirementRefs · 非法即拒且点名', () => {
  it('X-1（前缀不认识）被拒，消息含该非法值与错误码', () => {
    try {
      normalizeRequirementRefs(['FR-1', 'X-1'], '计划任务 t7 的 requirement_refs')
      throw new Error('应当抛错但没有')
    } catch (err) {
      expect(err).toBeInstanceOf(RequirementRefError)
      expect((err as RequirementRefError).code).toBe(REQUIREMENT_REF_ERROR)
      const msg = (err as Error).message
      expect(msg).toContain('计划任务 t7 的 requirement_refs')
      expect(msg).toContain('X-1')
      expect(msg).toContain(REQUIREMENT_REF_ERROR)
    }
  })

  it('FR-99x（编号不是纯数字）与空串都被拒', () => {
    expect(() => normalizeRequirementRefs(['FR-99x'])).toThrow(RequirementRefError)
    expect(() => normalizeRequirementRefs([''])).toThrow(RequirementRefError)
    expect(refInvalidReason('FR-99x')).toContain('形态不合法')
    expect(refInvalidReason('   ')).toContain('空串')
  })

  it('非数组 / 非字符串项被拒（不是静默过滤）', () => {
    expect(() => normalizeRequirementRefs('FR-1')).toThrow(RequirementRefError)
    expect(() => normalizeRequirementRefs([123])).toThrow(RequirementRefError)
    expect(refInvalidReason(123)).toContain('不是字符串')
  })

  it('REF_ID_RE 与需求文档条款前缀同源', () => {
    expect(REF_ID_RE.test('FR-1')).toBe(true)
    expect(REF_ID_RE.test('fr-1')).toBe(false)
    expect(REF_ID_RE.test('G-1')).toBe(false)
  })
})

describe('normalizePlanTasks · 计划任务表的 refs 不再被丢弃', () => {
  it('保留 requirement_refs（修前：输出里没有这个键）', () => {
    const out = normalizePlanTasks([card({ requirement_refs: ['FR-1'] })])
    expect(out[0]?.requirement_refs).toEqual(['FR-1'])
  })

  it('落库前顺手规整：去重 + 自然序', () => {
    const out = normalizePlanTasks([card({ requirement_refs: ['FR-10', 'FR-2', 'FR-2'] })])
    expect(out[0]?.requirement_refs).toEqual(['FR-2', 'FR-10'])
  })

  it('camelCase 拼法（requirementRefs）同样认', () => {
    const out = normalizePlanTasks([card({ requirementRefs: ['FR-3'] })])
    expect(out[0]?.requirement_refs).toEqual(['FR-3'])
  })

  it('不写该字段时保持缺省（不写空数组，避免"有无声明"两态被抹平）', () => {
    const out = normalizePlanTasks([card({})])
    expect(out[0] !== undefined && 'requirement_refs' in out[0]).toBe(false)
  })

  it('非法值在提交计划时就被拒，消息含卡 key 与非法值', () => {
    try {
      normalizePlanTasks([card({ requirement_refs: ['FR-1', 'FR-99x'] })])
      throw new Error('应当抛错但没有')
    } catch (err) {
      expect((err as { code?: string }).code).toBe(REQUIREMENT_REF_ERROR)
      expect((err as Error).message).toContain('t1')
      expect((err as Error).message).toContain('FR-99x')
    }
  })
})

describe('reqboard_submit 入参 schema · 通道真的打开（构造真工具看编译后的 schema）', () => {
  // 构造即编译 schema：不碰 deps 执行路径，用最小 stub（与 tests/tools-schema.test.ts 同款）
  const tool = (toolModules as unknown as Record<string, (d: unknown) => any>).defineSubmitTool!({} as never)
  const tasksSchema = tool.parameters?.properties?.tasks

  it('tasks.items.properties 含 requirement_refs（此前只在返回体 schema 上，入参收不到）', () => {
    expect(tasksSchema?.items?.properties).toHaveProperty('requirement_refs')
    expect(tasksSchema?.items?.properties?.requirement_refs?.type).toBe('array')
  })

  it('tasks.items 仍是 additionalProperties:false（收与不收必须显式，不靠"多传也能过"）', () => {
    expect(tasksSchema?.items?.additionalProperties).toBe(false)
  })

  it('源码级复核：声明落在 parameters 段内（守住"改回只声明返回体"的倒退）', () => {
    const source = readFileSync(new URL('../../src/tools/SubmitTool/SubmitTool.ts', import.meta.url), 'utf8')
    const parametersBlock = source.slice(source.indexOf('parameters: {'), source.indexOf('output: {'))
    expect(parametersBlock).toContain('requirement_refs')
  })
})
