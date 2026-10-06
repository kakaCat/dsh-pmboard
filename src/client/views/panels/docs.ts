/**
 * 「文档」Tab 面板（REQ-261004222448-292a · FR-7 / FR-11 #7 / FR-12）——t-b9dd2c 实现 render。
 *
 * 三块合一（FR-7）：**确定文档清单** + **核验表** + **门禁裁决留痕**（外加归档）。
 * 七条纪律（改代码时必须保住）：
 *  ① **一律铺开、不做内层滚动**（FR-11 #7）：documents / generated / discovered / 验收单逐项 /
 *     六道门 / 归档清单全部逐行渲染，一个不省（`data-doc-row` 的条数**恒等于** `documents.length`
 *     ——这是"铺开"的机械判据）。本文件产出的字符串里不得出现 `overflow: auto|scroll`：
 *     长了就交给**页面**滚动。
 *  ①b **「确定文档」与「其它发现」是两件事**（验收现场逮到的"317 行倾倒"）：
 *     `documents` 只装人写的交付物（服务端白名单判定），自动扫描到的非交付物走 `discovered`
 *     ——**按类型分组的计数行 + 每类最多 3 个样例**，余量写成「其余 N 个同类，去文档目录查看」。
 *     不许把 `discovered` 折叠成不可数的一行，也不许给它内层滚动：读者要能数出"还有多少同类"。
 *  ② **正文点开才取**（FR-11 #8）：文档行只给路径 + `data-open-doc`，渲染时**不**取正文；
 *     点开由**壳**的委派接（`ReportTabsController.attach`：`[data-open-doc]` → `ctx.openDoc(path)`
 *     → open-doc → 官方右侧栏）。面板**故意不带** `data-action="open-doc"`：那条老链
 *     （board-mount 的 `case 'open-doc'`）与新壳的委派只能有一处接，两边都带会点一下开两次。
 *  ③ **禁留白**（FR-12）：四种文档状态、五种核验裁决、四种门禁结论各有说辞；
 *     没有验收单时给**解释性空态**而不是空表格；"未采集"绝不写成 `0`。
 *  ④ **生成物与人写的文档分开列**：`generated[]` 是台账/工具重建物（queue.json、rtm-*.yml），
 *     不是人交付的文档——混在一起会让"这份文档谁负责"变得不可回答。
 *  ⑤ 文档类型名走**唯一事实源** `shared/artifact-labels.ts`：面板的 8 个 kind 比产物的 10 个粗，
 *     本文件只做「面板 kind → 产物 kind」的**别名**（服务端映射是多对一，逆映射不可避免），
 *     中文名一律问那边要，绝不在这里再写一份中文映射表（那是 artifact-labels 模块头点名的
 *     六处漂移的老路）。
 *  ⑥ **原型在确定文档块内单列**（REQ-261005105032-3b02 决议 #30/#32/#34）：`kind === 'prototype'`
 *     的行（以及按路径兜底归组的旧 notes 行）连续排在非原型行之后，中间插一行组标
 *     （`data-doc-subhead="prototype"` + `data-proto-count`）。单列只是**分组**：原型行仍是
 *     `data-doc-row="1"` 的文档行（`data-doc-row` 条数 == `documents.length` 的判据不许破），
 *     点开正文仍走既有 `[data-open-doc]` 委派——不新增弹窗、不新增路由。
 *     「权威 / 被取代」不做本地判定：`prototypeRole` / `supersededBy` 由服务端读
 *     `prototypes/INDEX.md` 投影而来（本面板不做文件 IO），没给就如实说"未标权威角色"。
 *     原型判据只呈现**有/缺锚点**（`prototypeMeta.anchors` 的条数）：只显示存在性、不显示阈值，
 *     也不显示几何量（阈值由设计阶段定死、原型不自证，D-10 + 决议 #8/#49）；未采集时
 *     **不渲染这个标**（"未采集"与"采集到 0 条"必须可分辨），且不为此新增列/表。
 *
 * 为什么核验表照抄 `verification.ts` 的列而不是另设计一套：那七列
 * （标准 / 实际结果 / 来源（agent|human）/ 需人工（含原因）/ 证据 / 意见 / 裁决）是既有实现里
 * 最值钱的设计——人一眼看出"这条证据是 agent 自证还是人核的"。另造一套列 = 同一个事实两处定义，
 * 必然漂移（REQ-260922182638-0777 的教训）。
 *
 * 为什么根容器带 `data-panel="docs"`：壳的包装器只输出 `data-tab-host="docs"`（它不再代面板写
 * `data-panel`），面板根容器**自己**带 `data-panel="<key>"` 是六个面板的共同约定（trunk/dag/dialogue
 * 同款）——面板 render 是纯字符串、单测不经壳也直接调它（t15/t16 的断言就这样写），根容器自带
 * 这份属性，面板产物才"自足可断言"。形状不符的分支也必须带它（那时的 DOM 里仍然只有一个 docs 面板）。
 *
 * @module dsh-pmboard/client/views/panels/docs
 */
import { esc } from '../../html.js'
import { mdInline } from '../../render/md-inline.js'
import type { ReportTabCtx, ReportTabDef } from '../report-tabs.js'
import type {
  ArchiveDoc,
  ArchiveRecord,
  DocPanelEntry,
  DocPanelKind,
  DocPanelState,
  DocsResponse,
  GateVerdict,
  VerificationItem,
  VerificationSheet,
} from '../../../shared/protocol.js'
import { artifactKindLabel } from '../../../shared/artifact-labels.js'
import { fmtTime, windowCodeFromSessionId } from '../../render/dom-utils.js'
import { displayDocPath } from '../../open-doc.js'
// 说明书更新点的渲染复用归档区的**同一实现**（含 manualNote 分支），避免两处口径各自漂移。
import { renderManualUpdates } from '../verification.js'

/* ────────────────────────────────────────────────────────────── 载荷守卫 */

/**
 * 「这是文档面板的载荷吗」的**派发守卫**（不是严格校验器）。
 *
 * 为什么要有它：面板 render 收到的 `data` 是 `unknown`（壳只做了降级判别，见 report-tabs
 * `isDegrade`）。拿到形状不符的载荷（旧服务端 404 后中间层塞了别的东西 / 测试桩）时，
 * 若直接 `d.documents.map` 就会整块崩成"加载失败"，而真相是"这不是文档面板的数据"——
 * 两种"没有"必须分开（FR-12）。
 */
function asDocsResponse(value: unknown): DocsResponse | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const v = value as Partial<DocsResponse>
  if (!Array.isArray(v.documents) || !Array.isArray(v.generated) || !Array.isArray(v.gates)) return undefined
  return v as DocsResponse
}

/** 对象元素守卫：数组里混进非对象（运行时脏数据）→ 跳过，而不是在渲染路径上抛错整块白屏。 */
function asEntry(raw: unknown): DocPanelEntry | undefined {
  return raw !== null && typeof raw === 'object' ? (raw as DocPanelEntry) : undefined
}
function asItem(raw: unknown): VerificationItem | undefined {
  return raw !== null && typeof raw === 'object' ? (raw as VerificationItem) : undefined
}
function asGate(raw: unknown): GateVerdict | undefined {
  return raw !== null && typeof raw === 'object' ? (raw as GateVerdict) : undefined
}
function asGenerated(raw: unknown): DocsResponse['generated'][number] | undefined {
  return raw !== null && typeof raw === 'object' ? (raw as DocsResponse['generated'][number]) : undefined
}
/** 「其它发现」分组守卫：`kind` 必须是字符串（计数缺失时按 0 处理，不渲染 "NaN 个"）。 */
function asDiscoveredGroup(raw: unknown): { kind: string; count: number; samples: string[] } | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const g = raw as { kind?: unknown; count?: unknown; samples?: unknown }
  if (typeof g.kind !== 'string' || g.kind.length === 0) return undefined
  return {
    kind: g.kind,
    count: typeof g.count === 'number' ? g.count : 0,
    samples: Array.isArray(g.samples) ? (g.samples as string[]) : [],
  }
}
function asArchiveDoc(raw: unknown): ArchiveDoc | undefined {
  return raw !== null && typeof raw === 'object' ? (raw as ArchiveDoc) : undefined
}
function asAck(raw: unknown): { path: string; reason: string } | undefined {
  return raw !== null && typeof raw === 'object' ? (raw as { path: string; reason: string }) : undefined
}
function asString(raw: unknown): string | undefined {
  return typeof raw === 'string' ? raw : undefined
}

