/**
 * 文档记录区块 + 验收/归档区块渲染（REQ-47939a t11 从 view.ts 机械拆分）。
 *
 * @module dsh-pmboard/client/views/verification
 */
import { esc } from '../html.js'
import type { ArchiveRecord, RequirementRecord } from '../types.ts'
import { gateOf } from '../render/gate-view.ts'
import type { StageKey } from '../../shared/protocol.ts'
import { ALL_STAGE_KEYS } from '../../shared/protocol.ts'
import { fmtTime } from '../render/dom-utils.ts'
import { displayDocPath } from '../open-doc.ts'
import { KIND_ICONS, KIND_LABELS, artifactKindLabel } from '../../shared/artifact-labels.ts'
// REQ-261006123819-3af3 FR-3（D-2）：归档时刻的唯一判定点（原先读一个没有写入者的字段）
import { archivedMomentOf } from '../../domain/status/ArchivedMoment.ts'

/* ------------------------------------------------------------------ 文档记录 */

/**
 * 文档类型 → 图标 + 标签（需求详情页「文档」区块用）。
 * REQ-260922182638-0777：导出形状保留（兼容既有引用），取值改由唯一事实源
 * shared/artifact-labels.ts 的 KIND_LABELS / KIND_ICONS 供给，禁止再写本地文案。
 */
export const DOC_KIND_META: Record<string, { icon: string; label: string }> = Object.fromEntries(
  Object.entries(KIND_LABELS).map(([kind, label]) => [kind, { icon: KIND_ICONS[kind] ?? '📒', label }]),
)

/** 产物 stage 的流水线序（未知/缺省排在最后，不改变其余相对顺序）。 */
export function stageRankOf(stage: StageKey | string | undefined): number {
  const idx = stage === undefined ? -1 : (ALL_STAGE_KEYS as readonly string[]).indexOf(stage)
  return idx < 0 ? ALL_STAGE_KEYS.length : idx
}

/**
 * 收集需求关联的全部文档，去重。
 *
 * 来源与顺序（REQ-31e11f #6/#7：立项过程的文件必须全部进文档区）：
 *   ① req.artifacts（t4 登记的节点产物：requirement/plan/decomposition/task_detail/verification/archive）
 *      —— 按 stage 流水线顺序排列，这样 requirement.md → plan.md → decomposition.md →
 *      tasks/*.md → verification.md → archive 在文档区一眼连成一条链；
 *   ② docLinks（requirement/ui/proposal）；
 *   ③ plan.path（拆分计划文档）；
 *   ④ archive.docs（归档文档清单）。
 * 路径去重：同一文件既登记产物又出现在 docLinks/archive 时只展示一次（保留首次出现的口径）。
 */
export function collectReqDocs(req: RequirementRecord): Array<{ icon: string; label: string; path: string }> {
  const docs: Array<{ icon: string; label: string; path: string }> = []
  const seen = new Set<string>()
  const push = (kind: string, path: string): void => {
    const p = (path ?? '').trim()
    if (!p || seen.has(p)) return
    seen.add(p)
    const meta = DOC_KIND_META[kind]
    // REQ-f0579a t2：label = 种类可读名 · 文件名——af8a2ac0 要求显示文档真名
    // （追溯链不再四份全叫「设计文档」），board-info-fixes 契约要求种类可读名；两者双呈现。
    const fileName = p.split('/').pop() || p
    const kindLabel = meta?.label ?? kind
    docs.push({ icon: meta?.icon ?? '📒', label: kindLabel + ' · ' + fileName, path: p })
  }
  // ① 节点产物（t4 登记的 pipeline 产物），按 stage 顺序
  const artifacts = [...(req.artifacts ?? [])]
    .sort((a, b) => stageRankOf(a.stage) - stageRankOf(b.stage))
  for (const a of artifacts) push(a.kind, a.path)
  // ② 需求文档 / UI 文档 / 设计文档（docLinks）
  if (req.docLinks?.requirement) push('requirement', req.docLinks.requirement)
  if (req.docLinks?.ui) push('ui', req.docLinks.ui)
  if (req.docLinks?.proposal) push('proposal', req.docLinks.proposal)
  // REQ-6f39b5：extras 额外成果文件（如 HTML 原型——关键成果必须可见）
  for (const e of req.docLinks?.extras ?? []) {
    const p = (e.path ?? '').trim()
    if (!p || seen.has(p)) continue
    seen.add(p)
    docs.push({ icon: '🎁', label: e.label || '成果文件', path: p })
  }
  // ③ 拆分计划（plan.path）
  if (req.plan?.path) push('plan', req.plan.path)
  // ④ 归档文档清单（archive.docs）
  for (const d of req.archive?.docs ?? []) push(d.kind, d.path)
  return docs
}

