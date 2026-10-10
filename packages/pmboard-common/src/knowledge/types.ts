/**
 * 知识层领域类型（REQ-261001110934-3766 t1 / design/data-model.md）。
 *
 * 本文件只放**类型与枚举常量**：八类知识域、两种 id 形态、索引行、条目头部、结构化问题与溢出。
 * 零 import（layer-boundary 门禁把 domain 的依赖钉死在内层）。
 *
 * @module dsh-pmboard/domain/knowledge/types
 */

/** 八类知识域（design/data-model.md「实体总览」）。 */
export const KB_KINDS = [
  'architecture',
  'standard',
  'tokens',
  'decision',
  'pitfall',
  'contract',
  'map',
  'glossary',
] as const

export type KbKind = (typeof KB_KINDS)[number]

/** 条目状态：active 进索引；stale 待复核；superseded 只留文件供追溯。 */
export const KB_ENTRY_STATUSES = ['active', 'stale', 'superseded'] as const
export type KbEntryStatus = (typeof KB_ENTRY_STATUSES)[number]

/**
 * 索引分节（顺序即契约，design/data-model.md「分节顺序（固定）」）。
 * 「待写」是无 kind 的自由节，用来把缺口显式化（对齐 project-manual 的「待写页」）。
 */
export const KB_INDEX_SECTIONS = [
  { title: '架构', kind: 'architecture' },
  { title: '规范', kind: 'standard' },
  { title: '前端令牌', kind: 'tokens' },
  { title: '决策', kind: 'decision' },
  { title: '坑', kind: 'pitfall' },
  { title: '契约', kind: 'contract' },
  { title: '术语', kind: 'glossary' },
  { title: '代码地图', kind: 'map' },
  { title: '待写', kind: undefined },
] as const

/** 分节标题（按 kind 反查；待写节无 kind）。 */
export function sectionTitleFor(kind: KbKind): string {
  const hit = KB_INDEX_SECTIONS.find((s) => s.kind === kind)
  if (hit === undefined) throw new Error('未知 kind：' + kind)
  return hit.title
}

/** 索引行（L0 的一行 = 一条知识的指针）。 */
export interface KbIndexRow {
  readonly id: string
  readonly kind: KbKind
  readonly oneLiner: string
  readonly pointer: string
}

/** 结构化问题（解析/校验用；带行号，禁止静默丢弃）。 */
export interface KbIssue {
  readonly line: number
  readonly code: string
  readonly detail: string
  readonly raw?: string
}

/** 结构化溢出（超预算时返回它，而不是静默裁剪）。 */
export interface KbOverflow {
  readonly reason: 'index-chars' | 'index-lines' | 'page-lines' | 'query-budget'
  readonly actual: number
  readonly limit: number
  readonly unit: 'chars' | 'lines'
}

/** 条目头部字段（YAML front-matter 的**扁平标量**子集）。 */
export interface KbEntryMeta {
  readonly id: string
  readonly kind: KbKind
  readonly status: KbEntryStatus
  readonly title: string
  readonly oneLiner: string
  readonly appliesWhen: string
  readonly pointer: string
  readonly supersedes?: string
  readonly updated: string
  readonly expires: string
  readonly req?: string
}

/** 知识层产物（自检与生成器共用的导航项）。 */
export interface KbArtifact {
  readonly path: string
  readonly role: 'index' | 'page' | 'entry' | 'machine'
}

/** 页面名（存储映射的键，见 design/data-model.md）。 */
export type KbPageName = 'architecture' | 'conventions' | 'tokens' | 'code-map' | 'glossary'

/**
 * 知识层落盘路径（t2 / design/data-model.md「实体总览」）。
 *
 * 为什么路径也进 domain：路径是**数据契约**的一部分——读写端、生成器与自检必须引用同一常量，
 * 否则改名一处就会出现「索引写在新路径、读取端找旧路径」的静默失效。
 */
export const KB_PATHS = {
  root: 'docs/knowledge',
  index: 'docs/knowledge/INDEX.md',
  entriesDir: 'docs/knowledge/entries',
  /** 机器索引（永不进上下文，只由工具检索）。 */
  symbols: 'docs/knowledge/code-map.symbols.tsv',
  classes: 'docs/knowledge/design-tokens.classes.tsv',
  /** 生成区标记（生成器只写这一区，手写行永不被覆盖）。 */
  generatedBegin: '<!-- kb:generated:begin -->',
  generatedEnd: '<!-- kb:generated:end -->',
} as const

/** 页面名 → 页面文件路径。 */
export const KB_PAGE_PATHS: Record<KbPageName, string> = {
  architecture: 'docs/knowledge/architecture.md',
  conventions: 'docs/knowledge/conventions.md',
  tokens: 'docs/knowledge/design-tokens.md',
  'code-map': 'docs/knowledge/code-map.md',
  glossary: 'docs/knowledge/glossary.md',
}

/** 归档派生条目 → 文件路径。 */
export function entryPath(id: string): string {
  return KB_PATHS.entriesDir + '/' + id + '.md'
}

/** 页面名 → 文件路径。 */
export function pagePath(page: KbPageName): string {
  return KB_PAGE_PATHS[page]
}
