/**
 * 知识层生成器（纯函数）——REQ-261004174324-4195 t1 / design/interfaces.md。
 *
 * 定位：把原先长在 `scripts/kb-build.mts` 里的**生成规则**搬进领域层，做到
 * **零 IO、零时间戳、可重跑**：输入是已读好的源码文本（`KbSourceFile[]`），
 * 输出是待落盘的成品字符串。扫描与写入在用例层（`EnsureKnowledgeLayer`）经端口完成。
 *
 * 口径**逐字沿用**搬迁前脚本（导出正则、`SRC_KINDS`、`GROUP_TOP=24`、TSV 表头、
 * 页面首部的生成物说明），否则 `pnpm kb:check` 会因生成物漂移而变红。
 *
 * **一处刻意修正（2026-10-04，本需求实现期发现）**：搬迁前脚本先 `rel.sort()` 却按未排序的
 * `abs[i]` 读文件，于是 `code-map.symbols.tsv` 的 file 列与符号**整体错配一行**
 * （实测：`src/client/styles.ts` 被记成定义 `BASE_CSS`，实际在 `src/client/styles/base.ts`）。
 * 本实现按 path 排序后**同名配对**，故首次重跑生成物会变一次（此后零漂移）；
 * 回归锁见 `tests/kb-generate.test.ts`「符号归属到真实定义它的文件」。
 *
 * @module dsh-pmboard/domain/knowledge/generate
 */
import { KB_PATHS } from './types.js'
import { KB_LIMITS } from './budget.js'

/** 一份已读好的源文件（路径为工作区相对路径，正斜杠）。 */
export interface KbSourceFile {
  readonly path: string
  readonly text: string
}

/** 一条导出符号（机器索引的一行）。 */
export interface KbSymbolRow {
  readonly file: string
  readonly name: string
  readonly kind: string
  readonly signature: string
}

/** 代码地图渲染结果。 */
export interface KbCodeMapRender {
  readonly page: string
  readonly symbolsTsv: string
  readonly symbolCount: number
}

/** 设计令牌渲染结果。 */
export interface KbTokensRender {
  readonly page: string
  readonly classesTsv: string
  readonly counts: { readonly colors: number; readonly vars: number; readonly breakpoints: number; readonly classes: number }
}

/**
 * INDEX 结构异常（响亮，不静默重建）。
 *
 * 两种病因分开报：分节缺了（人手改了标题）与生成区标记缺了（人手删了标记）。
 * 调用方（自举用例）据此决定对外 reason——**绝不擅自重建骨架**，因为那会覆盖手写行。
 */
export class KbIndexStructureError extends Error {
  constructor(
    readonly kind: 'section-missing' | 'markers-missing',
    readonly section: string,
  ) {
    super(kind === 'section-missing' ? 'INDEX 缺少分节：' + section : 'INDEX 分节「' + section + '」缺少生成区标记')
    this.name = 'KbIndexStructureError'
  }
}

