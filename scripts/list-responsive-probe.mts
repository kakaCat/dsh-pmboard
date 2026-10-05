/**
 * 列表视图自适应回归探针（REQ-260930194112-1ab8 t3）。
 *
 * 为什么需要它：静态断言只能证明「规则写在文件里」，证明不了「渲染出来真的不换行、按钮真的不重叠」。
 * 布局缺陷只能靠真实渲染判定——本脚本用真实 buildListView + 真实 CSS 拼出标本页，
 * 交给 headless Chrome 在五档宽度下量行盒数、按钮包围盒与横向溢出。
 *
 * 断言矩阵（与 design/test-cases.md T-1 一致）：
 *   A1 关键列单行      ID / 状态徽章 / 可见的分类芯片 行盒数 == 1
 *   A2 操作列未压缩    操作列 clientWidth + 0.5 >= scrollWidth
 *   A3 按钮不重叠      同行按钮包围盒两两不相交
 *   A4 档位列数        1680→8, 1080→5, 840→4, 640→4
 *   A5 滚动兜底        640→true，其余→false
 *   A6 宽档不缩水      1680 档 cols==8 且 titleW>=500
 *
 * 用法：npx tsx scripts/list-responsive-probe.mts
 * 退出码：0 = 全档通过；1 = 有档位不通过；2 = 环境不可用（找不到 Chrome，响亮失败不静默跳过）
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildListView } from '../src/client/views/board.ts'
import { BASE_CSS } from '../src/client/styles/base.ts'
import { DETAIL_CSS } from '../src/client/styles/detail.ts'
import { FILES_CSS } from '../src/client/styles/files.ts'
import { BOARD_CSS } from '../src/client/styles/board.ts'
import { PANEL_CSS } from '../src/client/styles/panel.ts'
import { TOKEN_CSS } from '../src/client/styles/token.ts'
import { MARKS_CSS } from '../src/client/styles/marks.ts'
import { SUBTASK_CSS } from '../src/client/styles/subtask.ts'
import { NODE_PANEL_CSS } from '../src/client/styles/node-panel.ts'
import { TRACEABILITY_CSS } from '../src/client/styles/traceability.ts'
import { DAG_CSS } from '../src/client/styles/dag.ts'

const CSS = BASE_CSS + DETAIL_CSS + FILES_CSS + BOARD_CSS + PANEL_CSS + TOKEN_CSS
  + MARKS_CSS + SUBTASK_CSS + NODE_PANEL_CSS + TRACEABILITY_CSS + DAG_CSS

/** 档位 → 期望可见列数（设计 architecture.md A-2 的档位表）。 */
const TIERS: ReadonlyArray<{ width: number; cols: number; overflow: boolean }> = [
  { width: 640, cols: 4, overflow: true },
  { width: 760, cols: 4, overflow: false },
  { width: 840, cols: 4, overflow: false },
  { width: 1080, cols: 5, overflow: false },
  { width: 1680, cols: 8, overflow: false },
]

const T0 = Date.parse('2026-09-30T18:55:00+08:00')

/** 标本数据：长 ID + 长标题 + 中英混排 + 四个不同状态，覆盖换行/让位的最坏情况。 */
const ROWS: ReadonlyArray<[string, string, string, string]> = [
  ['REQ-260930183951-eb6c', '修复验收单自证失败：parentId 投影 + 验收锚点校准 + 系统项编号连续', 'decomposing', 'session-w-3643cb19'],
  ['REQ-260930182521-4fee', 'DAG 层级与泳道图卡片颜色未按阶段展示', 'implementing', 'session-w-b262610a'],
  ['REQ-260930155231-0862', 'Webhook 通知插件：在界面上配置 webhook 地址与开关（声明 Config schema + 设置表单）', 'implementing', 'session-w-b7c52392'],
  ['REQ-260930094139-2d65', '验收纪律硬化：实际结果必填 + 验收单去重 + 追溯断链告警 + 阶段时间戳', 'accepting', 'session-w-da076f3e'],
]

