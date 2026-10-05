/**
 * 需求详情按需取数（REQ-261004195831-0f52 · FR-1 / FR-2 / FR-3）——纯逻辑、零 DOM、零 IO、零存储。
 *
 * 为什么必须有这个模块：`/state` 自 B12 阶段⑥-①（REQ-261002161439-277d）起只下发
 * **摘要**（`RequirementSummary`：id/title/status/version/commentCount…），本体字段
 * （comments/artifacts/plan/verification/archive）改由 `GET /requirements/:id` 按需取。
 * 但详情视图此前仍把摘要当全文渲染 → `renderComments(req.comments)` 对 `undefined` 取 `.length`，
 * 详情页整块不渲染（2026-10-04 线上实测，`TypeError: Cannot read properties of undefined (reading 'length')`）。
 *
 * 本模块把「取数」从视图里抽出来，只做三件事：
 *   ① **按需取全文**：进入详情才发 `GET /requirements/:id`（首屏仍是 0 次详情请求，不倒退 B12 成果）；
 *   ② **在途去重**：同一 reqId 在途只保留一个请求（SSE 事件与轮询撞在同一 tick 是常态）；
 *   ③ **按版本失效**：摘要 `version` / 台账 `revision` 任一变化才重取，避免请求风暴。
 *
 * 三条纪律（与 `dag/view-state.ts` 同款）：
 *  - **纯**：不碰 DOM / 计时器 / 存储；取数函数由调用方注入 → 在 Node 里可直接单测（本包无 jsdom）；
 *  - **不持久化**：条目只在页面内存（Map），刷新即清空（明确接受）；
 *  - **不静默失数据**：取不到全文绝不拿摘要冒充（那正是本次要修的缺陷形态），一律落 missing / error 态。
 *
 * 一条硬约束（首轮独立复核的产物，别再改回去）：**条目一旦建立就不得停在无出口的 loading**——
 * 任何"丢弃响应"的分支都必须给出**可恢复的终态**（error / missing）。否则 `ensure` 会被自己的
 * loading 短路挡住：页面永久空白、没有任何重试入口（P0 活锁，已实测）。
 *
 * 设计出处：design/interfaces.md §req-detail-store、design/data-model.md §ReqDetailEntry。
 *
 * @module dsh-pmboard/client/req-detail-store
 */
import type { RequirementRecord } from './types.ts'

/** 详情取数结果四态——判别联合：状态与数据同生共死，不会出现「有 error 又有 record」。 */
export type ReqDetailEntry =
  | { status: 'loading'; reqId: string; startedAt: number }
  | {
      status: 'ready'
      reqId: string
      /** 全文：`GET /requirements/:id` 的 `data.requirement`（详情页唯一正文数据源） */
      record: RequirementRecord
      /**
       * 响应携带的**台账全局版本**（失效判据之一）；响应没带就是 undefined。
       *
       * 为什么可以是 undefined、且**不许**回落成 `record.version`：那是「按需求的局部计数器」
       * （通常个位数），与 `/state` 的台账全局 revision（通常几十上百）**不同源**。混源后
       * `ledgerRevision > existing.revision` 恒真 → 重取→重绘→ensure 自持成环
       * （第三轮复核实测 501 次请求 / 1000 次重绘）。判据宁可不成立，也不许混源。
       */
      revision?: number
      /** 取到时刻（ms）；仅诊断与单测使用，不参与失效判定 */
      fetchedAt: number
    }
  | { status: 'missing'; reqId: string; message: string }
  | { status: 'error'; reqId: string; message: string; hint?: string; code?: string }

/** 取数依赖（注入是为了可测：生产传 `api.fetchRequirement`）。 */
export interface ReqDetailDeps {
  fetchRequirement: (id: string) => Promise<{ revision: number; requirement: RequirementRecord }>
  /**
   * 条目变化通知（视图据此重绘）。
   * 一次取数会通知**两拍**（登记 loading / 结算），视图端自行合并（board-mount 用微任务去重）；
   * loading 那一拍是**同步**回调，视图若直接重绘会在同一次 render 里递归再进 render。
   * 回调抛错不影响取数本身。
   */
  onChange?: () => void
}