/** 渲染「文档」区块：该需求关联的需求文档/UI 文档/设计文档/计划/验收/复盘等。 */
export function renderDocSection(req: RequirementRecord): string {
  const docs = collectReqDocs(req)
  if (docs.length === 0) {
    return '<div class="dsh-pm-empty">暂无文档记录。窗口 agent 可用 <code>reqboard_archive_submit</code> 提交文档清单，或通过需求更新接口填充 docLinks（requirement/ui/proposal）。</div>'
  }
  return '<ul class="dsh-pm-doc-list">' + docs.map(d =>
    '<li data-doc-path="' + esc(d.path) + '">'
    + '<span class="dsh-pm-doc-icon">' + d.icon + '</span>'
    + '<span class="dsh-pm-doc-label">' + esc(d.label) + '</span>'
    + '<button type="button" class="dsh-pm-doc-path" data-action="open-doc" data-path="' + esc(d.path) + '" title="' + esc(displayDocPath(d.path)) + '">' + esc(d.path) + '</button>'
    + '</li>'
  ).join('') + '</ul>'
}

/* ------------------------------------------------------------------ 验收 / 归档 */

/**
 * 卡面：待人工审核 / 待归档 —— 让"卡在人这里"一眼可见。
 *
 * FR-5 / D-2：读 `gates` 里的 verification 门读数（原先读 `req.verification`，而首屏摘要不带该大字段
 * ⇒ 验收态卡片一律谎报「待验收材料」）。`missing` = 还没交；`pending`/`confirmed` = 已交待人审。
 * 读数不可得 ⇒ 不渲染（FR-6）。
 */
export function verifyChip(req: RequirementRecord): string {
  if (req.status !== 'accepting') return ''
  const reading = gateOf(req, 'verification')
  if (reading === undefined) return ''
  return reading.status === 'missing'
    ? '<span class="dsh-pm-flag verify-pending" title="验收态但还没提交验收材料">待验收材料</span>'
    : '<span class="dsh-pm-flag verify-pending" title="验收材料已提交，等人工审核">待人工审核</span>'
}

/**
 * 归档 chip（FR-5）：读 `req.archivePrepared`（服务端按「归档记录 ∨ 归档产物」判定，与
 * `domain/status/Predicates.closingGapOf` 同源）。缺省 = 不可得 ⇒ 不渲染。
 */
export function archiveChip(req: RequirementRecord): string {
  if (req.status !== 'done') return ''
  const prepared = req.archivePrepared
  if (prepared === undefined) return ''
  return prepared
    ? '<span class="dsh-pm-flag archive-pending" title="归档材料已备，等人点归档">待归档</span>'
    : '<span class="dsh-pm-flag archive-pending" title="已完成，等窗口准备归档材料">待归档材料</span>'
}

