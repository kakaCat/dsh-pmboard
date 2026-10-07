#!/usr/bin/env node
/**
 * 设计坐标探针（缺口 2：**设计坐标实施后失效且无回写**）。
 *
 * 解决什么问题：设计文档（`docs/requirements/<REQ>/design/*.md`）是拆分与实施的坐标。它一旦与仓库
 * 真实布局脱钩，后果是**静默**的——两个方向都实测到过：
 *   ① 点名的路径**不存在**：`design/interfaces.md` 写 `src/domain/queue/normalizeQueueFile.ts`
 *      （真实是 `normalizeQueue.ts`，`normalizeQueueFile` 只是该文件里的函数名），另有全仓不存在的
 *      符号 `computeTestingCoverage` / `calculateImplementationCoverage`。拆分阶段照抄就会拆到空气上。
 *   ② 实现期**新增/改名**的落点不进设计：某需求设计五处明写「不新建模块」，实现却新建了
 *      `src/application/query/live-artifacts.ts`，全部设计文档零处提及——**下一个读设计的人**拿到的是
 *      一份已经不成立的坐标（「模块改动地图」缺这一行）。
 *
 * 与既有探针的分工（不重叠）：
 *   · `scripts/prompt-path-probe.mts` 只扫**提示词片段 + round-state.ts**，不扫 design/*.md；
 *   · `scripts/req-detail-design-conformance.mts` 只做 **UI 契约**（原型 ↔ 实现逐元素比对），不读 design/*.md；
 *   · 本脚本只判「**设计文档里的坐标**能不能在磁盘上落地、实施后的落点有没有回写进设计」。
 *
 * ## 判据（两条硬的 + 一条软的）
 *
 * **硬 1 · 路径可达**：设计文档里抽出的每个「路径 token」必须**真实存在**（相对工作区根），
 *   或命中下方 `WHITELIST`（每条都写清理由）。否则 = 缺口 → 逐条点名。
 *
 * **硬 2 · 落点回写**：该需求 `tasks/*.md` 里**完工汇报段**的 `files_changed`（`### 改动文件` 下的
 *   `- \`src/...\`` 列表，形态由 `ReportTask.ts:130` 决定）里每个**源码类落点**，必须在 `design/*.md`
 *   里被**提到过**。没提到 = 缺口，修复锚点固定指向 `design/architecture.md` 的「模块改动地图」节。
 *
 *   **为什么只判源码类落点（`src/` `scripts/` `packages/` `lib/`），不判 `tests/` `docs/` 等**：
 *   设计文档的模块改动地图表列的是**产品/源码模块**；测试文件的落点在 `design/test-cases.md` 的
 *   「实际文件」列与任务卡里表达，**本来就不该进模块表**——要求它们也进模块表，等于逼人把机器生成的
 *   测试名手抄一遍（同一需求实测：24 条未回写落点里 17 条落在 `tests/` 与 `docs/` 下，只有 7 条是源码类，
 *   真信号被淹没；本仓最怕「红了没人看」）。被排除的落点**不静默丢弃**：在 `--json` 里以
 *   `excludedTestPaths` 如实登记条数，避免「我悄悄少判了」。
 *
 * **软 · 符号在词表里**：反引号里的标识符若不在 `docs/knowledge/code-map.symbols.tsv` 的 symbol 列里，
 *   只作为 observation 打印，**不影响退出码**。为什么必须软：该词表是**导出符号级**的，而设计文档的反引号
 *   里同时装着局部函数名、字段名、状态字面量、**故意点名的作废变体名**与**拟新增的名字**——硬判会制造大量
 *   假红（实测单需求里词表外标识符的数量级是真缺口的十倍以上）。软轨的用处是**给人看的线索**，
 *   不是门禁。**在输出里显式说明这一点**（避免有人把「观测 0」读成「设计没写符号」）。
 *
 * ## 白名单为什么是本脚本自己的（不与 prompt-path-probe 共享）
 *
 * 两个脚本的**语料不同**，所以「合法但不存在」的形态也不同，白名单必须各自可审计：
 *   · 提示词片段是**注入给人/agent 的指令**，里面写的是「该产物将来在哪」（`prototypes/INDEX.md`）；
 *   · 设计文档是**工程方案**，里面写的是 glob（`src/**`）、花括号并列简写（`src/client/views/{timeline`）、
 *     占位段（`tests/<文件>.test.ts`）、跨需求产物（`docs/requirements` 下队列文件的通配写法）、需求相对的原型名
 *     （`prototypes/x.html#FR-1`）——这些在提示词片段里几乎不出现，反之亦然。
 * 共享一份白名单会让两边都不敢改（改一边就红另一边），所以**各持一份**，形状同款（`{match, reason}`）、
 * 精神同款（每条必须写明「为什么这个不存在的 token 是合法的」）。
 *
 * ## 判据边界（如实声明）
 *
 *   · 只扫**指定的路径根**（`SCAN_ROOTS`）——不是「所有含斜杠的 token」。设计文档里大量裸文件名
 *     （`rtm-yaml.ts:153`、`Predicates.ts`、`topology.ts:131`）是**相对某个上下文**写的模块名，
 *     静态无法判定它相对谁，无差别扫会引入数百条噪声；要判它们另开判据（本脚本不做）。
 *   · 带 `*` / `{` / `<` 的 token **不静默放行**，而是逐类登记进 `WHITELIST` 并写理由（含理由才能审计）。
 *   · **真实需求号不按占位处理**：`REQ-[\dx]+` 这类正则匹配不到 `REQ-261005193546-1b1a`（含 `-`），
 *     本脚本用 `REQ-[0-9a-z-]+` 形态；白名单里只放 `<REQ>` / `*` 两种**占位/通配**形态，
 *     写实号的需求路径（`docs/requirements/REQ-xxxx/…`）一律走磁盘可达判据。
 *   · 只判「坐标能不能落地、落点有没有回写」，不判内容对不对（那是 req-doc-validate / 模板门禁的事）。
 *   · 回写判据只覆盖**源码类落点**（见硬 2 的边界说明）；其余落点只登记条数（`excludedTestPaths`）。
 *   · 存量需求**不追溯**：既有 design/*.md 里本来就有一批失效坐标（历史改名/迁移留下的），本探针会照实
 *     点数——所以它**不进「提交前必须跑」清单**（见 `src/domain/knowledge/operations.ts` 的 EXCLUDED），
 *     只在改动/复核某个需求时按 `--req` 手动跑。
 *
 * ## 退出码（与全仓一致）
 *
 *   0 = 两条硬判据全过；1 = 有缺口（点名）；2 = 环境或参数不可用（工作区根/需求目录/词表缺失、参数非法）
 *   —— 2 与 1 分开是因为处置不同（补环境 vs 改坐标）。
 *
 * ## 用法
 *
 *   npx tsx scripts/design-coord-probe.mts --req REQ-261005193546-1b1a
 *   npx tsx scripts/design-coord-probe.mts --req REQ-261005193546-1b1a --json   # stdout 只出可 JSON.parse 的结构
 *   npx tsx scripts/design-coord-probe.mts --specimen                           # 内置反例：判据必须真的会红
 *   npx tsx scripts/design-coord-probe.mts --help
 *
 * 只认 `--req / --root / --json / --specimen / --symbols / --help`；未知参数 = exit 2 并给用法。
 *
 * @module dsh-pmboard/scripts/design-coord-probe
 */

