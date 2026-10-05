/**
 * 「🪙 Token」面板渲染（REQ-a33899 t6 → REQ-261004222448-292a t-f62af2 重做主视图）——纯渲染。
 *
 * 读法（FR-10）：**以「阶段」为主视图**回答「每个阶段花了多少」——
 *   ① 按阶段八列：阶段 / 调用 / 输入 / 输出 / 合计 / 占比 / **每次调用均** / **缓存命中率**；
 *   ② 再往下钻：阶段 → 任务执行（`byStage[].executions`，**直接铺开**，不做点开才显示的开关）；
 *   ③ 再往上汇总：本条合计 + 墙钟 / 窗口数 / 轮次 / 零产出执行（**响应里有才渲染**）；
 *   ④ 可优化点：`title/basis/suggestion` **逐字来自服务端**——本面板不自己编建议；
 *   ⑤ 可得性三态：`full` / `partial`（「部分数据（下界）」+ 缺哪段）/ `none`（「无 token 快照」，
 *      该态**不画零值表、不写汇总**——缺失不等于 0）。
 *
 * 为什么把固定系统提示词块从这里**移出**：那块回答的是「agent 怎么跑的」（FR-9 · 提示词 Tab），
 * 同一段正文不该在两个 Tab 各出现一次（FR-11 #2）。留在这里的是**花费**：阶段表 + 注入提示词成本
 * （成本是花费，不是留痕）。
 *
 * 两种入口共用一套渲染：`renderTokenTab`（旧详情页 Token Tab，吃 `RequirementTokenView`）与
 * `renderTokenPanel`（新壳 `panels/token.ts`，吃 `unknown`，先过形状守卫）。
 * 为什么共用一个实现：两条路径若各写一份「按阶段」表，两份的占比分母/命中率口径迟早会分叉。
 *
 * 纪律：用户可见文本一律经 esc() 转义；缺失语义是「无快照 / 不可得」，**绝不渲染 0 冒充**；
 * 不出现内层滚动（产物里不写 `overflow: auto|scroll`——FR-11 #7）。
 *
 * @module dsh-pmboard/client/token-info
 */
import { esc } from './html.js'
import {
  addBuckets,
  emptyBuckets,
  fmtCny,
  fmtTokens,
  totalTokens,
  type TokenAvailability,
  type TokenBuckets,
  type TokenOptimization,
} from '../shared/protocol.js'
import { fmtDur, fmtTime } from './render/dom-utils.js'

/* ──────────────────────────────────────────────────────── 阶段标签 */

const STAGE_LABEL: Record<string, string> = {
  draft: '📝 立项',
  brainstorming: '🔍 需求分析',
  design: '🧩 设计',
  decomposing: '🪓 拆分',
  implementing: '🔨 实施',
  accepting: '✅ 验收',
  archived: '📦 归档',
  done: '✅ 完成', // legacy 过渡态：done 但未 archived（2026-09-21 前误标为「验收」，与 accepting 撞名）
}

function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? stage
}

/* ──────────────────────────────────────────────────────── 宽形状（载荷可能是 unknown） */

/**
 * 一行输入（**宽形状**）：`TokenStageRow` 的平铺列与 `RequirementTokenStageRow` 的
 * 桶/执行下钻都在同一行上（服务端 `mergeTokenExtension` 是「就地加列」，不是换表）。
 * 字段全用 `unknown`：面板拿到的是 `unknown`，逐字段判型比 `as` 断言安全。
 */
export interface TokenRowInput {
  stage?: unknown
  calls?: unknown
  inputTokens?: unknown
  outputTokens?: unknown
  cacheReadTokens?: unknown
  totalTokens?: unknown
  sharePct?: unknown
  perCallTokens?: unknown
  cacheHitPct?: unknown
  buckets?: unknown
  executions?: unknown
}

/** 面板可接受的载荷（`RequirementTokenView` + 扩展段 + 可选上卷字段，全部可缺）。 */
export interface TokenPanelView {
  requirementId?: string
  byStage?: readonly TokenRowInput[]
  /**
   * 既有：需求级四桶合计。**本面板不再单独渲染它**——按阶段表尾的「合计（本条）」就是同一个数，
   * 同一个数字在一屏里出现两次会被读成两个口径（FR-11 #2）。字段留着只为类型相容。
   */
  totals?: TokenBuckets
  costEstimateCny?: number
  /** true = 存在不可得快照（合计不含缺失段 = 下界） */
  degraded?: boolean
  /**
   * 既有：固定系统提示词成本。**本面板不再渲染**（迁到提示词 Tab）——字段留着只为
   * 「旧字段照旧能传进来」的类型相容，不读它就不会有第二个渲染源。
   */
  systemPrompt?: unknown
  /** 既有：注入提示词成本（本面板保留：它是花费，不是留痕） */
  injections?: unknown
  availability?: TokenAvailability
  optimizations?: readonly TokenOptimization[]
  missingStages?: readonly string[]
  boundsAreLowerBound?: boolean
  /** 扩展段未装配时服务端给的人话（照实显示，不自己编） */
  unavailableNote?: string
  /** 上卷可选字段：响应里没有就不渲染（本面板不自己算这些数） */
  wallClockMs?: number
  windowCount?: number
  turns?: number
  zeroOutputRuns?: number
}

