// serves: FR-9, FR-12
/**
 * 注入留痕 v2 的口径测试（REQ-261004222448-292a t-cc7233）。
 *
 * 这张卡修的是「**有留痕 ≠ 窗口收到了**」：留痕新增 origin/delivered/text，
 * 并把「轮次投递」——唯一真进会话的路径——从零留痕补上。断言点：
 *   ① 轮次投递成功 → 留痕恰 +1，origin='dive-round'，delivered=true，正文可读；
 *   ② 投递失败 → delivered=false，且投递结果**带失败原因**（不静默）；
 *   ③ 超长正文被截断且置 truncated=true（截断必须显式，不许悄悄丢）；
 *   ④ 旧条目（无 v2 字段）读端 → origin='unknown'、delivered=null（**不默认成已投递**）；
 *   ⑤ 写端只认四个记录点，写歪的 origin 判为残缺记录（读回响亮失败）。
 *
 * @module dsh-pmboard/tests/injection-log
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AgentDeliverer } from '../src/adapters/AgentDeliverer.js'
import { InjectionLogFile } from '../src/adapters/InjectionLogFile.js'
import {
  INJECTION_LOG_TEXT_MAX,
  capInjectionText,
  injectionLogInputForRound,
  injectionLogInputFromResolved,
  isInjectionLogEntry,
  toInjectionLogView,
  type InjectionLogEntry,
} from '../src/application/internal/injection-log.js'
import { boundSectionText } from '../src/application/internal/capture-section.js'
import { resolveStagePrompt } from '../src/domain/prompt/index.js'
import { emptyLedger, type ReqboardLedger, type RequirementRecord } from '../src/shared/protocol.js'

const PLUGIN = 'dsh-pmboard'
const W = 'w-round-1'

/** 造一个只带 get 的假 registry（与 ctx.agents 的形状一致）。 */
function registryOf(agent: unknown): () => unknown {
  return () => ({ get: () => agent })
}

function makeLog(): { dir: string; log: InjectionLogFile; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-injlog-v2-'))
  const file = join(dir, 'state/prompt-injection-log.json')
  let n = 1_700_000_000_000
  return { dir, log: new InjectionLogFile(file, () => (n += 1000)), file }
}

