/**
 * 存量归档**只读核对**（REQ-261006201841-944d t10 / FR-8）。
 *
 * ## 它回答什么
 *
 * 「已经归档的那些需求，当年申报的合并去向与说明书更新点，今天还在不在？」
 * 判据与 `SubmitArchive` 的新闸（`assertArchiveTargetsOpenable`）**同源**：锚点一律由
 * `listHeadingAnchors` 算（**不手写 slug 规则**——实测手写口径会得出 32/21，而同一实现给 22/14，
 * 手写口径不可信）。
 *
 * ## 为什么必须"按每条需求自己的根"解析
 *
 * 台账里 37 条归档分属 3 个项目（实测 27 本仓 / 6 dsh-notice-webhook / 1 quantsys-v2 / 3 无根字段）。
 * 若直接拿本仓当根去比，会判 **15** 条失效；按各自 `workspaceRoot` 比只有 **2** 条真失效
 * ——差的那 13 条不是丢了，是「在别处」。本脚本把这组对照读数一起报出来（`naiveMissing`）。
 *
 * ## 只读契约（硬）
 *
 * 除 `--out` 指定的文件外，**不写任何路径**；不改台账、不改历史归档目录、不改工作区文档。
 *
 * 跑法：
 *   npx tsx scripts/archive-ledger-audit.mts                     # 人读表格
 *   npx tsx scripts/archive-ledger-audit.mts --json               # 结构化（CI / 验收材料）
 *   npx tsx scripts/archive-ledger-audit.mts --out <path.md>      # 同时把 Markdown 报告落盘
 *   npx tsx scripts/archive-ledger-audit.mts --ledger-root <dir>  # 指定台账根（副本上跑）
 *
 * 退出码：0 = 报告完成（存量有失效**不是**脚本的错误——本次不追溯）；2 = 台账不可达。
 *
 * @module dsh-pmboard/scripts/archive-ledger-audit
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { listHeadingAnchors } from '../src/domain/knowledge/slug.ts'

interface ArchivedRow {
  requirementId: string
  /** 实际用于探测的根。 */
  root: string
  /**
   * 这个根怎么来的：
   *  · `workspace-root` = 记录自带 `workspaceRoot`（权威值）；
   *  · `fallback-current-workspace` = 记录**没有** `workspaceRoot`（归属未知），按当前工作区兜底探测
   *    —— 这是**兜底读数**，不是权威根，必须在报告里分列（实测那 2 条真失效正落在这一档）。
   */
  rootSource: 'workspace-root' | 'fallback-current-workspace'
  by: 'workspaceRoot' | 'unknown'
  missingTargets: string[]
  /** 「任意级标题归一化精确匹配」口径锚不到的说明书更新点。 */
  sectionDriftStrict: Array<{ path: string; section: string }>
  /** 「像章节引用」口径（一、/第 N/数字序号/全文·全篇）锚不到的。 */
  sectionDriftLooksLikeSection: Array<{ path: string; section: string }>
  /** `manual_updates[].path` 本身不存在的。 */
  missingManualPath: string[]
  /** 按**当前工作区**直接比会判失效的条数（对照读数，证明"必须按各自根解析"）。 */
  naiveMissingCount: number
}

interface AuditReport {
  ledgerRoot: string
  workspaceRoot: string
  archiveDirs: number
  withArchiveMaterials: number
  rows: ArchivedRow[]
  totals: {
    realMissingTargets: number
    /**
     * 真失效里落在「归属未知 → 当前工作区兜底」档的条数（F-1/D-6 的兜底读数）。
     *
     * t12 反向演练发现：这个键**真在输出里**（`totals` 会写它、RV-3 也断言它），
     * 但接口漏登记 ⇒ 孤立严格 tsc 报 TS2353/TS2339。`tsc -p tsconfig.json` 看不见
     * （`scripts/**` 不在 include 里），故此前一直静默。此处只补类型，不改任何输出行为。
     */
    missingTargetsOnFallbackRoot: number
    sectionDriftStrict: number
    sectionDriftLooksLikeSection: number
    missingManualPath: number
    unknownRoot: number
    naiveMissing: number
  }
  note: string
}

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const argOf = (flag: string): string | undefined => {
  const i = args.indexOf(flag)
  const v = i >= 0 ? args[i + 1] : undefined
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

const ledgerRoot = argOf('--ledger-root')
  ?? join(process.env['DSH_HOME'] ?? join(homedir(), '.dsh'), 'reqboard')
const outPath = argOf('--out')
const workspaceRoot = process.cwd()

if (!existsSync(ledgerRoot)) {
  console.error('[archive-ledger-audit] 台账不可达：' + ledgerRoot
    + '（读数不可得；传 --ledger-root <dir> 指定副本，或设 DSH_HOME）')
  process.exit(2)
}

const archiveDir = join(ledgerRoot, 'archive')
if (!existsSync(archiveDir)) {
  console.error('[archive-ledger-audit] 台账里没有 archive/ 目录：' + archiveDir)
  process.exit(2)
}

/** 标题集合（原文 + 归一锚点），与全仓唯一实现 `listHeadingAnchors` 同源。 */
function headingsOf(absPath: string): { raw: string[]; anchors: string[] } {
  const text = readFileSync(absPath, 'utf8')
  const refs = listHeadingAnchors(text)
  return { raw: refs.map(r => r.title), anchors: refs.map(r => r.anchor) }
}

const normalize = (s: string): string => s.replace(/[\s、，。：:（）()·\-—/]+/g, '')
const LOOKS_LIKE_SECTION = [
  /^[一二三四五六七八九十]+[、.]/,
  /^第[一二三四五六七八九十百]+/,
  /^[A-Z]?\d+[.)、]/,
  /^(附录|全文|全篇|通篇)/,
]

