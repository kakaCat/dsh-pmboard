/**
 * 知识层自检（REQ-261001110934-3766 t9 / design/interfaces.md「自检 CLI」）。
 *
 * 十四项防腐（任一失败 → 退出码 1，并指出 id / 行号 / 文件）：
 *   K1 索引预算（≤8000 字符、≤200 行）        K6 条目过期（expires < 今天）
 *   K2 行语法 / 分节顺序 / 缺节                K7 生成物漂移（kb-build --check）
 *   K3 页面预算（每页 ≤200 行）                K8 规范条目挂的校验目标必须存在
 *   K4 死链（指针文件 / 锚点不存在）            K9 机器索引与源码口径一致（符号数 / 类名数）
 *   K5 孤儿（条目文件不在索引 / 索引指向缺失）
 *   K10 工程操作覆盖度  K11 规范期望可判定  K12 页面小节 ↔ 索引行完整性
 *   K13 归档沉淀覆盖度  K14 失效条件可判定（两项都是**读数 + 基线集合差**，见各节注）
 *
 * 跑法：
 *   npx tsx scripts/kb-probe.mts            # 人读输出
 *   npx tsx scripts/kb-probe.mts --json     # 结构化（CI / 验收证据）
 *   npx tsx scripts/kb-probe.mts --refresh-coverage       # 重写 K13 基线（冷侧缺口 → 已知豁免）
 *   npx tsx scripts/kb-probe.mts --refresh-unverifiable   # 重写 K14 基线（不可判定条目 id）
 *   npx tsx scripts/kb-probe.mts --baseline-dir <目录>     # 基线位置（缺省 docs/knowledge；用例指副本）
 *
 * @module dsh-pmboard/scripts/kb-probe
 */
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { KB_LIMITS, checkIndexBudget, countLines } from '../src/domain/knowledge/budget.ts'
import { parseEntryDoc, validateEntryDoc } from '../src/domain/knowledge/entry.ts'
import { isEntryId, parseIndexDoc } from '../src/domain/knowledge/index-line.ts'
import { isDecidableInvalidation } from '../src/domain/knowledge/invalidation.ts'
import { headingAnchor, listHeadingAnchors, sliceSection } from '../src/domain/knowledge/slug.ts'
import { KB_PATHS, KB_PAGE_PATHS, entryPath } from '../src/domain/knowledge/types.ts'
import {
  buildCoverage,
  findGaps,
  listUnclassified,
  parseOperationEntries,
  renderCoverageTsv,
  validateOperationEntry,
} from '../src/domain/knowledge/operations.ts'

const ROOT = process.cwd()
const args = process.argv.slice(2)
const json = args.includes('--json')

interface Finding {
  readonly check: string
  readonly ok: boolean
  readonly detail: string
  readonly where?: string
}

const findings: Finding[] = []
const add = (check: string, ok: boolean, detail: string, where?: string): void => {
  findings.push({ check, ok, detail, ...(where === undefined ? {} : { where }) })
}

const abs = (rel: string): string => join(ROOT, rel)
const read = (rel: string): string => readFileSync(abs(rel), 'utf8')

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.ts')) out.push(p)
  }
  return out
}

/** 指针 → 文件 + 锚点。 */
function splitPointer(pointer: string): { path: string; anchor?: string } {
  const i = pointer.indexOf('#')
  return i < 0 ? { path: pointer } : { path: pointer.slice(0, i), anchor: pointer.slice(i + 1) }
}

/** 指针可解析性：文件存在；带锚点时锚点必须在该文件里找得到。 */
function pointerIssue(pointer: string): string | undefined {
  const { path, anchor } = splitPointer(pointer)
  const target = path.startsWith('docs/') || path.startsWith('src/') || path.startsWith('scripts/')
    ? path
    : join(KB_PATHS.root, path)
  if (!existsSync(abs(target))) return '指针指向的文件不存在：' + target
  if (anchor !== undefined && anchor.length > 0) {
    const anchors = listHeadingAnchors(read(target)).map((h) => h.anchor)
    if (!anchors.includes(anchor)) return '锚点不存在：' + target + '#' + anchor
  }
  return undefined
}

