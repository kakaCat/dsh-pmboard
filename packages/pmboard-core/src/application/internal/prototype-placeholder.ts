/**
 * 非骨架判据（REQ-261006201649-cc89 FR-1）——「这份原型是设计结论，还是模板占位？」
 *
 * 为什么独立成模块（两条理由，都是实测逼出来的）：
 *   ① `prototype-gates.ts` 是**尺寸门禁**盯着的文件（≤400 行，`tests/size-budget.test.ts`
 *      的白名单**只收 `client/` 与 `shared/protocol.ts`**，不收 application/）——判据加进去
 *      直接超标，而往白名单里塞一条正是那道门禁防的滥用形态。拆分口径与
 *      `content-gates` / `content-trace` / `design-gates` 同款。
 *   ② 本判据是**纯函数**：零 IO、零依赖、不引 HTML parser——与门（取数 + 组装 + 文案）
 *      的职责本来就不同层，分开后可以被人单独拿去做可逆验证（改坏必红）。
 *
 * 与 `prototype-skeleton-template.ts` 的关系（**单向，不成环**）：
 *   那个模块只导出**没有 import 的常量**（`PROTOTYPE_HTML_SKELETON` / `prototypeIndexSkeleton`），
 *   所以本模块 import 它不会与 `prototype-gates → prototype-skeleton → prototype-skeleton-template`
 *   这条链成环。基线**同源**是刻意的：模板改一个字，判据自动跟着改——若另存一份"骨架指纹"，
 *   改模板不改指纹必然漂移（本仓「两份真相」教训）。
 *
 * @module dsh-pmboard/application/internal/prototype-placeholder
 */

/**
 * 骨架**占位标记**（逐字取自 `prototype-skeleton-template.ts` 的骨架正文）。
 *
 * 为什么是"逐字复制"而不是写正则：这些字符串就是模板里真实存在的字面量，
 * 复制一份的代价由 `tests/prototype-placeholder.test.ts` 的"标记必须能在骨架正文里找到"
 * 那条断言兜住——模板改字而这里没跟着改，那条断言先红。
 *
 * 为什么需要它（除相似度之外的第二条判据）：相似度按**行**比，人只要把骨架的
 * 注释块删掉、或把示例区块整段替换成自己的（但结构照抄），单靠相似度就会漏；
 * 占位标记比的是"人有没有留下没填的地方"，两者互为补充、互相独立。
 */
export const SKELETON_PLACEHOLDERS: readonly string[] = [
  '（功能点名）',
  '（界面草图区',
  '（分支：若…则…）',
  '按功能点数量照抄改号',
]

/** 命中原因（两条独立判据；同一次判定可同时命中）。 */
export type PlaceholderHit =
  | { kind: 'marker'; marker: string }
  | { kind: 'similarity'; ratio: number }

/** 判据读数——命中与否都给出（供门禁文案与测试断言，不猜）。 */
export interface PlaceholderReading {
  /** 骨架去重后的非空行里，有多少比例能在本文找到（0..1；空文件 = 0） */
  lineRatio: number
  /** 命中的占位标记原文（未命中 = 空数组） */
  markers: string[]
}

/** 相似度阈值：**严格大于**才命中（`=== 0.90` 不命中，边界可测）。 */
export const SKELETON_SIMILARITY_THRESHOLD = 0.90

/** 占位符归一 + 去缩进的非空行集合。两份都走同一条归一，避免"只归一了一边"。 */
function normalizedLines(html: string): string[] {
  return html
    .replaceAll('{{TITLE}}', 'X').replaceAll('{{REQ_ID}}', 'X').replaceAll('{{DATE}}', 'X')
    .split('\n').map(l => l.trim()).filter(l => l.length > 0)
}

/**
 * 非骨架判据（零 IO、零依赖、不引 HTML parser）。
 *
 * 判据两条，**任一命中即命中**（刻意不合并成一条加权分：两条坏法的补法不同，
 * 分开报才能让人知道该"填内容"还是"换一份"）：
 *   ① 占位标记：正文含 {@link SKELETON_PLACEHOLDERS} 任一项；
 *   ② 相似度：骨架去重非空行被本文覆盖的比例 > {@link SKELETON_SIMILARITY_THRESHOLD}。
 *
 * 返回 `undefined` 的两种情况（**都表示"不判"**，调用方据此放行）：
 *   · 未命中任何一条；
 *   · 模板基线为空串——没有基线时"相似度"无意义，**不发明结论、不假红**。
 *
 * **已知边界（如实记录，不掩盖）**：占位标记只占骨架的少数行。人若把**每一处**
 * 标记字面都换掉、行数与缩进照抄，重合率会掉到 0.870（阈值之下）而漏过。
 * 该读数由 `tests/prototype-placeholder.test.ts` 的一条专门用例锁死——
 * 将来调阈值或改模板时它会先红，逼人重新标定，而不是让边界悄悄漂走。
 *
 * 实测标定（本仓 21 份原型）：骨架档 0.957、真稿档 0.217–0.391，中间**无样本**，
 * 阈值落在峰谷里（不靠调参）。
 */
export function prototypePlaceholderOf(
  html: string,
  skeletonTemplate: string,
): { reading: PlaceholderReading; hits: PlaceholderHit[] } | undefined {
  const baseline = [...new Set(normalizedLines(skeletonTemplate))]
  if (baseline.length === 0) return undefined // 基线不可得 ⇒ 不判
  const markers = SKELETON_PLACEHOLDERS.filter(m => html.includes(m))
  const present = new Set(normalizedLines(html))
  const covered = baseline.filter(l => present.has(l)).length
  const lineRatio = covered / baseline.length
  const hits: PlaceholderHit[] = [
    ...markers.map(m => ({ kind: 'marker' as const, marker: m })),
  ]
  if (lineRatio > SKELETON_SIMILARITY_THRESHOLD) hits.push({ kind: 'similarity', ratio: lineRatio })
  return hits.length === 0 ? undefined : { reading: { lineRatio, markers }, hits }
}
