/**
 * t3 视觉证据（REQ-261004151652-d535）：用**真实样式 + 真实模型 + 真 Chrome** 渲染会话头部流程图标本，
 * 宽 / 中 / 窄三档各截一张，回答三件事：
 *   宽（1280）：每个节点名下面有没有它自己的数、连线在不在、有没有多余的累计徽章；
 *   中（700） ：只剩当前节点名时，它下面有没有带着自己的数（本需求的核心修复点）；
 *   窄（560） ：明细让位后，计数与累计徽章在不在。
 *
 * 为什么用标本而不是截运行中的 GUI：宿主把插件 dist 常驻内存，重建不会换掉已加载模块，
 * 而本会话审批被禁用（plugin_manager 需 danger-full-access → 自动拒绝），我无权重载宿主。
 * 标本与真组件同构（同类名、同 DOM 结构、同一份 CSS、同样走 fmtTokens）。
 *
 * 用法：./node_modules/.bin/tsx docs/requirements/REQ-261004151652-d535/evidence/shot-specimen.mts
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildFlowChartModel } from '../../../../src/client/flow-chart-model.ts'
import { fmtTokens } from '../../../../src/shared/protocol.ts'
import { BASE_CSS } from '../../../../src/client/styles/base.ts'
import { BOARD_CSS } from '../../../../src/client/styles/board.ts'
import { TOKEN_CSS } from '../../../../src/client/styles/token.ts'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT_DIR = 'docs/requirements/REQ-261004151652-d535/evidence'

// 标本：实施中、当前节点 implementing（有快照）——三点数据与真机量级一致
const MODEL = buildFlowChartModel({
  status: 'implementing',
  category: 'feature',
  progress: { done: 3, total: 12 },
  nodes: [
    { key: 'brainstorming', tokens: { total: 827822 } },
    { key: 'design', tokens: { total: 10901086 } },
    { key: 'decomposing', tokens: { total: 922042 } },
    { key: 'implementing', tokens: { total: 12670636 } },
  ],
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

const dir = mkdtempSync(join(tmpdir(), 'pm-shot-535-'))
const file = join(dir, 'shot.html')
writeFileSync(file, page())

for (const width of [1280, 700, 560]) {
  const out = join(OUT_DIR, 'header-node-tokens-' + width + '.png')
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
    '--no-first-run', '--no-default-browser-check',
    '--window-size=' + width + ',150', '--screenshot=' + out, 'file://' + file,
  ], { stdio: ['ignore', 'pipe', 'ignore'] })
  const container = width - 48
  const state = container > 780 ? '明细宽档（全部名字 + 各自的数 + 连线，无累计徽章）'
    : container > 600 ? '中档（只剩当前节点名，但它带着自己的数；无连线、无累计徽章）'
      : '紧凑档（圆点 + 计数 + 累计徽章）'
  console.log('shot ' + out + '  容器≈' + container + ' → ' + state)
}
