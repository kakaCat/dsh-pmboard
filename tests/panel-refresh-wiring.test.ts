/**
 * 面板接线断言（REQ-261001124111-5d36 t3）。
 *
 * 两类断言：
 *   ① 纯函数（策略解析 / 版本戳判定）——行为可证伪；
 *   ② 接线不变量——组件与 api 层的源码级断言。这类断言在本仓有先例（node-panel.test.ts 的
 *      "静态断言"用例）：接线是"有没有真的接上"的问题，用静态检查比造一个 React 运行时更诚实，
 *      也让"有人把轮询兜底删掉"这件事当场变红。
 *
 * serves: FR-1, FR-3, FR-4, FR-5
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { DEFAULT_PANEL_POLICY, parsePanelPolicy, stampMismatch } from '../src/client/panel-refresh.js'
import { panelSettings } from '../src/plugin-config.js'

const component = readFileSync('src/client/conversation-progress.ts', 'utf8')
// REQ-261001124111-5d36 t5：接线（调度器 / SSE / 版本戳）按尺寸门禁（单文件 ≤400 行）拆进
// use-panel-refresh.ts，故"接没接上"的断言落在那个模块；组件侧只断言"有没有把新鲜度交给渲染器"。
const hook = readFileSync('src/client/use-panel-refresh.ts', 'utf8')
const api = readFileSync('src/client/api.ts', 'utf8')

describe('策略解析：refreshMs=0 必须被当成合法值', () => {
  it('缺省策略 = 5000/30000', () => {
    expect(DEFAULT_PANEL_POLICY).toEqual({ refreshMs: 5000, staleAfterMs: 30000 })
  })
  it('refreshMs=0（关掉轮询）不被吞掉', () => {
    expect(parsePanelPolicy({ refreshMs: 0, staleAfterMs: 60000 })).toEqual({ refreshMs: 0, staleAfterMs: 60000 })
  })
  it('非法输入一律忽略（不猜、不抛）', () => {
    expect(parsePanelPolicy(null)).toEqual({})
    expect(parsePanelPolicy('x')).toEqual({})
    expect(parsePanelPolicy({ refreshMs: -1, staleAfterMs: 0 })).toEqual({})
    expect(parsePanelPolicy({ refreshMs: Number.NaN, staleAfterMs: Number.POSITIVE_INFINITY })).toEqual({})
  })
  it('宿主侧配置解析同口径（缺省 5000/30000，refreshMs=0 合法）', () => {
    expect(panelSettings(undefined)).toEqual({ refreshMs: 5000, staleAfterMs: 30000 })
    expect(panelSettings({ panel: { refreshMs: 0 } })).toEqual({ refreshMs: 0, staleAfterMs: 30000 })
    expect(panelSettings({ panel: { refreshMs: -5, staleAfterMs: -1 } })).toEqual({ refreshMs: 5000, staleAfterMs: 30000 })
  })
})

describe('版本戳判定：宁可漏报，不可误报', () => {
  it('两戳都存在且不同 → true', () => {
    expect(stampMismatch('aaaa11112222', 'bbbb33334444')).toBe(true)
  })
  it('相等 / 任一端缺失 / 空串 → false', () => {
    expect(stampMismatch('same', 'same')).toBe(false)
    expect(stampMismatch(undefined, 'x')).toBe(false)
    expect(stampMismatch('x', undefined)).toBe(false)
    expect(stampMismatch('', 'x')).toBe(false)
    expect(stampMismatch(undefined, undefined)).toBe(false)
  })
})

describe('接线不变量（源码级）', () => {
  it('数据通道用调度器驱动刷新，并把策略传进去（周期可关、陈旧阈值可调）', () => {
    expect(hook).toContain('createPanelRefresh({')
    expect(hook).toContain('intervalMs: policy.refreshMs')
    expect(hook).toContain('staleAfterMs: policy.staleAfterMs')
    expect(hook).toContain('panel.start()')
    expect(hook).toContain('panel.stop()')
  })
  it('切换需求先清空：清空语句出现在建调度器之前（不串档 FR-4）', () => {
    const iClear = hook.indexOf('setOverview(null) // 先清空')
    const iCreate = hook.indexOf('const panel = createPanelRefresh({')
    expect(iClear).toBeGreaterThan(-1)
    expect(iCreate).toBeGreaterThan(iClear)
  })
  it("SSE 仅作加速通道：事件只触发 refresh('event')", () => {
    expect(hook).toContain("panelRef.current?.refresh('event')")
  })
  it('组件把新鲜度与版本提示交给面板渲染器（否则 DOM 里永远不会有时间戳/红条）', () => {
    expect(component).toContain('...(panelFreshness !== undefined ? { freshness: panelFreshness } : {})')
    expect(component).toContain('...(buildNotice !== null ? { buildNotice } : {})')
    expect(component).toContain('usePanelRefresh({ open: detailOpen, reqId: reqIdForStage })')
  })
  it('「点此刷新」委托存在且动作只有 location.reload()（不自动刷新）', () => {
    expect(hook).toContain("closest('[data-action=\"np-reload\"]')")
    expect(hook).toContain('window.location.reload()')
  })
  it('api 层注册了命名帧 build（onmessage 收不到命名事件）', () => {
    expect(api).toContain("es.addEventListener('build'")
  })
})
