#!/usr/bin/env node
/**
 * R3 —— 提示词路径可达探针（REQ-261005105032-3b02 t20 · FR-10 · design-brief §6 · 决议 #17/#47）。
 *
 * 解决什么问题：注入面（提示词片段 + 回合指令）里写的**路径指针**与仓库真实布局是两处写法。
 * 指针指向一个不存在文件的后果是**静默**的——模板改名/迁移之后（如 `templates/design/prototype.html`
 * 迁到 `templates/brainstorming/prototype.html`），片段会继续教 agent 去读旧路径，没有任何东西报错，
 * 直到人肉发现。本探针把「片段里写了什么路径」与「磁盘上有什么」拉到同一条命令上。
 *
 * 判据（一条）：`src/domain/prompt/fragments/**` + `round-state.ts` 文本里抽出的每个路径 token，
 *   必须**真实存在**（相对工作区根）**或**命中已知产物名白名单（下方 `WHITELIST`，每条都写清理由）。
 *   否则 = 缺口 → exit 1 并**逐条点名**（token + 文件:行 + 修复提示）。
 *
 * 为什么白名单必须显式且带理由（而不是"看起来像占位的就放过"）：
 *   ① 有些 token 是**由需求自己生成、当下必然不存在**的合法产物名（`prototypes/INDEX.md`、
 *      `prototypes/<name>.html`）——它们不是错，是"还没写"；
 *   ② 有些 token 属于**旧目录的兼容期**（`docs/requirements/<REQ>/prototype/`，brief §1：旧路径仍识别为
 *      原型、门禁只提示迁移）——本探针**显式承认兼容期**（卡面选项 a），不悄悄改别人卡面的文案；
 *   ③ 有些 token 从来就不在本仓（上游 superpowers SKILL.md 原文里的**目标项目**路径
 *      `docs/superpowers/specs/…`、宿主 monorepo 布局 `packages/pages/<pkg>/src`）——而 `heavy.md`
 *      与 vendor 原文**逐字节锁定**（`check-prompt-fragments.mjs` 的第二条判据），想"改掉"都改不掉；
 *   一律登记 + 写理由，是为了让"为什么这个不存在的路径可以放过"可审计；而不是让新指针默默溜过。
 *
 * 判据边界（如实声明，不含糊）：
 *   · 只扫**指定的路径根**（`SCAN_ROOTS`）——不是"所有含斜杠的 token"。理由：片段里的 `I/O`、`A/B/C`、
 *     上游原文的 `main/master`、git 的 `refs/heads/<branch>` 不是仓库路径，无差别扫会引入大量噪声与白名单；
 *   · 带占位段的 token（`<...>` / `*`）**不自动放行**——必须显式登记（与 #26「未登记的占位符 → exit 1
 *     并点名」同款口径），代价是 `docs/requirements/<REQ>/…` 这类形态只能按**前缀**登记（见规则 4），
 *     因此前缀下的具体文件名拼错当前抓不到；这是有意接受的近似（动态段无法静态判定）；
 *   · 只判"路径可达"，不判内容对不对（那是模板门禁 R1 / 节名一致 R2 的事）。
 *
 * 退出码（决议 #47）：0 = 判据全过；1 = 有缺口（点名）；2 = 前置/用法错误（工作区根不可解析、扫描目标缺失、
 *   参数非法）——2 与 1 分开是因为处置不同（补环境 vs 改指针）。
 *
 * 用法：
 *   npx tsx scripts/prompt-path-probe.mts            # 人读；退出码 0/1/2
 *   npx tsx scripts/prompt-path-probe.mts --json     # stdout 只输出可 JSON.parse 的结构（CI / 自检脚本消费）
 *   npx tsx scripts/prompt-path-probe.mts --specimen # 内置反例：判据必须真的会红（防"探针空转"）
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const SCRIPT = 'prompt-path-probe'

/** 扫描对象：注入面的两处文本源——片段目录（递归 `*.md`）与回合指令模块。 */
const SCAN_DIRS = ['src/domain/prompt/fragments'] as const
const SCAN_FILES = ['src/application/dive/round-state.ts'] as const

