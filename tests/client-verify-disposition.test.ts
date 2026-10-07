/**
 * 裁决行覆盖控件（REQ-261006201920-2adc FR-3 / FR-4 · serves: FR-3, FR-4）
 *
 * 权威原型：`prototypes/verify-disposition.html#FR-3`（覆盖行展开必填「变更理由」+
 * 原实测结果保留展示）与 `#FR-4`（系统缺口项处置与归档被拦的可见状态）。
 *
 * 本用例盯四件事：
 *   ① 既有四个 DOM 钩子语义不变（`.dsh-pm-vsheet` / `.dsh-pm-vitem[data-item-id]` /
 *      `.dsh-pm-verdict-btn` 单选 / `.dsh-pm-vitem-opinion`）——两处渲染都靠它们收集；
 *   ② 新钩子在场：`.dsh-pm-vitem-change-reason` + `[data-superseded="1"]`，且被覆盖行出现「原实测结果」；
 *   ③ `未复核` 徽标文案取自 `ITEM_STATUS_TEXT.unverified`（不自造第二份）；
 *   ④ 覆盖候选判据与**服务端同构**（needsHuman / 系统缺口项 / 无实测结果 都不是候选）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  changeReasonControl,
  supersededLine,
  isOverrideCandidate,
  renderRtmTable,
  ITEM_STATUS_TEXT,
  type VerifyView,
} from '../src/client/views/panels/verify.js'
import type { VerificationItem } from '../src/shared/protocol.js'

/** 一条验收项（缺省：有 agent 实测结果、可被覆盖）。 */
const item = (over: Partial<VerificationItem> = {}): VerificationItem => ({
  id: 'v2-03',
  source: { kind: 'task', taskId: 't-3a769a' },
  criterion: '裁决通过时必须能复核到实际结果',
  evidence: ['e'],
  status: 'pending',
  result: 'pnpm vitest run tests/verify-item-result.test.ts → 12 passed',
  resultSource: 'agent',
  ...over,
} as VerificationItem)

const view = (items: VerificationItem[]): VerifyView => ({
  sheet: { version: 2, reworkOnly: false, generatedAt: 1, items },
  history: [],
})

describe('覆盖控件：变更理由输入（FR-3）', () => {
  it('覆盖候选行渲染理由输入，且带 `.dsh-pm-vitem-change-reason` 与新钩子', () => {
    const html = changeReasonControl(item())
    expect(html).toContain('dsh-pm-vitem-change-reason')
    expect(html).toContain('data-role="reason-wrap"')
    expect(html).toContain('变更理由')
    // 初始 hidden：人真的改了预填值才由收集侧展开（不给「没改也算覆盖」的错觉）
    expect(html).toContain('hidden')
  })

  it('非候选（人工项 / 系统缺口项 / 本无实测结果）不渲染理由输入', () => {
    expect(changeReasonControl(item({ needsHuman: true }))).toBe('')
    expect(changeReasonControl(item({ gapKind: 'e2e' }))).toBe('')
    expect(changeReasonControl(item({ result: undefined, resultSource: undefined }))).toBe('')
  })

  it('候选判据与服务端同构（三条排除逐条验）', () => {
    expect(isOverrideCandidate(item())).toBe(true)
    expect(isOverrideCandidate(item({ needsHuman: true }))).toBe(false)
    expect(isOverrideCandidate(item({ gapKind: 'orphan' }))).toBe(false)
    expect(isOverrideCandidate(item({ result: '   ' }))).toBe(false)
  })
})

describe('原文留存展示（FR-3）', () => {
  it('被覆盖过的项渲染 `data-superseded="1"` 且含「原实测结果」与变更理由', () => {
    const html = supersededLine(item({
      resultSuperseded: 'agent 原文：12 passed',
      resultChangeReason: 'agent 跑的是旧分支',
    }))
    expect(html).toContain('data-superseded="1"')
    expect(html).toContain('原实测结果（已被覆盖）')
    expect(html).toContain('agent 原文：12 passed')
    expect(html).toContain('变更理由：agent 跑的是旧分支')
  })

  it('从未覆盖过（旧台账）→ 不渲染任何东西（读侧零变化）', () => {
    expect(supersededLine(item())).toBe('')
  })
})

describe('两处渲染都带新控件且有共用实现（FR-3）', () => {
  it('RTM 表（verify.ts 面板）逐项渲染理由输入与 data-override-candidate', () => {
    const html = renderRtmTable(view([item()]), 'REQ-x')
    expect(html).toContain('dsh-pm-vitem-change-reason')
    expect(html).toContain('data-override-candidate="1"')
  })

  it('阶段面板复用同一实现（禁止复制粘贴）：导入而非另写一份', () => {
    // 两处渲染各写一份必然漂移（本仓已有「两处各写一份」的老账）——本锁盯的是**实现只有一份**：
    // stage-panel 导入 verify.ts 的控件，自己那份源码里不再出现新控件的类名字面量。
    const src = readFileSync(new URL('../src/client/stage-panel.ts', import.meta.url), 'utf8')
    expect(src).toContain("from './views/panels/verify.js'")
    expect(src).toContain('changeReasonControl')
    expect(src).toContain('supersededLine')
    expect(src).not.toContain("dsh-pm-vitem-change-reason'")
    expect(src).not.toContain("data-superseded=\\\"1\\\"")
  })
})

describe('既有 DOM 钩子语义不变（FR-3 / FR-4）', () => {
  it('四个既有钩子齐在：作用域 / 项容器 / 单选 / 意见输入', () => {
    const html = renderRtmTable(view([item()]), 'REQ-x')
    expect(html).toContain('dsh-pm-vitem')
    expect(html).toContain('data-item-id="v2-03"')
    expect(html).toContain('dsh-pm-verdict-btn')
    expect(html).toContain('name="verdict-v2-03"')
    expect(html).toContain('dsh-pm-vitem-opinion')
    // 预填口径不变：有 agent 结果的项预填**原文**（value 与台账逐字节相同）
    expect(html).toContain('value="pnpm vitest run tests/verify-item-result.test.ts → 12 passed"')
  })

  it('人工项不预填、但仍渲染裁决单选（既有 FR-5 口径不变）', () => {
    const html = renderRtmTable(view([item({ needsHuman: true, result: undefined })]), 'REQ-x')
    expect(html).toContain('data-needs-human="1"')
    expect(html).not.toContain('is-prefilled')
  })
})

describe('状态徽标文案单一来源（FR-3 · 验收 ⑤）', () => {
  it('未复核 行徽标文本 === ITEM_STATUS_TEXT.unverified（且与已通过不同字）', () => {
    const unverified = renderRtmTable(view([item({ status: 'unverified' })]), 'REQ-x')
    expect(unverified).toContain(ITEM_STATUS_TEXT.unverified!)
    // 不看颜色也能辨：两者的**文字**不同（不是只靠色值区分）
    expect(ITEM_STATUS_TEXT.unverified).not.toBe(ITEM_STATUS_TEXT.passed)
  })
})
