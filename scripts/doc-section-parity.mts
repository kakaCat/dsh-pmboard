/**
 * R2 —— 文档节名双向一致探针（REQ-261005105032-3b02 t19 · FR-10 · design-brief §6 · 决议 #17/#47）。
 *
 * 解决什么问题：门禁必填节集合与模板 H2 集合是**同一个契约的两处写法**。单向包含会漏两种漂移：
 *   「模板多写一节」→ 那一节没有门禁要求，写不写都对 ⇒ 门禁与模板悄悄分叉（D-5 的形态）；
 *   「门禁少一节」  → 门禁在要求一节模板里根本没有的节 ⇒ 照模板写必被拒。
 * 本探针把两侧拉成**双向相等**并逐节点名。
 *
 * 两侧的集合从哪里来（**不手抄**）
 *   · 门禁侧 = 运行时常量 `COMMON_ROOT_SECTIONS`（BASE）+ `CATEGORY_DELTAS[category].rootSectionsDelta`（DELTA）
 *     + **裁定门节名** `讨论与裁定记录（D-x）`（FR-8 的裁定落账门；brief §3 / 执行裁定第 6 节 t19 条③）
 *     ——前两项**直接 import 真常量**，本脚本不复制一份（复制就是第三处真相）；
 *     裁定节**只在 feature 需求上被要求**（D-12）：本脚本把它登记为 `featureOnly`，
 *     并在其它五类上断言"门禁不要求它、模板也没有它"——这是双向比对里 D-12 的具体体现。
 *   · 模板侧 = `templates/brainstorming/<category>.md` 的 **H2 标题**（剥掉 `<!-- serves: -->` 装饰与
 *     括号注解后与门禁节名判等；括号注解的容忍口径与 `hasRootSection` 同源）。
 *
 * 四条不变量（任何一条破 → exit 1，逐节点名 + 说明破了哪条）
 *   ① 门禁要求 ⊆ 模板 H2     —— 「模板少一节」
 *   ② 模板 H2 ⊆ 本脚本登记表 —— 「模板多一节」（没登记 = 没人管的节）
 *   ③ 登记表中 `level=required` 的节 == 门禁要求的节（**双向相等**，不是单向）
 *   ④ 登记表中 `level=optional` 的节 ∉ 门禁要求的节（可选节的语义 = 门禁不要求；否则就是矛盾）
 *
 * 覆盖范围（如实声明，不含糊）：只覆盖**需求根文档**——它是唯一"H2 节名与门禁必填节一一对应"的文档类。
 *   设计文档的门禁判据是 `checkDesignSectionsHaveServes`（**每个 H2 都要 serves**，与"H2 叫什么"无关），
 *   由 R1 守；拆分/任务卡/验收至今没有门禁必填节集合（t20/t21 的改动面）。
 *   本脚本**显式列出**这些类为"未覆盖"，避免读者把"没报错"读成"已覆盖"。
 *
 * 退出码（决议 #47）：0 = 双向一致；1 = 判据失败；2 = 前置不可用（模板目录/渲染无关资源不可读、真模板本身没过）。
 *
 * 用法：
 *   npx tsx scripts/doc-section-parity.mts                 # 人读；退出码 0/1/2
 *   npx tsx scripts/doc-section-parity.mts --json          # stdout 只输出可 JSON.parse 的结构
 *   npx tsx scripts/doc-section-parity.mts --templates-dir <dir>
 *   npx tsx scripts/doc-section-parity.mts --specimen      # 跑四组内置反例（两个方向 × 两处篡改）
 *   npx tsx scripts/doc-section-parity.mts --specimen=template-extra-section,gate-missing-section
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { CATEGORY_DELTAS, COMMON_ROOT_SECTIONS, deltaFor } from '../src/application/internal/category-doc-sets.js'
import { parseDocument } from '../src/application/internal/content-gates.js'
import { stripHeadingDecorations } from '../src/application/query/QueryTrunk.js'

/* ── 常量 ──────────────────────────────────────────────────────────────────── */

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')
const DEFAULT_TEMPLATES_DIR = join(REPO_ROOT, 'templates')

/** 裁定门节名（brief §3 逐字；FR-8 的裁定落账门按它定位）。 */
export const DECISION_SECTION = '讨论与裁定记录（D-x）'

