/**
 * 需求详情按需取数 · 回归用例（REQ-261004195831-0f52）
 *
 * 本文件是**这一轮线上缺陷的固化锚点**：2026-10-04 详情页点开即
 * `TypeError: Cannot read properties of undefined (reading 'length')`——
 * `/state` 改成只下发摘要后，详情视图仍拿摘要当全文渲染。
 * 因此本文件的用例名即判据，谁把它改绿/改红都应当读一遍上方这段。
 *
 * 环境：vitest 默认 node（本包不含 jsdom）——取数编排走**注入桩**、渲染断言走纯函数，
 * 不引入新依赖（与 tests/board-lane-scroll.test.ts 同款纪律）。
 *
 * serves: FR-1, FR-2, FR-3, FR-4
 *
 * 分组（供 `-t` 过滤）：
 *   · `req-detail-store`  —— TC-2 / TC-3 / TC-4 + 取数分类与生命周期
 *   · `detail-states`     —— TC-5 / TC-6（三态占位文案）
 *   · `detail-defense`    —— TC-1 / TC-8（缺字段防御，本 bug 的回归锚点）
 */
import { describe, it, expect, vi } from 'vitest'
import {
  createReqDetailStore,
  MAX_ENTRIES,
  type ReqDetailEntry,
} from '../src/client/req-detail-store.ts'
import {
  buildDetailError,
  buildDetailLoading,
  buildDetailMissing,
} from '../src/client/views/detail-states.ts'
import { buildError, renderComments } from '../src/client/render/dom-utils.ts'
import { buildReqDetail } from '../src/client/views/stage-detail.ts'
import type { RequirementRecord } from '../src/client/types.ts'

/** 详情全文桩：用例只关心 id / comments / version（本 bug 与失效判据真正读到的字段）。 */
function fullRecord(id: string, commentCount = 0, version = 1): RequirementRecord {
  return {
    id,
    title: '需求 ' + id,
    status: 'implementing',
    version,
    comments: Array.from({ length: commentCount }, (_, i) => ({
      id: 'c' + String(i),
      body: '评论' + String(i),
      createdBy: { kind: 'human' },
      createdAt: 1,
    })),
  } as unknown as RequirementRecord
}

/** 手动控制结算的 promise（测「在途」必须自己决定什么时候结算）。 */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

/** 等条目落到指定状态（取数链是微任务，不能同步断言）。 */
async function waitStatus(store: { get(id: string): ReqDetailEntry | undefined }, id: string, status: ReqDetailEntry['status']): Promise<ReqDetailEntry> {
  await vi.waitFor(() => { expect(store.get(id)?.status).toBe(status) })
  const entry = store.get(id)
  if (entry === undefined) throw new Error('条目缺失：' + id)
  return entry
}

/** 空转几拍微任务，用于断言「什么都不该发生」（比 setTimeout(0) 更贴合成交时机）。 */
async function tick(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await Promise.resolve()
}

/** 带 code/hint 的错误桩（不依赖 ApiError 类，鸭子类型与生产同口径）。 */
function codedError(message: string, code?: string, hint?: string): Error {
  return Object.assign(new Error(message), {
    ...(code === undefined ? {} : { code }),
    ...(hint === undefined ? {} : { hint }),
  })
}

describe('req-detail-store · TC-2 进入详情按需取全文', () => {
  it('TC-2：ensure 恰发 1 次取数，条目为全文（含 comments 数组）', async () => {
    const calls: string[] = []
    const fetchRequirement = vi.fn(async (id: string) => {
      calls.push(id)
      return { revision: 10, requirement: fullRecord(id, 2) }
    })
    const store = createReqDetailStore({ fetchRequirement })

    store.ensure('REQ-x', 3, 10)
    expect(store.get('REQ-x')?.status).toBe('loading')

    const entry = await waitStatus(store, 'REQ-x', 'ready')
    expect(calls).toEqual(['REQ-x'])
    if (entry.status !== 'ready') throw new Error('预期 ready')
    expect(entry.revision).toBe(10)
    expect(Array.isArray(entry.record.comments)).toBe(true)
    expect(entry.record.comments).toHaveLength(2)
  })
})

