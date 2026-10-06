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
 *   ④ **`documents` 只装「确定文档」= 人写的交付物**（`isDeliverableDocPath` 的白名单路径）。
 *      这是缺陷修复（验收现场逮到的"317 行倾倒"）：台账 `artifacts` 里混着**自动扫描**补登的
 *      过程产物——线上实测 317 条里 220 条不是交付物（83 个 `src/*.ts` 之类的 task_output 改动文件、
 *      90 个 `rtm-implementing/t-*.yml`、38 张 prototype 截图、若干 .txt/.json）。
 *      它们不是"人写的文档"，混进同一张表只会让读者数不清也读不完；改由 `discovered`
 *      按后缀分组给**计数 + 3 个样例**（不折叠成一行、不做内层滚动）。
 *   ⑤ **分类只许搬家，不许丢东西**（诚实性判据）：
 *      `documents`（来自台账的那些行）条数 + `discovered` 各分组 count 之和 == **活卡产物总数**
 *      （REQ-261005193546-1b1a A3：`req.artifacts` 先剔掉「已取消卡名下的任务卡文档」，
 *      即路径以 `/tasks/<task_id>.md` 结尾且该 `task_id` 属**已知**已取消卡的那些产物；
 *      两侧因此**同源同改**——被剔的那份**不**补偿性塞进 `discovered`，否则等于把取消卡又捞回界面).
 *      所以这里**不按路径去重**：同一路径在台账里登记了两次（如某张卡既是 task_detail 又是
 *      task_output），就如实出两行——去重会让上面这个恒等式对不上，等于悄悄吞掉一条记录。
 *      另注：`unregistered` 的设计文档行**不在**这个恒等式里（它们来自"分类要求但未登记"，
 *      台账里本来就没有这条产物记录，不是被分类搬走的）。
 *      磁盘 `tasks/<task_id>.md` **一条不删、一字不改**（INV-3）：审计靠磁盘与台账，不靠本面板；
 *      认不出/不认识的 task id（如队列读不到、卡不在本需求）**一律保留**（不猜"它是不是取消了"）。
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
import { liveCountOf } from '../../domain/status/Predicates.js'
// REQ-261006123819-3af3 FR-3（D-2）：归档时刻的唯一判定点（原先读一个没有写入者的字段）
import { archivedMomentOf } from '../../domain/status/ArchivedMoment.js'
import { liveArtifactsOf } from './live-artifacts.js'
import { normalizeArtifactPath } from '../../domain/artifact/ArtifactPath.js'
import { parseDocument } from '../internal/doc-parse.js'
import { designDocPolicyOf, designDocStatus, EMPTY_DESIGN_DOC_POLICY } from '../internal/design-docs.js'
import type { DocRepository } from '../ports.js'
import type { PanelQueryDeps, PanelQueryInput } from './contracts.js'

/* ─────────────────────────────────────────── 读根：多候选（REQ-261005143615-5ab1 FR-1/FR-2/FR-3） */

/** 一个**可用的读根**：绝对路径 + 该根下的文档读端口。 */
interface DocRootRepo {
  root: string
  docs: DocRepository
}

/**
 * 本次请求的读根表（按序）+ 「根全不可用」标志。
 *
 * 三条口径（都是"为什么不能只用会话根"）：
 *  - **候选由调用方给**（`docRootsOf`）：序是「需求自己声明的工作区 → 阅读会话的工作区 → 组合根 cwd」，
 *    且**只含真实存在的根**——「根不在」与「文件不在」是两件事，前者只能判"未判定"；
 *  - **缺省 = 旧单根行为**（两口都没装配）：直接用 `deps.docs` 那一个端口，
 *    `wired=false`（两口缺省）⇒ 永远不出现 `unknown`、永不注入 `absPath`（既有断言逐字不变）；
 *  - **候选为空但两口已装配**：`wired=true` ⇒ 逐行 `unknown`（这台机器上判不了）。
 */
