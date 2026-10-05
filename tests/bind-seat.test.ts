/**
 * reqboard_bind 与 status 席位暴露（REQ-261003215944-9e04 FR-2 · t-845a64）。
 *
 * 【为什么走真实分片存储而不是内存替身】
 * 卡上的验收写的是「调 reqboard_bind 后**读 record.json**」——这条只有真落盘才答得了。
 * 本文件跑在真实 `ShardedRequirementStore` 上：派席 → 真的去读那个文件 → 逐字比对。
 *
 * 【钉死的六条】
 *   ① 加 worker：`record.json` 的 `seats` 长度 2，**owner 项逐字未变**（含 joinedAt）；
 *   ② 同窗同角色再加：幂等（changed=false，盘上字节不变）；
 *   ③ 解绑 owner → REQBOARD_INVALID_INPUT（且不落盘）；解绑 worker → 长度回落 1；
 *   ④ 第 9 个席位 → REQBOARD_SEAT_LIMIT（上限 8）；
 *   ⑤ 无权派席：worker 席位调用 → REQBOARD_SEAT_NOT_OWNER；跨需求 → NOT_BOUND_TO_WINDOW；
 *   ⑥ reqboard_status 的 `seats` 与 `record.json` 逐字一致（不是只在返回体里算一份）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ShardedRequirementStore } from '../src/repositories/ShardedRequirementStore.js'
import { recordPath } from '../src/domain/requirement/ReqboardPaths.js'
import { bindSeat } from '../src/application/use-cases/BindSeat.js'
import { seatsOf } from '../src/application/internal/window.js'
import { queryState } from '../src/application/query/QueryState.js'
import type { UseCaseDeps } from '../src/application/ports.js'
import type { WindowSeat } from '../src/shared/protocol.js'

const OWNER = 'session-owner-bind'
const PEER = 'session-peer-bind'
const ID = 'REQ-261003215944-9e04'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'pmboard-bind-seat-')) })
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

/** 只装 BindSeat / queryState 真正用到的那几件（store / clock / ids / session / docs 桩）。 */
function depsFor(store: ShardedRequirementStore): UseCaseDeps {
  let n = 0
  return {
    store,
    clock: { now: () => 1_700_000_000_000 },
    ids: { comment: () => `c-${++n}` },
    session: { windowKey: (ctx: unknown) => (ctx as { agent?: { id?: string } })?.agent?.id ?? '' },
    // 桩：本用例只关心席位表。文档仓库在状态查询里被读（设计文档登记态），给它"什么都不存在"即可
    // ——那正是"还没写设计文档"的真实形态，不是伪造。
    docs: { exists: () => false, read: async () => '', write: async () => { /* 桩 */ }, list: () => [] },
  } as unknown as UseCaseDeps
}

/** 盘上那份 record.json（验收原话：读这个文件）。 */
function onDisk(id: string): { seats?: WindowSeat[]; sourceSessionId?: string; comments?: unknown[] } {
  return JSON.parse(readFileSync(recordPath(root, id), 'utf8'))
}

async function seedOwner(): Promise<{ store: ShardedRequirementStore; deps: UseCaseDeps }> {
  const store = new ShardedRequirementStore({ root, onWarn: () => { /* 本用例不关心告警 */ } })
  await store.create({
    id: ID, title: '席位派发夹具', description: '联调夹具',
    status: 'implementing', sourceSessionId: OWNER,
  } as never, { kind: 'agent' })
  return { store, deps: depsFor(store) }
}

describe('① 加席位：owner 项逐字未变', () => {
  it('派 worker 后 record.json 的 seats 长度 2，owner 那一项一字未动', async () => {
    const { deps } = await seedOwner()
    const before = onDisk(ID)
    expect(before.seats).toBeUndefined()            // 存量形态：还没有 seats 字段
    const out = await bindSeat(deps, OWNER, { role: 'worker', windowKey: PEER })
    expect(out.success).toBe(true)
    expect(out.changed).toBe(true)

    const after = onDisk(ID)
    expect(after.seats).toHaveLength(2)
    expect(after.sourceSessionId).toBe(OWNER)       // 没顺手改写来源窗口
    // owner 项逐字未变：折算出来的 windowKey / role / joinedAt 与读端规则同源（createdAt）
    const foldedOwner = { windowKey: OWNER, role: 'owner', joinedAt: (await deps.store!.get(ID))!.createdAt }
    expect(after.seats![0]).toEqual(foldedOwner)
    expect(after.seats![1]).toMatchObject({ windowKey: PEER, role: 'worker' })
    // 留痕：席位变更写进评论（谁把谁请进来）——评论住 comments.jsonl，装配后经 store.get 读回
    expect(JSON.stringify((await deps.store!.get(ID))!.comments ?? [])).toContain('新增席位')
  })

  it('同窗同角色再加 → 幂等（changed=false 且盘上字节不变）', async () => {
    const { deps } = await seedOwner()
    await bindSeat(deps, OWNER, { role: 'worker', windowKey: PEER })
    const snapshot = readFileSync(recordPath(root, ID), 'utf8')
    const again = await bindSeat(deps, OWNER, { role: 'worker', windowKey: PEER })
    expect(again.changed).toBe(false)
    expect(again.seats).toHaveLength(2)
    expect(readFileSync(recordPath(root, ID), 'utf8')).toBe(snapshot)
  })
})