/* ──────────────────────────────────────────────────────── 小工具 */

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
}

function readNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function readStr(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

/** 两位小数（与 `QueryToken` 的展示口径同精度）。 */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** 百分比显示：整数不带小数点，非整数最多两位（**不四舍五入到整数**——那会把 99.99 说成 100）。 */
function fmtPct(n: number): string {
  return String(round2(n)) + '%'
}

/** 进度条宽度：夹在 0..100，避免脏数据把条撑出格子。 */
function pctWidth(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)))
}

/** token 数 → 文本；`undefined` = 不可算（渲染「—」，不是 0）。 */
function fmtTok(v: number | undefined): string {
  return v === undefined ? '—' : esc(fmtTokens(v))
}

function readBuckets(v: unknown): TokenBuckets | undefined {
  const o = asRecord(v)
  if (o === undefined) return undefined
  const uncached = readNum(o.uncachedInputTokens)
  const output = readNum(o.outputTokens)
  const cacheRead = readNum(o.cacheReadTokens)
  const cacheWrite = readNum(o.cacheWriteTokens)
  if (uncached === undefined || output === undefined || cacheRead === undefined || cacheWrite === undefined) return undefined
  return { uncachedInputTokens: uncached, outputTokens: output, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite }
}

/** 快照一句摘要（执行行的悬停 title 用）；不可得就说不可得，不猜数字。 */
function snapshotHint(raw: unknown): string {
  const o = asRecord(raw)
  if (o === undefined) return '无快照'
  if (readStr(o.source) === 'unavailable') return '无快照（当时未取到会话投影）'
  const b = readBuckets(o.totals)
  if (b === undefined) return '无快照'
  return `未缓存输入 ${fmtTokens(b.uncachedInputTokens)} · 输出 ${fmtTokens(b.outputTokens)} · 缓存读 ${fmtTokens(b.cacheReadTokens)}`
}

/* ──────────────────────────────────────────────────────── 归一化：宽形状 → 算得出来的行 */

/** 任务执行下钻的一行。 */
interface TokenExecutionView {
  taskId: string
  title: string
  status: string
  /** 本次执行消耗（两端快照差值）；undefined = 不可算（不补 0） */
  total?: number
  /** 悬停说明（快照来源/缺失原因） */
  note: string
}

/**
 * 归一化后的一行（判别联合：**有记录**的行八列都算得出来，**无记录**的行连数字都没有）。
 * 为什么不用「可选字段 + 默认 0」：那正是 FR-12 要消灭的东西——`totalTokens?: number` 配上
 * `?? 0` 会让「不可得」在产物里变成一个真的 0。判别联合让「没有数字」在类型上就无法被当数字用。
 */
interface TokenRowBase {
  stage: string
  executions: TokenExecutionView[]
}

/** 有 token 记录：算不出来的列是 `undefined`（渲染「—」），**绝不补 0**。 */
interface TokenDataRow extends TokenRowBase {
  kind: 'data'
  totalTokens: number
  calls: number
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  sharePct?: number
  perCallTokens?: number
  cacheHitPct?: number
  /** 未缓存输入（表尾缓存命中率的加权汇总要用它；缺快照阶段缺席） */
  uncachedInputTokens?: number
}

/** 该阶段没有任何 token 记录（≠ 花了 0）：如实标「无快照」。 */
interface TokenNoSnapRow extends TokenRowBase {
  kind: 'nosnap'
}

type TokenRow = TokenDataRow | TokenNoSnapRow

function isDataRow(row: TokenRow): row is TokenDataRow {
  return row.kind === 'data'
}

