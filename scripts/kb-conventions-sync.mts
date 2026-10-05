/**
 * 规范页骨架生成 / 漂移检查（REQ-261001143526-8475 t2 / design/interfaces.md）。
 *
 * 做什么：把「必跑但还没进规范页」的工程操作**变成候选条目骨架**（命令/期望/时机自动填，
 * 「失败怎么办」留占位由人补），并重写覆盖清单 `docs/knowledge/operations.tsv`；顺带补索引行。
 *
 * 不做什么：**不覆盖已有条目**（按条目 id 判定，只追加）；不替人写「失败怎么办」的措辞。
 *
 * 跑法：
 *   npx tsx scripts/kb-conventions-sync.mts --write    # 生成骨架 + 覆盖清单 + 索引行
 *   npx tsx scripts/kb-conventions-sync.mts --check    # 有缺口/漂移 → 退出码 1（CI 门禁）
 *
 * @module dsh-pmboard/scripts/kb-conventions-sync
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { KB_PATHS, KB_PAGE_PATHS } from '../src/domain/knowledge/types.ts'
import { renderIndexLine } from '../src/domain/knowledge/index-line.ts'
import {
  buildCoverage,
  entryToIndexRow,
  findGaps,
  listUnclassified,
  parseOperationEntries,
  renderCoverageTsv,
  renderEntrySkeleton,
  type CoverageItem,
  type OperationEntry,
} from '../src/domain/knowledge/operations.ts'

const ROOT = process.cwd()
const CONVENTIONS = join(ROOT, KB_PAGE_PATHS.conventions)
const INDEX = join(ROOT, KB_PATHS.index)
const OPS_TSV = join(ROOT, 'docs/knowledge/operations.tsv')
const SECTION_TITLE = '工程操作'
/** 已知命令的条目标题（人读；未登记的命令回落为「工程操作：<命令>」）。 */
const TITLES: Record<string, string> = {
  'pnpm typecheck': '改了源码必须跑类型检查',
  'pnpm build:client': '改了客户端源码必须重建 bundle',
  'pnpm kb:check': '改了知识层内容必须重生成并自检',
  'pnpm test': '提交前必须跑测试并与基线比对',
  'pnpm build': '发版前必须构建（host + client）',
  'node scripts/inline-prompt-fragments.mjs': '改了提示词片段必须重生成产物',
  'node scripts/check-prompt-fragments.mjs': '重生成后必须校验片段与产物一致',
  'bash scripts/sync-to-github.sh': '发版前必须同步镜像仓库',
}

const args = process.argv.slice(2)
const check = args.includes('--check')

