/**
 * 分类文档集（REQ-d3e61a T-13 / T-14 · FR-15）：立项类型决定要哪些文档、每份写什么必填节。
 *
 * **两层结构**（T-14 定的形）：
 *   BASE（COMMON_ROOT_SECTIONS）——所有类型都必须有的根文档节，**只定义一次**；
 *   DELTA（CATEGORY_DELTAS）——只有该类型才有的节 + 该类型要求的设计文档。
 *   门禁校验 = BASE + DELTA[类型]。
 *
 * 为什么两层：六份完整副本必然各自漂移（本仓有"两份真相"的教训）。BASE 抽出来后，
 * **删掉 BASE 里任何一条 → 六类同时拒绝**——这既是纪律也是可测的性质。
 *
 * 为什么另立模块而不改 protocol.ts：该文件正被另一窗口占用。本模块是**新增的并列能力**，
 * 不替换既有阶段档案，只回答"这个类型的文档有没有交齐"。
 *
 * 标记载体（同卡）：**逐条状态只存表格行**；front-matter 只放文档级索引——
 * 两处都写必然漂移，故提供 frontmatterStateViolations() 机械探测。
 *
 * REQ-261005105032-3b02 FR-1/FR-2（conditionalStageArtifacts）：本模块再回答一问——
 * **「该类型 + 该端侧声明下，某个节点还必交哪些阶段产物」**。原型（kind=prototype）是
 * 需求阶段的条件必交产物：只有 UI 需求（sides 含 frontend 的 feature / refactor）才要。
 * 与条件必交设计文档同形同源——同一份 sides 解析、同一套条件命中语义，避免两套判定漂移。
 *
 * @module dsh-pmboard/application/internal/category-doc-sets
 */
import { fmt } from '../../domain/text/fmt.js'
import { STAGE_ARTIFACT_REQUIREMENTS, type ArtifactKind } from '../../domain/artifact/ArtifactSpec.js'
import type { StageKey } from '../../domain/requirement/RequirementStatus.js'

/** BASE：共同骨架——所有立项类型都必须有的根文档节。**只在这里定义一次**。 */
export const COMMON_ROOT_SECTIONS: readonly string[] = ['边界']

// 为什么只留「边界」：它是六类**唯一真正共同**的必填节——"不做什么"是范围纪律的唯一防线，
// feature 的 PRD、bug 的缺陷报告、spike 的调研笔记都得回答它。其余节都是类型专属（见 DELTA）。
// 骨架条目少不代表约束弱：**删除任何一条都会让六类同时拒绝**（tests/base-delta.test.ts 锁死这条性质）。

/** 条件必交设计文档（REQ-2d1c74 FR-1）：需求声明含对应端侧改动时才要求。 */
export interface ConditionalDesignDoc {
  /** 文件名（位于 design/ 目录），目前只有 frontend.md / backend.md */
  name: string
  /** 触发条件：需求声明的端侧 */
  side: 'frontend' | 'backend'
}

/**
 * 条件必交**阶段产物**（REQ-261005105032-3b02 FR-1/FR-2）：需求声明含对应端侧时，
 * 该节点还必须有这个 kind 的产物。
 *
 * 与 ConditionalDesignDoc 的区别只在粒度：设计文档按**文件名**判，阶段产物按
 * **kind** 判（原型落 `prototypes/*.html`，文件名由 agent 定，判不了名字）。
 *
 * 为什么带 stage：条件必交的语义是「**哪个节点**必须交」，阶段必备产物的并集
 * （见 requiredStageArtifactKinds）要按 stage 取，不能只按 kind。
 */
export interface ConditionalStageArtifact {
  /** 生效的节点（stage） */
  stage: StageKey
  /** 该节点必须有的产物 kind */
  kind: ArtifactKind
  /** 触发条件：需求声明的端侧 */
  side: 'frontend' | 'backend'
}

export interface CategoryDocDelta {
  category: string
  /** 类型专属必填节（不含 BASE） */
  rootSectionsDelta: readonly string[]
  /** 必须存在的设计文档（文件名，位于 docs/requirements/<REQ>/design/） */
  requiredDesignDocs: readonly string[]
  /** 条件必交：需求声明（front-matter sides）含对应端侧时才要求（REQ-2d1c74 FR-1） */
  conditionalDesignDocs?: readonly ConditionalDesignDoc[]
  /** 条件必交的**阶段产物**（REQ-261005105032-3b02 FR-1/FR-2） */
  conditionalStageArtifacts?: readonly ConditionalStageArtifact[]
}