function normalizeExecutions(raw: unknown): TokenExecutionView[] {
  if (!Array.isArray(raw)) return []
  const out: TokenExecutionView[] = []
  for (const item of raw) {
    const o = asRecord(item)
    if (o === undefined) continue
    const taskId = readStr(o.taskId)
    if (taskId === undefined || taskId.length === 0) continue
    const delta = readBuckets(o.delta)
    out.push({
      taskId,
      title: readStr(o.title) ?? '',
      status: readStr(o.status) ?? '',
      ...(delta === undefined ? {} : { total: totalTokens(delta) }),
      note: delta === undefined
        ? '本次无快照（两端快照不可得，消耗不可算——不补 0）'
        : `${snapshotHint(o.start)} → ${snapshotHint(o.end)}`,
    })
  }
  return out
}

/**
 * 一行 → 归一化行。
 *
 * 平铺列（`calls/perCallTokens/cacheHitPct`…）在场就用服务端的值（聚合归服务端，FR-11 #9）；
 * 不在场（扩展段未合并进基础行）就**从快照桶现算**——这不是"前端自己编数"，
 * 而是同一口径（缓存命中率 = 缓存读 ÷（缓存读 + 未缓存输入），与 `QueryToken` 逐字一致）。
 */
function normalizeRow(raw: unknown): TokenRow | undefined {
  const o = asRecord(raw)
  if (o === undefined) return undefined
  const stage = readStr(o.stage)
  if (stage === undefined || stage.length === 0) return undefined

  const executions = normalizeExecutions(o.executions)
  const buckets = readBuckets(o.buckets)
  const deltas = Array.isArray(o.executions)
    ? (o.executions.map(e => readBuckets(asRecord(e)?.delta)).filter((b): b is TokenBuckets => b !== undefined))
    : []
  // 节点差值优先；节点无快照但有执行差值 → 用执行差值（与 assembleRequirementToken 同一口径）
  const eff = buckets ?? (deltas.length > 0 ? deltas.reduce(addBuckets, emptyBuckets()) : undefined)
  const total = readNum(o.totalTokens) ?? (eff === undefined ? undefined : totalTokens(eff))
  // 既无节点快照、也无执行差值 → 该阶段没有任何可算的记录（≠ 0）
  if (total === undefined) return { stage, kind: 'nosnap', executions }

  const calls = readNum(o.calls) ?? Math.max(1, executions.length)
  const input = readNum(o.inputTokens) ?? (eff === undefined ? undefined : eff.uncachedInputTokens + eff.cacheWriteTokens)
  const output = readNum(o.outputTokens) ?? eff?.outputTokens
  const cacheRead = readNum(o.cacheReadTokens) ?? eff?.cacheReadTokens
  const perCall = readNum(o.perCallTokens) ?? (calls > 0 ? Math.round(total / calls) : undefined)
  const denom = eff === undefined ? undefined : eff.cacheReadTokens + eff.uncachedInputTokens
  const derivedHit = denom !== undefined && denom > 0 && eff !== undefined
    ? round2((eff.cacheReadTokens / denom) * 100)
    : undefined
  const cacheHit = readNum(o.cacheHitPct) ?? derivedHit

  return {
    stage,
    kind: 'data',
    calls,
    totalTokens: total,
    ...(input === undefined ? {} : { inputTokens: input }),
    ...(output === undefined ? {} : { outputTokens: output }),
    ...(cacheRead === undefined ? {} : { cacheReadTokens: cacheRead }),
    ...(cacheHit === undefined ? {} : { cacheHitPct: cacheHit }),
    ...(perCall === undefined ? {} : { perCallTokens: perCall }),
    ...(eff === undefined ? {} : { uncachedInputTokens: eff.uncachedInputTokens }),
    ...(readNum(o.sharePct) === undefined ? {} : { sharePct: readNum(o.sharePct) }),
    executions,
  }
}

/**
 * 行集归一化 + **占比回填**。
 *
 * 服务端给齐了每行 `sharePct` 就用它的（单一事实源）；**有任何一行缺**就整列重算——
 * 混着用会让「占比合计」既不等于服务端的 100、也不等于本表的行合计（对不上账的表比没有表更坏）。
 */
function normalizeRows(raw: readonly TokenRowInput[] | undefined): TokenRow[] {
  const rows: TokenRow[] = []
  for (const item of raw ?? []) {
    const row = normalizeRow(item)
    if (row !== undefined) rows.push(row)
  }
  const known = rows.filter(isDataRow)
  const allHaveShare = known.length > 0 && known.every(r => r.sharePct !== undefined)
  if (!allHaveShare) {
    const grand = known.reduce((n, r) => n + r.totalTokens, 0)
    for (const r of known) {
      r.sharePct = grand > 0 ? round2((r.totalTokens / grand) * 100) : undefined
    }
  }
  return rows
}

