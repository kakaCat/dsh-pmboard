/**
 * 文档 Tab 的服务端聚合（REQ-261004222448-292a t-43fcf4 / serves: FR-7）——S-10。
 *
 * 四块：**确定文档**逐行铺开（不截断、不折叠）+ 生成物 + 核验表 + 六道门的裁决留痕（+ 归档透传）。
 *
 * 五条口径说明（都是"为什么这么写"）：
 *   ① `state` 优先级：**文件不在 > 待确认 > 已确认**。`file-missing` 必须压过 `confirmed`：
 *      文档章盖过、文件却被删了，页面若显示「已确认」就是骗人（对标现有 `doc-missing` 标灰）。
 *   ② 端口未装配（`deps.docs === undefined`）→ **整块降级**，而不是给每行标 `file-missing`：
 *      `file-missing` 的语义是"登记过但文件确实不在"，端口缺省时我们**无法断言文件在不在**
 *      ——把未知标成"确定缺失"正是 FR-12 要堵的那类谎（T-15/T-16 的文案也不同）。
 *   ③ 「未登记」= 该分类模板要求、但台账里没有登记记录的文档（设计文档集，与 G2 同源判定）。
 *   ④ **`documents` 只装「确定文档」= 人写的交付物**（`isDeliverableDocPath` 的 8 类路径）。
 *      这是缺陷修复（验收现场逮到的"317 行倾倒"）：台账 `artifacts` 里混着**自动扫描**补登的
 *      过程产物——线上实测 317 条里 220 条不是交付物（83 个 `src/*.ts` 之类的 task_output 改动文件、
 *      90 个 `rtm-implementing/t-*.yml`、38 张 prototype 截图、若干 .txt/.json）。
 *      它们不是"人写的文档"，混进同一张表只会让读者数不清也读不完；改由 `discovered`
 *      按后缀分组给**计数 + 3 个样例**（不折叠成一行、不做内层滚动）。
 *   ⑤ **分类只许搬家，不许丢东西**（诚实性判据）：
 *      `documents`（来自台账的那些行）条数 + `discovered` 各分组 count 之和 == 台账产物总数。
 *      所以这里**不按路径去重**：同一路径在台账里登记了两次（如某张卡既是 task_detail 又是
 *      task_output），就如实出两行——去重会让上面这个恒等式对不上，等于悄悄吞掉一条记录。
 *      另注：`unregistered` 的设计文档行**不在**这个恒等式里（它们来自"分类要求但未登记"，
 *      台账里本来就没有这条产物记录，不是被分类搬走的）。
 *
 * @module dsh-pmboard/application/query/QueryDocs
 */
import { fmt } from '../../domain/text/fmt.js'
import {
  flowProfileFor,
  type ArtifactKind,
  type Degrade,
  type DocPanelEntry,
  type DocPanelKind,
  type DocPanelState,
  type DocsResponse,
  type GateVerdict,
  type PanelResult,
  type RequirementRecord,
  type RequirementStatus,
  type StageArtifact,
  type TaskRecord,
} from '../../shared/protocol.js'
import { stagesAfter } from '../../domain/requirement/RollbackSpec.js'
import { designDocPolicyOf, designDocStatus, EMPTY_DESIGN_DOC_POLICY } from '../internal/design-docs.js'
import type { PanelQueryDeps, PanelQueryInput } from './contracts.js'

/** 需求不存在 → 抛 `code='not_found'`（路由层转 404）。 */
function notFound(id: string): Error {
  return Object.assign(new Error(fmt('需求不存在：{id}', { id })), { code: 'not_found' })
}

// ---------------------------------------------------------------------------
// 文档清单
// ---------------------------------------------------------------------------

/**
 * 产物 kind → 面板 kind。
 *
 * 映射是**多对一**（面板的 7 类比产物 9 类粗）：`decomposition` 与 `plan` 同属"计划类"，
 * `task_output` 与 `task_detail` 同属"任务明细"，`archive` 没有独立面板类 → 归 `notes`（兜底类）。
 * 这是协议给定的枚举差异（见最终答复里的契约缺口一节），不是丢字段：path/state 都照实给。
 */
