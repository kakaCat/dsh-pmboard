// serves: FR-9, FR-12
/**
 * 提示词查询（QueryPrompts）单测（REQ-261004222448-292a · t-497311 实施期补的漏项）。
 *
 * 这张卡补的是六端点里**没有卡承接**的那一个（`prompts`）：t3/t4/t5 各管自己的查询，
 * t497311 只接线、t-702b00 只渲染。断言点覆盖 FR-9 的三段与 FR-12 的诚实降级：
 *   ① 装配服务不可得 → `system.unavailable`（**不产出"0 段"冒充"没有提示词"**）；
 *   ② 每段正文非空且给字符数（页面 `<pre>` 才有东西可展开；"被裁片段"同样给正文）；
 *   ③ 旧留痕条目 → 来源未知 / 投递不可知，**不默认成已投递**；
 *   ④ 注入留痕读失败 → 整块降级（不返回空数组冒充"从来没注入过"）；
 *   ⑤ 隔离留痕口缺省 → `context.available=false`（不显示 0 次压缩）。
 *
 * 环境：vitest node（本包无 jsdom）；端口一律用注入桩。
 *
 * @module dsh-pmboard/tests/query-prompts
 */
import { describe, it, expect } from 'vitest'
import { queryPrompts } from '../src/application/query/QueryPrompts.js'
import type { PanelQueryDeps } from '../src/application/query/contracts.js'
import type { InjectionLogEntry, InjectionLogView } from '../src/application/internal/injection-log.js'
import { toInjectionLogView } from '../src/application/internal/injection-log.js'
import { isDegrade, type PromptsResponse, type RequirementRecord } from '../src/shared/protocol.js'

const REQ = 'REQ-261004222448-292a'
const W = 'session-aaaa1111'

function req(): RequirementRecord {
  return {
    id: REQ, title: 't', description: '', status: 'implementing', blocked: false,
    version: 1, createdAt: 1, updatedAt: 1, sourceSessionId: W, category: 'feature',
  } as unknown as RequirementRecord
}

/** 造一个能识别 `available:false` 的取数器（查询返回的载荷形状由契约保证，测试只读它）。 */
function depsOf(over: Partial<PanelQueryDeps> & { injections?: unknown } = {}): PanelQueryDeps {
  const base = {
    store: { get: async () => req() },
    tasks: { listByRequirement: async () => [] },
    injections: { readAll: async () => [] },
  }
  return { ...base, ...over } as unknown as PanelQueryDeps
}

function legacyEntry(over: Partial<InjectionLogEntry> = {}): InjectionLogView {
  return toInjectionLogView({
    at: 1000, windowKey: W, stage: 'implementing', difficulty: 'heavy', category: 'feature',
    routeKey: 'implementing/heavy/feature', hitLevel: 'exact', fragmentIds: ['f1'], charCount: 5, trimmed: [],
    ...over,
  })
}

describe('QueryPrompts · A 段（它被告知了什么）', () => {
  it('装配服务缺省 → unavailable（不写 0 段）', async () => {
    const out = await queryPrompts(depsOf(), { requirementId: REQ })
    expect(isDegrade(out)).toBe(false)
    const r = out as PromptsResponse
    expect(r.system.unavailable).toBe(true)
    expect(r.system.sections).toEqual([])
  })

  it('装配可用 → 逐段给正文与字符数；被裁片段也给正文', async () => {
    const out = await queryPrompts(depsOf({
      systemPrompt: () => ({
        assemble: async () => ({
          routeKey: 'implementing/heavy/feature',
          hitLevel: '②',
          sections: [
            { name: 'fragments/stage-discipline.md', text: '纪律正文' },
            { name: 'shell:identity', text: '身份正文' },
          ],
          contexts: [{ name: 'context:address', text: '地址正文' }],
          trimmed: [{ id: 'fragments/glossary.md', chars: 12, text: '术语正文' }],
        }),
      }),
    }), { requirementId: REQ })
    const r = out as PromptsResponse
    expect(r.system.unavailable).toBeUndefined()
    expect(r.system.sections.map((s) => s.id)).toEqual(['fragments/stage-discipline.md', 'shell:identity', 'context:address'])
    expect(r.system.sections[0]!.kind).toBe('file')
    expect(r.system.sections[1]!.kind).toBe('shell')
    for (const s of r.system.sections) expect(s.text.length).toBeGreaterThan(0)
    expect(r.system.perTurnChars).toBe(4 + 4 + 4)
    expect(r.system.trimmed[0]!.text).toBe('术语正文')
  })

  it('装配抛错 → 同样 unavailable（不把异常当"没有"）', async () => {
    const out = await queryPrompts(depsOf({
      systemPrompt: () => ({ assemble: async () => { throw new Error('boom') } }),
    }), { requirementId: REQ })
    expect((out as PromptsResponse).system.unavailable).toBe(true)
  })
})

