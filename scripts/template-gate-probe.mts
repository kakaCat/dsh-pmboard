/**
 * R1 —— 模板门禁探针（REQ-261005105032-3b02 t19 · FR-10 · design-brief §6 · 决议 #17/#26/#47）。
 *
 * 解决什么问题：模板与门禁是**同一个契约的两处写法**，靠自觉同步必然分叉——D-5 就是分叉的产物：
 * 模板给必填节标题统一追加 `<!-- serves: FR-1 -->`，而 `hasRootSection` 只认括号注解，
 * 于是「照模板写出来的 requirement.md 被判缺必填节」，模板与门禁**双方都不报错**。
 * 本探针把两处拉到同一条命令上：**渲染模板 → 喂真门禁 → 0 缺口才算过**。
 *
 * 判据（0 缺口才 exit 0）：
 *   ① 占位符必须全部登记在 `scripts/template-render-map.json`（决议 #26）——未登记 = exit 1 并点名，
 *      防「新占位符没人管」；
 *   ② **按文档类分派门禁**（执行裁定第 6 节 t19 条①）——无差别喂三个门禁必红（见下），
 *      需求类模板喂 `missingCategoryDocs` + `checkRequirementDocFormatGate`；
 *      设计类模板喂 `checkDesignSectionsHaveServes`（线上设计文档门禁的章节级判据）；
 *   ③ 模板必须被**显式归入某个文档类**。为什么这也算判据（而不是通配兜底）：新增一份模板却没人管它
 *      = 新模板不受 R1 保护，而这种漂移是静默的；显式分类表让"忘了归类"当场变红。
 *   ④ **文档自检全套**（REQ-261005105032-3b02 t21 · FR-11）：每份**需求类**模板的渲染产物再走一遍
 *      `scripts/req-doc-validate.mts` 的 9 项判据集（必填节 / front-matter / 格式门 / 编号链 / 追溯 /
 *      RTM 健康 / E2E 覆盖 / serves / dangling）。为什么要接在这里：模板门禁只判"这份模板过不过它那一道
 *      门"，判不了"照它写出来的需求文档全不全"；把自检脚本的判据集挂在 R1 上，「模板产物必过门禁」
 *      才覆盖到**文档校验全套**（而不是逐门各判一半）。判据集由**脚本导出、R1 调用**（不是 R1 重写一遍），
 *      两条口径同源——这正是本需求 FR-10「同源」的要求。
 *
 *      合成文档集的边界（如实登记，不假装判了）：虚拟文档集里只有**需求根文档**这一份内容（设计模板
 *      的内容判定由 ② 的 design-class 门禁负责，再喂一遍是重复），因此依赖设计内容/真实磁盘的判据
 *      （追溯 / serves / RTM 健康）读数为「未知，不判」——`req-doc-validate` 会把未知**明确打印**出来，
 *      不静默放行。渲染产物没有可解析根编号定义行时（bug/spike/doc/chore 模板），格式门/编号链/dangling
 *      同样是"不可判"——这与既有门对"存量/直种记录"的 `isLegacy` 早退**同口径**（见下方观察）。
 *
 * 观察（**不计入判据、不影响退出码**）：需求类模板若一条门禁可解析的根条款定义行都没有，会出现在
 *   `observations` 里。为什么要报而不是不报：`checkRequirementDocFormatGate` 的第一道是「必须有根编号」，
 *   而 `roots.length === 0` 时它**直接放行**（既有语义）——于是 bug/spike/doc/chore 四份模板的这道门禁
 *   是**恒真空转**：门禁绿着，模板里却没有一条 `**BUG-1: …**` 定义行（提示词片段
 *   `fragments/brainstorming/*.md` 里每条都有，模板骨架里没有 = 两处又分叉了）。
 *   为什么不把它升级成判据：本卡验收标准写的是「渲染 → 喂这三道门禁 → 0 缺口」（卡面原文），
 *   把它升级成判据会让 R1 对**既有模板正文**恒红，而那属于 t14/t20 的改动面（t19 对 `templates/**` 内容只读）。
 *   故这里如实点名、留给拿到这条观察的人决定是否补模板（补法是每份加一行示范定义行）。
 *
 * 退出码（决议 #47）：0 = 通过；1 = 判据失败（含未登记占位符；**含文档自检缺口**——t21 把
 * `req-doc-validate` 的 9 项判据集接进来后，"模板产物必过门禁"覆盖到文档校验全套，故它的缺口与
 * 模板缺口**同等**决定退出码）；2 = **前置不可用**（模板目录不存在/为空、渲染映射表读不出，即连
 * "能不能判"都不成立）——2 与 1 分开是因为处置完全不同（一个去补环境，一个去看模板/文档）。
 *
 * 用法：
 *   npx tsx scripts/template-gate-probe.mts                 # 人读；退出码 0/1/2
 *   npx tsx scripts/template-gate-probe.mts --json          # stdout 只输出可 JSON.parse 的结构
 *   npx tsx scripts/template-gate-probe.mts --templates-dir <dir>   # 判另一份模板根（逆验证用）
 *   npx tsx scripts/template-gate-probe.mts --specimen      # 跑内置反例（改坏节标题 / 塞未登记占位符）
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { designDocPolicyFrom, hasRootSection, missingCategoryDocs, sidesDeclarationGap } from '../src/application/internal/category-doc-sets.js'
import {
  checkDesignSectionsHaveServes, checkTaskCardTriad, extractClauseDefinitions, parseDocument,
} from '../src/application/internal/content-gates.js'
import { clauseCriteriaGaps } from '../src/application/internal/clause-criteria.js'
import { checkRequirementDocFormatGate, FAILURE_CONCURRENCY_SECTION } from '../src/application/internal/content-gate-wiring.js'
import type { DocsEntry, DocsReader } from '../src/application/internal/doc-parse.js'
import type { RequirementRecord } from '../src/shared/protocol.js'
// 文档自检判据集（t21）：**脚本导出、R1 调用**——两条口径同源，R1 不重写一份判据（FR-10 同源要求）。
import { validateDocSet, DOC_VALIDATE_CRITERIA, type DocValidateReport } from './req-doc-validate.mts'

/* ── 常量：路径与文档类 ─────────────────────────────────────────────────────── */

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')
const DEFAULT_TEMPLATES_DIR = join(REPO_ROOT, 'templates')
const RENDER_MAP_PATH = join(HERE, 'template-render-map.json')