describe('② 解绑：owner 不可解绑', () => {
  it('解绑 worker → 长度回落 1；再解绑 owner → REQBOARD_INVALID_INPUT 且盘上不变', async () => {
    const { deps } = await seedOwner()
    await bindSeat(deps, OWNER, { role: 'worker', windowKey: PEER })
    const removed = await bindSeat(deps, OWNER, { role: 'worker', windowKey: PEER, remove: true })
    expect(removed.removed).toBe(true)
    expect(removed.seats).toHaveLength(1)
    expect(onDisk(ID).seats).toHaveLength(1)

    const snapshot = readFileSync(recordPath(root, ID), 'utf8')
    await expect(bindSeat(deps, OWNER, { role: 'worker', windowKey: OWNER, remove: true }))
      .rejects.toMatchObject({ code: 'REQBOARD_INVALID_INPUT' })
    expect(readFileSync(recordPath(root, ID), 'utf8')).toBe(snapshot)  // 拒绝是零写入
  })

  it('解绑一个本来就不存在的席位 → 幂等成功（不报错）', async () => {
    const { deps } = await seedOwner()
    const out = await bindSeat(deps, OWNER, { role: 'worker', windowKey: 'session-nobody', remove: true })
    expect(out.changed).toBe(false)
    expect(out.seats).toHaveLength(1)
  })

  // 复核发现的洞（本用例就是那道门）：owner 把**自己**改成 worker。
  // 席位是权威 ⇒ 没人再是 owner ⇒ 这条需求从此推不动阶段、把不了门、也派不了席。
  it('owner 自降必须被拒：否则这条需求一个 owner 都不剩', async () => {
    const { deps } = await seedOwner()
    for (const role of ['worker', 'observer'] as const) {
      await expect(bindSeat(deps, OWNER, { role, windowKey: OWNER }))
        .rejects.toMatchObject({ code: 'REQBOARD_INVALID_INPUT' })
    }
    // 零写入：盘上还没 seats 字段（两条都被拒）⇒ 按折算口径看，owner 仍是那一个、没被降级
    expect(onDisk(ID).seats).toBeUndefined()
    const rec = (await deps.store!.get(ID))!
    const seats = seatsOf(rec)
    expect(seats).toHaveLength(1)
    expect(seats[0]).toMatchObject({ windowKey: OWNER, role: 'owner' })
  })

  it('owner 换绑（把 owner 位子给另一个窗口）不经本工具——本工具只动非 owner 席位', async () => {
    const { deps } = await seedOwner()
    await bindSeat(deps, OWNER, { role: 'observer', windowKey: PEER })
    // observer → worker 是允许的（非 owner 席位可调）
    const promoted = await bindSeat(deps, OWNER, { role: 'worker', windowKey: PEER })
    expect(promoted.changed).toBe(true)
    expect(promoted.seats.find(s => s.windowKey === PEER)!.role).toBe('worker')
    expect(promoted.seats.filter(s => s.role === 'owner')).toHaveLength(1)
  })
})

