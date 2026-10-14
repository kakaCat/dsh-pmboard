/**
 * 立项注入提示词开关测试（2026-10-09 用户裁定）。
 *
 * 口径：**缺省 false = 不注入**（两份立项文案保留在代码里但不进 systemPrompt；立项改由 agent
 * 自主调 `reqboard_capture` 或人用 `/pm <名称>` 命令）；`true` = 恢复改造前行为（回退开关）。
 * 非法值**装配期抛错**，不静默回缺省（与 `archiveGateSetting` 同口径——"我开了它却还在跑"最难查）。
 */
import { describe, expect, it } from 'vitest'
import { captureGuidanceInjection } from 'pm-core/plugin-config.js'

describe('captureGuidanceInjection', () => {
  it('缺省 false（不写配置 / capture 空对象）——这就是 2026-10-09 裁定的新缺省', () => {
    expect(captureGuidanceInjection(undefined)).toBe(false)
    expect(captureGuidanceInjection({})).toBe(false)
    expect(captureGuidanceInjection({ capture: {} })).toBe(false)
  })

  it('显式 true = 回退到改造前（注入立项引导 / 待捕获提示）', () => {
    expect(captureGuidanceInjection({ capture: { injectGuidance: true } })).toBe(true)
  })

  it('显式 false 与缺省同值（可写死以表达意图）', () => {
    expect(captureGuidanceInjection({ capture: { injectGuidance: false } })).toBe(false)
  })

  it('非法值 → 装配期抛错，且文案含字段名与实际值（失败要响亮）', () => {
    expect(() => captureGuidanceInjection({ capture: { injectGuidance: 'yes' as never } })).toThrow(/capture\.injectGuidance/)
    expect(() => captureGuidanceInjection({ capture: { injectGuidance: 'yes' as never } })).toThrow(/yes/)
    expect(() => captureGuidanceInjection({ capture: { injectGuidance: 1 as never } })).toThrow(/boolean/)
  })
})