/**
 * agent 可见文案面（REQ-261007200706-89b7 FR-1 扩面；t2）——工具 description/schema 描述、
 * 会话注入串、看板文案。为什么扩到这里：G1 的 8 处死路径全部住在这类文件里，
 * 而原扫描面（片段 + round-state）盖不住，于是「指针可达」的判据在这片区域长期是盲区。
 * `*.ts` 先剥注释再抽 token（agent 看不到注释，扫注释只会把功能性说明打成误报）。
 */
const AGENT_SURFACE_DIRS = ['src/tools'] as const
const AGENT_SURFACE_FILES = [
  'src/application/internal/capture-section.ts',
  'src/client/views/verification.ts',
] as const

/**
 * 禁词前缀（硬规则，**不接受白名单豁免**）：命中即缺口。
 *
 * 为什么需要它（而不是靠 SCAN_ROOTS 抽 token 兜住）：
 *   · `agent-dh/` 不是扫描根——旧 monorepo 工作区名前缀换个写法就能溜过 token 抽取；
 *   · `docs/standards/` 不在根表里——同理。
 * 这两类前缀在本仓都是**历史残留的死路径写法**（旧工作区名 / 已不存在的规范目录），
 * 出现在 agent 可见文案里 = agent 照它去找必然扑空，所以一律判红、没有"说不清就放过"的余地。
 */
const FORBIDDEN_PATTERNS: readonly { readonly re: RegExp; readonly reason: string }[] = [
  {
    re: /(?:^|[^\w/-])agent-dh\//,
    reason: '旧 monorepo 工作区名前缀（agent-dh/…），本仓不存在该目录——文案指针必须写工作区相对的真实路径',
  },
  {
    re: /docs\/standards\//,
    reason: 'docs/standards/ 目录在本仓不存在（历史规范路径）——不得作为 agent 可见文案的指针',
  },
]

/**
 * 参与扫描的路径根（**为什么是这些**：它们都是"仓库内真实存在的目录"或"需求目录相对的产物名"，
 * 是注入面会教 agent 去读/去写的位置）。不在表内的前缀（如 `refs/heads/`、`main/master`、`I/O`）
 * 不是仓库路径，不扫（见头部「判据边界」）。
 */