describe('③ 上限：第 9 个席位被拒', () => {
  it('加到 8 个为止，第 9 个 → REQBOARD_SEAT_LIMIT', async () => {
    const { deps } = await seedOwner()
    for (let i = 1; i <= 7; i++) await bindSeat(deps, OWNER, { role: 'worker', windowKey: `session-w${i}` })
    expect(onDisk(ID).seats).toHaveLength(8)            // owner + 7
    await expect(bindSeat(deps, OWNER, { role: 'worker', windowKey: 'session-w8' }))
      .rejects.toMatchObject({ code: 'REQBOARD_SEAT_LIMIT' })
    expect(onDisk(ID).seats).toHaveLength(8)            // 拒绝不落盘
  })

  it('上限可配（seatsMax=2）：第 3 个就被拒', async () => {
    const { deps } = await seedOwner()
    await bindSeat(deps, OWNER, { role: 'observer', windowKey: PEER }, 2)
    await expect(bindSeat(deps, OWNER, { role: 'worker', windowKey: 'session-w9' }, 2))
      .rejects.toMatchObject({ code: 'REQBOARD_SEAT_LIMIT' })
  })
})

describe('④ 授权：只有 owner 能派席', () => {
  it('worker 席位调用 → REQBOARD_SEAT_NOT_OWNER（不允许自己把别人请进来）', async () => {
    const { deps } = await seedOwner()
    await bindSeat(deps, OWNER, { role: 'worker', windowKey: PEER })
    await expect(bindSeat(deps, PEER, { role: 'observer', windowKey: 'session-x' }))
      .rejects.toMatchObject({ code: 'REQBOARD_SEAT_NOT_OWNER' })
    expect(onDisk(ID).seats).toHaveLength(2)            // 零写入
  })

  it('observer 席位调用 → REQBOARD_SEAT_READONLY', async () => {
    const { deps } = await seedOwner()
    await bindSeat(deps, OWNER, { role: 'observer', windowKey: PEER })
    await expect(bindSeat(deps, PEER, { role: 'worker', windowKey: 'session-x' }))
      .rejects.toMatchObject({ code: 'REQBOARD_SEAT_READONLY' })
  })

  it('无关窗口调用 → REQBOARD_NO_BOUND_REQ（看不见就派不了）', async () => {
    const { deps } = await seedOwner()
    await expect(bindSeat(deps, 'session-stranger', { role: 'worker' }))
      .rejects.toMatchObject({ code: 'REQBOARD_NO_BOUND_REQ' })
  })

  it('显式指名一条不属于本窗口的需求 → REQBOARD_NOT_BOUND_TO_WINDOW', async () => {
    const { deps } = await seedOwner()
    await expect(bindSeat(deps, OWNER, { role: 'worker', requirementId: 'REQ-000000-zzzz' }))
      .rejects.toMatchObject({ code: 'REQBOARD_NOT_BOUND_TO_WINDOW' })
  })

  it('role 非法 → REQBOARD_INVALID_INPUT（owner 不经本工具产生）', async () => {
    const { deps } = await seedOwner()
    await expect(bindSeat(deps, OWNER, { role: 'owner' }))
      .rejects.toMatchObject({ code: 'REQBOARD_INVALID_INPUT' })
  })
})

describe('⑤ reqboard_status 的 seats 与台账逐字一致', () => {
  it('加两个席位后，status.seats 与 record.json 的 seats 完全相等；my_seat 是本窗口那一项', async () => {
    const { deps } = await seedOwner()
    await bindSeat(deps, OWNER, { role: 'worker', windowKey: PEER })
    await bindSeat(deps, OWNER, { role: 'observer', windowKey: 'session-looker' })

    const out = await queryState(deps, {}, { agent: { id: OWNER } }) as { seats?: WindowSeat[]; my_seat?: WindowSeat }
    expect(out.seats).toEqual(onDisk(ID).seats)                 // 逐字一致（同一个数组结构）
    expect(out.my_seat).toMatchObject({ windowKey: OWNER, role: 'owner' })
  })

  it('observer 窗口看：status.seats 照旧给全表，my_seat 是它自己的 observer 席位', async () => {
    const { deps } = await seedOwner()
    await bindSeat(deps, OWNER, { role: 'observer', windowKey: PEER })
    const out = await queryState(deps, {}, { agent: { id: PEER } }) as { seats?: WindowSeat[]; my_seat?: WindowSeat }
    expect(out.seats).toHaveLength(2)
    expect(out.my_seat).toMatchObject({ windowKey: PEER, role: 'observer' })
  })

  it('没有绑定需求的窗口：seats 与 my_seat 两个键整体省略（不发空数组/null）', async () => {
    const { deps } = await seedOwner()
    const out = await queryState(deps, {}, { agent: { id: 'session-nobody' } }) as Record<string, unknown>
    expect(out.bound).toBe(false)
    expect('seats' in out).toBe(false)
    expect('my_seat' in out).toBe(false)
  })
})
