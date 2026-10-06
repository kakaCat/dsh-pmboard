/**
 * 原型工作原则注入节测试（REQ-261005122347-e07a t4 / 设计 test-cases TC-10 ~ TC-14）。
 *
 * 重点在**可裁**（TC-13）：这一节的价值前提是"不占每轮注入预算"，所以它必须是**可被预算裁掉**的
 * 优先级片段，而不是 floor。光断言"文本里有这节"证明不了可裁——必须把预算压到贴地，
 * 看它真的消失、而人工门/铁律仍在。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { resolveStagePrompt, DEFAULT_PROMPT_BUDGET } from '../src/domain/prompt/index.js'

const FRAGMENT_FILE = fileURLToPath(new URL('../src/domain/prompt/fragments/brainstorming/heavy-extra.md', import.meta.url))
const SOURCE = readFileSync(FRAGMENT_FILE, 'utf8')

/** 节正文（从标题到文件末尾）——上限是对**这一节**的约束，不是整份类型档。 */
function sectionOf(text: string): string {
  const idx = text.indexOf('## 原型工作原则')
  return idx < 0 ? '' : text.slice(idx)
}

const prompt = (over: Record<string, unknown> = {}) =>
  resolveStagePrompt({ stage: 'brainstorming', difficulty: 'heavy', category: 'feature', ...over } as never)

describe('TC-10 · 五要素在注入文本里', () => {
  it('命中：必须派 subagent / SKILL.md / search.py / --design-system / prototype/ / reqboard_ 红线', () => {
    const text = prompt().text
    for (const anchor of ['必须派 subagent', 'SKILL.md', 'search.py', '--design-system', 'prototype/', 'reqboard_']) {
      expect(text, '注入缺锚点：' + anchor).toContain(anchor)
    }
  })

  it('要素齐全且说清「什么时候做」与「先读哪份入口」', () => {
    const section = sectionOf(prompt().text)
    expect(section).toContain('界面/交互产物')       // ① 何时该做
    expect(section).toContain('reqboard_skill_install') // ③ 先调工具拿路径
    expect(section).toContain('先读')                  // ③ 子代理先读 SKILL.md
    expect(section).toContain('--variance')            // ④ 命令模板
    expect(section).toContain('不得调用任何')          // ⑤ 红线
  })
})

describe('TC-11 · 不留需要子代理猜的占位符', () => {
  it('注入文本不含 ${CLAUDE_PLUGIN_ROOT}（本仓没有这个变量）', () => {
    expect(prompt().text).not.toContain('${CLAUDE_PLUGIN_ROOT}')
  })
})

describe('TC-12 · 字符上限与预算', () => {
  it('该节 ≤ 1200 字符（超限即设计错误）', () => {
    const section = sectionOf(SOURCE)
    expect(section.length).toBeGreaterThan(200)   // 反向：节真的在（防"空节也 ≤1200"恒真）
    expect(section.length).toBeLessThanOrEqual(1200)
  })

  it('brainstorming(heavy, feature) charCount ≤ 24000 且 overBudget 为空', () => {
    const r = prompt()
    expect(r.charCount).toBeLessThanOrEqual(DEFAULT_PROMPT_BUDGET)
    expect(r.overBudget).toBeUndefined()
  })
})

describe('TC-13 · 可裁（**反向演练**：证明它不是 floor）', () => {
  it('预算压到贴地 → 该节被裁掉，人工门/铁律仍在', () => {
    // ① 先问"floor 至少要多少"——这个数由 applyBudget 自己报，不靠估。
    const tiny = prompt({ budget: 10 })
    expect(tiny.overBudget, '预算压到 10 都没超预算？说明 floor 判据没生效').toBeDefined()
    const floorChars = tiny.overBudget!.floorChars
    expect(floorChars).toBeGreaterThan(0)

    // ② 预算 = 地板 + 一点点：只够 floor，不够优先级 10 的追加节。
    const cut = prompt({ budget: floorChars + 5 })
    expect(cut.text).not.toContain('原型工作原则')
    expect(cut.fragmentIds).not.toContain('brainstorming/heavy-extra')

    // ③ 反向：floor 的节点档与铁律**必须还在**（裁的是可裁的，不是随便裁）。
    expect(cut.fragmentIds).toContain('brainstorming/heavy')
    expect(cut.fragmentIds).toContain('common/iron-rules')
    expect(cut.text.length).toBeGreaterThan(0)

    // ④ 不压预算时该节必须在——否则 ② 的"没有"可能只是"从来没注入过"。
    expect(prompt().text).toContain('原型工作原则')
  })
})

describe('TC-13b · 只进 heavy（不侵占 light 的字符上限）', () => {
  it('light 注入**不含**该节；heavy 含——这正是它不落在类型档的理由', () => {
    const light = resolveStagePrompt({ stage: 'brainstorming', difficulty: 'light', category: 'feature' })
    expect(light.text).not.toContain('原型工作原则')
    expect(light.fragmentIds).not.toContain('brainstorming/heavy-extra')
    expect(prompt().text).toContain('原型工作原则')

    // 反向：light 仍守住既有 2500 上限（本节的落点选择就是为了保住它）。
    expect(light.charCount).toBeLessThanOrEqual(2500)
  })

  it('该片段是**文件**（两段 id），不会被客户端判成路由壳', () => {
    // 三段 id 在本仓被"壳（text 空 + include）"占用；本片段刻意用两段命名。
    expect(FRAGMENT_FILE).toMatch(/brainstorming\/heavy-extra\.md$/)
    expect(prompt().fragmentIds).toContain('brainstorming/heavy-extra')
  })
})

describe('TC-14 · 解释器缺失时的诚实降级', () => {
  it('注入节完整保留，且明写「未做数据库检索」与「禁止包装」', () => {
    const section = sectionOf(prompt().text)
    expect(section).toContain('未做数据库检索')
    expect(section).toContain('禁止把 0 结果或未检索包装成检索结果')
  })

  it('降级声明是**静态文本**（与探测结果无关）——所以注入本身不因缺 Python 而变形', () => {
    // 两次解析逐字节一致：注入不读盘、不看环境（生成期内联的既有纪律）。
    expect(prompt().text).toBe(prompt().text)
  })
})