/** 渲染用的假需求 id：只喂门禁，不碰任何真实需求目录（值域与真实 REQ id 同形，见渲染映射表）。 */
const FAKE_REQ_ID = 'REQ-000000'

/** 文档类 → 派发到的门禁（执行裁定第 6 节 t19 条①的**分派表**，逐条在这里可读）。 */
export type DocClass =
  | 'requirement'      // 需求根文档：missingCategoryDocs + checkRequirementDocFormatGate
  | 'design'           // 设计文档：checkDesignSectionsHaveServes
  | 'decomposition'    // 拆分计划：任务表两列（既有门禁语义直译的子集）
  | 'task-card'        // 任务卡：checkTaskCardTriad（三要素，硬拦项）
  | 'verification'     // 验收材料：两节（既有门禁语义直译的子集）
  | 'example'          // 示例文档（feature-example.md）：只受"占位符全登记"约束
  | 'report'           // 评审 / 测试证据：**至今无对应线上门禁**，只受"占位符全登记"约束（如实登记，不假装有门禁）
  | 'doc-note'         // 根说明 / 过程记录 / 归档（README、TEMPLATE-IMPROVEMENTS、notes、archived）：同上
  | 'unclassified'     // 分派表里没有它 → 判据失败（新模板必须显式归类）

/** 需求类模板 → 立项类型（决定 missingCategoryDocs 的 BASE+DELTA）。 */
const REQUIREMENT_CATEGORY: Readonly<Record<string, string>> = {
  'templates/brainstorming/feature.md': 'feature',
  'templates/brainstorming/bug.md': 'bug',
  'templates/brainstorming/refactor.md': 'refactor',
  'templates/brainstorming/spike.md': 'spike',
  'templates/brainstorming/doc.md': 'doc',
  'templates/brainstorming/chore.md': 'chore',
}

/** 该需求类型必需的设计文档（喂 missingCategoryDocs 的 designNames）——同源取模板自身 front-matter 的 sides。 */
const REQUIRED_DESIGN_DOCS: Readonly<Record<string, readonly string[]>> = {
  feature: ['architecture.md', 'data-model.md', 'interfaces.md', 'test-cases.md', 'use-cases.md'],
  refactor: ['architecture.md', 'migration.md'],
}

/** 该需求类型在 sides 命中时**条件必交**的设计文档（同 category-doc-sets.CATEGORY_DELTAS）。 */
const CONDITIONAL_DESIGN_DOCS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  feature: { frontend: 'frontend.md', backend: 'backend.md' },
}

/** 报告类模板（**无线上门禁**）：评审报告与测试证据至今没有章节级/字段级门禁。 */
const REPORT_TEMPLATES = new Set([
  'templates/implementing/review.md',
  'templates/implementing/test-evidence.md',
])

/**
 * 示例类模板（**无线上门禁**）：教学用成品示例，不是任何阶段的产物骨架。
 *
 * 为什么 feature-example.md 归这里而不是 requirement：它是 feature 的**旧版版式成品**（自己写了
 * `REQ-260101-001` 这种固定 id、不用占位符），结构上并不等于 `requiredRootSectionsFor('feature')`
 * （它用「目标用户与使用场景」而非「用户与角色」）——拿必填节门禁去判它，判的是"示例没跟模板同步"，
 * 那是 t20 的改动面，不是本探针要替它做的裁决。故只约束"占位符全登记"。
 */
const EXAMPLE_TEMPLATES = new Set(['templates/brainstorming/feature-example.md'])

/** 根文档 / 过程记录 / 归档：人读或自由格式，无对应线上门禁，不派发判据。 */
const DOC_NOTE_TEMPLATES = new Set([
  'templates/README.md',
  'templates/TEMPLATE-IMPROVEMENTS.md',
  'templates/common/notes.md',
  'templates/archived/index.md',
  'templates/archived/retro.md',
])

