/**
 * 看板「一次性定位」交接持有器（REQ-260928222643-4d34 · FR-2 · 设计 I-1 / T-2 / T-3）。
 *
 * 为什么需要它：看板视图状态 \`mode\` 是 board-mount 挂载闭包内的**局部变量**，而宿主是
 * keyed 插槽（切走即卸载）。因此「面板点击时（此时看板尚未挂载）把 REQ id 交给看板」只能
 * 经模块级持有器：面板 \`requestBoardFocus(reqId)\` 登记，看板挂载时 \`takeBoardFocus()\` 消费。
 * 与既有 \`page/page-runtime.ts\` 同款依赖纪律（模块级持有器，不新增全局量）。
 *
 * 一次性语义：读后立即清空；不落浏览器存储、不进 URL、不挂 window 属性。
 * 故刷新页面或再次进入看板必然回到默认视图——不得形成粘滞状态（需求「数据契约」）。
 *
 * ## 订阅通道（REQ-261004111917-f473 FR-2 / 复核 I-7）
 *
 * 只有「挂载时取走」那一条路径，覆盖不到**看板已经在屏**的情形：此时面板不重挂，
 * \`takeBoardFocus()\` 永远不会被调用，登记的意图只能滞留到下次进看板（用户看到「点了没反应」
 * + 延迟跳转）。故新增 \`subscribeBoardFocus\`：看板挂载时订阅，登记发生时**同步**收到 reqId。
 *
 * 语义分叉（刻意，且有单测钉死）：
 *   - **有订阅者** → 同步通知全部订阅者，且 `pending` 保持清空（否则会「订阅者跳一次 +
 *     下次挂载再跳一次」= 双跳）；
 *   - **无订阅者** → 与原语义完全一致（写入 pending，等 `takeBoardFocus()` 取走）。
 * 空串/纯空白一律只清 pending、**不通知**（保持既有「不登记空意图」的语义）。
 *
 * 依赖纪律：本模块**零 import**。
 *
 * @module dsh-pmboard/client/board-focus
 */

/** 至多一条「待被看板消费的定位意图」；undefined = 无意图。 */
let pendingReqId: string | undefined

/** 已挂载看板的定位监听者（挂载时加入、dispose 时移除）。 */
const focusListeners = new Set<(reqId: string) => void>()

/**
 * 定位监听者：**返回 `false` 表示「本实例没消费这条意图」**（已卸载 / 不在屏），
 * 返回 `true` 或什么都不返回（void）= 已消费。抛错按「未消费」处理并打一条诊断。
 *
 * 为什么允许声明「没消费」（复核 R2/R3）：若一个**已挂载但不可见**的看板实例把意图吃掉，
 * 而它随即被卸载，用户就再也看不到这次定位（意图也已从持有器里消失）——
 * 「点了没反应且无痕迹」比「晚一拍跳」更糟。
 */
export type BoardFocusListener = (reqId: string) => boolean | void

/**
 * 订阅「定位意图」通知（看板挂载时登记）。
 *
 * @returns 退订函数（幂等）。
 */
export function subscribeBoardFocus(listener: BoardFocusListener): () => void {
  if (typeof listener !== 'function') return () => { /* 非法订阅者：给一个空退订，不抛 */ }
  focusListeners.add(listener)
  let removed = false
  return () => {
    if (removed) return
    removed = true
    focusListeners.delete(listener)
  }
}

/**
 * 登记一次「请把看板定位到该需求」的意图。
 *
 * 空串/纯空白 → 视为清除（不登记、**不通知**）；
 * 有订阅者（看板已在屏）→ 同步通知，**至少有一个人真的消费**才不留 pending（防双跳）；
 * 全部人都没消费（都不可见 / 都抛错）→ 回落到一次性语义（写 pending 等下次挂载取走）；
 * 无订阅者 → 与原语义逐字一致（写入 pending，等 `takeBoardFocus()` 取走）。
 */
export function requestBoardFocus(reqId: string): void {
  const id = typeof reqId === 'string' ? reqId.trim() : ''
  if (id.length === 0) {
    pendingReqId = undefined
    return
  }
  if (focusListeners.size > 0) {
    pendingReqId = undefined
    let consumed = false
    // 先拷贝快照：订阅者在回调里退订/新增都不会打乱本次迭代（复核 R6）
    for (const listener of [...focusListeners]) {
      try {
        // 只有显式返回 false 才算「没消费」——void 视为已消费（保持既有调用纪律）。
        // 用 unknown 接住返回值：`boolean | void` 直接与 false 比较会被 TS 判成「无重叠」。
        const verdict: unknown = listener(id)
        if (verdict !== false) consumed = true
      } catch (err) {
        // 失败要响亮：吞掉异常会让「点了没反应且无痕迹」成为可能（复核 R3）
        try { console.warn('[dsh-pmboard] board-focus 订阅者抛错（本次按未消费处理）', err) } catch { /* 控制台不可用 */ }
      }
    }
    if (consumed) return
    // 没人真的消费 → 不把意图丢掉
    pendingReqId = id
    return
  }
  pendingReqId = id
}

/** 取走意图并立即清空（消费即清）。无意图 → undefined。 */
export function takeBoardFocus(): string | undefined {
  const id = pendingReqId
  pendingReqId = undefined
  return id
}

/** 清空意图（失败路径与测试收尾；幂等）。**不动订阅者**。 */
export function clearBoardFocus(): void {
  pendingReqId = undefined
}

/** 只读探测（**不消费**）——仅供单测与诊断；生产路径不得用它判断后仍假设未被消费。 */
export function peekBoardFocus(): string | undefined {
  return pendingReqId
}
