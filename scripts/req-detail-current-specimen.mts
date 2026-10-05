/**
 * 「现状」需求详情页标本生成器（REQ-261004222448-292a 重构前基线）。
 *
 * 为什么需要它：整页重构必须先有**可对照的基线**。本脚本用**真实 render 函数**
 * （buildReqDetail 及其全部子渲染）+ 真实 CSS 拼出标本页，钉住"重构前长什么样"，
 * 供评审做 before/after —— 而不是靠注释或记忆描述现状（本仓注释与实现已经出现过不一致）。
 *
 * 用法：npx tsx scripts/req-detail-current-specimen.mts
 * 产物：docs/requirements/REQ-261004222448-292a/prototype/current-detail-specimen.html
 *
 * 与真实页面的两处差异（已在标本页顶部标注，不许静默）：
 *   1. 四个异步取数区（当前阶段详情 / 注入 / 条款接收 / 追溯 / Token）在真实页面里是点开或切 Tab 后才取；
 *      标本页把它们**内联为静态 mock**，以便一次看全整页内容（否则标本只剩骨架，无法评审信息架构）。
 *   2. 标本数据为虚构（与重构稿用同一套标本，保证可比）。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildReqDetail } from '../src/client/views/stage-detail.ts'
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

const T0 = Date.parse('2026-10-04T23:41:00+08:00')
const H = 3600_000
const M = 60_000
const at = (base: number, delta: number): number => base + delta
const DAY0 = Date.parse('2026-10-04T00:00:00+08:00')
const t = (h: number, m: number): number => at(DAY0, h * H + m * M)

const REQ_ID = 'REQ-261004201530-7f3c'

/** 标本需求（与重构稿同源同数据）。 */
const req = {
  id: REQ_ID,
  title: '看板验收单支持逐项驳回并自动生成返工卡',
  description: '验收单支持对单项点「驳回并给意见」；驳回后自动生成一张返工子卡挂到原任务下，'
    + '并把意见写进卡的 acceptance；返工卡走完 dev→review→test 后回到验收单待裁决。',
  category: 'feature',
  promptDifficulty: 'expert',
  status: 'implementing',
  blocked: false,
  autoRun: true,
  workspaceRoot: '/Users/mac/proj/demo',
  docLinks: {},
  sourceSessionId: 'session-w-3643cb19',
  seats: [
    { windowKey: 'session-w-3643cb19', role: 'owner', joinedAt: t(22, 28) },
    { windowKey: 'session-w-b262610a', role: 'worker', joinedAt: t(22, 57) },
    { windowKey: 'session-w-9f0c1d77', role: 'observer', joinedAt: t(23, 5) },
  ],
  advance: { runId: 'run-7f3c-2', currentSubtaskId: 't-002-review', stepIndex: 6, heartbeatAt: T0 },
  artifacts: [
    { kind: 'requirement', path: `docs/requirements/${REQ_ID}/requirement.md`, registeredAt: t(22, 31) - 3 * M, registeredBy: { kind: 'agent', sessionId: 'session-w-3643cb19' }, confirmedAt: t(22, 31), confirmedBy: { kind: 'human' } },
    { kind: 'design', path: `docs/requirements/${REQ_ID}/design/architecture.md`, registeredAt: t(22, 44), registeredBy: { kind: 'agent', sessionId: 'session-w-3643cb19' }, confirmedAt: t(22, 48) + 12_000, confirmedBy: { kind: 'human' } },
    { kind: 'design', path: `docs/requirements/${REQ_ID}/design/interfaces.md`, registeredAt: t(22, 44), registeredBy: { kind: 'agent', sessionId: 'session-w-3643cb19' }, confirmedAt: t(22, 48) + 12_000, confirmedBy: { kind: 'human' } },
    { kind: 'design', path: `docs/requirements/${REQ_ID}/design/frontend.md`, registeredAt: t(23, 38) + 52_000, registeredBy: { kind: 'agent', sessionId: 'session-w-b262610a' } },
    { kind: 'decomposition', path: `docs/requirements/${REQ_ID}/decomposition.md`, registeredAt: t(23, 2) + 30_000, registeredBy: { kind: 'agent', sessionId: 'session-w-3643cb19' }, confirmedAt: t(23, 2) + 41_000, confirmedBy: { kind: 'human' } },
    { kind: 'task_detail', path: `docs/requirements/${REQ_ID}/tasks/t-002-dev.md`, registeredAt: t(23, 26), registeredBy: { kind: 'agent', sessionId: 'session-w-b262610a' } },
  ],
  plan: {
    path: `docs/requirements/${REQ_ID}/decomposition.md`,
    summary: '把验收单驳回做成前端交互 + 返工卡生成 + RTM 回流三件事，按子卡链模板分三段。',
    tasks: [
      { key: 't1', title: '子卡链模板：返工卡生成' },
      { key: 't2', title: '验收单逐项驳回 UI' },
      { key: 't3', title: 'RTM 回流与覆盖度' },
    ],
    submittedAt: t(22, 50), submittedBy: { kind: 'agent', sessionId: 'session-w-3643cb19' },
    approvedAt: t(23, 2) + 41_000, approvedBy: { kind: 'human' },
  },
  statusHistory: [
    { status: 'draft', at: t(22, 28), by: { kind: 'human' } },
    { status: 'brainstorming', at: t(22, 31) + 12_000, by: { kind: 'agent', sessionId: 'session-w-3643cb19' } },
    { status: 'design', at: t(22, 48) + 20_000, by: { kind: 'agent', sessionId: 'session-w-3643cb19' } },
    { status: 'decomposing', at: t(23, 2) + 41_000, by: { kind: 'agent', sessionId: 'session-w-3643cb19' }, reason: '批准计划后进入拆分' },
    { status: 'implementing', at: t(23, 13) + 2_000, by: { kind: 'agent', sessionId: 'session-w-b262610a' }, reason: '任务落库' },
  ],
  comments: [
    { id: 'c1', body: '[文档变更] 计划 v2：把 t2 拆成 dev/review/test 三段，粒度对齐子卡模板', createdAt: t(22, 56), createdBy: { kind: 'human' } },
    { id: 'c2', body: '退回返工：验收单驳回后需保留原意见与责任卡', createdAt: t(23, 31), createdBy: { kind: 'agent', sessionId: 'session-w-b262610a' } },
  ],
  version: 14,
  createdAt: t(22, 28),
  updatedAt: T0,
  createdBy: { kind: 'human' },
  updatedBy: { kind: 'agent', sessionId: 'session-w-b262610a' },
} as never

