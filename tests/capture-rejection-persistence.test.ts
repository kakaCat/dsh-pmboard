/**
 * AC-4 证据（REQ-261007223647-da5d · serves: FR-1 / 裁定 D-3）：
 * **作答到达即落盘** —— 工具调用被中断，留痕仍在。
 *
 * 治什么（2026-10-07 现场）：「点过 ✖️ 不需要立项，还弹框」。查实 `capture-rejections.json`
 * 里没有那条记录——因为留痕写在工具的**延续段**里，调用被超时/中断砍掉，答复与留痕一起丢。
 * 本用例用**真文件适配器**（临时目录里的真 JSON 文件，读写走生产代码）证明：
 * 留痕发生在"作答到达"那一刻，不依赖调用活到收尾；调用死了，磁盘上的记录还在。
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CaptureRejectionFile } from '../src/adapters/CaptureRejectionFile.js'
import { defineCaptureTool } from './helpers/tool-deps.js'
import { makeTestStore } from './application/harness.js'

const W = 'session-ac4'
const NOW = 1_700_000_000_000

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pmboard-ac4-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

function makeTool(svc: unknown, file: CaptureRejectionFile) {
  const deps = {
    store: makeTestStore(),
    now: () => NOW,
    userQuestions: () => svc,
    rejections: file,
  } as never
  return defineCaptureTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }
}

/** 直接读盘（绕开适配器缓存）——证据必须来自文件本身。 */
function onDisk(file: string): unknown[] {
  return JSON.parse(readFileSync(file, 'utf8')) as unknown[]
}

describe('AC-4 · 作答到达即落盘（调用中断不吞留痕）', () => {
  it('点 ✖️ 不需要立项 → 磁盘文件里就有 kind=reject 的记录', async () => {
    const file = join(dir, 'capture-rejections.json')
    const port = new CaptureRejectionFile(file)
    const tool = makeTool({ ask: async () => ({ answers: [{ id: 'name', selected: ['✖️ 不需要立项'] }] }) }, port)
    const out = await tool.execute({ title_options: ['候选'] }, { agent: { id: W } })
    await port.flush()

    expect(out.success).toBe(false)
    const rows = onDisk(file) as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ windowKey: W, kind: 'reject' })
  })

  it('调用被中断（ASK_ABORTED）→ 取消留痕已在磁盘上，且此后仍读得回', async () => {
    const file = join(dir, 'capture-rejections.json')
    const port = new CaptureRejectionFile(file)
    const tool = makeTool({
      ask: async () => { throw Object.assign(new Error('aborted'), { code: 'ASK_ABORTED' }) },
    }, port)
    const out = await tool.execute({ title_options: ['候选'] }, { agent: { id: W } })
    await port.flush()

    // 调用方拿到的是中性回执（不是崩溃），而留痕已经落盘——两件事互不依赖
    expect(out.success).toBe(false)
    const rows = onDisk(file) as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ windowKey: W, kind: 'cancel' })

    // 新起一个适配器实例（模拟"下一次进程/下一次调用"）→ 记录还在，且能拦住重弹
    const reopened = await new CaptureRejectionFile(file).readAll()
    expect(reopened).toHaveLength(1)
    expect(reopened[0]!.kind).toBe('cancel')
  })

  it('对照：留痕写入失败也不阻断「未立项」回执（留痕是增强，不是门槛）', async () => {
    const throwing = {
      record: () => { throw new Error('disk full') },
      readAll: async () => [],
    }
    const tool = makeTool({ ask: async () => ({ answers: [{ id: 'name', selected: ['✖️ 不需要立项'] }] }) }, throwing as never)
    const out = await tool.execute({ title_options: ['候选'] }, { agent: { id: W } })
    expect(out.success).toBe(false)
    expect(String(out.note)).toContain('未创建需求')
    // ⚠️ 已知口径缺口（本用例只记录现状，不在本需求改文案）：留痕写入抛错时，回执仍写「已留痕」。
    // 真实落盘失败由适配器的 onError 写进日志（index.ts:556 只告警），但**回执本身不体现**。
    // 是否让回执区分「已留痕 / 留痕失败」属产品文案裁决，留给验收人。
    expect(String(out.note)).toContain('已留痕')
  })
})