/** 六类需求模板（门禁侧 BASE+DELTA 逐类对应）。 */
const CATEGORIES = ['feature', 'bug', 'refactor', 'spike', 'doc', 'chore'] as const
type Category = typeof CATEGORIES[number]

const TEMPLATE_OF: Readonly<Record<Category, string>> = {
  feature: 'templates/brainstorming/feature.md',
  bug: 'templates/brainstorming/bug.md',
  refactor: 'templates/brainstorming/refactor.md',
  spike: 'templates/brainstorming/spike.md',
  doc: 'templates/brainstorming/doc.md',
  chore: 'templates/brainstorming/chore.md',
}

/** 该节的强度：required = 门禁必填（不变量③要求它与门禁集合逐字相等）；optional = 模板可写、门禁不拦。 */
type SectionLevel = 'required' | 'optional'

interface SectionDecl {
  name: string
  level: SectionLevel
  /** 门禁侧要求的出处（required 必填；optional 省略）——"凭什么是必填"必须能追到代码，不许只是这里写着。 */
  gatedBy?: 'BASE' | 'DELTA' | 'DECISION_GATE'
  /**
   * 该节**只在 feature 模板上**存在/被要求（D-12）。其它五类上必须"门禁不要求、模板也没有"，
   * 否则就是 D-12 被破（例如把 D-x 节抄进 bug 模板 = 又一处分叉）。
   */
  featureOnly?: true
  /** 为什么它是可选节（optional 必填）——写给后来者，防止"看到就删"。 */
  whyOptional?: string
}

/**
 * 登记表：**模板声明了哪些 H2**（不变量②的比对底本）。
 *
 * 为什么要有这张表而不是"模板有什么就算什么"：不变量②要能判「模板多一节」——这一节没有门禁要求、
 * 也没登记，说明它既不属于"门禁要求的"，也没人声明"这是模板有意的可选节"，那就是不受任何约束的自由节。
 * 自由节是分叉的温床（模板加了、门禁不知道、提示词也不知道），所以必须显式登记。
 */
