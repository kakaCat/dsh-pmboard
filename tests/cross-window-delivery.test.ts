/**
 * 跨窗口投递：自署 kind + 冷会话 resume（REQ-261003215944-9e04 FR-7 · t5）。
 *
 * 【为什么要有这道门】
 * 修前投递只看 `agents.get(windowKey)`——冷会话必然返回 undefined，于是只会说「窗口不在线」，
 * 而"把新项目交给一个新窗口"恰恰要投给**刚建出来、还没跑过**的会话。
 *
 * 【三条判据 + 一条红线】
 *   ① 冷会话：resume 之后投得进去，且投递后做落盘确认；
 *   ② 自署来源：消息 `source.kind` 是 pm 专有值（`reqboard-open-window`），**永不为 `user`**；
 *   ③ 诚实降级：没有 resume 能力 / resume 失败 / 落盘未确认 → 一律 `delivered:false` 带原因，不谎报送达；
 *   ④ 红线：全仓不得出现 `sessionController.prompt`（它会把消息标成 `{kind:'user'}`，等于冒充人类）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AgentDeliverer } from '../src/adapters/AgentDeliverer.js'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

/** 造一个投递器：热窗口服务可空；冷会话控制器与 flush 按用例给。 */
function deliverer(opts: {
  hot?: (id: string) => unknown
  controller?: unknown
  flush?: (agent: unknown) => Promise<boolean> | boolean
} = {}) {
  const d = new AgentDeliverer(
    () => (opts.hot !== undefined ? { get: opts.hot } : undefined),
    () => 'm-1',
    'dsh-pmboard',
    () => opts.controller,
    opts.flush,
  )
  return d
}

describe('FR-7：跨窗口投递（热路径 + 冷会话 resume）', () => {
  it('① 冷会话：agents.get 落空 → resolveAgent resume → 投进去 → 落盘确认', async () => {
    const seen: unknown[] = []
    let flushed = 0
    const agent = { followup: (m: unknown) => { seen.push(m) } }
    const d = deliverer({
      hot: () => undefined, // 冷：本进程没有这个窗口
      controller: { resolveAgent: async () => ({ agent }) },
      flush: () => { flushed += 1; return true },
    })
    const { message } = d.createMessage({ text: '底稿', kind: 'reqboard-open-window' })
    const out = await d.deliver('session-cold-0001', message)
    expect(out.delivered).toBe(true)
    expect(seen).toEqual([message])
    expect(flushed).toBe(1)
  })

  it('② 自署来源：source.kind 是 pm 专有值，**永不为 user**', () => {
    const d = deliverer()
    const { message, messageId } = d.createMessage({ text: 'x', kind: 'reqboard-open-window' })
    const m = message as { id: string; source?: { kind?: string } }
    expect(m.id).toBe(messageId)
    expect(m.source?.kind).toBe('reqboard-open-window')
    expect(m.source?.kind).not.toBe('user')
  })

  it('③ 无 resume 能力 → 如实报"不在线且投不到"，不谎报送达', async () => {
    const d = deliverer({ hot: () => undefined })
    const out = await d.deliver('session-cold-0002', d.createMessage({ text: 'x', kind: 'k' }).message)
    expect(out.delivered).toBe(false)
    expect(out.reason).toContain('不在线')
  })

  it('③ resume 返回失败形状（{error}）/ 落盘未被确认 → 都是 delivered:false', async () => {
    const noAgent = deliverer({ hot: () => undefined, controller: { resolveAgent: async () => ({ error: new Error('nope') }) } })
    expect((await noAgent.deliver('session-cold-0003', { id: 'm' })).delivered).toBe(false)

    const notFlushed = deliverer({
      hot: () => undefined,
      controller: { resolveAgent: async () => ({ agent: { followup: () => undefined } }) },
      flush: () => false,
    })
    const out = await notFlushed.deliver('session-cold-0004', { id: 'm' })
    expect(out.delivered).toBe(false)
    expect(out.reason).toContain('落盘')
  })

  it('热窗口优先级不变：agents.get 命中就不再 resume', async () => {
    let resumed = 0
    const seen: unknown[] = []
    const d = deliverer({
      hot: () => ({ followup: (m: unknown) => { seen.push(m) } }),
      controller: { resolveAgent: async () => { resumed += 1; return { agent: {} } } },
    })
    const out = await d.deliver('session-hot-0005', { id: 'm-hot' })
    expect(out.delivered).toBe(true)
    expect(resumed).toBe(0)
    expect(seen).toEqual([{ id: 'm-hot' }])
  })

  it('④ 红线（静态）：全仓 src 不出现 sessionController.prompt', () => {
    const offenders: string[] = []
    const walk = (dir: string, base = ''): void => {
      for (const name of readdirSync(dir)) {
        const abs = join(dir, name)
        if (statSync(abs).isDirectory()) { walk(abs, base + name + '/'); continue }
        if (!name.endsWith('.ts')) continue
        if (readFileSync(abs, 'utf8').includes('sessionController.prompt')) offenders.push(base + name)
      }
    }
    walk(SRC)
    expect(offenders).toEqual([])
  })
})
