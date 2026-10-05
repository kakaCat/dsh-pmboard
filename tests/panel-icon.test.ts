/**
 * 侧栏「项目看板」标志图单测（2026-09-30 用户裁定：按钮此前没有图标 → 补上；
 * 第二轮裁定：三根竖条版读不出「项目」→ 改为「板面外框 + 板内三列」）。
 *
 * 契约来源：client Slots Inspect 实测 `sidebar.panellist` 的 ownerProps
 * = `{ size: number; active: boolean }`（size=像素边长，active=面板是否在主列被选中）。
 */
import { describe, it, expect } from 'vitest'
import { PmboardPanelIcon } from '../src/client/page/panel-icon.ts'
import { registerPmboardPage } from '../src/client/page/register.ts'
import { PANEL_ID } from '../src/client/dom.ts'

interface El { type: unknown; props: Record<string, unknown> & { children: unknown[] } }

function fakeSlots() {
  const regs: Array<Record<string, unknown> & { occupant?: unknown }> = []
  const slots = {
    inject(_s: string, thunk: () => unknown): unknown { return thunk() },
    register(options: Record<string, unknown>, occupant: unknown): unknown {
      regs.push({ ...options, occupant })
      return undefined
    },
  }
  return { slots, regs }
}

/** 取图标的 [外框, ...三列]。 */
function parts(el: El): { frame: El; bars: El[] } {
  const children = el.props.children as El[]
  return { frame: children[0]!, bars: children.slice(1) }
}

describe('PmboardPanelIcon', () => {
  it('渲染 16 视口内的「板面外框 + 三列」图标（默认尺寸 16）', () => {
    const el = PmboardPanelIcon({}) as unknown as El
    expect(el.type).toBe('svg')
    expect(el.props.viewBox).toBe('0 0 16 16')
    expect(el.props.width).toBe(16)
    expect(el.props.height).toBe(16)
    // 无障碍：可访问名由侧栏 label 提供，图标自身对读屏隐藏
    expect(el.props['aria-hidden']).toBe('true')

    const { frame, bars } = parts(el)
    // 外框：描边、不填充，且在视口内
    expect(frame.type).toBe('rect')
    expect(frame.props.fill).toBe('none')
    expect(frame.props.stroke).toBe('currentColor')
    expect(frame.props.x as number).toBeGreaterThan(0)
    expect((frame.props.x as number) + (frame.props.width as number)).toBeLessThanOrEqual(16)
    expect((frame.props.y as number) + (frame.props.height as number)).toBeLessThanOrEqual(16)

    // 三列：实心、currentColor、高低不等（看板语义而非「暂停键」）
    expect(bars).toHaveLength(3)
    for (const bar of bars) {
      expect(bar.type).toBe('rect')
      expect(bar.props.fill).toBe('currentColor')
      expect((bar.props.x as number) + (bar.props.width as number)).toBeLessThanOrEqual(16)
      expect((bar.props.y as number) + (bar.props.height as number)).toBeLessThanOrEqual(16)
      // 必须落在板面内
      expect(bar.props.x as number).toBeGreaterThanOrEqual(frame.props.x as number)
    }
    expect(new Set(bars.map(b => b.props.height)).size).toBe(3)
  })

  it('size 按插槽请求取值（非法值回落 16）', () => {
    expect((PmboardPanelIcon({ size: 20 }) as unknown as El).props.width).toBe(20)
    expect((PmboardPanelIcon({ size: 0 }) as unknown as El).props.width).toBe(16)
    expect((PmboardPanelIcon({ size: -4 }) as unknown as El).props.width).toBe(16)
  })

  it('选中态加重（未选中更轻），颜色仍由 currentColor 承担', () => {
    const off = parts(PmboardPanelIcon({ active: false }) as unknown as El)
    const on = parts(PmboardPanelIcon({ active: true }) as unknown as El)
    expect(on.bars[0]!.props.fillOpacity as number).toBeGreaterThan(off.bars[0]!.props.fillOpacity as number)
    expect(off.bars[0]!.props.fill as string).toBe('currentColor')
    expect(on.bars[0]!.props.fill as string).toBe('currentColor')
    // 外框颜色不随选中态改（交给侧栏主题）
    expect(on.frame.props.stroke).toBe(off.frame.props.stroke)
  })
})

describe('侧栏注册带上图标', () => {
  it('registerPmboardPage 把图标组件交给 sidebar.panellist（不再落到「不渲染任何内容」的占位）', () => {
    const f = fakeSlots()
    registerPmboardPage({ slots: f.slots })
    const main = f.regs.find(r => r.name === 'main')!
    const side = f.regs.find(r => r.name === 'sidebar.panellist')!
    expect(main.key).toBe(PANEL_ID)
    expect(side.id).toBe(PANEL_ID)
    expect(side.occupant).toBe(PmboardPanelIcon)
    // 图标能被当作组件调用并产出 svg（不是 null 占位）
    const rendered = (side.occupant as (p: { size: number; active: boolean }) => unknown)({ size: 16, active: false }) as El
    expect(rendered.type).toBe('svg')
  })
})
