/**
 * 项目身份判定的**唯一口径**（REQ-261005141830-7a3b t1 · serves: FR-2, FR-3, FR-4）。
 *
 * 本模块回答三个问题，且全仓只在这里回答：
 *
 * ```
 *   projectIdOfWindow(registry, sessionId)  →  session → projectId      （N : 1）
 *   rootOfProject(registry, projectId)      →  projectId → workspaceRoot（1 : 1）
 *   sameProjectOf(a, b)                     →  这两个东西是不是同一个项目
 * ```
 *
 * 三条纪律（与 `docs/requirements/REQ-261005141830-7a3b/design/data-model.md` 逐条对齐）：
 *   ① **缺失不猜**：注册表拿不到、条目缺失、`path` 为空，一律返回 `undefined`
 *      ——绝不用"当前项目"当默认值（那正是历史跨项目污染的来源）。
 *   ② **判据优先级写死**：两侧都有 `projectId` 就比 id（根不参与比较，同 id 必然同根）；
 *      任一侧缺 id 才退回路径形状比较，且 `attributed=false` 要求调用方如实标注。
 *   ③ **零 I/O、零框架依赖**：application 层禁 import 宿主包与 `node:`
 *      （注册表访问在 `adapters/WorkspaceRegistryProjectPort.ts`，realpath 解算器由调用方注入）。
 *
 * @module dsh-pmboard/application/internal/project-identity
 */
import type { ProjectEntry } from '../ports.js'
import { normalizeProjectRoot, sameProjectRoot } from './project-root.js'

/** 本次判定用了哪个判据（进回执 / 评论 / 日志，现场一眼看出）。 */
export type ProjectSource = 'project-id' | 'path-fallback'

/** 「是不是同一个项目」的判定结果。 */
export interface SameProjectVerdict {
  /** 是否判为同一个项目。 */
  same: boolean
  /**
   * true = 判据来自项目 id（可靠判据）；false = 走了路径兜底
   * ——**调用方必须把这个标注向外说出去**（回执 / 评论 / 日志），不得静默放行。
   */
  attributed: boolean
  /** 实际使用的判据。 */
  by: ProjectSource
}

/**
 * 会话 → 项目 id（**N : 1**：同一项目可以开多个窗口；窗口不唯一标识项目）。
 *
 * 命中 `sessionIds` 含该会话且 id 非空的条目即返回；未装配 / 未命中 → `undefined`。
 * 刻意**不做**"找不到就用路径猜"——猜是调用方的事，且必须带标注（见 `sameProjectOf`）。
 *
 * ⚠️ 歧义即拒（复核 t1 时补）：同一会话被**两个不同的项目**同时认领，是宿主注册表自身不一致。
 * 此时返回 `undefined`（不猜、不取第一个）——"随便挑一个"正是跨项目污染最隐蔽的入口：
 * 挑错了不会报错，只会让后续每一次判定都站在错项目上。
 */
export function projectIdOfWindow(
  registry: readonly ProjectEntry[] | undefined,
  sessionId: string,
): string | undefined {
  if (registry === undefined) return undefined
  if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined
  let found: string | undefined
  for (const entry of registry) {
    if (!entry.sessionIds.includes(sessionId)) continue
    if (typeof entry.id !== 'string' || entry.id.length === 0) continue
    if (found === undefined) { found = entry.id; continue }
    if (found !== entry.id) return undefined
  }
  return found
}

/**
 * 项目 id → 项目根（**1 : 1**：根挂在项目上，与 id 是同一条目上的两个字段）。
 *
 * 「有 id 无根」= 不可用（返回 `undefined`，由调用方回落记录自带路径并标注），
 * 因为"知道是哪个项目却不知道它在哪"没法定位任何文件，编一个根比返回 `undefined` 危险得多。
 */
export function rootOfProject(
  registry: readonly ProjectEntry[] | undefined,
  projectId: string,
): string | undefined {
  if (registry === undefined) return undefined
  if (typeof projectId !== 'string' || projectId.length === 0) return undefined
  for (const entry of registry) {
    if (entry.id !== projectId) continue
    const raw = typeof entry.path === 'string' ? entry.path.trim() : ''
    const root = normalizeProjectRoot(raw)
    return root.length > 0 ? root : undefined
  }
  return undefined
}

/**
 * 「是不是同一个项目」——**全仓唯一判据**。
 *
 * 判定顺序（**顺序即语义**）：
 *   1. 两侧都有 `projectId` → 比 id 相等（`by='project-id'`，`attributed=true`）；
 *   2. 任一侧缺 `projectId` → 比路径形状（`sameProjectRoot`，`by='path-fallback'`，`attributed=false`）；
 *   3. 两侧都缺且路径也无法比较 → `same=false`（**不猜**"是同一项目"）。
 */
export function sameProjectOf(
  a: { projectId?: string; workspaceRoot?: string } | undefined,
  b: { projectId?: string; workspaceRoot?: string } | undefined,
  realpath?: (p: string) => string,
): SameProjectVerdict {
  const idA = a?.projectId
  const idB = b?.projectId
  if (isNonEmpty(idA) && isNonEmpty(idB)) {
    return { same: idA.trim() === idB.trim(), attributed: true, by: 'project-id' }
  }
  const rootA = a?.workspaceRoot
  const rootB = b?.workspaceRoot
  if (isNonEmpty(rootA) && isNonEmpty(rootB)) {
    // 两侧先去空白再比（纯空白路径在上一步已被判为"没有值"）；其余形状归一等 `sameProjectRoot`
    return { same: sameProjectRoot(rootA.trim(), rootB.trim(), realpath), attributed: false, by: 'path-fallback' }
  }
  return { same: false, attributed: false, by: 'path-fallback' }
}

/** 有值才敢当判据：`undefined` / 空串 / 纯空白都不算有值。 */
function isNonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}