/**
 * 模板相对路径 → 文档类。**显式全枚举**，不用通配兜底：
 * 新增一份模板而忘了分类时，`unclassified` 会以判据失败出现，而不是被静默跳过（静默跳过 = 新模板不受 R1 保护）。
 */
function classifyTemplate(rel: string): DocClass {
  if (rel in REQUIREMENT_CATEGORY) return 'requirement'
  if (rel.startsWith('templates/design/') && rel.endsWith('.md')) return 'design'
  if (rel === 'templates/decomposing/decomposition.md') return 'decomposition'
  if (rel === 'templates/implementing/task-card.md') return 'task-card'
  if (rel === 'templates/accepting/verification.md') return 'verification'
  if (EXAMPLE_TEMPLATES.has(rel) || rel.startsWith('templates/examples/')) return 'example'
  if (REPORT_TEMPLATES.has(rel)) return 'report'
  if (DOC_NOTE_TEMPLATES.has(rel)) return 'doc-note'
  return 'unclassified'
}

/* ── 参数 ──────────────────────────────────────────────────────────────────── */

interface Args {
  json: boolean
  specimen: boolean
  templatesDir: string
}

function parseArgs(argv: readonly string[]): Args {
  let json = false
  let specimen = false
  let templatesDir = DEFAULT_TEMPLATES_DIR
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') json = true
    else if (a === '--specimen') specimen = true
    else if (a === '--templates-dir') {
      const next = argv[i + 1]
      if (next === undefined) throw new Error('--templates-dir 后面缺目录')
      templatesDir = resolve(next)
      i++
    }
  }
  return { json, specimen, templatesDir }
}

/* ── 渲染映射表 ────────────────────────────────────────────────────────────── */

interface RenderMap {
  placeholders: Record<string, string>
}

/** 读取映射表；读不出 = 前置不可用（exit 2），不是判据失败。 */
function readRenderMap(): RenderMap {
  const raw = JSON.parse(readFileSync(RENDER_MAP_PATH, 'utf8')) as { placeholders?: Record<string, string> }
  const placeholders = raw.placeholders ?? {}
  if (Object.keys(placeholders).length === 0) throw new Error('渲染映射表里没有任何占位符：' + RENDER_MAP_PATH)
  const empty = Object.entries(placeholders).filter(([, v]) => typeof v !== 'string' || v.trim() === '')
  if (empty.length > 0) throw new Error('渲染映射表里存在空样例值（会把"占位符在不在"和"值空不空"混在一起）：' + empty.map(([k]) => k).join('、'))
  return { placeholders }
}

const PLACEHOLDER_RE = /\{\{([^{}]*)\}\}/g

interface RenderedTemplate {
  text: string
  /** 未登记在映射表里的占位符（去重、保序）——非空即判据失败（决议 #26）。 */
  unregistered: string[]
}

function renderTemplate(text: string, map: RenderMap): RenderedTemplate {
  const unregistered: string[] = []
  const rendered = text.replace(PLACEHOLDER_RE, (whole, key: string) => {
    const value = map.placeholders[key]
    if (value === undefined) {
      if (!unregistered.includes(key)) unregistered.push(key)
      return whole
    }
    return value
  })
  return { text: rendered, unregistered }
}

/* ── 真 DocsReader（喂 checkRequirementDocFormatGate 用） ────────────────────── */

/**
 * 把"渲染出来的这份根文档"当作 `REQ-000000` 的 requirement.md 递给真门禁。
 *
 * 为什么不用假对象糊过去：门禁的判据就是"读文件→解析→判"，只有让它走同一条读法，
 * 判出来的红才是**线上会红的那种红**（D-5 的教训）。除这份合成路径外一律返回"不存在"——
 * 探针不该看见、更不该依赖任何真实需求目录。
 */
function virtualDocsFor(relPath: string, text: string): DocsReader {
  return virtualDocsWith([{ path: relPath, text }])
}

/**
 * 多路径虚拟文档集（t21 的文档自检判据集要按需求目录布局读：`docs/requirements/<REQ>/requirement.md`
 * 与 `.../design/`）。`list` 按前缀过滤，与 `FileDocRepository.list` 同口径（只列直接子项）——
 * 判据里的 `docs.list?.(dir)` 因此能像读真盘一样工作，而不是恒拿到空目录（空目录 = 静默漏判）。
 */
function virtualDocsWith(entries: readonly { path: string; text: string }[]): DocsReader {
  const byPath = new Map(entries.map(e => [e.path, e.text]))
  return {
    exists: (p: string): boolean => byPath.has(p),
    read: async (p: string): Promise<string> => {
      const text = byPath.get(p)
      if (text === undefined) throw new Error('虚拟文档集里没有 ' + p + '（只提供：' + [...byPath.keys()].join('、') + '）')
      return text
    },
    list: (relDir: string): readonly DocsEntry[] => {
      const prefix = relDir.endsWith('/') ? relDir : relDir + '/'
      return [...byPath.keys()]
        .filter(p => p.startsWith(prefix))
        .map(p => ({ name: p.slice(prefix.length), isFile: true }))
    },
  }
}