export interface ReqDetailStore {
  /**
   * 确保 reqId 的详情可用（**唯一取数入口**，视图每次重绘都可无脑调）。
   * - 无条目 / 需要失效 → 登记 loading 并发 1 次请求；
   * - 在途（loading）→ 复用在途请求，**不发新请求**（SSE 与轮询同 tick 的安全网）；
   * - ready 且摘要 version 与台账 revision 均未变 → 直接返回（不重取）；
   * - missing / error → 返回既有结果（**不自动重试风暴**；重试走 `retry`）。
   */
  ensure(reqId: string, summaryVersion?: number, ledgerRevision?: number): void
  /** 当前条目（无 → undefined）；视图据此分支渲染。读命中也刷新淘汰序。 */
  get(reqId: string): ReqDetailEntry | undefined
  /**
   * 用户点「重试」：清掉该 id 的旧结果后**强制取数**（契约：interfaces.md §req-detail-store）。
   * 已在途时是**幂等空操作**：连点不得叠加请求（计划 TC-7 的判据）。
   */
  retry(reqId: string): void
  /** 视图卸载/切走时清空（幂等）；清空后在途响应一律作废，不会写回已离开的视图。 */
  reset(): void
}

/**
 * 条目容量上限：只与「看过的需求数」同阶，超出按插入顺序淘汰最旧一条。
 * 与 `dag/view-state.ts` 的 MAX_ENTRIES 同值同纪律（读/写命中会重插以刷新插入序）。
 */
export const MAX_ENTRIES = 16

/** 取错误码（鸭子类型：ApiError 与测试桩都给 `code`，不依赖 instanceof，避免测里造类）。 */
function errorCodeOf(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | undefined)?.code
  return typeof code === 'string' && code.length > 0 ? code : undefined
}

/** 取 HTTP 状态码（`ApiError.status`；服务端没给 code 时靠它判「未找到」）。 */
function errorStatusOf(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | undefined)?.status
  return typeof status === 'number' && Number.isFinite(status) ? status : undefined
}

/** 取错误文案（服务端给的原文优先；本地异常退 `String(err)`；都不给退兜底，不留半截句子）。 */
function errorMessageOf(err: unknown): string {
  if (err instanceof Error) return err.message.length > 0 ? err.message : err.name
  const text = String(err)
  return text.length > 0 ? text : '取数失败'
}

/** 取服务端给的修复命令（`ApiError.hint`；没有就不渲染 hint 块）。 */
function errorHintOf(err: unknown): string | undefined {
  const hint = (err as { hint?: unknown } | undefined)?.hint
  return typeof hint === 'string' && hint.length > 0 ? hint : undefined
}

/** 该错误是否代表「需求不存在」（404 语义 → missing 态，不是失败态）。 */
const NOT_FOUND_CODE = 'REQBOARD_NOT_FOUND'
const NOT_FOUND_STATUS = 404

/** 载荷形态守卫：网络层可能给出与契约不符的载荷（空体 / 字段缺失），按运行时事实处理，不假设。 */
interface DetailPayload { revision?: unknown; requirement?: unknown }

