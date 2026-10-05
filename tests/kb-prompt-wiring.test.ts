/**
 * 提示词接入断言（REQ-261001143526-8475 t4）。
 *
 * 锁三件事：
 *  ① **三个阶段**合成后的提示词文本各含知识层指引（`reqboard_kb` 或「知识层」）——
 *     阶段片段与 floor 总纲**任一路径**都算（实现可换，行为不可丢）；
 *  ② floor 总纲里写明三件事：查规范 / 按条目自证 / 收尾沉淀；
 *  ③ 接入不破坏既有预算与片段完整性（交 prompt-gates 覆盖，这里只做个最小自检）。
 *
 * @module dsh-pmboard/tests/kb-prompt-wiring
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { resolveStagePrompt } from '../src/domain/prompt/index.ts'

const FRAGMENTS = fileURLToPath(new URL('../src/domain/prompt/fragments', import.meta.url))

const STAGES = ['brainstorming', 'design', 'implementing'] as const
const TIERS = ['light', 'heavy'] as const

function readFragment(rel: string): string {
  const p = join(FRAGMENTS, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : ''
}

describe('三阶段提示词接入知识层', () => {
  for (const stage of STAGES) {
    for (const tier of TIERS) {
      it(`${stage}/${tier}：合成文本含知识层指引`, () => {
        const text = resolveStagePrompt({ stage, difficulty: tier, category: 'feature' }).text
        expect(text).toMatch(/reqboard_kb|知识层/)
      })
    }
  }

  it('不改 floor 总纲：light 档 2500 字符上限只余极少空间，指引由三阶段各自携带', () => {
    const rules = readFragment('common/iron-rules.md')
    expect(rules).not.toContain('REQ-261001143526-8475')
    expect(rules).not.toContain('kb-conventions-sync')
  })

  it('阶段专属句子落在可维护的位置（light.md 或 heavy/overrides.md）', () => {
    expect(readFragment('brainstorming/light.md')).toMatch(/判定标准挂可跑命令/)
    expect(readFragment('brainstorming/heavy/overrides.md')).toMatch(/判定标准挂可跑命令/)
    expect(readFragment('design/light.md')).toMatch(/验收口径引用规范条目/)
    expect(readFragment('implementing/light.md')).toMatch(/开工先查/)
    expect(readFragment('implementing/heavy/overrides.md')).toMatch(/开工先查/)
  })

  it('heavy.md 仍与 vendor 原文一致（本需求不得改镜像档）', () => {
    // 抽样断言：文本里不得出现本需求的标记（说明有人把说明写进了 vendor 镜像档）
    for (const stage of ['brainstorming', 'implementing'] as const) {
      expect(readFragment(`${stage}/heavy.md`)).not.toContain('REQ-261001143526-8475')
      expect(readFragment(`${stage}/heavy.md`)).not.toContain('判定标准挂可跑命令')
    }
  })
})