/** 逐元素收窄（非对象条目直接不产出，不崩）。 */
function coerceAll<T>(items: readonly unknown[], coerce: (raw: unknown) => T | undefined): T[] {
  const out: T[] = []
  for (const raw of items) {
    const v = coerce(raw)
    if (v !== undefined) out.push(v)
  }
  return out
}

/** 时间格：时间戳可能缺（台账旧记录）；缺了要有说辞，不渲染 "NaN-NaN"。 */
function timeOr(raw: unknown, fallback: string): string {
  return typeof raw === 'number' && Number.isFinite(raw)
    ? esc(fmtTime(raw))
    : '<span class="dsh-pm-hint">' + esc(fallback) + '</span>'
}

/* ────────────────────────────────────────────────────────────── 类型 / 状态文案 */

/**
 * 面板 kind → 产物 kind 的别名（服务端 `QueryDocs.PANEL_KIND` 是多对一的逆映射）：
 * `plan` 面板类同时装 decomposition 与 plan，`task-detail` 装 task_detail 与 task_output，
 * `notes` 是 archive/notes 的兜底类。别名之后中文名一律问 artifactKindLabel 要。
 * `prototype` 一对一（REQ-261005105032-3b02 决议 #30/#33：映射穷尽，中文名走 KIND_LABELS「原型」）。
 */
const KIND_ALIAS: Readonly<Record<DocPanelKind, string>> = {
  requirement: 'requirement',
  design: 'design',
  plan: 'decomposition',
  'task-detail': 'task_detail',
  verification: 'verification',
  retro: 'retro',
  notes: 'notes',
  prototype: 'prototype',
}
const ALIAS_BY_KIND: ReadonlyMap<string, string> = new Map(Object.entries(KIND_ALIAS))

/** 文档类型中文名：未知 kind 交给 artifactKindLabel 兜底（「产物（x）」），不留白、不裸显英文。 */
function kindLabel(kind: string): string {
  return artifactKindLabel(ALIAS_BY_KIND.get(kind) ?? kind)
}

/** 五种登记态的可读名（FR-12：逐态各有说法，一种都不许空着）。 */
const STATE_TEXT: Readonly<Record<DocPanelState, string>> = {
  confirmed: '已确认',
  pending: '待确认',
  unregistered: '未登记',
  'file-missing': '文件缺失',
  // REQ-261005143615-5ab1 FR-3：判不了 ≠ 缺失——文案必须能把两者读分开
  unknown: '未判定',
}

/** 五种状态各自的解释（"为什么是这个状态"），与 STATE_TEXT 一起进状态格。 */
const STATE_NOTE: Readonly<Record<DocPanelState, string>> = {
  confirmed: '人工已确认，可用',
  pending: '台账已登记，等人工确认',
  unregistered: '所属分类要求这份文档，台账里没有登记记录',
  'file-missing': '登记在案，但磁盘上找不到该文件',
  unknown: '读根不可得：这台机器上找不到该需求声明的工作区，判不了文件在不在',
}

/** 状态文案读取（运行时可能收到协议之外的新状态：如实写"未知"，不猜、不留白）。 */
function stateText(state: string): string {
  return (STATE_TEXT as Readonly<Record<string, string>>)[state] ?? ('未知状态：' + state)
}
function stateNote(state: string): string {
  return (STATE_NOTE as Readonly<Record<string, string>>)[state] ?? '台账给的状态值不在协议枚举里'
}

/** 核验项裁决文案（照 verification.ts 的既有措辞口径）。 */
const VERIFY_STATUS_TEXT: Readonly<Record<string, string>> = {
  pending: '待裁决',
  passed: '✅ 通过',
  failed: '✖ 不通过',
  not_verifiable: '不可验收',
  unverified: '未裁决',
}

/** 六道门（顺序 = 流水线顺序；与协议 / QueryDocs 的 GATES 同序）。 */
const GATE_ORDER: readonly GateVerdict['gate'][] = [
  'requirement', 'design', 'plan', 'implementation', 'verification', 'archive',
]

const GATE_LABEL: Readonly<Record<GateVerdict['gate'], string>> = {
  requirement: '需求确认',
  design: '设计确认',
  plan: '计划批准',
  implementation: '实施',
  verification: '验收',
  archive: '归档',
}

const VERDICT_TEXT: Readonly<Record<GateVerdict['verdict'], string>> = {
  passed: '✅ 通过',
  rejected: '✖ 退回',
  pending: '⏳ 挂起（待裁决）',
  'not-reached': '· 尚未走到该门',
}

/** 结论的默认解释：没有 `reason` 时也要有说辞（FR-12），`not-reached` 必须说清"还没到"。 */
const VERDICT_NOTE: Readonly<Record<GateVerdict['verdict'], string>> = {
  passed: '这道门已过（人工确认章在案）',
  rejected: '这道门被退回：理由见上方原文',
  pending: '这道门在等人：材料已到或产物已登记，缺一次人工确认',
  'not-reached': '尚未走到该门（流程还没到这一步，或该分类不走这道门）',
}

/** 确认方式的三种留痕 → 可读文案（`via` 缺省 = 台账没记方式：**不猜**）。 */
const VIA_TEXT: Readonly<Record<string, string>> = {
  dialog: '确认弹框（dialog）',
  board: '看板确认（board）',
  'evidence-text': '文字证据（evidence-text）',
}

/* ────────────────────────────────────────────────────────────── 小工具 */

/** ActorRef → 「谁批的」（含窗口码：审计要能追到具体会话）。 */
function actorText(by: GateVerdict['by']): string {
  if (by === undefined) return ''
  const kind = by.kind === 'human' ? '人（human）'
    : by.kind === 'agent' ? 'agent'
      : by.kind === 'system' ? '系统（system）' : ('未知操作者（' + String(by.kind) + '）')
  const sid = by.sessionId
  return sid === undefined || sid.length === 0 ? kind : kind + ' · ' + windowCodeFromSessionId(sid)
}

/**
 * 可点开的路径：**只**产出 `data-open-doc`（壳的 attach 委派把它接到 `ctx.openDoc`）。
 *
 * 为什么**不**带 `data-action="open-doc"`：老链（board-mount 的事件委派）与新壳的委派
 * 只允许一处接（report-tabs.ts 的 attach 注释写明了"两边都接会点一下开两次"）。
 *
 * REQ-261005143615-5ab1 FR-4：给了 `absPath` 就**显示并打开绝对路径**（含小字台账相对路径
 * 供对账）——绝对路径是服务端按需求自己的工作区算出来的，不再依赖"当前阅读会话"拼对。
 * 没给（旧服务端 / 未命中读根）时逐字回旧显示。
 */
function openablePath(path: string, absPath?: string): string {
  const shown = typeof absPath === 'string' && absPath.length > 0 ? absPath : path
  const rel = shown === path
    ? ''
    : '<span class="dsh-pm-hint" data-doc-relpath="' + esc(path) + '">台账路径：' + esc(path) + '</span>'
  return '<button type="button" class="dsh-pm-doc-path"'
    + ' data-open-doc="' + esc(shown) + '"'
    + ' title="点开正文：' + esc(displayDocPath(shown)) + '">' + esc(shown) + '</button>' + rel
}