function resolveDocRepos(
  deps: PanelQueryDeps,
  req: RequirementRecord,
): { repos: DocRootRepo[]; wired: boolean } {
  const { docRootsOf, docsAt, docs } = deps
  if (docRootsOf === undefined || docsAt === undefined) {
    // 旧接线 / 单测桩：单根，且不引入新语义（无 unknown、无 absPath）
    return { repos: docs === undefined ? [] : [{ root: '', docs }], wired: false }
  }
  const roots: string[] = []
  for (const r of docRootsOf(req)) {
    if (typeof r !== 'string' || r.length === 0 || roots.includes(r)) continue
    roots.push(r)
  }
  return { repos: roots.map(root => ({ root, docs: docsAt(root) })), wired: true }
}

/** 逐根按序问「这份文件在不在」：**首个命中**即答案（命中哪个根就用哪个根算绝对路径）。 */
function hitOf(repos: readonly DocRootRepo[], path: string): DocRootRepo | undefined {
  for (const repo of repos) {
    if (repo.docs.exists(path)) return repo
  }
  return undefined
}

/** 命中根的绝对路径；`root` 为空串（旧单根接线）时退回该端口自己的 `resolve`。 */
function absPathOf(repo: DocRootRepo, path: string): string {
  return repo.docs.resolve(path)
}

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
 * 映射是**多对一**（面板的 8 类比产物 10 类粗）：`decomposition` 与 `plan` 同属"计划类"，
 * `task_output` 与 `task_detail` 同属"任务明细"，`archive` 没有独立面板类 → 归 `notes`（兜底类）。
 * 这是协议给定的枚举差异（见最终答复里的契约缺口一节），不是丢字段：path/state 都照实给。
 * `prototype` 一对一（REQ-261005105032-3b02 决议 #30：原型单列，不并进 notes）。
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
  prototype: 'prototype',
}

/** 产物登记态 → 面板 state（文件不在时由调用方盖成 file-missing）。 */
function stateOf(artifact: StageArtifact): DocPanelState {
  return artifact.confirmedAt !== undefined ? 'confirmed' : 'pending'
}

/* ────────────────────────────────────────────────── 确定文档 vs 其它发现 */

/**
 * 「确定文档」的路径白名单（**相对需求目录**）——人写的交付物只有这些类：
 * `requirement.md` / `design/*.md` / `decomposition.md` / `tasks/*.md` / `verification.md` /
 * `reviews/*.md` / `tests/*.md` / `evidence/*.md` / `prototypes/*.html` / `prototypes/INDEX.md` /
 * `prototype/*.html`（旧路径兼容期）。
 *
 * 为什么用白名单而不是"排除法"（排除 .png/.yml/…）：排除法里，"没被排除"的东西会**自动**
 * 变成文档——这正是 317 行倾倒的成因（自动扫描补登的 `src/*.ts`、prototype 截图全都在里面）。
 * 白名单把默认值反过来：**认不出的一律不算交付物**，进了 `discovered` 也仍然看得见（计数 + 样例），
 * 不会消失。代价是新增一类交付物时要显式加一行——那是决策，本来就该有人做。
 *
 * 最后三条是原型（REQ-261005105032-3b02 FR-2 / 决议 #1、#30）：**正则与 `NAME_TO_KIND`
 * （domain/artifact/ArtifactSpec.ts）逐字一致**——交付物判据与产物 kind 判据必须是同一个形状，
 * 否则 kind 已算 `prototype` 的条目会掉进 `discovered`（"交了原型"在页面上仍等于没交）。
 * `prototypes/INDEX.md`（权威清单）自身也是原型产物，故一并进交付物白名单，不落 notes。
 * 末条是**旧路径兼容期**（brief §1 的 REQ-292a 形态 `prototype/<name>.html`）：它同样识别为原型
 * 产物，故也必须算交付物——否则那些需求"交了原型"在页面上仍等于没交；旧登记行的台账 kind
 * （当时写死为 `notes`）不回填，由展示侧 `prototypeGroupOf` 兜底归组。INDEX 迁移完成后**仍保留**
 * 这条识别（删掉会让存量原型的文档 Tab 表现凭空变化）。
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
  /^prototypes\/.+\.html$/, // 权威路径：prototypes/<name>.html
  /^prototypes\/INDEX\.md$/, // 权威清单自身（决议 #1：kind = prototype，不落 notes）
  /^prototype\/.+\.html$/, // 旧路径（REQ-292a 形态）：兼容期仍识别、仍算交付物
]

/** 需求目录前缀（台账路径都是工作区相对路径）。 */
export function reqDirOf(requirementId: string): string {
  return 'docs/requirements/' + requirementId + '/'
}