export function createReqDetailStore(deps: ReqDetailDeps): ReqDetailStore {
  /** 条目表。Map 的插入序即淘汰序（读写命中会重插以刷新插入序）。 */
  const entries = new Map<string, ReqDetailEntry>()
  /** 在途请求（并发保险：就算 ensure 被判据漏放，也不会对同一 id 起第二个请求）。 */
  const inflight = new Map<string, Promise<void>>()
  /**
   * 每个 id 的世代号：reset / 重取即 +1。响应回来时世代不符 → 丢弃。
   * 为什么不用「条目不匹配就忽略」：重取后同 id 的新旧响应可能乱序到达，只比 id 分不出来。
   * 淘汰/清空时**连同世代一起删**——删掉即作废（`undefined !== number`，迟到响应照样丢弃），
   * 且不会让世代表随「访问过的 id 数」单调增长（首轮复核 P3-8）。
   */
  const generations = new Map<string, number>()

  const bump = (reqId: string): number => {
    const next = (generations.get(reqId) ?? 0) + 1
    generations.set(reqId, next)
    return next
  }

  const notify = (): void => {
    try { deps.onChange?.() } catch { /* 视图回调抛错不影响取数（同 board-mount 的既有纪律） */ }
  }

  /** 彻底忘掉一个 id（条目 + 在途 + 世代）。淘汰与清空共用，避免簿记各删一半。 */
  const forget = (reqId: string): void => {
    entries.delete(reqId)
    inflight.delete(reqId)
    generations.delete(reqId)
  }

  /** 写入条目并按容量淘汰最旧；重插以刷新插入序。 */
  const put = (reqId: string, entry: ReqDetailEntry): void => {
    entries.delete(reqId)
    entries.set(reqId, entry)
    while (entries.size > MAX_ENTRIES) {
      // 优先淘汰**非 loading** 的最旧条目：把在途请求的条目淘汰掉，视图会空白到响应到达为止
      // （响应若被丢弃就永久空白）——宁可淘汰一条已经看完的 ready（首轮复核 P1-3）。
      let victim: string | undefined
      for (const key of entries.keys()) {
        if (key !== reqId && entries.get(key)?.status !== 'loading') { victim = key; break }
      }
      if (victim === undefined) {
        const oldest = entries.keys().next()
        if (oldest.done === true) break
        victim = oldest.value
      }
      forget(victim)
    }
  }

  /** 读命中也刷新插入序——「正在看的那条」不该被后续写入挤掉。 */
  const touch = (reqId: string): void => {
    const hit = entries.get(reqId)
    if (hit === undefined) return
    entries.delete(reqId)
    entries.set(reqId, hit)
  }

  /** 响应结算（成功/失败共用）：世代不符即作废；无论成败都释放在途位。 */
  const settle = (reqId: string, myGen: number, apply: () => void): void => {
    try {
      if (generations.get(reqId) !== myGen) return
      apply()
      notify()
    } catch (err) {
      // 结算回调自身抛错：**必须落可恢复的终态**。
      // 此前这里是裸 catch{}，异常被吞掉而条目停在 loading → ensure 的 loading 短路挡住一切，
      // 页面永久白屏且没有任何重试入口（第二轮复核 D1 就是这样被掩盖成「卡死」的）。
      try {
        if (generations.get(reqId) === myGen) {
          put(reqId, {
            status: 'error',
            reqId,
            message: '详情结算失败：' + errorMessageOf(err),
            code: 'REQBOARD_DETAIL_SETTLE_FAILED',
          })
          notify()
        }
      } catch { /* 连落 error 都失败：只能静默（再抛会变成 unhandled rejection） */ }
    } finally {
      // 只有「还是我这一代」才释放在途位；否则会误删 reset / retry 之后新起的那个请求
      if (generations.get(reqId) === myGen) inflight.delete(reqId)
    }
  }

  const onLoaded = (reqId: string, raw: unknown): void => {
    const payload = (raw ?? {}) as DetailPayload
    const record = payload.requirement as RequirementRecord | null | undefined
    // `record == null` 同时挡掉 null 与 undefined：只写 `=== undefined` 会漏掉 null，
    // 而 `typeof null === 'object'` 会让下一道守卫放行 → `record.id` 抛错（第二轮复核 D1）。
    if (record == null || typeof record !== 'object' || record.id !== reqId) {
      // 丢弃与请求不对应的数据（乱序/过期/异常载荷）——但**必须给出可恢复的终态**：
      // 停在 loading 会被 ensure 的 loading 短路挡住 → 永久白屏且无重试入口（首轮复核 P0-1）。
      const got = record == null ? '空载荷' : String(record.id)
      put(reqId, {
        status: 'error',
        reqId,
        message: '服务端返回的详情与请求不一致（请求 ' + reqId + '，收到 ' + got + '），已丢弃',
        code: 'REQBOARD_DETAIL_MISMATCH',
      })
      return
    }
    // revision 只认响应自己给的值；缺失/非数就是 undefined（**不回落 record.version**：
    // 两个计数器不同源，混源会让按台账失效恒真 → 自持重取风暴，第三轮复核 ③-1）。
    const revision = typeof payload.revision === 'number' && Number.isFinite(payload.revision)
      ? payload.revision
      : undefined
    put(reqId, {
      status: 'ready',
      reqId,
      record,
      ...(revision === undefined ? {} : { revision }),
      fetchedAt: Date.now(),
    })
  }

  const onFailed = (reqId: string, err: unknown): void => {
    const code = errorCodeOf(err)
    const message = errorMessageOf(err)
    // 未找到：code 优先，服务端没给 code 时按 HTTP 404 兜底（interfaces.md 里 code 是可选字段）
    if (code === NOT_FOUND_CODE || errorStatusOf(err) === NOT_FOUND_STATUS) {
      put(reqId, { status: 'missing', reqId, message })
      return
    }
    const hint = errorHintOf(err)
    put(reqId, {
      status: 'error',
      reqId,
      message,
      ...(hint === undefined ? {} : { hint }),
      ...(code === undefined ? {} : { code }),
    })
  }

  const start = (reqId: string): void => {
    if (inflight.has(reqId)) return
    const myGen = bump(reqId)
    put(reqId, { status: 'loading', reqId, startedAt: Date.now() })
    const task = Promise.resolve()
      // 用微任务包一层：注入的取数函数**同步抛**也走失败分支。
      // 直接调用会让异常穿透 ensure → 渲染路径整块崩、条目还卡在 loading（首轮复核 P0-2）。
      .then(() => deps.fetchRequirement(reqId))
      .then(
        (res) => { settle(reqId, myGen, () => { onLoaded(reqId, res) }) },
        (err: unknown) => { settle(reqId, myGen, () => { onFailed(reqId, err) }) },
      )
    // **先登记在途、再通知**：通知会同步回到视图，视图可能重入 ensure/retry/reset；
    // 顺序反了会出现「已 reset 但陈旧 inflight 仍登记」→ 该 id 再也取不到数（首轮复核 P1-4）。
    inflight.set(reqId, task)
    notify()
  }

  return {
    ensure(reqId, summaryVersion, ledgerRevision) {
      if (reqId.length === 0) return
      const existing = entries.get(reqId)
      if (existing === undefined) {
        if (inflight.has(reqId)) {
          // 条目被容量淘汰、但在途请求还在：把 loading 重新挂上（否则视图空白到响应到达）
          put(reqId, { status: 'loading', reqId, startedAt: Date.now() })
          return
        }
        start(reqId)
        return
      }
      if (existing.status === 'loading') return
      if (existing.status === 'ready') {
        // 判据必须是**方向性**的：只有「上游（摘要/台账）比手里这份更新」才重取。
        // 用 `!==` 会在「详情响应比 /state 更新」时恒真（写入落在两次 head() 读之间是常态）——
        // 于是 重取→notify→重绘→ensure→重取 自持成环：实测 50ms 内 250 次请求（第二轮复核 D2）。
        // 版本号单调递增，故 `上游 > 手里` 才是「我落后了」。
        const svChanged = summaryVersion !== undefined
          && existing.record.version !== undefined
          && summaryVersion > existing.record.version
        // 台账判据同样要求「两侧都已知」：手里这份的 revision 缺失时（响应没给）该判据不成立，
        // 而不是拿别的计数器硬比 —— 混源恒真 = 风暴（第三轮复核 ③-1）
        const lrChanged = ledgerRevision !== undefined
          && existing.revision !== undefined
          && ledgerRevision > existing.revision
        if (!svChanged && !lrChanged) {
          touch(reqId)
          return
        }
      } else {
        // missing / error：不自动重试（否则刷新一次打一次），重试是人的显式动作
        return
      }
      start(reqId)
    },
    get(reqId) {
      const hit = entries.get(reqId)
      if (hit === undefined) return undefined
      touch(reqId)
      return hit
    },
    retry(reqId) {
      if (reqId.length === 0) return
      // 已有在途请求 = 正在取数：重试是幂等空操作（连点不叠加请求，TC-7 的判据）
      if (inflight.has(reqId)) return
      bump(reqId)           // 作废任何迟到响应（世代不符 → settle 直接丢弃）
      entries.delete(reqId) // 清掉旧结果（error / missing / ready 一并清），随后立刻登记 loading
      start(reqId)
    },
    reset() {
      // 世代一并清空：清掉即作废（迟到响应拿不到自己那一代，一律丢弃）
      entries.clear()
      inflight.clear()
      generations.clear()
    },
  }
}