const PANEL_KIND: Readonly<Record<ArtifactKind, DocPanelKind>> = {
  requirement: 'requirement',
  design: 'design',
  plan: 'plan',
  decomposition: 'plan',
  task_detail: 'task-detail',
  task_output: 'task-detail',
  verification: 'verification',
  archive: 'notes',
  notes: 'notes',
}

/** 产物登记态 → 面板 state（文件不在时由调用方盖成 file-missing）。 */
function stateOf(artifact: StageArtifact): DocPanelState {
  return artifact.confirmedAt !== undefined ? 'confirmed' : 'pending'
}

/* ────────────────────────────────────────────────── 确定文档 vs 其它发现 */

/**
 * 「确定文档」的路径白名单（**相对需求目录**）——人写的交付物只有这 8 类：
 * `requirement.md` / `design/*.md` / `decomposition.md` / `tasks/*.md` / `verification.md` /
 * `reviews/*.md` / `tests/*.md` / `evidence/*.md`。
 *
 * 为什么用白名单而不是"排除法"（排除 .png/.yml/…）：排除法里，"没被排除"的东西会**自动**
 * 变成文档——这正是 317 行倾倒的成因（自动扫描补登的 `src/*.ts`、prototype 截图全都在里面）。
 * 白名单把默认值反过来：**认不出的一律不算交付物**，进了 `discovered` 也仍然看得见（计数 + 样例），
 * 不会消失。代价是新增一类交付物时要显式加一行——那是决策，本来就该有人做。
 *
 * 注意白名单**只管需求目录内**的路径：`docs/knowledge/code-map.md`、`templates/design/*.md`
 * 这类仓库级文件就算后缀是 .md 也不是**这条需求**的交付物（它们是任务改动过的文件，
 * 出现在台账里是因为 `task_output` 记的是"改了哪些文件"）。
 */
const DELIVERABLE_DOC_PATTERNS: readonly RegExp[] = [
  /^requirement\.md$/,
  /^decomposition\.md$/,
  /^verification\.md$/,
  /^design\/[^/]+\.md$/,
  /^tasks\/[^/]+\.md$/,
  /^reviews\/[^/]+\.md$/,
  /^tests\/[^/]+\.md$/,
  /^evidence\/[^/]+\.md$/,
]

/** 需求目录前缀（台账路径都是工作区相对路径）。 */
export function reqDirOf(requirementId: string): string {
  return 'docs/requirements/' + requirementId + '/'
}

/** 这一条产物是不是「确定文档」（人写的交付物）。见 `DELIVERABLE_DOC_PATTERNS`。 */
export function isDeliverableDocPath(requirementId: string, path: string): boolean {
  const prefix = reqDirOf(requirementId)
  if (typeof path !== 'string' || !path.startsWith(prefix)) return false
  const rel = path.slice(prefix.length)
  return DELIVERABLE_DOC_PATTERNS.some(re => re.test(rel))
}

/** 分组键：小写后缀（不含点）；无后缀 → `other`（认不出就如实说"认不出"）。 */
function kindOfPath(path: string): string {
  const name = String(path).split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return 'other'
  return name.slice(dot + 1).toLowerCase()
}

/**
 * 非交付物 → **按类型分组的计数**（`discovered`）。
 *
 * 三条口径：
 *  - **每组最多 3 个样例**（`samples`，路径字典序 = 稳定可断言）：页面要能回答"还有多少同类"，
 *    而不是把 220 个路径再倒一遍——样例让人认得出这是什么，计数让人数得清有多少；
 *  - **顺序：条数多的在前**（读者先看到体量最大的那类），同数按 kind 字典序（不依赖 Map 插入序）；
 *  - 分组覆盖**全部**非交付物产物：`Σ count` 必须能对上"台账产物总数 − 确定文档条数"，
 *    任何一条被漏掉都会让页面上的数字对不上账（本条的诚实性判据）。
 */