/**
 * 归档清单**对账行**（REQ-261004183621-de3f FR-5）：列了多少 / 豁免多少 / 漏了什么 / 当时闸门。
 *
 * 三条口径：
 *   ① 无 `reconcile`（本功能上线前归档的存量记录）→ 显示「未对账（本功能上线前归档）」，
 *      **不显示 0**——0 与"没对过账"是两回事；
 *   ② 未列非空时把明细摊开（这批正是"人该看一眼"的东西），并带上已声明的理由；
 *   ③ 补录过就注明补了几次（清单是追加出来的，读者要知道）。
 */
export function archiveReconcileLine(req: RequirementRecord): string {
  const a = req.archive
  if (a === undefined) return ''
  const r = a.reconcile
  if (r === undefined) {
    return '<div class="dsh-pm-archive-reconcile" data-reconcile="none">未对账（本功能上线前归档）</div>'
  }
  const parts = [
    '已列 ' + String(r.listed.length),
    '豁免 ' + String(r.exempted.length),
    '未列 ' + String(r.unlisted.length),
    '闸门=' + r.gate,
  ]
  const amended = (a.amendments ?? []).length
  if (amended > 0) parts.push('补录 ' + String(amended) + ' 次')
  const detail = r.unlisted.length === 0
    ? ''
    : '<ul class="dsh-pm-archive-unlisted">' + r.unlisted.slice(0, 20).map(p => {
      const ack = r.acknowledged.find(x => x.path === p)
      return '<li data-doc-path="' + esc(p) + '"><code>' + esc(p) + '</code>'
        + (ack === undefined
          ? '<span class="dsh-pm-archive-noack">（未声明）</span>'
          : '<span class="dsh-pm-archive-ack">已声明不收：' + esc(ack.reason) + '</span>')
        + '</li>'
    }).join('') + (r.unlisted.length > 20 ? '<li>…等 ' + String(r.unlisted.length) + ' 条</li>' : '') + '</ul>'
  return '<div class="dsh-pm-archive-reconcile" data-reconcile="' + esc(r.gate) + '">'
    + '清单对账：' + esc(parts.join(' · ')) + '</div>' + detail
}

/**
 * 验收单逐项（REQ-261001184609-cecb t5）：把 agent 记录的实际结果与「需人工确认」摆到人眼前——
 * 人只做裁决，不必去别处找证据，也不用重抄命令输出。
 */
function renderSheetItems(sheet: {
  items?: readonly {
    id: string
    criterion: string
    result?: string
    resultSource?: 'agent' | 'human'
    needsHuman?: boolean
    humanReason?: string
  }[]
} | undefined): string {
  const items = sheet?.items ?? []
  if (items.length === 0) return ''
  const rows = items.map((it) => {
    const result = (it.result ?? '').trim()
    // 来源三态（design/frontend.md）：agent 实测 / 人工填写 / **未标注来源**——缺省不省略，
    // 否则"没标注"与"agent 实测"在界面上长得一样（结果列用 result，不回落 opinion）。
    const src = it.resultSource === 'human'
      ? '人工填写'
      : (it.resultSource === 'agent' ? 'agent 实测' : '未标注来源')
    const human = it.needsHuman === true
      ? '<span class="dsh-pm-flag verify-pending">需人工确认'
        + (it.humanReason !== undefined && it.humanReason !== '' ? '：' + esc(it.humanReason) : '')
        + '</span>'
      : ''
    return '<li><span class="dsh-pm-hint">' + esc(it.id) + '</span> ' + esc(it.criterion)
      + (result !== ''
        ? '<div class="dsh-pm-block-note">实际结果（' + esc(src) + '）：' + esc(result) + '</div>'
        : '')
      + human + '</li>'
  }).join('')
  return '<div class="dsh-pm-block-head"><span class="dsh-pm-hint">验收单逐项</span></div>'
    + '<ul class="dsh-pm-evidence">' + rows + '</ul>'
}

/**
 * 验收区：agent 提交的证据 + 人工审核入口。
 * 人在这里做的事只有一件——**看着证据**点通过或退回（返工必须写意见）。
 */
