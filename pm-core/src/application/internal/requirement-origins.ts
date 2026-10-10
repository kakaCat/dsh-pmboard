/**
 * 归档条来源三态派生（REQ-261006201841-944d t8 · serves: FR-7）。
 *
 * ## 为什么单独一个模块（而不是写在路由里）
 *
 * 「这条需求属于本仓 / 在别处 / 归属未知」是**一个判据**，而它要被 HTTP 载荷（`/state` 的 `origins`）
 * 与测试同时消费。写在 `http/routers/stages.ts` 里就等于把判据钉在一个不好单测的位置上，
 * 且离「客户端零判断逻辑」这条纪律（D-4：客户端不得比较路径字符串）只差一次顺手复制。
 * 故这里只留**纯函数**：路由一次调用拿到整份 `Record<reqId, RequirementOrigin>`。
 *
 * ## 判据（顺序即语义，与 `design/interfaces.md` I-8 的规则表逐条对齐）
 *
 * | 条件 | `kind` |
 * |---|---|
 * | `rootOfRequirement` 解析成功 且 `sameProjectRoot(该根, 当前 docs 根)` 为真 | `local` |
 * | 解析成功但不同项目 | `elsewhere` |
 * | 解析不出（`undefined`） | `unknown`（**不冒充 local**，`root` 键不下发） |
 *
 * 取根与同项目判定**都走既有的单点**（`support.rootOfRequirement` / `project-root.sameProjectRoot`）：
 * 本模块不新增任何路径字符串比较（不得出现 `startsWith` / 字面量相等形态的项目判定）。
 *
 * ## 键的有无（缺失 ≠ 值）
 *
 * · `root` / `projectName`：解析成功才有；`unknown` 时**不发 `root` 键**（编不出来就不编）。
 * · `projectId`：只有**项目表命中**（`by='project-id'`）才带——与 data-model 的
 *   「目标项目 id（项目表命中时才有）」同口径，不拿记录自报的 id 冒充权威归属。
 * · `by`：`'project-id' | 'path-fallback' | 'unknown'`（与 `RootJudgement` 同值域）。
 *
 * @module dsh-pmboard/application/internal/requirement-origins
 */
import { rootOfRequirement, type WorkspaceRootTargets } from './support.js'
import { sameProjectRoot } from './project-root.js'

/** 来源三态。`unknown` = 既无 `projectId` 也无 `workspaceRoot`（存量）——**不许冒充本仓**。 */
export type OriginKind = 'local' | 'elsewhere' | 'unknown'

/** 判据来源（与 `support.ResolvedRequirementRoot['by']` 同源同值；解析不出时是 `'unknown'`）。 */
export type OriginJudgement = 'project-id' | 'path-fallback' | 'unknown'

/** 单条需求的来源读数（形状逐字对齐 `design/interfaces.md` I-8）。 */
export interface RequirementOrigin {
  readonly kind: OriginKind
  /** 目标项目 id（项目表命中时才有）。 */
  readonly projectId?: string
  /** 目标项目名（= 该需求生效根的目录末段名；解析成功即给出）。 */
  readonly projectName?: string
  /** 判据来源，进诊断。 */
  readonly by?: OriginJudgement
  /** 该需求的生效根（服务端派生的绝对路径；`unknown` 时**不发该键**）。 */
  readonly root?: string
}

/**
 * 派生入参的最小面：只要这三个字段。
 *
 * `RequirementSummary` 天然满足本形状（FR-10 起摘要自带 `projectId` / `workspaceRoot`）——
 * 故路由**不必**为派生再 `st.get()` 回读全文（有界：只对本页 ≤ limit 条算，零额外读盘）。
 */
export interface OriginSubject {
  readonly id: string
  readonly projectId?: string
  readonly workspaceRoot?: string
}

/**
 * **单条**需求的来源三态（判据唯一实现）。
 *
 * @param deps        取根依赖面（必须带 `projectRegistry` 才能走 `project-id` 判据；缺则路径兜底）
 * @param record      需求摘要（读 `projectId` / `workspaceRoot`）
 * @param currentRoot 本次请求的 docs 根（`resolveDocRoot(...).root`）——「本仓」的参照点
 * @param realpath    可选的软链解算器（application 层不许 IO，由调用方注入）
 */
export function requirementOriginOf(
  deps: WorkspaceRootTargets,
  record: OriginSubject,
  currentRoot: string,
  realpath?: (p: string) => string,
): RequirementOrigin {
  const resolved = rootOfRequirement(deps, record)
  // 解析不出：如实报「归属未知」，且**不带 root 键**（不带一个编出来的根）。
  if (resolved === undefined) return { kind: 'unknown', by: 'unknown' }
  const kind: OriginKind = sameProjectRoot(resolved.root, currentRoot, realpath) ? 'local' : 'elsewhere'
  // 归属 id 只在**项目表命中**时下发（`by='project-id'` 蕴含 record.projectId 非空，这里再判一次形态）。
  const declaredId = typeof record.projectId === 'string' ? record.projectId.trim() : ''
  return {
    kind,
    ...(resolved.by === 'project-id' && declaredId.length > 0 ? { projectId: declaredId } : {}),
    projectName: lastSegmentOf(resolved.root),
    by: resolved.by,
    root: resolved.root,
  }
}

/**
 * **本页**需求的来源读数（键 = 需求 id；一页一条，条数 = 入参条数 ≤ limit）。
 *
 * 逐条都出键（含 `unknown`）：客户端「缺该 req 键 → 不渲染标注」是**旧服务端**的降级口径，
 * 不是本服务端表达 `unknown` 的方式——`unknown` 必须是一等三态（可读文本有别于 `local`）。
 */
export function requirementOriginsOf(
  deps: WorkspaceRootTargets,
  records: readonly OriginSubject[],
  currentRoot: string,
  realpath?: (p: string) => string,
): Record<string, RequirementOrigin> {
  const out: Record<string, RequirementOrigin> = {}
  for (const record of records) out[record.id] = requirementOriginOf(deps, record, currentRoot, realpath)
  return out
}

/**
 * 根的**目录末段名**（人扫读用的项目名）。
 *
 * 为什么不用 `node:path.basename`：application 层禁 `node:`（layer-boundary），
 * 且这里只是取末段，纯字符串足够（形状归一与 `normalizeProjectRoot` 同款：反斜杠 → 正斜杠、去尾斜杠）。
 */
function lastSegmentOf(root: string): string {
  const normalized = root.replace(/\\/g, '/')
  const trimmed = normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized
  const cut = trimmed.lastIndexOf('/')
  const segment = cut >= 0 ? trimmed.slice(cut + 1) : trimmed
  return segment.length > 0 ? segment : trimmed
}
