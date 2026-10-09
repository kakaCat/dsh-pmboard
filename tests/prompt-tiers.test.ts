/**
 * t7 验收：六节点 light/heavy 分片（REQ-422af1 t7）。
 *
 * 断言（逐条对应 t7 验收口径）：
 *   ① 六节点 light 与 heavy 解析出的文本**不同**（难度轴生效）；
 *   ② 每节点 light 的 charCount < heavy 的 charCount；
 *   ③ brainstorming/heavy 为本仓自写完整档（2026-10-08 裁定：vendor 流程与本仓阶段边界冲突）；
 *   ④ VENDOR_MAIN_SKILLS 映射内 3 个 vendor 主 skill 的 heavy 镜像逐字一致（防漂移）；
 *   ⑤ light **不含** heavy 独有要素关键词（省 token 的来源）；
 *   ⑥ 注入顺序固定三段：vendor 原文 → overrides（floor）→ common/iron-rules；
 *   ⑦ heavy 主 skill 原文不裁（预算极小时 floor 仍保留、结构化报超限）；
 *   ⑧ decomposing 例外：superpowers 无对应 skill，heavy 为自写档。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  resolveStagePrompt,
  FRAGMENT_LIBRARY,
  PROMPT_STAGES,
  STAGE_CHAIN,
  type Fragment,
  type PromptStage,
} from '../src/domain/prompt/index.js'

const SRC = fileURLToPath(new URL('../src', import.meta.url))
const VENDOR_DIR = join(SRC, 'domain/prompt/vendor/superpowers')
const FRAGMENTS_DIR = join(SRC, 'domain/prompt/fragments')

/** heavy 主 skill 的唯一映射（与 scripts/inline-prompt-fragments.mjs 的 VENDOR_MAIN_SKILLS 同源）。 */
const VENDOR_MAIN_SKILLS: Readonly<Record<string, string>> = {
  // 2026-10-08 用户裁定：brainstorming 移除（vendor「澄清→提方案→分段呈现设计」流程与本仓
  // 阶段边界冲突——设计属 design 节点；heavy 改本仓自写完整档，vendor 原文留档不注入）
  // 2026-09-21 用户裁定：design 移除（设计阶段只写设计文档，heavy 为自写档）
  // 2026-10-08 用户裁定（REQ-261008190515-5212）：implementing 移除（vendor 实施阶段主 skill
  // v6.4.2 改为 inline 专版、明说「不派子代理」，与本仓任务卡 + 子代理模式相冲；heavy 改本仓
  // 自写完整档，原镜像关系见 vendor/superpowers/ATTRIBUTION.md §3）
  accepting: 'verification-before-completion',
  archived: 'finishing-a-development-branch',
}

/** 每节点 heavy 独有要素关键词（逐字来自 vendor 原文 / 自写完整档）。 */
const HEAVY_ONLY: Readonly<Record<PromptStage, readonly string[]>> = {
  brainstorming: ['Three Paths', 'YAGNI', 'Red Flags', 'Spike', 'Bounded', 'Architectural'],
  design: ['设计文档集', '接口与数据契约先定死', '不写任务表'],
  decomposing: ['变更盘点', '批次与依赖', '边界校验'],
  implementing: ['The Task Loop', 'Common Rationalizations'],
  accepting: ['The Iron Law', 'Rationalization Prevention'],
  archived: ['Present Options', 'Common Rationalizations'],
}

function fragmentById(id: string): Fragment {
  const f = FRAGMENT_LIBRARY.find((x) => x.id === id)
  if (f === undefined) throw new Error('找不到分片：' + id)
  return f
}

function vendorText(skill: string): string {
  return readFileSync(join(VENDOR_DIR, skill, 'SKILL.md'), 'utf8')
}

describe('t7 链声明物化：每个节点的 light 与 heavy 都含与 STAGE_CHAIN 一致的交棒行', () => {
  for (const stage of PROMPT_STAGES) {
    it(stage + '：light/heavy 的「下一步」与 STAGE_CHAIN 逐字一致', () => {
      const label = STAGE_CHAIN[stage].label
      for (const difficulty of ['light', 'heavy'] as const) {
        const text = resolveStagePrompt({ stage, difficulty }).text
        expect(text, stage + '/' + difficulty + ' 缺链声明').toContain('下一步：')
        expect(text, stage + '/' + difficulty + ' 的链声明与 STAGE_CHAIN 不一致').toContain(label)
      }
    })
  }
})