export function renderVerifySection(req: RequirementRecord): string {
  const v = req.verification
  if (v === undefined) {
    const waiting = req.status === 'implementing' || req.status === 'accepting'
    return '<div class="dsh-pm-block is-empty">'
      + (waiting
        ? '窗口尚未提交验收材料。人工审核前需要证据：窗口用 <code>reqboard_verify_submit</code> 提交「做了什么 + 怎么验的 + 看到什么结果」。'
        : '尚未进入验收阶段。')
      + '</div>'
  }
  const state = v.decision === 'pass'
    ? '<span class="dsh-pm-review" data-state="pass">人工审核通过 ' + esc(v.reviewedAt !== undefined ? fmtTime(v.reviewedAt) : '') + '</span>'
    : v.decision === 'rework'
      ? '<span class="dsh-pm-review" data-state="rework">已退回返工 ' + esc(v.reviewedAt !== undefined ? fmtTime(v.reviewedAt) : '') + '</span>'
      : '<span class="dsh-pm-review" data-state="pending">待人工审核</span>'
  // 裁决按钮已外置到详情头常驻操作条（renderActionBar）。
  // 文案点名**具体位置**（FR-11 #4）：原先指向操作条上那个分组标签，而该标签已按 FR-11 #1 删除。
  const actions = req.status === 'accepting'
    ? '<span class="dsh-pm-hint">请在详情页头部第一行的动作条（「← 看板」右侧）点「验收通过」或「退回返工」</span>'
    : ''
  const evidence = v.evidence.map(e => '<li>' + esc(e) + '</li>').join('')
  return '<div class="dsh-pm-block">'
    + '<div class="dsh-pm-block-head">' + state
    + '<span class="dsh-pm-hint">提交 ' + esc(fmtTime(v.submittedAt)) + '</span>'
    + actions + '</div>'
    + '<div class="dsh-pm-block-summary">' + esc(v.summary) + '</div>'
    + '<ul class="dsh-pm-evidence">' + evidence + '</ul>'
    + renderSheetItems(v.sheet)
    + (v.reviewNote !== undefined ? '<div class="dsh-pm-block-note">审核意见：' + esc(v.reviewNote) + '</div>' : '')
    + '</div>'
}

/**
 * 归档区：需求目录 + 文档清单 + 合并去向 + 索引条目。
 * 归档的实质是**把产出并进项目文档**（合并去向必须落在该需求类型允许的目录里），
 * 需求目录只是原始材料的存底。
 */