import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const SCRIPT = 'design-coord-probe'
const DEFAULT_SYMBOLS = 'docs/knowledge/code-map.symbols.tsv'

/**
 * 需求号形态：`REQ-000001` / `REQ-2e9473` / `REQ-261005193546-1b1a` 三种都收。
 * 大写也收是为了 `--specimen` 的合成需求号（`REQ-SPECIMEN`）——磁盘上有没有这个目录另判。
 */
const REQ_ID_RE = /^REQ-[0-9A-Za-z-]+$/

/** 汇报里的「改动文件」小节标题（`src/application/use-cases/ReportTask.ts:130` 写出的形态）。 */
const FILES_CHANGED_HEADING_RE = /^###\s*改动文件\s*$/
const ANY_HEADING_RE = /^#{1,6}\s/
/**
 * 「改动文件」条目：`- \`src/x/y.ts\``（反引号可省）。要求**至少一段带斜杠的相对路径**，
 * 这样报告里的散文条目（「复核意见已收敛」）不会被误收成路径。
 */
const CHANGE_ITEM_RE = /^[-*]\s+`?([A-Za-z0-9_.@+-]+(?:\/[A-Za-z0-9_.@*+-]+)+)`?\s*$/

/**
 * 参与扫描的路径根。**为什么是这些**：设计文档点名坐标时用的仓库内前缀；不在表内的
 * （裸文件名、`refs/heads/` 之类）不是仓库根相对路径，不扫（见头部「判据边界」）。
 */
const SCAN_ROOTS = [
  'templates',
  'prototypes',
  'prototype',
  'design',
  'tasks',
  'notes',
  'docs/requirements',
  'docs/architecture',
  'docs/knowledge',
  'docs/adr',
  'docs/rfcs',
  'docs/guides',
  'docs/work-logs',
  'src',
  'scripts',
  'tests',
  'vendor',
  'skills',
  'packages',
] as const

export interface WhitelistRule {
  /** 全串匹配该 token 的形态。 */
  readonly match: RegExp
  /** 为什么这个「不存在」的 token 是合法的（必须写清；这是白名单唯一的准入条件）。 */
  readonly reason: string
}

/**
 * 设计文档语料的白名单。**顺序即优先级**（先命中的规则赢，具体规则必须排在通用规则之前）。
 *
 * 准入条件与 `prompt-path-probe.mts:85` 同款：每条都要说清「这个人不存在也合理」的**可审计**理由；
 * 禁止为了过检查而加白——既不在磁盘上、又说不清为什么该存在的 token，就是缺口（探针的全部价值）。
 */