/* ── 判据 ──────────────────────────────────────────────────────────────────── */

interface GateResult {
  gate: string
  gaps: string[]
}

export interface TemplateReport {
  path: string
  docClass: DocClass
  gates: GateResult[]
  unregisteredPlaceholders: string[]
  /** 只报不判的观察（不影响 exitCode）——见模块头注释「观察」。 */
  observations: string[]
  /** 该模板全部判据的缺口（扁平化，便于人读与断言）。 */
  gaps: string[]
  ok: boolean
}

export interface ProbeOutput {
  script: 'template-gate-probe'
  criterion: string
  templatesDir: string
  templates: TemplateReport[]
  templateCount: number
  passed: number
  gapCount: number
  observationCount: number
  /**
   * 文档自检（t21 · FR-11）：每份**需求类**模板的渲染产物走一遍 `req-doc-validate` 的 9 项判据集。
   * 增量字段（既有字段语义与形状一字不动）：旧消费方读不到它 = 按"没有这一节"处理，不误解既有字段。
   */
  docValidate: DocValidateReport[]
  /** 文档自检缺口总数（与 `gapCount` 一起决定 exitCode）。 */
  docValidateGapCount: number
  docValidateStatus: 'PASS' | 'FAIL'
  status: 'PASS' | 'FAIL'
  exitCode: 0 | 1 | 2
}

/** 递归收集模板根下的 `.md`（**排除 examples/**：先例 tests/template-address.test.ts 对 examples/ 整体豁免）。 */
function collectTemplates(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)
      const rel = relative(root, abs).split(sep).join('/')
      if (entry.isDirectory()) {
        if (rel === 'examples') continue
        walk(abs)
      } else if (entry.name.endsWith('.md')) {
        out.push('templates/' + rel)
      }
    }
  }
  walk(root)
  return out.sort()
}

/** 该需求类型下"本文档自己应有的"设计文档清单（必交 ∪ sides 命中的条件必交）。 */
function designNamesFor(category: string, sides: readonly string[]): string[] {
  const required = REQUIRED_DESIGN_DOCS[category] ?? []
  const conditional = sides
    .map(side => CONDITIONAL_DESIGN_DOCS[category]?.[side])
    .filter((n): n is string => n !== undefined)
  return [...required, ...conditional]
}

