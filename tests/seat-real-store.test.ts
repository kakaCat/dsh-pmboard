/**
 * 席位 × **真实分片存储**（REQ-261003215944-9e04 FR-3 · t-dd3067 联调段）。
 *
 * 【为什么要单开这一份】
 * 席位判定本身的单测跑在内存替身上（`tests/seat-authorization.test.ts`）——它证明的是"判定对不对"。
 * 但这条改造真正依赖的是另一件事：**席位能不能活着穿过落盘与投影**。
 * 具体三个环节，任何一环漏了，判定再对也白搭：
 *   ① 写：`seats` 通过真实写路径落进热记录（不是被字段白名单悄悄丢掉）；
 *   ② 读：摘要投影带回 `seats`（否则绑定读只能看到 `sourceSessionId`）；
 *   ③ 筛：端口的 `seatWindowKey` 预筛在真实实现里真的筛得中，且**筛不中**没有 seats 的存量。
 * 内存替身与分片实现是两份代码，③ 尤其必须两边都验（否则又是"替身过了、生产不过"）。
 *
 * 【本文件第一版跑出来的真问题（值得留着）】
 * 第一版夹具用 `create()` 播种 seats（`as never` 绕类型），结果 seats 落盘后**不见了**——
 * `NewRequirement` 里没有 `seats`，`create` 按显式白名单建记录，房客字段不会跟着走。
 * 这不是缺陷而是契约：**席位只能经 `mutate` 落座**（`reqboard_bind` 正走这条），
 * 且类型层就拦住了"往 create 里塞 seats"——要绕过得先写 `as never`。
 * 夹具据此改成真实路径；这条弯路本身就是联调的价值。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ShardedRequirementStore } from '../src/repositories/ShardedRequirementStore.js'
import { boundSummariesOf } from '../src/application/internal/binding-read.js'
import type { WindowSeat } from '../src/shared/protocol.js'

const OWNER = 'session-owner-real'
const WORKER = 'session-worker-real'
const ID = 'REQ-261003215944-9e04'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'pmboard-seat-real-')) })
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

const store = (): ShardedRequirementStore =>
  new ShardedRequirementStore({ root, onWarn: () => { /* 本用例不关心告警 */ } })

/** 别人立项、把席位派给我（worker）——这条就是改造前"看不见"的形状。 */
function seededByOther(): Record<string, unknown> {
  return {
    id: ID, title: '别人立项、我拿席位', description: '联调夹具',
    status: 'implementing', blocked: false,
    createdAt: 100, updatedAt: 200,
    createdBy: { kind: 'agent' }, updatedBy: { kind: 'agent' },
    sourceSessionId: OWNER,
    dive: { phase: 'active', activation: 'armed', roundsInStage: 0 },
  }
}

/** 存量形状：没有 seats、`sourceSessionId` 是别人（我最该看不见的那种）。 */
function legacyOfOther(): Record<string, unknown> {
  return {
    id: 'REQ-261003215945-0001', title: '存量：别人立项', description: '联调夹具',
    status: 'implementing', blocked: false,
    createdAt: 100, updatedAt: 100,
    createdBy: { kind: 'agent' }, updatedBy: { kind: 'agent' },
    sourceSessionId: OWNER,
    dive: { phase: 'active', activation: 'armed', roundsInStage: 0 },
  }
}

/** 真实落座路径：先 create 建档，再 mutate 落席位（`reqboard_bind` 走的就是这条）。 */
async function createThenSeat(s: ShardedRequirementStore, seats: readonly WindowSeat[]): Promise<void> {
  await s.create(seededByOther() as never, { kind: 'agent' })
  await s.mutate(ID, (d) => { d.seats = seats as WindowSeat[]; return { changed: true } })
}

describe('联调：席位穿过真实落盘 → 摘要 → 绑定读', () => {
  it('① 写不丢字段：经 mutate 落下的 seats 原样取回（含角色与入席时间）', async () => {
    const s = store()
    await createThenSeat(s, [
      { windowKey: OWNER, role: 'owner', joinedAt: 100 },
      { windowKey: WORKER, role: 'worker', joinedAt: 150 },
    ])
    const rec = (await s.get(ID))!
    expect(rec.seats).toEqual([
      { windowKey: OWNER, role: 'owner', joinedAt: 100 },
      { windowKey: WORKER, role: 'worker', joinedAt: 150 },
    ])
    expect(rec.sourceSessionId).toBe(OWNER) // 立项人不变：席位不是改写来源窗口
  })

  it('② 摘要带回 seats；按席位筛，worker 也能取到这条（改造前的缺口）', async () => {
    const s = store()
    await createThenSeat(s, [
      { windowKey: OWNER, role: 'owner', joinedAt: 100 },
      { windowKey: WORKER, role: 'worker', joinedAt: 150 },
    ])
    const page = await s.listSummaries({ seatWindowKey: WORKER })
    expect(page.items.map((x) => x.id)).toEqual([ID])
    expect(page.items[0]!.seats).toHaveLength(2)
    // 绑定读端到端：worker 席位 = 绑定（这正是 MoveTask 入口要的那一步）
    expect((await boundSummariesOf(s, WORKER)).map((x) => x.id)).toEqual([ID])
  })

  it('③ 预筛只认显式 seats：存量记录筛不中，仍靠 sourceSessionId 那条路命中', async () => {
    const s = store()
    await s.create(legacyOfOther() as never, { kind: 'agent' })
    expect((await s.listSummaries({ seatWindowKey: WORKER })).items).toEqual([])
    expect((await s.listSummaries({ sourceSessionId: OWNER })).items.map((x) => x.id))
      .toEqual(['REQ-261003215945-0001'])
    // 读端折算：存量按单 owner 判，故 owner 自己仍旧看得见自己，worker 什么也看不见
    expect((await boundSummariesOf(s, OWNER)).map((x) => x.id)).toEqual(['REQ-261003215945-0001'])
    expect(await boundSummariesOf(s, WORKER)).toEqual([])
  })

  it('④ 席位是权威：改席之后新旧窗口的可见性同步翻转（读的是落盘那一份）', async () => {
    const s = store()
    await createThenSeat(s, [
      { windowKey: OWNER, role: 'owner', joinedAt: 100 },
      { windowKey: WORKER, role: 'worker', joinedAt: 150 },
    ])
    await s.mutate(ID, (d) => {
      d.seats = [
        { windowKey: OWNER, role: 'observer', joinedAt: 100 },
        { windowKey: WORKER, role: 'owner', joinedAt: 300 },
      ]
      return { changed: true }
    })
    expect((await boundSummariesOf(s, WORKER)).map((x) => x.id)).toEqual([ID]) // 新 owner 看得见
    expect(await boundSummariesOf(s, 'session-third')).toEqual([])            // 无关窗口看不见
    const ownerSeat = (await s.getSummary(ID))!.seats!.find((x) => x.windowKey === OWNER)!
    expect(ownerSeat.role).toBe('observer') // 原 owner 降为只读（可见 ≠ 可写，角色由写路径判）
  })
})