const REGISTRY: Readonly<Record<Category, readonly SectionDecl[]>> = {
  feature: [
    { name: '边界', level: 'required', gatedBy: 'BASE' },
    { name: '产品定义', level: 'required', gatedBy: 'DELTA' },
    { name: '用户与角色', level: 'required', gatedBy: 'DELTA' },
    { name: '功能点', level: 'required', gatedBy: 'DELTA' },
    { name: DECISION_SECTION, level: 'required', gatedBy: 'DECISION_GATE', featureOnly: true },
    { name: 'TL;DR', level: 'optional', whyOptional: '人读三件套之一（有提示词软门禁 readabilityHints，不属必填节门禁）' },
    { name: '业务流程图', level: 'optional', whyOptional: '人读三件套之一（同上，提示词层要求）' },
    { name: '非功能需求', level: 'optional', whyOptional: '有明确指标才写，没有就不写（见模板原文）' },
    { name: '验收标准', level: 'optional', whyOptional: '节名是「验收标准（整体）」，与门禁必填节集合无对应项' },
    { name: '关键决策与取舍', level: 'optional', whyOptional: '需求详情页按写死节名抽取（QueryTrunk），不是提交门禁' },
    { name: '技术方案与亮点', level: 'optional', whyOptional: '同上（详情页抽取用）' },
    { name: '依赖与约束', level: 'optional', whyOptional: '外部依赖/前置条件，非必填' },
  ],
  bug: [
    { name: '边界', level: 'required', gatedBy: 'BASE' },
    { name: '复现步骤', level: 'required', gatedBy: 'DELTA' },
    { name: '根因', level: 'required', gatedBy: 'DELTA' },
    { name: '回归', level: 'required', gatedBy: 'DELTA' },
    // 为什么不是 '目标'：hasRootSection 要求节名逐字命中标题开头，门禁要的是 DELTA 里的「回归」；
    // 该模板此节标题为「回归」——逐字一致。
    { name: '背景与动机', level: 'optional', whyOptional: '通用叙述节，门禁不要求' },
    { name: '目标', level: 'optional', whyOptional: '通用叙述节，门禁不要求' },
    { name: '非目标', level: 'optional', whyOptional: '通用叙述节，门禁不要求' },
    { name: '验收标准', level: 'optional', whyOptional: '通用叙述节，门禁不要求' },
    { name: '改动位置', level: 'optional', whyOptional: '行为改动区（只有改系统行为的类型有）' },
    { name: '改动对比', level: 'optional', whyOptional: '行为改动区（同上）' },
    { name: '关键决策与取舍', level: 'optional', whyOptional: '详情页抽取用' },
    { name: '技术方案与亮点', level: 'optional', whyOptional: '详情页抽取用' },
    { name: '修订记录', level: 'optional', whyOptional: '文档版本记录' },
  ],
  refactor: [
    { name: '边界', level: 'required', gatedBy: 'BASE' },
    { name: '现状', level: 'required', gatedBy: 'DELTA' },
    { name: '目标结构', level: 'required', gatedBy: 'DELTA' },
    { name: '行为不变式', level: 'required', gatedBy: 'DELTA' },
    { name: '项目背景与动机', level: 'optional', whyOptional: '通用叙述节' },
    { name: '产品目标', level: 'optional', whyOptional: '通用叙述节' },
    { name: '非目标', level: 'optional', whyOptional: '通用叙述节' },
    { name: '术语与措辞纪律', level: 'optional', whyOptional: '写作纪律节' },
    { name: '验收标准', level: 'optional', whyOptional: '通用叙述节' },
    { name: '用户分析', level: 'optional', whyOptional: '分析节' },
    { name: '用户与角色', level: 'optional', whyOptional: '分析节（模板标题为「用户与角色（用户分析）」）' },
    { name: '核心场景', level: 'optional', whyOptional: '分析节' },
    { name: '业务流程', level: 'optional', whyOptional: '人读三件套之一' },
    { name: '改动位置', level: 'optional', whyOptional: '行为改动区' },
    { name: '改动对比', level: 'optional', whyOptional: '行为改动区' },
    { name: '数据对象关系', level: 'optional', whyOptional: '按需扩展节' },
    { name: '功能点', level: 'optional', whyOptional: '模板标题为「功能点（需求条款）」，非门禁必填节' },
    { name: '功能点明细', level: 'optional', whyOptional: '按需扩展节' },
    { name: '数据埋点', level: 'optional', whyOptional: '按需扩展节' },
    { name: '非功能需求', level: 'optional', whyOptional: '有指标才写' },
    { name: '风险评估', level: 'optional', whyOptional: '按需节' },
    { name: '迭代计划', level: 'optional', whyOptional: '按需节' },
    { name: '关键决策与取舍', level: 'optional', whyOptional: '详情页抽取用' },
    { name: '技术方案与亮点', level: 'optional', whyOptional: '详情页抽取用' },
    { name: '版本记录', level: 'optional', whyOptional: '文档版本记录' },
  ],
  spike: [
    { name: '边界', level: 'required', gatedBy: 'BASE' },
    { name: '待答问题', level: 'required', gatedBy: 'DELTA' },
    { name: '结论', level: 'required', gatedBy: 'DELTA' },
    { name: '背景与动机', level: 'optional', whyOptional: '通用叙述节' },
    { name: '目标', level: 'optional', whyOptional: '通用叙述节' },
    { name: '非目标', level: 'optional', whyOptional: '通用叙述节' },
    { name: '验收标准', level: 'optional', whyOptional: '通用叙述节' },
    { name: '数据与方法', level: 'optional', whyOptional: '调研过程节' },
    { name: '关键决策与取舍', level: 'optional', whyOptional: '详情页抽取用' },
    { name: '技术方案与亮点', level: 'optional', whyOptional: '详情页抽取用' },
    { name: '修订记录', level: 'optional', whyOptional: '文档版本记录' },
  ],
  doc: [
    { name: '边界', level: 'required', gatedBy: 'BASE' },
    { name: '目标读者', level: 'required', gatedBy: 'DELTA' },
    { name: '大纲', level: 'required', gatedBy: 'DELTA' },
    { name: '背景与动机', level: 'optional', whyOptional: '通用叙述节' },
    { name: '目标', level: 'optional', whyOptional: '通用叙述节' },
    { name: '非目标', level: 'optional', whyOptional: '通用叙述节' },
    { name: '验收标准', level: 'optional', whyOptional: '通用叙述节' },
    { name: '关键决策与取舍', level: 'optional', whyOptional: '详情页抽取用' },
    { name: '技术方案与亮点', level: 'optional', whyOptional: '详情页抽取用' },
    { name: '修订记录', level: 'optional', whyOptional: '文档版本记录' },
  ],
  chore: [
    { name: '边界', level: 'required', gatedBy: 'BASE' },
    { name: '完成判据', level: 'required', gatedBy: 'DELTA' },
    { name: '背景与动机', level: 'optional', whyOptional: '通用叙述节' },
    { name: '目标', level: 'optional', whyOptional: '通用叙述节' },
    { name: '非目标', level: 'optional', whyOptional: '通用叙述节' },
    { name: '验收标准', level: 'optional', whyOptional: '通用叙述节' },
    { name: '关键决策与取舍', level: 'optional', whyOptional: '详情页抽取用' },
    { name: '技术方案与亮点', level: 'optional', whyOptional: '详情页抽取用' },
    { name: '修订记录', level: 'optional', whyOptional: '文档版本记录' },
  ],
}