// ── K1/K2：索引预算与语法 ───────────────────────────────────────────
if (!existsSync(abs(KB_PATHS.index))) {
  add('K1', false, '知识索引不存在：' + KB_PATHS.index + '（先跑 npx tsx scripts/kb-build.mts --write）')
  add('K2', false, '无索引可解析')
} else {
  const indexText = read(KB_PATHS.index)
  const overflows = checkIndexBudget(indexText)
  add(
    'K1',
    overflows.length === 0,
    overflows.length === 0
      ? `索引 ${String(indexText.length)} 字符 / ${String(countLines(indexText))} 行（上限 ${String(KB_LIMITS.indexMaxChars)} / ${String(KB_LIMITS.indexMaxLines)}）`
      : overflows.map((o) => `${o.reason} 实际 ${String(o.actual)} > ${String(o.limit)} ${o.unit}`).join('；'),
    KB_PATHS.index,
  )
  const parsed = parseIndexDoc(indexText)
  add(
    'K2',
    parsed.issues.length === 0,
    parsed.issues.length === 0
      ? `${String(parsed.rows.length)} 行索引、9 节齐全、顺序正确`
      : parsed.issues.map((i) => `第 ${String(i.line)} 行 ${i.code}：${i.detail}`).join('；'),
    KB_PATHS.index,
  )

  // ── K4：死链（索引行的指针 + 条目的 L2 指针）─────────────────────
  const dead: string[] = []
  const listedEntryIds = new Set<string>()
  for (const row of parsed.rows) {
    const issue = pointerIssue(row.pointer)
    if (issue !== undefined) dead.push(`${row.id} → ${row.pointer}：${issue}`)
    if (isEntryId(row.id)) {
      listedEntryIds.add(row.id)
      if (existsSync(abs(entryPath(row.id)))) {
        try {
          const { meta } = parseEntryDoc(read(entryPath(row.id)))
          if (meta.pointer.length > 0) {
            const l2 = pointerIssue(meta.pointer)
            if (l2 !== undefined) dead.push(`${row.id} 的 L2 指针 → ${meta.pointer}：${l2}`)
          }
          if (meta.supersedes !== undefined && !parsed.rows.some((r) => r.id === meta.supersedes) && !existsSync(abs(entryPath(meta.supersedes!)))) {
            dead.push(`${row.id} 的 supersedes → ${meta.supersedes}：目标条目不存在`)
          }
        } catch (err) {
          dead.push(`${row.id} 条目头部非法：${(err as Error).message}`)
        }
      }
    }
  }
  add('K4', dead.length === 0, dead.length === 0 ? '全部指针可解析（含锚点与 L2 原文）' : dead.join('；'))

  // ── K5：孤儿（条目文件存在但未登记 / 索引指向缺失条目）──────────
  const allOnDisk = existsSync(abs(KB_PATHS.entriesDir))
    ? readdirSync(abs(KB_PATHS.entriesDir)).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''))
    : []
  // 非 active（stale / superseded）条目**本就不该出现在索引里**（设计 I-7）→ 不算孤儿
  const onDisk = allOnDisk.filter((id) => {
    try {
      return parseEntryDoc(read(entryPath(id))).meta.status === 'active'
    } catch {
      return true // 坏条目交给 K6/解析检查报出
    }
  })
  const orphanFiles = onDisk.filter((id) => !listedEntryIds.has(id))
  const missingFiles = [...listedEntryIds].filter((id) => !existsSync(abs(entryPath(id))))
  const k5 = [...orphanFiles.map((id) => `孤儿条目（文件存在但索引未列）：${id}`), ...missingFiles.map((id) => `索引指向缺失条目：${id}`)]
  add('K5', k5.length === 0, k5.length === 0 ? `条目与索引一一对应（${String(onDisk.length)} 条）` : k5.join('；'))

  // ── K6：过期（expires < 今天）───────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const stale: string[] = []
  for (const id of onDisk) {
    if (!existsSync(abs(entryPath(id)))) continue
    const issues = validateEntryDoc(read(entryPath(id)), today)
    for (const i of issues) {
      if (i.code === 'entry-stale') stale.push(`${id}：${i.detail}`)
      if (i.code === 'entry-header' || i.code === 'entry-body-section' || i.code === 'entry-lines') {
        stale.push(`${id}：${i.code} ${i.detail}`)
      }
    }
  }
  add('K6', stale.length === 0, stale.length === 0 ? `全部条目在复核期限内且结构完整（今天 ${today}）` : stale.join('；'))
}