/** 导出符号（与 evidence/volume-probe.py 的正则**逐字一致**：口径必须能对齐）。 */
const EXPORT_RE =
  /^export\s+(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:function|class|interface|type|const|enum|namespace)\s+[^\n{=]*/gm
const SRC_KINDS = ['function', 'class', 'interface', 'type', 'const', 'enum', 'namespace']
/** 令牌页类名前缀分组只列 Top N（页面预算 200 行；全量在 TSV 里）。 */
const GROUP_TOP = 24
/** 样式分片路径口径（与搬迁前脚本逐字一致）。 */
const STYLE_RE = /^src\/client\/styles?/

/** 抽符号：名称取关键字后的第一个标识符；签名取整行（截断 120 字符，保持单行）。 */
export function extractSymbols(relPath: string, text: string): readonly KbSymbolRow[] {
  const out: KbSymbolRow[] = []
  for (const m of text.matchAll(EXPORT_RE)) {
    const raw = m[0].replace(/\s+/g, ' ').trim()
    const kind = SRC_KINDS.find((k) => new RegExp('(?:^|\\s)' + k + '\\s').test(raw)) ?? 'other'
    const after = raw.replace(/^export\s+(?:default\s+)?(?:abstract\s+)?(?:async\s+)?/, '')
    const nameMatch = /^(?:function|class|interface|type|const|enum|namespace)\s+([A-Za-z0-9_$]+)/.exec(after)
    out.push({
      file: relPath,
      name: nameMatch?.[1] ?? '(anonymous)',
      kind,
      signature: raw.length > 120 ? raw.slice(0, 119) + '…' : raw,
    })
  }
  return out
}

/** 目录角色（模块级地图的「一句话角色」）：取该目录下 README/首文件的模块头首句。 */
function moduleRole(files: readonly KbSourceFile[]): string {
  const head = files.find((f) => /index\.ts$/.test(f.path)) ?? files[0]
  if (head === undefined) return '（无文件）'
  const text = head.text
  const m = /@module\s+(\S+)/.exec(text)
  const first = text.split('\n').find((l) => /^ \* \S/.test(l) && !/^ \* @/.test(l))
  const sentence = first === undefined ? '' : first.replace(/^ \* /, '').trim()
  return [m?.[1], sentence].filter((x) => x !== undefined && x.length > 0).join(' — ') || '（无模块说明）'
}

/**
 * 渲染代码地图 + 全量符号 TSV。
 *
 * 输入：`src/**\/*.ts` 的全部文件（路径已按工作区相对、正斜杠）。输出与搬迁前脚本**逐字节一致**
 * 的先决条件是：文件集合、文件内容与排序口径相同（本函数内部按 path 升序排）。
 */
export function renderCodeMap(files: readonly KbSourceFile[]): KbCodeMapRender {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path))
  const syms: KbSymbolRow[] = []
  const byModule = new Map<string, { files: KbSourceFile[]; chars: number; symbols: number }>()
  for (const f of sorted) {
    const fileSyms = extractSymbols(f.path, f.text)
    syms.push(...fileSyms)
    const seg = f.path.split('/')
    const mod = seg.length > 2 ? seg.slice(0, 2).join('/') : seg.slice(0, 1).join('/')
    const cur = byModule.get(mod) ?? { files: [], chars: 0, symbols: 0 }
    cur.files.push(f)
    cur.chars += f.text.length
    cur.symbols += fileSyms.length
    byModule.set(mod, cur)
  }
  const lines: string[] = [
    '# 代码地图（模块级）',
    '',
    '> 生成物：由 `scripts/kb-build.mts` 从 `src/**/*.ts` 确定性抽取，**请勿手改**（改源码后重跑）。',
    `> 全量符号（${String(syms.length)} 条）在 \`${KB_PATHS.symbols}\`——机器索引、不进上下文，用 \`reqboard_kb(kind='map', query='<符号>')\` 检索。`,
    '',
    '## 模块总览 #modules',
    '',
    '| 模块 | 文件 | 字符 | 导出符号 | 角色 |',
    '|---|---|---|---|---|',
  ]
  const modules = [...byModule.entries()].sort((a, b) => b[1].chars - a[1].chars)
  for (const [mod, info] of modules) {
    lines.push(`| \`${mod}\` | ${String(info.files.length)} | ${String(info.chars)} | ${String(info.symbols)} | ${moduleRole(info.files)} |`)
  }
  lines.push('', '## 导出最多的文件 #hot', '')
  const hot = [...byModule.values()]
    .flatMap((m) => m.files.map((f) => f.path))
    .map((f) => ({ f, n: syms.filter((s) => s.file === f).length }))
    .sort((a, b) => b.n - a.n || a.f.localeCompare(b.f))
    .slice(0, 20)
  for (const h of hot) lines.push(`- \`${h.f}\` · ${String(h.n)} 个导出`)
  lines.push('')
  const tsv = ['file\tsymbol\tkind\tsignature', ...syms.map((s) => [s.file, s.name, s.kind, s.signature].join('\t'))].join('\n') + '\n'
  return { page: lines.join('\n'), symbolsTsv: tsv, symbolCount: syms.length }
}

/**
 * 渲染前端设计令牌 + 全量类名 TSV。
 *
 * 输入可以是任意文件集合：函数内部按搬迁前口径（`^src/client/styles?`）自行过滤，
 * 因此调用方传「src 下全部 .ts」或「src/client 下全部 .ts」结果相同。
 */
