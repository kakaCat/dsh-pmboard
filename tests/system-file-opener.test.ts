/**
 * 宿主侧"用系统默认程序打开"的适配器（REQ-261004103330-005f，2026-10-04）。
 *
 * 只测**不会真的弹窗**的两条：非 macOS 一律如实说"不支持"（不猜替代命令）；
 * 以及可执行文件不存在时报错而**不抛**（异常要变成结构化结果，让路由照它说话）。
 */
import { describe, it, expect } from 'vitest'
import { createSystemFileOpener } from '../src/adapters/SystemFileOpener.ts'

describe('SystemFileOpener', () => {
  it('非 macOS → 如实回「不支持」，且不去 spawn 任何东西', async () => {
    const opener = createSystemFileOpener({ platform: 'linux' })
    const r = await opener.open('/tmp/x.json')
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.reason).toContain('只在 macOS 可用')
  })

  it('可执行文件不存在 → 返回结构化失败（不抛异常）', async () => {
    const opener = createSystemFileOpener({ platform: 'darwin', openPath: '/nonexistent/open-bin', timeoutMs: 1000 })
    const r = await opener.open('/tmp/x.json')
    expect(r.ok).toBe(false)
  })
})