describe('req-detail-store · TC-3 在途去重（SSE 与轮询撞同一 tick）', () => {
  it('TC-3：结算前连调三次 ensure 仍只 1 次请求', async () => {
    const d = deferred<{ revision: number; requirement: RequirementRecord }>()
    const fetchRequirement = vi.fn(() => d.promise)
    let notified = 0
    const store = createReqDetailStore({ fetchRequirement, onChange: () => { notified += 1 } })

    store.ensure('REQ-x')
    store.ensure('REQ-x')
    store.ensure('REQ-x')
    // 请求在微任务里发起（同步抛也要走失败分支），故先空转一拍再断言
    await tick()
    expect(fetchRequirement).toHaveBeenCalledTimes(1)

    d.resolve({ revision: 1, requirement: fullRecord('REQ-x') })
    await waitStatus(store, 'REQ-x', 'ready')

    expect(fetchRequirement).toHaveBeenCalledTimes(1)
    // 精确两拍：① 登记 loading ② 结算 ready。多一拍就是视图被无谓重绘（首轮复核要求精确值）
    expect(notified).toBe(2)
  })
})

describe('req-detail-store · TC-4 按版本/台账版本失效', () => {
  it('TC-4：上游更新才重取；且方向性——手里这份更新时不得重取（不得成环）', async () => {
    let revision = 10
    let version = 3
    const fetchRequirement = vi.fn(async (id: string) => ({ revision, requirement: fullRecord(id, 0, version) }))
    const store = createReqDetailStore({ fetchRequirement })

    store.ensure('REQ-x', 3, 10)
    await waitStatus(store, 'REQ-x', 'ready')
    expect(fetchRequirement).toHaveBeenCalledTimes(1)

    // 都不变 → 复用（同一次渲染里反复 ensure 不该放大成请求风暴）
    store.ensure('REQ-x', 3, 10)
    expect(fetchRequirement).toHaveBeenCalledTimes(1)

    // 摘要 version 前进（该需求被改过）→ 重取
    version = 4
    store.ensure('REQ-x', 4, 10)
    await waitStatus(store, 'REQ-x', 'ready')
    expect(fetchRequirement).toHaveBeenCalledTimes(2)

    // 台账 revision 前进 → 重取；注意比的是「上游 vs 手里那份响应」
    revision = 12
    store.ensure('REQ-x', 4, 12)
    await waitStatus(store, 'REQ-x', 'ready')
    expect(fetchRequirement).toHaveBeenCalledTimes(3)
    const entry = store.get('REQ-x')
    if (entry?.status !== 'ready') throw new Error('预期 ready')
    expect(entry.revision).toBe(12)

    // D2 回归锚点：/state 落后于手里这份（写入落在两次 head() 读之间是常态）→ 不得重取。
    // 用 `!==` 判据时这里会自持成环（重取→重绘→ensure→重取），实测 50ms 内 250 次请求。
    for (let i = 0; i < 10; i += 1) store.ensure('REQ-x', 4, 11)
    await tick() // 请求在微任务里发起：空转一拍才看得到「有没有多发」
    expect(fetchRequirement).toHaveBeenCalledTimes(3)
  })
})

