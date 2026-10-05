/**
 * 归档清单**受控补录**用例（REQ-261004183621-de3f t3 / FR-4）。
 *
 * 为什么需要：归档清单一旦提交就成了历史记录，而"清单漏了几份"是**事后**才发现的
 * （实测：REQ-261004174324-4195 归档后才发现 88 份未列，此时需求已 archived、
 * 想补录被"冷侧只读"挡下——警告成了永久留痕、无法补救）。
 *
 * 三条硬口径：
 *   ① **只追加**：不提供删除/修改入口（历史不可改写）——与 `AmendTaskRefs` 的全量替换语义刻意不同；
 *   ② **幂等**：已列 path 进 `skipped`，且**不写盘、不留空留痕**；
 *   ③ **只碰清单**：不改产物文件、不改 `merged_into` / `manual_updates` / 需求状态。
 *
 * 单一写入口：工具 `reqboard_archive_amend` 与看板路由**共用本用例**。
 *
 * @module dsh-pmboard/application/use-cases/AmendArchiveManifest
 */
import type { UseCaseDeps } from '../ports.js'
import { requirementStoreOf, mutateIfPresent } from './queue-access.js'
import { normalizeText } from '../../shared/protocol.js'
import { agentIdFromExec, reject, requireLiveDriver } from '../internal/support.js'

/** 归档清单条目的合法 kind（与 `submitArchive` 同一枚举）。 */
const KINDS = ['requirement', 'plan', 'verification', 'retro', 'notes'] as const
type DocKind = (typeof KINDS)[number]

export interface AmendArchiveManifestInput {
  requirementId?: string
  docs: Array<{ kind: DocKind; path: string }>
  reason: string
}

export interface AmendArchiveManifestResult {
  requirement_id: string
  /** 本次真正追加的路径（按传入顺序）。 */
  appended: string[]
  /** 已存在（幂等跳过）的路径。 */
  skipped: Array<{ path: string; reason: 'already-listed' }>
  status: string
  note: string
}

/**
 * 追加归档清单条目（幂等）。
 *
 * 拒绝条件（都写清原因，不静默）：需求不在归档态 / 尚未提交归档材料 / 本窗口无此需求 /
 * docs 非法（kind、path、条数）/ reason 为空。
 */