/** 逐模板跑该文档类的门禁。返回的 gaps 非空即该模板判据失败；observations 只报不判。 */
async function evaluateTemplate(rel: string, raw: string, map: RenderMap): Promise<TemplateReport> {
  const docClass = classifyTemplate(rel)
  const rendered = renderTemplate(raw, map)
  const gates: GateResult[] = []
  const observations: string[] = []

  if (rendered.unregistered.length > 0) {
    gates.push({
      gate: 'render-map',
      gaps: rendered.unregistered.map(k => `模板含未登记占位符 {{${k}}}（scripts/template-render-map.json 里没有它）`),
    })
  }

  if (docClass === 'unclassified') {
    gates.push({ gate: 'dispatch', gaps: [`模板未分类：${rel} 不在 template-gate-probe.mts 的分派表里（新模板必须显式归类）`] })
  } else if (docClass === 'requirement') {
    const category = REQUIREMENT_CATEGORY[rel] ?? ''
    const doc = parseDocument(rendered.text)
    const policy = designDocPolicyFrom(doc.frontmatter)
    // ① 必填节 + 必交设计文档（与 design→decomposing 的 G2 文档集门禁同一函数、同一口径）
    gates.push({
      gate: 'missingCategoryDocs',
      gaps: missingCategoryDocs({
        category,
        rootExists: true,
        rootText: rendered.text,
        designNames: designNamesFor(category, policy.sides),
        sides: policy.sides,
        exempt: policy.exempt,
      }),
    })
    // ② 编号格式门（真门禁：读合成路径的同一条读法）
    const relPath = 'docs/requirements/' + FAKE_REQ_ID + '/requirement.md'
    const failure = await checkRequirementDocFormatGate(
      virtualDocsFor(relPath, rendered.text),
      { id: FAKE_REQ_ID, category } as unknown as RequirementRecord,
    )
    gates.push({
      gate: 'checkRequirementDocFormatGate',
      gaps: failure === undefined ? [] : [failure.code + '：' + (failure.gaps ?? []).join('；')],
    })
    // ③ 端侧声明（2026-10-06 加固）：模板必须自带合法 `sides`——同源判定 = 线上提交门用的
    //    那同一个纯函数（sidesDeclarationGap）。为什么模板层要判：sides 是条件必交设计文档与
    //    原型门的触发器，模板里写错/漏写会让**照模板写出来的每一份需求**都触发不了（实测
    //    refactor.md 原先没有 sides，于是 refactor 的原型条件必交永不触发）。
    if (category === 'feature' || category === 'refactor') {
      const gap = sidesDeclarationGap(category, doc.frontmatter)
      gates.push({
        gate: 'sides-declaration',
        gaps: gap === undefined ? [] : [gap],
      })
      // 「失败与并发路径」：提交门（docSectionGateFailure）只对**新需求**硬拦，DELTA 里刻意没有它
      // （进 DELTA 会追溯存量）。故这里显式点名模板必须自带——模板删了节，照模板写的新需求会被拒，
      // 而 R2 的 optional 登记不会替它报警（optional 是"允许存在"不是"必须存在"）。
      gates.push({
        gate: 'failure-concurrency-section',
        gaps: hasRootSection(rendered.text, FAILURE_CONCURRENCY_SECTION)
          ? []
          : ['模板缺必填节「' + FAILURE_CONCURRENCY_SECTION + '」（提交门对新需求的 feature/refactor 硬拦，模板必须自带这一节）'],
      })
    }
    // 观察（不计入判据）：条款级判据软门禁——模板渲染后是占位文案，必然缺判据，故只登记读数，
    // 提醒"模板骨架里已写明每条 FR 要自带判据"，不当作模板缺陷。
    const criteriaGaps = clauseCriteriaGaps(doc)
    if (criteriaGaps.length > 0) {
      observations.push('渲染后 ' + criteriaGaps.length + ' 条条款无可核验判据（模板是占位文案，属预期；'
        + '线上提交只作软提示 clause_criteria_warnings，不阻断）')
    }
    // 观察（不计入判据）：零定义行 → 格式门的「必须有根编号」那一道对本文档恒真空转（见模块头注释）
    if (extractClauseDefinitions(doc).length === 0) {
      observations.push('模板渲染后没有一条门禁可解析的根条款定义行（' + category + ' 可补一行形如 `- **'
        + (ROOT_PREFIX[category] ?? 'FR') + '-1: 名称**` 的示范定义行）⇒ checkRequirementDocFormatGate 的「必须有根编号」对它恒真空转；'
        + '提示词片段 fragments/brainstorming/' + category + '.md 里有这种示范行，模板骨架里没有')
    }
  } else if (docClass === 'design') {
    gates.push({
      gate: 'checkDesignSectionsHaveServes',
      gaps: checkDesignSectionsHaveServes(parseDocument(rendered.text)).missing.map(s => `H2/H3 章节缺 serves 标注：「${s}」`),
    })
    // REQ-261007125552-32cb FR-1：接口清单/组件树节的模板判据——词表与门禁
    // （content-gate-wiring 的 designSectionMissing）同口径，模板缺节 = 照模板写必被门拦。
    const designGranularity = designGranularitySectionGaps(rel, rendered.text)
    if (designGranularity.length > 0) gates.push({ gate: 'design-granularity-sections', gaps: designGranularity })
  } else if (docClass === 'task-card') {
    gates.push({
      gate: 'checkTaskCardTriad',
      gaps: checkTaskCardTriadGaps(rendered.text),
    })
  } else if (docClass === 'verification') {
    gates.push({
      gate: 'verification-sections',
      gaps: verificationSectionGaps(rendered.text),
    })
  } else if (docClass === 'decomposition') {
    gates.push({
      gate: 'decomposition-columns',
      gaps: decompositionColumnGaps(rendered.text),
    })
  }
  // example / report / doc-note：无对应线上门禁（示例文档、评审报告、测试证据、根说明、过程记录、归档），
  // 只受"占位符全登记"约束——如实登记在这里，不假装有门禁。

  const gaps = gates.flatMap(g => g.gaps)
  return {
    path: rel,
    docClass,
    gates,
    unregisteredPlaceholders: rendered.unregistered,
    observations,
    gaps,
    ok: gaps.length === 0,
  }
}

/** 条款前缀（判据③的文案用）。 */
const ROOT_PREFIX: Readonly<Record<string, string>> = {
  feature: 'FR', bug: 'BUG', refactor: 'RF', spike: 'SP', doc: 'DOC', chore: 'CH',
}

/**
 * 任务卡模板的三要素检查——**只取硬拦项**（缺失/空字段），不取 warnings。
 *
 * 为什么自己取 `checkTaskCardTriad` 的 missing 而不走 `content-gate-triad` 的 IO 包装：
 * 那一层要 `docs`/`taskId`（按需求目录找卡文件），探针手上只有模板文本；判定函数是同一个
 * （`content-gates.checkTaskCardTriad`），因此口径不会分叉。
 */
function checkTaskCardTriadGaps(text: string): string[] {
  return checkTaskCardTriad(parseDocument(text)).missing
}

/**
 * 验收模板的两节判据：`## 证据` 与 `## 验收项` 必须在。
 *
 * 为什么不喂 `checkAcceptanceKit`（执行裁定第 6 节 t19 条①要求"最贴近的既有门禁"）：
 * 实测它对 `templates/accepting/verification.md` **必红**——它找的是表头含「验什么/对应编号/怎么验/预期」
 * 的**验收四件套表**，而模板用的是「## 证据」（列表）+「## 验收项」（条款/验收标准/证据引用三列表）。
 * 该缺口属"验收四件套门禁至今没有真实调用点"（判据从未被接上链），**不在 t19 的范围**，
 * 故这里只做**从既有门禁语义直译**的子集判据，并在汇报里如实登记为待裁决点（不静默放宽）。
 */