describe('req-detail-store · 取数分类（404 与失败各自落态）', () => {
  it('404（REQBOARD_NOT_FOUND）→ missing 态，保留服务端原文', async () => {
    const store = createReqDetailStore({
      fetchRequirement: async () => { throw codedError('未找到需求 REQ-gone', 'REQBOARD_NOT_FOUND') },
    })
    store.ensure('REQ-gone')
    const entry = await waitStatus(store, 'REQ-gone', 'missing')
    if (entry.status !== 'missing') throw new Error('预期 missing')
    expect(entry.message).toContain('未找到需求 REQ-gone')
  })

  it('5xx → error 态，message / hint / code 原样带出', async () => {
    const store = createReqDetailStore({
      fetchRequirement: async () => { throw codedError('HTTP 500', 'REQBOARD_INTERNAL', 'npx tsx scripts/migrate-ledger.ts') },
    })
    store.ensure('REQ-x')
    const entry = await waitStatus(store, 'REQ-x', 'error')
    if (entry.status !== 'error') throw new Error('预期 error')
    expect(entry.message).toBe('HTTP 500')
    expect(entry.hint).toBe('npx tsx scripts/migrate-ledger.ts')
    expect(entry.code).toBe('REQBOARD_INTERNAL')
  })

  it('失败后不自动重试（刷新一次不打一次）；retry 才重取', async () => {
    let attempt = 0
    const fetchRequirement = vi.fn(async (id: string) => {
      attempt += 1
      if (attempt === 1) throw codedError('HTTP 500')
      return { revision: 1, requirement: fullRecord(id) }
    })
    const store = createReqDetailStore({ fetchRequirement })
    store.ensure('REQ-x')
    await waitStatus(store, 'REQ-x', 'error')

    store.ensure('REQ-x')
    store.ensure('REQ-x')
    expect(fetchRequirement).toHaveBeenCalledTimes(1)

    store.retry('REQ-x')
    await waitStatus(store, 'REQ-x', 'ready')
    expect(fetchRequirement).toHaveBeenCalledTimes(2)
  })

  it('结算回调自身抛错 → 落 error 态（不得被静默吞掉卡在 loading）', async () => {
    // 敌意载荷：id 取值器直接抛——证明结算的兜底网真的在（第二轮复核 D1 的"catch 不再静默"）
    const evil = { revision: 1, requirement: { get id(): string { throw new Error('getter-boom') } } }
    const store = createReqDetailStore({
      fetchRequirement: (async () => evil) as unknown as (id: string) => Promise<{ revision: number; requirement: RequirementRecord }>,
    })
    store.ensure('REQ-x')
    const entry = await waitStatus(store, 'REQ-x', 'error')
    if (entry.status !== 'error') throw new Error('预期 error')
    expect(entry.message).toContain('详情结算失败')
    expect(entry.message).toContain('getter-boom')
  })

  it('响应 id 与请求 id 不一致 → 丢弃数据，但落可恢复的 error 态（不得卡在 loading）', async () => {
    let attempt = 0
    const fetchRequirement = vi.fn(async (id: string) => {
      attempt += 1
      // 第一次给错包（乱序/异常载荷），重试后给对的
      return attempt === 1
        ? { revision: 1, requirement: fullRecord('REQ-other') }
        : { revision: 1, requirement: fullRecord(id) }
    })
    const store = createReqDetailStore({ fetchRequirement })
    store.ensure('REQ-x')
    const entry = await waitStatus(store, 'REQ-x', 'error')
    if (entry.status !== 'error') throw new Error('预期 error')
    expect(entry.code).toBe('REQBOARD_DETAIL_MISMATCH')
    expect(entry.message).toContain('REQ-other')
    // 关键：不能停在 loading —— 那会被 ensure 的 loading 短路挡住，页面永久白屏（首轮复核 P0-1）
    expect(store.get('REQ-x')?.status).not.toBe('loading')

    // 而且必须能恢复：重试 → 拿到正确的那份
    store.retry('REQ-x')
    const ready = await waitStatus(store, 'REQ-x', 'ready')
    if (ready.status !== 'ready') throw new Error('预期 ready')
    expect(ready.record.id).toBe('REQ-x')
    expect(fetchRequirement).toHaveBeenCalledTimes(2)
  })

  it('取数函数同步抛 → 落 error 态（异常不得穿透 ensure）', async () => {
    const store = createReqDetailStore({
      fetchRequirement: (() => { throw new Error('boom-sync') }) as unknown as (id: string) => Promise<never>,
    })
    // ensure 本身不得抛（它跑在渲染路径上）
    expect(() => store.ensure('REQ-x')).not.toThrow()
    const entry = await waitStatus(store, 'REQ-x', 'error')
    if (entry.status !== 'error') throw new Error('预期 error')
    expect(entry.message).toContain('boom-sync')
  })

  it('404 且服务端没给 code → 按 HTTP 状态码判「未找到」（不退化成可重试的失败）', async () => {
    const store = createReqDetailStore({
      fetchRequirement: async () => { throw Object.assign(new Error('HTTP 404'), { status: 404 }) },
    })
    store.ensure('REQ-gone')
    const entry = await waitStatus(store, 'REQ-gone', 'missing')
    expect(entry.status).toBe('missing')
  })

  it('retry 在途时是幂等空操作：连点不叠加请求', async () => {
    const d = deferred<{ revision: number; requirement: RequirementRecord }>()
    const fetchRequirement = vi.fn(() => d.promise)
    const store = createReqDetailStore({ fetchRequirement })
    store.ensure('REQ-x')
    await tick()
    expect(fetchRequirement).toHaveBeenCalledTimes(1)

    store.retry('REQ-x')
    store.retry('REQ-x')
    store.retry('REQ-x')
    expect(fetchRequirement).toHaveBeenCalledTimes(1)
    // 重试期间不得闪空：条目仍在（loading），视图有东西可渲染
    expect(store.get('REQ-x')?.status).toBe('loading')

    d.resolve({ revision: 1, requirement: fullRecord('REQ-x') })
    await waitStatus(store, 'REQ-x', 'ready')
    expect(fetchRequirement).toHaveBeenCalledTimes(1)
  })

  it('requirement 为 null（异常载荷）→ 落可恢复的 error 态，不得永久 loading', async () => {
    let attempt = 0
    const fetchRequirement = vi.fn(async (id: string) => {
      attempt += 1
      // 第一次给 null（typeof null === 'object' 会骗过普通守卫），重试后给对的
      if (attempt === 1) return { revision: 1, requirement: null as unknown as RequirementRecord }
      return { revision: 1, requirement: fullRecord(id) }
    })
    const store = createReqDetailStore({ fetchRequirement })
    store.ensure('REQ-x')
    const entry = await waitStatus(store, 'REQ-x', 'error')
    if (entry.status !== 'error') throw new Error('预期 error')
    expect(entry.message).toContain('空载荷')
    expect(store.get('REQ-x')?.status).not.toBe('loading')

    store.retry('REQ-x')
    await waitStatus(store, 'REQ-x', 'ready')
    expect(fetchRequirement).toHaveBeenCalledTimes(2)
  })

  it('载荷不带 revision → 不得混源判失效（否则方向性判据恒真、风暴从这条路复活）', async () => {
    // 第三轮复核 ③-1：曾把 payload.revision 缺失回落成 record.version（局部计数器，小），
    // 与 /state 的台账全局 revision（大）比 → 恒真 → 自持重取。这里钉死「宁可不重取，也不混源」。
    let calls = 0
    const store = createReqDetailStore({
      fetchRequirement: async (id: string) => {
        calls += 1
        return { requirement: fullRecord(id, 0, 3) } as unknown as { revision: number; requirement: RequirementRecord }
      },
    })
    store.ensure('REQ-x', 3, 40)
    await waitStatus(store, 'REQ-x', 'ready')
    expect(calls).toBe(1)
    // 上游摘要版本没变、手里这份没有台账 revision → 连调多次都不得重取
    for (let i = 0; i < 10; i += 1) store.ensure('REQ-x', 3, 40)
    await tick()
    expect(calls).toBe(1)
  })

  it('reset 后到达的响应不得写回（离开详情页的迟到响应）', async () => {
    const d = deferred<{ revision: number; requirement: RequirementRecord }>()
    const store = createReqDetailStore({ fetchRequirement: () => d.promise })
    store.ensure('REQ-x')
    store.reset()
    expect(store.get('REQ-x')).toBeUndefined()
    d.resolve({ revision: 1, requirement: fullRecord('REQ-x') })
    await tick()
    expect(store.get('REQ-x')).toBeUndefined()
  })

  it('reset 幂等：连调两次不炸；迟到的失败也不得复活条目', async () => {
    const d = deferred<{ revision: number; requirement: RequirementRecord }>()
    const store = createReqDetailStore({ fetchRequirement: () => d.promise })
    store.ensure('REQ-x')
    store.reset()
    store.reset()
    d.reject(Object.assign(new Error('HTTP 500'), { status: 500 }))
    await tick()
    expect(store.get('REQ-x')).toBeUndefined()
  })

  it('条目容量上限 16：被淘汰的是最旧那条（正在看的那条幸存）', async () => {
    const store = createReqDetailStore({
      fetchRequirement: async (id: string) => ({ revision: 1, requirement: fullRecord(id) }),
    })
    // 依次灌满 16 条：REQ-00 … REQ-15（REQ-00 最旧）
    for (let i = 0; i < MAX_ENTRIES; i += 1) {
      const id = 'REQ-' + String(i).padStart(2, '0')
      store.ensure(id)
      await waitStatus(store, id, 'ready')
    }
    // 注意：这里**先不要** get('REQ-00')——get 命中会刷新淘汰序（正在看的条目不该被挤掉），
    // 那样最旧的就不是 REQ-00 了，断言会变得依赖实现细节。

    // 第 17 条：淘汰最旧的 REQ-00（其余 15 条 + 新条目仍在）
    store.ensure('REQ-99')
    await waitStatus(store, 'REQ-99', 'ready')
    expect(store.get('REQ-00')).toBeUndefined()
    expect(store.get('REQ-01')?.status).toBe('ready')
    expect(store.get('REQ-15')?.status).toBe('ready')
  })

  it('容量淘汰优先挑非 loading：在途取数的那条不被淘汰（否则视图空白到响应到达）', async () => {
    const slow = deferred<{ revision: number; requirement: RequirementRecord }>()
    const store = createReqDetailStore({
      fetchRequirement: (id: string) => id === 'REQ-slow'
        ? slow.promise
        : Promise.resolve({ revision: 1, requirement: fullRecord(id) }),
    })

    // 最旧的一条是"正在取数"的
    store.ensure('REQ-slow')
    expect(store.get('REQ-slow')?.status).toBe('loading')
    for (let i = 0; i < MAX_ENTRIES; i += 1) {
      const id = 'REQ-' + String(i).padStart(2, '0')
      store.ensure(id)
      await waitStatus(store, id, 'ready')
    }
    // 溢出后，在途的那条必须还在（被淘汰的应是最旧的 ready）
    expect(store.get('REQ-slow')?.status).toBe('loading')
    slow.resolve({ revision: 1, requirement: fullRecord('REQ-slow') })
    await waitStatus(store, 'REQ-slow', 'ready')
  })

  it('get() 也刷新淘汰序：只读不 ensure 时正在看的那条不被挤掉', async () => {
    const store = createReqDetailStore({
      fetchRequirement: async (id: string) => ({ revision: 1, requirement: fullRecord(id) }),
    })
    store.ensure('REQ-keep')
    await waitStatus(store, 'REQ-keep', 'ready')
    for (let i = 0; i < MAX_ENTRIES; i += 1) {
      const id = 'REQ-' + String(i).padStart(2, '0')
      store.ensure(id)
      await waitStatus(store, id, 'ready')
      store.get('REQ-keep')   // 视图每次重绘都会 get 一次
    }
    expect(store.get('REQ-keep')?.status).toBe('ready')
  })
})