/**
 * 三态判定。
 *
 * 载荷没给 `availability`（旧端点 / 测试桩）时**不假装"齐"**：有记录按「部分数据（下界）」说，
 * 无记录按「无快照」说——"不知道齐不齐"按下界报，是唯一不会过度承诺的说法。
 */
function availabilityOf(view: TokenPanelView, rows: readonly TokenRow[]): TokenAvailability {
  const a = view.availability
  if (a === 'full' || a === 'partial' || a === 'none') return a
  return rows.some(r => r.kind === 'data') ? 'partial' : 'none'
}

/* ──────────────────────────────────────────────────────── 注入提示词成本（保留块） */

interface InjectionItemView { at: number; routeKey: string; fragmentIds: string[]; chars: number; estTokens: number }
interface InjectionStageView { name: string; estTokens: number }
interface InjectionBlockView {
  count: number
  chars: number
  estTokens: number
  sharePct?: number
  byStage: InjectionStageView[]
  items: InjectionItemView[]
}

function normalizeInjectionCost(raw: unknown): InjectionBlockView | undefined {
  const o = asRecord(raw)
  if (o === undefined) return undefined
  const count = readNum(o.count)
  if (count === undefined) return undefined
  const stageList = Array.isArray(o.byStage) ? o.byStage : []
  const itemList = Array.isArray(o.items) ? o.items : []
  const share = readNum(o.sharePct)
  return {
    count,
    chars: readNum(o.chars) ?? 0,
    estTokens: readNum(o.estTokens) ?? 0,
    ...(share === undefined ? {} : { sharePct: share }),
    byStage: stageList.flatMap((s) => {
      const so = asRecord(s)
      const name = readStr(so?.name)
      return name === undefined ? [] : [{ name, estTokens: readNum(so?.estTokens) ?? 0 }]
    }),
    items: itemList.flatMap((i) => {
      const io = asRecord(i)
      if (io === undefined) return []
      const routeKey = readStr(io.routeKey)
      if (routeKey === undefined) return []
      return [{
        at: readNum(io.at) ?? 0,
        routeKey,
        fragmentIds: Array.isArray(io.fragmentIds) ? io.fragmentIds.filter((x): x is string => typeof x === 'string') : [],
        chars: readNum(io.chars) ?? 0,
        estTokens: readNum(io.estTokens) ?? 0,
      }]
    }),
  }
}

/* ──────────────────────────────────────────────────────── 渲染 */

/** 三态徽标（`none` 时说「无 token 快照」；`partial` 时**必须**列出缺哪段）。 */
function renderAvailability(a: TokenAvailability, view: TokenPanelView): string {
  if (a === 'none') {
    return '<div class="dsh-pm-callout" data-availability-badge="none">无 token 快照（完全不可得）</div>'
  }
  if (a === 'partial') {
    const missing = view.missingStages ?? []
    const which = missing.length > 0
      ? missing.map(s => stageLabel(s)).join('、')
      : (view.degraded === true ? '执行级快照缺口（任务执行行标「本次无快照」）' : '部分阶段（服务端未列出具体是哪几段）')
    return '<div class="dsh-pm-callout" data-availability-badge="partial">部分数据（下界）：'
      + esc(which) + ' 的 token 快照不可得，这些阶段的消耗没进合计——**合计因此是下界**。</div>'
  }
  return '<div class="dsh-pm-tok-avail" data-availability-badge="full">快照齐：各阶段都取到了会话快照，合计即全量。</div>'
}

/** 口径说明（既有能力，三要素必须在：含子代理 / 预算闸不含 / 上线前历史不含）。 */
function renderCallout(view: TokenPanelView): string {
  const degraded = view.degraded
    ? ' 部分节点/执行无快照（人从看板点按钮推进或投影不可得），缺失段不计入合计。'
    : ''
  return '<div class="dsh-pm-callout">口径（REQ-261004154937-2ca3 起）：按执行该节点/任务的会话累计值差值统计，'
    + '**含子代理**（该窗口派出去的子代理会话一并计入），也可能含同会话其他工作的消耗；'
    + '**起链预算闸不含子代理**（闸门口径另议，两者不一致是已知的）；'
    + '**本口径上线前的历史数字不含子代理**；费用与字符折算 token 均为**估算**；'
    + '缺失显示「无快照」，不补 0。' + degraded + '</div>'
}

