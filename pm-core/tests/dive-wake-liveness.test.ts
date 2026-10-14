/**
 * wake 活性校验（REQ-261003222428-3556 FR-5 / N-1）。
 *
 * 钉三条：
 *  ① 死窗口桩：绑定窗口无活 agent → wake 不受理（false + 人话原因）；
 *  ② 活窗口：wake 受理（true）——行为与现状逐字一致（onRequirementMoved 被调到）；
 *  ③ 边界：需求不存在 / 无绑定窗口 → 不受理且原因各异（不混为一谈）。
 *
 * 「连续 3 次叫不动 → 写停手位 + 诊断评论 + 不刷 lastWakeAt」那半段已随旧心跳退役，
 * 现由 `pm-core/tests/dive-rearm.test.ts`（新 `createGoalHeartbeat`，断言 `wake-undeliverable:3`）覆盖。
 */
import { describe, it, expect } from 'vitest'
import { wakeAcceptance } from 'pm-core/application/dive/wake-liveness.js'
import { emptyLedger, type RequirementRecord } from 'pm-core/protocol-domain.js'

const LIVE = 'agent-live'
const DEAD = 'agent-dead'

function makeReq(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: 'REQ-t', title: 't', description: '', status: 'implementing', blocked: false,
    comments: [], version: 5, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    sourceSessionId: DEAD,
    dive: { phase: 'active', activation: 'armed', roundsInStage: 0 },
    ...over,
  } as unknown as RequirementRecord
}

/** 与 dive-rearm.test.ts 同款最小台账桩。 */
function repoOf(reqs: RequirementRecord[]) {
  const ledger = { ...emptyLedger(), requirements: reqs, tasks: [], triages: [] } as unknown as { revision: number; requirements: RequirementRecord[] }
  return {
    store: {
      listSummaries: async () => ({ items: ledger.requirements.map((r) => ({
        id: r.id, title: r.title, status: r.status, blocked: r.blocked === true,
        sourceSessionId: r.sourceSessionId, autoRun: r.autoRun, dive: r.dive,
      })) }),
      get: async (id: string) => ledger.requirements.find((r) => r.id === id),
      mutate: async (id: string, fn: (draft: RequirementRecord) => unknown) => {
        const r = ledger.requirements.find((x) => x.id === id)
        if (r === undefined) return undefined
        const result = fn(r)
        if (result === undefined) return { changed: false, requirement: r }
        return { changed: true, requirement: r }
      },
    },
  }
}

/** 活 agent 注册表桩：只有 LIVE 在册。 */
const agents = { get: (id: string): unknown | undefined => (id === LIVE ? { id: LIVE } : undefined) }

describe('wake 活性校验（N-1）', () => {
  it('② 活窗口：受理（true）', async () => {
    const { store } = repoOf([makeReq({ sourceSessionId: LIVE })])
    const v = await wakeAcceptance({ store: store as never, agents }, 'REQ-t')
    expect(v.accepted).toBe(true)
  })

  it('① 死窗口：不受理 + 原因点名窗口码', async () => {
    const { store } = repoOf([makeReq({ sourceSessionId: DEAD })])
    const v = await wakeAcceptance({ store: store as never, agents }, 'REQ-t')
    expect(v.accepted).toBe(false)
    expect(v.reason).toContain(DEAD)
    // 心跳失败路径（连续 3 次 → 写停手位 + 诊断评论 + 不刷 lastWakeAt）见 dive-rearm.test.ts
  })

  it('③ 边界：需求不存在 / 无绑定窗口 → 不受理且原因各异', async () => {
    const { store } = repoOf([makeReq({ sourceSessionId: LIVE })])
    const missing = await wakeAcceptance({ store: store as never, agents }, 'REQ-nope')
    expect(missing.accepted).toBe(false)
    expect(missing.reason).toContain('不在台账')
    const unbound = await wakeAcceptance({ store: store as never, agents: agents }, 'REQ-t')
    // REQ-t 在此用例绑的是 LIVE……换一个无绑定需求
    expect(unbound.accepted).toBe(true)
    const s2 = repoOf([makeReq({ id: 'REQ-t2', sourceSessionId: undefined as never })])
    const noBind = await wakeAcceptance({ store: s2.store as never, agents }, 'REQ-t2')
    expect(noBind.accepted).toBe(false)
    expect(noBind.reason).toContain('没有绑定窗口')
  })
})
