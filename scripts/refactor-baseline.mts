/**
 * 迁移基线固化（REQ-261009174713-7bc8 t1）——**只读测量**：不改任何源码，只 dump 五类基线。
 *
 * 为什么必须在迁移前跑：本需求把平铺单包拆成 19 个子包，验收判据是「五类基线 diff 全空」
 * （宿主可见面 + 工具面 + 资产面 + 判据面 + 测试面）。基线一旦错过 pristine 状态就再也抓不回来。
 *
 * 用法：npx tsx scripts/refactor-baseline.mts --write
 * 产物：.dsh-data/refactor-baseline/{dist-exports,tool-registry,vitest-cases,asset-manifest,type-spec}.json
 */
import { mkdirSync, writeFileSync, readdirSync, statSync, existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const ROOT = resolve(process.cwd())
const OUT = join(ROOT, '.dsh-data', 'refactor-baseline')
const write = process.argv.includes('--write')

/** 哈希**原始字节**：`update(字符串)` 会按 utf8 编码，非 ASCII 文件会被二次编码——这是 t6 实测踩到的坑。 */
function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

/** 递归列出目录下所有文件的工作区相对路径（排序稳定）。 */
function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name)
    const st = statSync(abs)
    if (st.isDirectory()) walk(abs, out)
    else if (st.isFile()) out.push(relative(ROOT, abs))
  }
  return out
}

/** 资产清单：路径 + 内容哈希（排序稳定）→ 用于「资产包化后解析到同一批文件」的判据。 */
function assetManifest(dirs: readonly string[]): { path: string; sha256: string; bytes: number }[] {
  const rows: { path: string; sha256: string; bytes: number }[] = []
  for (const dir of dirs) {
    for (const rel of walk(join(ROOT, dir))) {
      const buf = readFileSync(join(ROOT, rel))
      rows.push({ path: rel, sha256: sha256(buf), bytes: buf.length })
    }
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path))
}

// ── 1. 工具注册面（19 个 reqboard_* 工具名 + schema 摘要哈希）────────────────
const { TOOL_REGISTRY } = await import('tool-pm/registry.js')
const toolRows = (TOOL_REGISTRY as readonly Record<string, unknown>[]).map(e => ({
  key: String(e['key']),
  factoryFile: String(e['factoryFile']),
  factoryName: String(e['factoryName'] ?? ''),
  // t22：哈希改为**布局无关投影**——原实现 sha256(JSON.stringify(整条)) 把 `factoryFile` 与
  // `responseSources` 里的**路径**也算进去了，于是 t15/t17 搬迁后 19 条哈希必然全变（良性但无信息）。
  // 现在只哈希身份字段：同一工具跑同一份代码，搬到哪都得到同一个哈希；改名/换实现仍会变。
  schemaHash: sha256(JSON.stringify({ key: e['key'], toolName: e['toolName'] ?? null, dir: e['dir'] ?? null })),
}))

// ── 2. 六类型规格（判据面：必填节 / 必交设计文档 / 条件产物 / 归档去向 / 模板映射）──
const { CATEGORY_DELTAS } = await import('pm-core/application/internal/category-doc-sets.js')
const { ARCHIVE_DOC_RULES } = await import('pm-core/domain/artifact/ArtifactSpec.js')
const { NODE_TEMPLATES } = await import('pm-core/domain/template/registry.js')
const typeSpec = (CATEGORY_DELTAS as readonly Record<string, unknown>[]).map(d => {
  const category = String(d['category'])
  const archive = (ARCHIVE_DOC_RULES as Record<string, unknown>)[category]
  const templates = (NODE_TEMPLATES as readonly Record<string, unknown>[])
    .filter(t => t['category'] === category || t['category'] === '*')
    .map(t => ({ stage: t['stage'], templates: t['templates'] }))
  return {
    category,
    requiredSections: d['rootSectionsDelta'],
    requiredDesignDocs: d['requiredDesignDocs'],
    conditionalStageArtifacts: d['conditionalStageArtifacts'] ?? [],
    archive,
    templates,
  }
})

// ── 3. dist 产物导出名单（宿主可见面）───────────────────────────────────────
const distEntry = join(ROOT, 'dist', 'index.mjs')
let distExports: string[] = []
if (existsSync(distEntry)) {
  const mod = await import(distEntry)
  distExports = Object.keys(mod).sort()
}

// ── 4. 资产清单（模板 / skill / RTM 引擎）
// 路径映射（t6 起）：迁移前 `vendor/reqboard/src/**` → 迁移后 `reqboard-rtm/src/**`，
// 收口比对（t22）按内容哈希多重集相等 + 该前缀映射核验，不按裸路径比对。───────────────────────────────────
// 资产根布局无关（t19）：搬迁前后各一处——否则搬完只剩 rtm 那 28 个，计数会掉到 28。
const assetRoot = (kind: string): string =>
  existsSync(join(ROOT, 'pm-' + kind, kind)) ? 'pm/pm-' + kind + '/' + kind : kind
const assets = assetManifest([assetRoot('templates'), assetRoot('skills'), 'reqboard-rtm/src'])

// ── 5. 测试发现数（由 vitest --reporter=json 另跑，这里只登记现有读数）────────
const vitestReport = join(OUT, 'vitest-report.json')
let caseCount: number | null = null
if (existsSync(vitestReport)) {
  const report = JSON.parse(readFileSync(vitestReport, 'utf8')) as { numTotalTests?: number }
  caseCount = report.numTotalTests ?? null
}

const baselines: Record<string, unknown> = {
  'dist-exports.json': { distPresent: existsSync(distEntry), exports: distExports },
  'tool-registry.json': { count: toolRows.length, tools: toolRows },
  'type-spec.json': { categories: typeSpec.map(t => t.category), spec: typeSpec },
  'asset-manifest.json': { count: assets.length, files: assets },
  'vitest-cases.json': { numTotalTests: caseCount, note: '由 npx vitest run --reporter=json --outputFile=.dsh-data/refactor-baseline/vitest-report.json 刷新' },
}

if (!write) {
  console.log(JSON.stringify({
    mode: 'dry-run（加 --write 落盘）',
    toolCount: toolRows.length,
    tools: toolRows.map(t => t.key),
    typeCategories: typeSpec.map(t => t.category),
    distExports,
    assetCount: assets.length,
    vitestCases: caseCount,
  }, null, 1))
} else {
  mkdirSync(OUT, { recursive: true })
  for (const [name, body] of Object.entries(baselines)) {
    writeFileSync(join(OUT, name), JSON.stringify(body, null, 2) + '\n')
  }
  console.log('基线已写入 ' + relative(ROOT, OUT))
  console.log('  工具数=' + toolRows.length + ' 类型数=' + typeSpec.length + ' 资产文件=' + assets.length + ' dist 导出=' + distExports.length + ' 用例数=' + String(caseCount))
}