/* ── FR-6 紧凑表（REQ-261006130057-7a43 t8）──────────────────────────────
   蓝本 = 原型 detail.html v1.5 #FR-6 文档面板：路径列是**纯文本**（等宽），
   打开入口收成独立的「打开」列（链接式小按钮）。两条规则：
   ① 路径格不再兼职按钮——一个可点入口一行一个（打开列），路径格只做显示与对账；
   ② 「打开」按钮仍是**同一个** `[data-open-doc]` 委派（壳 attach 唯一接点），
      不可开的两种状态（file-missing / unknown）给 disabled + 原因 title——
      不给假出口，也不留空格（FR-12）。 */

/** 台账相对路径小字（有 absPath 时留在路径格供对账）。 */
function relPathHint(path: string, shown: string): string {
  return shown === path
    ? ''
    : '<span class="dsh-pm-hint" data-doc-relpath="' + esc(path) + '">台账路径：' + esc(path) + '</span>'
}

/** 纯文本路径格（等宽、可折行）：打开不在这格发生。 */
function plainDocPath(path: string, absPath?: string): string {
  const shown = typeof absPath === 'string' && absPath.length > 0 ? absPath : path
  return '<span class="dsh-pm-doc-filepath">' + esc(shown) + '</span>' + relPathHint(path, shown)
}

/** 「打开」列的可用按钮（可点开的行专用；不可开行走 openCellDisabled）。 */
function openDocButton(path: string, absPath?: string): string {
  const shown = typeof absPath === 'string' && absPath.length > 0 ? absPath : path
  return '<button type="button" class="dsh-pm-doc-open"'
    + ' data-open-doc="' + esc(shown) + '"'
    + ' title="点开正文：' + esc(displayDocPath(shown)) + '">打开</button>'
}

/**
 * 「打开」列的禁用占位（file-missing / unknown）：**不给假出口**。
 * 保留 `data-open-doc` 仅为**行级可断言**（每份文档都有开正文锚点），配合 `disabled`
 * 在浏览器里不会再产生 click；title 写清为什么不可开（不出现「点开正文」字样——
 * 报告壳降级套件按"缺失行不许留 点开正文 假出口"断言）。
 */
function openCellDisabled(shown: string, title: string): string {
  return '<button type="button" class="dsh-pm-doc-open" disabled aria-disabled="true"'
    + ' data-open-doc="' + esc(shown) + '"'
    + ' title="' + esc(title) + '">打开</button>'
}

/* ────────────────────────────────────────────────────────────── ① 确定文档 */

/**
 * 文档路径单元格（FR-6 紧凑表）：**纯文本**，三种状态各有各的画法
 *（REQ-261005143615-5ab1 FR-3/FR-4）：
 *  - **在盘**（confirmed / pending / unregistered）：等宽纯文本；有 `absPath` 就显示它；
 *  - **`file-missing`**（根在、文件确实不在）：灰色 + **划线**——划线样式双保险：
 *    CSS `.dsh-pm-doc-filepath.dsh-pm-doc-missing` + 内联 `text-decoration`
 *    （字符串级断言也能看见"划线"，不依赖样式表是否加载）；
 *  - **`unknown`**（一个可用读根都没有）：**不划线**、也不套 `dsh-pm-doc-missing`——
 *    那不是"文件缺失"，是"这台机器上判不了"。
 * 打开入口在**「打开」列**（`openCellOf`），本格不再兼职按钮（一行的可点入口只一处）。
 */
function pathCellOf(entry: DocPanelEntry): string {
  const path = String(entry.path ?? '')
  const absPath = typeof entry.absPath === 'string' && entry.absPath.length > 0 ? entry.absPath : undefined
  const shown = absPath ?? path
  const rel = absPath === undefined
    ? ''
    : '<span class="dsh-pm-hint" data-doc-relpath="' + esc(path) + '">台账路径：' + esc(path) + '</span>'
  if (entry.state === 'unknown') {
    return '<span class="dsh-pm-doc-filepath dsh-pm-doc-unknown"'
      + ' title="未判定：这台机器上找不到该需求声明的工作区（读根不可得），无法判断文件在不在">'
      + esc(shown) + '</span>' + rel
  }
  if (entry.state === 'file-missing') {
    return '<span class="dsh-pm-doc-filepath dsh-pm-doc-missing"'
      + ' style="text-decoration: line-through"'
      + ' title="文件缺失：登记在案但磁盘上找不到该文件，没有正文可读">' + esc(shown) + '</span>' + rel
  }
  return '<span class="dsh-pm-doc-filepath">' + esc(shown) + '</span>' + rel
}

/** 「打开」单元格：可开走真按钮，不可开（缺失 / 未判定）走 disabled 占位 + 原因 title。 */
function openCellOf(entry: DocPanelEntry): string {
  const path = String(entry.path ?? '')
  const absPath = typeof entry.absPath === 'string' && entry.absPath.length > 0 ? entry.absPath : undefined
  const shown = absPath ?? path
  if (entry.state === 'unknown') {
    return openCellDisabled(shown, '未判定：这台机器上找不到该需求声明的工作区（读根不可得），无法判断文件在不在')
  }
  if (entry.state === 'file-missing') {
    return openCellDisabled(shown, '文件缺失：登记在案但磁盘上找不到该文件，没有正文可读')
  }
  return openDocButton(path, absPath)
}

/**
 * 这条路是不是「原型」（展示侧兜底；REQ-261005105032-3b02 决议 #30 + frontend.md「迁移期兜底」）。
 *
 * 为什么要它：归属判据是**产物 kind**，但本次改动前登记的原型行在台账里 kind 写死为 `notes`
 * （`prototype` 这个 kind 当时还不存在），**不回填**——只认 kind 会让权威清单（`prototypes/INDEX.md`）
 * 显示成「其他」，读者看不出那是原型。故这里按路径段兜底归组：认 `prototypes/`（权威路径）
 * 与 `prototype/`（REQ-292a 旧路径）两个前缀。
 *
 * 为什么按**路径段**而不是 `path.includes('prototypes')`：段级匹配不会把 `xxx-prototypes/`
 * 这类目录名或 `prototypes.md` 这类文件名误认成原型。兜底只影响展示分组（台账不动）。
 */
export function prototypeGroupOf(path: string): boolean {
  const segs = String(path ?? '').split('/')
  return segs.includes('prototypes') || segs.includes('prototype')
}

/**
 * 原型角色标（权威 / 被取代）。三种情形的说辞（FR-12：都不许留白）：
 *  - `authoritative` → 「权威版本」（下游只能引它）；
 *  - `superseded` → 「被取代」+ `被取代于 <路径>`；INDEX 没写「被取代于」时如实说"没写"，
 *    **不编一个路径**（服务端在那种情形下也不注入 `supersededBy`）；
 *  - 没有角色（INDEX 没列这条 / 读不到 INDEX）→ 说清"未标权威角色"，不猜、也不假装有权威版本。
 */
function protoRoleBadge(
  role: DocPanelEntry['prototypeRole'],
  supersededBy: string | undefined,
  inProtoGroup: boolean,
): string {
  if (role === 'authoritative') {
    return '<span class="dsh-pm-proto-role" data-proto-role-text="authoritative">权威版本</span>'
  }
  if (role === 'superseded') {
    return '<span class="dsh-pm-proto-role" data-proto-role-text="superseded">被取代'
      + (supersededBy === undefined
        ? '（INDEX 未写「被取代于」）'
        : '：被取代于 ' + esc(supersededBy))
      + '</span>'
  }
  return inProtoGroup
    ? '<span class="dsh-pm-hint" data-proto-role-none="1">未标权威角色（INDEX 未列 / 未读到）</span>'
    : ''
}

/**
 * 这一行是否属于原型组（kind 判据优先，路径前缀只兜底旧登记——见 `prototypeGroupOf`）。
 * 抽成一处：分组（`documentsSection`）与行属性（`docRow`）必须同源，
 * 否则会出现"行没接到组里、却说自己属于原型组"这种自相矛盾。
 */