/* ── 门禁侧集合（直接来自运行时真常量） ──────────────────────────────────────── */

/**
 * 门禁"必填节"集合 = BASE + DELTA[category]（+ feature 的裁定门节名）。
 *
 * 关键：BASE 与 DELTA **从 category-doc-sets 真常量取**，本脚本不复制它们的字面量——
 * 复制一份就等于第三处真相，改门禁时这里悄悄过期（R2 立刻变成假绿）。
 * 裁定节不在那两份常量里（它是 decision-gates 的判据），故显式并入并标注 featureOnly（D-12）。
 */
export function gateSectionsFor(category: Category): { base: string[]; delta: string[]; decision: string[] } {
  const delta = deltaFor(category)
  const deltaSections = delta === undefined ? [] : [...delta.rootSectionsDelta]
  return {
    base: [...COMMON_ROOT_SECTIONS],
    delta: deltaSections,
    decision: category === 'feature' ? [DECISION_SECTION] : [],
  }
}

/** 门禁要求的节集合（扁平、去重）。 */
export function gateRequiredSet(category: Category): string[] {
  const g = gateSectionsFor(category)
  return [...new Set([...g.base, ...g.delta, ...g.decision])]
}

/** 模板声明表里标着 required 的节集合。 */
export function registryRequiredSet(category: Category): string[] {
  return REGISTRY[category].filter(s => s.level === 'required').map(s => s.name)
}

/* ── 模板 H2 抽取 ──────────────────────────────────────────────────────────── */

/**
 * 剥掉节名上的**括号注解**，让「边界（不做什么）」与门禁要的「边界」判等。
 *
 * 为什么剥：`hasRootSection` 的容忍口径就是"节名 + 可选注解"（`## 边界（不做什么）` 判为有「边界」），
 * 而模板里 6/6 份的边界节都带括号注解——不剥的话 R2 会对**所有**模板误报「门禁少一节：边界」。
 * 为什么不复用 `hasRootSection` 本身：它判的是"某节名在不在"，方向固定为"节名 → 文本"；
 * 本脚本要的是"文本里到底声明了哪些节"（反方向），故用同一个剥离口径自取。
 */
export function stripSectionAnnotation(name: string): string {
  return name.replace(/（.*?）\s*$/, '').trim()
}

/**
 * 一个节名的**两种可判等写法**：原样 + 剥注解。
 *
 * 为什么不能只留剥注解那一种（实测踩到）：裁定门节名 `讨论与裁定记录（D-x）` **自带括号里的编号**，
 * 把它也剥掉会得到「讨论与裁定记录」——于是模板里逐字写对的 `## 讨论与裁定记录（D-x）`
 * 会被判成「模板多一节 + 门禁少一节」两条假红。括号里的 `D-x` 是节名的**组成部分**（不是装饰），
 * 而「（不做什么）」才是装饰——两种写法都认，才不会把"节名里带括号"当成"注解"。
 */
function nameVariants(name: string): string[] {
  const bare = stripSectionAnnotation(name)
  return bare === name ? [name] : [name, bare]
}

/** 模板 H2 原文（剥 serves 注释装饰）→ 判等用节名候选（原样 + 剥注解）。 */
export function templateSectionNames(text: string): string[] {
  return parseDocument(text)
    .headings
    .filter(h => h.level === 2)
    .map(h => stripHeadingDecorations(h.text).trim())
    .filter(n => n.length > 0)
}

/* ── 判据 ──────────────────────────────────────────────────────────────────── */