/** 阶段行的任务执行下钻（直接铺开：折叠开关要靠 JS 接线，而这里没有 JS）。 */
function renderExecutionRows(row: TokenRow): string {
  return row.executions.map(e => '<tr class="dsh-pm-tok-sub" data-stage-exec="1" data-parent-stage="' + esc(row.stage) + '">'
    + '<td colspan="8" title="' + esc(e.note) + '">' + esc(e.taskId) + ' ' + esc(e.title)
    + '<span class="dsh-pm-tok-sub-num">' + (e.total === undefined ? '本次无快照' : esc(fmtTokens(e.total))) + '</span></td></tr>').join('')
}

function renderStageRow(row: TokenRow): string {
  const label = esc(stageLabel(row.stage))
  if (row.kind === 'nosnap') {
    return '<tr class="dsh-pm-tok-node" data-stage-row="1" data-stage="' + esc(row.stage) + '" data-has-data="0">'
      + '<td>' + label + ' <span class="dsh-pm-tok-more">无快照</span></td>'
      + '<td class="dsh-pm-nosnap">—</td><td class="dsh-pm-nosnap">无快照</td><td class="dsh-pm-nosnap">无快照</td>'
      + '<td class="dsh-pm-nosnap">无快照</td><td class="dsh-pm-nosnap">—</td>'
      + '<td class="dsh-pm-nosnap">—</td><td class="dsh-pm-nosnap">—</td></tr>'
      + renderExecutionRows(row)
  }
  const pct = row.sharePct
  const shareCell = pct === undefined
    ? '—'
    : '<span class="dsh-pm-bar"><i style="width:' + esc(String(pctWidth(pct))) + '%"></i></span> ' + esc(fmtPct(pct))
  return '<tr class="dsh-pm-tok-node" data-stage-row="1" data-stage="' + esc(row.stage) + '" data-has-data="1"'
    + ' data-total-tokens="' + esc(String(row.totalTokens)) + '"'
    + ' data-share-pct="' + esc(String(pct ?? '')) + '"'
    + ' data-calls="' + esc(String(row.calls ?? '')) + '"'
    + ' data-per-call="' + esc(String(row.perCallTokens ?? '')) + '"'
    + ' data-cache-hit="' + esc(String(row.cacheHitPct ?? '')) + '">'
    + '<td>' + label + '</td>'
    + '<td>' + esc(String(row.calls)) + '</td>'
    + '<td>' + fmtTok(row.inputTokens) + '</td>'
    + '<td>' + fmtTok(row.outputTokens) + '</td>'
    + '<td>' + fmtTok(row.totalTokens) + '</td>'
    + '<td>' + shareCell + '</td>'
    + '<td>' + fmtTok(row.perCallTokens) + '</td>'
    + '<td>' + (row.cacheHitPct === undefined ? '—' : esc(fmtPct(row.cacheHitPct))) + '</td>'
    + '</tr>'
    + renderExecutionRows(row)
}

/** 表尾「合计（本条）」：占比合计与行合计同源，二者必然对得上（这正是「占比合计 == 总计」）。 */
function renderTotalRow(rows: readonly TokenRow[]): string {
  const known = rows.filter(isDataRow)
  const sum = (pick: (r: TokenDataRow) => number | undefined): number => known.reduce((n, r) => n + (pick(r) ?? 0), 0)
  const calls = sum(r => r.calls)
  const input = sum(r => r.inputTokens)
  const output = sum(r => r.outputTokens)
  const total = sum(r => r.totalTokens)
  const shareSum = known.length > 0 && known.every(r => r.sharePct !== undefined) ? sum(r => r.sharePct) : undefined
  const perCall = calls > 0 ? Math.round(total / calls) : undefined
  const hasBucketsEverywhere = known.length > 0 && known.every(r => r.uncachedInputTokens !== undefined)
  const uncached = hasBucketsEverywhere ? sum(r => r.uncachedInputTokens) : undefined
  const cacheRead = hasBucketsEverywhere ? sum(r => r.cacheReadTokens) : undefined
  const hit = uncached !== undefined && cacheRead !== undefined && uncached + cacheRead > 0
    ? round2((cacheRead / (cacheRead + uncached)) * 100)
    : undefined
  // 一行记录都没有时不写 data-total-tokens（那个 0 是「合计未知」的 0，正是 FR-12 禁的那种 0 冒充）
  return '<tr class="dsh-pm-tok-total" data-total-row="1"'
    + (known.length === 0 ? '' : ' data-total-tokens="' + esc(String(total)) + '"')
    + (shareSum === undefined ? '' : ' data-share-sum="' + esc(String(round2(shareSum))) + '"') + '>'
    + '<td>合计（本条）</td>'
    + '<td>' + (known.length === 0 ? '—' : esc(String(calls))) + '</td>'
    + '<td>' + (known.length === 0 ? '—' : esc(fmtTokens(input))) + '</td>'
    + '<td>' + (known.length === 0 ? '—' : esc(fmtTokens(output))) + '</td>'
    + '<td>' + (known.length === 0 ? '—' : esc(fmtTokens(total))) + '</td>'
    + '<td>' + (shareSum === undefined ? '—' : esc(fmtPct(shareSum))) + '</td>'
    + '<td>' + (perCall === undefined ? '—' : esc(fmtTokens(perCall))) + '</td>'
    + '<td>' + (hit === undefined ? '—' : esc(fmtPct(hit))) + '</td>'
    + '</tr>'
}