export function renderArchiveSection(req: RequirementRecord): string {
  const a = req.archive
  if (a === undefined) {
    const archivable = req.status === 'done'
    return '<div class="dsh-pm-block is-empty">'
      + (archivable
        ? '窗口尚未准备归档材料。归档不是挪目录：窗口用 <code>reqboard_archive_submit</code> 提交需求目录、文档清单、'
          + '合并去向（只允许既有规范目录：docs/ 下的 adr|architecture|guides|rfcs|work-logs|strategy-research）与一句话索引条目，人再点归档；'
          + '必填文档与合并去向按需求类型限定，规范见 docs/architecture/archived-entry.md。'
        : '归档在需求完成（done）后进行；不同需求类型的必填文档与合并去向见 docs/architecture/archived-entry.md。')
      + '</div>'
  }
  // REQ-261006123819-3af3 FR-3（D-2）：已归档 = 需求状态已是 archived（唯一事实源）；
  // 时刻取 statusHistory 里 archived 事件的真实时刻（取不到就不显示时刻，不拿 submittedAt 顶替）。
  const archived = req.status === 'archived'
  const archivedMoment = archivedMomentOf(req)
  const state = archived
    ? '<span class="dsh-pm-review" data-state="pass">已归档'
      + (archivedMoment !== undefined ? ' ' + esc(fmtTime(archivedMoment)) : '') + '</span>'
    : '<span class="dsh-pm-review" data-state="pending">待归档（材料已备）</span>'
  // REQ-261002105242-a3fb FR-4：这里**不再**指向任何人工按钮。
  // 原文案「请在详情头那条分组标签里点『归档』」指向的按钮已于 REQ-9f4a44 随端点一起消失——
  // 留着就是把历史遗留 done 需求的人往一个不存在的地方引。现在只陈述事实与真正的材料入口。
  const actions = req.status === 'done' && !archived
    ? '<span class="dsh-pm-hint">历史遗留 done：归档材料由窗口 agent 用 reqboard_submit(kind=archive) 补齐；该端点已在 REQ-9f4a44 移除，无人工按钮</span>'
    : ''
  const docs = a.docs.map(d => '<li><span class="dsh-pm-doc-kind">' + esc(artifactKindLabel(d.kind)) + '</span> <code>' + esc(d.path) + '</code></li>').join('')
  const merged = a.mergedInto.map(m => '<li><code>' + esc(m) + '</code></li>').join('')
  return '<div class="dsh-pm-block">'
    + '<div class="dsh-pm-block-head">' + state
    + '<code class="dsh-pm-block-path">' + esc(a.dir) + '</code>'
    + '<span class="dsh-pm-hint">材料提交 ' + esc(fmtTime(a.submittedAt)) + '</span>'
    + actions + '</div>'
    + '<div class="dsh-pm-block-summary">索引条目：' + esc(a.indexEntry) + '</div>'
    // REQ-261004183621-de3f FR-5：对账行（列了多少 / 豁免多少 / 漏了什么 / 当时闸门）
    + archiveReconcileLine(req)
    + '<div class="dsh-pm-doc-group"><span class="dsh-pm-hint">需求目录内的文档</span><ul class="dsh-pm-doc-list">' + docs + '</ul></div>'
    + '<div class="dsh-pm-doc-group"><span class="dsh-pm-hint">合并进的项目文档</span><ul class="dsh-pm-doc-list">' + merged + '</ul></div>'
    + renderManualUpdates(a)
    + '</div>'
}

// REQ-260922182638-0777：归档区本地中文表已删除（曾把 requirement 译作「需求说明」，已漂移）——归档清单统一用 artifactKindLabel，requirement 显示「需求文档」。
/** 说明书更新点（金字塔 L1/L2）：归档让项目认知怎么长上去的。 */
export function renderManualUpdates(a: ArchiveRecord): string {
  const updates = a.manualUpdates ?? []
  if (updates.length === 0) {
    return a.manualNote !== undefined
      ? '<div class="dsh-pm-doc-group"><span class="dsh-pm-hint">项目说明书更新</span><div class="dsh-pm-block-summary">无（' + esc(a.manualNote) + '）</div></div>'
      : ''
  }
  const items = updates.map(u =>
    '<li><code>' + esc(u.path) + '</code><span class="dsh-pm-doc-kind">' + esc(manualUpdateLabel(u)) + '</span><span>' + esc(u.summary) + '</span></li>').join('')
  return '<div class="dsh-pm-doc-group"><span class="dsh-pm-hint">项目说明书更新（金字塔向上生长）</span>'
    + '<ul class="dsh-pm-doc-list">' + items + '</ul></div>'
}

/**
 * 说明书更新点的人读标签（REQ-261006201841-944d FR-2）。
 *
 * 新形态：锚点已在 `path` 里（`路径#锚点`）——直接用，不重复拼。
 * 旧形态（历史台账，path 无 `#`）：把废弃的 `section` 回落呈现为 `路径（旧：章节名）`，
 * 两边都不得丢信息（存量不追溯，但必须仍读得懂）。
 */
export function manualUpdateLabel(u: { path: string; section?: string }): string {
  if (u.path.includes('#')) return u.path
  const legacy = typeof u.section === 'string' ? u.section.trim() : ''
  return legacy.length > 0 ? u.path + '（旧：' + legacy + '）' : u.path
}