export interface CategoryParity {
  category: Category
  templatePath: string
  templateSections: string[]
  gateRequired: string[]
  registryRequired: string[]
  /** 不变量①：门禁要求、模板没有 → 「模板少一节」。 */
  templateMissing: string[]
  /** 不变量②：模板有、登记表里没登记 → 「模板多一节」。 */
  templateExtra: string[]
  /** 不变量③：门禁要求 ≠ 登记表 required（两个方向分别报）。 */
  gateMissingFromRegistry: string[]
  registryRequiredNotInGate: string[]
  /** 不变量④：登记为 optional 却被门禁要求。 */
  optionalButGated: string[]
  /** D-12：非 feature 类上出现了 featureOnly 的节（门禁不该要求、模板不该有）。 */
  featureOnlyViolations: string[]
  ok: boolean
}

export interface ParityOutput {
  script: 'doc-section-parity'
  criterion: string
  templatesDir: string
  categories: CategoryParity[]
  /**
   * 覆盖性自查：本脚本的类别清单必须与门禁真常量 `CATEGORY_DELTAS` 的类别**一一对应**。
   *
   * 为什么这条本身也是判据：类别清单少写一类（比如只列 feature）= 那一类**不受 R2 保护**却
   * 整跑绿灯——"双向相等"就成了对子集的断言（最坏的一种静默）；清单多写一类（门禁里没有）=
   * 门禁集合取空、反而会报一堆假红。两个方向都要点名。
   */
  categoryCoverageGaps: string[]
  /** 未覆盖的文档类与原因（如实声明，不静默）。 */
  notCovered: { docClass: string; why: string }[]
  categoryCount: number
  passed: number
  driftCount: number
  status: 'PASS' | 'FAIL'
  exitCode: 0 | 1 | 2
}

/** 对一类需求做双向比对。 */
function checkCategory(category: Category, templatesDir: string): CategoryParity {
  const templatePath = TEMPLATE_OF[category]
  const abs = join(templatesDir, templatePath.slice('templates/'.length))
  const rawSections = templateSectionNames(readFileSync(abs, 'utf8'))
  const gateRequired = gateRequiredSet(category)
  const registryRequired = registryRequiredSet(category)
  const registryNames = REGISTRY[category].map(s => s.name)

  // 判等（两个方向都要归一，缺一个就假红——实测踩过）：
  //   门禁/登记表的节名 → 变体（原样 + 剥注解），如「边界」与「讨论与裁定记录（D-x）」；
  //   模板 H2 原文 → 也取变体（原样 + 剥注解），如「边界（不做什么）」的剥注解形是「边界」。
  // 任一侧的剥注解形命中另一侧的变体即算同一节。
  const has = (raw: readonly string[], name: string): boolean => {
    const targets = nameVariants(name)
    return raw.some(s => nameVariants(s).some(v => targets.includes(v)))
  }
  const declared = (raw: readonly string[], names: readonly string[]): boolean =>
    names.some(n => has(raw, n))

  const templateMissing = gateRequired.filter(s => !has(rawSections, s))
  const templateExtra = rawSections.filter(s => !declared([s], registryNames))
  const gateMissingFromRegistry = gateRequired.filter(s => !registryRequired.includes(s))
  const registryRequiredNotInGate = registryRequired.filter(s => !gateRequired.includes(s))
  const optionalButGated = REGISTRY[category]
    .filter(s => s.level === 'optional' && gateRequired.includes(s.name))
    .map(s => s.name)
  const featureOnlyViolations: string[] = []
  if (category !== 'feature') {
    // D-12：非 feature 类上，featureOnly 的节既不该被门禁要求，也不该出现在模板里
    if (gateRequired.includes(DECISION_SECTION)) featureOnlyViolations.push('门禁对 ' + category + ' 要求了 featureOnly 的节「' + DECISION_SECTION + '」（D-12 被破）')
    if (has(rawSections, DECISION_SECTION)) featureOnlyViolations.push('模板 ' + templatePath + ' 里出现了 featureOnly 的节「' + DECISION_SECTION + '」（D-12：该节仅 feature 模板）')
  }

  const ok = templateMissing.length === 0 && templateExtra.length === 0
    && gateMissingFromRegistry.length === 0 && registryRequiredNotInGate.length === 0
    && optionalButGated.length === 0 && featureOnlyViolations.length === 0

  return {
    category, templatePath, templateSections: rawSections, gateRequired, registryRequired,
    templateMissing, templateExtra, gateMissingFromRegistry, registryRequiredNotInGate,
    optionalButGated, featureOnlyViolations, ok,
  }
}