/**
 * 设计文档策略（REQ-2d1c74 FR-1）：从 requirement.md front-matter 解析的端侧声明与豁免声明。
 * 豁免表**原样保留**（含无效条目）——有效性在 missingCategoryDocs 判定时才结论，
 * 无效豁免要在缺失清单里注明，先过滤就把证据弄丢了。
 */
export interface DesignDocPolicy {
  /** 端侧声明（值域 {frontend, backend}，其余忽略） */
  sides: readonly string[]
  /** 豁免表：文件名 → 理由（design_exempt 的 `文件名=理由` 分号分隔表） */
  exempt: Readonly<Record<string, string>>
}

const VALID_SIDES: ReadonlySet<string> = new Set(['frontend', 'backend'])

/**
 * front-matter 里的「列表值」——**两种写法必须等价**：`a, b` 与 YAML 流式写法 `[a, b]`。
 *
 * 为什么必须单独处理（REQ-261004222448-292a 事故）：doc-parse.ts 的 front-matter 解析取的是
 * `key: value` 的**原样字符串**，不会展开 YAML 数组；此处原先只 `.split(',')`，于是
 * `[frontend, backend, doc]` 被切成 `"[frontend"` / `"backend"` / `"doc]"`，经 VALID_SIDES 过滤后
 * **只剩 backend**——frontend 被静默丢弃，条件必交的 `frontend.md` 永远不会被要。
 * 而插件自己的模板（templates/brainstorming/feature.md）教的正是括号写法 ⇒ 照模板写的需求
 * 一律拿不到前端设计文档（该需求就是纯 UI 需求却没有 frontend.md）。
 * 全仓实测：括号写法且声明 frontend 的 6 条需求 0 条有 frontend.md；逗号写法 3 条 3 条都有。
 */
export function frontmatterList(value: string | undefined): string[] {
  const raw = (value ?? '').trim()
  if (raw === '') return []
  const inner = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw
  return inner
    .split(',')
    .map(s => stripQuotes(s.trim()))
    .filter(s => s.length > 0)
}

/** 去掉成对包裹的引号（YAML 允许 `[ "frontend" , backend ]`）。 */
function stripQuotes(s: string): string {
  if (s.length >= 2) {
    const first = s[0]
    if ((first === '"' || first === "'") && s[s.length - 1] === first) return s.slice(1, -1).trim()
  }
  return s
}

/** 从 requirement.md front-matter 解析端侧声明与豁免声明（纯函数，零 IO）。 */
export function designDocPolicyFrom(frontmatter: Readonly<Record<string, string>>): DesignDocPolicy {
  const sides = frontmatterList(frontmatter['sides']).filter(s => VALID_SIDES.has(s))
  // 豁免表同样容忍括号包裹；条目之间仍按 `;` 分隔——理由里可能含逗号，按逗号切会切坏理由。
  const exemptRaw = (frontmatter['design_exempt'] ?? '').trim()
  const exemptText = exemptRaw.startsWith('[') && exemptRaw.endsWith(']') ? exemptRaw.slice(1, -1) : exemptRaw
  const exempt: Record<string, string> = {}
  for (const pair of exemptText.split(';')) {
    const trimmed = pair.trim()
    if (trimmed === '') continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue // 无等号或空键 → 畸形条目，跳过（按未豁免处理）
    const key = trimmed.slice(0, eq).trim()
    const reason = trimmed.slice(eq + 1).trim()
    exempt[key] = reason
  }
  return { sides, exempt }
}

/**
 * 端侧声明的**合法性缺口**（0 条 = 合规）——`sides` 是条件必交的**唯一触发器**，
 * 缺声明或写非法值原本都被静默过滤（见 frontmatterList 上方的事故注释）：
 * 过滤发生在判定之前，于是「没写」与「写了 doc」长得一模一样，条件必交文档永不触发且无人报错。
 *
 * 口径（只对 front-matter 里真的存在 key 的类型判）：
 *   ① **key 必须存在**——缺 `sides` = 无从区分"忘了写"与"确实没有端侧改动"；
 *   ② **值域合法**——每个列出的值必须 ∈ {frontend, backend}，出现 `doc` 这类值即点名；
 *   ③ **显式空列表合法**（`sides: []` = 「本需求无端侧改动」的明确声明）——
 *      空列表是自洽的声明，不是遗漏；要求非空会逼纯工具/纯文档类需求写假话。
 *
 * 为什么放在本模块：VALID_SIDES 与 frontmatterList 是端侧语义的唯一事实源，
 * 合法性判定必须与解析同源，否则两处值域迟早分叉（本仓「两份真相」教训）。
 */