function verificationSectionGaps(text: string): string[] {
  const gaps: string[] = []
  for (const [heading, why] of [['证据', '可复核证据清单'], ['验收项', '按需求条款逐条生成的验收项']] as const) {
    if (!new RegExp('^##\\s*' + heading, 'm').test(text)) gaps.push(`验收模板缺必填节「${heading}」（${why}）`)
  }
  return gaps
}

/** 拆分模板的任务表必须带「原型锚点」「关联 D-x」两列（FR-9 / t14 落地的契约）。 */
function decompositionColumnGaps(text: string): string[] {
  const table = parseDocument(text).tables.find(t => t.header.some(h => h.includes('计划 key')))
  if (table === undefined) return ['拆分模板找不到任务表（表头应含「计划 key」列）']
  const header = table.header.join(' | ')
  const gaps: string[] = []
  for (const col of ['原型锚点', '关联 D-x']) {
    if (!header.includes(col)) gaps.push(`拆分模板任务表缺列「${col}」`)
  }
  // REQ-261007125552-32cb FR-2：对照表节（词表与 plan-granularity.readMapTable 同口径——
  // 表头含「接口」+「接收卡 key」；「计划 key」是任务表判据的词法，对照表**不得**复用）。
  const mapTable = parseDocument(text).tables.find(t =>
    t.header.some(h => h.includes('接口')) && t.header.some(h => h.includes('接收卡 key')),
  )
  if (mapTable === undefined) {
    gaps.push('拆分模板缺「接口清单 ↔ 接收卡 key」对照表（表头应含「接口」与「接收卡 key」两列；对照表门 plan_interface_map_missing 的模板侧依据）')
  }
  return gaps
}

/**
 * 设计模板的粒度必备节判据（REQ-261007125552-32cb FR-1）：词表与线上门禁
 * `designSectionMissing`（content-gate-wiring.ts）**同口径**——section 关键字与表头列名
 * 两处逐字一致，模板缺节 = 照模板写必被 REQBOARD_DESIGN_CONTENT_GATE 拦（假红反向）。
 */
function designGranularitySectionGaps(rel: string, text: string): string[] {
  const doc = parseDocument(text)
  const hasH2 = (kw: string) => doc.headings.some(h => h.level === 2 && h.text.includes(kw))
  if (rel.endsWith('templates/design/interfaces.md')) {
    const gaps: string[] = []
    if (!hasH2('接口清单')) gaps.push('interfaces.md 模板缺「接口清单」节（门禁 designSectionMissing 的模板侧依据）')
    else if (!doc.tables.some(t => t.header.some(h => h.includes('接口 id')))) {
      gaps.push('interfaces.md 模板的「接口清单」节缺表头含「接口 id」的清单表')
    }
    return gaps
  }
  if (rel.endsWith('templates/design/frontend.md')) {
    return hasH2('组件树') ? [] : ['frontend.md 模板缺「组件树」节（门禁 designSectionMissing 的模板侧依据）']
  }
  return []
}

/* ── 文档自检（t21 · FR-11）：把判据集跑在**渲染产物**上 ─────────────────────── */

/**
 * 每份需求类模板的渲染产物 → 合成文档集 `REQ-000000` → 跑 `req-doc-validate` 的 9 项判据集。
 *
 * 三个刻意的取数口径（都写在这里，免得读的人以为漏了什么）：
 *  ① 虚拟文档集里**只放需求根文档**的渲染产物：设计模板的内容判定由 R1 各自的 design-class 门禁
 *     （`checkDesignSectionsHaveServes`）负责；把设计内容也塞进来会让"追溯 / serves"两个判据拿
 *     骨架模板去判真需求级的覆盖度（模板的 FR-2 示例条款没有设计骨架承接 = 拿骨架判真需求，是假红）。
 *     代价如实登记：这两项在 R1 里读数为「未知，不判」（`req-doc-validate` 会明确打印出来）。
 *  ② `hasArtifacts` = 渲染产物**有没有可解析的根编号定义行**——与既有门对"存量/直种记录"的
 *     `isLegacy` 早退同口径（bug/spike/doc/chore 模板至今没有示范定义行，那三项因此不可判，
 *     且 R1 早已把这件事作为**观察**报出来，见模块头「观察」）。
 *  ③ `designNames` 用 `designNamesFor(category, sides)`（本探针 ② 的既有口径：按类型 + 端侧算出的
 *     必交/条件必交设计文档清单），不从模板目录反推——免得"渲染了哪几份"与"该交哪几份"混成一件事。
 */
async function runDocValidate(
  reqRels: readonly string[],
  map: RenderMap,
  templatesDir: string,
): Promise<DocValidateReport[]> {
  const out: DocValidateReport[] = []
  for (const rel of reqRels) {
    const raw = readFileSync(join(templatesDir, rel.slice('templates/'.length)), 'utf8')
    const rendered = renderTemplate(raw, map)
    const category = REQUIREMENT_CATEGORY[rel] ?? ''
    const doc = parseDocument(rendered.text)
    const policy = designDocPolicyFrom(doc.frontmatter)
    const reqPath = 'docs/requirements/' + FAKE_REQ_ID + '/requirement.md'
    out.push(await validateDocSet({
      reqId: FAKE_REQ_ID,
      label: rel,
      category,
      hasArtifacts: extractClauseDefinitions(doc).length > 0,
      docs: virtualDocsFor(reqPath, rendered.text),
      designNames: designNamesFor(category, policy.sides),
    }))
  }
  return out
}