export function discoveredOf(
  artifacts: readonly StageArtifact[],
  requirementId: string,
): { kind: string; count: number; samples: string[] }[] {
  const groups = new Map<string, string[]>()
  for (const a of artifacts) {
    if (isDeliverableDocPath(requirementId, a.path)) continue
    const kind = kindOfPath(a.path)
    const paths = groups.get(kind)
    if (paths === undefined) groups.set(kind, [a.path])
    else paths.push(a.path)
  }
  return [...groups.entries()]
    .map(([kind, paths]) => ({
      kind,
      count: paths.length,
      samples: [...paths].sort().slice(0, 3),
    }))
    .sort((a, b) => (b.count - a.count) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0))
}

/** 已登记产物 → 文档行（含"文件在不在"）。 */
function entriesOfArtifacts(artifacts: readonly StageArtifact[], exists: (p: string) => boolean): DocPanelEntry[] {
  return artifacts.map(a => ({
    kind: PANEL_KIND[a.kind],
    path: a.path,
    ...(a.registeredAt !== undefined ? { registeredAt: a.registeredAt } : {}),
    state: exists(a.path) ? stateOf(a) : 'file-missing',
  }))
}

/**
 * 该分类模板要求、但尚未登记的设计文档 → `unregistered` 行。
 *
 * 为什么把"没交的"也列出来：少交一份必须是**显式决策**（页面看得见缺口），
 * 而不是靠"列表里没有它"来表达——那与"这台机器上没有文档"分不开（本需求的一贯纪律）。
 * 已声明豁免（`exempted` 有理由）的条目不列：它是显式决策，已在策略里留痕。
 */
async function entriesOfMissingDesignDocs(
  docs: PanelQueryDeps['docs'],
  req: RequirementRecord,
): Promise<DocPanelEntry[]> {
  if (docs === undefined || req.category === undefined) return []
  // 策略来自 requirement.md 的 front-matter：读失败 → 退回空策略（只有必交、无豁免）+ 留 warn，
  // 不因为一份文档读不动就让整个文档面板 500（与 S-5 的"文档不可读 ≠ 500"同款纪律）。
  let policy = EMPTY_DESIGN_DOC_POLICY
  try {
    policy = await designDocPolicyOf(docs, req)
  } catch (err) {
    console.warn('[QueryDocs] requirement.md front-matter 读取失败：设计文档策略按空策略处理', err)
  }
  const status = designDocStatus(req, req.category, policy)
  return status
    .filter(d => !d.submitted && d.exempted === undefined)
    .map(d => ({
      kind: 'design' as const,
      path: d.path,
      state: docs.exists(d.path) ? ('unregistered' as const) : ('file-missing' as const),
    }))
}

/**
 * 生成物（工具重建，不是人写的文档）：`queue.json` 与 `rtm-*.yml`。
 * 只列**确实存在**的（生成物没有"应当存在"的说法；不存在就是还没生成，不是缺失）。
 */
function generatedOf(docs: NonNullable<PanelQueryDeps['docs']>, req: RequirementRecord): { label: string; path: string }[] {
  const dir = 'docs/requirements/' + req.id
  const out: { label: string; path: string }[] = []
  const queuePath = dir + '/queue.json'
  if (docs.exists(queuePath)) out.push({ label: '任务队列（DAG 派生视图）', path: queuePath })
  for (const e of docs.list(dir)) {
    if (!e.isFile || !/^rtm-.*\.ya?ml$/.test(e.name)) continue
    out.push({ label: fmt('需求追溯矩阵（{name}）', { name: e.name }), path: dir + '/' + e.name })
  }
  return out
}

// ---------------------------------------------------------------------------
// 核验表
// ---------------------------------------------------------------------------

/**
 * 验收单 → 面板核验表：**整份照抄**（`req.verification.sheet`）。
 *
 * 为什么不做逐字段重排：已批准的契约 `DocsResponse.verification` 就是 `VerificationSheet`
 * 本身（`shared/protocol.ts`），列（实际结果 `result` / 来源 `resultSource` / 需人工
 * `needsHuman` / 意见 `opinion` / 裁决 `status`）已在其上——重排一次只会多一处漂移点。
 * 另：`design/interfaces.md` §/docs 把那块写成带 `reviewedAt/decision/reviewNote` 的内联形状，
 * 与 protocol 的定义**不一致**；以 protocol 为准（详见最终答复的契约缺口一节）。
 */