export function sidesDeclarationGap(
  category: string | undefined,
  frontmatter: Readonly<Record<string, string>>,
): string | undefined {
  // 只有依赖 sides 做条件必交判定的类型才强制声明；bug/spike/doc/chore 没有条件必交文档。
  if (category !== 'feature' && category !== 'refactor') return undefined
  const raw = frontmatter['sides']
  if (raw === undefined) {
    return fmt('缺 front-matter `sides` 声明——{category} 类型的条件必交设计文档（frontend.md / backend.md）由它触发，不写就永远判不出该不该交', { category })
  }
  if (raw.trim() === '') {
    return 'front-matter `sides` 声明为空串——要么写 sides: []（明确声明无端侧改动），要么写出实际端侧'
  }
  const declared = frontmatterList(raw)
  const illegal = declared.filter(s => !VALID_SIDES.has(s))
  if (illegal.length > 0) {
    return fmt('front-matter `sides` 含非法值 {list}（合法值只有 frontend / backend）', { list: illegal.join('、') })
  }
  return undefined
}

/** 该类型 + 端侧声明下的有效设计文档清单（必交 ∪ sides 命中的条件必交），供闸门与呈现投影共用。 */
export function effectiveDesignDocs(
  category: string | undefined,
  sides: readonly string[] = [],
): { name: string; conditional?: 'frontend' | 'backend' }[] {
  const delta = deltaFor(category)
  if (delta === undefined) return []
  const docs: { name: string; conditional?: 'frontend' | 'backend' }[] = delta.requiredDesignDocs.map(name => ({ name }))
  for (const c of delta.conditionalDesignDocs ?? []) {
    if (sides.includes(c.side)) docs.push({ name: c.name, conditional: c.side })
  }
  return docs
}

/**
 * 该类型 + 端侧声明下命中的**条件必交阶段产物**（REQ-261005105032-3b02 FR-1/FR-2）。
 *
 * 与 effectiveDesignDocs 同构同口径：同吃一份 sides（由 designDocPolicyFrom 解析，
 * 括号 / 逗号写法等价），命中 side 才进清单；未知类型 / 未命中 → `[]`（不拦）。
 *
 * 为什么返回整个条目而不是 kind 数组：调用方（原型存在门）要判的是
 * 「**这个节点**是否被要求交 **这个 kind**」，stage + kind 都得在手上。
 * 判据只有这一处——门禁与看板都从本函数取，避免又长出一份「什么算 UI 需求」的真相。
 */
export function conditionalStageArtifactsFor(
  category: string | undefined,
  sides: readonly string[] = [],
): ConditionalStageArtifact[] {
  const delta = deltaFor(category)
  if (delta === undefined) return []
  return (delta.conditionalStageArtifacts ?? []).filter(c => sides.includes(c.side))
}

/**
 * 某节点的**必备产物 kind** = `STAGE_ARTIFACT_REQUIREMENTS[stage]` ∪ 条件命中项
 * （REQ-261005105032-3b02 FR-1/FR-2）。
 *
 * 为什么单独成函数：`STAGE_ARTIFACT_REQUIREMENTS` 是**无条件**基线（feature 全流水线），
 * 条件必交（如 UI 需求的原型）必须叠加在它之上；把叠加规则写在这一处，
 * 调用方（阶段产物门禁）就不必各自记得"还要并入条件项"——漏并即后门。
 * 去重是因为同一 kind 可能既在基线又命中条件（当前无此例，但语义上不该重复计数）。
 */
export function requiredStageArtifactKinds(
  stage: StageKey,
  category: string | undefined,
  sides: readonly string[] = [],
): ArtifactKind[] {
  const base = STAGE_ARTIFACT_REQUIREMENTS[stage] ?? []
  const conditional = conditionalStageArtifactsFor(category, sides)
    .filter(c => c.stage === stage)
    .map(c => c.kind)
  return [...new Set<ArtifactKind>([...base, ...conditional])]
}