export async function amendArchiveManifest(
  deps: UseCaseDeps,
  args: unknown,
  exec: unknown,
): Promise<AmendArchiveManifestResult> {
  const windowKey = agentIdFromExec(deps, exec)
  requireLiveDriver(deps, exec)
  const a = (args ?? {}) as { requirement_id?: unknown; docs?: unknown; reason?: unknown }
  const explicitId = normalizeText(a.requirement_id, 'requirement_id', 64)
  const reason = normalizeText(a.reason, 'reason', 500)
  if (reason.length === 0) reject('reqboard_archive_amend 未执行：reason 不能为空（补录必须写理由）', 'REQBOARD_INVALID_INPUT')
  if (!Array.isArray(a.docs) || a.docs.length === 0) {
    reject('reqboard_archive_amend 未执行：docs 必须是非空数组', 'REQBOARD_INVALID_INPUT')
  }
  const incoming = (a.docs as unknown[]).map(d => {
    const o = (typeof d === 'object' && d !== null ? d : {}) as Record<string, unknown>
    const path = normalizeText(o.path, 'docs[].path', 400)
    const rawKind = typeof o.kind === 'string' ? o.kind : ''
    const kind = (KINDS as readonly string[]).includes(rawKind) ? (rawKind as DocKind) : undefined
    if (kind === undefined) reject('reqboard_archive_amend 未执行：docs[].kind 必须是 ' + KINDS.join(' / '), 'REQBOARD_INVALID_INPUT')
    if (path.length === 0) reject('reqboard_archive_amend 未执行：docs[].path 不能为空', 'REQBOARD_INVALID_INPUT')
    return { kind, path }
  })
  if (incoming.length > 200) reject('reqboard_archive_amend 未执行：docs 过多（≤200）', 'REQBOARD_INVALID_INPUT')

  const mine = (await requirementStoreOf(deps).listSummaries({ sourceSessionId: windowKey, scope: 'all' })).items
  if (mine.length === 0) {
    // 给准确病因：需求存在、只是不属于本窗口（比"本窗口没有需求"有用得多）
    if (explicitId.length > 0) {
      const other = await requirementStoreOf(deps).get(explicitId)
      if (other !== undefined) {
        reject('reqboard_archive_amend 未执行：需求 ' + explicitId + ' 不是本窗口的需求（它绑定在另一个窗口）', 'REQBOARD_NOT_BOUND_TO_WINDOW')
      }
    }
    reject('reqboard_archive_amend 未执行：本窗口没有需求', 'REQBOARD_NO_BOUND_REQ')
  }
  const target = explicitId.length > 0
    ? mine.find(r => r.id === explicitId)
    : [...mine].sort((x, y) => y.updatedAt - x.updatedAt)[0]
  if (target === undefined) {
    reject('reqboard_archive_amend 未执行：需求 ' + explicitId + ' 不是本窗口的需求', 'REQBOARD_NOT_BOUND_TO_WINDOW')
  }
  // 读全文（摘要里没有 archive 记录本体）
  const full = await requirementStoreOf(deps).get(target.id)
  if (full === undefined) reject('reqboard_archive_amend 未执行：需求 ' + target.id + ' 读不到', 'REQBOARD_STORE_INCONSISTENT')
  if (full.status !== 'archived' && full.status !== 'done') {
    reject(
      'reqboard_archive_amend 未执行：需求处于 ' + full.status + '，只有已归档（archived）或历史完成（done）的需求才能补录清单',
      'REQBOARD_BAD_STATUS',
    )
  }
  const archive = full.archive
  if (archive === undefined) {
    reject('reqboard_archive_amend 未执行：需求 ' + target.id + ' 尚未提交归档材料（先 reqboard_submit kind=archive）', 'REQBOARD_INVALID_INPUT')
  }

  // 幂等：已列（含本批内重复）→ skipped，按传入顺序保序
  const existing = new Set(archive.docs.map(d => d.path))
  const appended: Array<{ kind: DocKind; path: string }> = []
  const skipped: Array<{ path: string; reason: 'already-listed' }> = []
  for (const d of incoming) {
    if (existing.has(d.path)) { skipped.push({ path: d.path, reason: 'already-listed' }); continue }
    existing.add(d.path)
    appended.push(d)
  }
  if (appended.length === 0) {
    return {
      requirement_id: target.id, appended: [], skipped, status: full.status,
      note: '全部条目已在清单里（幂等：未写盘、未留痕）',
    }
  }

  const nowTs = deps.clock.now()
  await mutateIfPresent(requirementStoreOf(deps), target.id, (req) => {
    if (req.archive === undefined) return { changed: false }
    req.archive.docs = [...req.archive.docs, ...appended]
    req.archive.amendments = [
      ...(req.archive.amendments ?? []),
      { docs: appended, reason, at: nowTs, by: { kind: 'agent', sessionId: windowKey } },
    ]
    // 对账结果的 listed 同步（数据契约：listed === docs 的 path 集合；否则字段会自相矛盾）
    if (req.archive.reconcile !== undefined) {
      req.archive.reconcile.listed = req.archive.docs.map(d => d.path)
    }
    req.comments.push({
      id: deps.ids.comment(),
      body: '[归档·补录] 清单追加 ' + String(appended.length) + ' 条（原 ' + String(archive.docs.length) + ' 条）：'
        + appended.slice(0, 8).map(d => d.kind + '=' + d.path).join('；') + (appended.length > 8 ? ' 等' : '')
        + '\n原因：' + reason,
      createdAt: nowTs,
      createdBy: { kind: 'agent', sessionId: windowKey },
    })
    req.updatedAt = nowTs
    req.updatedBy = { kind: 'agent', sessionId: windowKey }
    return { changed: true }
  })

  return {
    requirement_id: target.id,
    appended: appended.map(d => d.path),
    skipped,
    status: full.status,
    note: '清单已追加（只追加，不改写历史条目）；需求状态与产物文件未改动',
  }
}