function renderStageTable(rows: readonly TokenRow[]): string {
  return '<table class="dsh-pm-tok-table" data-stage-table="1">'
    + '<thead><tr><th>阶段</th><th>调用</th><th>输入</th><th>输出</th><th>合计</th><th>占比</th>'
    + '<th>每次调用均</th><th>缓存命中率</th></tr></thead>'
    + '<tbody>' + rows.map(renderStageRow).join('') + renderTotalRow(rows) + '</tbody></table>'
}

/** 可优化点：**逐字渲染服务端给的 title/basis/suggestion**，本面板不新增/改写建议。 */
function renderOptimizations(list: readonly TokenOptimization[] | undefined): string {
  const head = '<h4 class="dsh-pm-tok-h">💡 可优化点'
    + '<span class="dsh-pm-tok-h-note">自动推导：每条都带依据数字；本面板不自己编建议</span></h4>'
  if (list === undefined) {
    return head + '<div class="dsh-pm-empty" data-opt-empty="1">本次响应没有可优化点段（服务端未装配扩展查询）——没有依据就不给建议。</div>'
  }
  if (list.length === 0) {
    return head + '<div class="dsh-pm-empty" data-opt-empty="1">没有可行动的优化点：没有依据就不给建议（「没建议」≠「没问题」）。</div>'
  }
  const items = list.map((o) => {
    // 依据里必须能核到数字（FR-10 判定④）。服务端漏了数字时**如实标出**，而不是替它编一个。
    const noDigit = !/\d/.test(o.basis)
    return '<div class="dsh-pm-opt" data-opt="1">'
      + '<div class="dsh-pm-opt-title">' + esc(o.title) + '</div>'
      + '<div class="dsh-pm-opt-basis">依据：' + esc(o.basis) + '</div>'
      + '<div class="dsh-pm-opt-sug">建议：' + esc(o.suggestion) + '</div>'
      + (noDigit ? '<div class="dsh-pm-note" data-opt-nodigit="1">本条依据未含数字（服务端缺陷，页面照实标出）。</div>' : '')
      + '</div>'
  }).join('')
  return head + '<div class="dsh-pm-opt-list">' + items + '</div>'
}

/** 再往上汇总：本条合计 + 墙钟 / 窗口数 / 轮次 / 零产出（**响应里有才渲染**）。 */
function renderRollup(view: TokenPanelView, rows: readonly TokenRow[]): string {
  const known = rows.filter(isDataRow)
  const total = known.reduce((n, r) => n + r.totalTokens, 0)
  const cells: string[] = [
    '本条合计 <b>' + esc(fmtTokens(total)) + '</b> tokens（' + esc(String(known.length)) + ' 个阶段有记录）',
    '费用估算 <b>' + esc(fmtCny(view.costEstimateCny)) + '</b>（估算，非账单）',
  ]
  const missingExtras: string[] = []
  if (view.wallClockMs === undefined) missingExtras.push('墙钟')
  else cells.push('墙钟 <b>' + esc(fmtDur(view.wallClockMs)) + '</b>')
  if (view.windowCount === undefined) missingExtras.push('窗口数')
  else cells.push('窗口数 <b>' + esc(String(view.windowCount)) + '</b>')
  if (view.turns === undefined) missingExtras.push('轮次')
  else cells.push('轮次 <b>' + esc(String(view.turns)) + '</b>')
  if (view.zeroOutputRuns === undefined) missingExtras.push('零产出执行')
  else cells.push('零产出执行 <b>' + esc(String(view.zeroOutputRuns)) + '</b>')
  const note = missingExtras.length === 0
    ? ''
    : '<div class="dsh-pm-note">未给出的项（' + esc(missingExtras.join(' / ')) + '）不渲染：本面板不自己算这些数。</div>'
  return '<div class="dsh-pm-sum" data-rollup="1">' + cells.map(c => '<span>' + c + '</span>').join('') + '</div>' + note
}

