/**
 * t4 视觉证据：用**真实样式 + 真实模型 + 真 Chrome** 渲染会话头部流程图标本，宽/窄两档各截一张。
 *
 * 为什么用标本而不是截运行中的 GUI：宿主把插件 dist 常驻内存，重建 dist 不会换掉已加载的模块，
 * 而本会话的审批被禁用（plugin_manager 的启用/停用需要 danger-full-access → 自动拒绝），
 * 所以「重载宿主插件」这步我做不了（已在 t4 证据里如实登记为待人工重载项）。
 * 标本页与真组件同构（同样的类名、同样的 DOM 结构、同一份 CSS），足以回答「窄窗口还看不看得到数」。
 *
 * 用法：./node_modules/.bin/tsx docs/requirements/REQ-261004143941-b2ca/evidence/shot-specimen.mts
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildFlowChartModel, FLOW_TIERS } from '../../../../src/client/flow-chart-model.ts'
import { fmtTokens } from '../../../../src/shared/protocol.ts'
import { BASE_CSS } from '../../../../src/client/styles/base.ts'
import { BOARD_CSS } from '../../../../src/client/styles/board.ts'
import { TOKEN_CSS } from '../../../../src/client/styles/token.ts'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT_DIR = 'docs/requirements/REQ-261004143941-b2ca/evidence'

const MODEL = buildFlowChartModel({
  status: 'implementing',
  category: 'feature',
  progress: { done: 3, total: 12 },
  nodes: [{ key: 'design', tokens: { total: 10901086 } }, { key: 'implementing', tokens: { total: 12670636 } }],
  tokenTotal: 25321586,
})

const nodes = MODEL.nodes.map((stage, idx) => {
  const dot = stage.skipped ? '—' : stage.state === 'done' ? '✓' : stage.state === 'current' ? '●' : String(stage.index + 1)
  const meta = '<div class="dsh-pm-flow-meta"><span class="dsh-pm-flow-label">' + stage.label + '</span>'
    + (stage.token === undefined ? '' : '<span class="dsh-pm-flow-token">' + fmtTokens(stage.token) + '</span>') + '</div>'
  const link = idx < MODEL.nodes.length - 1
    ? '<div class="dsh-pm-flow-link" data-state="' + (stage.state === 'done' ? 'done' : 'pending') + '"></div>'
    : ''
  return '<div class="dsh-pm-flow-node" data-state="' + (stage.skipped ? 'skipped' : stage.state) + '">'
    + '<span class="dsh-pm-flow-dot">' + dot + '</span>' + meta + '</div>' + link
}).join('')

// 文案与真组件逐字一致：fmtTokens 紧凑格式（<1000 原数 / N.Nk / N.NM）——
// 标本若自己写原数，截出来的宽度与真机就不一样，视觉证据会骗人。
const badge = MODEL.tokenTotal === undefined ? ''
  : '<span class="dsh-pm-token-badge dsh-pm-cprog-token-total" title="需求累计 Token（各节点快照差值合计，含任务执行兜底）">'
    + '<span class="dsh-pm-cprog-token-ico">🪙</span>' + fmtTokens(MODEL.tokenTotal) + '</span>'

const HEADER_CSS = `
html, body { margin: 0; padding: 0; }
body { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; color: #111827; background: #fff; }
.titleRow { container-type: inline-size; display: flex; align-items: center; gap: 0; min-height: 30px;
  padding: 10px 28px 0 20px; box-sizing: border-box; }
.titleCluster { display: flex; flex: 1; align-items: center; gap: 10px; min-width: 0; }
.crumbs { display: flex; align-items: center; gap: 4px; min-width: 0; overflow: hidden; white-space: nowrap;
  font-size: 14px; color: #6b7280; }
.crumb { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 4px 8px; }
.headerActions { display: flex; flex: none; align-items: center; gap: 8px; }
.headerUtilities { display: flex; flex: none; align-items: center; gap: 8px; margin-left: 20px; }
.headerCorner { display: flex; flex: none; align-items: center; margin-left: 8px; margin-right: -16px; }
.preset { flex: none; height: 22px; padding: 0 10px; border-radius: 6px; background: rgba(128,128,128,.12);
  font-size: 12px; line-height: 22px; color: #6b7280; }
.utility { flex: none; width: 32px; height: 22px; border-radius: 6px; background: rgba(128,128,128,.12); }
`

function page(): string {
  return '<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>'
    + HEADER_CSS + BASE_CSS + BOARD_CSS + TOKEN_CSS
    + '</style></head><body><div class="titleRow">'
    + '<div class="titleCluster"><nav class="crumbs"><span class="crumb">会话标题</span></nav>'
    + '<div class="headerActions"><span class="preset">标准模式</span><span class="utility"></span></div></div>'
    + '<div class="headerUtilities"><div class="dsh-pm-cprog"><div class="dsh-pm-cprog-inline">'
    + '<div class="dsh-pm-flow">' + nodes + '</div>'
    + '<span class="dsh-pm-cprog-inline-count">' + MODEL.countText + '</span>' + badge
    + '</div></div><span class="utility"></span><span class="utility"></span></div>'
    + '<div class="headerCorner"><span class="utility"></span></div></div></body></html>'
}

const dir = mkdtempSync(join(tmpdir(), 'pm-shot-'))
const file = join(dir, 'shot.html')
writeFileSync(file, page())

for (const width of [1280, 1024]) {
  const out = join(OUT_DIR, 'header-token-total-' + width + '.png')
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
    '--no-first-run', '--no-default-browser-check',
    '--window-size=' + width + ',140', '--screenshot=' + out, 'file://' + file,
  ], { stdio: ['ignore', 'pipe', 'ignore'] })
  // 容器宽 = 行内容盒 = 窗口宽 − 20/28px 内边距；≥1000 是档位 A（节点级 token 可见），否则 B 档
  const container = width - 48
  const expect = container >= FLOW_TIERS.token ? 'A（节点级 token 也可见）' : 'B（节点级 token 按设计隐藏，只剩累计）'
  console.log('shot ' + out + '  (窗口=' + width + ' 容器≈' + container + ' 档位=' + expect + ')')
}