/** 跑一遍双向比对（不打印、不 exit）。 */
export function probeParity(templatesDir: string = DEFAULT_TEMPLATES_DIR): ParityOutput {
  if (!existsSync(templatesDir)) throw new Error('模板目录不存在：' + templatesDir)
  const categories = CATEGORIES.map(c => checkCategory(c, templatesDir))

  // 覆盖性自查（见 ParityOutput.categoryCoverageGaps 的注释）：两侧类别必须一一对应
  const gateCategories = CATEGORY_DELTAS.map(d => d.category).sort()
  const myCategories = [...CATEGORIES].sort()
  const categoryCoverageGaps: string[] = []
  for (const c of gateCategories) {
    if (!(myCategories as readonly string[]).includes(c)) {
      categoryCoverageGaps.push('门禁有类别「' + c + '」而本脚本没覆盖它（该类不受 R2 保护却整跑绿灯）')
    }
  }
  for (const c of myCategories) {
    if (!gateCategories.includes(c)) {
      categoryCoverageGaps.push('本脚本列了类别「' + c + '」而门禁的 CATEGORY_DELTAS 里没有它（门禁集合会取空 → 假红）')
    }
  }

  const passed = categories.filter(c => c.ok).length
  const driftCount = categories.reduce((n, c) => n
    + c.templateMissing.length + c.templateExtra.length
    + c.gateMissingFromRegistry.length + c.registryRequiredNotInGate.length
    + c.optionalButGated.length + c.featureOnlyViolations.length, 0) + categoryCoverageGaps.length
  const status: 'PASS' | 'FAIL' = driftCount === 0 ? 'PASS' : 'FAIL'
  return {
    script: 'doc-section-parity',
    criterion: '门禁必填节集合（COMMON_ROOT_SECTIONS + CATEGORY_DELTAS.rootSectionsDelta + feature 的裁定门节名「' + DECISION_SECTION + '」）与 templates/brainstorming/<category>.md 的 H2 集合双向相等；登记表 required 与门禁要求逐字相等；optional 不得被门禁要求；featureOnly 节不得出现在其它五类；本脚本覆盖的类别必须与 CATEGORY_DELTAS 一一对应',
    templatesDir,
    categories,
    categoryCoverageGaps,
    notCovered: [
      { docClass: 'design（8 份）', why: '设计文档的门禁判据是「每个 H2 都要 serves」（checkDesignSectionsHaveServes），与"H2 叫什么"无关，由 R1 守；无"必填节名集合"可比' },
      { docClass: 'decomposition / task-card / verification', why: '至今没有门禁必填节集合（t20/t21 的改动面）；R1 只对它们做"最贴近既有门禁"的子集判据' },
      { docClass: 'examples / report / doc-note', why: '非阶段产物模板，无门禁' },
    ],
    categoryCount: categories.length,
    passed,
    driftCount,
    status,
    exitCode: status === 'PASS' ? 0 : 1,
  }
}

/* ── 人读输出 ──────────────────────────────────────────────────────────────── */

function printHuman(out: ParityOutput): void {
  for (const g of out.categoryCoverageGaps) console.error('   - [覆盖自查] ' + g)
  for (const c of out.categories) {
    if (c.ok) {
      console.log('OK   ' + c.templatePath + '（门禁必填 ' + String(c.gateRequired.length) + ' 节 == 登记 required '
        + String(c.registryRequired.length) + ' 节；模板 H2 ' + String(c.templateSections.length) + ' 节，双向一致）')
      continue
    }
    console.error('FAIL ' + c.templatePath + '（category=' + c.category + '）')
    for (const s of c.templateMissing) console.error('   - [模板少一节] 门禁要求「' + s + '」，模板 H2 里没有')
    for (const s of c.templateExtra) console.error('   - [模板多一节] 模板 H2「' + s + '」没登记在本脚本的节名登记表里（门禁不要求它）')
    for (const s of c.gateMissingFromRegistry) console.error('   - [门禁少一节] 门禁要求「' + s + '」，登记表的 required 里没有')
    for (const s of c.registryRequiredNotInGate) console.error('   - [登记多一节] 登记表 required 有「' + s + '」，门禁不要求（应改成 optional 或补门禁）')
    for (const s of c.optionalButGated) console.error('   - [级别矛盾] 「' + s + '」登记为 optional 却被门禁要求')
    for (const s of c.featureOnlyViolations) console.error('   - [D-12] ' + s)
  }
  const line = '需求模板 ' + String(out.categoryCount) + ' 类：OK ' + String(out.passed) + ' / FAIL ' + String(out.categoryCount - out.passed)
    + '；双向漂移 ' + String(out.driftCount) + '；exit ' + String(out.exitCode)
  if (out.driftCount === 0) console.log(line)
  else console.error(line)
}