// ── K3：页面预算 ────────────────────────────────────────────────────
const pageIssues: string[] = []
for (const [page, path] of Object.entries(KB_PAGE_PATHS)) {
  if (!existsSync(abs(path))) continue
  const lines = countLines(read(path))
  if (lines > KB_LIMITS.pageMaxLines) pageIssues.push(`${page}（${path}）${String(lines)} 行 > ${String(KB_LIMITS.pageMaxLines)}`)
}
add('K3', pageIssues.length === 0, pageIssues.length === 0 ? '页面行数均在预算内' : pageIssues.join('；'))

// ── K7：生成物漂移（调 kb-build --check）────────────────────────────
try {
  execFileSync('npx', ['tsx', 'scripts/kb-build.mts', '--check'], { cwd: ROOT, stdio: 'pipe' })
  add('K7', true, '生成物与源码一致（零漂移）')
} catch (err) {
  const e = err as { stdout?: Buffer; stderr?: Buffer }
  const detail = (e.stderr?.toString() ?? '') + (e.stdout?.toString() ?? '')
  add('K7', false, '生成物漂移：' + detail.trim().split('\n').slice(-3).join(' | '))
}

// ── K8：规范条目挂的校验目标必须存在 ────────────────────────────────
const convPath = KB_PAGE_PATHS.conventions
if (!existsSync(abs(convPath))) {
  add('K8', false, '规范页不存在：' + convPath)
} else {
  const convAll = read(convPath)
  // K8 只管「规则清单」那一节（代码纪律：一句话 / 校验 / 症状）；工程操作条目用「命令：」，归 K10 管。
  const convLines = convAll.split('\n')
  const rulesAt = convLines.findIndex((l) => /^##\s+/.test(l) && l.replace(/^##\s+/, '').trim().replace(/\s+#\S+$/, '') === '规则清单')
  let rulesEnd = convLines.length
  if (rulesAt >= 0) {
    for (let i = rulesAt + 1; i < convLines.length; i += 1) {
      if (/^##\s+/.test(convLines[i]!)) { rulesEnd = i; break }
    }
  }
  const conv = rulesAt < 0 ? convAll : convLines.slice(rulesAt, rulesEnd).join('\n')
  const rules = [...conv.matchAll(/^###\s+(C-\d+)\s+(.+?)(?:\s+#\S+)?$/gm)].map((m) => ({ id: m[1]!, title: m[2]!, at: m.index ?? 0 }))
  const bad: string[] = []
  if (rules.length === 0) bad.push('规范页里没有 `### C-NN` 规则小节')
  for (let i = 0; i < rules.length; i += 1) {
    const section = conv.slice(rules[i]!.at, rules[i + 1]?.at ?? conv.length)
    const cmd = /校验\*\*：`([^`]+)`/.exec(section) ?? /校验：`([^`]+)`/.exec(section)
    if (cmd === null) {
      bad.push(`${rules[i]!.id} 没有「校验：\`命令\`」`)
      continue
    }
    const command = cmd[1]!
    const paths = [...command.matchAll(/(?:^|\s)((?:tests|scripts|src|docs)\/[A-Za-z0-9_./-]+)/g)].map((m) => m[1]!)
    if (paths.length === 0 && !/^(npx|pnpm|node|python3)\b/.test(command)) {
      bad.push(`${rules[i]!.id} 的校验既无可校验路径也不像可跑命令：${command}`)
      continue
    }
    for (const p of paths) {
      if (!existsSync(abs(p))) bad.push(`${rules[i]!.id} 的校验目标不存在：${p}`)
    }
  }
  add('K8', bad.length === 0, bad.length === 0 ? `${String(rules.length)} 条规范全部挂真实可跑校验` : bad.join('；'), convPath)
}

// ── K9：机器索引与源码口径一致 ──────────────────────────────────────
const EXPORT_RE =
  /^export\s+(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:function|class|interface|type|const|enum|namespace)\s+[^\n{=]*/gm
let symbolCount = 0
for (const f of walk(join(ROOT, 'src'))) {
  const text = readFileSync(f, 'utf8')
  symbolCount += [...text.matchAll(new RegExp(EXPORT_RE.source, 'gm'))].length
}
const symbolsFile = abs(KB_PATHS.symbols)
const tsvRows = existsSync(symbolsFile) ? readFileSync(symbolsFile, 'utf8').trim().split('\n').length - 1 : -1
add(
  'K9',
  tsvRows === symbolCount,
  tsvRows === symbolCount
    ? `符号表 ${String(tsvRows)} 行 = 源码口径 ${String(symbolCount)} 条`
    : `符号表 ${String(tsvRows)} 行 ≠ 源码口径 ${String(symbolCount)} 条（重跑 kb-build --write）`,
  KB_PATHS.symbols,
)

// ── K10：工程操作覆盖度（REQ-261001143526-8475 t3）─────────────────
const OPS_TSV = 'docs/knowledge/operations.tsv'
if (!existsSync(abs(KB_PAGE_PATHS.conventions))) {
  add('K10', false, '规范页不存在：' + KB_PAGE_PATHS.conventions)
} else {
  const convText = read(KB_PAGE_PATHS.conventions)
  const opEntries = parseOperationEntries(convText)
  const pkg = JSON.parse(read('package.json')) as { scripts?: Record<string, string> }
  const coverage = buildCoverage(pkg.scripts ?? {})
  const gaps = findGaps(coverage, opEntries)
  const unclassified = listUnclassified(existsSync(abs('scripts')) ? readdirSync(abs('scripts')) : [])
  const fieldIssues: string[] = []
  for (const e of opEntries) {
    for (const issue of validateOperationEntry(e, (p) => existsSync(abs(p)))) {
      fieldIssues.push(issue.code + '：' + issue.detail)
    }
  }
  const tsvNext = renderCoverageTsv(coverage, opEntries)
  const tsvDrift = !existsSync(abs(OPS_TSV)) || read(OPS_TSV) !== tsvNext
  const problems = [
    ...gaps.map((g) => '覆盖缺口：' + g.command + '（建议 ' + g.suggestedId + '）'),
    ...unclassified.map((u) => 'scripts/ 未归类：' + u),
    ...fieldIssues,
    ...(tsvDrift ? ['覆盖清单漂移：' + OPS_TSV + '（重跑 kb-conventions-sync --write）'] : []),
  ]
  add(
    'K10',
    problems.length === 0,
    problems.length === 0
      ? '覆盖 ' + String(coverage.length) + ' 项全部有条目、四要素齐全、清单零漂移（条目 ' + String(opEntries.length) + ' 条）'
      : problems.join('；'),
    KB_PAGE_PATHS.conventions,
  )
}

// ── K11：规范条目的「期望」必须可判定；声明豁免必须给基线（REQ-261001154450-b918 t8）──
if (!existsSync(abs(KB_PAGE_PATHS.conventions))) {
  add('K11', false, '规范页不存在：' + KB_PAGE_PATHS.conventions)
} else {
  const convText11 = read(KB_PAGE_PATHS.conventions)
  const blocks = convText11.split(/^### (?=C-\d+)/m).slice(1)
  const bad11: string[] = []
  let checked = 0
  for (const b of blocks) {
    const id = /^(C-\d+)/.exec(b)?.[1] ?? '?'
    const lines = b.split('\n')
    const expectLine = lines.find((l) => l.includes('期望：')) ?? ''
    if (expectLine === '') continue // 无「期望」行的条目（如代码纪律类）不在本检查范围
    checked += 1
    const hasAnchor = /\`[^\`]+\`/.test(expectLine) || /退出码\s*\d+/.test(expectLine)
    if (!hasAnchor) {
      bad11.push(id + ' 的「期望」没有可判定锚点（要写清"看到什么算过"：退出码 N 或反引号字面量）')
    }
    const claimsExemption = /历史|既有|另计|豁免/.test(expectLine)
    const hasBaseline = lines.some((l) => l.includes('基线：'))
    if (claimsExemption && !hasBaseline) {
      bad11.push(id + ' 的「期望」声明了豁免（历史/既有/另计）却没有「基线：」行——豁免无法被机器验证')
    }
  }
  add(
    'K11',
    bad11.length === 0,
    bad11.length === 0
      ? String(checked) + ' 条规范期望可判定、豁免均带基线'
      : bad11.join('；'),
    KB_PAGE_PATHS.conventions,
  )
}

// ── K12：页面小节 ↔ 索引行完整性（REQ-261006123819-3af3 FR-4）────────────
// 此前**没有任何门禁**校验这件事：K5 只枚举 `entries/*.md`，不覆盖 `kb-conventions-c-*`，
// 于是 C-22 漏行长期无人发现（索引 26 行、规范页 27 个小节）。
// 口径：conventions.md 的每个 `### C-NN` 小节都必须在 INDEX.md 有对应行；锚点可达性由 K4 兜底，
// 本条只回答「哪条小节没登记」。
if (!existsSync(abs(KB_PAGE_PATHS.conventions))) {
  add('K12', false, '规范页不存在：' + KB_PAGE_PATHS.conventions)
} else if (!existsSync(abs(KB_PATHS.index))) {
  add('K12', false, '索引不存在，无法校验「页面小节 ↔ 索引行」完整性')
} else {
  const convText = read(KB_PAGE_PATHS.conventions)
  const codes = [...convText.matchAll(/^###\s+(C-\d+)\s+\S/gm)].map((m) => m[1]!)
  const { rows } = parseIndexDoc(read(KB_PATHS.index))
  // id 后缀归一（去连字符）：既有索引里 C-01..C-10 写 `c01`、C-11 起写 `c-11`，两种形态都算命中
  const norm = (s: string): string => s.toLowerCase().replace(/-/g, '')
  const indexed = new Set(
    rows.filter((r) => r.id.startsWith('kb-conventions-')).map((r) => norm(r.id.slice('kb-conventions-'.length))),
  )
  const missing = codes.filter((c) => !indexed.has(norm(c)))
  add(
    'K12',
    missing.length === 0,
    missing.length === 0
      ? String(codes.length) + ' 个规范小节全部在索引里有对应行'
      : '以下规范小节缺索引行（补 `- kb-conventions-<锚点> · standard · <标题> · → conventions.md#<锚点>`）：' + missing.join('、'),
    KB_PAGE_PATHS.conventions,
  )
}

// ── K13/K14：读数 + 基线集合差（REQ-261006201841-944d t6 / FR-3、FR-4）────────
// 为什么用「基线集合差」而不是写死条数：读数会随真实进度变（补归档材料、补写条目），
// 写死数字只有两种结局——长期假红，或被人为了过检查改小。集合差把「已知豁免」显式化：
//   实测 \ 基线 非空 → 报红并点名新增缺口（这才是真信号）；
//   基线 \ 实测 非空 → 仍绿，但提示「已补齐，可刷新基线」（基线只会过期，不会变成假绿）。
// 两条读数都**不判**也照样绿：台账不可达时（无 <DSH_HOME|~/.dsh>/reqboard）如实写「读数不可得」，
// 绝不输出「全部通过」的口径——拿不到数据就说拿不到，不说没问题。
const COVERAGE_BASELINE = 'archive-coverage.baseline.txt'
const UNVERIFIABLE_BASELINE = 'unverifiable.baseline.txt'
/** 写死的模板句（含既有变体）：**整段恰为此句**才算「同模板句」第二读数。 */
const INVALIDATION_TEMPLATES: readonly string[] = [
  '相关实现被重构、或该结论被新条目 supersede 时',
  '相关实现被重构或被新条目 supersede',
]
const refreshCoverage = args.includes('--refresh-coverage')
const refreshUnverifiable = args.includes('--refresh-unverifiable')
/** 基线目录：缺省 `docs/knowledge`；`--baseline-dir` 供用例指向副本（不污染工作树）。 */
const baselineDir = ((): string => {
  const i = args.indexOf('--baseline-dir')
  const v = i >= 0 ? args[i + 1] : undefined
  if (typeof v !== 'string' || v.length === 0) return abs(KB_PATHS.root)
  return isAbsolute(v) ? v : abs(v)
})()
/** 台账根单点：`<DSH_HOME|~/.dsh>/reqboard`（与 migrate / archive-ledger-audit 同款口径）。 */
const LEDGER_ROOT = join(
  process.env['DSH_HOME'] !== undefined && process.env['DSH_HOME'].length > 0
    ? process.env['DSH_HOME']
    : join(homedir(), '.dsh'),
  'reqboard',
)

/** 读基线（`#` 注释与空行忽略；排序去重后返回）。文件不存在 → 空集（= 全部都是缺口）。 */
function readBaseline(name: string): readonly string[] {
  const path = join(baselineDir, name)
  if (!existsSync(path)) return []
  const ids = readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
  return [...new Set(ids)].sort()
}

/** 写基线（排序 + 行尾换行 + `#` 注释头；同集合 → 逐字节相同，可反复跑）。 */
function writeBaseline(name: string, title: string, flag: string, ids: readonly string[]): string {
  const path = join(baselineDir, name)
  const head = [
    '# ' + title,
    '# 由 `npx tsx scripts/kb-probe.mts ' + flag + '` 生成（已排序、行尾换行）；机器读，别手改。',
  ]
  writeFileSync(path, [...head, ...[...new Set(ids)].sort()].join('\n') + '\n', 'utf8')
  return path
}

/** 条目文件 → 条目 id（`kb-0007.md` → `kb-0007`）。 */
const entryIdOfFile = (file: string): string => file.replace(/\.md$/, '')

/** 条目正文的「## 失效条件」**小节正文**（不含标题行）；无该小节 → undefined。 */
function invalidationSectionOf(entryText: string): string | undefined {
  const section = sliceSection(entryText, '失效条件')
  return section === undefined ? undefined : section.split('\n').slice(1).join('\n').trim()
}

/** 条目目录里的 `.md` 文件名（排序；目录不存在 → 空）。 */
const entryFiles = existsSync(abs(KB_PATHS.entriesDir))
  ? readdirSync(abs(KB_PATHS.entriesDir)).filter((f) => f.endsWith('.md')).sort()
  : []

if (!existsSync(LEDGER_ROOT)) {
  // 读数不可得：两项都**不判**（ok=true 是"没判"，不是"没问题"——detail 逐字写明原因）。
  const why =
    '读数不可得、不判（原因：台账根不可达 ' + LEDGER_ROOT + '；设 DSH_HOME 指向台账副本，或先建台账）'
  add('K13', true, why)
  add('K14', true, why)
} else {
  // ── K13：归档沉淀覆盖度 = 冷侧「有归档材料的需求」− 有 `req:` 条目的需求 ──────
  // 口径**只取冷侧** `archive/<REQ>/archive.json`（已归档需求的最终材料）。
  // 热侧 `requirements/` 只报数不判红：那里的需求多数属于别的项目（冷+热一起算会得到 17 条"缺口"）。
  const archiveRoot = join(LEDGER_ROOT, 'archive')
  const coldArchived = existsSync(archiveRoot)
    ? readdirSync(archiveRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(join(archiveRoot, e.name, 'archive.json')))
        .map((e) => e.name)
        .sort()
    : []
  const requirementsRoot = join(LEDGER_ROOT, 'requirements')
  const hotCount = existsSync(requirementsRoot)
    ? readdirSync(requirementsRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).length
    : 0
  const reqIds = new Set<string>()
  for (const f of entryFiles) {
    try {
      const req = parseEntryDoc(read(join(KB_PATHS.entriesDir, f))).meta.req
      if (typeof req === 'string' && req.length > 0) reqIds.add(req)
    } catch {
      // 坏条目由 K5/K6 报出；这里读不到 req 只会让 K13 更严（不会假绿）
    }
  }
  const coverageGaps = coldArchived.filter((id) => !reqIds.has(id))
  if (refreshCoverage) {
    writeBaseline(COVERAGE_BASELINE, 'K13 归档沉淀覆盖度基线', '--refresh-coverage', coverageGaps)
  }
  const coverageBaseline = readBaseline(COVERAGE_BASELINE)
  const coverageNew = coverageGaps.filter((id) => !coverageBaseline.includes(id))
  const coverageStale = coverageBaseline.filter((id) => !coverageGaps.includes(id))
  const coverWhere = join(baselineDir, COVERAGE_BASELINE)
  const coverSides =
    '（冷侧 archive/ ' + String(coldArchived.length) + ' 条 / 热侧 requirements/ ' + String(hotCount) + ' 条只报数不判红）'
  if (coverageNew.length > 0) {
    add(
      'K13',
      false,
      '归档沉淀缺口 ' + String(coverageNew.length) + ' 条（有归档材料但没有 req: 知识条目）：' +
        coverageNew.join('、') +
        '——补齐指引：给这些需求补 `req:` 知识条目（归档沉淀），确认为历史豁免后跑 ' +
        '`npx tsx scripts/kb-probe.mts --refresh-coverage` 刷新基线' + coverSides,
      coverWhere,
    )
  } else {
    // 判词必须与事实一致（REQ-261006201841-944d 实施期自查发现）：**没有新增缺口 ≠ 全覆盖**。
    // 基线里挂着的缺口是「已知豁免」，不是「已沉淀」——把它们说成"全部有"就是假绿话术。
    // 实测教训：6 条零沉淀记进基线后，旧判词打印「23 条全部有 req: 知识条目」，而事实是 6 条没有。
    const knownGaps = coverageGaps.length
    add(
      'K13',
      true,
      (knownGaps === 0
        ? '冷侧 ' + String(coldArchived.length) + ' 条归档需求全部有 req: 知识条目'
        : '冷侧 ' + String(coldArchived.length) + ' 条归档需求中仍有 ' + String(knownGaps)
          + ' 条零沉淀（已登记为基线豁免、非新增）：' + coverageGaps.join('、')
          + '——补齐后跑 --refresh-coverage 退掉豁免') + coverSides +
        (coverageStale.length > 0
          ? '；基线里 ' + String(coverageStale.length) + ' 条已补齐，可刷新基线（--refresh-coverage）：' + coverageStale.join('、')
          : ''),
      coverWhere,
    )
  }

  // ── K14：失效条件可判定（逐条读 entries/*.md 的「## 失效条件」小节）────────────
  // 口径**只判该小节**：整文件因 front-matter 的 pointer 与「## 相关」的路径恒可判定，
  // 判整文件等于什么都没判（这正是这条读数要抓的假绿）。
  const invalidation = entryFiles.map((f) => {
    const body = invalidationSectionOf(read(join(KB_PATHS.entriesDir, f)))
    return { id: entryIdOfFile(f), body, decidable: body !== undefined && isDecidableInvalidation(body) }
  })
  const unverifiable = invalidation.filter((r) => !r.decidable).map((r) => r.id)
  const templateOnly = invalidation.filter((r) => r.body !== undefined && INVALIDATION_TEMPLATES.includes(r.body)).length
  if (refreshUnverifiable) {
    writeBaseline(UNVERIFIABLE_BASELINE, 'K14 失效条件不可判定条目基线', '--refresh-unverifiable', unverifiable)
  }
  const unverifiableBaseline = readBaseline(UNVERIFIABLE_BASELINE)
  const unverifiableNew = unverifiable.filter((id) => !unverifiableBaseline.includes(id))
  const unverifiableStale = unverifiableBaseline.filter((id) => !unverifiable.includes(id))
  const invWhere = join(baselineDir, UNVERIFIABLE_BASELINE)
  const invReadings =
    '（读数：条目 ' + String(invalidation.length) + ' 条 / 不可判定 ' + String(unverifiable.length) +
    ' 条 / 可判定 ' + String(invalidation.length - unverifiable.length) + ' 条 / 同模板句 ' + String(templateOnly) +
    ' 条；口径 = 只判各条目「## 失效条件」小节）'
  if (unverifiableNew.length > 0) {
    add(
      'K14',
      false,
      '新增不可判定条目 ' + String(unverifiableNew.length) + ' 条：' + unverifiableNew.join('、') +
        '——补齐指引：把「## 失效条件」写成可判定锚点（反引号字面量 / 带目录的文件指针 / supersede + 具体 kb-NNNN），' +
        '确认为历史豁免后跑 `npx tsx scripts/kb-probe.mts --refresh-unverifiable` 刷新基线' + invReadings,
      invWhere,
    )
  } else {
    add(
      'K14',
      true,
      '不可判定条目无新增缺口' + invReadings +
        (unverifiableStale.length > 0
          ? '；基线里 ' + String(unverifiableStale.length) + ' 条已补齐，可刷新基线（--refresh-unverifiable）：' + unverifiableStale.join('、')
          : ''),
      invWhere,
    )
  }
}

// ── 输出与退出码 ────────────────────────────────────────────────────
const failed = findings.filter((f) => !f.ok)
if (json) {
  process.stdout.write(JSON.stringify({ ok: failed.length === 0, today: new Date().toISOString().slice(0, 10), findings }, null, 2) + '\n')
} else {
  for (const f of findings) {
    const mark = f.ok ? '✅' : '❌'
    console.log(`${mark} ${f.check} ${f.detail}${f.where === undefined ? '' : '  [' + f.where + ']'}`)
  }
  console.log(
    failed.length === 0
      ? `kb-probe: 全部通过（${String(findings.length)} 项检查）`
      : `kb-probe: ${String(failed.length)} 项失败 / ${String(findings.length)} 项检查`,
  )
}
// 索引缺失时 statSync 不会被调用，这里顺带确认工作区根正确（防"跑错目录全绿"）
if (!existsSync(join(ROOT, 'package.json'))) {
  console.error('[kb-probe] 当前目录不是包根（缺 package.json）：' + ROOT)
  process.exit(1)
}
process.exit(failed.length === 0 ? 0 : 1)