/** 11 张卡（父 3 / 子 8），与重构稿标本一致。 */
function card(id: string, title: string, phase: string, status: string, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    id, requirementId: REQ_ID, title, description: '', phase, side: 'frontend',
    dependsOn: [], scope: { apis: [], tables: [], files: [] }, acceptance: '', context: '',
    status, blocked: false, executions: [], comments: [], version: 3,
    createdAt: t(23, 3), updatedAt: T0, createdBy: { kind: 'agent' }, updatedBy: { kind: 'agent' },
    ...extra,
  }
}
const done = { startedAt: t(23, 12), endedAt: t(23, 20) }
const tasks = [
  card('t-001', '子卡链模板：返工卡生成', 'implement', 'done', { cardDoc: `docs/requirements/${REQ_ID}/tasks/t-001.md` }),
  card('t-001-dev', '子卡链模板：返工卡生成（dev）', 'implement', 'done', { parentId: 't-001', stageKind: 'dev', claimedBy: 'session-w-b262610a', executions: [{ id: 'e1', trigger: 'auto', startedAt: done.startedAt, endedAt: done.endedAt, outcome: 'succeeded' }] }),
  card('t-001-review', '子卡链模板：返工卡生成（review）', 'review', 'done', { parentId: 't-001', stageKind: 'review' }),
  card('t-001-test', '子卡链模板：返工卡生成（test）', 'test', 'done', { parentId: 't-001', stageKind: 'test' }),
  card('t-002', '验收单逐项驳回 UI', 'implement', 'in_progress', { cardDoc: `docs/requirements/${REQ_ID}/tasks/t-002.md` }),
  card('t-002-dev', '验收单逐项驳回 UI（dev）', 'implement', 'done', { parentId: 't-002', stageKind: 'dev', claimedBy: 'session-w-b262610a' }),
  card('t-002-review', '验收单逐项驳回 UI（review）', 'review', 'in_progress', { parentId: 't-002', stageKind: 'review', claimedBy: 'session-w-b262610a' }),
  card('t-002-test', '验收单逐项驳回 UI（test）', 'test', 'todo', { parentId: 't-002', stageKind: 'test' }),
  card('t-003', 'RTM 回流与覆盖度', 'implement', 'todo', {}),
  card('t-003-dev', 'RTM 回流与覆盖度（dev）', 'implement', 'todo', { parentId: 't-003', stageKind: 'dev' }),
  card('t-003-review', 'RTM 回流与覆盖度（review）', 'review', 'todo', { parentId: 't-003', stageKind: 'review' }),
] as never