/** 注入提示词成本（既有能力保留）：聚合 + 每次注入的命中片段（**不含正文**，正文在提示词 Tab）。 */
function renderInjections(cost: InjectionBlockView | undefined): string {
  if (cost === undefined) {
    return '<details class="dsh-pm-fold"><summary>💉 注入提示词成本<span class="dsh-pm-fold-count">未提供</span></summary>'
      + '<div class="dsh-pm-fold-body"><div class="dsh-pm-empty">本次响应没有注入成本段（服务端未给 injections）——不编数字。</div></div></details>'
  }
  if (cost.count === 0) {
    return '<details class="dsh-pm-fold"><summary>💉 注入提示词成本<span class="dsh-pm-fold-count">无记录</span></summary>'
      + '<div class="dsh-pm-fold-body"><div class="dsh-pm-empty">本需求窗口暂无注入留痕（或无可匹配窗口，不做张冠李戴的归因）。</div></div></details>'
  }
  const share = cost.sharePct !== undefined ? ' · 占本需求 ' + esc(String(cost.sharePct)) + '%' : ''
  const max = Math.max(...cost.byStage.map(x => x.estTokens), 1)
  const bars = cost.byStage.map((s) => {
    const w = Math.round((s.estTokens / max) * 100)
    return '<div class="dsh-pm-impact-row"><span class="dsh-pm-impact-name">' + esc(stageLabel(s.name)) + '</span>'
      + '<span class="dsh-pm-impact-bar"><i style="width:' + esc(String(w)) + '%"></i></span>'
      + '<span class="dsh-pm-impact-val">' + esc(fmtTokens(s.estTokens)) + '</span></div>'
  }).join('')
  const items = cost.items.map(it => '<details class="dsh-pm-prompt"><summary>'
    + '<span class="dsh-pm-prompt-name">' + esc(fmtTime(it.at)) + ' · ' + esc(it.routeKey) + '</span>'
    + '<span class="dsh-pm-prompt-meta">' + esc(String(it.chars)) + ' 字符 · ' + esc(fmtTokens(it.estTokens)) + '</span></summary>'
    + '<div class="dsh-pm-note">命中片段：' + (esc(it.fragmentIds.join(', ')) || '—') + '</div></details>').join('')
  return '<details class="dsh-pm-fold"><summary>💉 注入提示词成本<span class="dsh-pm-fold-count">'
    + esc(String(cost.count)) + ' 次 · ' + esc(fmtTokens(cost.estTokens)) + '（估算）' + share + '</span></summary>'
    + '<div class="dsh-pm-fold-body">'
    + '<div class="dsh-pm-sum"><span>注入次数：<b>' + esc(String(cost.count)) + '</b></span>'
    + '<span>累计字符：<b>' + esc(String(cost.chars)) + '</b></span>'
    + '<span>估算 Token：<b>' + esc(fmtTokens(cost.estTokens)) + '</b></span>' + share + '</div>'
    + bars + '<div class="dsh-pm-note">明细（每次注入的命中片段；正文与后果在「🧱 提示词」Tab）：</div>' + items + '</div></details>'
}

/* ──────────────────────────────────────────────────────── 入口 */

/** 三态 = none 时的整块空态：**不画表、不画汇总**（画出来只会是一堆 0）。 */
function renderNoneBody(view: TokenPanelView): string {
  const note = view.unavailableNote !== undefined && view.unavailableNote.length > 0
    ? '（' + esc(view.unavailableNote) + '）'
    : ''
  return '<div class="dsh-pm-empty" data-token-none="1">这条需求没有可算的 token 快照' + note
    + '：快照未采集（需求早于该功能，或推进时投影不可得）。'
    + '缺失就是缺失——本面板不画零值表、不用零冒充总量。</div>'
}

