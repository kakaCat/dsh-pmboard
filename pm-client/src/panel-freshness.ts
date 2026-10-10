/**
 * 面板新鲜度的**渲染层**（REQ-261001124111-5d36 t2/t5）——「数据时间」「刷新失败」「插件已更新」三块 DOM。
 *
 * 为什么单独一个模块：node-panel.ts 触到尺寸门禁（单文件 ≤400 行），而这三块与"面板结构"无关，
 * 只跟"这份数据是不是最新的"有关——按职责拆，不是为凑行数。
 *
 * 铁律（本次事故的直接教训）：
 *  - **陈旧必须可见**：`fetchedAt` 缺失或超阈值 → `is-stale`（不得把"没有数据"显示成"最新"）；
 *  - **失败必须响亮**：只要 `lastError` 非空就出红条，与"屏幕上有没有旧数据"**解耦**
 *    （旧实现把它挂在 `overview === null` 上，于是"有旧快照 + 一直刷新失败"看起来毫无异常）；
 *  - **不声称**：版本戳任一端缺失就不提示，宁可漏报不可误报。
 *
 * @module dsh-pmboard/client/panel-freshness
 */
import { esc } from './html.js'

/**
 * 面板数据新鲜度（由刷新调度器 / `use-panel-refresh` 给出）。
 * **不传 = 一个新鲜度元素都不渲染**——既有调用方与既有 DOM 断言逐字节不变（迁移纪律）。
 */
export interface NodePanelFreshness {
  /** 最近一次成功拉取的时刻（缺省 = 从未成功：显示「数据时间 —」并直接算陈旧） */
  fetchedAt?: number
  /** 最近一次失败原因（非空即出红条） */
  lastError?: string
  /** 轮询周期（ms；进 `data-refresh-ms` 与 title） */
  intervalMs: number
  /** 陈旧阈值（ms） */
  staleAfterMs: number
  /** 可注入时钟（测试用；缺省 Date.now） */
  now?: number
}

/** 版本提示入参：两戳都存在且不同才提示。 */
export interface BuildNotice {
  clientStamp: string
  serverStamp: string
}

/** 提示条入参（结构上与节点面板入参兼容，避免两个模块互相 import 类型）。 */
export interface FreshnessBarInput {
  freshness?: NodePanelFreshness
  buildNotice?: BuildNotice
}

/** HH:MM:SS——「数据时间」与「旧数据时刻」共用一种格式，避免两处口径分叉。 */
export function clockText(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
}

/**
 * 面板头「数据时间」的**稳定占位**（REQ-261001210304-0dfb · FR-3）。
 *
 * 为什么无参：这个元素原先把「数据时间 HH:MM:SS」与 `data-fetched-at` 直接写进注入字符串，
 * 而这两个值**每轮轮询都会变** → React 每次重设整段 innerHTML → 画布/滚动/页签一起被重建
 * （实测：两轮仅相差 5 秒的渲染，首个差异点就是 `data-fetched-at`）。
 * 现在字符串里只留钩子，值由 {@link hydrateFreshness} 在渲染后补上——数据没变时
 * 面板字符串逐字节相同，React 不会动 DOM。
 *
 * 不传 `freshness` 的调用方本来就拿不到这个元素（node-panel 侧按需拼接），
 * 因此"缺省一个新元素都不出现"的既有契约不变。
 */
export function freshnessSpan(): string {
  return '<span class="dsh-pm-np-fresh" data-dsh-pm-fresh-slot></span>'
}

/**
 * 把新鲜度**值**补进占位元素（渲染后调用；幂等、只改文本与属性、不插删元素）。
 *
 * 判据与调度器的 `PanelFreshness.stale` **同一口径**（`fetchedAt` 缺失或超阈值），
 * 但这里自己算一遍：面板可能拿着一个 id 不变、时间在走的旧快照渲染，不重算就会把"旧的"显示成"最新的"。
 */
export function hydrateFreshness(root: ParentNode, f: NodePanelFreshness): void {
  const el = root.querySelector<HTMLElement>('[data-dsh-pm-fresh-slot]')
  if (el === null) return // 阶段没有这块（或面板还没渲染）→ 静默跳过
  const now = f.now ?? Date.now()
  const stale = f.fetchedAt === undefined || now - f.fetchedAt > f.staleAfterMs
  const text = f.fetchedAt === undefined ? '数据时间 —' : '数据时间 ' + clockText(f.fetchedAt)
  const title = f.intervalMs > 0
    ? '面板每 ' + String(Math.round(f.intervalMs / 1000)) + ' 秒自动刷新'
    : '面板已关闭自动刷新（只在打开时拉取）'
  el.textContent = text
  el.classList.toggle('is-stale', stale)
  el.setAttribute('title', title)
  el.setAttribute('data-fetched-at', f.fetchedAt !== undefined ? String(f.fetchedAt) : '')
  el.setAttribute('data-stale', stale ? '1' : '0')
  el.setAttribute('data-refresh-ms', String(f.intervalMs))
}

/**
 * 新鲜度提示条（FR-3 / FR-5）：刷新失败与版本陈旧**必须可见**。
 *
 * 事故出处：原来错误态只在 `stageOverview === null` 时渲染，于是"有旧快照 + 刷新一直失败"
 * 就变成一个看起来没事的旧面板（用户实测：服务端 19 张卡，面板显示「暂无任务」）。
 */
export function renderFreshnessBar(input: FreshnessBarInput): string {
  const parts: string[] = []
  const notice = input.buildNotice
  if (notice !== undefined && notice.clientStamp.length > 0 && notice.serverStamp.length > 0 && notice.clientStamp !== notice.serverStamp) {
    parts.push('<button type="button" class="dsh-pm-np-build-notice" role="status" data-action="np-reload"' +
      ' data-client-build="' + esc(notice.clientStamp) + '" data-server-build="' + esc(notice.serverStamp) + '"' +
      ' title="页面加载的插件构建落后于磁盘上的最新构建，点此加载新版本">' +
      '插件已更新（' + esc(notice.clientStamp) + ' → ' + esc(notice.serverStamp) + '），点此刷新</button>')
  }
  const f = input.freshness
  if (f !== undefined && f.lastError !== undefined && f.lastError.length > 0) {
    const lastOk = f.fetchedAt !== undefined ? clockText(f.fetchedAt) : ''
    const tail = f.fetchedAt !== undefined ? '显示的是 ' + lastOk + ' 的旧数据' : '暂无可用数据'
    parts.push('<div class="dsh-pm-np-fresh-err" role="alert" data-last-ok="' +
      (f.fetchedAt !== undefined ? String(f.fetchedAt) : '') + '">' +
      '刷新失败：' + esc(f.lastError) + ' · ' + esc(tail) + '</div>')
  }
  return parts.join('')
}