const rows: ArchivedRow[] = []
let withMaterials = 0
let dirs = 0

for (const name of readdirSync(archiveDir).sort()) {
  const recordPath = join(archiveDir, name, 'record.json')
  if (!existsSync(recordPath)) continue
  dirs += 1
  const record = JSON.parse(readFileSync(recordPath, 'utf8')) as {
    id?: string; workspaceRoot?: string
  }
  const materialsPath = join(archiveDir, name, 'archive.json')
  if (!existsSync(materialsPath)) continue
  withMaterials += 1
  const materials = JSON.parse(readFileSync(materialsPath, 'utf8')) as {
    mergedInto?: string[]
    manualUpdates?: Array<{ path?: string; section?: string }>
  }
  const declared = typeof record.workspaceRoot === 'string' && record.workspaceRoot.length > 0
    ? record.workspaceRoot
    : undefined
  // 归属未知的记录**不跳过**（跳过会静默丢 3 条读数），按当前工作区兜底探测并**如实分列**。
  const root = declared ?? workspaceRoot
  const rootSource = declared === undefined ? 'fallback-current-workspace' : 'workspace-root'

  const missingTargets: string[] = []
  const missingManualPath: string[] = []
  const strict: Array<{ path: string; section: string }> = []
  const looksLike: Array<{ path: string; section: string }> = []
  let naive = 0

  for (const target of materials.mergedInto ?? []) {
    if (!existsSync(join(root, target))) missingTargets.push(target)
    // 对照：同一批材料在**当前工作区**下会判失效几条（证明"必须按各自根解析"）
    if (!existsSync(join(workspaceRoot, target))) naive += 1
  }
  for (const update of materials.manualUpdates ?? []) {
    const raw = String(update.path ?? '')
    const section = String(update.section ?? '')
    // 新形态：锚点在 path 里（`路径#锚点`）；旧形态：自由文本 section。
    const hashAt = raw.indexOf('#')
    const docRel = hashAt >= 0 ? raw.slice(0, hashAt) : raw
    const anchor = hashAt >= 0 ? raw.slice(hashAt + 1) : ''
    const abs = join(root, docRel)
    if (!existsSync(abs)) { missingManualPath.push(docRel); continue }
    const { raw: rawHeads, anchors } = headingsOf(abs)
    if (anchor.length > 0) {
      if (!anchors.includes(anchor)) strict.push({ path: docRel, section: '#' + anchor })
      continue
    }
    if (section.length === 0) continue
    // 口径（与 design/data-model.md 的读数一致）：`section` 允许以 `·`/`→` 追加说明，
    // 锚点看**首个片段**——完整串或首段任一命中该文档标题即算可达（否则记为漂移）。
    const first = section.split(/[·→]/)[0]!.trim()
    const exact = rawHeads.some(h => normalize(h) === normalize(section))
      || (first.length > 0 && rawHeads.some(h => normalize(h) === normalize(first)))
    if (!exact) {
      strict.push({ path: docRel, section })
      if (LOOKS_LIKE_SECTION.some(re => re.test(first))) looksLike.push({ path: docRel, section })
    }
  }

  rows.push({
    requirementId: record.id ?? name,
    root,
    rootSource,
    by: declared === undefined ? 'unknown' : 'workspaceRoot',
    missingTargets,
    sectionDriftStrict: strict,
    sectionDriftLooksLikeSection: looksLike,
    missingManualPath,
    naiveMissingCount: naive,
  })
}