/** 任务卡文档的产物路径形状与「是否属已取消卡」的判据，已提到**单点**
 * `./live-artifacts.js`（REQ-261005193546-1b1a FR-5 / A3）：同一处泄漏在文档面板与
 * 阶段详情追溯链上都出现过，判据必须只有一个定义，故不再在本文件各签一份。 */

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
 *  - 分组覆盖**调用方给的这一份**产物清单：`Σ count` 必须能对上「清单长度 − 确定文档条数」，
 *    任何一条被漏掉都会让页面上的数字对不上账（本条的诚实性判据）。调用方 `queryDocs` 传的是
 *    **已按 A3 剔掉取消卡任务卡文档**的那份（两侧同源同改，故恒等式仍闭合）。
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

/* ────────────────────────────────────── 原型权威清单（INDEX）→ 面板角色 */

/** 权威清单的路径（**需求目录相对**；决议 #1：它的产物 kind 也是 prototype）。 */
const PROTOTYPE_INDEX_REL = 'prototypes/INDEX.md'

/** 面板行要带的原型角色（决议 #32：两个键都是可选，缺省不注入）。 */
interface PrototypeRoleOf {
  role: 'authoritative' | 'superseded'
  /** 与 INDEX「被取代于」列同值；只在 superseded 且该列非空时给出。 */
  supersededBy?: string
}

/**
 * INDEX 的「路径」列 → 台账口径（工作区相对）。
 *
 * 决议 #2 定的是**需求目录相对**（`prototypes/x.html`），但同一张表也可能被人按台账口径写成
 * `docs/requirements/<REQ>/prototypes/x.html`——两种写法指的是同一个文件，认一种而把另一种
 * 当"没列"会让权威标记凭空消失（读者看到的是"未标权威角色"，那是假的）。故两种都认：
 * 先过 `normalizeArtifactPath`（去 `./`、挡 `..` 逃逸与伪路径），再按需补需求目录前缀。
 * 认不出的（伪路径 / 越界 / 空串）→ undefined，调用方跳过（不猜）。
 */
function indexRowToLedgerPath(raw: string, requirementId: string): string | undefined {
  const norm = normalizeArtifactPath(raw, '/')
  if (norm.form !== 'workspace' || norm.path.length === 0) return undefined
  const prefix = reqDirOf(requirementId)
  if (norm.path.startsWith(prefix)) return norm.path
  return prefix + norm.path
}

/**
 * `prototypes/INDEX.md` 正文 → 「台账路径 → 角色」（纯函数，决议 #32 的投影源）。
 *
 * 三条口径（都是"为什么不猜"）：
 *  - 用既有 `parseDocument` 解析表格（brief §1：不引 HTML 解析库；INDEX 是 Markdown 表格）；
 *  - 列名认「路径」「状态」两列，缺任一一列的那张表**整张跳过**（不是随便找张表就当权威清单）；
 *  - 「状态」不是 `authoritative` / `superseded` 的行**跳过**（认不出就如实当"没列"，
 *    而不是猜一个角色——猜错会把作废版标成权威，这是本需求最不能出的错）。
 */
export function prototypeRolesFromIndexText(
  text: string,
  requirementId: string,
): Map<string, PrototypeRoleOf> {
  const out = new Map<string, PrototypeRoleOf>()
  for (const table of parseDocument(text).tables) {
    const head = table.header.map(h => h.trim())
    const iPath = head.indexOf('路径')
    const iState = head.indexOf('状态')
    if (iPath < 0 || iState < 0) continue
    const iBy = head.indexOf('被取代于')
    for (const row of table.rows) {
      const rawPath = (row[iPath] ?? '').trim()
      const state = (row[iState] ?? '').trim()
      if (rawPath.length === 0) continue
      if (state !== 'authoritative' && state !== 'superseded') continue
      const path = indexRowToLedgerPath(rawPath, requirementId)
      if (path === undefined) continue
      const supersededBy = iBy < 0 ? '' : (row[iBy] ?? '').trim()
      out.set(path, {
        role: state,
        // 「被取代于」为空（违反 I2 的行）→ 不注入该键：宁可只说"被取代"，
        // 也不给一个空串当"被取代于"（空串在后端读起来像一个真路径）。
        ...(state === 'superseded' && supersededBy.length > 0 ? { supersededBy } : {}),
      })
    }
  }
  return out
}