/** 把异步占位区替换成静态 mock（只为评审看全整页；已在页头标注）。 */
function fillAsync(html: string): string {
  /**
   * 按**标签配对**替换容器内容（不能用正则 `[\s\S]*?</div>`：占位内容本身含嵌套 div，
   * 非贪婪匹配会在内层 `</div>` 处截断 → 留下多余闭合标签 → 浏览器重排，
   * 隐藏 Tab 的内容会漏到可见区（2026-10-04 实测踩过，故改为计数配对）。
   */
  const put = (out: string, id: string, inner: string): string => {
    const marker = 'id="' + id + '"'
    const at = out.indexOf(marker)
    if (at < 0) {
      console.warn('WARN 未找到占位容器：' + id)
      return out
    }
    const openStart = out.lastIndexOf('<', at)
    const openEnd = out.indexOf('>', at)
    if (openStart < 0 || openEnd < 0) {
      console.warn('WARN 容器标签异常：' + id)
      return out
    }
    // 从开标签之后开始计数 <div / </div>，深度归零处即容器闭合。
    let depth = 1
    let i = openEnd + 1
    while (i < out.length && depth > 0) {
      const nextOpen = out.indexOf('<div', i)
      const nextClose = out.indexOf('</div>', i)
      if (nextClose < 0) break
      if (nextOpen >= 0 && nextOpen < nextClose) {
        depth += 1
        i = nextOpen + 4
      } else {
        depth -= 1
        i = nextClose + 6
        if (depth === 0) {
          return out.slice(0, openEnd + 1) + inner + out.slice(nextClose)
        }
      }
    }
    console.warn('WARN 容器未正确闭合：' + id)
    return out
  }
  let out = html
  out = put(out, 'dsh-pm-stage-detail-container',
    '<div class="dsh-pm-note">实施中 · 4/11 完成 · 剩 7 · 进行中 t-002-review ｜ 最近动态 2 分钟前</div>'
    + '<div style="font-size:12px;margin-top:8px"><b>进行中（1）</b><br>◐ t-002-review 复核验收单驳回交互 · w-b262610a · 已跑 12m'
    + '<br><br><b>已完成（4）</b><br>✓ t-001-dev / t-001-review / t-001-test / t-002-dev'
    + '<br><br><b>待开始（6）</b><br>○ t-002-test / t-003-dev / t-003-review …</div>')
  out = put(out, 'dsh-pm-injection-info-container',
    '<div class="dsh-pm-note">implementing/expert · routeKey implementing-expert-v3 · 命中 exact · 4 片段 · 6 240 字符 · 23:12</div>')
  out = put(out, 'dsh-pm-marks-container',
    '<div style="font-size:12px"><div style="color:#b42318">🔴 未被接收：FR-5（返工卡回流 RTM）</div><div>✅ FR-1 · FR-2 · FR-3 · FR-4 已被任务接收</div></div>')
  out = put(out, 'dsh-pm-traceability-container',
    '<div class="dsh-pm-note">三级覆盖度：需求←设计 4/5（缺 FR-5）· 设计←任务 3/3 · 任务←测试 2/3<br>（真实页面为覆盖度卡 + 四列关系图 + 3 个矩阵表）</div>')
  out = put(out, 'dsh-pm-token-container',
    '<div class="dsh-pm-note">累计 1.84M（输入 1.62M / 输出 218K / 缓存命中 71%）· 按节点 7 列表格（真实页面）</div>')
  return out
}

function main(): void {
  const page = fillAsync(buildReqDetail(req as never, tasks as never, T0, new Set<string>()))
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>现状基线 · 需求详情页（重构前）— REQ-261004222448-292a</title>
<style>
${CSS}
html, body { margin: 0; background: #f5f6f8; }
body { font: 13px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color: #1d1d1f; }
.baseline-bar { position: sticky; top: 0; z-index: 20; background: #7a2f2f; color: #fff; padding: 9px 16px; font-size: 12px; }
.baseline-wrap { max-width: 1180px; margin: 16px auto 60px; padding: 0 16px; }
.baseline-note { margin: 0 0 12px; padding: 9px 12px; background: #fff; border: 1px dashed rgba(128,128,128,.4); border-radius: 8px; font-size: 12px; color: #444; }
</style></head>
<body>
<div class="baseline-bar"><b>现状基线 · 重构前的需求详情页</b> ｜ 用真实 render 函数（buildReqDetail）+ 真实 CSS 渲染 ｜ 标本数据虚构（与重构稿同一套，保证可比）</div>
<div class="baseline-wrap">
  <div class="baseline-note">
    ⚠️ 与真实页面的差异（已在生成器里显式处理，不静默）：① 五个异步取数区（当前阶段详情 / 注入 / 条款接收 / 追溯 / Token）在真实页面是点开或切 Tab 后才取，
    本标本已内联为静态 mock，否则标本只剩骨架、无法评审信息架构；② 其余（详情头 / 进度点 / 操作条 / 闸门提示 / 描述 / 文档记录 / 统计 / DAG 画布 / 任务表 / 时间线 / 评论 / 验收 / 归档）均为真实渲染输出。
  </div>
  ${page}
</div>
<script>
/* 标本查看器：真实页面的 Tab 切换由 board-mount 处理，此处内联等价实现（只切显隐，不改 DOM 结构）。 */
(function () {
  var q = new URLSearchParams(location.search);
  function show(name) {
    document.querySelectorAll('.dsh-pm-tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    document.querySelectorAll('.dsh-pm-tab-content').forEach(function (c) {
      c.classList.toggle('active', c.dataset.tabContent === name);
    });
  }
  document.querySelectorAll('.dsh-pm-tab').forEach(function (b) {
    b.addEventListener('click', function () { show(b.dataset.tab); });
  });
  show(q.get('tab') || 'overview');
})();
</script>
</body></html>`

  const out = join(dirname(fileURLToPath(import.meta.url)), '..',
    'docs/requirements/REQ-261004222448-292a/prototype/current-detail-specimen.html')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, html)
  console.log('OK 写出基线标本：' + out + '（' + html.length + ' 字符）')
}

main()