describe('t7 ① 六节点 light/heavy 分化', () => {
  for (const stage of PROMPT_STAGES) {
    it(stage + '：light 与 heavy 解析出的文本不同', () => {
      const light = resolveStagePrompt({ stage, difficulty: 'light' }).text
      const heavy = resolveStagePrompt({ stage, difficulty: 'heavy' }).text
      expect(light).not.toBe(heavy)
      expect(light.length).toBeGreaterThan(0)
      expect(heavy.length).toBeGreaterThan(light.length)
    })

    it(stage + '：light charCount < heavy charCount', () => {
      const light = resolveStagePrompt({ stage, difficulty: 'light' })
      const heavy = resolveStagePrompt({ stage, difficulty: 'heavy' })
      expect(light.charCount, stage).toBeLessThan(heavy.charCount)
      // light 档设计上限 2500 字符（fragments.md §8）
      expect(light.charCount, stage + ' light 超 2500 字符上限').toBeLessThanOrEqual(2500)
    })
  }
})

describe('t7 ③ brainstorming/heavy 为本仓自写完整档（2026-10-08 裁定）', () => {
  it('brainstorming 不在 vendor 映射里，且其 heavy 含自写完整档要素', () => {
    expect(Object.keys(VENDOR_MAIN_SKILLS)).not.toContain('brainstorming')
    const heavy = fragmentById('brainstorming/heavy')
    // 自写完整档要素：保留 vendor 纪律骨架 + 本仓阶段边界（设计归 design 节点）
    for (const kw of ['自写完整档', 'Three Paths', 'YAGNI', 'Red Flags', 'requirement.md', 'design 节点']) {
      expect(heavy.text, 'brainstorming heavy 应含「' + kw + '」').toContain(kw)
    }
    // 与任何 vendor 原文都不相同（不是 vendor 拷贝）
    for (const skill of ['brainstorming', ...Object.values(VENDOR_MAIN_SKILLS)]) {
      expect(heavy.text).not.toBe(vendorText(skill))
    }
    // vendor 原文仍留档（来源与许可可追溯），只是不再注入
    expect(vendorText('brainstorming')).toContain('Brainstorming')
  })

  it('brainstorming/heavy 解析文本以完整档为前缀（主档在前，overrides 在后）', () => {
    const heavy = fragmentById('brainstorming/heavy')
    const resolved = resolveStagePrompt({ stage: 'brainstorming', difficulty: 'heavy' }).text
    expect(resolved.startsWith(heavy.text)).toBe(true)
    expect(resolved.length).toBeGreaterThan(heavy.text.length)
  })
})

describe('t7 ④ heavy 主 skill 镜像逐字一致（映射内 3 节点）', () => {
  for (const [stage, skill] of Object.entries(VENDOR_MAIN_SKILLS)) {
    it(stage + '/heavy === vendor/' + skill + '/SKILL.md', () => {
      const vendor = vendorText(skill)
      expect(fragmentById(stage + '/heavy').text).toBe(vendor)
      expect(Buffer.compare(Buffer.from(fragmentById(stage + '/heavy').text, 'utf8'), Buffer.from(vendor, 'utf8'))).toBe(0)
    })
  }

  it('vendor 目录的 ATTRIBUTION.md 记录 repo / tag / commit / MIT / 抓取时点', () => {
    const p = join(VENDOR_DIR, 'ATTRIBUTION.md')
    expect(existsSync(p), 'ATTRIBUTION.md 缺失').toBe(true)
    const text = readFileSync(p, 'utf8')
    expect(text).toContain('https://github.com/obra/superpowers.git')
    expect(text).toContain('v6.4.2')
    expect(text).toContain('8ca22dba9a94f28898bbce59f2537ff4d87c747d')
    expect(text).toContain('MIT')
    expect(text).toContain('抓取时点')
  })
})

describe('t7 ⑤ light 不含 heavy 独有要素关键词', () => {
  for (const stage of PROMPT_STAGES) {
    it(stage + '：light 不含 heavy 独有要素，且 heavy 确实含（关键词集有效）', () => {
      const light = resolveStagePrompt({ stage, difficulty: 'light' }).text
      const heavy = resolveStagePrompt({ stage, difficulty: 'heavy' }).text
      for (const kw of HEAVY_ONLY[stage]) {
        expect(heavy, stage + ' heavy 应含「' + kw + '」').toContain(kw)
        expect(light, stage + ' light 不应含 heavy 独有要素「' + kw + '」').not.toContain(kw)
      }
    })
  }
})

