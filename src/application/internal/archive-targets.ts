/**
 * 归档目标**事实判定**（REQ-261006201841-944d t2 / FR-1、FR-2）——「合并去向与说明书更新点
 * 指向的东西，磁盘上到底在不在」。
 *
 * ## 为什么单独一个模块
 *
 * 形态判定（`shared/protocol.assertArchiveMaterials`，零 IO）只回答「写得对不对」；本模块回答
 * 「在不在」。改造前**只有前者**：`target.startsWith(prefix)` 是唯一判据，`existsSync` 在
 * `SubmitArchive` 里零命中——于是「申报的架构文档从未落盘」也能归档成功。实测两条真失效：
 * `REQ-260929184406-2084` 申报的 `docs/architecture/pm-toolview-visualization.md` 从未存在；
 * `REQ-260929195829-6e02` 申报的 `docs/architecture/实施链调度.md` 不存在，而它描述的机制
 * 好好活在源码里（`src/application/internal/advance-select.ts`）——「代码在，文档从未落盘」。
 *
 * ## 三条纪律
 *
 * ① **按这条需求自己的根判**（D-4）：根一律从 `rootOfRequirement` 取（`projectId` → 项目条目
 *    `path`；缺 id 回落记录自带的 `workspaceRoot`），**禁止**退回路径字符串比较。实测教训：
 *    直接在本仓比会判 15 条失效，按各自 `workspaceRoot` 比只有 2 条真失效。
 * ② **失败即抛，不返回半份结果**：归档是原子承诺，不允许「一半并进去了」。
 * ③ **拒绝消息带三要素**：路径 + 生效根 + 判据来源（`by`）——跨项目场景下不标注就无法解释
 *    「在哪个根上找过」。
 *
 * @module dsh-pmboard/application/internal/archive-targets
 */
import type { UseCaseDeps } from '../ports.js'
import { assertArtifactOpenable } from './design-gates.js'
import { applyRequirementWorkspaceRoot, rootOfRequirement } from './support.js'
import { listHeadingAnchors } from '../../domain/knowledge/slug.js'

/** 根判定来源：与 `ResolvedRequirementRoot.by` 同源同值（不新造词）。 */
export type RootJudgement = 'project-id' | 'path-fallback'

/** 一条合并去向的实测读数。 */
export interface ResolvedMergeTarget {
  /** 归一化后的目标路径（工作区相对）。 */
  readonly path: string
  /** 本次判据使用的生效根（绝对路径）。 */
  readonly root: string
  /** 生效根怎么来的；`unknown` = 记录既无 projectId 也无 workspaceRoot（F-1 兜底态）。 */
  readonly by: RootJudgement | 'unknown'
  /** 存在且字节数 > 0。 */
  readonly ok: boolean
  /** 实测字节数；不存在 → undefined（**缺失 ≠ 0**）。 */
  readonly bytes?: number
  /** 未通过时的原因；通过 → undefined。 */
  readonly reason?: 'missing' | 'empty'
}

/** 一条说明书更新点锚点的实测读数。 */
export interface ResolvedManualAnchor {
  /** `#` 前的路径部分。 */
  readonly path: string
  /** `#` 后的锚点。 */
  readonly anchor: string
  readonly ok: boolean
  /** 未通过时的原因；通过 → undefined。 */
  readonly reason?: 'path-missing' | 'path-empty' | 'anchor-missing'
}

/** 本次判定用的生效根与逐条读数（进回执、拒绝消息与 `archive.md` 渲染）。 */
export interface ArchiveTargetsReport {
  /** 实际用于探测的根（绝对路径）。 */
  readonly root: string
  readonly by: RootJudgement | 'unknown'
  /** false = 判据不是项目身份给出的权威值，调用方必须如实向外标注。 */
  readonly attributed: boolean
  readonly mergedInto: readonly ResolvedMergeTarget[]
  readonly manualAnchors: readonly ResolvedManualAnchor[]
}

/** 拒绝信封（与 `support.reject` 同款：消息自带 code 文本）。 */
function rejectTarget(message: string, code: string): never {
  throw Object.assign(new Error(message + '（' + code + '）'), { code })
}

/** 三要素尾巴：路径 + 生效根 + 判据来源——跨项目场景下不写清就无法复盘「在哪个根上找过」。 */
function where(by: RootJudgement | 'unknown', root: string): string {
  return '（生效根 ' + root + '，判据来源 by=' + by + '）'
}

/**
 * 把既有 `assertArtifactOpenable` 的拒绝**补上三要素尾巴**再抛（保留原 code）。
 *
 * 为什么不能直接让它抛：那条消息是好消息（含 normalized 路径与补齐指引），但它不知道
 * 「这条需求的根在哪、判据是什么」——跨项目场景下缺这两项就无法解释「为什么在这里找不到」。
 * 尾插而不是重写：既有文案逐字保留（它还带着 `（CODE）` 后缀，先剥掉再按统一位置重排）。
 */
function rethrowWithWhere(err: unknown, by: RootJudgement | 'unknown', root: string): never {
  const e = err as Error & { code?: string }
  const code = e.code ?? 'REQBOARD_FILE_MISSING'
  const base = String(e.message ?? err).replace(new RegExp('（' + code + '）\\s*$'), '')
  throw Object.assign(new Error(base + where(by, root) + '（' + code + '）'), { code })
}