const SCAN_ROOTS = [
  'templates',
  'prototypes',
  'prototype',
  'design',
  'tasks',
  'notes',
  'docs/requirements',
  'docs/superpowers',
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

interface WhitelistRule {
  /** 全串匹配该 token 的形态。 */
  readonly match: RegExp
  /** 为什么这个"不存在"的 token 是合法的（必须写清；这是白名单唯一的准入条件）。 */
  readonly reason: string
}

/**
 * 已知产物名 / 外部路径白名单。**顺序即优先级**（先命中的规则赢）。
 *
 * 每条都必须是"这个人不存在也合理"的**可审计**理由——禁止为了过检查而加白：
 * 若某个 token 既不在磁盘上、又说不清为什么该存在，那它就是缺口（探针的全部价值）。
 */
const WHITELIST: readonly WhitelistRule[] = [
  {
    // 兼容期（卡面选项 a）：brief §1 明确旧目录 `docs/requirements/<REQ>/prototype/*.html` 仍识别为
    // prototype（门禁只提示迁移到 prototypes/）。登记在**通用占位规则之前**，是为了让它显式可见——
    // 若被 `docs/requirements/<REQ>/…` 前缀规则顺带放过，这条兼容期就没有任何地方被承认。
    match: /^docs\/requirements\/(?:<REQ>|REQ-[\dx]+)\/prototype\//,
    reason: '旧原型目录兼容期（brief §1：仍识别为 prototype，门禁只提示迁移）；fragments/brainstorming/heavy-extra.md 仍在教旧目录，未改文案（change 面属片段卡）',
  },
  {
    match: /^prototypes\/INDEX\.md$/,
    reason: '原型权威清单由需求自己在需求阶段生成（brief §1），登记前必然不存在',
  },
  {
    // `#FR-N` 是片段里的**占位锚点**写法（真实文档里是 `#FR-4`），故锚点段两种形态都收
    match: /^prototypes\/[^/]+\.html(?:#FR-(?:\d+|N))?$/,
    reason: '原型页由需求自己生成（brief §1 权威路径 docs/requirements/<REQ>/prototypes/<name>.html）；#FR-N 是页内锚点不是路径',
  },
  {
    match: /^docs\/requirements\/(?:<REQ>|REQ-[\dx]+)\//,
    reason: '需求目录的占位形态（片段里写的是"按需求号生成"的模板；真实目录 docs/requirements/<REQ>/ 随需求创建）',
  },
  {
    // 只认**全 x 的占位号**（REQ-xxxxxx）；真实号（REQ-261007200706-89b7 这类含数字与短横的）一律走磁盘可达判据，
    // 故这里用 [xX]+ 而不是松散的 [0-9a-z-]+（后者会把写错的真实号也放过去）。
    match: /^docs\/requirements\/REQ-[xX]+/,
    reason: '需求号的占位写法（REQ-xxxxxx，schema 描述里给形态示例用）；真实需求号不适用本条',
  },
  {
    // 裸目录形态（结尾 `/`）才放行；其下的具体文件路径仍走磁盘可达判据，避免"目录存在"掩盖文件名拼错。
    match: /^docs\/(?:adr|rfcs|work-logs)\/$/,
    reason: '归档合并去向 / 文档位置白名单内的规范目录（ARCHIVE_DOC_RULES 与 capture 的 DOC_LOCATION_OPTIONS 同源）：本仓允许向其落盘、首次落盘时创建，故"当下不存在"合法；只放行裸目录形态',
  },
  {
    match: /^prototype\/\*\.html$/,
    reason: '旧原型目录的需求相对 glob 写法（兼容期：仍识别为 prototype、门禁只提示迁移），非仓库根下的具体文件',
  },
  {
    match: /^(?:design|tasks|notes)\//,
    reason: '需求目录相对的产物名（docs/requirements/<REQ>/design/、tasks/、notes/），片段里按相对口径书写（决议 #2）',
  },
  {
    match: /^docs\/superpowers\//,
    reason: '上游 superpowers SKILL.md 原文里的**目标项目**路径（本仓不存在）；implementing 换底后注入面仍由 design/heavy/overrides.md（覆盖 1）引用该前缀，故保留本条',
  },
  {
    match: /^skills\//,
    reason: '上游 skill 的提供物路径（由 superpowers 插件投放到目标项目，本仓不持有）',
  },
  {
    match: /^packages\//,
    reason: '宿主 monorepo 布局（本包位于 packages/web/dsh-pmboard），本仓根下不存在 packages/',
  },
  // 2026-10-08（REQ-261008190515-5212）删除：原先这里给**上游 skill 自带的两条辅助脚本路径**
  // 留了允许条目——它们只由 vendor 原文（经 heavy 镜像）带进注入。implementing 换底为本仓自写档后，
  // 注入面这两个 token 零命中，条目成为死条目；留着会让后来者以为注入面仍存在该路径。
  // 若将来又有分片引入它们，探针会照常红灯（这是要的）。
]

/** 抽取用的 token 正则：`<根>/…`，根表见 `SCAN_ROOTS`（长根优先，避免 `prototype` 抢先匹配 `prototypes`）。 */
const TOKEN_RE = new RegExp(
  '(?:^|[^A-Za-z0-9_./-])((?:'
  + [...SCAN_ROOTS].sort((a, b) => b.length - a.length).map((r) => r.replace(/\//g, '\\/')).join('|')
  + ')\\/[A-Za-z0-9_<>{}*@$+~#.\\/=-]*)',
  'g',
)

/** 行尾标点（句号/逗号/右括号/引号等）不是路径的一部分，抽出来即剥掉；**保留**结尾的 `/`（目录形态）。 */
const TRAILING_PUNCT_RE = /[.,;:!?)\]}>”"’'`、。，；：）】》]+$/u

interface Occurrence {
  readonly file: string
  readonly line: number
}

/** 同一 token 最多留几条出处（报告可读性；超出只影响出处列表，不影响判据）。 */
const MAX_OCCURRENCES = 5

interface TokenVerdict {
  readonly token: string
  /** exists = 磁盘上真实存在；whitelist = 命中已知产物名 / 外部路径白名单。 */
  readonly verdict: 'exists' | 'whitelist'
  readonly reason?: string
  readonly occurrences: readonly Occurrence[]
}

interface Gap {
  readonly token: string
  readonly file: string
  readonly line: number
  /** 缺口原因（禁词前缀命中的给出规则理由；路径不可达的用统一文案）。 */
  readonly reason?: string
}

interface ClassifyResult {
  readonly verdicts: readonly TokenVerdict[]
  readonly gaps: readonly Gap[]
  readonly tokens: readonly { readonly token: string; readonly occurrences: readonly Occurrence[] }[]
}

/** 参数解析：只认三个开关；非法参数 = 用法错误（exit 2，不静默忽略）。 */
function parseArgs(argv: readonly string[]): { json: boolean; specimen: boolean; help: boolean } | string {
  let json = false
  let specimen = false
  let help = false
  for (const a of argv) {
    if (a === '--json') json = true
    else if (a === '--specimen') specimen = true
    else if (a === '--help' || a === '-h') help = true
    else return '未知参数：' + a
  }
  return { json, specimen, help }
}

function walkMarkdown(dir: string, out: string[]): void {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name)
    if (ent.isDirectory()) walkMarkdown(p, out)
    else if (ent.name.endsWith('.md')) out.push(p)
  }
}