/**
 * DELTA：类型增量。与规范 §0.3 一一对应——
 *   feature  产品定义/用户/功能点 + 全套设计
 *   bug      **复现步骤** / 期望 vs 实际 / 根因 / 回归（免 PRD 那套用户角色，但不取消追溯）
 *   refactor 现状 / 目标结构 / **行为不变式** + 架构与迁移
 *   spike    待答问题 / 结论
 *   doc      目标读者 / 大纲
 *   chore    完成判据（最简）
 */
export const CATEGORY_DELTAS: readonly CategoryDocDelta[] = [
  // REQ-2d1c74 FR-1：feature 全套 = 五份必交（补 use-cases.md）+ 端侧条件必交（frontend/backend）。
  // REQ-261005105032-3b02 FR-1/FR-2：再加一条**阶段产物**条件必交——UI 需求需求阶段必交原型。
  //
  // 「失败与并发路径」（2026-10-06 文档质量门禁加固）**刻意不放进 DELTA**：DELTA 是
  // 「所有该类型需求都必须有」的口径，而 `missingCategoryDocs` 会在**拆分提交 / 设计门 / 自检**
  // 上对**存量需求**一起判——放进来就等于追溯存量（与「存量不追溯」冲突，实测会让在飞的老需求
  // 提交拆分计划时被新节拦住）。它改为**按需求创建时间的提交期门**（`docQualityRulesApply`）：
  // 见 content-gate-wiring 的 `docSectionGateFailure`；模板里照旧有这一节（照模板写的需求天然满足）。
  { category: 'feature', rootSectionsDelta: ['产品定义', '用户与角色', '功能点'], requiredDesignDocs: ['architecture.md', 'data-model.md', 'interfaces.md', 'test-cases.md', 'use-cases.md'], conditionalDesignDocs: [{ name: 'frontend.md', side: 'frontend' }, { name: 'backend.md', side: 'backend' }], conditionalStageArtifacts: [{ stage: 'brainstorming', kind: 'prototype', side: 'frontend' }] },
  { category: 'bug', rootSectionsDelta: ['复现步骤', '根因', '回归'], requiredDesignDocs: [] },
  // 重构同样常改前端表现（原型是"改成什么样"的唯一可核验载体）：与 feature 同档登记。
  { category: 'refactor', rootSectionsDelta: ['现状', '目标结构', '行为不变式'], requiredDesignDocs: ['architecture.md', 'migration.md'], conditionalStageArtifacts: [{ stage: 'brainstorming', kind: 'prototype', side: 'frontend' }] },
  { category: 'spike', rootSectionsDelta: ['待答问题', '结论'], requiredDesignDocs: [] },
  { category: 'doc', rootSectionsDelta: ['目标读者', '大纲'], requiredDesignDocs: [] },
  { category: 'chore', rootSectionsDelta: ['完成判据'], requiredDesignDocs: [] },
]

/** 取某类型的 DELTA（未知类型 → undefined，不拦）。 */
export function deltaFor(category: string | undefined): CategoryDocDelta | undefined {
  if (category === undefined) return undefined
  return CATEGORY_DELTAS.find(s => s.category === category)
}

/** 该类型要求的根文档必填节 = BASE + DELTA。base 可注入（便于验证"删掉 BASE 会怎样"）。 */
export function requiredRootSectionsFor(
  category: string | undefined,
  base: readonly string[] = COMMON_ROOT_SECTIONS,
): string[] {
  const delta = deltaFor(category)
  if (delta === undefined) return []
  return [...base, ...delta.rootSectionsDelta]
}