/* ── 主判据 ────────────────────────────────────────────────────────────────── */

/** 跑一遍探针，返回结构化结果（不打印、不 exit——打印与退出码由调用方决定）。 */
export async function probe(templatesDir: string = DEFAULT_TEMPLATES_DIR): Promise<ProbeOutput> {
  const map = readRenderMap()
  const rels = collectTemplates(templatesDir)
  if (rels.length === 0) throw new Error('模板目录里没有任何 .md（连"能不能判"都不成立）：' + templatesDir)

  const templates: TemplateReport[] = []
  const requirementRels: string[] = []
  for (const rel of rels) {
    const raw = readFileSync(join(templatesDir, rel.slice('templates/'.length)), 'utf8')
    templates.push(await evaluateTemplate(rel, raw, map))
    // 文档自检只对**需求类**模板跑（9 项判据面向需求文档集：必填节/格式门/追溯/RTM…）
    if (classifyTemplate(rel) === 'requirement') requirementRels.push(rel)
  }

  const docValidate = await runDocValidate(requirementRels, map, templatesDir)
  const docValidateGapCount = docValidate.reduce((n, r) => n + r.gapCount, 0)

  const passed = templates.filter(t => t.ok).length
  const gapCount = templates.reduce((n, t) => n + t.gaps.length, 0)
  const observationCount = templates.reduce((n, t) => n + t.observations.length, 0)
  const docValidateStatus: 'PASS' | 'FAIL' = docValidateGapCount === 0 ? 'PASS' : 'FAIL'
  const status: 'PASS' | 'FAIL' = gapCount === 0 && docValidateGapCount === 0 ? 'PASS' : 'FAIL'
  return {
    script: 'template-gate-probe',
    criterion: '渲染占位符后逐份模板过各自文档类的真门禁：需求类 missingCategoryDocs + checkRequirementDocFormatGate；设计类 checkDesignSectionsHaveServes；任务卡 checkTaskCardTriad；验收/拆分按既有门禁语义直译的子集判据；每份模板必须显式归类；占位符必须全部登记在 scripts/template-render-map.json；需求类模板的渲染产物再过 req-doc-validate 的 9 项文档判据集',
    templatesDir,
    templates,
    templateCount: templates.length,
    passed,
    gapCount,
    observationCount,
    docValidate,
    docValidateGapCount,
    docValidateStatus,
    status,
    exitCode: status === 'PASS' ? 0 : 1,
  }
}

/* ── 人读输出 ──────────────────────────────────────────────────────────────── */

function printHuman(out: ProbeOutput): void {
  for (const t of out.templates) {
    const gateNames = t.gates.map(g => g.gate).join(' + ')
    if (t.ok) {
      console.log('OK   ' + t.path + '（' + t.docClass + (gateNames === '' ? '：无对应线上门禁，仅占位符登记' : '：' + gateNames) + '）')
    } else {
      console.error('FAIL ' + t.path + '（' + t.docClass + '）')
      for (const g of t.gates) {
        for (const gap of g.gaps) console.error('   - [' + g.gate + '] ' + gap)
      }
    }
    // 观察跟在各自模板后面（醒目但**不参与判据**）：只报不判是刻意的，见模块头注释
    for (const o of t.observations) console.log('观察 ' + t.path + '：' + o)
  }

  // 文档自检（t21）：逐份需求模板一行；缺口逐条点名（走 stderr，与上面 FAIL 同款）
  console.log('文档自检（req-doc-validate 判据集 · 跑在渲染产物合成的 ' + FAKE_REQ_ID + ' 上）')
  console.log('  判据 9 项：' + DOC_VALIDATE_CRITERIA.join(' / '))
  for (const r of out.docValidate) {
    const head = '  ' + (r.gapCount === 0 ? 'OK  ' : 'FAIL') + ' ' + r.target.label
      + '（实判 ' + String(r.judgedCount) + ' / 读数未知 ' + String(r.unknownCount) + '；缺口 ' + String(r.gapCount) + '）'
    if (r.gapCount === 0) console.log(head)
    else {
      console.error(head)
      for (const c of r.criteria) {
        for (const g of c.gaps) console.error('       - [' + c.name + '] ' + g)
      }
    }
    // 未知项**按原因归并**打印：同一原因（如"渲染产物没有根编号定义行"）会命中 3~7 项，
    // 逐项铺开会把 R1 输出淹掉，而"未知必须可见"的要求靠这一行满足（原因一字不减）。
    const byReason = new Map<string, string[]>()
    for (const c of r.criteria) {
      if (c.reading !== 'unknown') continue
      const key = String(c.unknownReason)
      byReason.set(key, [...(byReason.get(key) ?? []), c.name])
    }
    for (const [reason, names] of byReason) {
      console.log('       未知（' + names.join(' / ') + '）：' + reason)
    }
  }

  const line = '模板 ' + String(out.templateCount) + ' 份：OK ' + String(out.passed) + ' / FAIL ' + String(out.templateCount - out.passed)
    + '；缺口 ' + String(out.gapCount) + '；观察 ' + String(out.observationCount) + '（不计入判据）'
    + '；文档自检缺口 ' + String(out.docValidateGapCount) + '（' + out.docValidateStatus + '，需求模板 ' + String(out.docValidate.length) + ' 份）'
    + '；exit ' + String(out.exitCode)
  if (out.gapCount === 0 && out.docValidateGapCount === 0) console.log(line)
  else console.error(line)
}