/**
 * 读 INDEX → 角色表。**读不到就返回空表**（两个键都不注入），绝不伪造角色：
 * 没有 INDEX / 文件不在 / 读失败 / 解析不出表，四件事在这里是同一个结果——"角色未知"。
 * 读失败单独 warn：这不是"没有权威清单"，而是"读不动"，留痕便于排查（不当成缺失处理）。
 */
async function prototypeRolesOf(
  repos: readonly DocRootRepo[],
  requirementId: string,
): Promise<Map<string, PrototypeRoleOf>> {
  const indexPath = reqDirOf(requirementId) + PROTOTYPE_INDEX_REL
  const hit = hitOf(repos, indexPath)
  if (hit === undefined) return new Map()
  try {
    return prototypeRolesFromIndexText(await hit.docs.read(indexPath), requirementId)
  } catch (err) {
    console.warn('[QueryDocs] prototypes/INDEX.md 读取失败：原型角色一律不投影（不伪造权威版本）', err)
    return new Map()
  }
}

/**
 * 产物的原型元数据 → 面板投影：**只带锚点清单**（FR-2/FR-4，frontend.md「呈现项」第 3 行）。
 *
 * 为什么只带锚点：
 *  - 面板只需要回答"这份原型有没有可判的抓手（有/缺锚点）"；几何量的**值**属于设计文档与门禁，
 *    不是文档 Tab 的信息；
 *  - 更关键的是**阈值红线**（D-10 + 决议 #8/#49）：原型只放观测量名与实测值，阈值由设计阶段
 *    定死、原型不自证。把 `value` 摆到页面上，等于让原型稿的实测数字冒充判据。
 *
 * 未采集（旧产物缺 `prototypeMeta`）或形状不对（anchors 不是数组）→ undefined，调用方不注入该键
 * （"未采集"与"采集到 0 条"必须能分辨，决议 #50：加性变更、读侧不判坏）。
 */
function prototypeMetaOf(a: StageArtifact): DocPanelEntry['prototypeMeta'] {
  const meta = a.prototypeMeta
  if (meta === undefined || !Array.isArray(meta.anchors)) return undefined
  return {
    anchors: meta.anchors
      // 脏数据（null / 非对象元素）不许把渲染路径打崩：跳过，而不是让它冒到面板上
      .filter(x => x !== null && typeof x === 'object')
      .map(x => ({ fr: String(x.fr ?? ''), selector: String(x.selector ?? '') })),
  }
}

/**
 * 已登记产物 → 文档行（含"文件在不在"，REQ-261005143615-5ab1 FR-1/FR-3/FR-4）。
 *
 * 三态判据（**一个可用根都没有时不许说"缺失"**）：
 *  - 命中某个候选根 → `stateOf(a)` + 该根的 `absPath`；
 *  - 候选根可用但逐根都没找到 → `file-missing`（登记过、文件确实不在）；
 *  - 候选根集合为空（端口已装配、一个根都不存在）→ `unknown`（判不了），且**不注入** `absPath`。
 */
function entriesOfArtifacts(
  artifacts: readonly StageArtifact[],
  repos: readonly DocRootRepo[],
  wired: boolean,
  roles: ReadonlyMap<string, PrototypeRoleOf>,
): DocPanelEntry[] {
  return artifacts.map((a) => {
    // 原型角色（权威 / 被取代）只在这条路径出现在 INDEX 里时才注入：**缺省不注入**
    // ——没读到 INDEX、或 INDEX 没列这条路径，"角色未知"与"角色是某某"必须能分辨（决议 #32）。
    const role = roles.get(a.path)
    const meta = prototypeMetaOf(a)
    const hit = hitOf(repos, a.path)
    const state: DocPanelState = hit !== undefined
      ? stateOf(a)
      : (repos.length === 0 && wired ? 'unknown' : 'file-missing')
    return {
      kind: PANEL_KIND[a.kind],
      path: a.path,
      ...(a.registeredAt !== undefined ? { registeredAt: a.registeredAt } : {}),
      state,
      ...(hit === undefined || !wired ? {} : { absPath: absPathOf(hit, a.path) }),
      ...(role === undefined
        ? {}
        : {
          prototypeRole: role.role,
          ...(role.supersededBy !== undefined ? { supersededBy: role.supersededBy } : {}),
        }),
      ...(meta === undefined ? {} : { prototypeMeta: meta }),
    }
  })
}

