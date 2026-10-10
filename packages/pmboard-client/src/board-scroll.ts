/**
 * 看板泳道滚动位置记忆（REQ-261004184822-9881 · FR-1 / FR-2 / FR-3）——纯逻辑、零 IO、零存储。
 *
 * 解决的真实问题：看板 `render()` 每次都 `viewEl.innerHTML = buildBoard(...)` **整段重建 DOM**，
 * 而触发重绘的路径有四条（SSE 台账事件 / 20 秒轮询 / 手动「刷新」/ 卡面操作后的取数），
 * 于是用户横滚到的列、在长列里翻到的位置每次都被打回起点（实测：滚到 implementing 列，
 * 几秒后自己弹回最左，又看见 draft）。
 *
 * 本模块只做一件事：把那份位置**读出来记住、重绘后写回去**——不碰刷新机制、不碰取数、
 * 不碰 DOM 结构，也不落盘（刷新浏览器回到最左是明确接受的行为）。
 *
 * 与 `dag/view-state.ts` 的关系：**形似神不似**。sanitize 口径与「只读诊断出口」照它抄，
 * 但表是**独立**的——FR-2 要求泳道位置与 DAG 画布位置互不干扰，隔离靠模块边界（前缀会被写错，
 * 模块边界不会）。
 *
 * 三条纪律：
 *  - **capture 不写零**：找不到泳道容器（列表视图 / 需求详情 / 空态 / 出错页）时**不更新记忆**，
 *    否则从详情页返回时一次"零"就会把真位置冲掉；
 *  - **restore 只回填、不创建**：找不到容器 / 该列就跳过，绝不为回填写 DOM；
 *  - **不抛错**：这是尽力而为的回填，抛错会让整块看板白屏，代价远大于"位置没记住"。
 *
 * @module dsh-pmboard/client/board-scroll
 */

/** 泳道横向滚动容器（记忆的横向读/写点）。 */
const LANES_SELECTOR = '.dsh-pm-lanes'
/** 一列；`data-lane` 即列内位置的记忆键。 */
const LANE_SELECTOR = '.dsh-pm-lane[data-lane]'
/** 列内卡片区（记忆的纵向读/写点）。 */
const LANE_CARDS_SELECTOR = '.dsh-pm-lane-cards'

/** 列键上限：当前只有 6 条泳道，上限只为「有界」，超出按遍历顺序截断。 */
export const MAX_LANES = 16

/** 泳道滚动位置快照（会话内存，单条；不落盘、不进台账）。 */
export interface LaneScrollSnapshot {
  /** `.dsh-pm-lanes` 的横向滚动位置（px） */
  scrollLeft: number
  /** 列内卡片区位置：key = 列的 `data-lane`，value = `.dsh-pm-lane-cards` 的 `scrollTop`（px） */
  lanes: Record<string, number>
}

/** 记忆表本体：单条（看板泳道是全量视图，不按需求 / 会话分片）。 */
let snapshot: LaneScrollSnapshot | undefined

/**
 * 取值收敛：非有限数或负数一律记 0（DOM 上取不到负数）。
 * 写入口收敛比读出口兜底更难漏——与 `dag/view-state.ts` 的 `sanitizeScroll` 同口径。
 */
function sanitize(v: number | undefined): number {
  return v !== undefined && Number.isFinite(v) && v > 0 ? v : 0
}

/** 读滚动量（真实 DOM 与测试桩都满足；取不到即 undefined）。 */
function readScroll(node: Element | null | undefined, key: 'scrollLeft' | 'scrollTop'): number | undefined {
  if (node === null || node === undefined) return undefined
  const v = (node as unknown as Record<string, unknown>)[key]
  return typeof v === 'number' ? v : undefined
}

/** 写滚动量（真实 DOM 会自行把超界值裁剪到可滚动上限）。 */
function writeScroll(node: Element | null | undefined, key: 'scrollLeft' | 'scrollTop', value: number): void {
  if (node === null || node === undefined) return
  ;(node as unknown as Record<string, unknown>)[key] = value
}

/** 取列的 `data-lane`（属性缺失 → undefined，跳过该列）。 */
function laneKeyOf(lane: Element): string | undefined {
  const fromAttr = typeof lane.getAttribute === 'function' ? lane.getAttribute('data-lane') : null
  if (fromAttr !== null && fromAttr !== undefined && fromAttr.length > 0) return fromAttr
  const fromData = (lane as unknown as { dataset?: { lane?: unknown } }).dataset?.lane
  return typeof fromData === 'string' && fromData.length > 0 ? fromData : undefined
}

/**
 * 读旧 DOM → 写记忆。**必须在 `innerHTML` 赋值之前调用**（赋值后旧节点已销毁）。
 *
 * 找不到 `.dsh-pm-lanes`（非泳道视图）时静默返回且**不覆盖**已有记忆。
 */
export function captureBoardScroll(root: ParentNode | undefined): void {
  if (root === undefined || root === null) return
  const lanes = root.querySelector(LANES_SELECTOR)
  if (lanes === null) return // 非泳道视图：不覆盖记忆（FR-2）

  const lanesMap: Record<string, number> = {}
  for (const lane of Array.from(root.querySelectorAll(LANE_SELECTOR))) {
    const key = laneKeyOf(lane)
    if (key === undefined) continue
    lanesMap[key] = sanitize(readScroll(lane.querySelector(LANE_CARDS_SELECTOR), 'scrollTop'))
    if (Object.keys(lanesMap).length >= MAX_LANES) break
  }
  snapshot = { scrollLeft: sanitize(readScroll(lanes, 'scrollLeft')), lanes: lanesMap }
}

/**
 * 读记忆 → 写新 DOM。**必须在新 DOM 写入之后、同一任务内调用**。
 *
 * 找不到泳道容器 / 该列 / 该列的卡片区就跳过；不创建节点、不抛错。
 */
export function restoreBoardScroll(root: ParentNode | undefined): void {
  if (root === undefined || root === null) return
  const snap = snapshot
  if (snap === undefined) return
  const lanes = root.querySelector(LANES_SELECTOR)
  if (lanes === null) return

  writeScroll(lanes, 'scrollLeft', snap.scrollLeft)
  for (const lane of Array.from(root.querySelectorAll(LANE_SELECTOR))) {
    const key = laneKeyOf(lane)
    if (key === undefined) continue
    const want = snap.lanes[key]
    if (want === undefined) continue
    writeScroll(lane.querySelector(LANE_CARDS_SELECTOR), 'scrollTop', want)
  }
}

/** 只读诊断（测试 / 排查观测当前快照；返回浅拷贝，改它不影响内部）。 */
export function readBoardScroll(): LaneScrollSnapshot | undefined {
  if (snapshot === undefined) return undefined
  return { scrollLeft: snapshot.scrollLeft, lanes: { ...snapshot.lanes } }
}

/** 测试专用：清空快照。生产代码不得调用。 */
export function _resetBoardScroll(): void {
  snapshot = undefined
}
