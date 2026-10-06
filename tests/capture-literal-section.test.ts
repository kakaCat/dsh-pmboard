/**
 * 捕获段「字面量」契约回归（REQ-261005165552-6783 · FR-2）
 *
 * 为什么要有这份用例：捕获段的正文里含**外来原文**——用户消息节选、在制任务的说明与验收标准、
 * 需求标题。而宿主对 section 的**缺省语义是模板**：逐字扫描变量组，名字非法或未注册即抛错；
 * 抛错点在**系统提示词装配处** ⇒ 该窗口每一轮都跑不起来（模型一次都没执行）。
 * 实测事故：REQ-261005105032-3b02 的窗口因在制卡验收标准里引用了模板占位符而整轮卡死。
 *
 * 三组反例各跑两态：
 *   · 证伪半——同一文本在 `interpolate: true`（宿主缺省语义）下**必须抛**，
 *     否则本文件就是恒真装饰（本仓既有教训）；
 *   · 保真半——声明字面量后原样返回，且文本**逐字**包含该占位符（不做转义/清洗）。
 *
 * serves: FR-2
 */
import { describe, expect, it } from 'vitest'
import { boundSectionTextFrom, capturePromptForMessage } from '../src/application/internal/capture-section.js'
import type { RequirementFacts } from '../src/domain/requirement/RequirementSummary.js'
import type { TaskRecord } from '../src/shared/protocol.js'

// ── 与宿主同语义的**只读参考判据**（对齐 dsh 的 renderPrompt → interpolate）───────────
// 口径与 design/interfaces.md「宿主插值器的错误语义」表逐条对应；
// 判据自身的正确性由现场台账反证：事故报错文本与本判据的抛错文案同形。
const VARIABLE_NAME = /^[a-z][a-z0-9_]*$/
const GROUP_AT = /^\{\{([^{}]*)\}\}/
/** 本插件从不注册宿主变量（全仓无 systemPrompt.variable 调用）→ 变量表恒为空。 */
const HOST_VARIABLES: Record<string, string> = {}

interface SectionLike {
  name: string
  text: string
  interpolate?: boolean
}

/** 宿主 renderPrompt 对该段的行为：`interpolate === false` 原样返回，否则扫描变量组。 */
function hostLikeRender(section: SectionLike): string {
  if (section.interpolate === false) return section.text
  const text = section.text
  let out = ''
  let last = 0
  for (let open = text.indexOf('{{'); open >= 0; open = text.indexOf('{{', last)) {
    const group = GROUP_AT.exec(text.slice(open))
    if (group === null) {
      // 有 {{ 但之后没有任何 }} → 当普通散文（宿主同款）
      if (text.indexOf('}}', open + 2) >= 0) {
        throw new Error(`malformed prompt variable reference at "${text.slice(open, open + 16)}…" in section "${section.name}"`)
      }
      out += text.slice(last, open + 2)
      last = open + 2
      continue
    }
    const name = group[0].slice(2, -2)
    if (!VARIABLE_NAME.test(name)) {
      throw new Error('malformed prompt variable reference "{{' + name + '}}" in section "' + section.name + '"')
    }
    if (!Object.hasOwn(HOST_VARIABLES, name)) {
      throw new Error('unknown prompt variable "{{' + name + '}}" in section "' + section.name + '"')
    }
    out += text.slice(last, open) + HOST_VARIABLES[name]
    last = open + group[0].length
  }
  return out + text.slice(last)
}

// ── 标本（内存构造，不写盘）─────────────────────────────────────────────────────
const WINDOW = 'session-literal-section-1'
const SECTION = 'reqboard:capture'
/** 名字非法（全大写）→ 宿主判 malformed（模板里到处都是这种占位符）。 */
const PLACEHOLDER_UPPER = '{{NOPE}}'
/** 名字合法但本插件未注册 → 宿主判 unknown。 */
const PLACEHOLDER_LOWER = '{{nope}}'
const CTX = { agent: { id: WINDOW } }