/* ── 逆验证反例（内置标本，跑在临时副本上——绝不改真模板） ────────────────────── */

interface Specimen {
  name: string
  /** 说明这条反例证明什么。 */
  proves: string
  /** 在临时模板副本上做坏。 */
  breakIt: (root: string) => void
  /** 期望在缺口里出现的片段（点名判据）。 */
  expectNamed: string[]
}

const SPECIMENS: Specimen[] = [
  {
    name: 'required-section-renamed',
    proves: '把需求模板的必填节标题改坏 → 必红并点名该模板与该节（证明判据真的在看模板，不是恒真）',
    breakIt: root => {
      const p = join(root, 'brainstorming/feature.md')
      const text = readFileSync(p, 'utf8')
      const broken = text.replace('## 功能点（需求条款）', '## 功能点X（需求条款）')
      if (broken === text) throw new Error('改坏点没命中：feature.md 里找不到「## 功能点（需求条款）」')
      writeFileSync(p, broken)
    },
    expectNamed: ['templates/brainstorming/feature.md', '功能点'],
  },
  {
    name: 'unregistered-placeholder',
    proves: '往模板塞未登记占位符 {{NOPE}} → 必红并点名该占位符（决议 #26：防新占位符没人管）',
    breakIt: root => {
      const p = join(root, 'brainstorming/feature.md')
      const text = readFileSync(p, 'utf8')
      const anchor = '## 功能点（需求条款）'
      if (!text.includes(anchor)) throw new Error('注入锚点没命中：feature.md 里找不到「' + anchor + '」')
      writeFileSync(p, text.replace(anchor, '## 新增节 {{NOPE}}\n\n' + anchor))
    },
    expectNamed: ['{{NOPE}}', 'templates/brainstorming/feature.md'],
  },
]

function copyTemplates(src: string): string {
  const root = mkdtempSync(join(tmpdir(), 't19-r1-specimen-'))
  cpSync(src, root, { recursive: true })
  return root
}

async function runSpecimens(args: Args): Promise<number> {
  const base = await probe(args.templatesDir)
  if (base.exitCode !== 0) {
    console.error('SPECIMEN 前置不成立：真模板本身就没过（缺口 ' + String(base.gapCount) + '），反例跑不出含义。先修模板。')
    return 2
  }
  let bad = 0
  for (const spec of SPECIMENS) {
    const root = copyTemplates(args.templatesDir)
    try {
      spec.breakIt(root)
      const out = await probe(root)
      const text = JSON.stringify(out)
      const named = spec.expectNamed.every(frag => text.includes(frag))
      const ok = out.exitCode === 1 && named
      if (ok) {
        console.log('SPECIMEN OK   ' + spec.name + '：exit ' + String(out.exitCode) + '，已点名 ' + spec.expectNamed.join(' + '))
        console.log('              ' + spec.proves)
      } else {
        bad++
        console.error('SPECIMEN FAIL ' + spec.name + '：期望 exit 1 且点名 ' + spec.expectNamed.join(' + ')
          + '，实得 exit ' + String(out.exitCode) + (named ? '（点名命中）' : '（点名未命中）'))
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
  if (bad > 0) {
    console.error('SPECIMEN FAIL：' + String(bad) + '/' + String(SPECIMENS.length) + ' 条反例没有按预期变红（判据可能恒真）')
    return 1
  }
  console.log('SPECIMEN PASS（' + String(SPECIMENS.length) + ' 条反例全部按预期变红；真模板副本已清理，仓库内 templates/ 未被改动）')
  return 0
}

/* ── 入口 ──────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  let args: Args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error('参数错误（exit 2）：' + String(e instanceof Error ? e.message : e))
    process.exit(2)
  }

  if (!existsSync(args.templatesDir)) {
    console.error('环境不可用（exit 2）：模板目录不存在：' + args.templatesDir)
    process.exit(2)
  }

  try {
    if (args.specimen) {
      const code = await runSpecimens(args)
      process.exit(code)
    }
    const out = await probe(args.templatesDir)
    if (args.json) console.log(JSON.stringify(out, null, 2))
    else printHuman(out)
    process.exit(out.exitCode)
  } catch (e) {
    // 前置不可用（映射表读不出 / 模板目录为空 / 目录不可读）→ exit 2，与"判据失败"分开
    console.error('环境不可用（exit 2）：' + String(e instanceof Error ? e.message : e))
    process.exit(2)
  }
}

await main()