/** agent 文案面按 `*.ts` 递归收集（工具壳与 prompt 都是 .ts）。 */
function walkTypeScript(dir: string, out: string[]): void {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name)
    if (ent.isDirectory()) walkTypeScript(p, out)
    else if (ent.name.endsWith('.ts')) out.push(p)
  }
}

/**
 * 剥掉 `.ts` 的注释（块注释 + 整行/行尾 `//`）——agent 读不到注释，
 * 注释里的历史路径说明（如路径归一正则的功能说明）不该被当成文案指针。
 *
 * 边界（有意接受的近似）：只剥**整行** `//` 与块注释，行尾 `//` 仅当不在 `://` 之后才剥
 * （保护文案里的 URL）。模板串里的 `/*` 属罕见形态，未做串内状态机——真出现时探针会点名，
 * 由人按缺口处置（宁可多报一次，不静默放过）。
 */
function stripComments(text: string): string {
  // 块注释按**原有换行数**替换（否则后续行号整体前移，报出的「文件:行」会指错位置）
  const withoutBlock = text.replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) ?? []).length))
  return withoutBlock
    .split('\n')
    .map((line) => {
      const trimmed = line.trimStart()
      if (trimmed.startsWith('//')) return ''
      return line.replace(/(^|[^:])\/\/.*$/, '$1')
    })
    .join('\n')
}