export const WHITELIST: readonly WhitelistRule[] = [
  {
    // 放在最前：跨需求/需求自身的**产物名**是设计文档里最常见的「当下不存在」形态，
    // 而写实号的路径必须继续走磁盘判据——所以只收 `<REQ>` 与 `*` 两种占位/通配写法。
    // （踩过的坑：`REQ-[\dx]+` 匹配不到 `REQ-261005193546-1b1a`，真实需求号会被误判成缺口。）
    match: /^docs\/requirements\/(?:<REQ>|\*)\//,
    reason: '需求目录的占位/通配形态（跨需求产物 docs/requirements/*/queue.json、需求自己的产物名 docs/requirements/<REQ>/tasks/<task_id>.md）：具体文件名随需求生成，静态必然不存在；写实号的路径不在此列，仍走磁盘可达判据',
  },
  {
    match: /^prototypes\/INDEX\.md$/,
    reason: '原型权威清单由需求自己在需求阶段生成（brief §1），设计阶段登记前必然不存在',
  },
  {
    // `#FR-N` 是页内锚点不是路径本体；设计文档按**需求目录相对**口径书写原型名（决议 #2），
    // 权威落点是 docs/requirements/<REQ>/prototypes/<name>.html。
    match: /^prototypes\/[A-Za-z0-9_.-]+\.(?:html|png)(?:#FR-\d+)?$/,
    reason: '需求相对的原型页/图（权威路径 docs/requirements/<REQ>/prototypes/<name>.html）；#FR-N 是页内锚点不是路径',
  },
  {
    // 需求目录相对的产物目录（含原型目录的两种写法：新 `prototypes/`、旧 `prototype/`）。
    // 设计文档按需求相对口径引用自己的兄弟产物（决议 #2：路径书写一律需求目录相对），
    // 权威落点都在 docs/requirements/<REQ>/ 下 —— 所以「仓库根下没有 prototypes/」不是坐标失效。
    match: /^(?:design|tasks|notes|prototypes|prototype)\//,
    reason: '需求目录相对的产物名（docs/requirements/<REQ>/design/、tasks/、notes/、prototypes/、prototype/），设计文档按相对口径引用自己的产物（决议 #2）',
  },
  {
    // **裸根名前缀**（`src/`、`packages/`、`tests/` … 后面什么都没有）：它不是一个坐标，
    // 而是"落点根有这些"这种**枚举句**里的词——设计文档写「四个源码根：src/、scripts/、packages/、lib/」
    // 是陈述口径，不是点名文件。实测踩过：本需求自己的 interfaces.md 就这么写了 `packages/`
    // （本仓没有该目录），被误判成"坐标与仓库布局脱钩"。
    // 收紧的边界：只有**光秃秃一个根 + `/`** 才命中；`packages/<...>`、`packages/x.ts` 照旧走磁盘判据。
    match: /^(?:src|scripts|packages|lib|tests|docs|templates|vendor|skills)\/$/,
    reason: '裸根名前缀（枚举"落点根有 src/、packages/、tests/ …"时的写法）：它是根名不是坐标，静态无法也无需解析；带具体文件名的写法仍走磁盘可达判据',
  },
  {
    match: /\*/,
    reason: '通配写法（src/**、src/**/*.ts、scripts/migrate-*、tests/kb-*.test.ts）：它指代一组文件而不是单个路径，展开后的具体集合静态无法判定；这一类的价值在模式本身，逐文件可达性由改动/复核时另行核对',
  },
  {
    // 花括号是「同一目录下多个文件」的并列简写：
    //   `src/application/query/{QueryStageDetail,QueryDag}.ts`、`src/client/views/{timeline,panels/dag}.ts`。
    // 抽取正则在合法的路径字符集里跑，所以整串会带上 `{…}.ts`；它不是一个路径，故登记。
    // 目录前缀是否存在由**软观测**另外提示（见 classifyPaths 的 brace-dir 观测）。
    match: /^[A-Za-z0-9_./-]*\/\{[A-Za-z0-9_.,/}-]*(?:\.[A-Za-z0-9]+)?$/,
    reason: '花括号并列简写（src/application/query/{QueryStageDetail,QueryDag}.ts、src/client/views/{timeline,panels/dag}.ts）不是单个路径；目录前缀可达性由本脚本的软观测另行提示',
  },
  {
    // 长路径里的省略写法：`vendor/.../accepting-generator.ts`（中间目录略去）。
    match: /^[A-Za-z0-9_./-]*\.\.\.[A-Za-z0-9_./-]*$/,
    reason: '省略中间目录的简写（vendor/.../accepting-generator.ts）：设计文档用它在长路径里省字，静态无法还原成具体路径',
  },
  {
    // 占位段：`tests/<文件>.test.ts`、`prototypes/<name>.html`、`src/tools/<ToolName>/index.ts`。
    // `<` 之后一律算占位内容（含中文：抽取正则在非 ASCII 处截断，真实语料里常见 `tests/<` 这种残形）。
    match: /^[A-Za-z0-9_./-]+<[^\s`]*$/,
    reason: '带占位段的写法（tests/<文件>.test.ts、prototypes/<name>.html）：占位段由需求自己填充，静态无法判定；这不是「指针指歪」而是「还没写」',
  },
]

/** 抽取用 token 正则：`<根>/…`，根表见 `SCAN_ROOTS`（长根优先，避免 `prototype` 抢先匹配 `prototypes`）。 */
const TOKEN_RE = new RegExp(
  '(?:^|[^A-Za-z0-9_./-])((?:'
  + [...SCAN_ROOTS].sort((a, b) => b.length - a.length).map((r) => r.replace(/\//g, '\\/')).join('|')
  + ')\\/[A-Za-z0-9_<>{}*@$+~#.=/,-]*)',
  'g',
)

/** 行尾标点（句号/逗号/右括号/引号等）不是路径的一部分，抽出来即剥掉；**保留**结尾的 `/`（目录形态）。 */
const TRAILING_PUNCT_RE = /[.,;:!?)\]}>”"’'`、。，；：）】》]+$/u

/** 反引号片段（符号轨的抽取源）。 */
const BACKTICK_RE = /`([^`\n]+)`/g

export interface Occurrence {
  readonly file: string
  readonly line: number
}

export interface TokenHit {
  readonly token: string
  readonly occurrences: readonly Occurrence[]
}

export interface PathVerdict {
  readonly token: string
  /** exists = 磁盘上真实存在；whitelist = 命中已知书写法白名单。 */
  readonly verdict: 'exists' | 'whitelist'
  readonly reason?: string
  readonly occurrences: readonly Occurrence[]
}

export interface Gap {
  /** path = 坐标不存在；writeback = 实施落点未回写设计。 */
  readonly kind: 'path' | 'writeback'
  readonly token: string
  readonly at: string
  readonly reason: string
  readonly fix: string
}

export interface Observation {
  /** symbol = 反引号标识符不在符号词表；brace-dir = 花括号简写的目录前缀不在盘上。 */
  readonly kind: 'symbol' | 'brace-dir'
  readonly token: string
  readonly at: string
  readonly reason: string
}

export interface ChangedPath {
  /** `### 改动文件` 里写下的路径（工作区相对）。 */
  readonly path: string
  /** 哪份任务卡的汇报里写的（工作区相对路径）。 */
  readonly taskFile: string
}

/**
 * 判回写的**落点前缀**：只有产品/源码类落点要求回写「模块改动地图」。
 *
 * 为什么是这四个前缀：模块改动地图（`templates/design/architecture.md:18`）的粒度就是产品模块；
 * `tests/`（测试文件）、`docs/`（需求/知识层产物）、`templates/`、`prototypes/` 这类落点各有自己的
 * 表达位置（测试在 `design/test-cases.md` 的「实际文件」列与任务卡），要求它们也进模块表 =
 * 逼人把机器生成的测试名手抄一遍。`vendor/` 是外部依赖（进白名单口径），也不判。
 */
export const SOURCE_LANDING_PREFIXES = ['src/', 'scripts/', 'packages/', 'lib/'] as const

/** 该落点是否属「源码类」（要求回写模块改动地图）。 */
export function isSourceLanding(path: string): boolean {
  return SOURCE_LANDING_PREFIXES.some((p) => path.startsWith(p))
}

export interface ScanResult {
  readonly designDocs: number
  readonly taskDocs: number
  readonly pathTokens: number
  readonly filesChanged: number
  /** 非源码类落点（`tests/`、`docs/`…）的条数：不进判据，但要如实登记（避免「悄悄少判」）。 */
  readonly excludedLandings: number
  readonly symbolCandidates: number
  readonly verdicts: readonly PathVerdict[]
  readonly gaps: readonly Gap[]
  readonly observations: readonly Observation[]
}