describe('detail-states · TC-5 未找到态（不静默弹回看板）', () => {
  it('TC-5：missing 占位点名需求 id、带状态标记与返回按钮', () => {
    const html = buildDetailMissing('REQ-gone', '未找到需求 REQ-gone')
    expect(html).toContain('未找到')
    expect(html).toContain('REQ-gone')
    expect(html).toContain('data-detail-state="missing"')
    // 外壳仍是详情（事件委派按 [data-action] 找，返回按钮必须还在）
    expect(html).toContain('data-detail-req="REQ-gone"')
    expect(html).toContain('data-action="back"')
  })

  it('TC-5 边界：message 为空时给兜底文案，不留半截句子', () => {
    const html = buildDetailMissing('REQ-gone', '')
    expect(html).toContain('REQ-gone')
    expect(html).toContain('不存在或已被删除')
    expect(html).not.toContain('未找到需求：</div>')
  })

  it('TC-5 安全：reqId / message 里的 HTML 被转义（不破结构）', () => {
    const html = buildDetailMissing('REQ-<x>', '<img src=x onerror=1>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})

describe('detail-states · TC-6 失败态（原因 + hint + 重试）', () => {
  it('TC-6：error 占位带服务端原文、hint 与重试入口', () => {
    const html = buildDetailError('REQ-x', 'HTTP 500', 'npx tsx scripts/migrate-ledger.ts')
    expect(html).toContain('HTTP 500')
    expect(html).toContain('npx tsx scripts/migrate-ledger.ts')
    expect(html).toContain('在终端执行：')
    expect(html).toContain('data-detail-state="error"')
    expect(html).toContain('data-action="retry-detail"')
    expect(html).toContain('data-id="REQ-x"')
  })

  it('TC-6 边界：hint 缺省时不渲染 hint 块，且空 message 有兜底文案', () => {
    const withHint = buildDetailError('REQ-x', 'HTTP 500', undefined)
    expect(withHint).not.toContain('在终端执行：')
    expect(withHint).not.toContain('dsh-pm-error-hint')
    const blank = buildDetailError('REQ-x', '   ')
    expect(blank).toContain('取数失败')
    expect(blank).toContain('data-action="retry-detail"')
  })

  it('TC-6 一致：错误呈现与既有 buildError 同口径（不另写一份失败样式）', () => {
    const hint = 'npx tsx scripts/migrate-ledger.ts'
    expect(buildDetailError('REQ-x', 'HTTP 500', hint)).toContain(buildError('HTTP 500', hint))
  })
})

describe('detail-states · 加载态（等待也不是白板）', () => {
  it('loading 占位：正文位非空、返回按钮可用、状态标记可断言', () => {
    const html = buildDetailLoading('REQ-x')
    expect(html).toContain('data-detail-state="loading"')
    expect(html).toContain('详情加载中…')
    expect(html).toContain('data-action="back"')
    expect(html).toContain('data-detail-req="REQ-x"')
  })
})

/* ------------------------------------------------------------------ 缺字段防御 */

/**
 * `/state` 现在下发的**摘要**形状（没有 comments/artifacts/plan/verification/archive）。
 * 这是本 bug 的输入本体：用它调详情渲染必须不崩——下面 TC-1 就是这条复现路径的固化。
 */
function summaryRecord(id: string): RequirementRecord {
  return {
    id,
    title: '摘要记录 ' + id,
    status: 'implementing',
    blocked: false,
    createdAt: 1,
    updatedAt: 2,
    version: 3,
    commentCount: 0,
    artifactCount: 0,
    category: 'feature',
  } as unknown as RequirementRecord
}

describe('detail-defense · TC-1 摘要形状不崩（本 bug 回归锚点）', () => {
  it('TC-1：摘要记录调 buildReqDetail 不抛异常，评论区落空态、计数为 0', () => {
    let html = ''
    expect(() => { html = buildReqDetail(summaryRecord('REQ-x'), [], Date.now()) }).not.toThrow()
    // 空态而非空白；计数走 0（不是 undefined 条）
    expect(html).toContain('暂无评论')
    expect(html).toContain('0 条')
    expect(html).not.toContain('undefined')
  })

  it('TC-1 加强：本体字段全部缺失（连数组都不是）也不崩', () => {
    const broken = {
      ...summaryRecord('REQ-y'),
      comments: null,
      artifacts: null,
      statusHistory: null,
      docLinks: null,
    } as unknown as RequirementRecord
    expect(() => buildReqDetail(broken, [], Date.now())).not.toThrow()
  })

  it('TC-1 反向断言：正常全文路径仍渲染真实评论（兜底不得掩盖正常数据）', () => {
    const html = buildReqDetail(fullRecord('REQ-z', 2), [], Date.now())
    expect(html).toContain('评论0')
    expect(html).toContain('评论1')
    expect(html).toContain('2 条')
  })
})

describe('detail-defense · TC-8 评论渲染对缺失/非数组降级', () => {
  it('TC-8：undefined / null / [] 三者输出逐字节相同', () => {
    const empty = renderComments([])
    expect(renderComments(undefined)).toBe(empty)
    expect(renderComments(null as unknown as undefined)).toBe(empty)
    expect(empty).toContain('暂无评论')
  })

  it('TC-8 边界：字符串/对象等脏数据同口径按空处理', () => {
    const empty = renderComments([])
    expect(renderComments('oops' as unknown as undefined)).toBe(empty)
    expect(renderComments({} as unknown as undefined)).toBe(empty)
  })
})

/* ------------------------------------------------------------------ 接线端到端 */

/**
 * 详情接线的端到端锚点（首轮独立复核指出：只测模块本身、不测接线 = 合入也不修线上缺陷）。
 *
 * 观测对象是**渲染出来的 HTML**：用 /state 的**摘要**（无 comments 本体）喂首屏，
 * 详情端点回**全文**——改前这里会因 `renderComments(undefined)` 抛错（被 fetchAll 的 try/catch
 * 兜成「加载失败」），所以下面断言「屏幕上出现真实评论」正是这条缺陷的红绿判据。
 *
 * 环境：与 tests/board-attach.test.ts 同款最小 DOM 桩（本包无 jsdom）。
 */
describe('board-wiring · 详情接线（本 bug 的端到端锚点）', () => {
  const REQ_ID = 'REQ-wired'
  /** `/state` 下发的摘要：**没有** comments 本体（线上崩溃的输入形状） */
  const SUMMARY = {
    id: REQ_ID, title: '接线需求', status: 'implementing', blocked: false,
    createdAt: 1, updatedAt: 2, version: 3, commentCount: 1, artifactCount: 0,
    category: 'feature', sourceSessionId: 'session-x',
  }
  /** 详情端点回的全文 */
  const FULL = {
    ...SUMMARY,
    comments: [{ id: 'c1', body: '真实评论内容', createdBy: { kind: 'human' }, createdAt: 5 }],
    artifacts: [], statusHistory: [], description: '描述',
  }

  function jsonResponse(data: unknown): Promise<Response> {
    return Promise.resolve(new Response(
      JSON.stringify({ success: true, data }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
  }

  /** SSE 桩：接线测试不关心事件流，只要 subscribeEvents 能建立（否则 attachBoard 直接抛）。 */
  class FakeEventSource {
    onmessage: ((ev: MessageEvent) => void) | null = null
    constructor(readonly url: string) { /* 记录 URL 即可 */ }
    addEventListener(): void { /* no-op */ }
    close(): void { /* no-op */ }
  }

  function renderableContainer(): HTMLElement {
    return {
      innerHTML: '',
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
    } as unknown as HTMLElement
  }

  it('打开详情：恰 1 次详情请求，且渲染的是全文内容（不是摘要空壳）', async () => {
    vi.useRealTimers() // 覆盖外层可能存在的假定时器，配合 vi.waitFor
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn((input: unknown) => {
      const url = String(input)
      calls.push(url)
      if (/\/requirements\/[^/?]+$/.test(url)) return jsonResponse({ revision: 9, requirement: FULL })
      return jsonResponse({ revision: 9, requirements: [SUMMARY], tasks: [], ready: {} })
    }))
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('EventSource', FakeEventSource)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { void cb(0 as never); return 0 })
    vi.stubGlobal('document', {
      hidden: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {}, addEventListener: () => {} }),
    })

    const boardFocus = await import('../src/client/board-focus.ts')
    const { attachBoard } = await import('../src/client/board-mount.ts')
    boardFocus.requestBoardFocus(REQ_ID)
    const el = renderableContainer()
    const dispose = attachBoard(el, { poll: false })

    // 红绿判据：屏幕上必须出现**全文里的真实评论**
    await vi.waitFor(() => { expect(el.innerHTML).toContain('真实评论内容') })
    // 且不能是「加载失败」兜底（改前的表现）
    expect(el.innerHTML).not.toContain('加载失败')
    expect(el.innerHTML).toContain('data-detail-req="REQ-wired"')

    const detailCalls = calls.filter(c => /\/requirements\/[^/?]+$/.test(c))
    expect(detailCalls).toHaveLength(1)
    dispose()
  })

  it('详情端点 404 → 落「未找到」占位，且**不**静默弹回看板', async () => {
    vi.useRealTimers()
    vi.stubGlobal('fetch', vi.fn((input: unknown) => {
      const url = String(input)
      if (/\/requirements\/[^/?]+$/.test(url)) {
        return Promise.resolve(new Response(
          JSON.stringify({ success: false, code: 'REQBOARD_NOT_FOUND', error: '未找到需求 ' + REQ_ID }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        ))
      }
      return jsonResponse({ revision: 9, requirements: [SUMMARY], tasks: [], ready: {} })
    }))
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('EventSource', FakeEventSource)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { void cb(0 as never); return 0 })
    vi.stubGlobal('document', {
      hidden: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {}, addEventListener: () => {} }),
    })

    const boardFocus = await import('../src/client/board-focus.ts')
    const { attachBoard } = await import('../src/client/board-mount.ts')
    boardFocus.requestBoardFocus(REQ_ID)
    const el = renderableContainer()
    const dispose = attachBoard(el, { poll: false })

    await vi.waitFor(() => { expect(el.innerHTML).toContain('data-detail-state="missing"') })
    // 仍在详情态（改前会静默 mode=board → 看板 DOM，人以为点错了）
    expect(el.innerHTML).toContain('data-detail-req="REQ-wired"')
    dispose()
  })

  it('先看到全文、之后需求被删 → 落「未找到」，不得拿旧渲染顶着（终态优先于旧数据）', async () => {
    vi.useRealTimers()
    let gone = false
    let revision = 9
    vi.stubGlobal('fetch', vi.fn((input: unknown) => {
      const url = String(input)
      if (/\/requirements\/[^/?]+$/.test(url)) {
        if (gone) {
          return Promise.resolve(new Response(
            JSON.stringify({ success: false, code: 'REQBOARD_NOT_FOUND', error: '未找到需求 ' + REQ_ID }),
            { status: 404, headers: { 'Content-Type': 'application/json' } },
          ))
        }
        return jsonResponse({ revision, requirement: FULL })
      }
      return jsonResponse({ revision, requirements: [SUMMARY], tasks: [], ready: {} })
    }))
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('EventSource', FakeEventSource)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { void cb(0 as never); return 0 })
    vi.stubGlobal('document', {
      hidden: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {}, addEventListener: () => {} }),
    })

    const boardFocus = await import('../src/client/board-focus.ts')
    // 用 createBoardAttachment 是为了拿到 refresh()：模拟「SSE/轮询又刷了一轮」
    const { createBoardAttachment } = await import('../src/client/board-mount.ts')
    boardFocus.requestBoardFocus(REQ_ID)
    const el = renderableContainer()
    const att = createBoardAttachment(el, { poll: false })

    // 第一轮：详情正常（屏幕上有真实评论）
    await vi.waitFor(() => { expect(el.innerHTML).toContain('真实评论内容') })

    // 第二轮：需求被删除，且台账 revision 变了 → 重取 → 404
    gone = true
    revision = 10
    att.refresh()
    await vi.waitFor(() => { expect(el.innerHTML).toContain('data-detail-state="missing"') })
    // 关键：旧内容必须消失（否则就是「拿旧数据假装需求还在」）
    expect(el.innerHTML).not.toContain('真实评论内容')
    att.dispose()
  })

  it('首屏（看板视图）0 次详情请求：A9 载荷治理成果不倒退', async () => {
    vi.useRealTimers()
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn((input: unknown) => {
      const url = String(input)
      calls.push(url)
      return jsonResponse({ revision: 9, requirements: [SUMMARY], tasks: [], ready: {} })
    }))
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('EventSource', FakeEventSource)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { void cb(0 as never); return 0 })
    vi.stubGlobal('document', {
      hidden: false, addEventListener: () => {}, removeEventListener: () => {},
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {}, addEventListener: () => {} }),
    })

    const { createBoardAttachment } = await import('../src/client/board-mount.ts')
    const el = renderableContainer()
    const att = createBoardAttachment(el, { poll: false })
    await vi.waitFor(() => { expect(el.innerHTML.length).toBeGreaterThan(0) })
    // 没有定位意图 → 停在看板：不得发任何详情请求（详情只在进详情时按需取）
    expect(calls.filter(c => /\/requirements\/[^/?]+$/.test(c))).toEqual([])
    att.dispose()
  })

  it('卸载后在途响应到达 → 不得写回界面（迟到响应作废）', async () => {
    vi.useRealTimers()
    const d = deferred<{ revision: number; requirement: unknown }>()
    vi.stubGlobal('fetch', vi.fn((input: unknown) => {
      const url = String(input)
      if (/\/requirements\/[^/?]+$/.test(url)) return d.promise
      return jsonResponse({ revision: 9, requirements: [SUMMARY], tasks: [], ready: {} })
    }))
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('EventSource', FakeEventSource)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { void cb(0 as never); return 0 })
    vi.stubGlobal('document', {
      hidden: false, addEventListener: () => {}, removeEventListener: () => {},
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {}, addEventListener: () => {} }),
    })

    const boardFocus = await import('../src/client/board-focus.ts')
    const { createBoardAttachment } = await import('../src/client/board-mount.ts')
    boardFocus.requestBoardFocus(REQ_ID)
    const el = renderableContainer()
    const att = createBoardAttachment(el, { poll: false })
    // 详情请求在途 → 用户此刻卸载（切走面板/关页面）
    await vi.waitFor(() => { expect(el.innerHTML).toContain('data-detail-state="loading"') })
    att.dispose()

    // 迟到的成功响应到达：不得改写已释放的界面
    d.resolve({ revision: 9, requirement: FULL })
    await tick()
    expect(el.innerHTML).not.toContain('真实评论内容')
  })
})