/**
 * 该分类模板要求、但尚未登记的设计文档 → `unregistered` 行。
 *
 * 为什么把"没交的"也列出来：少交一份必须是**显式决策**（页面看得见缺口），
 * 而不是靠"列表里没有它"来表达——那与"这台机器上没有文档"分不开（本需求的一贯纪律）。
 * 已声明豁免（`exempted` 有理由）的条目不列：它是显式决策，已在策略里留痕。
 */
async function entriesOfMissingDesignDocs(
  repos: readonly DocRootRepo[],
  wired: boolean,
  req: RequirementRecord,
): Promise<DocPanelEntry[]> {
  if (req.category === undefined) return []
  // 策略来自 requirement.md 的 front-matter：命中哪个根就从哪个根读；一个根都没有 → 空策略。
  // 读失败 → 退回空策略（只有必交、无豁免）+ 留 warn，不因为一份文档读不动就让整个文档面板 500
  // （与 S-5 的"文档不可读 ≠ 500"同款纪律）。
  const reqPath = 'docs/requirements/' + req.id + '/requirement.md'
  const primary = hitOf(repos, reqPath)?.docs ?? repos[0]?.docs
  let policy = EMPTY_DESIGN_DOC_POLICY
  if (primary !== undefined) {
    try {
      policy = await designDocPolicyOf(primary, req)
    } catch (err) {
      console.warn('[QueryDocs] requirement.md front-matter 读取失败：设计文档策略按空策略处理', err)
    }
  }
  const status = designDocStatus(req, req.category, policy)
  return status
    .filter(d => !d.submitted && d.exempted === undefined)
    .map((d) => {
      const hit = hitOf(repos, d.path)
      if (hit !== undefined) {
        return {
          kind: 'design' as const,
          path: d.path,
          state: 'unregistered' as const,
          ...(wired ? { absPath: absPathOf(hit, d.path) } : {}),
        }
      }
      return {
        kind: 'design' as const,
        path: d.path,
        state: repos.length === 0 && wired ? ('unknown' as const) : ('file-missing' as const),
      }
    })
}

/**
 * 生成物（工具重建，不是人写的文档）：`queue.json` 与 `rtm-*.yml`。
 * 只列**确实存在**的（生成物没有"应当存在"的说法；不存在就是还没生成，不是缺失）。
 *
 * REQ-261005143615-5ab1 FR-4：按候选根**逐根收**（同路径去重、序首优先），命中哪个根就带该根
 * 的 `absPath`。一个可用根都没有 → 无从枚举，如实给空表（"列不出"不等于"没有"，故这里不造行）。
 */