describe('t7 ⑥ 注入顺序固定三段：主档（vendor 原文或自写完整档）→ overrides → common/iron-rules', () => {
  // brainstorming 虽不在 vendor 映射（自写完整档），三段顺序同样锁定
  for (const stage of ['brainstorming', ...Object.keys(VENDOR_MAIN_SKILLS)] as PromptStage[]) {
    it(stage + '：heavy → overrides → iron-rules 的 fragmentIds 顺序正确', () => {
      const r = resolveStagePrompt({ stage, difficulty: 'heavy' })
      const iHeavy = r.fragmentIds.indexOf(stage + '/heavy')
      const iOver = r.fragmentIds.indexOf(stage + '/heavy/overrides')
      const iIron = r.fragmentIds.indexOf('common/iron-rules')
      expect(iHeavy, stage + ' 缺 heavy').toBeGreaterThanOrEqual(0)
      expect(iOver, stage + ' 缺 overrides').toBeGreaterThan(iHeavy)
      expect(iIron, stage + ' 缺 common/iron-rules（或未排最后）').toBeGreaterThan(iOver)
      // overrides 首行声明"覆盖上文"（原文在前、本仓接线在后）
      expect(fragmentById(stage + '/heavy/overrides').text).toContain('覆盖上文')
    })
  }

  it('light：节点内容在前、common/iron-rules 在后', () => {
    for (const stage of PROMPT_STAGES) {
      const r = resolveStagePrompt({ stage, difficulty: 'light' })
      expect(r.fragmentIds[r.fragmentIds.length - 1], stage).toBe('common/iron-rules')
    }
  })
})

describe('t7 ⑦ heavy 主 skill 原文不裁（预算极小时 floor 保留 + 结构化超限）', () => {
  it('极小预算下 brainstorming/heavy 的主档仍在 fragmentIds，且返回 overBudget', () => {
    const r = resolveStagePrompt({ stage: 'brainstorming', difficulty: 'heavy', budget: 5 })
    expect(r.fragmentIds).toContain('brainstorming/heavy')
    expect(r.fragmentIds).toContain('brainstorming/heavy/overrides')
    expect(r.fragmentIds).toContain('common/iron-rules')
    expect(r.overBudget?.reason).toBe('floor-exceeds-budget')
    expect(r.text.startsWith(fragmentById('brainstorming/heavy').text)).toBe(true)
  })

  it('全部 light/heavy 的节点内容与铁律都是 floor（永不裁）', () => {
    const nonFloor: string[] = []
    for (const f of FRAGMENT_LIBRARY) {
      const isNodeVoice = /^(light|heavy)$/.test(f.id.split('/').pop() ?? '')
        || f.id.endsWith('/overrides')
        || f.id === 'common/iron-rules'
      if (isNodeVoice && f.priority !== 'floor') nonFloor.push(f.id)
    }
    expect(nonFloor, '以下分片应为 floor（不可裁）：\n' + nonFloor.join('\n')).toEqual([])
  })
})

describe('t7 ⑧ decomposing 例外：superpowers 无对应 skill，heavy 自写', () => {
  it('decomposing 不在 vendor 映射里，且其 heavy 含自写完整档要素', () => {
    expect(Object.keys(VENDOR_MAIN_SKILLS)).not.toContain('decomposing')
    const heavy = fragmentById('decomposing/heavy')
    expect(heavy.text).toContain('变更盘点')
    expect(heavy.text).toContain('薄卡拒落')
    // 与任何 vendor 原文都不相同（不是 vendor 拷贝）
    for (const skill of Object.values(VENDOR_MAIN_SKILLS)) {
      expect(heavy.text).not.toBe(vendorText(skill))
    }
  })

  it('六节点各有 light.md 与 heavy.md 源文件（decomposing 的 heavy 为自写）', () => {
    for (const stage of PROMPT_STAGES) {
      expect(existsSync(join(FRAGMENTS_DIR, stage, 'light.md')), stage + '/light.md').toBe(true)
      expect(existsSync(join(FRAGMENTS_DIR, stage, 'heavy.md')), stage + '/heavy.md').toBe(true)
    }
  })
})