/** 修复锚点（硬 2 的文案，逐字给出可执行落点）。 */
const WRITEBACK_FIX = '在 design/architecture.md 的「模块改动地图」节（模板 templates/design/architecture.md:18，表头 模块/文件 | 类型 | 改动内容 | 原因（serves哪条FR） | 影响范围）补一行'
const PATH_FIX = '把坐标改成真实路径（或在 scripts/design-coord-probe.mts 的 WHITELIST 登记并写清理由）'

/* ── 参数 ─────────────────────────────────────────────────────────────────── */

export interface ParsedArgs {
  readonly req?: string
  readonly root?: string
  readonly symbols?: string
  readonly json: boolean
  readonly specimen: boolean
  readonly help: boolean
}

/** 参数解析：只认六个开关；非法参数 = 用法错误（exit 2，不静默忽略）。 */
export function parseArgs(argv: readonly string[]): ParsedArgs | string {
  const out: { req?: string; root?: string; symbols?: string; json: boolean; specimen: boolean; help: boolean } = {
    json: false, specimen: false, help: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--json') out.json = true
    else if (a === '--specimen') out.specimen = true
    else if (a === '--help' || a === '-h') out.help = true
    else if (a === '--req' || a === '--root' || a === '--symbols') {
      const v = argv[i + 1]
      if (v === undefined || v.startsWith('--')) return '缺少参数值：' + a
      if (a === '--req') out.req = v
      else if (a === '--root') out.root = v
      else out.symbols = v
      i += 1
    } else return '未知参数：' + a
  }
  return out
}

export function usage(): string {
  return [
    '用法：npx tsx scripts/design-coord-probe.mts --req <REQ-xxxxxx> [--json]',
    '      npx tsx scripts/design-coord-probe.mts --specimen',
    '可选：--root <dir>（默认工作区根；给标本/测试指向合成树）',
    '      --symbols <path>（默认 ' + DEFAULT_SYMBOLS + '，相对 root 解析）',
    '      --help',
    '退出码：0 = 判据全过；1 = 有缺口；2 = 环境或参数不可用',
  ].join('\n')
}

/* ── 抽取 ─────────────────────────────────────────────────────────────────── */

export interface TextEntry {
  readonly file: string
  readonly text: string
}

/** 递归列目录下的 `*.md`（不排序；调用方需要稳定顺序时自己排）。 */
export function listMarkdown(dir: string): string[] {
  const out: string[] = []
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name)
    if (ent.isDirectory()) out.push(...listMarkdown(p))
    else if (ent.name.endsWith('.md')) out.push(p)
  }
  return out
}

/** 抽出文本里的候选路径 token（带 文件:行），同一 token 多处出现只算一个对象、保留全部出处。 */
export function extractPathTokens(entries: readonly TextEntry[]): TokenHit[] {
  const seen = new Map<string, Occurrence[]>()
  for (const entry of entries) {
    entry.text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(TOKEN_RE)) {
        const token = m[1]!.replace(TRAILING_PUNCT_RE, '')
        if (token.length === 0) continue
        const list = seen.get(token) ?? []
        list.push({ file: entry.file, line: i + 1 })
        seen.set(token, list)
      }
    })
  }
  return [...seen].map(([token, occurrences]) => ({ token, occurrences }))
}

