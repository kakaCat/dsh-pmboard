/**
 * BizRow —— 业务工具定制卡片的通用行布局（REQ-c48f99 t2 / FR-1~FR-4）。
 *
 * 布局：24px 行 = icon + 标题 + 摘要（ellipsis）+ chevron；点击展开详情体。
 * 解析失败（summarize 返回 null）→ fallbackRow（FR-4：keyed 命中替换通用行，
 * 组件必须自带兜底，禁止白屏/throw）。
 * @module dsh-pmboard/client/toolviews/biz-row
 */
import { createElement as h, useState, type ReactNode } from 'react'
import {
  parseArgs, resultJson, argsRawOf, isSettled, fallbackModel, resultHeadline,
  REQ_FLOW, PM_TOOL_BADGE,
  type CardSummarize, type ToolBlock,
} from './shared.ts'

/** 单张卡片的声明：key=工具 wire 名，title=行标题，icon=默认图标，badge=PM 徽章，summarize=摘要纯函数。 */
export interface BizCard {
  key: string
  title: string
  icon: string
  /** PM 徽章（FR-1；默认 undefined = 无徽章）。 */
  badge?: string
  summarize: CardSummarize
}

/** toolview 组件收到的 props（owner + locale seat；只用需要的字段）。 */
export interface BizRowProps {
  toolName?: string
  block: ToolBlock
  inspect?: () => void
  t?: (key: string) => string
}

const TV_CSS = `
.dsh-pm-tv-row{display:flex;align-items:center;height:24px;min-width:0;cursor:pointer;position:relative;border-radius:6px}
.dsh-pm-tv-row:hover{background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.04))}
.dsh-pm-tv-badge{flex:none;font-size:11px;margin-right:2px;opacity:.8}
.dsh-pm-tv-icon{flex:none;width:16px;margin-right:6px;font-size:13px;text-align:center}
.dsh-pm-tv-title{flex:none;font-size:13px;color:var(--dsw-alias-label-secondary,#666);margin-right:8px}
.dsh-pm-tv-line{flex:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-size:var(--dsh-content-font-size-secondary,13px);line-height:24px;color:var(--dsw-alias-label-tertiary,#999)}
.dsh-pm-tv-line[data-err]{color:var(--dsw-alias-state-error-primary,#c00)}
.dsh-pm-tv-chev{flex:none;margin-left:6px;color:var(--dsw-alias-label-caption,#aaa);font-size:11px}
.dsh-pm-tv-body{display:flex;flex-direction:column;margin:2px 0 4px 22px;padding:8px 12px;
  border:.5px solid var(--dsw-alias-border-l1,#ddd);border-radius:8px;gap:2px;
  font-size:12px;color:var(--dsw-alias-label-secondary,#666)}
.dsh-pm-tv-kv{display:grid;grid-template-columns:max-content 1fr;column-gap:14px;align-items:baseline}
.dsh-pm-tv-k{color:var(--dsw-alias-label-caption,#aaa)}
.dsh-pm-tv-v{white-space:pre-wrap;word-break:break-word;min-width:0}
.dsh-pm-tv-running{color:var(--dsw-alias-label-caption,#aaa);font-style:italic}
.dsh-pm-tv-next{margin-top:4px;padding:4px 8px;background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.04));
  border-radius:4px;font-size:12px;color:var(--dsw-alias-label-secondary,#666)}
.dsh-pm-tv-flow{display:flex;gap:2px;margin-top:4px;flex-wrap:wrap}
.dsh-pm-tv-flow-node{padding:2px 6px;border-radius:3px;font-size:11px;
  background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.04));color:var(--dsw-alias-label-caption,#aaa)}
.dsh-pm-tv-flow-node[data-active]{background:var(--dsw-alias-interactive-bg-selected,rgba(91,108,240,.15));
  color:var(--dsw-alias-label-primary,#333);font-weight:600}
.dsh-pm-tv-timeline{margin-top:4px;white-space:pre-wrap;font-size:11px;color:var(--dsw-alias-label-caption,#aaa)}
.dsh-pm-tv-err-detail{margin-top:4px;padding:4px 8px;border-left:2px solid var(--dsw-alias-state-error-primary,#c00);
  font-size:12px;color:var(--dsw-alias-state-error-primary,#c00)}
.dsh-pm-tv-err-hint{margin-top:2px;font-size:11px;color:var(--dsw-alias-label-caption,#aaa)}
`

let cssInjected = false
function injectTvCss(): void {
  if (cssInjected || typeof document === 'undefined') return
  if (document.querySelector('style[data-dsh-pm-tv]') !== null) { cssInjected = true; return }
  const tag = document.createElement('style')
  tag.dataset.dshPmTv = '1'
  tag.textContent = TV_CSS
  document.head.appendChild(tag)
  cssInjected = true
}