function verificationOf(req: RequirementRecord): DocsResponse['verification'] {
  return req.verification?.sheet
}

// ---------------------------------------------------------------------------
// 六道门的裁决留痕
// ---------------------------------------------------------------------------

/** 六道门（顺序 = 流水线顺序；`from`/`to` 只是"这道门在哪"的锚，implementation/archive 无独立弹框门）。 */
const GATES: readonly { gate: GateVerdict['gate']; from?: RequirementStatus; to?: RequirementStatus }[] = [
  { gate: 'requirement', from: 'brainstorming', to: 'design' },
  { gate: 'design', from: 'design', to: 'decomposing' },
  { gate: 'plan', from: 'decomposing', to: 'implementing' },
  { gate: 'implementation' },
  { gate: 'verification', from: 'accepting', to: 'archived' },
  { gate: 'archive' },
]

/** 需求是否**到过**某阶段（状态事件出现，或当前状态已在它之后）。 */
function reached(req: RequirementRecord, stage: RequirementStatus): boolean {
  if (req.status === stage) return true
  if ((req.statusHistory ?? []).some(e => e.status === stage)) return true
  const order: readonly RequirementStatus[] = ['draft', 'brainstorming', 'design', 'decomposing', 'implementing', 'accepting', 'archived']
  const i = order.indexOf(stage)
  const cur = order.indexOf(req.status)
  return i >= 0 && cur >= 0 && cur > i
}

/** 确认方式映射：产物/计划的落章字段 → 面板三值（台账没记方式时**不给**，不猜）。 */
function viaOf(confirmedVia: 'board' | 'session' | undefined, evidence: string | undefined): GateVerdict['via'] {
  if (confirmedVia === 'board') return 'board'
  if (confirmedVia === 'session') {
    // 会话通道有两种：弹框作答与文字证据——两者都写 `confirmedVia='session'` + 答复原文，
    // 台账层不可区分（见最终答复的契约缺口）。有答复原文 = 文字凭据，按 evidence-text 记。
    return evidence !== undefined && evidence.length > 0 ? 'evidence-text' : 'dialog'
  }
  return undefined
}

/** 由产物章判定一道门（G1/G2/G3 的产物侧判据与 `artifact-gates` 同源：kind 的章）。 */
function gateByArtifact(
  req: RequirementRecord,
  kind: ArtifactKind,
  from: RequirementStatus,
  to: RequirementStatus,
): GateVerdict {
  const gate = GATES.find(g => g.from === from && g.to === to)!.gate
  // 分类不走这道门 → 如实记「没到过」（不是缺漏；与 flowProfile 同源）
  if (!flowProfileFor(req.category).confirmGates.includes(from + '>' + to)) {
    return { gate, verdict: 'not-reached' }
  }
  const pool = (req.artifacts ?? []).filter(a => a.kind === kind)
  const stamped = pool.filter(a => a.confirmedAt !== undefined).sort((a, b) => (b.confirmedAt ?? 0) - (a.confirmedAt ?? 0))[0]
  if (stamped !== undefined) {
    return {
      gate,
      verdict: 'passed',
      at: stamped.confirmedAt!,
      ...(stamped.confirmedBy !== undefined ? { by: stamped.confirmedBy } : {}),
      ...(viaOf(stamped.confirmedVia, stamped.confirmedEvidence) !== undefined
        ? { via: viaOf(stamped.confirmedVia, stamped.confirmedEvidence)! }
        : {}),
    }
  }
  // 回退作废留痕：被回退到更早阶段时，晚于目标的章会被清掉（rollback-revocation ①）——
  // 此刻"曾经过门但不再作数"，页面必须能读到"被退回过的理由原文"（UC-4 第 3 条）。
  const rollback = req.rollback
  if (rollback !== undefined && (stagesAfter(rollback.to) as readonly string[]).includes(from)) {
    return {
      gate,
      verdict: 'rejected',
      at: rollback.at,
      by: rollback.by,
      reason: rollback.reason ?? fmt('回退到 {to}：该门的确认章已作废，需重新确认', { to: rollback.to }),
    }
  }
  if (pool.length > 0) {
    return {
      gate,
      verdict: 'pending',
      reason: fmt('产物待人确认：{paths}', { paths: pool.map(a => a.path).join('、') }),
    }
  }
  if (!reached(req, from)) return { gate, verdict: 'not-reached' }
  return { gate, verdict: 'pending', reason: fmt('{from} 阶段尚未登记 {kind} 产物', { from, kind }) }
}