/** 禁词前缀扫描（在**已剥注释**的文本上跑；命中任何一处即缺口，不接受白名单）。 */
function findForbidden(
  entries: readonly { readonly file: string; readonly text: string }[],
): readonly Gap[] {
  const gaps: Gap[] = []
  for (const entry of entries) {
    entry.text.split('\n').forEach((line, i) => {
      for (const rule of FORBIDDEN_PATTERNS) {
        const m = rule.re.exec(line)
        if (m === null) continue
        const token = line.slice(m.index).split(/[\s'"`）、，。；）】]/)[0] ?? 'agent-dh/…'
        gaps.push({ token, file: entry.file, line: i + 1, reason: rule.reason })
      }
    })
  }
  return gaps
}

/** 抽出文本里的候选 token（带 文件:行），同一 token 多处出现只算一个对象、但保留全部出处。 */
function extractTokens(
  entries: readonly { readonly file: string; readonly text: string }[],
): readonly { readonly token: string; readonly occurrences: readonly Occurrence[] }[] {
  const seen = new Map<string, Occurrence[]>()
  for (const entry of entries) {
    entry.text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(TOKEN_RE)) {
        const token = m[1]!.replace(TRAILING_PUNCT_RE, '')
        if (token.length === 0) continue
        const list = seen.get(token) ?? []
        if (list.length < MAX_OCCURRENCES) list.push({ file: entry.file, line: i + 1 })
        seen.set(token, list)
      }
    })
  }
  return [...seen].map(([token, occurrences]) => ({ token, occurrences }))
}