/* ── 逆验证反例 ────────────────────────────────────────────────────────────── */

interface Specimen {
  name: string
  direction: 'template-extra' | 'gate-missing'
  proves: string
  /** 在临时模板副本上做坏。 */
  breakIt: (root: string) => void
  /** 期望在判据输出里出现的片段。 */
  expectNamed: string[]
  /** 期望命中的不变量字段（自检用）。 */
  expectField: 'templateExtra' | 'templateMissing' | 'featureOnlyViolations'
}

/** 不变量名的机器可判写法（人读文案只在 printHuman 里；--json 里出现的是这些字段名）。 */
const FIELD_TOKEN_NAME = {
  templateExtra: 'templateExtra',
  templateMissing: 'templateMissing',
  featureOnlyViolations: 'featureOnlyViolations',
} as const

const SPECIMENS: Specimen[] = [
  {
    name: 'template-extra-section',
    direction: 'template-extra',
    proves: '「模板多一节」：模板加了一节而门禁不要求 → 必红并点名该节（单向包含会放过这一种）',
    breakIt: root => {
      const p = join(root, 'brainstorming/feature.md')
      const text = readFileSync(p, 'utf8')
      const anchor = '## 边界（不做什么）'
      if (!text.includes(anchor)) throw new Error('注入锚点没命中：' + anchor)
      writeFileSync(p, text.replace(anchor, '## 多出来的一节\n\n（门禁不要求的自由节）\n\n' + anchor))
    },
    expectNamed: ['多出来的一节', FIELD_TOKEN_NAME.templateExtra],
    expectField: 'templateExtra',
  },
  {
    name: 'gate-missing-section',
    direction: 'gate-missing',
    proves: '「门禁少一节」：登记表 required 少一节 → 必红并点名该节（证明③不是单向包含）',
    breakIt: root => {
      const p = join(root, 'brainstorming/feature.md')
      const text = readFileSync(p, 'utf8')
      const anchor = '## 用户与角色'
      if (!text.includes(anchor)) throw new Error('注入锚点没命中：' + anchor)
      writeFileSync(p, text.replace(anchor, '## 用户与角色被改名\n'))
    },
    expectNamed: ['用户与角色', FIELD_TOKEN_NAME.templateMissing],
    expectField: 'templateMissing',
  },
  {
    name: 'decision-section-missing',
    direction: 'gate-missing',
    proves: 'D-12 裁定节被删 → 必红并点名「' + DECISION_SECTION + '」（裁定门节名真的并进了门禁侧集合）',
    breakIt: root => {
      const p = join(root, 'brainstorming/feature.md')
      const text = readFileSync(p, 'utf8')
      const anchor = '## ' + DECISION_SECTION
      if (!text.includes(anchor)) throw new Error('注入锚点没命中：' + anchor)
      writeFileSync(p, text.replace(anchor, '## 讨论记录被改名'))
    },
    expectNamed: [DECISION_SECTION, FIELD_TOKEN_NAME.templateMissing],
    expectField: 'templateMissing',
  },
  {
    name: 'decision-section-in-bug-template',
    direction: 'template-extra',
    proves: 'D-12 反向：把裁定节抄进 bug 模板 → 必红（该节仅 feature 模板；非 feature 类上它既没登记、门禁也不要求）',
    breakIt: root => {
      const p = join(root, 'brainstorming/bug.md')
      const text = readFileSync(p, 'utf8')
      const anchor = '## 根因'
      if (!text.includes(anchor)) throw new Error('注入锚点没命中：' + anchor)
      writeFileSync(p, text.replace(anchor, '## ' + DECISION_SECTION + '\n\n本节无裁定\n\n' + anchor))
    },
    expectNamed: [DECISION_SECTION, 'bug.md'],
    expectField: 'templateExtra',
  },
  {
    name: 'decision-gate-widened-to-other-category',
    direction: 'gate-missing',
    proves: 'D-12 门禁侧：把裁定门节名也要求到非 feature 类上（模拟"门禁把该节推广到全类型"）→ 必红并点名 D-12',
    breakIt: root => {
      const p = join(root, 'brainstorming/chore.md')
      const text = readFileSync(p, 'utf8')
      const anchor = '## 完成判据'
      if (!text.includes(anchor)) throw new Error('注入锚点没命中：' + anchor)
      writeFileSync(p, text.replace(anchor, '## ' + DECISION_SECTION + '\n\n本节无裁定\n\n' + anchor))
    },
    expectNamed: [DECISION_SECTION, 'chore'],
    expectField: 'featureOnlyViolations',
  },
]