function specimenHtml(): string {
  const requirements = ROWS.map(([id, title, status, sid]) => ({
    id, title, description: '', category: 'feature' as const, status,
    blocked: false, createdAt: T0 - 86_400_000, updatedAt: T0 - 120_000,
    sourceSessionId: sid, comments: [], version: 1,
    createdBy: { kind: 'human' as const }, updatedBy: { kind: 'human' as const },
  }))
  const view = buildListView(
    { revision: 453, requirements, tasks: [], ready: {}, tokenTotals: {} } as never,
    T0, { sortKey: 'created', sortDir: 'desc', page: 1, pageSize: 10 },
  )
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>pmboard 列表视图自适应标本</title>
<style>
${CSS}
html, body { margin: 0; height: 100%; background: var(--dsw-bg-primary, #fff); }
body { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; color: #111827; }
</style></head>
<body><div class="dsh-pm-board">${view}</div>
<script>
(function () {
  function overlap(a, b) {
    return !(a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5);
  }
  function lines(el) { return el ? el.getClientRects().length : 0; }
  var table = document.querySelector('.dsh-pm-table');
  var wrap = document.querySelector('.dsh-pm-table-wrap');
  var bad = [];
  if (!table) bad.push('未渲染出列表表格');
  if (!wrap) bad.push('缺少 .dsh-pm-table-wrap 滚动容器');
  if (table) {
    Array.from(table.querySelectorAll('tr.dsh-pm-list-row')).forEach(function (tr, ri) {
      var idEl = tr.querySelector('.dsh-pm-card-id');
      if (lines(idEl) !== 1) bad.push('row' + ri + ': ID 占 ' + lines(idEl) + ' 行');
      var stEl = tr.querySelector('.dsh-pm-status-badge');
      if (lines(stEl) !== 1) bad.push('row' + ri + ': 状态徽章占 ' + lines(stEl) + ' 行');
      var catEl = tr.querySelector('.dsh-pm-cat');
      if (catEl && lines(catEl) > 0 && lines(catEl) !== 1) bad.push('row' + ri + ': 分类芯片占 ' + lines(catEl) + ' 行');
      var btns = Array.from(tr.querySelectorAll('.dsh-pm-list-actions .dsh-pm-btn'));
      for (var i = 0; i < btns.length; i++) {
        var r = btns[i].getBoundingClientRect();
        for (var j = i + 1; j < btns.length; j++) {
          if (overlap(r, btns[j].getBoundingClientRect())) {
            bad.push('row' + ri + ': 按钮重叠 ' + btns[i].textContent.trim() + '/' + btns[j].textContent.trim());
          }
        }
      }
      var act = tr.querySelector('.dsh-pm-list-actions');
      if (act.getBoundingClientRect().width + 0.5 < act.scrollWidth) bad.push('row' + ri + ': 操作列被压缩');
    });
  }
  var head = table ? table.querySelector('thead tr') : null;
  var cols = head ? Array.from(head.children).filter(function (th) { return th.getClientRects().length > 0; }).length : 0;
  var widest = 0;
  if (table) {
    Array.from(table.querySelectorAll('tr.dsh-pm-list-row .dsh-pm-td-title')).forEach(function (td) {
      widest = Math.max(widest, Math.round(td.getBoundingClientRect().width));
    });
  }
  var diag = document.createElement('div');
  diag.id = 'diag';
  diag.textContent = 'DIAG width=' + document.documentElement.clientWidth
    + ' cols=' + cols + ' titleW=' + widest
    + ' overflowX=' + (wrap ? (wrap.scrollWidth > wrap.clientWidth + 1) : 'n/a')
    + ' problems=' + (bad.length ? bad.join(' | ') : 'NONE');
  document.body.appendChild(diag);
})();
</script></body></html>`
}

/** 浏览器落点：CHROME_BIN 优先，其次 macOS / Linux 常见路径。 */
function findChrome(): string | undefined {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((p): p is string => typeof p === 'string' && p.length > 0)
  return candidates.find(p => existsSync(p))
}

interface Diag { width: number; cols: number; titleW: number; overflowX: boolean; problems: string }

function parseDiag(dom: string): Diag | undefined {
  const m = dom.match(/<div id="diag">([^<]*)<\/div>/)
  if (!m) return undefined
  const text = m[1]!
  const width = Number(/width=(\d+)/.exec(text)?.[1] ?? NaN)
  const cols = Number(/cols=(\d+)/.exec(text)?.[1] ?? NaN)
  const titleW = Number(/titleW=(\d+)/.exec(text)?.[1] ?? NaN)
  const overflowX = /overflowX=(true|false)/.exec(text)?.[1] === 'true'
  const problems = /problems=(.*)$/.exec(text)?.[1] ?? 'UNPARSED'
  return { width, cols, titleW, overflowX, problems }
}

function main(): void {
  const chrome = findChrome()
  if (chrome === undefined) {
    console.error('PROBE FAIL（环境不可用，退出码 2）：找不到 Chrome。')
    console.error('修复：安装 Google Chrome，或设置环境变量 CHROME_BIN 指向可执行文件。')
    process.exit(2)
  }

  const dir = mkdtempSync(join(tmpdir(), 'pm-list-probe-'))
  const page = join(dir, 'specimen.html')
  writeFileSync(page, specimenHtml())

  const failures: string[] = []
  for (const tier of TIERS) {
    let diag: Diag | undefined
    try {
      const dom = execFileSync(chrome, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
        '--no-first-run', '--no-default-browser-check',
        `--window-size=${tier.width},900`, '--dump-dom', `file://${page}`,
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })
      diag = parseDiag(dom)
    } catch (e) {
      failures.push(`w=${tier.width}: Chrome 调用失败（${(e as Error).message}）`)
      continue
    }
    if (diag === undefined) {
      failures.push(`w=${tier.width}: 未读到 #diag（标本页脚本未执行？）`)
      continue
    }
    console.log(`w=${diag.width} cols=${diag.cols} titleW=${diag.titleW} overflowX=${diag.overflowX} problems=${diag.problems}`)
    if (diag.problems !== 'NONE') failures.push(`w=${tier.width}: ${diag.problems}`)
    if (diag.cols !== tier.cols) failures.push(`w=${tier.width}: 可见列数 ${diag.cols} ≠ 期望 ${tier.cols}`)
    if (diag.overflowX !== tier.overflow) failures.push(`w=${tier.width}: 横向滚动 ${diag.overflowX} ≠ 期望 ${tier.overflow}`)
    if (tier.width === 1680 && diag.titleW < 500) failures.push(`w=1680: 标题列仅 ${diag.titleW}px（宽档应 ≥500px，列被意外压缩）`)
  }

  if (failures.length > 0) {
    console.error('\nPROBE FAIL')
    for (const f of failures) console.error('  - ' + f)
    process.exit(1)
  }
  console.log('\nPROBE PASS（5 档宽度：关键列单行 / 按钮不重叠 / 操作列未压缩 / 列数按档让位 / 640px 横向滚动兜底）')
}

main()