function generatedOf(repos: readonly DocRootRepo[], req: RequirementRecord, wired: boolean): { label: string; path: string; absPath?: string }[] {
  const dir = 'docs/requirements/' + req.id
  const out: { label: string; path: string; absPath?: string }[] = []
  const seen = new Set<string>()
  const push = (label: string, path: string, repo: DocRootRepo): void => {
    if (seen.has(path)) return
    seen.add(path)
    out.push({ label, path, ...(wired ? { absPath: absPathOf(repo, path) } : {}) })
  }
  const queuePath = dir + '/queue.json'
  for (const repo of repos) {
    const hit = hitOf([repo], queuePath)
    if (hit !== undefined) push('任务队列（DAG 派生视图）', queuePath, hit)
    for (const e of repo.docs.list(dir)) {
      if (!e.isFile || !/^rtm-.*\.ya?ml$/.test(e.name)) continue
      const path = dir + '/' + e.name
      if (hitOf([repo], path) !== undefined) push(fmt('需求追溯矩阵（{name}）', { name: e.name }), path, repo)
    }
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
        // 判据来源收编为单点（REQ-261005193546-1b1a FR-4 · INV-4）：此处原为手写的取消比较式。
        const liveCount = liveCountOf(tasks)
        const enteredAt = (req.statusHistory ?? []).filter(e => e.status === 'implementing').slice(-1)[0]
        if (reached(req, 'implementing') && liveCount > 0) {
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
            reason: liveCount === 0
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
        // REQ-261006123819-3af3 FR-3（D-2）：判据从「无写入者的归档时间字段」改为**需求状态**。
        // 已归档是终态且是唯一事实源；时刻取 statusHistory 里 archived 事件的真实 at。
        if (req.status === 'archived') {
          const at = archivedMomentOf(req)
          out.push({
            gate: 'archive',
            verdict: 'passed',
            // 拿不到时刻就**整体省略** at 键（不发 undefined / null——无损 JSON 铁律）
            ...(at !== undefined ? { at } : {}),
          })
          break
        }
        // 材料已备但需求还没到 archived
        if (a?.submittedAt !== undefined) {
          out.push({ gate: 'archive', verdict: 'pending', at: a.submittedAt, reason: '归档材料已提交，待归档确认' })
          break
        }
        // 未提交材料（22 条无清单需求落这一支——与上一支是**不同的诚实状态**）
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
  // ① 端口未装配 → 整块降级（理由见文件头 ②；**不**把未知标成 file-missing）。
  // REQ-261005143615-5ab1：多根两口（`docRootsOf` + `docsAt`）齐备也算装配好——只要有一条路
  // 能看到盘，就不该说"读端口未装配"。
  if (deps.docs === undefined && (deps.docRootsOf === undefined || deps.docsAt === undefined)) {
    return {
      available: false,
      reason: 'port-unavailable',
      note: '文档读端口未装配：无法判断登记过的文档在不在（不把未知当缺失）',
    }
  }

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
  // 两侧共用同一份产物清单，**不重不漏**：documents 的台账来源行数 + Σ discovered.count
  // 恒等于「活卡产物总数」= artifacts.length − 取消卡名下产物条数（去重 / 过滤条件一变，
  // 先坏的就是这个恒等式）。
  // A3（REQ-261005193546-1b1a FR-5 / INV-F）：已取消卡名下的任务卡文档在此**一次性**剔除，
  // 于是 documents 与 discovered 两侧同源同改——**不**把剔掉的那份补偿性塞进 discovered
  // （那就是换一条路把取消卡捞回界面，与 D-7「不给任何计数交代」冲突）。
  // 原型（REQ-261005105032-3b02）从 discovered 搬到 documents 时**两侧同源同改**：搬运的唯一
  // 开关就是上面白名单里的两行正则（`discoveredOf` 与这里共用 `isDeliverableDocPath`），
  // 所以"搬过去"与"不要再留在 discovered"不可能各改一半。
  // `reqId` 单独取一份 const：箭头函数里读 `req.id` 会丢掉上面那次 undefined 收窄（TS 不接受
  // 对 `let` 的收窄穿过闭包），而把 `req!` 写进闭包等于人为关掉一处检查。
  const reqId = req.id
  // 读根表（REQ-261005143615-5ab1 FR-1/FR-2）：候选序由调用方给，这里只决定"用哪个根判存在"。
  const { repos, wired } = resolveDocRepos(deps, req)
  // 已取消卡的 id 集合与产物过滤：判据走**单点** `live-artifacts.js`（活卡判据的补集口径），
  // 本文件与阶段详情装配器共用同一份定义，不写 `status vs 'canceled'` 字面量（INV-4）。
  const artifacts = liveArtifactsOf(req.artifacts ?? [], tasks)
  const deliverables = artifacts.filter(a => isDeliverableDocPath(reqId, a.path))
  const discovered = discoveredOf(artifacts, reqId)
  // 原型角色（权威 / 被取代）：读不到 INDEX 就是空表（两个键都不注入），不伪造（决议 #32）。
  const prototypeRoles = await prototypeRolesOf(repos, reqId)

  const response: DocsResponse = {
    documents: [
      ...entriesOfArtifacts(deliverables, repos, wired, prototypeRoles),
      ...(await entriesOfMissingDesignDocs(repos, wired, req)),
    ],
    generated: generatedOf(repos, req, wired),
    gates: buildGateVerdicts(req, tasks),
    ...(discovered.length > 0 ? { discovered } : {}),
    ...(req.verification?.sheet !== undefined ? { verification: verificationOf(req) } : {}),
    ...(req.archive !== undefined ? { archive: req.archive } : {}),
  }
  return response
}