describe('① 轮次投递留痕（唯一真进会话的路径）', () => {
  it('投递成功 → 留痕恰 1 条，origin=dive-round、delivered=true、正文可读', async () => {
    const { dir, log } = makeLog()
    const sent: unknown[] = []
    const deliverer = new AgentDeliverer(
      registryOf({ followup: (m: unknown) => { sent.push(m) } }),
      () => 'msg-1',
      PLUGIN,
      undefined,
      undefined,
      log,
    )
    const built = deliverer.createRoundMessage({ requirementId: 'REQ-t', revision: 7, round: 2, text: '节点已推进，请继续' })
    const res = deliverer.deliverMessage(W, built.message)
    await log.flush()

    expect(res.delivered).toBe(true)
    expect(sent).toHaveLength(1)
    const all = await log.readAll()
    // 恰 +1：createRoundMessage 只造消息、不记留痕；记的是"投出去了"这一事实
    expect(all).toHaveLength(1)
    expect(all[0]!.origin).toBe('dive-round')
    expect(all[0]!.delivered).toBe(true)
    expect(all[0]!.windowKey).toBe(W)
    expect(all[0]!.text).toBe('节点已推进，请继续')
    rmSync(dir, { recursive: true, force: true })
  })

  it('跨窗口消息（source.kind≠dive）不冒充轮次留痕', async () => {
    const { dir, log } = makeLog()
    const deliverer = new AgentDeliverer(
      registryOf({ followup: () => {} }), () => 'msg-2', PLUGIN, undefined, undefined, log,
    )
    const built = deliverer.createMessage({ text: '交棒给另一个窗口', kind: 'reqboard-handoff' })
    deliverer.deliverMessage(W, built.message)
    await log.flush()
    expect(await log.readAll()).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('② 投递失败如实留痕（失败是最该被看见的那种）', () => {
  it('窗口不在线 → delivered=false，结果带原因，留痕同样 delivered=false', async () => {
    const { dir, log } = makeLog()
    const deliverer = new AgentDeliverer(registryOf(undefined), () => 'msg-3', PLUGIN, undefined, undefined, log)
    const built = deliverer.createRoundMessage({ requirementId: 'REQ-t', revision: 1, round: 1, text: '催办正文' })
    const res = deliverer.deliverMessage('w-offline', built.message)
    await log.flush()

    expect(res.delivered).toBe(false)
    expect(res.reason).toContain('不在线')
    const all = await log.readAll()
    expect(all).toHaveLength(1)
    expect(all[0]!.origin).toBe('dive-round')
    expect(all[0]!.delivered).toBe(false)
    expect(all[0]!.text).toBe('催办正文')
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('③ 正文超上限：截断显式标注', () => {
  it('capInjectionText：不超限原样、超限截断并置 truncated 标', () => {
    expect(capInjectionText('短')).toEqual({ text: '短', truncated: false })
    const long = 'x'.repeat(INJECTION_LOG_TEXT_MAX + 100)
    const capped = capInjectionText(long)
    expect(capped.text.length).toBe(INJECTION_LOG_TEXT_MAX)
    expect(capped.truncated).toBe(true)
  })

  it('轮次留痕超长正文 → 落盘条目 truncated=true 且仍能通过读回校验', () => {
    const long = 'y'.repeat(INJECTION_LOG_TEXT_MAX + 1)
    const input = injectionLogInputForRound({ windowKey: W, text: long, delivered: true })
    expect(input.truncated).toBe(true)
    expect(input.text!.length).toBe(INJECTION_LOG_TEXT_MAX)
    // 读回校验不许因为新字段把记录判成残缺（那会让整块留痕读不到）
    expect(isInjectionLogEntry({ at: 1, ...input })).toBe(true)
  })
})

describe('④ 旧条目读端降级：来源未知 / 投递不可知', () => {
  it('缺 v2 字段的历史条目 → origin=unknown、delivered=null（不默认成已投递）', () => {
    const legacy: InjectionLogEntry = {
      at: 1, windowKey: W, stage: 'design', difficulty: 'heavy', category: 'feature',
      routeKey: 'design/heavy/feature', hitLevel: 'exact', fragmentIds: ['a'], charCount: 3, trimmed: [],
    }
    expect(isInjectionLogEntry(legacy)).toBe(true)
    const view = toInjectionLogView(legacy)
    expect(view.origin).toBe('unknown')
    expect(view.delivered).toBeNull()
    expect(view.text).toBeUndefined()
  })

  it('缺文件（从没记过）仍返回空数组，不与「旧条目」混为一谈', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-injlog-empty-'))
    const log = new InjectionLogFile(join(dir, 'none.json'), () => 1)
    await expect(log.readAll()).resolves.toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('⑤ 记录点枚举与写端必填', () => {
  it('四个 origin 各自成立；写歪的 origin 判为残缺', () => {
    const resolved = resolveStagePrompt({ stage: 'design', difficulty: 'heavy', category: 'feature' })
    for (const origin of ['gate-h3', 'dive-node', 'dive-round', 'system-prompt'] as const) {
      const input = injectionLogInputFromResolved(resolved, W, { origin, delivered: origin !== 'dive-node' })
      expect(input.origin).toBe(origin)
      expect(isInjectionLogEntry({ at: 1, ...input })).toBe(true)
    }
    expect(isInjectionLogEntry({ at: 1, origin: '胡写', delivered: true, windowKey: W, stage: 's', difficulty: 'd', category: 'c', routeKey: 'r', hitLevel: 'exact', fragmentIds: [], charCount: 0, trimmed: [] })).toBe(false)
  })

  it('capture-section（系统提示词装配）记 system-prompt / delivered=true', () => {
    const req = {
      id: 'REQ-000010', title: 't', description: '', status: 'brainstorming', blocked: false,
      version: 1, createdAt: 1, updatedAt: 1, sourceSessionId: W, category: 'feature',
    } as RequirementRecord
    const ledger: ReqboardLedger = { ...emptyLedger(), requirements: [req] }
    const recorded: { origin?: string; delivered?: boolean }[] = []
    boundSectionText(ledger, undefined, { agent: { id: W } }, { record: (e) => recorded.push(e) })
    expect(recorded).toHaveLength(1)
    expect(recorded[0]!.origin).toBe('system-prompt')
    expect(recorded[0]!.delivered).toBe(true)
  })
})
