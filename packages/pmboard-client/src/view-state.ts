/**
 * DAG 视图状态记忆表（REQ-261001210304-0dfb · FR-1 / FR-2 / FR-4）——纯函数、零 DOM、零 IO。
 *
 * 解决的真实问题：会话节点面板每 ≤5 秒（+ 每个 SSE 任务事件）重建一次 DOM 与 viewer，
 * 而"用户在图上做的选择"（方向 / 关键路径 / 只看主线 / 钉住 / 页签 / 滚动位置）**只活在
 * viewer 闭包与 DOM class 上**——重建即归零，用户每次刷新都要重调一遍（实测：一轮刷新后
 * `horizontal/true/true/'t-b'` 直接回 `vertical/false/false/null`）。
 *
 * 本模块只做一件事：把那份选择**按画布 + 需求**记住（内存表，不落盘），供 `mountDagCanvas`
 * 重建时回填。设计出处：design/data-model.md（字段与生命周期）、design/interfaces.md §2（API）。
 *
 * 三条纪律：
 *  - **纯**：不碰 DOM / 计时器 / 存储；注入与释放全由调用方决定 → 可在 Node 里直接单测；
 *  - **键含需求 id**：`<canvasId>::<reqId>`——同一块画布会承载不同需求的图，键不含需求 id
 *    就会把 A 需求的横向/只看主线带到 B 需求（FR-4 的 A5 判据锁死这条）；
 *  - **不持久化**：页面重载回初始态是明确接受的行为（不写 localStorage / 台账 / 服务端）。
 *
 * @module dsh-pmboard/client/dag/view-state
 */
import type { LayoutDir } from './dag-layout.js'

/** 面板里"用户做的选择"——重挂时要能一模一样地回到原位。 */
export interface DagViewSnapshot {
  /** DAG 布局方向（纵向 / 横向） */
  dir?: LayoutDir
  /** 「关键路径」开关 */
  crit?: boolean
  /** 「只看主线」开关 */
  focus?: boolean
  /** 悬停钉住的节点 id（null = 无钉住） */
  pinned?: string | null
  /** 当前激活视图页签：flow=DAG / list=泳道（仅实施节点有页签） */
  tab?: 'flow' | 'list'
  /** 画布外层滚动位置（.dsh-pm-dag-canvas-wrap） */
  scrollTop?: number
  scrollLeft?: number
}

/** 容量上限：超出按插入顺序淘汰最旧一条（FIFO）——条目数只与"看过的画布×需求"同阶。 */
export const MAX_ENTRIES = 16

/** 记忆表本体。Map 的插入序即淘汰序（读取命中会重插以刷新插入序）。 */
const store = new Map<string, DagViewSnapshot>()

/**
 * 滚动值收敛：缺省（undefined）表示"本次不更新"；非有限数或负数一律记 0
 * （DOM 上取到的 scrollTop 永远不会是负数，写入口收敛比读出口兜底更难漏）。
 */
function sanitizeScroll(v: number | undefined): number | undefined {
  if (v === undefined) return undefined
  return Number.isFinite(v) && v > 0 ? v : 0
}

/**
 * 读快照（不存在 → `undefined`）。返回**浅拷贝**：调用方改它不影响表内值。
 * 命中即刷新插入序——"正在看的那条"不会被后续写入挤掉。
 */
export function readDagViewState(key: string): DagViewSnapshot | undefined {
  const hit = store.get(key)
  if (hit === undefined) return undefined
  store.delete(key)
  store.set(key, hit)
  return { ...hit }
}

/**
 * 合并写（部分字段更新：页签点击只写 `tab`，dispose 写 DAG 四项 + 滚动）。
 * 只覆盖显式传入的字段；`pinned: null` 是**合法值**（表示显式"无钉住"），照写。
 */
export function writeDagViewState(key: string, patch: DagViewSnapshot): void {
  const prev = store.get(key)
  const next: DagViewSnapshot = { ...(prev ?? {}) }
  if (patch.dir !== undefined) next.dir = patch.dir
  if (patch.crit !== undefined) next.crit = patch.crit
  if (patch.focus !== undefined) next.focus = patch.focus
  if (patch.pinned !== undefined) next.pinned = patch.pinned
  if (patch.tab !== undefined) next.tab = patch.tab
  const st = sanitizeScroll(patch.scrollTop)
  if (st !== undefined) next.scrollTop = st
  const sl = sanitizeScroll(patch.scrollLeft)
  if (sl !== undefined) next.scrollLeft = sl

  if (prev !== undefined) store.delete(key) // 重插：本键成为"最新"
  store.set(key, next)
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next()
    if (oldest.done === true) break
    store.delete(oldest.value)
  }
}

/** 删一条（切换需求时清上一需求的键）。不存在即无操作。 */
export function clearDagViewState(key: string): void {
  store.delete(key)
}

/** 按前缀清（形如 `np-dag-canvas::`）——一次性清掉某块画布的所有需求条目。 */
export function clearDagViewStateByPrefix(prefix: string): void {
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

/** 只读诊断（面板 / 测试观测当前条目数）。 */
export function dagViewStateSize(): number {
  return store.size
}

/** 测试专用：清空整表。生产代码不得调用。 */
export function _resetDagViewState(): void {
  store.clear()
}
