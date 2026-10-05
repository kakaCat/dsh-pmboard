/**
 * 「DAG」Tab 面板（REQ-261004222448-292a · FR-8）——工作步骤图 + **每步执行结果**。
 *
 * 与画布的边界（本卡最要紧的一条，改代码前先读）：
 *  · 本面板**不实现、不改**画布：`client/dag/*` 与 `views/dag-view.ts` 的布局 / 连线 /
 *    命中测试一行都不动（需求边界第 5 条：不重做 DAG 画布，只搬家 + 补挂执行结果）。
 *  · 这里只渲染**承载容器 + 数据属性**：`[data-dag-canvas]`（内含
 *    `<canvas id="report-dag-canvas">`）与 `[data-dag-wrap]`，以及照抄 `buildDagCanvas`
 *    同形的工具条 / 图例。画布是**命令式挂载**：`mountDagCanvas` 按 canvas id 取元素、
 *    按 `.dsh-pm-dag-panel` 找工具条、按 `[data-dag-wrap]` 挂 ResizeObserver，
 *    所以**必须由壳在面板 HTML 进 DOM 之后**调用既有挂载入口：
 *    `tryMountDagCanvas(tasks, ready, DAG_PANEL_CANVAS_ID, { stateKey })`。
 *    容器上的 `data-dag-state-key` 已经算好，壳直接取用即可（见下）。
 *  · 为什么画布数据**不从本面板传**：`DagResponse.tasks`（`DagGraphNode`）**没有 phase / side**，
 *    而画布 `DagTaskLike` 需要它们（角色与配色由 phase / side 派生）。给假值补上就是编数据；
 *    所以画布照旧吃看板手里的 `TaskRecord[]`（壳已有该数据），本面板只吃 DagResponse
 *    画「层级 / 依赖 / 并行度」摘要与每步执行结果表。
 *  · 为什么不用 `buildDagCanvas()` 生成骨架（单一来源更好）：该函数收 `DagTaskLike[]`，
 *    上面那条类型缺口（缺 phase / side）会让调用只能靠双重断言蒙混过关；且它对空任务退回
 *    「暂无任务」、连挂载点都不给。故此处**同形照抄**骨架标记：若将来 `DagGraphNode`
 *    补上 phase / side，应改回调用 `buildDagCanvas`（那才是单一来源）。
 *  · 画布 id 用**面板专用常量**（不是旧详情页的 `dag-canvas`）：同页还可能有旧详情页 /
 *    会话面板两块画布，`mountDagCanvas` 按 id 找元素，重名会互抢（`dag-mount.ts` 注释写明过）。
 *
 * 为什么执行结果表**一律逐行铺开**：本需求的头号病是"内容藏起来、有多少不可数"，
 * 所以不做内层滚动、不折叠成一行（产物里连 `overflow` 都不出现）。
 *
 * 为什么根容器自己也带 `data-panel="dag"`（壳 `report-tabs.ts` 的面板包装器**已经**带了一个）：
 * 本卡的选择器契约把「根容器 `data-panel="dag"`」列进了面板必须提供的东西，而面板 render 是
 * 纯函数——不自己带上，面板单独渲染出来的产物就无法自足断言。代价是壳产物里会有两个嵌套的
 * `data-panel="dag"`（没有任何代码 querySelector `[data-panel]`，写它的只有壳的包装器）。
 *
 * @module dsh-pmboard/client/views/panels/dag
 */
import { esc } from '../../html.js'
import type { DagGraphNode, DagResponse, DagStep } from '../../../shared/protocol.js'
import type { ReportTabCtx, ReportTabDef } from '../report-tabs.js'

/**
 * 本面板的画布 id（**面板专用**，勿改成 `dag-canvas`）。
 * 壳挂载时必须拿它调用 `tryMountDagCanvas(tasks, ready, DAG_PANEL_CANVAS_ID, opts)`。
 */
export const DAG_PANEL_CANVAS_ID = 'report-dag-canvas'