function inPrototypeGroup(entry: DocPanelEntry): boolean {
  return String(entry.kind ?? '') === 'prototype' || prototypeGroupOf(String(entry.path ?? ''))
}

/**
 * 原型判据标：**只说「有锚点 N 条 / 缺锚点」**（frontend.md「呈现项」第 3 行：只显示有/缺，不显示阈值）。
 *
 * 三种情形：
 *  - 服务端投影了 `prototypeMeta.anchors` → `data-proto-anchors="<n>"`（n>0 时）或
 *    `data-proto-anchors="none"`（采集到但零条锚点——这是**真实的"缺"**）；
 *  - 没有 `prototypeMeta`（未采集）→ **不渲染这个标、也不加属性**：此刻我们并不知道"缺不缺"，
 *    把"未采集"画成"缺锚点"就是拿未知冒充结论（本需求最不能出的那类错）。
 *    故"未采集"与"采集到 0 条"在产物里是可分辨的：前者没有 `data-proto-anchors`，后者是 `none`；
 *  - 不是原型行 → 不渲染（这一格只对原型说话，也不为此新增列）。
 *
 * 为什么**不显示几何量 / 阈值**：阈值由设计阶段按真实数据定死（D-10），原型只放观测量名与实测值
 * （决议 #8/#49）——页面摆出数字会让原型稿的实测值冒充判据。服务端为此**只投影锚点**。
 */
function protoAnchorsBadge(inProtoGroup: boolean, meta: DocPanelEntry['prototypeMeta']): string {
  if (!inProtoGroup || meta === undefined) return ''
  const anchors = Array.isArray(meta.anchors) ? meta.anchors : undefined
  if (anchors === undefined) return ''
  return anchors.length > 0
    ? '<span class="dsh-pm-hint" data-proto-anchors="' + String(anchors.length) + '">判据：有锚点 '
      + String(anchors.length) + ' 条</span>'
    : '<span class="dsh-pm-hint" data-proto-anchors="none">判据：缺锚点</span>'
}

/** 一行文档：**五个字段一个不省**（类型 / 路径 / 登记时间 / 状态 / 打开），状态格四态各有说辞。 */
function docRow(entry: DocPanelEntry): string {
  const state = String(entry.state ?? '')
  const missing = state === 'file-missing'
  const kind = String(entry.kind ?? '')
  const at = typeof entry.registeredAt === 'number' && Number.isFinite(entry.registeredAt)
    ? entry.registeredAt
    : undefined
  // 原型归属：**kind 判据优先**，路径前缀只兜底本次改动前登记为 notes 的旧行
  // （台账 kind 不回填，见 `prototypeGroupOf`）。分组判据与 `documentsSection` 共用一处实现。
  const protoByKind = kind === 'prototype'
  const inProto = inPrototypeGroup(entry)
  // 角色是**服务端投影**（读 INDEX 得出，本面板不做文件 IO）：只认协议里的两个值，
  // 运行时混进别的字符串时按"没给"处理（不显示看不懂的角色，也不注入 data-proto-role）。
  const role = entry.prototypeRole === 'authoritative' || entry.prototypeRole === 'superseded'
    ? entry.prototypeRole
    : undefined
  const supersededBy = typeof entry.supersededBy === 'string' && entry.supersededBy.length > 0
    ? entry.supersededBy
    : undefined
  return '<tr class="dsh-pm-doc-row' + (missing ? ' is-missing' : '') + '"'
    + ' data-doc-row="1"'
    + ' data-doc-kind="' + esc(kind) + '"'
    + ' data-doc-state="' + esc(state) + '"'
    // 原型行单列：**保留 `data-doc-row="1"`**（`data-doc-row` 条数 == documents.length 是
    // "一律铺开"的机械判据，加分组属性不许动它）。
    + (inProto ? ' data-doc-group="prototype"' : '')
    + (role === undefined ? '' : ' data-proto-role="' + esc(role) + '"')
    + (missing ? ' data-file-missing="1"' : '')
    + '>'
    // 类型格：兜底归组的旧行**显示成「原型」**（否则权威清单那一行会被读成「其他」），
    // 但 `data-doc-kind` 仍是台账原值——展示侧归组不等于改写台账。
    + '<td class="dsh-pm-doc-cell-kind">' + esc(inProto ? kindLabel('prototype') : kindLabel(kind)) + '</td>'
    + '<td class="dsh-pm-doc-cell-path">' + pathCellOf(entry) + '</td>'
    + '<td class="dsh-pm-doc-cell-time">'
    // 未登记的行本来就没有登记时间：说清"没登记"，不留白（"没有时间"与"没登记"是同一件事）
    + (at === undefined
      ? '<span class="dsh-pm-hint">' + (state === 'unregistered' ? '未登记（无登记时间）' : '台账未记登记时间') + '</span>'
      : esc(fmtTime(at)))
    + '</td>'
    // 状态格承载原型角色标（权威 / 被取代）：第一列宽度只 84px 且 `white-space: nowrap`，
    // 把「被取代于 <路径>」这类长文本放进去会把窄列撑爆；状态格 190px 且默认可换行。
    + '<td class="dsh-pm-doc-cell-state">'
    + protoRoleBadge(role, supersededBy, inProto)
    // 判据（有/缺锚点）：同样放状态格（不新增列、不新增表），与角色标同处一行
    + protoAnchorsBadge(inProto, entry.prototypeMeta)
    + '<span class="dsh-pm-doc-state" data-doc-state-text="' + esc(state) + '">' + esc(stateText(state)) + '</span>'
    + '<span class="dsh-pm-hint">（' + esc(stateNote(state)) + '）</span>'
    + (inProto && !protoByKind
      ? '<span class="dsh-pm-hint" data-proto-group-fallback="1">'
        + '台账 kind=' + esc(kind.length > 0 ? kind : '未知')
        + '（本次改动前登记的原型行：按路径归入原型组，台账 kind 不回填）</span>'
      : '')
    + '</td>'
    // 「打开」列（FR-6 紧凑表）：一行一个可点入口；不可开的状态给 disabled 占位（不给假出口）
    + '<td class="dsh-pm-doc-cell-open">' + openCellOf(entry) + '</td>'
    + '</tr>'
}

/**
 * 原型组头（表内单列的组标）：`data-doc-subhead="prototype"` + 分组计数 `data-proto-count`。
 *
 * 为什么是**表内一行**而不是另起一张表：确定文档的列结构（类型/路径/登记时间/状态）对原型
 * 完全一样，另起一张表要么重复一套表头、要么两张表的列宽各自漂移；表内一行则在同一个
 * 列宽体系里，读者一眼看出"下面这几行是一组"。它**不是**文档行（不带 `data-doc-row="1"`），
 * 所以 `data-doc-row` 条数 == `documents.length` 的既有判据不受影响。
 */
function protoSubheadRow(protoCount: number, authoritative: number, superseded: number): string {
  const parts: string[] = []
  // 只在确实有数时才写这两个数：`0` 在本页面只用于"真实计数为零"，不兼职当"没有"
  if (authoritative > 0) parts.push('权威 ' + String(authoritative))
  if (superseded > 0) parts.push('被取代 ' + String(superseded))
  return '<tr class="dsh-pm-doc-subhead" data-doc-subhead="prototype">'
    + '<td colspan="5">'
    + '<span class="dsh-pm-proto-count" data-proto-count="' + String(protoCount) + '">原型 '
    + String(protoCount) + ' 份</span>'
    + (parts.length === 0 ? '' : '<span class="dsh-pm-hint">（' + parts.join(' · ') + '）</span>')
    // 权威版本从哪来必须写在脸上：客户端不做文件 IO，角色是服务端读 INDEX 投影的
    + '<span class="dsh-pm-hint">权威 / 被取代以 prototypes/INDEX.md 为准（点路径打开正文）</span>'
    + '</td></tr>'
}