const report: AuditReport = {
  ledgerRoot,
  workspaceRoot,
  archiveDirs: dirs,
  withArchiveMaterials: withMaterials,
  rows,
  totals: {
    realMissingTargets: rows.reduce((n, r) => n + r.missingTargets.length, 0),
    /** 其中落在「归属未知（按当前工作区兜底探测）」记录上的条数——**兜底读数，不是权威根**。 */
    missingTargetsOnFallbackRoot: rows
      .filter(r => r.rootSource === 'fallback-current-workspace')
      .reduce((n, r) => n + r.missingTargets.length, 0),
    sectionDriftStrict: rows.reduce((n, r) => n + r.sectionDriftStrict.length, 0),
    sectionDriftLooksLikeSection: rows.reduce((n, r) => n + r.sectionDriftLooksLikeSection.length, 0),
    missingManualPath: rows.reduce((n, r) => n + r.missingManualPath.length, 0),
    unknownRoot: rows.filter(r => r.by === 'unknown').length,
    naiveMissing: rows.reduce((n, r) => n + r.naiveMissingCount, 0),
  },
  note: '只读核对：不追溯、不改写任何历史台账或归档目录。'
    + '锚点口径由 src/domain/knowledge/slug.ts 的 listHeadingAnchors 单点给出（手写 slug 不可信）。',
}

/** Markdown 报告（人读；与 --json 同源同读数）。 */
function renderMarkdown(r: AuditReport): string {
  const lines: string[] = [
    '# 存量归档只读核对报告（REQ-261006201841-944d FR-8）',
    '',
    '> 只读：**不追溯、不改写**任何历史台账或归档目录。判据与归档新闸同源'
    + '（锚点由 `listHeadingAnchors` 单点给出，不手写 slug 规则）。',
    '',
    '- 台账根：`' + r.ledgerRoot + '`',
    '- 当前工作区（对照用）：`' + r.workspaceRoot + '`',
    '- 归档目录 ' + String(r.archiveDirs) + ' 条，其中已交归档材料 ' + String(r.withArchiveMaterials) + ' 条',
    '',
    '## 汇总读数',
    '',
    '| 读数 | 值 | 口径 |',
    '|---|---|---|',
    '| 合并去向真失效 | ' + String(r.totals.realMissingTargets) + ' | 按**每条需求自己的根**解析；其中 '
      + String(r.totals.missingTargetsOnFallbackRoot) + ' 条落在「归属未知」记录上（**兜底读数**） |',
    '| 说明书锚点漂移（严格口径） | ' + String(r.totals.sectionDriftStrict) + ' | 任意级标题归一化**精确**匹配失败 |',
    '| 说明书锚点漂移（像章节引用口径） | ' + String(r.totals.sectionDriftLooksLikeSection) + ' | `section` 形如 `一、`/`第 N`/数字序号/`全文·全篇` 且锚不到 |',
    '| `manual_updates[].path` 不存在 | ' + String(r.totals.missingManualPath) + ' | 路径本身在盘上找不到 |',
    '| 归属未知（无 `workspaceRoot`） | ' + String(r.totals.unknownRoot) + ' | 记录里既无 `projectId` 也无 `workspaceRoot` |',
    '| **对照**：按当前工作区直接比会判失效 | ' + String(r.totals.naiveMissing) + ' | 同一批材料在**错误根**上的读数——证明必须按各自根解析 |',
    '',
  ]
  const bad = r.rows.filter(x => x.missingTargets.length > 0 || x.sectionDriftStrict.length > 0 || x.missingManualPath.length > 0)
  if (bad.length === 0) {
    lines.push('逐条清单：无失效。', '')
  } else {
    lines.push('## 逐条清单（只列有失效的）', '', '| 需求 | 生效根 | 合并去向缺失 | 锚点漂移 | path 缺失 |', '|---|---|---|---|---|')
    for (const row of bad) {
      lines.push('| ' + row.requirementId + ' | `' + row.root + '`'
        + (row.rootSource === 'fallback-current-workspace' ? '（**兜底根**）' : '') + ' | '
        + (row.missingTargets.map(t => '`' + t + '`').join('<br>') || '—') + ' | '
        + (row.sectionDriftStrict.map(s => '`' + s.path + '` :: ' + s.section).join('<br>') || '—') + ' | '
        + (row.missingManualPath.map(t => '`' + t + '`').join('<br>') || '—') + ' |')
    }
    lines.push('')
  }
  lines.push('## 处置', '', '- 存量**不追溯**：本次只报告读数，不改写历史台账与归档目录（D-3）。',
    '- 新提交已被新闸拦住同类问题（`merged_into` 存在且非空、锚点必须可达）。', '')
  return lines.join('\n')
}

if (asJson) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
} else {
  const md = renderMarkdown(report)
  process.stdout.write(md)
  if (outPath !== undefined) {
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, md, 'utf8')
    console.log('\n[archive-ledger-audit] 报告已落盘：' + outPath)
  }
}