/**
 * 归档目标可打开性（闸 1 / 闸 2 的事实判定）。
 *
 * **失败语义**：任一目标不通过即抛（`REQBOARD_FILE_MISSING` / `REQBOARD_ARTIFACT_NOT_OPENABLE`
 * 复用既有码；「存在但是空文件」与「锚点不存在」用既有 `REQBOARD_INVALID_INPUT`），
 * 消息必含 **路径 + 生效根 + 判据来源 + 原因**。
 *
 * **根由本函数自己校正**（内部调 `applyRequirementWorkspaceRoot`，幂等）：调用方即使忘了先校正，
 * 本函数也不会去错误的目录上判——少一个顺序陷阱。调用方若要在此之前读盘，仍应自己先校正。
 */
export async function assertArchiveTargetsOpenable(
  deps: Pick<UseCaseDeps, 'docs'> & Pick<Partial<UseCaseDeps>, 'projectRegistry'>,
  record: { projectId?: string; workspaceRoot?: string },
  inputs: { mergedInto: readonly string[]; manualAnchors: readonly { path: string; anchor: string }[] },
): Promise<ArchiveTargetsReport> {
  // ① 校正根（幂等）：与全仓 27 个调用点同一条链——`projectId` → 项目条目 path，缺则记录自带 workspaceRoot。
  applyRequirementWorkspaceRoot(deps, record)
  const resolved = rootOfRequirement(deps, record)
  const by: RootJudgement | 'unknown' = resolved?.by ?? 'unknown'
  const root = deps.docs.workspaceRoot()
  const attributed = resolved?.attributed ?? false

  // ② 合并去向：形态（伪路径/越界/不存在）走既有 assertArtifactOpenable，非空另判。
  const mergedInto: ResolvedMergeTarget[] = []
  for (const raw of inputs.mergedInto) {
    let path: string
    try {
      path = assertArtifactOpenable(deps.docs, raw) // 不存在/越界 → 补三要素尾巴后抛（保留原码）
    } catch (err) {
      rethrowWithWhere(err, by, root)
    }
    const stat = deps.docs.stat(path)
    if (stat === undefined) {
      // 防御性分支：上一步已对「不存在」抛过。端口实现差异或两步之间发生删除时兜底——
      // 不许当死代码删掉（删了就等于把竞态静默放行）。
      rejectTarget(
        '归档材料被拒：合并去向 ' + path + ' 在本需求的工作区里不存在' + where(by, root)
        + '。补齐：先把结论真的写进那份文档，或改指向已存在的文档',
        'REQBOARD_FILE_MISSING',
      )
    }
    if (stat.size === 0) {
      rejectTarget(
        '归档材料被拒：合并去向 ' + path + ' 是空文件（0 字节）' + where(by, root)
        + '。补齐：空壳文档不算「结论并进去了」——把内容写进去，或改指向有内容的文档',
        'REQBOARD_INVALID_INPUT',
      )
    }
    mergedInto.push({ path, root, by, ok: true, bytes: stat.size })
  }

  // ③ 说明书更新点：路径存在且非空 + 锚点在该文档的标题锚点集合里。
  const manualAnchors: ResolvedManualAnchor[] = []
  for (const { path, anchor } of inputs.manualAnchors) {
    let doc: string
    try {
      doc = assertArtifactOpenable(deps.docs, path)
    } catch (err) {
      rethrowWithWhere(err, by, root)
    }
    const stat = deps.docs.stat(doc)
    if (stat === undefined) {
      rejectTarget(
        '归档材料被拒：说明书更新点的文档 ' + doc + ' 不存在' + where(by, root)
        + '。补齐：改指向已存在的文档（锚点写进 path 的意义就是让这一条可复核）',
        'REQBOARD_FILE_MISSING',
      )
    }
    if (stat.size === 0) {
      rejectTarget(
        '归档材料被拒：说明书更新点的文档 ' + doc + ' 是空文件（0 字节）' + where(by, root)
        + '。补齐：先把要申报的那一节真的写进去',
        'REQBOARD_INVALID_INPUT',
      )
    }
    const anchors = listHeadingAnchors(await deps.docs.read(doc)).map(h => h.anchor)
    if (!anchors.includes(anchor)) {
      rejectTarget(
        '归档材料被拒：说明书更新点的锚点 #' + anchor + ' 在 ' + doc + ' 里不存在'
        + where(by, root) + '。补齐：锚点必须命中该文档真实存在的标题（文档改名后要跟着改）；'
        + '当前该文档可用锚点样例：' + anchors.slice(0, 5).join(' / ') + (anchors.length > 5 ? ' …' : ''),
        'REQBOARD_INVALID_INPUT',
      )
    }
    manualAnchors.push({ path: doc, anchor, ok: true })
  }

  return { root, by, attributed, mergedInto, manualAnchors }
}

/**
 * 把 `manual_updates[].path` 的 `路径#锚点` 形态拆成两段（形态已由 `assertArchiveMaterials` 判过；
 * 这里只做拆分，不做判定）。拆不出两段 → 返回 undefined（调用方按「形态不合法」处置，不猜）。
 */
export function splitManualAnchor(path: string): { path: string; anchor: string } | undefined {
  const parts = path.trim().split('#')
  if (parts.length !== 2) return undefined
  const p = parts[0]!.trim()
  const a = parts[1]!.trim()
  if (p.length === 0 || a.length === 0) return undefined
  return { path: p, anchor: a }
}