/**
 * 确定文档块：**逐行铺开**（不截断、不折叠、不做内层滚动）。
 *
 * 原型（`kind === 'prototype'`，以及兜底归组的旧 notes 行）在**同一张表内单列**：非原型行在前、
 * 原型行连续排在后面，中间插一行组标（`data-doc-subhead="prototype"` + 分组计数）。
 * 只是**分组**，不是搬走：原型行仍是 `data-doc-row="1"` 的文档行，`documents.length` 与
 * `data-doc-row` 条数的恒等式原样成立（决议 #30/#34）。
 */
function documentsSection(rawDocs: readonly unknown[]): string {
  const docs = coerceAll(rawDocs, asEntry)
  const protoRows = docs.filter(inPrototypeGroup)
  const otherRows = docs.filter(d => !inPrototypeGroup(d))
  const head = '<div class="dsh-pm-block-head">'
    + '<span class="dsh-pm-block-title">确定文档</span>'
    + (docs.length === 0
      ? '<span class="dsh-pm-hint">台账里还没有登记任何文档</span>'
      // 这 8 类之外的东西**不是消失了**：它们在下方的「其它发现」里按类型计数（服务端口径见
      // QueryDocs §确定文档 vs 其它发现）。这句点明"这里只有交付物"，读者才不会以为少了东西。
      : '<span class="dsh-pm-hint">共 ' + String(docs.length) + ' 份 · 全部铺开（不做内层滚动）· 正文点开才取'
        + ' · 只列人写的交付物（自动扫描到的其它文件见下方「其它发现」）</span>')
    + '</div>'
  if (docs.length === 0) {
    // 空态也要有说辞：不画空表格，也不写"0 份"（FR-12：数字只用于真实计数）
    return '<div class="dsh-pm-block" data-doc-section="documents">' + head
      + '<div class="dsh-pm-empty" data-doc-empty="1">尚未登记任何文档：台账里没有产物记录，'
      + '也没有「分类要求但未交」的设计文档。窗口 agent 用 reqboard_submit 登记产物后，这里逐行铺开。</div>'
      + '</div>'
  }
  const protoHead = protoRows.length === 0
    ? ''
    : protoSubheadRow(
      protoRows.length,
      protoRows.filter(d => d.prototypeRole === 'authoritative').length,
      protoRows.filter(d => d.prototypeRole === 'superseded').length,
    )
  return '<div class="dsh-pm-block" data-doc-section="documents">' + head
    + '<table class="dsh-pm-docs-table" data-doc-table="1">'
    + '<thead><tr><th>类型</th><th>路径</th><th>登记时间</th><th>状态</th><th>打开</th></tr></thead>'
    + '<tbody>' + otherRows.map(docRow).join('') + protoHead + protoRows.map(docRow).join('') + '</tbody>'
    + '</table></div>'
}

/* ────────────────────────────────────────────────────────────── ② 生成物 */

/**
 * 生成物块：与人写的文档**分开列**（FR-6 紧凑表：名称 / 路径 / 状态 / 打开）。
 *
 * 生成物是"工具重建的事实源"（queue.json / rtm-*.yml），没有登记时间、也没有"应当存在"的说法
 * ——所以状态格写「自动维护」而不是「未登记/文件缺失」（那会把"还没生成"误报成"缺了一份文档"）。
 * 生成物没有缺失/未判定态（服务端只投影在盘的），「打开」列恒为可用按钮。
 */
function generatedSection(rawGenerated: readonly unknown[]): string {
  const generated = coerceAll(rawGenerated, asGenerated)
  const head = '<div class="dsh-pm-block-head">'
    + '<span class="dsh-pm-block-title">生成物（工具重建，不是人写的文档）</span>'
    + (generated.length === 0
      ? '<span class="dsh-pm-hint">尚无生成物</span>'
      : '<span class="dsh-pm-hint">共 ' + String(generated.length) + ' 项 · 全部铺开</span>')
    + '</div>'
  if (generated.length === 0) {
    return '<div class="dsh-pm-block" data-doc-section="generated">' + head
      + '<div class="dsh-pm-empty" data-generated-empty="1">尚无生成物：queue.json / rtm-*.yml 还没生成。'
      + '生成物没有「应当存在」的说法——不存在就是还没生成，不算文档缺失。</div>'
      + '</div>'
  }
  const rows = generated.map(g =>
    '<tr class="dsh-pm-doc-generated" data-generated-row="1">'
    + '<td class="dsh-pm-doc-cell-label"><span class="dsh-pm-doc-label">' + esc(String(g.label ?? '')) + '</span></td>'
    + '<td class="dsh-pm-doc-cell-path">' + plainDocPath(String(g.path ?? ''), typeof g.absPath === 'string' ? g.absPath : undefined) + '</td>'
    + '<td class="dsh-pm-doc-cell-state"><span class="dsh-pm-hint">自动维护（工具重建）</span></td>'
    + '<td class="dsh-pm-doc-cell-open">' + openDocButton(String(g.path ?? ''), typeof g.absPath === 'string' ? g.absPath : undefined) + '</td>'
    + '</tr>').join('')
  // data-generated-list 沿用旧契约名（断言锚点），元素从 <ul> 换成 <table>（紧凑表化）
  return '<div class="dsh-pm-block" data-doc-section="generated">' + head
    + '<table class="dsh-pm-docs-table" data-generated-table="1" data-generated-list="1">'
    + '<tbody>' + rows + '</tbody></table>'
    + '</div>'
}

/* ────────────────────────────────────────────────────────────── ②b 其它发现 */

/**
 * 后缀 → 可读类型名（认不得的后缀**照实显示** `.xxx`，不假装认得）。
 *
 * 为什么要有这份表：`kind` 是分组键（后缀，机器口径，`data-discovered-group` 用它），
 * 而页面是给人读的——`yml` / `mts` 这类缩写对照着看才知道是什么。**没有中文名的就写 `.ext`**，
 * 编一个"文档"之类的名字比不写更糟（读者会以为是交付物）。
 */
const DISCOVERED_KIND_LABEL: Readonly<Record<string, string>> = {
  png: '图片（prototype 截图 / 证据图）',
  html: 'HTML（原型稿 / 标本页）',
  yml: 'YAML（RTM 追溯矩阵 / 工具数据）',
  yaml: 'YAML（RTM 追溯矩阵 / 工具数据）',
  json: 'JSON（工具生成，如 queue.json）',
  ts: 'TypeScript 源码（任务改动过的文件）',
  mts: 'TypeScript 脚本（任务改动过的文件）',
  txt: '纯文本（命令输出 / 中间证据）',
  tsv: 'TSV（机器索引）',
  md: 'Markdown（不在交付物白名单内的）',
  other: '无后缀文件',
}

/** 分组的可读名：表里有就用表里的，没有就照实写后缀（认不出 ≠ 不存在）。 */
function discoveredKindLabel(kind: string): string {
  return DISCOVERED_KIND_LABEL[kind] ?? ('.' + kind + ' 文件')
}

/** 一个分组的样例路径（可点开正文；与文档行同一套 `data-open-doc` 委派）。 */
function discoveredSample(path: string): string {
  return '<button type="button" class="dsh-pm-doc-path"'
    + ' data-open-doc="' + esc(path) + '" data-discovered-sample="1"'
    + ' title="点开正文：' + esc(displayDocPath(path)) + '">' + esc(displayDocPath(path)) + '</button>'
}

/**
 * 「其它发现」块：**按类型分组的计数行**（缺陷修复：原来这 220 条混在确定文档里逐行倒）。
 *
 * 三条纪律：
 *  - **不折叠成一行、不做内层滚动**：每一类单独一行，带 `count`（可数）与最多 3 个样例（可认）；
 *    余量必须写成一句人话「其余 N 个同类，去文档目录查看」——写成"其余若干"就是不可数；
 *  - **样例点得开**：它们是真实文件路径，走与文档行**同一条** `data-open-doc` 委派
 *    （本面板不接 `data-action="open-doc"`，理由见文件头 ②）；
 *  - 这一块**不是**"剩下的垃圾"：它是"自动扫描到了这些、它们不是人写的交付物"的如实交代，
 *    计数加总与文档行数一起对上台账产物总数（服务端 `discoveredOf` 的诚实性判据）。
 */