/** token 在磁盘上是否真实存在（页内锚点 `#FR-N` 与结尾 `/` 不属于路径本体）。 */
function existsInRepo(root: string, token: string): boolean {
  const clean = token.replace(/#.*$/, '').replace(/\/+$/, '')
  if (clean.length === 0) return false
  return existsSync(join(root, clean))
}

/** 分类：存在 → 白名单 → 缺口。纯函数（`--specimen` 直接喂合成 token 复用它，判据不空转）。 */
function classify(
  root: string,
  tokens: readonly { readonly token: string; readonly occurrences: readonly Occurrence[] }[],
  forbidden: readonly Gap[] = [],
): ClassifyResult {
  const verdicts: TokenVerdict[] = []
  const gaps: Gap[] = []
  for (const t of tokens) {
    if (existsInRepo(root, t.token)) {
      verdicts.push({ token: t.token, verdict: 'exists', occurrences: t.occurrences })
      continue
    }
    const rule = WHITELIST.find((r) => r.match.test(t.token))
    if (rule !== undefined) {
      verdicts.push({ token: t.token, verdict: 'whitelist', reason: rule.reason, occurrences: t.occurrences })
      continue
    }
    for (const occ of t.occurrences) gaps.push({ token: t.token, file: occ.file, line: occ.line })
  }
  return { verdicts, gaps: [...gaps, ...forbidden], tokens }
}

interface Report {
  readonly script: string
  readonly criterion: { readonly name: string; readonly ok: boolean; readonly objects: number; readonly gaps: number }
  readonly ok: boolean
  readonly exitCode: number
  readonly root: string
  readonly scanned: {
    readonly fragments: number
    readonly files: number
    readonly agentSurface: number
    readonly tokens: number
  }
  readonly counts: { readonly exists: number; readonly whitelist: number; readonly forbidden: number }
  readonly tokens: readonly {
    readonly token: string
    readonly verdict: 'exists' | 'whitelist'
    readonly reason?: string
    readonly occurrences: readonly string[]
  }[]
  readonly gaps: readonly { readonly token: string; readonly at: string; readonly reason: string }[]
}

const UNREACHABLE_REASON = '既不在磁盘上，也不在已知产物名白名单里'

function buildReport(
  root: string,
  counts: { readonly fragments: number; readonly files: number; readonly agentSurface: number },
  res: ClassifyResult,
  forbiddenCount: number,
): Report {
  const exists = res.verdicts.filter((v) => v.verdict === 'exists').length
  const whitelist = res.verdicts.filter((v) => v.verdict === 'whitelist').length
  return {
    script: SCRIPT,
    criterion: { name: '路径可达 + 禁词前缀', ok: res.gaps.length === 0, objects: res.tokens.length, gaps: res.gaps.length },
    ok: res.gaps.length === 0,
    exitCode: res.gaps.length === 0 ? 0 : 1,
    root,
    scanned: { ...counts, tokens: res.tokens.length },
    counts: { exists, whitelist, forbidden: forbiddenCount },
    tokens: res.verdicts.map((v) => ({
      token: v.token,
      verdict: v.verdict,
      ...(v.reason === undefined ? {} : { reason: v.reason }),
      occurrences: v.occurrences.map((o) => relative(root, o.file) + ':' + String(o.line)),
    })),
    gaps: res.gaps.map((g) => ({
      token: g.token,
      at: relative(root, g.file) + ':' + String(g.line),
      reason: g.reason ?? UNREACHABLE_REASON,
    })),
  }
}

function printHuman(report: Report): void {
  const head = report.scanned.fragments + ' 份片段 + ' + SCAN_FILES.join('、')
    + ' + agent 文案面 ' + String(report.scanned.agentSurface) + ' 份'
  if (report.ok) {
    console.log(
      '[' + SCRIPT + '] OK 路径可达 + 禁词前缀（' + head + '）：token ' + String(report.scanned.tokens)
      + ' 个（真实存在 ' + String(report.counts.exists) + ' / 产物名白名单 ' + String(report.counts.whitelist)
      + '）；禁词命中 ' + String(report.counts.forbidden),
    )
  } else {
    for (const g of report.gaps) {
      console.log('[' + SCRIPT + '] FAIL ' + g.token + ' ← ' + g.at + '（' + g.reason + '）')
    }
  }
  console.log('[' + SCRIPT + '] 缺口 ' + String(report.criterion.gaps) + '；exit ' + String(report.exitCode))
  if (!report.ok) {
    console.log('  修复：把指针改成真实路径（禁词前缀 agent-dh/ 与 docs/standards/ 无豁免），'
      + '或在 scripts/prompt-path-probe.mts 的 WHITELIST 登记并写清理由')
  }
}

function fail(root: string, message: string, json: boolean): never {
  if (json) {
    console.log(JSON.stringify({ script: SCRIPT, ok: false, exitCode: 2, root, error: message }, null, 2))
  } else {
    console.error('[' + SCRIPT + '] ERROR（用法或环境，退出码 2）：' + message)
    console.error('  修复：在仓库根跑 `npx tsx scripts/prompt-path-probe.mts`（片段目录与 round-state.ts 必须存在）')
  }
  process.exit(2)
}

const args = parseArgs(process.argv.slice(2))
if (typeof args === 'string') fail(process.cwd(), args, false)
const root = process.cwd()

if (args.help) {
  console.log('用法：npx tsx scripts/prompt-path-probe.mts [--json] [--specimen]')
  process.exit(0)
}

// ── 前置：工作区根与扫描目标必须可解析（不可解析 = exit 2，不许静默跳过）─────────
const pkgPath = join(root, 'package.json')
if (!existsSync(pkgPath)) fail(root, '工作区根不可解析：' + pkgPath + ' 不存在', args.json)
if (!existsSync(join(root, SCAN_FILES[0]!))) fail(root, '扫描目标缺失：' + SCAN_FILES[0], args.json)
for (const d of SCAN_DIRS) {
  if (!existsSync(join(root, d))) fail(root, '扫描目标缺失：' + d, args.json)
}
for (const f of AGENT_SURFACE_FILES) {
  if (!existsSync(join(root, f))) fail(root, '扫描目标缺失：' + f, args.json)
}
for (const d of AGENT_SURFACE_DIRS) {
  if (!existsSync(join(root, d))) fail(root, '扫描目标缺失：' + d, args.json)
}

const fragmentFiles: string[] = []
for (const d of SCAN_DIRS) walkMarkdown(join(root, d), fragmentFiles)
fragmentFiles.sort()
if (fragmentFiles.length === 0) fail(root, '片段目录为空：' + SCAN_DIRS.join('、'), args.json)

const agentFiles: string[] = []
for (const d of AGENT_SURFACE_DIRS) walkTypeScript(join(root, d), agentFiles)
agentFiles.push(...AGENT_SURFACE_FILES.map((f) => join(root, f)))
agentFiles.sort()
if (agentFiles.length === 0) fail(root, 'agent 文案面为空：' + AGENT_SURFACE_DIRS.join('、'), args.json)

const entries = [
  ...fragmentFiles.map((f) => ({ file: f, text: readFileSync(f, 'utf8') })),
  ...SCAN_FILES.map((f) => ({ file: join(root, f), text: readFileSync(join(root, f), 'utf8') })),
  ...agentFiles.map((f) => ({ file: f, text: stripComments(readFileSync(f, 'utf8')) })),
]
const tokens = extractTokens(entries)
const forbidden = findForbidden(entries)
const result = classify(root, tokens, forbidden)
const report = buildReport(
  root,
  { fragments: fragmentFiles.length, files: fragmentFiles.length + SCAN_FILES.length, agentSurface: agentFiles.length },
  result,
  forbidden.length,
)

// ── --specimen：内置反例。判据必须真的会红——否则"探针绿"没有意义（与 R1 的 specimen 同款）──
if (args.specimen) {
  const okCase = result.gaps.length === 0
  // 注入一个指向不存在文件的指针：分类器必须把它判成缺口并点名
  const injected = classify(root, [{ token: 'templates/nope.md', occurrences: [{ file: '<specimen>', line: 1 }] }])
  const redCase = injected.gaps.length === 1 && injected.gaps[0]!.token === 'templates/nope.md'
  // 注入一个白名单内的产物名：必须不判缺口（否则白名单形同虚设，探针会在合法产物上恒红）
  const whiteCase = classify(root, [{ token: 'prototypes/INDEX.md', occurrences: [{ file: '<specimen>', line: 1 }] }])
  const whiteOk = whiteCase.gaps.length === 0
  // 禁词前缀必须判红且**不吃白名单**：构造一段含两个禁词的合成文案，两条都要点名
  const forbiddenCase = findForbidden([
    { file: '<specimen>', text: '见 agent-dh/docs/architecture/x.md 与 docs/standards/y.md\n' },
  ])
  const forbiddenRed = forbiddenCase.length === 2
  // agent 文案面必须真的扫到了文件（0 份 = 扩面空转，判据没落在目标上）
  const surfaceScanned = agentFiles.length > 0
  const specimenOk = okCase && redCase && whiteOk && forbiddenRed && surfaceScanned
  if (args.json) {
    console.log(JSON.stringify({
      script: SCRIPT,
      specimen: {
        ok: okCase,
        redOnInjected: redCase,
        whitePasses: whiteOk,
        redOnForbidden: forbiddenRed,
        agentSurfaceScanned: agentFiles.length,
      },
      exitCode: specimenOk ? 0 : 1,
    }, null, 2))
  } else {
    console.log('[' + SCRIPT + '] specimen ① 真实扫描：缺口 ' + String(result.gaps.length) + (okCase ? ' ✔' : ' ✘（真实扫描本来就红，先修它）'))
    console.log('[' + SCRIPT + '] specimen ② 注入 templates/nope.md：' + (redCase ? '判红且点名 ✔' : '没判红 ✘（判据空转）'))
    console.log('[' + SCRIPT + '] specimen ③ 白名单 token prototypes/INDEX.md：' + (whiteOk ? '不判缺口 ✔' : '误判 ✘（白名单失效）'))
    console.log('[' + SCRIPT + '] specimen ④ 注入 agent-dh/ 与 docs/standards/ 禁词：'
      + (forbiddenRed ? '两条都判红 ✔（且不吃白名单）' : '禁词判据没生效 ✘'))
    console.log('[' + SCRIPT + '] specimen ⑤ agent 文案面扫描文件数：' + String(agentFiles.length)
      + (surfaceScanned ? ' ✔' : ' ✘（扩面空转）'))
    console.log('[' + SCRIPT + '] specimen ' + (specimenOk ? 'OK（判据不空转）；exit 0' : 'FAIL；exit 1'))
  }
  process.exit(specimenOk ? 0 : 1)
}

if (args.json) console.log(JSON.stringify(report, null, 2))
else printHuman(report)
process.exit(report.exitCode)