/** 面板正文（两条入口共用；形状已归一化）。 */
function renderPanelBody(view: TokenPanelView): string {
  const rows = normalizeRows(view.byStage)
  const availability = availabilityOf(view, rows)
  const inner: string[] = [renderAvailability(availability, view)]
  if (availability === 'none') {
    // 不可得态：**不画任何表格与汇总**——画出来只会是一堆 0，而 0 在这里是撒谎。
    // 口径说明仍要留：它说的是「这些数怎么来的」，与"这次有没有数"是两件事
    // （REQ-261004154937-2ca3 FR-4 的判定就钉在这三句上，不可得态更该说清楚）。
    inner.push(renderNoneBody(view))
    inner.push(renderCallout(view))
  } else {
    inner.push(renderCallout(view))
    inner.push('<h4 class="dsh-pm-tok-h">📊 按阶段'
      + '<span class="dsh-pm-tok-h-note">每个阶段花了多少：调用 / 输入 / 输出 / 合计 / 占比 / 每次调用均 / 缓存命中率</span></h4>')
    inner.push(renderStageTable(rows))
    inner.push('<div class="dsh-pm-note">「无快照」= 该阶段没有可算的 token 记录（尚未进入，或推进时未取到会话快照）；'
      + '如实标注，不补 0。阶段行下面的灰行是该阶段的任务执行（直接铺开，不折叠）。</div>')
    inner.push(renderOptimizations(view.optimizations))
    inner.push(renderRollup(view, rows))
    inner.push(renderInjections(normalizeInjectionCost(view.injections)))
  }
  return '<div class="dsh-pm-token-panel" data-panel="token" data-availability="' + availability + '"'
    // 间距用 `em` 不用 `px`：`10px` 会在产物里带一个与数据无关的 0，
    // 而不可得态的机械断言（无 0 值单元格 / 无「0 条|0 次」）读的就是这段产物——
    // 别让本页自己的样式往里塞 0（口径说明里的 REQ 编号是另一回事，那是出处、不是数值）。
    + ' style="display:flex;flex-direction:column;gap:1em">' + inner.join('') + '</div>'
}

/**
 * 新壳面板入口（`panels/token.ts` 的 `render`）：载荷是 `unknown`，先过形状守卫。
 *
 * 形状不认识时**不画空表**（空表会被读成「确实没花」）：给一句人话，
 * 并带上 `data-panel-placeholder` —— 与需求页壳的桩契约同名同义（「这块还没有真内容」）。
 */
export function renderTokenPanel(data: unknown): string {
  const o = asRecord(data)
  if (o === undefined || !Array.isArray(o.byStage)) {
    return '<div class="dsh-pm-token-panel" data-panel="token" data-panel-placeholder="token">'
      + '<div class="dsh-pm-empty">Token 载荷形状不识别（缺 byStage 行数组）——不画空表冒充「没有消耗」。</div></div>'
  }
  const view: TokenPanelView = {
    byStage: o.byStage as readonly TokenRowInput[],
    ...(readNum(o.costEstimateCny) === undefined ? {} : { costEstimateCny: readNum(o.costEstimateCny) }),
    ...(o.degraded === true ? { degraded: true } : {}),
    ...(readStr(o.availability) === 'full' || readStr(o.availability) === 'partial' || readStr(o.availability) === 'none'
      ? { availability: readStr(o.availability) as TokenAvailability }
      : {}),
    ...(Array.isArray(o.optimizations) ? { optimizations: readOptimizations(o.optimizations) } : {}),
    ...(Array.isArray(o.missingStages)
      ? { missingStages: o.missingStages.filter((x): x is string => typeof x === 'string') }
      : {}),
    ...(o.boundsAreLowerBound === true ? { boundsAreLowerBound: true } : {}),
    ...(readStr(o.unavailableNote) === undefined ? {} : { unavailableNote: readStr(o.unavailableNote) }),
    ...(readNum(o.wallClockMs) === undefined ? {} : { wallClockMs: readNum(o.wallClockMs) }),
    ...(readNum(o.windowCount) === undefined ? {} : { windowCount: readNum(o.windowCount) }),
    ...(readNum(o.turns) === undefined ? {} : { turns: readNum(o.turns) }),
    ...(readNum(o.zeroOutputRuns) === undefined ? {} : { zeroOutputRuns: readNum(o.zeroOutputRuns) }),
    systemPrompt: o.systemPrompt,
    injections: o.injections,
  }
  return renderPanelBody(view)
}

/** 优化点段归一化（缺 title 的条目丢掉：没有标题的建议读不出是什么）。 */
function readOptimizations(raw: readonly unknown[]): TokenOptimization[] {
  return raw.flatMap((item) => {
    const o = asRecord(item)
    const title = readStr(o?.title)
    if (title === undefined) return []
    return [{ title, basis: readStr(o?.basis) ?? '', suggestion: readStr(o?.suggestion) ?? '' }]
  })
}

/** 旧详情页 Token Tab 入口（`RequirementTokenView` 形状相容——扩展字段是可选加列）。 */
export function renderTokenTab(view: TokenPanelView): string {
  return renderPanelBody(view)
}

/** 加载中 / 失败的空态（不报错、不留白）。 */
export function renderTokenPlaceholder(text: string): string {
  return `<div class="dsh-pm-empty">${esc(text)}</div>`
}
