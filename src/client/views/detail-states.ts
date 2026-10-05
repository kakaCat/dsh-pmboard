/**
 * 详情页的非成功态占位（REQ-261004195831-0f52 · FR-2）——三个纯函数，返回 HTML 字符串。
 *
 * 为什么单独一个模块：取数要时间、也可能取不到，而**此前这三种情形一件都没有**——
 * 详情视图要么整块抛错、要么静默弹回看板（`if (!req) mode = board`），人只看到「点了没反应」。
 * 分离出来还有第二个理由：`stage-detail.ts` 已接近尺寸门禁上限，且三态文案要能被单测直接断言
 * （本包无 jsdom，渲染断言只能走纯函数）。
 *
 * 三条纪律：
 *  - **外壳与详情同根**：仍是 `.dsh-pm-detail[data-detail-req]`，返回/刷新按钮照旧可用
 *    （事件委派按 `[data-action]` 找，不依赖层级）；
 *  - **错误呈现复用 `buildError`**：那是本仓"失败长什么样 + hint 怎么呈现"的单一事实源，
 *    另写一份必然漂移（FR-4 的 `hint 缺省不渲染空块` 口径也一并继承）；
 *  - **不静默**：取不到就说清"哪条需求、因为什么、下一步能做什么"，绝不显示空白或将人弹回看板。
 *
 * 设计出处：design/interfaces.md §views/detail-states.ts、design/frontend.md §兼容与降级。
 *
 * @module dsh-pmboard/client/views/detail-states
 */
import { esc } from '../html.ts'
import { buildError } from '../render/dom-utils.ts'

/** 三态共用的详情外壳（与 `buildReqDetail` 的头部同根、同按钮，视觉不跳）。 */
function shell(reqId: string, state: 'loading' | 'missing' | 'error', headNote: string, body: string): string {
  return `
    <div class="dsh-pm-detail" data-detail-req="${esc(reqId)}" data-detail-state="${state}">
      <div class="dsh-pm-detail-head">
        <button type="button" class="dsh-pm-btn" data-action="back" title="返回看板">← 看板</button>
        <span class="dsh-pm-card-id">${esc(reqId)}</span>
        <span class="dsh-pm-detail-updated">${esc(headNote)}</span>
      </div>
      <div class="dsh-pm-detail-body">${body}</div>
    </div>`
}

/**
 * 取数中：详情骨架已出（返回按钮可用），正文位就地占位。
 *
 * 为什么不做整页 spinner / 遮罩：等待只发生在正文区，Tab 与返回按钮不该被冻住——
 * 用户可能就是想返回。
 */
export function buildDetailLoading(reqId: string): string {
  return shell(reqId, 'loading', '详情加载中…', '<div class="dsh-pm-empty">详情加载中…</div>')
}

/**
 * 未找到（404 `REQBOARD_NOT_FOUND`）：需求被删除或不在当前工作区。
 *
 * 措辞必须点名是哪条需求：深链/旧标签页进来时，人需要知道"我点的那条没了"，
 * 而不是笼统的"加载失败"。
 */
export function buildDetailMissing(reqId: string, message: string): string {
  const detail = message.length > 0 ? message : '需求 ' + reqId + ' 不存在或已被删除'
  return shell(
    reqId,
    'missing',
    '未找到',
    '<div class="dsh-pm-empty">未找到需求：' + esc(detail) + '</div>'
      + '<div class="dsh-pm-error-hint-label">可能已被删除，或不在当前工作区</div>',
  )
}

/**
 * 取数失败（非 404）：原因与可复制命令原样呈现，并给「重试」这条真的能走的路。
 *
 * 重试走 `button[data-action="retry-detail"]`，由 board-mount 的既有 `[data-action]` 委派处理
 * （不新增事件通道）。
 */
export function buildDetailError(reqId: string, message: string, hint?: string): string {
  const reason = message.trim().length > 0 ? message : '取数失败'
  const retry = `<button type="button" class="dsh-pm-btn" data-action="retry-detail" data-id="${esc(reqId)}" title="重新取一次详情">重试</button>`
  return shell(reqId, 'error', '加载失败', buildError(reason, hint) + retry)
}