/** token 在磁盘上是否真实存在（页内锚点 `#FR-N` 与结尾 `/` 不属于路径本体）。 */
export function existsInRepo(root: string, token: string): boolean {
  const clean = token.replace(/#.*$/, '').replace(/\/+$/, '')
  if (clean.length === 0) return false
  return existsSync(join(root, clean))
}

/** 出处列表的人读形态（最多 3 条，超出折叠）。 */
function atOf(root: string, occurrences: readonly Occurrence[]): string {
  const shown = occurrences.slice(0, 3).map((o) => relative(root, o.file) + ':' + String(o.line))
  const more = occurrences.length > 3 ? '…（共 ' + String(occurrences.length) + ' 处）' : ''
  return shown.join('、') + more
}

/**
 * 分类：存在 → 白名单 → 缺口。顺带产出「花括号简写的目录前缀不在盘上」软观测。
 * 纯函数化（只读磁盘，不改任何东西）——`--specimen` 与单测直接复用同一份判据，判据不空转。
 */
export function classifyPaths(
  root: string,
  hits: readonly TokenHit[],
): { verdicts: PathVerdict[]; gaps: Gap[]; observations: Observation[] } {
  const verdicts: PathVerdict[] = []
  const gaps: Gap[] = []
  const observations: Observation[] = []
  for (const h of hits) {
    if (existsInRepo(root, h.token)) {
      verdicts.push({ token: h.token, verdict: 'exists', occurrences: h.occurrences })
      continue
    }
    const rule = WHITELIST.find((r) => r.match.test(h.token))
    if (rule !== undefined) {
      verdicts.push({ token: h.token, verdict: 'whitelist', reason: rule.reason, occurrences: h.occurrences })
      // 花括号形态另有一条**软**线索：目录前缀若不在盘上，很可能是改错了目录（不进 exit）。
      // 前缀 = 第一个 `/{` 之前的部分（花括号里还会再有 `/`，不能用 lastIndexOf）。
      if (h.token.includes('{') && !h.token.includes('*') && !h.token.includes('<')) {
        const braceAt = h.token.indexOf('/{')
        const prefix = braceAt < 0 ? '' : h.token.slice(0, braceAt + 1)
        if (prefix.length > 0 && !existsSync(join(root, prefix))) {
          observations.push({
            kind: 'brace-dir', token: h.token, at: atOf(root, h.occurrences),
            reason: '花括号简写的目录前缀不在盘上（' + prefix + '）——软观测，请人工确认是不是目录写错了',
          })
        }
      }
      continue
    }
    gaps.push({
      kind: 'path', token: h.token, at: atOf(root, h.occurrences),
      reason: '既不在磁盘上，也不在已知书写法白名单里（坐标已与仓库布局脱钩）',
      fix: PATH_FIX,
    })
  }
  return { verdicts, gaps, observations }
}

/**
 * 抽出任务卡「完工汇报段」的改动文件清单（`### 改动文件` 小节下的列表项）。
 * 只认小节内的条目：小节外的同名路径（例如「实施方案」里提到的文件）不算**通报过的落点**。
 */
export function extractFilesChanged(text: string, taskFile: string): ChangedPath[] {
  const out: ChangedPath[] = []
  let inSection = false
  for (const line of text.split('\n')) {
    if (FILES_CHANGED_HEADING_RE.test(line)) {
      inSection = true
      continue
    }
    if (ANY_HEADING_RE.test(line)) {
      inSection = false
      continue
    }
    if (!inSection) continue
    const m = CHANGE_ITEM_RE.exec(line)
    if (m === null) continue
    out.push({ path: m[1]!.replace(/^\.\//, ''), taskFile })
  }
  return out
}

/**
 * 回写判据：每个**源码类**通报落点必须在设计文档全文里被提到过（子串判定）。
 * 子串而非「表格行相等」是有意的：设计文档提到落点的方式很多（改动地图一行、接口表一格、
 * `src/x/y.ts:60` 带行号、散文里的「既有的 `src/x/y.ts`」），要求形态相等会制造假红；
 * 我们只判「设计里有没有这个名字」——没有名字 = 下一个读设计的人无从知道这个落点存在。
 *
 * 非源码类落点（`tests/`、`docs/`…）**不服判据**，但要**登记条数**（`excluded`），
 * 否则「少判了」就成了看不见的事（口径见头部硬 2）。
 */
export function checkWriteback(
  root: string,
  designText: string,
  changed: readonly ChangedPath[],
): { gaps: Gap[]; excluded: number } {
  const byPath = new Map<string, Set<string>>()
  const excluded = new Set<string>()
  for (const c of changed) {
    if (!isSourceLanding(c.path)) {
      excluded.add(c.path)
      continue
    }
    if (designText.includes(c.path)) continue
    const set = byPath.get(c.path) ?? new Set<string>()
    set.add(relative(root, c.taskFile))
    byPath.set(c.path, set)
  }
  return {
    gaps: [...byPath].map(([path, tasks]) => ({
      kind: 'writeback' as const,
      token: path,
      at: [...tasks].join('、'),
      reason: '实现期落点未回写设计：design/*.md 零处提及（设计坐标对下一个读者已经失效）',
      fix: WRITEBACK_FIX,
    })),
    excluded: excluded.size,
  }
}

export interface SymbolHit {
  readonly symbol: string
  readonly occurrences: readonly Occurrence[]
}

/** 标识符形态（可带尾部 `()` 调用或 `<…>` 泛型实参；泛型参数里的逗号不在抽取范围内）。 */
const IDENT_RE = /^([A-Za-z_$][A-Za-z0-9_$]*)(?:\(\s*\))?(?:<[^<>]*>)?$/

/**
 * 从反引号里抽「代码形态」的标识符。
 *
 * 只收**整串就是一个标识符**的形态（可带尾部 `()` / `<…>`），并要求它长得像代码：
 * 带调用括号、或含大写字母（PascalCase 类型名 / camelCase 函数名 / SCREAMING_SNAKE 常量）。
 * 这样过滤掉 `design` / `tasks` / `true` 这类纯小写散文词，同时保留 `computeTestingCoverage`
 * 这类「全仓不存在的函数名」——它正是符号轨要给人看的线索。
 */
export function extractCodeSymbols(entries: readonly TextEntry[]): SymbolHit[] {
  const seen = new Map<string, Occurrence[]>()
  for (const entry of entries) {
    entry.text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(BACKTICK_RE)) {
        const raw = m[1]!.trim()
        if (raw.length === 0 || raw.length > 60) continue
        const parsed = IDENT_RE.exec(raw)
        if (parsed === null) continue
        const symbol = parsed[1]!
        const callish = raw.includes('(')
        if (!callish && !/[A-Z]/.test(symbol)) continue
        const list = seen.get(symbol) ?? []
        if (list.length < 5) list.push({ file: entry.file, line: i + 1 })
        seen.set(symbol, list)
      }
    })
  }
  return [...seen].map(([symbol, occurrences]) => ({ symbol, occurrences }))
}

/** 读符号词表（`docs/knowledge/code-map.symbols.tsv` 的 symbol 列；跳过表头）。 */
export function loadSymbolSet(path: string): Set<string> {
  const out = new Set<string>()
  const lines = readFileSync(path, 'utf8').split('\n')
  for (const [i, line] of lines.entries()) {
    if (line.trim().length === 0) continue
    const cols = line.split('\t')
    if (i === 0 && cols[0] === 'file') continue
    const sym = cols[1]?.trim()
    if (sym !== undefined && sym.length > 0) out.add(sym)
  }
  return out
}

/** 符号轨：不在词表里的标识符 → observation（**不进 gaps、不影响退出码**）。 */
export function classifySymbols(
  root: string,
  hits: readonly SymbolHit[],
  symbolSet: ReadonlySet<string>,
): Observation[] {
  return hits
    .filter((h) => !symbolSet.has(h.symbol))
    .map((h) => ({
      kind: 'symbol' as const,
      token: h.symbol,
      at: atOf(root, h.occurrences),
      reason: '不在 ' + DEFAULT_SYMBOLS + ' 的 symbol 列（该词表是导出符号级：局部函数名、字段名、作废变体名、拟新增的名字天然不在表里 ⇒ 只作线索，不判红）',
    }))
}

/* ── 扫描 ─────────────────────────────────────────────────────────────────── */

function reqDirOf(root: string, reqId: string): string {
  return join(root, 'docs/requirements', reqId)
}

/** 前置检查：环境不可用一律 exit 2（不静默跳过）——返回人读错误信息，null = 可用。 */
export function preflight(root: string, reqId: string, symbolsPath: string): string | null {
  if (!REQ_ID_RE.test(reqId)) return '需求号形态非法：' + reqId
  const base = reqDirOf(root, reqId)
  if (!existsSync(base)) return '需求目录不存在：' + relative(root, base)
  const designDir = join(base, 'design')
  if (!existsSync(designDir)) return '设计目录缺失（拆分/设计阶段还没产出）：' + relative(root, designDir)
  if (listMarkdown(designDir).length === 0) return '设计目录里没有 *.md：' + relative(root, designDir)
  if (!existsSync(symbolsPath)) return '符号词表缺失：' + symbolsPath
  return null
}

/**
 * 扫一条需求的设计坐标（可注入 root：单测与 `--specimen` 都走这条路径，判据一份）。
 * 前置不满足时抛错——调用方（`main`）先跑 `preflight` 把它变成 exit 2。
 */
export function scanRequirement(root: string, reqId: string, symbolsPath: string): ScanResult {
  const base = reqDirOf(root, reqId)
  const designFiles = listMarkdown(join(base, 'design')).sort()
  const tasksDir = join(base, 'tasks')
  const taskFiles = existsSync(tasksDir) ? listMarkdown(tasksDir).sort() : []
  const designEntries: TextEntry[] = designFiles.map((f) => ({ file: f, text: readFileSync(f, 'utf8') }))

  const hits = extractPathTokens(designEntries)
  const classified = classifyPaths(root, hits)

  const designText = designEntries.map((e) => e.text).join('\n')
  const changed = taskFiles.flatMap((f) => extractFilesChanged(readFileSync(f, 'utf8'), f))
  const writeback = checkWriteback(root, designText, changed)

  const symbolHits = extractCodeSymbols(designEntries)
  const symbolSet = loadSymbolSet(symbolsPath)
  const symbolObservations = classifySymbols(root, symbolHits, symbolSet)

  return {
    designDocs: designFiles.length,
    taskDocs: taskFiles.length,
    pathTokens: hits.length,
    filesChanged: new Set(changed.map((c) => c.path)).size,
    excludedLandings: writeback.excluded,
    symbolCandidates: symbolHits.length,
    verdicts: classified.verdicts,
    gaps: [...classified.gaps, ...writeback.gaps],
    observations: [...classified.observations, ...symbolObservations],
  }
}

/* ── 报告 ─────────────────────────────────────────────────────────────────── */

export interface Report {
  readonly script: string
  readonly mode: 'scan' | 'specimen'
  readonly ok: boolean
  readonly exitCode: 0 | 1 | 2
  readonly root: string
  readonly req?: string
  readonly criterion: {
    readonly pathReachable: { readonly ok: boolean; readonly objects: number; readonly gaps: number }
    readonly writeback: { readonly ok: boolean; readonly objects: number; readonly gaps: number }
  }
  /**
   * 被回写判据**排除**的非源码类落点条数（`tests/`、`docs/`、`templates/`…）。
   * 单列出来是为了「少判了」可见：判据只覆盖源码类落点（口径见文件头硬 2），
   * 但排除本身要留痕，免得读者以为通篇判过。
   */
  readonly excludedTestPaths: number
  readonly scanned: {
    readonly designDocs: number
    readonly taskDocs: number
    readonly pathTokens: number
    readonly filesChanged: number
    readonly symbolCandidates: number
  }
  readonly counts: { readonly exists: number; readonly whitelist: number; readonly observations: number }
  readonly gaps: readonly Gap[]
  readonly observations: readonly Observation[]
}

export function buildReport(root: string, reqId: string, res: ScanResult): Report {
  const exists = res.verdicts.filter((v) => v.verdict === 'exists').length
  const whitelist = res.verdicts.filter((v) => v.verdict === 'whitelist').length
  const pathGaps = res.gaps.filter((g) => g.kind === 'path')
  const wbGaps = res.gaps.filter((g) => g.kind === 'writeback')
  return {
    script: SCRIPT,
    mode: 'scan',
    ok: res.gaps.length === 0,
    exitCode: res.gaps.length === 0 ? 0 : 1,
    root,
    req: reqId,
    criterion: {
      pathReachable: { ok: pathGaps.length === 0, objects: res.pathTokens, gaps: pathGaps.length },
      writeback: { ok: wbGaps.length === 0, objects: res.filesChanged, gaps: wbGaps.length },
    },
    excludedTestPaths: res.excludedLandings,
    scanned: {
      designDocs: res.designDocs,
      taskDocs: res.taskDocs,
      pathTokens: res.pathTokens,
      filesChanged: res.filesChanged,
      symbolCandidates: res.symbolCandidates,
    },
    counts: { exists, whitelist, observations: res.observations.length },
    gaps: res.gaps,
    observations: res.observations,
  }
}

/** 人读输出里最多列几个符号观测（软轨噪声大，全量走 `--json`）。 */
const HUMAN_OBSERVATION_CAP = 40

export function printHuman(report: Report): void {
  const head = report.req === undefined ? '' : report.req + '：'
  console.log('[' + SCRIPT + '] ' + head + '设计坐标（路径可达 + 落点回写），'
    + '扫 ' + String(report.scanned.designDocs) + ' 份设计 / ' + String(report.scanned.taskDocs) + ' 份任务卡')
  for (const g of report.gaps) {
    const label = g.kind === 'path' ? 'FAIL 路径可达' : 'FAIL 落点回写'
    console.log('[' + SCRIPT + '] ' + label + ' ' + g.token + ' ← ' + g.at + '（' + g.reason + '）')
  }
  if (report.gaps.some((g) => g.kind === 'writeback')) {
    console.log('  修复（回写）：' + WRITEBACK_FIX)
  }
  if (report.gaps.some((g) => g.kind === 'path')) {
    console.log('  修复（路径）：' + PATH_FIX)
  }
  console.log('[' + SCRIPT + '] 路径 token ' + String(report.criterion.pathReachable.objects)
    + '（真实存在 ' + String(report.counts.exists) + ' / 书写法白名单 ' + String(report.counts.whitelist) + '）'
    + '；通报落点 ' + String(report.criterion.writeback.objects)
    + '（其中非源码类 ' + String(report.excludedTestPaths) + ' 条不服回写判据：tests/、docs/ 等，口径见文件头硬 2）'
    + '；缺口 路径 ' + String(report.criterion.pathReachable.gaps)
    + ' + 回写 ' + String(report.criterion.writeback.gaps)
    + '；exit ' + String(report.exitCode))
  const obs = report.observations
  console.log('[' + SCRIPT + '] 软观测 ' + String(obs.length) + ' 条（**不影响退出码**）：'
    + '符号不在词表 = 线索不是门禁（词表是导出符号级；设计里同时装着字段名/作废变体名/拟新增名，硬判会制造大量假红）')
  for (const o of obs.slice(0, HUMAN_OBSERVATION_CAP)) {
    console.log('  · [' + o.kind + '] ' + o.token + ' ← ' + o.at)
  }
  if (obs.length > HUMAN_OBSERVATION_CAP) {
    console.log('  · …还有 ' + String(obs.length - HUMAN_OBSERVATION_CAP) + ' 条（完整列表用 --json）')
  }
}

function fail(root: string, message: string, json: boolean): never {
  if (json) {
    console.log(JSON.stringify({ script: SCRIPT, mode: 'scan', ok: false, exitCode: 2, root, error: message }, null, 2))
  } else {
    console.error('[' + SCRIPT + '] ERROR（用法或环境，退出码 2）：' + message)
    console.error(usage())
  }
  process.exit(2)
}

/* ── --specimen：内置反例（判据必须真的会红）────────────────────────────────── */

interface SpecimenCase {
  readonly name: string
  readonly ok: boolean
  readonly detail: string
}

/**
 * 合成最小树跑五种标本。**绝不改动仓库里的真实文件**：全部写在
 * `mkdtempSync(join(tmpdir(), 'design-coord-specimen-'))` 下，`finally` 里整棵删掉。
 *
 * 为什么标本里要放「真实存在的 src 占位文件」：路径判据是 `existsSync`，不造出真实存在的文件，
 * 就没法构造「全绿」这一例——而「全绿会不会误红」与「改坏会不会红」是**两条**必备反例。
 */
export function runSpecimen(): { cases: SpecimenCase[]; exitCode: 0 | 1; root: string } {
  const tmp = mkdtempSync(join(tmpdir(), 'design-coord-specimen-'))
  const cases: SpecimenCase[] = []
  try {
    // 合成树里自带一份最小符号词表，标本与真实词表解耦（符号轨是软的，不该让标本依赖仓库内容）。
    const symbolsBody = 'file\tsymbol\tkind\tsignature\n'
      + 'src/real/a.ts\tliveCountOf\tfunction\texport function liveCountOf('

    const write = (tree: string, rel: string, body: string): void => {
      const p = join(tmp, tree, rel)
      mkdirSync(dirname(p), { recursive: true })
      writeFileSync(p, body)
    }

    /** 全绿标本的设计文档：一个真实存在的路径 + 全部白名单形态 + 一个词表外符号。 */
    const greenDesign = (pathToken: string, braceToken: string): string => [
      '# 架构设计（REQ-SPECIMEN）',
      '',
      '## 模块改动地图 `serves: FR-1`',
      '',
      '| 模块/文件 | 类型 | 改动内容 | 原因（serves哪条FR） | 影响范围 |',
      '|---|---|---|---|---|',
      '| `' + pathToken + '` | 改 | 加一个判断 | FR-1 | 小 |',
      '| `src/**` | 通配 | 白名单形态：glob | FR-1 | — |',
      '| `' + braceToken + '` | 简写 | 白名单形态：花括号并列 | FR-1 | — |',
      '| `tests/<文件>.test.ts` | 占位 | 白名单形态：占位段 | FR-1 | — |',
      '| `docs/requirements/<REQ>/queue.json` | 产物 | 白名单形态：需求自己的产物名 | FR-1 | — |',
      '| `prototypes/x.html#FR-1` | 原型 | 白名单形态：需求相对原型名 + 页内锚点 | FR-1 | — |',
      '| `scripts/migrate-*` | 通配 | 白名单形态：glob | FR-1 | — |',
      '',
      '接口：`liveCountOf`（词表内）与 `computeTestingCoverage`（词表外，软轨线索）。',
      '',
    ].join('\n')

    const taskCard = (paths: readonly string[]): string => [
      '# t-1 标本卡',
      '',
      '## 在做什么',
      '标本',
      '',
      '---',
      '## 汇报 1（2026-10-01T00:00:00.000Z，窗口 session-specimen）',
      '',
      '标本汇报。',
      '',
      '### 完成项',
      '',
      '- 做了点事',
      '',
      '### 改动文件',
      '',
      ...paths.map((p) => '- `' + p + '`'),
      '',
      '### 下一步',
      '',
      '无',
      '',
      '---',
      '',
    ].join('\n')

    const build = (
      tree: string, designPath: string, changed: readonly string[], braceToken: string,
    ): void => {
      write(tree, 'docs/requirements/REQ-SPECIMEN/design/architecture.md', greenDesign(designPath, braceToken))
      write(tree, 'docs/requirements/REQ-SPECIMEN/tasks/t-1.md', taskCard(changed))
      write(tree, 'docs/knowledge/code-map.symbols.tsv', symbolsBody)
      // 真实存在的 src 占位文件（让「路径可达」这一判据有真值可判）+ 一个测试占位（考「非源码类不服判据」）
      write(tree, 'src/real/a.ts', 'export function liveCountOf(): number { return 0 }\n')
      write(tree, 'src/extra/new-module.ts', 'export const extra = 1\n')
      write(tree, 'tests/real/a.test.ts', '// 标本测试占位\n')
    }

    const BRACE_OK = 'src/application/query/{QueryStageDetail'

    const scanTree = (tree: string): Report => {
      const root = join(tmp, tree)
      const symbolsPath = join(root, DEFAULT_SYMBOLS)
      const pre = preflight(root, 'REQ-SPECIMEN', symbolsPath)
      if (pre !== null) throw new Error('[' + tree + '] 标本树前置不通过：' + pre)
      return buildReport(root, 'REQ-SPECIMEN', scanRequirement(root, 'REQ-SPECIMEN', symbolsPath))
    }

    // 先把四棵树都跑出来，再按 ①…⑤ 的顺序登记用例（输出顺序 = 编号顺序，人读不跳）
    // ③/④ 用全绿树：路径都存在 + 源码类落点都被提到 + 一个测试落点（不服判据但登记条数）
    build('green', 'src/real/a.ts', ['src/real/a.ts', 'tests/real/a.test.ts'], BRACE_OK)
    // 花括号简写的目录前缀在盘上（否则会多出一条 brace-dir 软观测——那由 ⑤ 专门考）
    mkdirSync(join(tmp, 'green/src/application/query'), { recursive: true })
    const green = scanTree('green')

    // ① 把设计里的路径改成不存在的 → 路径判据必须红并点名
    build('bad-path', 'src/nope/x.ts', ['src/real/a.ts'], BRACE_OK)
    mkdirSync(join(tmp, 'bad-path/src/application/query'), { recursive: true })
    const badPath = scanTree('bad-path')

    // ② 任务卡多报一个设计没提的落点（另带一个测试落点：它**不该**红，但仍要被登记）→ 回写判据红并点名
    build('bad-writeback', 'src/real/a.ts',
      ['src/real/a.ts', 'src/extra/new-module.ts', 'tests/real/a.test.ts'], BRACE_OK)
    mkdirSync(join(tmp, 'bad-writeback/src/application/query'), { recursive: true })
    const badWb = scanTree('bad-writeback')

    // ⑤ 花括号简写的目录前缀不在盘上 → 只出软观测
    build('bad-brace', 'src/real/a.ts', ['src/real/a.ts'], 'src/nowhere/at-all/{QueryStageDetail')
    const badBrace = scanTree('bad-brace')

    const namedBad = badPath.gaps.filter((g) => g.kind === 'path').map((g) => g.token)
    const wbNamed = badWb.gaps.filter((g) => g.kind === 'writeback').map((g) => g.token)
    const braceObs = badBrace.observations.filter((o) => o.kind === 'brace-dir').map((o) => o.token)

    cases.push({
      name: '① 设计文档点名不存在的 src/... → 判红并点名该路径',
      ok: badPath.exitCode === 1 && namedBad.includes('src/nope/x.ts'),
      detail: 'exit ' + String(badPath.exitCode) + '、路径缺口 ' + JSON.stringify(namedBad),
    })
    cases.push({
      name: '② 源码类落点未回写模块改动地图 → 判红并点名（测试落点不红但登记条数）',
      ok: badWb.exitCode === 1
        && wbNamed.length === 1
        && wbNamed.includes('src/extra/new-module.ts')
        && badWb.gaps.every((g) => g.kind !== 'path')
        && badWb.gaps.some((g) => g.fix.includes('模块改动地图'))
        && badWb.excludedTestPaths === 1,
      detail: 'exit ' + String(badWb.exitCode) + '、回写缺口 ' + JSON.stringify(wbNamed)
        + '（应为 1 条且只含 src/ 那条）'
        + '、路径缺口 ' + String(badWb.gaps.filter((g) => g.kind === 'path').length) + '（应为 0）'
        + '、excludedTestPaths ' + String(badWb.excludedTestPaths) + '（应为 1：tests/real/a.test.ts 不服判据）',
    })
    cases.push({
      name: '③ 全绿标本（路径存在 + 源码类落点已回写；测试落点不服判据但登记条数）',
      ok: green.exitCode === 0 && green.gaps.length === 0 && green.excludedTestPaths === 1,
      detail: 'exit ' + String(green.exitCode) + '、缺口 ' + String(green.gaps.length)
        + '（白名单命中 ' + String(green.counts.whitelist) + ' 个书写法形态，未误判为缺口）'
        + '、excludedTestPaths ' + String(green.excludedTestPaths) + '（应为 1）',
    })
    cases.push({
      name: '④ 符号轨是软的（词表外标识符只进观测，不改退出码）',
      ok: green.exitCode === 0
        && green.observations.some((o) => o.token === 'computeTestingCoverage')
        && green.observations.every((o) => o.kind === 'symbol')
        && !green.gaps.some((g) => g.token === 'computeTestingCoverage'),
      detail: '观测 ' + String(green.observations.length) + ' 条且 exit ' + String(green.exitCode)
        + '，点名 ' + green.observations.map((o) => o.token).join('、'),
    })
    cases.push({
      name: '⑤ 花括号简写的目录前缀不在盘上 → 软观测提示，不改退出码',
      ok: badBrace.exitCode === 0 && braceObs.includes('src/nowhere/at-all/{QueryStageDetail'),
      detail: 'exit ' + String(badBrace.exitCode) + '、brace-dir 观测 ' + JSON.stringify(braceObs),
    })

    return { cases, exitCode: cases.every((c) => c.ok) ? 0 : 1, root: tmp }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

/* ── main ─────────────────────────────────────────────────────────────────── */

export function main(argv: readonly string[]): void {
  const parsed = parseArgs(argv)
  if (typeof parsed === 'string') {
    console.error('[' + SCRIPT + '] ERROR（用法或环境，退出码 2）：' + parsed)
    console.error(usage())
    process.exit(2)
  }
  const root = parsed.root === undefined ? process.cwd() : parsed.root

  if (parsed.help) {
    console.log(usage())
    process.exit(0)
  }

  if (parsed.specimen) {
    const out = runSpecimen()
    if (parsed.json) {
      console.log(JSON.stringify({
        script: SCRIPT, mode: 'specimen', ok: out.exitCode === 0, exitCode: out.exitCode,
        syntheticRoot: out.root, cases: out.cases,
      }, null, 2))
    } else {
      for (const c of out.cases) {
        console.log('[' + SCRIPT + '] specimen ' + c.name + '：' + (c.ok ? '✔' : '✘') + ' ' + c.detail)
      }
      console.log('[' + SCRIPT + '] specimen ' + (out.exitCode === 0 ? 'OK（判据不空转）' : 'FAIL（判据空转或有假红）')
        + '；exit ' + String(out.exitCode))
    }
    process.exit(out.exitCode)
  }

  if (parsed.req === undefined) fail(root, '缺少 --req <REQ-xxxxxx>（或 --specimen）', parsed.json)
  const reqId = parsed.req
  const symbolsPath = parsed.symbols === undefined
    ? join(root, DEFAULT_SYMBOLS)
    : (isAbsolute(parsed.symbols) ? parsed.symbols : join(root, parsed.symbols))

  const pre = preflight(root, reqId, symbolsPath)
  if (pre !== null) fail(root, pre, parsed.json)

  const report = buildReport(root, reqId, scanRequirement(root, reqId, symbolsPath))
  if (parsed.json) console.log(JSON.stringify(report, null, 2))
  else printHuman(report)
  process.exit(report.exitCode)
}

/** 只在「被直接执行」时跑 main（被测试 import 时不许自己 exit；同 `req-doc-validate.mts:876` 的精神）。 */
const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) main(process.argv.slice(2))