describe('QueryPrompts · B 段（有没有真的进会话）', () => {
  it('留痕逐条映射，来源与投递后果原样带上', async () => {
    const out = await queryPrompts(depsOf({
      injections: {
        readAll: async () => [
          { at: 1, windowKey: W, stage: 'implementing', difficulty: 'heavy', category: 'feature', routeKey: 'implementing/heavy/feature', hitLevel: 'exact', fragmentIds: ['f1'], charCount: 5, trimmed: [], origin: 'gate-h3', delivered: true, text: '正文' },
          { at: 2, windowKey: W, stage: 'implementing', difficulty: 'heavy', category: 'feature', routeKey: 'implementing/heavy/feature', hitLevel: 'exact', fragmentIds: [], charCount: 0, trimmed: [], origin: 'dive-node', delivered: false },
        ],
      },
    }), { requirementId: REQ })
    const r = out as PromptsResponse
    expect(r.injections).toHaveLength(2)
    expect(r.injections[0]!.origin).toBe('gate-h3')
    expect(r.injections[0]!.delivered).toBe(true)
    expect(r.injections[0]!.text).toBe('正文')
    expect(r.injections[1]!.delivered).toBe(false)
  })

  it('旧条目（无来源字段）→ 来源未知 / 投递不可知，不默认成已投递', () => {
    const view = legacyEntry()
    expect(view.origin).toBe('unknown')
    expect(view.delivered).toBeNull()
  })

  it('留痕读失败 → 整块降级（不返回空数组冒充"从来没过"）', async () => {
    const out = await queryPrompts(depsOf({
      injections: { readAll: async () => { throw new Error('prompt-injection-log 第 3 条记录残缺') } },
    }), { requirementId: REQ })
    expect(isDegrade(out)).toBe(true)
    if (isDegrade(out)) expect(out.reason).toBe('ledger-unreadable')
  })

  it('需求读不到 → 降级（不冒充"没有提示词"）', async () => {
    const out = await queryPrompts(depsOf({ store: { get: async () => undefined } as never }), { requirementId: REQ })
    expect(isDegrade(out)).toBe(true)
  })
})

describe('QueryPrompts · C 段（上下文）', () => {
  it('隔离留痕口缺省 → available=false（不显示 0 次压缩）', async () => {
    const r = (await queryPrompts(depsOf(), { requirementId: REQ })) as PromptsResponse
    expect(r.context.available).toBe(false)
    expect(r.context.isolations).toEqual([])
    expect(r.context.compressions).toBe(0)
  })

  it('有隔离留痕 → 逐条带上，压缩次数只数真发生了替换的那些', async () => {
    const out = await queryPrompts(depsOf({
      isolations: {
        readAll: async () => [
          { at: 10, windowKey: W, stage: 'implementing', status: 'replaced', reason: '超水位', routeKey: 'r', packageChars: 100, range: { start: 0, end: 3 } },
          { at: 11, windowKey: W, stage: 'implementing', status: 'skipped', reason: '已结算过', routeKey: 'r', packageChars: 0 },
          { at: 12, windowKey: 'session-other', stage: 'design', status: 'replaced', reason: '别的需求', routeKey: 'r', packageChars: 9, range: { start: 1, end: 2 } },
        ],
      },
    }), { requirementId: REQ })
    const r = out as PromptsResponse
    expect(r.context.available).toBe(true)
    expect(r.context.isolations).toHaveLength(2)
    expect(r.context.compressions).toBe(1)
    expect(r.context.policy).toContain('replaced')
    expect(r.context.isolations[0]!.packageChars).toBe(100)
  })
})