function discoveredSection(rawDiscovered: readonly unknown[]): string {
  const groups = coerceAll(rawDiscovered, asDiscoveredGroup)
  if (groups.length === 0) return ''
  const total = groups.reduce((n, g) => n + (Number.isFinite(g.count) ? Math.max(0, Math.trunc(g.count)) : 0), 0)
  const head = '<div class="dsh-pm-block-head">'
    + '<span class="dsh-pm-block-title">其它发现（自动扫描到的非交付物）</span>'
    + '<span class="dsh-pm-hint">共 ' + String(total) + ' 项 / ' + String(groups.length)
    + ' 类 · 按类型分组计数，每类最多 3 个样例（全部铺开，不做内层滚动）</span>'
    + '</div>'
  const rows = groups.map((g) => {
    const count = Number.isFinite(g.count) ? Math.max(0, Math.trunc(g.count)) : 0
    const samples = coerceAll(Array.isArray(g.samples) ? g.samples : [], asString)
    const rest = Math.max(0, count - samples.length)
    // FR-6 紧凑表：一类一行（类型 / 计数 / 样例 / 余量），样例仍是可点开的真实路径
    return '<tr class="dsh-pm-discovered-group" data-discovered-group="' + esc(g.kind) + '"'
      + ' data-discovered-count="' + String(count) + '">'
      + '<td class="dsh-pm-doc-cell-kind"><span class="dsh-pm-doc-kind">' + esc(discoveredKindLabel(g.kind)) + '</span></td>'
      + '<td class="dsh-pm-doc-cell-count"><span class="dsh-pm-discovered-num">' + String(count) + ' 个</span></td>'
      + '<td class="dsh-pm-doc-cell-samples">'
      + (samples.length === 0
        ? '<span class="dsh-pm-hint">未给样例（服务端只给了计数）</span>'
        : '<span class="dsh-pm-hint">样例：</span>' + samples.map(discoveredSample).join(''))
      + '</td>'
      + '<td class="dsh-pm-doc-cell-rest"><span class="dsh-pm-discovered-rest">'
      + (rest > 0
        ? '其余 ' + String(rest) + ' 个同类，去文档目录查看'
        : '全部 ' + String(count) + ' 个已列在上面')
      + '</span></td>'
      + '</tr>'
  }).join('')
  return '<div class="dsh-pm-block" data-doc-section="discovered">' + head
    + '<table class="dsh-pm-docs-table" data-discovered-table="1" data-discovered-list="1">'
    + '<tbody>' + rows + '</tbody></table>'
    + '</div>'
}

/* ────────────────────────────────────────────────────────────── ③ 核验表 */

/** 验收单上可能附带的审阅字段（interfaces.md 的内联形状带它们，protocol 的 VerificationSheet 不带）。 */
type VerifySheetView = VerificationSheet & {
  reviewedAt?: number
  decision?: 'pass' | 'rework'
  reviewNote?: string
}

/** 来源格：既给可读文案，也给**原始枚举**（审计与断言都要认得出 agent / human）。 */
function sourceCell(item: VerificationItem): string {
  if (item.resultSource === 'agent') return '<span class="dsh-pm-src" data-source="agent">agent 实测（agent）</span>'
  if (item.resultSource === 'human') return '<span class="dsh-pm-src" data-source="human">人工填写（human）</span>'
  return '<span class="dsh-pm-hint" data-source="none">未标注来源（台账没有 resultSource）</span>'
}

/** 证据格：**逐条铺开**（不截断）；没有证据就明说"未提供证据"，不留白。 */
function evidenceCell(item: VerificationItem): string {
  const evidence = Array.isArray(item.evidence) ? item.evidence : []
  if (evidence.length === 0) return '<span class="dsh-pm-hint">未提供证据</span>'
  return '<ul class="dsh-pm-evidence">' + evidence.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>'
}

/**
 * 核验项的来源 kind（REQ-261005105032-3b02 §验收单节表）。
 *
 * 为什么防御式取：面板吃的是**服务端 JSON**（`asItem` 只做对象形状守卫），旧台账 / 中间层脏数据
 * 可能没有 `source`；此处只求"如实标出来源"，不因一个缺失字段把整块渲染炸掉。
 */
function verifySourceKind(item: VerificationItem): string {
  const kind = (item.source as { kind?: unknown } | undefined)?.kind
  return typeof kind === 'string' && kind.length > 0 ? kind : 'unknown'
}

/**
 * 一行核验项：列照抄 `verification.ts` 的七列。
 * `needsHuman` 是这张表最该被看见的一列——「这条只能人来判」必须显眼
 * （既有实现用 `.dsh-pm-flag.verify-pending` 旗标，这里照用同一套类名）。
 */
function verifyRow(item: VerificationItem): string {
  const needsHuman = item.needsHuman === true
  const status = String(item.status ?? '')
  const opinion = (item.opinion ?? '').trim()
  const reason = (item.humanReason ?? '').trim()
  const decidedBy = item.decidedBy === undefined ? '' : actorText(item.decidedBy)
  const decidedAt = typeof item.decidedAt === 'number' && Number.isFinite(item.decidedAt) ? item.decidedAt : undefined
  return '<tr data-verify-row="1"'
    + ' data-verify-id="' + esc(item.id) + '"'
    + ' data-verify-status="' + esc(status) + '"'
    // REQ-261005105032-3b02（§验收单节表）：**只加属性、不动列**——「UI 需求验收单含原型/裁定
    // 两个对照项」由此成为可字符串断言的判据（否则只能靠肉眼在表格里找中文标题）。
    + ' data-verify-source="' + esc(verifySourceKind(item)) + '"'
    + (needsHuman ? ' data-needs-human="1"' : '')
    + '>'
    + '<td class="dsh-pm-doc-cell-criterion"><span class="dsh-pm-hint">' + esc(item.id) + '</span> '
    + mdInline(item.criterion) + '</td>'
    + '<td class="dsh-pm-doc-cell-result">'
    + ((item.result ?? '').trim().length > 0
      ? mdInline(item.result)
      : '<span class="dsh-pm-hint">未提供实际结果（agent 未实测 / 未填写）</span>')
    + '</td>'
    + '<td class="dsh-pm-doc-cell-source">' + sourceCell(item) + '</td>'
    + '<td class="dsh-pm-doc-cell-human">'
    + (needsHuman
      ? '<span class="dsh-pm-flag verify-pending">需人工确认'
        + (reason.length > 0 ? '：' + mdInline(reason) : '（未写原因）') + '</span>'
      : '<span class="dsh-pm-hint">否（agent 可自证）</span>')
    + '</td>'
    + '<td class="dsh-pm-doc-cell-evidence">' + evidenceCell(item) + '</td>'
    + '<td class="dsh-pm-doc-cell-opinion">'
    + (opinion.length > 0 ? mdInline(opinion) : '<span class="dsh-pm-hint">无意见（裁决时未写）</span>')
    + '</td>'
    + '<td class="dsh-pm-doc-cell-verdict">'
    // 注意用 `data-verify-verdict` 而不是 `data-verdict`：后者是**门禁行**的选择器，
    // 两种裁决混用同一个属性名会让"门禁裁决"的断言误收核验项的值。
    + '<span class="dsh-pm-verify-verdict" data-verify-verdict="' + esc(status) + '">'
    + esc((VERIFY_STATUS_TEXT as Readonly<Record<string, string>>)[status] ?? ('未知裁决：' + status)) + '</span>'
    + (decidedAt === undefined
      ? ''
      : '<span class="dsh-pm-hint">' + esc(fmtTime(decidedAt)) + (decidedBy.length === 0 ? '' : ' · ' + decidedBy) + '</span>')
    + '</td>'
    + '</tr>'
}