export interface CategoryDocCheckInput {
  category?: string
  /** 根文档是否存在（不存在 → 还没到可判阶段，不报缺失） */
  rootExists: boolean
  rootText: string
  designNames: readonly string[]
  /** 注入 BASE（默认共同骨架）；传 [] 即"把 BASE 删空" */
  base?: readonly string[]
  /** 端侧声明（REQ-2d1c74 FR-1）：命中后对应条件必交文档转为必交 */
  sides?: readonly string[]
  /** 豁免表（REQ-2d1c74 FR-1）：文件名 → 理由；未知键/空理由 = 豁免无效 */
  exempt?: Readonly<Record<string, string>>
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 根文档里是否存在某**节**。刻意用"标题 + 可选编号"的精确匹配，而不是子串包含——
 * 子串会让 spike 的必填节「待答问题」冒充 BASE 的「问题」，导致节被删掉却判为存在（实测踩过）。
 *
 * **标题装饰一律容忍**（REQ-261005105032-3b02 t14 修同族缺陷 D-5）：节名之后允许跟
 *  ① 全角/半角括号或冒号开头的注解——`## 边界（不做什么）`；
 *  ② **行尾 HTML 注释**——`## 产品定义 <!-- serves: FR-1 -->`（模板惯例，见 `templates/brainstorming/feature.md`）。
 * 为什么必须容忍②（实测 D-5）：本仓模板给必填节标题统一追加 `<!-- serves: FR-1 -->`，而本函数原先
 * 只认①，于是**照模板写出来的 requirement.md 被判"缺必填节「产品定义」「用户与角色」"**（实测
 * `missingCategoryDocs` 对模板渲染结果返回 2 条缺口）——模板与门禁口径分叉，双方都不报错。
 * 修法选"门禁容忍装饰"而不是"改模板写法"：装饰容忍本来就是本函数的既有语义（①），
 * HTML 注释只是同一类装饰；改模板则是给本仓添第四种 serves 写法（已有 反引号 / HTML 注释 / 括号 三种），
 * 且会让照 `feature-example.md` 等旧版式写的文档继续踩同一个坑。
 * 收紧的边界保持不变：**节名本身仍须逐字命中标题开头**（`## 功能点清单` 不会冒充「功能点」）。
 */
export function hasRootSection(rootText: string, name: string): boolean {
  const re = new RegExp('^#{1,6}\\s*(?:[0-9]+\\s*[.、]\\s*)?' + escapeRe(name) + '\\s*(?:[（(:：].*|<!--.*?-->)?\\s*$', 'm')
  return re.test(rootText)
}

/** 缺失清单（人读文案） = BASE + DELTA 的根文档节 + DELTA 的设计文档。 */
export function missingCategoryDocs(input: CategoryDocCheckInput): string[] {
  const delta = deltaFor(input.category)
  if (delta === undefined) return []
  if (!input.rootExists) return []

  const missing: string[] = []
  for (const sec of requiredRootSectionsFor(input.category, input.base)) {
    if (!hasRootSection(input.rootText, sec)) missing.push(fmt('requirement.md 缺必填节「{sec}」', { sec }))
  }
  // REQ-2d1c74 FR-1：有效必交 = 必交 ∪ sides 命中的条件必交 − 有效豁免。
  // 豁免有效性：键命中该类型文档集（必交 ∪ 全部条件必交）且理由非空；
  // 未知键/空理由 = 豁免无效，按未豁免处理并在缺失清单中注明（数据模型设计 §2）。
  const knownDocs = new Set([
    ...delta.requiredDesignDocs,
    ...(delta.conditionalDesignDocs ?? []).map(c => c.name),
  ])
  const exempt = input.exempt ?? {}
  for (const { name: doc } of effectiveDesignDocs(input.category, input.sides ?? [])) {
    if (input.designNames.includes(doc)) continue
    const reason = exempt[doc]
    if (reason !== undefined && reason.trim() !== '') continue // 有效豁免
    if (reason !== undefined) {
      missing.push(fmt('design/{doc} 未交（豁免无效：理由为空）', { doc }))
    } else {
      missing.push(fmt('design/{doc} 未交', { doc }))
    }
  }
  for (const key of Object.keys(exempt)) {
    if (!knownDocs.has(key)) missing.push(fmt('design_exempt 含未知键「{key}」（不在该类型文档集内，豁免不生效）', { key }))
  }
  return missing
}

/**
 * 标记载体规则（T-14）：**逐条状态只存表格行**。front-matter 只放**文档级**索引
 * （req_id / title / status / owner / category …）。
 *
 * 违反形态：把逐条状态塞进 front-matter——键里带编号（如 FR1_status / t-aaa111_evidence）。
 * 两处都写必然漂移（本仓"两份真相"教训），故机械探测并回报。
 */
export const FRONTMATTER_PER_ITEM_KEY = /(?:FR|BUG|RF|SP|DOC|CH|TC)-?\d|^t-[0-9a-f]{6}/i

export function frontmatterStateViolations(frontmatter: Readonly<Record<string, string>>): string[] {
  return Object.keys(frontmatter).filter(k => FRONTMATTER_PER_ITEM_KEY.test(k))
}