if (!existsSync(CONVENTIONS)) {
  console.error('[kb-conventions-sync] 规范页不存在：' + CONVENTIONS)
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
const coverage: readonly CoverageItem[] = buildCoverage(pkg.scripts ?? {})
const conventionsText = readFileSync(CONVENTIONS, 'utf8')
const entries: readonly OperationEntry[] = parseOperationEntries(conventionsText)
const gaps = findGaps(coverage, entries)
const scriptFiles = existsSync(join(ROOT, 'scripts')) ? readdirSync(join(ROOT, 'scripts')) : []
const unclassified = listUnclassified(scriptFiles)

const tsvNow = existsSync(OPS_TSV) ? readFileSync(OPS_TSV, 'utf8') : ''
// 注意：`--check` 用的是"当前条目"；`--write` 会在追加骨架后**重新解析**再算 TSV，
// 否则新条目在清单里会停留在 `(缺)`，下一个门禁立刻报漂移（演练时实测踩过）。
const tsvForCheck = renderCoverageTsv(coverage, entries)
const tsvDrift = tsvNow !== tsvForCheck

if (check) {
  let bad = 0
  if (gaps.length > 0) {
    bad += 1
    console.error('[kb-conventions-sync] 覆盖缺口 ' + String(gaps.length) + ' 项（必跑但未进规范页）：')
    for (const g of gaps) console.error('  - ' + g.command + ' → 建议 ' + g.suggestedId)
  }
  if (unclassified.length > 0) {
    bad += 1
    console.error('[kb-conventions-sync] scripts/ 未归类文件（须进白名单或排除表并写理由）：' + unclassified.join('、'))
  }
  if (tsvDrift) {
    bad += 1
    console.error('[kb-conventions-sync] 覆盖清单漂移：' + OPS_TSV + ' 与当次扫描不一致（重跑 --write）')
  }
  console.log(bad === 0 ? '[verify] 覆盖度与清单一致（零缺口、零漂移）' : '[verify] ' + String(bad) + ' 类问题')
  process.exit(bad === 0 ? 0 : 1)
}

// ── --write：补骨架 + 重写清单 ────────────────────────────────────────
let text = conventionsText
if (gaps.length > 0) {
  const lines = text.split('\n')
  let secAt = lines.findIndex((l) => /^##\s+/.test(l) && l.replace(/^##\s+/, '').replace(/`/g, '').trim().replace(/\s+#\S+$/, '') === SECTION_TITLE)
  if (secAt < 0) {
    console.error('[kb-conventions-sync] 规范页缺少 `## ' + SECTION_TITLE + '` 节：请先手工建节（含时机四档说明）再跑 --write')
    process.exit(1)
  }
  let end = lines.length
  for (let i = secAt + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i]!)) { end = i; break }
  }
  const block: string[] = ['']
  for (const g of gaps) {
    const item = coverage.find((c) => c.command === g.command)!
    block.push(renderEntrySkeleton(item, g.suggestedCode, TITLES[item.command] ?? '工程操作：' + item.command), '')
  }
  while (end > secAt + 1 && lines[end - 1]!.trim() === '') end -= 1
  lines.splice(end, 0, ...block)
  text = lines.join('\n')
  console.log('[write] 追加骨架 ' + String(gaps.length) + ' 条：' + gaps.map((g) => g.suggestedCode).join('、'))
}

mkdirSync(dirname(OPS_TSV), { recursive: true })
writeFileSync(CONVENTIONS, text, 'utf8')
const entriesAfter = parseOperationEntries(text)
writeFileSync(OPS_TSV, renderCoverageTsv(coverage, entriesAfter), 'utf8')

// 索引行（与骨架同步补；幂等：已有 id 的行原地替换）
if (existsSync(INDEX)) {
  let idx = readFileSync(INDEX, 'utf8')
  for (const g of gaps) {
    const entry = parseOperationEntries(text).find((e) => e.id === g.suggestedId)
    if (entry === undefined) continue
    const row = entryToIndexRow(entry)
    const line = renderIndexLine(row)
    const lines = idx.split('\n')
    const at = lines.findIndex((l) => l.startsWith('- ' + row.id + ' ·'))
    if (at >= 0) {
      lines[at] = line
      idx = lines.join('\n')
      continue
    }
    const secAt = lines.findIndex((l) => /^##\s+/.test(l) && l.replace(/^##\s+/, '').trim().replace(/\s+#\S+$/, '') === '规范')
    if (secAt < 0) { console.error('[kb-conventions-sync] 索引缺少 `## 规范` 节，跳过索引行'); break }
    let end = lines.length
    for (let i = secAt + 1; i < lines.length; i += 1) {
      if (/^##\s+/.test(lines[i]!)) { end = i; break }
    }
    while (end > secAt + 1 && lines[end - 1]!.trim() === '') end -= 1
    lines.splice(end, 0, line)
    idx = lines.join('\n')
  }
  writeFileSync(INDEX, idx, 'utf8')
}

console.log(
  'kb-conventions-sync: 覆盖 ' + String(coverage.length) + ' 项 · 已有条目 ' + String(entries.length)
  + ' · 本次补 ' + String(gaps.length) + ' 条 · 未归类 ' + String(unclassified.length) + ' 个',
)
if (unclassified.length > 0) {
  console.log('[提示] scripts/ 未归类文件（进白名单或排除表）:' + unclassified.join('、'))
}