/** 核验块：有验收单就逐项铺开；没有就给**解释性空态**（不画空表格）。 */
function verificationSection(sheet: DocsResponse['verification']): string {
  const head = '<div class="dsh-pm-block-head"><span class="dsh-pm-block-title">核验 · 验收单</span>'
    + (sheet === undefined
      ? '<span class="dsh-pm-hint">没有验收材料</span>'
      : '<span class="dsh-pm-hint">v' + String(sheet.version) + ' · '
        + timeOr(sheet.generatedAt, '台账未记生成时间') + '</span>')
    + '</div>'
  if (sheet === undefined) {
    // FR-12：没有验收单 ≠ 空表格。说清"没交 / 找谁交 / 交了会看到什么"
    return '<div class="dsh-pm-block" data-doc-section="verification">' + head
      + '<div class="dsh-pm-empty" data-verify-empty="1">尚未提交验收材料：验收单由窗口 agent 用 '
      + '<code>reqboard_submit(kind=verification)</code> 提交（做了什么 + 怎么验的 + 看到什么结果）。'
      + '提交后这里逐项铺开（标准 / 实际结果 / 来源 / 需人工 / 证据 / 意见 / 裁决），不画空表格。</div>'
      + '</div>'
  }
  const view: VerifySheetView = sheet
  const decision = view.decision === 'pass'
    ? '✅ 人工审核通过'
    : view.decision === 'rework' ? '✖ 已退回返工' : '待人工裁决'
  const meta = '<div class="dsh-pm-block-summary">' + esc(decision)
    + (typeof view.reviewedAt === 'number' && Number.isFinite(view.reviewedAt) ? ' · ' + esc(fmtTime(view.reviewedAt)) : '')
    + ' · 提交人：' + actorText(sheet.generatedBy)
    + (sheet.reworkOnly === true ? ' · 本轮只含上一版未过项（返工续验）' : '')
    + '</div>'
    + (view.reviewNote === undefined ? '' : '<div class="dsh-pm-block-note">审核意见：' + mdInline(view.reviewNote) + '</div>')
  const items = coerceAll(Array.isArray(sheet.items) ? sheet.items : [], asItem)
  if (items.length === 0) {
    return '<div class="dsh-pm-block" data-doc-section="verification">' + head + meta
      + '<div class="dsh-pm-empty" data-verify-empty="1">验收材料已提交，但验收单里没有逐项记录（items 为空）'
      + '——这里不画空表格：没有逐项就没有可裁决的东西。</div>'
      + '</div>'
  }
  return '<div class="dsh-pm-block" data-doc-section="verification">' + head + meta
    + '<table class="dsh-pm-docs-table" data-verify-table="1">'
    + '<thead><tr><th>标准</th><th>实际结果</th><th>来源</th><th>需人工</th><th>证据</th><th>意见</th><th>裁决</th></tr></thead>'
    + '<tbody>' + items.map(verifyRow).join('') + '</tbody>'
    + '</table></div>'
}

/* ────────────────────────────────────────────────────────────── ④ 门禁裁决留痕 */

/** 门禁行：六道门逐行，**谁批的 / 何时 / 什么方式 / 退回理由**四件事一个不省。 */
function gateRow(g: GateVerdict): string {
  const gate = String(g.gate ?? '')
  const verdict = String(g.verdict ?? '')
  const via = g.via === undefined
    ? ''
    : ((VIA_TEXT as Readonly<Record<string, string>>)[g.via] ?? ('未知方式（' + String(g.via) + '）'))
  const by = actorText(g.by)
  const reason = (g.reason ?? '').trim()
  return '<tr data-gate="' + esc(gate) + '" data-verdict="' + esc(verdict) + '">'
    + '<td class="dsh-pm-doc-cell-gate">'
    + esc((GATE_LABEL as Readonly<Record<string, string>>)[gate] ?? ('未知门（' + gate + '）'))
    + '</td>'
    + '<td class="dsh-pm-doc-cell-verdict">'
    + esc((VERDICT_TEXT as Readonly<Record<string, string>>)[verdict] ?? ('未知结论（' + verdict + '）'))
    + '</td>'
    + '<td class="dsh-pm-doc-cell-via">'
    + (via.length > 0 ? esc(via) : '<span class="dsh-pm-hint">未记录方式（台账无 via 字段）</span>')
    + '</td>'
    + '<td class="dsh-pm-doc-cell-time">' + timeOr(g.at, '未记录时间') + '</td>'
    + '<td class="dsh-pm-doc-cell-by">'
    + (by.length > 0 ? esc(by) : '<span class="dsh-pm-hint">未记录确认人</span>')
    + '</td>'
    + '<td class="dsh-pm-doc-cell-reason">'
    // 有 reason 就显示**原文**（退回理由必须可读，不得改述）；没有就用该结论的默认说辞补上
    + (reason.length > 0
      ? mdInline(reason)
      : '<span class="dsh-pm-hint">'
        + esc((VERDICT_NOTE as Readonly<Record<string, string>>)[verdict] ?? '台账没有给这道门的说明') + '</span>')
    + '</td>'
    + '</tr>'
}

/**
 * 门禁块：**六道门一律列全**（FR-11 #7：门禁也要全铺）。
 *
 * 台账没给某道门的留痕时，按 `not-reached` 显示并写清"台账没有这道门的留痕"——
 * 少列一道门会让"这道门过了没有"变成不可回答（列全才有可数性）。
 * 响应里多出来的门（协议之外的新门）**追加在后**，不丢数据。
 */
function gatesSection(rawGates: readonly unknown[]): string {
  const gates = coerceAll(rawGates, asGate)
  const byGate = new Map<string, GateVerdict>()
  for (const g of gates) {
    const key = String(g.gate ?? '')
    if (!byGate.has(key)) byGate.set(key, g)
  }
  const rows: GateVerdict[] = GATE_ORDER.map(gate => byGate.get(gate) ?? {
    gate,
    verdict: 'not-reached',
    reason: '台账没有这道门的留痕（按「尚未走到该门」显示，不编结论）',
  })
  for (const g of gates) if (!(GATE_ORDER as readonly string[]).includes(String(g.gate ?? ''))) rows.push(g)
  return '<div class="dsh-pm-block" data-doc-section="gates">'
    + '<div class="dsh-pm-block-head"><span class="dsh-pm-block-title">门禁裁决留痕</span>'
    + '<span class="dsh-pm-hint">谁批的 / 何时 / 什么方式 / 退回理由（六道门全列，全部铺开）</span></div>'
    + '<table class="dsh-pm-docs-table" data-gate-table="1">'
    + '<thead><tr><th>门</th><th>裁决</th><th>方式</th><th>时间</th><th>确认人</th><th>理由 / 说明</th></tr></thead>'
    + '<tbody>' + rows.map(gateRow).join('') + '</tbody>'
    + '</table></div>'
}

/* ────────────────────────────────────────────────────────────── ⑤ 归档 */

/**
 * 归档对账行：口径与 `verification.ts` 的 `archiveReconcileLine` 一致
 * （列了多少 / 豁免多少 / 未列多少 / 当时闸门 + 补录次数；未列明细逐条铺开、带已声明理由）。
 *
 * 为什么不 import 那边的实现：它入参是 `RequirementRecord`（这里手里只有 `ArchiveRecord`
 * 这一块），且它对未列明细 `slice(0, 20)`——与本面板"一律铺开"的纪律相反。
 * 这里只做**同口径的最小投影**，data 属性沿用同一批名字（`data-reconcile` / `data-ack`），
 * 让既有断言在两个页面同一处命中。
 */
