/**
 * 归档闸门配置解析测试（REQ-261004183621-de3f t5 / FR-6）。
 *
 * 重点：非法值**装配期抛错**，不静默回缺省（"我设了 warn 却被当成 enforce"最难查）。
 */
import { describe, expect, it } from 'vitest'
import { archiveGateSetting } from '../src/plugin-config.ts'

describe('archiveGateSetting', () => {
  it('缺省 enforce（不写配置 / archive 空对象）', () => {
    expect(archiveGateSetting(undefined)).toBe('enforce')
    expect(archiveGateSetting({})).toBe('enforce')
    expect(archiveGateSetting({ archive: {} })).toBe('enforce')
  })

  it('显式两个合法值原样返回', () => {
    expect(archiveGateSetting({ archive: { unlistedGate: 'enforce' } })).toBe('enforce')
    expect(archiveGateSetting({ archive: { unlistedGate: 'warn' } })).toBe('warn')
  })

  it('非法值 → 装配期抛错，且文案含字段名与实际值（失败要响亮）', () => {
    expect(() => archiveGateSetting({ archive: { unlistedGate: 'block' as never } })).toThrow(/archive\.unlistedGate/)
    expect(() => archiveGateSetting({ archive: { unlistedGate: 'block' as never } })).toThrow(/block/)
    expect(() => archiveGateSetting({ archive: { unlistedGate: 1 as never } })).toThrow(/enforce/)
  })
})