/** 兜底行（FR-4）：任何输入都可渲染，永不 throw。 */
export function FallbackRow({ toolName, block, badge }: { toolName: string; block: ToolBlock; badge?: string }): ReactNode {
  injectTvCss()
  const m = fallbackModel(toolName, block)
  const badgeStr = badge ?? PM_TOOL_BADGE
  return h('div', { className: 'dsh-pm-tv-row', 'data-err': m.isError ? '' : undefined },
    badgeStr ? h('span', { className: 'dsh-pm-tv-badge' }, badgeStr) : null,
    h('span', { className: 'dsh-pm-tv-icon' }, m.isError ? '❌' : '⚙'),
    h('span', { className: 'dsh-pm-tv-title' }, toolName),
    h('span', { className: 'dsh-pm-tv-line', ...(m.isError ? { 'data-err': '' } : {}) },
      m.outputLine !== '' && m.isError ? m.outputLine : m.argLine),
  )
}

/** 通用行工厂：把 BizCard 声明变成 toolview 组件。 */
export function makeBizRow(card: BizCard) {
  return function BizToolRow(props: BizRowProps): ReactNode {
    injectTvCss()
    const block = props.block
    const toolName = props.toolName ?? card.key
    let args: ReturnType<typeof parseArgs>
    let result: ReturnType<typeof resultJson>
    try {
      args = parseArgs(argsRawOf(block))
      result = resultJson(block)
    } catch {
      return h(FallbackRow, { toolName, block })
    }
    let sum: ReturnType<CardSummarize>
    try {
      sum = card.summarize(args, result, block)
    } catch {
      return h(FallbackRow, { toolName, block })
    }
    if (sum === null) return h(FallbackRow, { toolName, block, badge: card.badge })
    const cardSum = sum

    const settled = isSettled(block)
    const err = cardSum.isError === true
    const line = settled ? cardSum.line : `${cardSum.line}（执行中…）`
    const details = cardSum.details ?? []
    const headline = resultHeadline(block)
    const badgeStr = cardSum.badge ?? card.badge ?? PM_TOOL_BADGE

    function RowBody(): ReactNode {
      const [open, setOpen] = useState(false)
      const hasExtras = cardSum.nextStep !== undefined || cardSum.flowCurrent !== undefined || cardSum.timeline !== undefined || (err && (cardSum.errorDetail !== undefined || cardSum.errorHint !== undefined))
      const expandable = settled && (details.length > 0 || hasExtras)
      return h('div', {},
        h('div', {
          className: 'dsh-pm-tv-row',
          onClick: expandable ? () => setOpen(!open) : undefined,
          style: expandable ? undefined : { cursor: 'default' },
        },
          badgeStr ? h('span', { className: 'dsh-pm-tv-badge' }, badgeStr) : null,
          h('span', { className: 'dsh-pm-tv-icon' }, err ? '❌' : cardSum.icon),
          h('span', { className: 'dsh-pm-tv-title' }, card.title),
          h('span', { className: 'dsh-pm-tv-line', ...(err ? { 'data-err': '' } : {}) }, line),
          expandable ? h('span', { className: 'dsh-pm-tv-chev' }, open ? '▾' : '▸') : null,
        ),
        open
          ? h('div', { className: 'dsh-pm-tv-body' },
              headline !== '' ? h('div', { className: 'dsh-pm-tv-kv' },
                h('span', { className: 'dsh-pm-tv-k' }, '结果'),
                h('span', { className: 'dsh-pm-tv-v' }, headline)) : null,
              details.map(([k, v]) => h('div', { className: 'dsh-pm-tv-kv', key: k },
                h('span', { className: 'dsh-pm-tv-k' }, k),
                h('span', { className: 'dsh-pm-tv-v' }, v))),
              (() => { try {
                if (cardSum.flowCurrent !== undefined) {
                  const flowNodes = REQ_FLOW.map(n => h('span', {
                    key: n.key,
                    className: 'dsh-pm-tv-flow-node',
                    'data-active': n.key === cardSum.flowCurrent ? '' : undefined,
                  }, n.label))
                  return h('div', { className: 'dsh-pm-tv-flow' }, ...flowNodes)
                }
                return null
              } catch { return null } })(),
              (() => { try {
                if (cardSum.timeline !== undefined && cardSum.timeline !== '') {
                  return h('div', { className: 'dsh-pm-tv-timeline' }, cardSum.timeline)
                }
                return null
              } catch { return null } })(),
              (() => { try {
                if (err && cardSum.errorDetail !== undefined) {
                  return h('div', { className: 'dsh-pm-tv-err-detail' }, cardSum.errorDetail)
                }
                return null
              } catch { return null } })(),
              (() => { try {
                if (err && cardSum.errorHint !== undefined) {
                  return h('div', { className: 'dsh-pm-tv-err-hint' }, `💡 ${cardSum.errorHint}`)
                }
                return null
              } catch { return null } })(),
              (() => { try {
                if (cardSum.nextStep !== undefined) {
                  return h('div', { className: 'dsh-pm-tv-next' }, `→ ${cardSum.nextStep}`)
                }
                return null
              } catch { return null } })(),
            )
          : null,
      )
    }
    return h(RowBody)
  }
}