function copyTemplates(src: string): string {
  const root = mkdtempSync(join(tmpdir(), 't19-r2-specimen-'))
  cpSync(src, root, { recursive: true })
  return root
}

async function runSpecimens(templatesDir: string, only: readonly string[]): Promise<number> {
  const base = probeParity(templatesDir)
  if (base.exitCode !== 0) {
    console.error('SPECIMEN 前置不成立：真模板本身就没双向一致（漂移 ' + String(base.driftCount) + '），反例跑不出含义。先修模板。')
    return 2
  }
  const chosen = only.length === 0 ? SPECIMENS : SPECIMENS.filter(s => only.includes(s.name))
  if (chosen.length === 0) {
    console.error('SPECIMEN 参数错误（exit 2）：--specimen 只认 ' + SPECIMENS.map(s => s.name).join('、'))
    return 2
  }
  let bad = 0
  for (const spec of chosen) {
    const root = copyTemplates(templatesDir)
    try {
      spec.breakIt(root)
      const out = probeParity(root)
      const hit = out.categories.some(c => c[spec.expectField].length > 0)
      const named = spec.expectNamed.every(frag => JSON.stringify(out).includes(frag))
      if (out.exitCode === 1 && hit && named) {
        console.log('SPECIMEN OK   ' + spec.name + '（方向 ' + spec.direction + '）：exit 1，命中不变量 '
          + (spec.expectField === 'templateExtra' ? '模板多一节' : '模板少一节') + '，点名 ' + spec.expectNamed.join(' + '))
        console.log('              ' + spec.proves)
      } else {
        bad++
        console.error('SPECIMEN FAIL ' + spec.name + '：期望 exit 1 且命中 ' + spec.expectField
          + ' 并点名 ' + spec.expectNamed.join(' + ') + '；实得 exit ' + String(out.exitCode)
          + (hit ? '（不变量命中）' : '（不变量未命中）') + (named ? '（点名命中）' : '（点名未命中）'))
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
  if (bad > 0) {
    console.error('SPECIMEN FAIL：' + String(bad) + '/' + String(chosen.length) + ' 条反例没有按预期变红（判据可能恒真）')
    return 1
  }
  console.log('SPECIMEN PASS（' + String(chosen.length) + ' 条反例全部按预期变红；真模板副本已清理，仓库内 templates/ 未被改动）')
  return 0
}

/* ── 入口 ──────────────────────────────────────────────────────────────────── */

interface Args {
  json: boolean
  specimen: boolean
  specimenNames: string[]
  templatesDir: string
}

function parseArgs(argv: readonly string[]): Args {
  let json = false
  let specimen = false
  let specimenNames: string[] = []
  let templatesDir = DEFAULT_TEMPLATES_DIR
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') json = true
    else if (a === '--specimen') specimen = true
    else if (a.startsWith('--specimen=')) {
      specimen = true
      specimenNames = a.slice('--specimen='.length).split(',').map(s => s.trim()).filter(s => s !== '')
    } else if (a === '--templates-dir') {
      const next = argv[i + 1]
      if (next === undefined) throw new Error('--templates-dir 后面缺目录')
      templatesDir = resolve(next)
      i++
    }
  }
  return { json, specimen, specimenNames, templatesDir }
}

async function main(): Promise<void> {
  let args: Args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error('参数错误（exit 2）：' + String(e instanceof Error ? e.message : e))
    process.exit(2)
  }

  try {
    if (args.specimen) {
      process.exit(await runSpecimens(args.templatesDir, args.specimenNames))
    }
    const out = probeParity(args.templatesDir)
    if (args.json) console.log(JSON.stringify(out, null, 2))
    else printHuman(out)
    process.exit(out.exitCode)
  } catch (e) {
    console.error('环境不可用（exit 2）：' + String(e instanceof Error ? e.message : e))
    process.exit(2)
  }
}

await main()