function reconcileBlock(a: ArchiveRecord): string {
  const r = a.reconcile
  if (r === undefined) {
    return '<div class="dsh-pm-archive-reconcile" data-reconcile="none">未对账（本功能上线前归档的存量记录）</div>'
  }
  const listed = Array.isArray(r.listed) ? r.listed : []
  const exempted = Array.isArray(r.exempted) ? r.exempted : []
  // 未列明细与豁免声明是"人该看一眼"的东西：逐条铺开（不 slice——那是别的页面的口径），
  // 元素照样先过一遍对象守卫（脏数据不许把渲染路径打崩）
  const unlisted = coerceAll(Array.isArray(r.unlisted) ? r.unlisted : [], asString)
  const acknowledged = coerceAll(Array.isArray(r.acknowledged) ? r.acknowledged : [], asAck)
  const parts = [
    '已列 ' + String(listed.length),
    '豁免 ' + String(exempted.length),
    '未列 ' + String(unlisted.length),
    '闸门=' + String(r.gate),
  ]
  const amended = Array.isArray(a.amendments) ? a.amendments.length : 0
  if (amended > 0) parts.push('补录 ' + String(amended) + ' 次')
  const detail = unlisted.length === 0 ? '' : '<ul class="dsh-pm-archive-unlisted">'
    + unlisted.map((p) => {
      const ack = acknowledged.find(x => x.path === p)
      return '<li data-doc-path="' + esc(p) + '"><code>' + esc(p) + '</code>'
        + (ack === undefined
          ? '<span class="dsh-pm-archive-noack">（未声明）</span>'
          : '<span class="dsh-pm-archive-ack" data-ack="' + esc(p) + '">已声明不收：' + esc(ack.reason) + '</span>')
        + '</li>'
    }).join('') + '</ul>'
  return '<div class="dsh-pm-archive-reconcile" data-reconcile="' + esc(r.gate) + '">'
    + '清单对账：' + esc(parts.join(' · ')) + '</div>' + detail
}

/**
 * 归档块：目录 / 清单 / 合并去向 / 索引条目 / 说明书更新点 / 清单对账。
 *
 * REQ-261006123819-3af3 FR-3（D-2）：判据不再是那个无写入者的归档时间字段（故「已归档」
 * 分支永远不可达），而是同载荷里服务端已算好的**归档门读数**——客户端另抄一个判据就是第二个
 * 事实源。`gate` 取不到（端点未接线 / 旧服务端）时**不猜**：按「材料已备」呈现并保持
 * data-archived="no"（与 gate-read-root 的「未判定」口径同源）。
 */
function archiveSection(a: ArchiveRecord, gate: GateVerdict | undefined): string {
  const archived = gate?.verdict === 'passed'
  const state = !archived
    ? '<span class="dsh-pm-review" data-state="pending">待归档（材料已备）</span>'
    : '<span class="dsh-pm-review" data-state="pass">已归档'
      + (gate?.at !== undefined ? ' ' + esc(fmtTime(gate.at)) : '') + '</span>'
  const archiveDocs = coerceAll(Array.isArray(a.docs) ? a.docs : [], asArchiveDoc)
  const docs = archiveDocs.map(d =>
    '<li data-archive-doc="' + esc(d.path) + '">'
    + '<span class="dsh-pm-doc-kind">' + esc(artifactKindLabel(d.kind)) + '</span>'
    + openablePath(String(d.path ?? ''))
    + '</li>').join('')
  const merged = coerceAll(Array.isArray(a.mergedInto) ? a.mergedInto : [], asString).map(m =>
    '<li data-merged-into="' + esc(m) + '">' + openablePath(m) + '</li>').join('')
  // 说明书更新点：有就复用归档区的同一渲染；没有（且连 manualNote 也没有）也要有说辞，不留白
  const manual = renderManualUpdates(a)
  const manualBlock = manual.length > 0 ? manual
    : '<div class="dsh-pm-doc-group" data-manual-updates="none">'
      + '<span class="dsh-pm-hint">项目说明书更新</span>'
      + '<div class="dsh-pm-block-summary">未记录（归档材料里既没有 manualUpdates 也没有 manualNote）</div></div>'
  // 用 yes/no 而不是 1/0 标归档态：`0` 在本页面只用于"真实计数为零"，不兼职当布尔假（FR-12）
  const dir = String(a.dir ?? '')
  const indexEntry = String(a.indexEntry ?? '')
  return '<div class="dsh-pm-block" data-doc-section="archive" data-archived="'
    + (archived ? 'yes' : 'no') + '">'
    + '<div class="dsh-pm-block-head"><span class="dsh-pm-block-title">归档</span>' + state
    + (dir.length === 0
      ? '<span class="dsh-pm-hint">未写需求目录（dir 为空）</span>'
      : '<code class="dsh-pm-block-path">' + esc(dir) + '</code>')
    + '<span class="dsh-pm-hint">材料提交 ' + timeOr(a.submittedAt, '未记录提交时间')
    + ' · 提交人：' + actorText(a.submittedBy) + '</span>'
    + '</div>'
    + '<div class="dsh-pm-block-summary">索引条目：'
    + (indexEntry.length === 0 ? '未写（归档材料没有 indexEntry）' : esc(indexEntry)) + '</div>'
    + reconcileBlock(a)
    + '<div class="dsh-pm-doc-group"><span class="dsh-pm-hint">需求目录内的文档（全部铺开）</span>'
    + (docs.length === 0
      ? '<div class="dsh-pm-hint">清单为空（归档材料没列文档）</div>'
      : '<ul class="dsh-pm-doc-list">' + docs + '</ul>') + '</div>'
    + '<div class="dsh-pm-doc-group"><span class="dsh-pm-hint">合并进的项目文档（全部铺开）</span>'
    + (merged.length === 0
      ? '<div class="dsh-pm-hint">无合并去向（归档材料没写 mergedInto）</div>'
      : '<ul class="dsh-pm-doc-list">' + merged + '</ul>') + '</div>'
    + manualBlock
    + '</div>'
}

/* ────────────────────────────────────────────────────────────── 入口 */

/** 文档面板正文（纯字符串、零副作用：取数归壳，点击归委派）。 */
function renderDocs(data: unknown): string {
  const d = asDocsResponse(data)
  if (d === undefined) {
    // 形状不符 ≠ "没有文档"：如实说是什么不对，不猜内容（FR-12）
    return '<section class="dsh-pm-docs" data-panel="docs" data-docs-shape="bad">'
      + '<div class="dsh-pm-empty" data-docs-shape-error="1">文档面板载荷形状不符：'
      + '响应里没有 documents / generated / gates 数组（端点未接线，或中间层改了形状）。'
      + '这里不猜内容，也不把"读不到"显示成"没有文档"。</div>'
      + '</section>'
  }
  return '<section class="dsh-pm-docs" data-panel="docs" data-docs-shape="ok">'
    + documentsSection(d.documents)
    + generatedSection(d.generated)
    + discoveredSection(d.discovered ?? [])
    + verificationSection(d.verification)
    + gatesSection(d.gates)
    // REQ-261006123819-3af3 FR-3：归档态判据来自服务端的归档门读数（取不到传 undefined → 保守分支）
    + (d.archive === undefined ? '' : archiveSection(d.archive, (d.gates ?? []).find(g => g.gate === 'archive')))
    + '</section>'
}

export const docsPanel: ReportTabDef = {
  key: 'docs',
  label: '文档',
  // 角标数字来自服务端计数（T-8）：`tabCounts.docs` = 该需求已登记产物条数。
  // 取不到（服务端没给 / 这条台账没有产物登记字段）→ undefined = 不渲染角标，
  // 绝不用前端 `documents.length` 冒充服务端计数。
  badge: (report) => report?.tabCounts?.docs,
  // 第二个参数（ctx）在纯渲染里用不上：点开正文由**壳**的 attach 委派接
  // （`[data-open-doc]` → `ctx.openDoc`）。渲染函数自己调 ctx.openDoc 就变成"渲染时副作用"，
  // 也与壳的分段重绘纪律冲突（面板段每次变更都被整段替换）。
  render: (data, _ctx: ReportTabCtx) => renderDocs(data),
}