export function renderDesignTokens(files: readonly KbSourceFile[]): KbTokensRender {
  const styleFiles = [...files].map((f) => f.path).filter((p) => STYLE_RE.test(p)).sort()
  const byPath = new Map(files.map((f) => [f.path, f.text]))
  const colors = new Map<string, { count: number; shard: string }>()
  const vars = new Map<string, string>()
  const breaks = new Set<string>()
  const classes = new Map<string, string>()
  for (const f of styleFiles) {
    const text = byPath.get(f) ?? ''
    for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      const key = m[0].toLowerCase()
      const cur = colors.get(key) ?? { count: 0, shard: f }
      cur.count += 1
      colors.set(key, cur)
    }
    for (const m of text.matchAll(/(--[a-z0-9-]+)\s*:/g)) if (!vars.has(m[1]!)) vars.set(m[1]!, f)
    for (const m of text.matchAll(/@(?:media|container)\s*\(max-width:\s*([0-9]+px)/g)) breaks.add(m[1]!)
    for (const m of text.matchAll(/\.(dsh-pm-[A-Za-z0-9_-]+)/g)) if (!classes.has(m[1]!)) classes.set(m[1]!, f)
  }
  const colorRows = [...colors.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
  const varRows = [...vars.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const breakRows = [...breaks].sort((a, b) => Number(b.replace('px', '')) - Number(a.replace('px', '')))
  const classRows = [...classes.keys()].sort()
  const groupCount = new Map<string, number>()
  for (const c of classRows) {
    const seg = c.split('-')
    const key = seg.slice(0, 3).join('-')
    groupCount.set(key, (groupCount.get(key) ?? 0) + 1)
  }
  const groups = [...groupCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const lines = [
    '# 前端设计令牌（生成物）',
    '',
    `> 生成物：由 \`scripts/kb-build.mts\` 从 ${STYLE_RE.source.replace(/^\^/, '').replace(/\$$/, '')} 确定性抽取，**请勿手改**（改样式后重跑）。`,
    `> 全量类名（${String(classRows.length)} 个）在 \`${KB_PATHS.classes}\`——机器索引、不进上下文，用 \`reqboard_kb(kind='tokens', query='<类名>')\` 检索。`,
    '',
    '## 颜色 #colors',
    '',
  ]
  for (const [c, info] of colorRows) lines.push(`- \`${c}\` · ${String(info.count)} 次 · ${info.shard.replace('src/client/styles/', '')}`)
  lines.push('', '## 变量 #vars', '')
  for (const [v, f] of varRows) lines.push(`- \`${v}\` · ${f.replace('src/client/styles/', '')}`)
  lines.push('', '## 断点 #breakpoints', '')
  for (const b of breakRows) lines.push(`- \`max-width: ${b}\``)
  lines.push('', `## 类名前缀分组 #classes（Top ${String(GROUP_TOP)}，共 ${String(groups.length)} 组）`, '')
  for (const [g, n] of groups.slice(0, GROUP_TOP)) lines.push(`- \`${g}\` · ${String(n)} 个`)
  lines.push('')
  const tsv = ['class\tshard', ...classRows.map((c) => c + '\t' + (classes.get(c) ?? ''))].join('\n') + '\n'
  return {
    page: lines.join('\n'),
    classesTsv: tsv,
    counts: { colors: colorRows.length, vars: varRows.length, breakpoints: breakRows.length, classes: classRows.length },
  }
}

/** INDEX 骨架（首次生成；已有则只替换生成区）。 */
export function scaffoldIndex(): string {
  const s = (title: string, body: string[]): string[] => ['## ' + title, '', ...body, '']
  return [
    '# 项目知识索引',
    '',
    '> （待写：一句话项目摘要——这个项目是什么、分几层、给谁用）',
    '',
    ...s('架构', ['- kb-architecture-layers · architecture · 四层职责与依赖方向 · → architecture.md#layers']),
    ...s('规范', ['- kb-conventions-c01 · standard · 层边界只许向内 · → conventions.md#c-01']),
    ...s('前端令牌', [
      KB_PATHS.generatedBegin,
      '- kb-tokens-colors · tokens · 颜色表与变量入口 · → design-tokens.md#colors',
      KB_PATHS.generatedEnd,
    ]),
    ...s('决策', ['（暂无）']),
    ...s('坑', ['（暂无）']),
    ...s('契约', ['（暂无）']),
    ...s('术语', ['- kb-glossary-terms · glossary · 术语表 · → glossary.md#terms']),
    ...s('代码地图', [
      KB_PATHS.generatedBegin,
      '- kb-code-map-modules · map · 模块级地图与符号检索入口 · → code-map.md#modules',
      KB_PATHS.generatedEnd,
    ]),
    ...s('待写', ['- 《需求流水线》：六阶段状态机与五道人工门']),
  ].join('\n')
}

/**
 * 只替换生成区内容（手写行一字不动）。
 *
 * 抛 `KbIndexStructureError`：分节找不到 → `section-missing`；分节在但生成区标记缺失 → `markers-missing`。
 * 调用方**不得**把这些异常当成「重建骨架」的信号（那会覆盖手写行）。
 */
export function replaceGeneratedSection(indexText: string, sectionTitle: string, rows: readonly string[]): string {
  const lines = indexText.split('\n')
  const start = lines.findIndex((l) => /^##\s+/.test(l) && l.replace(/^##\s+/, '').replace(/`/g, '').trim() === sectionTitle)
  if (start < 0) throw new KbIndexStructureError('section-missing', sectionTitle)
  let begin = -1
  let end = -1
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i]!)) break
    if (lines[i]!.trim() === KB_PATHS.generatedBegin) begin = i
    if (lines[i]!.trim() === KB_PATHS.generatedEnd) end = i
  }
  if (begin < 0 || end < 0) throw new KbIndexStructureError('markers-missing', sectionTitle)
  lines.splice(begin + 1, end - begin - 1, ...rows)
  return lines.join('\n')
}

/** 页面上限（行数）——供调用方做预算判定（本仓常量单点：`KB_LIMITS.pageMaxLines`）。 */
export const KB_PAGE_MAX_LINES: number = KB_LIMITS.pageMaxLines