/** 六道门逐门裁决（来源：台账的确认章 / 计划批准 / 评论留痕 + 任务落库事实）。 */
export function buildGateVerdicts(req: RequirementRecord, tasks: readonly TaskRecord[]): GateVerdict[] {
  const out: GateVerdict[] = []
  for (const g of GATES) {
    switch (g.gate) {
      case 'requirement': {
        out.push(gateByArtifact(req, 'requirement', 'brainstorming', 'design'))
        break
      }
      case 'design': {
        out.push(gateByArtifact(req, 'design', 'design', 'decomposing'))
        break
      }
      case 'plan': {
        // G3 有两条并列判据（与 artifact-gates 同源）：decomposition 产物的章，或 plan 的批准章。
        const plan = req.plan
        if (plan?.rejectedAt !== undefined) {
          out.push({
            gate: 'plan',
            verdict: 'rejected',
            at: plan.rejectedAt,
            reason: plan.rejectedReason ?? '计划被退回（未写理由）',
          })
          break
        }
        if (plan?.approvedAt !== undefined) {
          const via = viaOf(plan.approvedVia, plan.approvedEvidence)
          out.push({
            gate: 'plan',
            verdict: 'passed',
            at: plan.approvedAt,
            ...(plan.approvedBy !== undefined ? { by: plan.approvedBy } : {}),
            ...(via !== undefined ? { via } : {}),
          })
          break
        }
        const byArtifact = gateByArtifact(req, 'decomposition', 'decomposing', 'implementing')
        out.push(byArtifact.verdict === 'not-reached' && plan !== undefined
          ? { gate: 'plan', verdict: 'pending', at: plan.submittedAt, reason: '拆分计划已提交，待人工批准' }
          : byArtifact)
        break
      }
      case 'implementation': {
        // 实施门没有独立确认章：判据 = 「已进入实施」+「任务卡已落库」两件既有事实（任务来自队列）。
        const live = tasks.filter(t => t.status !== 'canceled')
        const enteredAt = (req.statusHistory ?? []).filter(e => e.status === 'implementing').slice(-1)[0]
        if (reached(req, 'implementing') && live.length > 0) {
          out.push({
            gate: 'implementation',
            verdict: 'passed',
            ...(enteredAt !== undefined ? { at: enteredAt.at } : {}),
            ...(enteredAt?.by !== undefined ? { by: enteredAt.by } : {}),
          })
          break
        }
        if (reached(req, 'decomposing')) {
          out.push({
            gate: 'implementation',
            verdict: 'pending',
            reason: live.length === 0
              ? '任务卡尚未落库（decompose 不隐式建档）'
              : '任务卡已落库，等人批准拆分计划后开跑',
          })
          break
        }
        out.push({ gate: 'implementation', verdict: 'not-reached' })
        break
      }
      case 'verification': {
        const v = req.verification
        if (v?.decision === 'pass') {
          out.push({
            gate: 'verification',
            verdict: 'passed',
            ...(v.reviewedAt !== undefined ? { at: v.reviewedAt } : {}),
            ...(v.reviewedBy !== undefined ? { by: v.reviewedBy } : {}),
          })
          break
        }
        if (v?.decision === 'rework') {
          out.push({
            gate: 'verification',
            verdict: 'rejected',
            ...(v.reviewedAt !== undefined ? { at: v.reviewedAt } : {}),
            ...(v.reviewedBy !== undefined ? { by: v.reviewedBy } : {}),
            reason: v.reviewNote ?? '验收退回返工（未写意见）',
          })
          break
        }
        // 裁决为准；没有裁决时看产物章（与 artifact-gates 的 accepting 门同源）
        const byArtifact = gateByArtifact(req, 'verification', 'accepting', 'archived')
        if (byArtifact.verdict === 'passed') {
          out.push(byArtifact)
          break
        }
        if (v?.submittedAt !== undefined) {
          out.push({ gate: 'verification', verdict: 'pending', at: v.submittedAt, reason: '验收材料已提交，待人工裁决' })
          break
        }
        if (reached(req, 'accepting')) {
          out.push({ gate: 'verification', verdict: 'pending', reason: '尚未提交验收材料' })
          break
        }
        out.push({ gate: 'verification', verdict: 'not-reached' })
        break
      }
      case 'archive': {
        const a = req.archive
        if (a?.archivedAt !== undefined) {
          out.push({
            gate: 'archive',
            verdict: 'passed',
            at: a.archivedAt,
            ...(a.archivedBy !== undefined ? { by: a.archivedBy } : {}),
          })
          break
        }
        if (a?.submittedAt !== undefined) {
          out.push({ gate: 'archive', verdict: 'pending', at: a.submittedAt, reason: '归档材料已提交，待归档确认' })
          break
        }
        if (reached(req, 'accepting')) {
          out.push({ gate: 'archive', verdict: 'pending', reason: '尚未提交归档材料' })
          break
        }
        out.push({ gate: 'archive', verdict: 'not-reached' })
        break
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// 端点入口
// ---------------------------------------------------------------------------

/** `GET /requirements/:id/docs`：文档全部铺开 + 生成物 + 核验表 + 六道门（+ 归档透传）。 */
export async function queryDocs(
  deps: PanelQueryDeps,
  input: PanelQueryInput,
): Promise<PanelResult<DocsResponse>> {
  // ① 端口未装配 → 整块降级（理由见文件头 ②；**不**把未知标成 file-missing）
  if (deps.docs === undefined) {
    return {
      available: false,
      reason: 'port-unavailable',
      note: '文档读端口未装配：无法判断登记过的文档在不在（不把未知当缺失）',
    }
  }
  const docs = deps.docs

  let req: RequirementRecord | undefined
  try {
    req = await deps.store.get(input.requirementId)
  } catch (err) {
    const degrade: Degrade = {
      available: false,
      reason: 'ledger-unreadable',
      note: fmt('读不到台账：{msg}', { msg: err instanceof Error ? err.message : String(err) }),
    }
    return degrade
  }
  if (req === undefined) throw notFound(input.requirementId)

  let tasks: readonly TaskRecord[] = []
  try {
    tasks = await deps.tasks.listByRequirement(input.requirementId)
  } catch {
    // 队列读不到不影响文档清单（文档来自台账 + 磁盘）；实施门的判据如实退化为「无任务」
    tasks = []
  }

  // 台账产物一分为二（口径见文件头 ④/⑤）：确定文档逐行铺开；其余按后缀分组给计数 + 样例。
  // 两侧共用同一份 `req.artifacts`，**不重不漏**：documents 的台账来源行数 + Σ discovered.count
  // 恒等于 artifacts.length（去重 / 过滤条件一变，先坏的就是这个恒等式）。
  // `reqId` 单独取一份 const：箭头函数里读 `req.id` 会丢掉上面那次 undefined 收窄（TS 不接受
  // 对 `let` 的收窄穿过闭包），而把 `req!` 写进闭包等于人为关掉一处检查。
  const reqId = req.id
  const artifacts = req.artifacts ?? []
  const deliverables = artifacts.filter(a => isDeliverableDocPath(reqId, a.path))
  const discovered = discoveredOf(artifacts, reqId)

  const response: DocsResponse = {
    documents: [
      ...entriesOfArtifacts(deliverables, p => docs.exists(p)),
      ...(await entriesOfMissingDesignDocs(docs, req)),
    ],
    generated: generatedOf(docs, req),
    gates: buildGateVerdicts(req, tasks),
    ...(discovered.length > 0 ? { discovered } : {}),
    ...(req.verification?.sheet !== undefined ? { verification: verificationOf(req) } : {}),
    ...(req.archive !== undefined ? { archive: req.archive } : {}),
  }
  return response
}