/** 画布承载容器的 id（`.dsh-pm-dag-panel` 的取用方；唯一性理由同上）。 */
const DAG_PANEL_HOST_ID = 'report-dag-canvas-host'

/* ────────────────────────────────────────────────────────────── 形状与取值 */

/**
 * 「这是 DagResponse 吗」的派发守卫（不是严格校验器）。
 *
 * 为什么必须有：面板 render 拿到的是 `unknown`（壳按 Tab 分派）。若端点未接线 / 中间层
 * 返回 200 + 无关载荷，直接取 `data.tasks` 就会整块崩成空白——而空白与"没有数据"必须分开。
 */
function isDagResponse(v: unknown): v is DagResponse {
  if (v === null || typeof v !== 'object') return false
  const r = v as Partial<DagResponse>
  return Array.isArray(r.tasks) && Array.isArray(r.steps)
}

/** 毫秒 → `YYYY-MM-DD HH:mm`（与 `stage-panel.fmtTime` 同款；本包暂无共享时间工具）。 */
function fmtTime(ms: number): string {
  if (!Number.isFinite(ms)) return '—'
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

/** 时长可读化：`42 秒` / `3 分 12 秒` / `1 小时 5 分`（不拿毫秒数糊人，也不拿 0 冒充未知）。 */
function fmtDur(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return sec + ' 秒'
  const min = Math.floor(sec / 60)
  if (min < 60) return min + ' 分 ' + (sec % 60) + ' 秒'
  return Math.floor(min / 60) + ' 小时 ' + (min % 60) + ' 分'
}

/** 该步的尝试次数；未记录（非有限数）返回 undefined——**不许**替服务端填 1。 */
function attemptOf(step: DagStep): number | undefined {
  const n: unknown = step.attempt
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 ? Math.floor(n) : undefined
}

/**
 * 产出条目数：以服务端 `outputCount` 为准；没给时才用汇报里的
 * `completed + filesChanged` 兜底；两者都没有 → undefined（"未记录"，**不是 0**）。
 */
function outputCountOf(step: DagStep): number | undefined {
  const n: unknown = step.outputCount
  if (typeof n === 'number' && Number.isFinite(n)) return Math.max(0, Math.floor(n))
  const report = step.report
  if (report === undefined) return undefined
  return (Array.isArray(report.completed) ? report.completed.length : 0)
    + (Array.isArray(report.filesChanged) ? report.filesChanged.length : 0)
}

/**
 * 零产出执行：产物必须**显眼**（否则它看起来和正常执行一样）。
 *
 * 只在**已结束**的执行上判：`running` 还没产出是常态，标黄只会变成噪音。
 */
function isZeroOutput(step: DagStep): boolean {
  if (step.outcome === 'running') return false
  return outputCountOf(step) === 0
}

/** 结局文案（枚举由 protocol 的 `DagStep.outcome` 保证，这里只做展示映射）。 */
function outcomeLabel(outcome: DagStep['outcome']): string {
  switch (outcome) {
    case 'running': return '⏳ 进行中'
    case 'succeeded': return '✅ 成功'
    case 'failed': return '❌ 失败'
    case 'cancelled': return '⛔ 已取消'
    default: return '⛔ 已结束'
  }
}

/* ────────────────────────────────────────────────────────────── 图数据摘要 */

/**
 * 层级 = **最长依赖链深度**（无依赖 = 第 0 层），与 `views/dag-view.ts` 的 `layerOf` 同规则
 * （环按 0 降级，不递归爆栈）。
 *
 * 为什么这里要自己算一遍：`DagGraphNode.layer` 是**可选**字段，服务端不填时摘要就答不出
 * 「几层」，而"几层 / 几张卡 / 并行度"正是 FR-8 的判据。这里只算**摘要用的层号**，
 * 不参与画布布局（布局仍是 `client/dag/*` 的算法，本面板不碰）。
 */
function layerDepths(tasks: readonly DagGraphNode[]): Map<string, number> {
  const present = new Set(tasks.map(t => t.id))
  const depsOf = new Map<string, string[]>()
  for (const t of tasks) {
    depsOf.set(t.id, (Array.isArray(t.dependsOn) ? t.dependsOn : []).filter(d => present.has(d)))
  }
  const memo = new Map<string, number>()
  const stack = new Set<string>()
  const depth = (id: string): number => {
    const hit = memo.get(id)
    if (hit !== undefined) return hit
    if (stack.has(id)) return 0 // 环：按 0 降级（报告环是别的卡的事，摘要不因此爆栈）
    stack.add(id)
    let d = 0
    for (const p of depsOf.get(id) ?? []) d = Math.max(d, depth(p) + 1)
    stack.delete(id)
    memo.set(id, d)
    return d
  }
  for (const t of tasks) depth(t.id)
  return memo
}

/**
 * 图数据摘要：几层 / 几张卡 / 多少依赖边 / 最大并行度（同层最多几张）/
 * 分层明细 / 状态分布 / 子卡链未生成数。
 *
 * 为什么并行度取"同层最多张数"：这是唯一能从图数据本身算出来、且不含猜测的口径；
 * 拿 ready 数当并行度会把"依赖已满足"混进"能同时开工"。
 */
function summaryHtml(tasks: readonly DagGraphNode[]): string {
  if (tasks.length === 0) {
    return '<div class="dsh-pm-dag-summary" data-dag-summary="1" data-dag-empty="no-tasks">'
      + '本需求还没有任务卡：图与每步执行结果都为空。'
      + '拆分计划审批后生成任务卡，这里会列出层级 / 依赖 / 并行度与每步执行结果。'
      + '</div>'
  }

  const depths = layerDepths(tasks)
  const perLayer = new Map<number, number>()
  for (const t of tasks) {
    const d = depths.get(t.id) ?? 0
    perLayer.set(d, (perLayer.get(d) ?? 0) + 1)
  }
  const layerCount = Math.max(...perLayer.keys()) + 1
  let maxParallel = 0
  for (const n of perLayer.values()) maxParallel = Math.max(maxParallel, n)

  // 依赖边：只数两端都在本图里的边，按 `from -> to` 去重（与 dag-view 的边去重同口径）。
  const present = new Set(tasks.map(t => t.id))
  const edges = new Set<string>()
  for (const t of tasks) {
    for (const dep of Array.isArray(t.dependsOn) ? t.dependsOn : []) {
      if (present.has(dep) && dep !== t.id) edges.add(dep + ' -> ' + t.id)
    }
  }

  const statusCount = new Map<string, number>()
  let chainMissing = 0
  for (const t of tasks) {
    statusCount.set(t.status, (statusCount.get(t.status) ?? 0) + 1)
    if (t.chainMissing === true) chainMissing += 1
  }

  const layerLine = [...perLayer.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([layer, n]) => 'L' + String(layer) + ' ' + String(n) + ' 张')
    .join(' / ')
  const statusLine = [...statusCount.entries()]
    .map(([s, n]) => s + ' ' + String(n))
    .join(' · ')

  return '<div class="dsh-pm-dag-summary" data-dag-summary="1">'
    + '<span data-dag-layer-count="' + String(layerCount) + '">层级 ' + String(layerCount) + ' 层</span>'
    + '<span data-dag-task-count="' + String(tasks.length) + '">卡片 ' + String(tasks.length) + ' 张</span>'
    + '<span data-dag-edge-count="' + String(edges.size) + '">依赖边 ' + String(edges.size) + ' 条</span>'
    + '<span data-dag-parallelism="' + String(maxParallel) + '">最大并行度 ' + String(maxParallel) + ' 张/层</span>'
    + (chainMissing > 0
      ? '<span data-dag-chain-missing="' + String(chainMissing) + '">子卡链未生成 ' + String(chainMissing) + ' 张</span>'
      : '')
    + '<span data-dag-layers="1">分层：' + esc(layerLine) + '</span>'
    + '<span data-dag-statuses="1">状态：' + esc(statusLine) + '</span>'
    + '</div>'
}

/* ────────────────────────────────────────────────────────────── 画布承载容器 */

/**
 * 画布承载容器（**只给挂载点，不画图**）。
 *
 * 数据结构与 `views/dag-view.ts#buildDagCanvas` **同形**（`.dsh-pm-dag-panel` / 工具条
 * `[data-dag-dir]`·`[data-dag-toggle]` / `[data-dag-wrap]` / 图例），这样：
 *  ① 壳的既有挂载入口 `tryMountDagCanvas` 拿到 canvas id 后即可工作（工具条点击、
 *     ResizeObserver 重排、视图状态回填都按这些标记找元素）；
 *  ② 壳若更愿意自己调 `buildDagCanvas(reqTasks, hostId, canvasId)` 灌这段，类名与标记
 *     也完全对得上（两条路都通，不必协调）。
 *
 * `data-dag-state-key` 已按 `<canvasId>::<requirementId>` 拼好——这个键形是
 * `dag/view-state.ts` 的约定（键必须含需求 id，否则 A 需求的方向会串到 B 需求）。
 */
function canvasHostHtml(ctx: ReportTabCtx): string {
  const stateKey = DAG_PANEL_CANVAS_ID + '::' + ctx.requirementId
  return '<div class="dsh-pm-dag-panel" id="' + esc(DAG_PANEL_HOST_ID) + '" data-dag-canvas="1"'
    + ' data-dag-canvas-id="' + esc(DAG_PANEL_CANVAS_ID) + '"'
    + ' data-dag-state-key="' + esc(stateKey) + '">'
    + '<div class="dsh-pm-dag-head">'
    + '<span class="dsh-pm-dag-sub">节点 = 顶层卡 · 连线 = 依赖边 · 悬停看上下游 · 单击打开任务卡文档 · 双击打开任务详情（画布与交互沿用现有 DAG 视图）</span>'
    + '<span class="dsh-pm-dag-seg">'
    + '<button type="button" class="dsh-pm-dag-btn is-on" data-dag-dir="vertical">纵向</button>'
    + '<button type="button" class="dsh-pm-dag-btn" data-dag-dir="horizontal">横向</button>'
    + '</span>'
    + '<span class="dsh-pm-dag-seg">'
    + '<button type="button" class="dsh-pm-dag-btn" data-dag-toggle="crit">关键路径</button>'
    + '<button type="button" class="dsh-pm-dag-btn" data-dag-toggle="focus">只看主线</button>'
    + '</span>'
    + '</div>'
    + '<div class="dsh-pm-dag-canvas-wrap" data-dag-wrap>'
    + '<canvas id="' + esc(DAG_PANEL_CANVAS_ID) + '" class="dsh-pm-dag-canvas"></canvas>'
    + '</div>'
    + '<div class="dsh-pm-dag-legend">'
    + '<span><i style="background:rgba(52,199,89,.5)"></i>已完成链路</span>'
    + '<span><i style="background:rgba(0,0,0,.17)"></i>入边箭头（每卡一条）</span>'
    + '<span><i style="background:rgba(0,0,0,.09)"></i>冗余前置（浅色无箭头）</span>'
    + '<span><i style="background:rgba(0,0,0,.09);height:1px"></i>跨层绕行（虚线）</span>'
    + '<span><i style="background:rgba(0,113,227,.75);height:2px"></i>关键路径</span>'
    + '<span>🟠 上游（它依赖谁）</span>'
    + '<span>🔵 下游（谁依赖它）</span>'
    + '<span>🟢 呼吸点 = 可开工</span>'
    + '</div>'
    + '</div>'
}

/* ────────────────────────────────────────────────────────────── 每步执行结果表 */

/** 表头八列（顺序即断言口径，改列名等于改契约）。 */
const STEP_COLUMNS: readonly string[] = [
  '卡', '阶段', '谁做', '触发', '起止时间', '结果', '产出与汇报', '证据与错误',
]

/** 起止 + 耗时一列的内容。 */
function timeCellHtml(step: DagStep): string {
  const start = fmtTime(step.startedAt)
  const endedAt: unknown = step.endedAt
  const ended = typeof endedAt === 'number' && Number.isFinite(endedAt)
  if (!ended) return '<span data-step-time="open">' + esc(start) + ' → 进行中</span>'
  const dur = fmtDur((endedAt as number) - step.startedAt)
  return '<span data-step-time="closed">' + esc(start) + ' → ' + esc(fmtTime(endedAt as number))
    + '（耗时 ' + esc(dur) + '）</span>'
}

/** 产出与汇报列：summary / completed 条数 / filesChanged 条数 / nextStep（FR-8 的四要素）。 */
function outputCellHtml(step: DagStep): string {
  const report = step.report
  const completed = report !== undefined && Array.isArray(report.completed) ? report.completed.length : undefined
  const files = report !== undefined && Array.isArray(report.filesChanged) ? report.filesChanged.length : undefined
  const produced = outputCountOf(step)
  const parts: string[] = []

  const summary = report === undefined ? undefined : report.summary
  parts.push('<div class="dsh-pm-report-step-summary">'
    + (typeof summary === 'string' && summary.length > 0 ? esc(summary) : '（未汇报）') + '</div>')

  const bits: string[] = []
  bits.push(completed === undefined ? '完成 未记录' : '完成 ' + String(completed) + ' 项')
  bits.push(files === undefined ? '改动 未记录' : '改动 ' + String(files) + ' 个文件')
  bits.push(produced === undefined ? '产出未记录' : '产出 ' + String(produced) + ' 条')
  parts.push('<div class="dsh-pm-muted">' + esc(bits.join(' · ')) + '</div>')

  // 零产出必须显眼：它此前看起来和正常执行一模一样（FR-8 判定）
  if (isZeroOutput(step)) {
    parts.push('<div class="dsh-pm-report-zero" data-zero-mark="1">⚠ 零产出：这次执行没有产出任何报告条目或文件改动</div>')
  }
  if (report !== undefined && typeof report.nextStep === 'string' && report.nextStep.length > 0) {
    parts.push('<div class="dsh-pm-muted">下一步：' + esc(report.nextStep) + '</div>')
  }
  return parts.join('')
}

/** 证据与错误列：失败**先**给错误原文（这是人最想先看到的），再列证据。 */
function evidenceCellHtml(step: DagStep): string {
  const parts: string[] = []
  if (step.outcome === 'failed') {
    const err = typeof step.error === 'string' && step.error.length > 0 ? step.error : '（未记录错误原文）'
    parts.push('<div class="dsh-pm-report-step-error" data-step-error-text="1">错误：' + esc(err) + '</div>')
  }
  const list = Array.isArray(step.evidence) ? step.evidence : []
  if (list.length === 0) {
    parts.push('<div class="dsh-pm-muted">（无证据）</div>')
  } else {
    parts.push('<ul class="dsh-pm-report-evidence">'
      + list.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>')
  }
  return parts.join('')
}

/**
 * 一行执行结果。
 *
 * 行级数据属性是**断言契约**（`data-step-row` / `data-task-id` / `data-outcome` /
 * `data-trigger` / `data-step-error` / `data-zero-output`）——后续断言卡照这些写，改名等于毁约。
 */
function stepRowHtml(step: DagStep, titleById: Map<string, string>): string {
  const taskId = typeof step.taskId === 'string' ? step.taskId : ''
  const stage = typeof step.stage === 'string' && step.stage.length > 0 ? step.stage : '—'
  const title = titleById.get(taskId)
  const attempt = attemptOf(step)
  const zero = isZeroOutput(step)
  const attrs = ' class="dsh-pm-report-step" data-step-row="1"'
    + ' data-task-id="' + esc(taskId) + '"'
    + ' data-outcome="' + esc(step.outcome) + '"'
    + ' data-trigger="' + esc(step.trigger) + '"'
    + (attempt === undefined ? '' : ' data-attempt="' + String(attempt) + '"')
    + (step.outcome === 'failed' ? ' data-step-error="1"' : '')
    + (zero ? ' data-zero-output="1"' : '')

  // 谁做：sessionId 就是窗口码/会话码（本仓既有口径），照原样给，不改写、不缩写。
  const sessionId = typeof step.sessionId === 'string' && step.sessionId.length > 0 ? step.sessionId : undefined
  const triggerGloss = step.trigger === 'manual' ? '人工触发' : '自动触发'

  return '<tr' + attrs + '>'
    + '<td data-step-task="' + esc(taskId) + '"><span class="dsh-pm-report-step-title">'
    + esc(title ?? '（图里没有这张卡）') + '</span> <code>' + esc(taskId) + '</code></td>'
    + '<td>' + esc(stage) + '</td>'
    + '<td>' + (sessionId === undefined
      ? '<span class="dsh-pm-muted">（未记录）</span>'
      : '<code data-step-session="' + esc(sessionId) + '">' + esc(sessionId) + '</code>') + '</td>'
    + '<td><code>' + esc(step.trigger) + '</code> ' + esc(triggerGloss) + '</td>'
    + '<td>' + timeCellHtml(step) + '</td>'
    + '<td><span class="dsh-pm-report-step-outcome">' + esc(outcomeLabel(step.outcome)) + '</span>'
    + (attempt !== undefined && attempt > 1 ? ' · 第 ' + String(attempt) + ' 次尝试' : '') + '</td>'
    + '<td>' + outputCellHtml(step) + '</td>'
    + '<td>' + evidenceCellHtml(step) + '</td>'
    + '</tr>'
}

/**
 * 表体：**每一行都铺开**（不许折叠、不许内层滚动）。
 * 没有执行记录时也给一行说辞——表头仍在（八列不因空态消失），空白处不留白。
 */
function stepsTableHtml(steps: readonly DagStep[], tasks: readonly DagGraphNode[]): string {
  const titleById = new Map(tasks.map(t => [t.id, t.title]))
  const head = '<thead><tr>' + STEP_COLUMNS.map(c => '<th scope="col">' + esc(c) + '</th>').join('') + '</tr></thead>'
  if (steps.length === 0) {
    return '<table class="dsh-pm-report-table" data-step-table="1">' + head + '<tbody>'
      + '<tr data-steps-empty="1"><td colspan="' + String(STEP_COLUMNS.length) + '">'
      + '还没有执行记录：任务卡开工后，这里逐行列出「谁做 / 多久 / 成败 / 产出 / 证据」。'
      + '</td></tr></tbody></table>'
  }
  return '<table class="dsh-pm-report-table" data-step-table="1">' + head + '<tbody>'
    + steps.map(s => stepRowHtml(s, titleById)).join('') + '</tbody></table>'
}

/* ────────────────────────────────────────────────────────────── 面板渲染 */

/** 面板正文（纯函数返回 HTML 字符串；不取数、不碰 DOM）。 */
function renderDagPanel(data: unknown, ctx: ReportTabCtx): string {
  const open = '<section class="dsh-pm-report-dag" data-panel="dag" data-dag-tab="1">'
  if (!isDagResponse(data)) {
    return open + '<div class="dsh-pm-empty" data-dag-shape="unexpected">'
      + 'DAG 数据形状不符（缺 tasks / steps 数组）：本 Tab 不编造图形与执行结果，请重试该 Tab 的取数。'
      + '</div></section>'
  }
  const tasks = data.tasks
  const steps = data.steps
  return open
    + canvasHostHtml(ctx)
    + summaryHtml(tasks)
    + '<h3 class="dsh-pm-report-sec-title" data-dag-steps-title="1">每步执行结果（'
    + String(steps.length) + ' 次执行）</h3>'
    + stepsTableHtml(steps, tasks)
    + '</section>'
}

export const dagPanel: ReportTabDef = {
  key: 'dag',
  label: 'DAG',
  badge: () => undefined,
  render: (data, ctx) => renderDagPanel(data, ctx),
}