function factsWith(title: string): RequirementFacts {
  return {
    id: 'REQ-t-literal',
    title,
    description: '',
    status: 'implementing',
    updatedAt: 1,
    version: 1,
    sourceSessionId: WINDOW,
    artifacts: [],
  }
}

function taskWith(acceptance: string, description = ''): TaskRecord {
  return {
    id: 't-abc123',
    requirementId: 'REQ-t-literal',
    title: '加模板门禁探针',
    description,
    phase: 'test',
    side: 'backend',
    dependsOn: [],
    acceptance,
    context: '',
    status: 'in_progress',
  } as unknown as TaskRecord
}

/** 两态判据：证伪半（必抛）+ 保真半（原样返回）。 */
function expectLiteralAndFalsifiable(text: string, pattern: RegExp = /malformed prompt variable reference/): void {
  const literal: SectionLike = { name: SECTION, text, interpolate: false }
  const asTemplate: SectionLike = { name: SECTION, text, interpolate: true }
  // 保真半
  expect(hostLikeRender(literal)).toBe(text)
  // 证伪半：同一文本按宿主缺省语义（模板）渲染必须抛 —— 证明上面的保真不是恒真
  expect(() => hostLikeRender(asTemplate)).toThrow(pattern)
}

describe('捕获段字面量契约（三组外来原文含占位符）', () => {
  it('反例①：在制任务的验收标准/说明里引用了模板占位符 → 段文本字面保真且不抛', () => {
    const task = taskWith(
      `往模板塞未登记占位符 ${PLACEHOLDER_UPPER} → 退出码 1 且点名该占位符`,
      `说明里同样引用了它：${PLACEHOLDER_UPPER}`,
    )
    const text = boundSectionTextFrom([factsWith('普通标题')], [task], CTX)
    expect(text).toContain('【当前任务执行中】')
    expect(text).toContain(PLACEHOLDER_UPPER)
    expectLiteralAndFalsifiable(text)
  })

  it('反例①变体：名字合法但未注册的占位符 → 走另一类抛错（unknown），保真口径相同', () => {
    const task = taskWith(`用 ${PLACEHOLDER_LOWER} 这种小写名字也一样炸`)
    const text = boundSectionTextFrom([factsWith('普通标题')], [task], CTX)
    expect(text).toContain(PLACEHOLDER_LOWER)
    expectLiteralAndFalsifiable(text, /unknown prompt variable/)
  })

  it('反例②：用户消息节选里含占位符（例如直接贴本次报错）→ 动态引导文本字面保真且不抛', () => {
    const message = `这个项目报错：malformed prompt variable reference "${PLACEHOLDER_UPPER}" in section "reqboard:capture" 你看看`
    const text = capturePromptForMessage(WINDOW, message)
    expect(text).toContain(PLACEHOLDER_UPPER)
    expectLiteralAndFalsifiable(text)
  })

  it('反例③：需求标题里含占位符（台账字段，人可改）→ 绑定段清单行字面保真且不抛', () => {
    const text = boundSectionTextFrom([factsWith(`修复 ${PLACEHOLDER_UPPER} 打挂窗口`), ], undefined, CTX)
    expect(text).toContain(PLACEHOLDER_UPPER)
    expectLiteralAndFalsifiable(text)
  })

  it('判据自检：孤立的 {{ 是普通散文，宿主不抛（防判据比宿主更严）', () => {
    const text = '这里有半个花括号 {{ 后面没有闭合，属普通散文'
    expect(hostLikeRender({ name: SECTION, text, interpolate: true })).toBe(text)
    expect(hostLikeRender({ name: SECTION, text, interpolate: false })).toBe(text)
  })

  it('保真口径：段文本按原样进提示词，不做转义/清洗（用户原话与卡上验收原文逐字保留）', () => {
    const raw = `原文：${PLACEHOLDER_UPPER} 与 ${PLACEHOLDER_LOWER}`
    const task = taskWith(raw)
    const text = boundSectionTextFrom([factsWith('普通标题')], [task], CTX)
    expect(text).toContain(raw)
    // 没有把花括号换成别的字符（既不换成全角、也不加空格）
    expect(text).not.toContain('｛｛')
    expect(text).not.toContain('{ {')
  })
})
