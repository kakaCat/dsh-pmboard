/**
 * SubmitArchive 用例（REQ-47939a t6）——从 host/agent-tools.ts 的 defineArchiveSubmitTool / reqboard_archive_submit 工厂**逐字搬入**编排。
 *
 * 零行为变更：拒绝条件、错误码与消息文案与搬迁前一致；规则仍单点于 domain/。
 *
 * @module dsh-pmboard/application/use-cases/SubmitArchive
 */
import type { UseCaseDeps } from '../ports.js'
import { requirementStoreOf, mutateIfPresent } from './queue-access.js'
import {
  ARCHIVE_DOC_RULES,
  assertArchiveMaterials,
  normalizeText,
} from '../../shared/protocol.js'
import { depositArchiveKnowledge } from './DepositKnowledge.js'
import { registerArtifact } from '../internal/artifact-gates.js'
import { assertArtifactOpenable } from '../internal/content-gate-wiring.js'
// REQ-261004183621-de3f t2：归档清单对账（豁免规则单点在 domain）
import { matchArchiveExemption } from '../../domain/requirement/archive-exemptions.js'
import {
  reject,
  agentIdFromExec,
  requireLiveDriver,
} from '../internal/support.js'

export async function submitArchive(deps: UseCaseDeps, args: unknown, exec: any): Promise<unknown> {
      const windowKey = agentIdFromExec(deps, exec)
      requireLiveDriver(deps, exec)
      const a = (args ?? {}) as {
        requirement_id?: unknown
        dir?: unknown
        docs?: unknown
        merged_into?: unknown
        index_entry?: unknown
        manual_updates?: unknown
        manual_note?: unknown
      }
      const explicitId = normalizeText(a.requirement_id, 'requirement_id', 64)
      const dir = normalizeText(a.dir, 'dir', 400)
      const indexEntry = normalizeText(a.index_entry, 'index_entry', 1000)
      const kinds = ['requirement', 'plan', 'verification', 'retro', 'notes'] as const
      if (!Array.isArray(a.docs)) reject('reqboard_archive_submit 未执行：docs 必须是数组', 'REQBOARD_INVALID_INPUT')
      const docs = (a.docs as unknown[]).map(d => {
        const o = (typeof d === 'object' && d !== null ? d : {}) as Record<string, unknown>
        const path = normalizeText(o.path, 'docs[].path', 400)
        const rawKind = typeof o.kind === 'string' ? o.kind : ''
        const kind = (kinds as readonly string[]).includes(rawKind) ? (rawKind as (typeof kinds)[number]) : undefined
        if (kind === undefined) {
          reject('reqboard_archive_submit 未执行：docs[].kind 必须是 ' + kinds.join(' / '), 'REQBOARD_INVALID_INPUT')
        }
        if (path.length === 0) reject('reqboard_archive_submit 未执行：docs[].path 不能为空', 'REQBOARD_INVALID_INPUT')
        return { kind, path }
      })
      if (!Array.isArray(a.merged_into)) {
        reject('reqboard_archive_submit 未执行：merged_into 必须是数组', 'REQBOARD_INVALID_INPUT')
      }
      const mergedInto = (a.merged_into as unknown[])
        .map(m => normalizeText(m, 'merged_into[]', 400))
        .filter(m => m.length > 0)
        .slice(0, 10)
      const manualUpdates = Array.isArray(a.manual_updates)
        ? (a.manual_updates as unknown[]).map(u => {
          const o = (typeof u === 'object' && u !== null ? u : {}) as Record<string, unknown>
          return {
            path: normalizeText(o.path, 'manual_updates[].path', 400),
            section: normalizeText(o.section, 'manual_updates[].section', 200),
            summary: normalizeText(o.summary, 'manual_updates[].summary', 500),
          }
        })
        : []
      const manualNote = normalizeText(a.manual_note, 'manual_note', 500)
      // ── REQ-261004183621-de3f t2：未列文件的**显式豁免声明**（`unlisted_ack`） ──────────
      // 语义：这些文件不进清单，但必须留下理由。覆盖不全 → 拒绝（见下方闸门）。
      const ackRaw = (a as { unlisted_ack?: unknown }).unlisted_ack
      if (ackRaw !== undefined && !Array.isArray(ackRaw)) {
        reject('reqboard_archive_submit 未执行：unlisted_ack 必须是数组', 'REQBOARD_INVALID_INPUT')
      }
      const unlistedAck = (Array.isArray(ackRaw) ? ackRaw : []).map(d => {
        const o = (typeof d === 'object' && d !== null ? d : {}) as Record<string, unknown>
        const path = normalizeText(o.path, 'unlisted_ack[].path', 400)
        const reason = normalizeText(o.reason, 'unlisted_ack[].reason', 200)
        if (path.length === 0) reject('reqboard_archive_submit 未执行：unlisted_ack[].path 不能为空', 'REQBOARD_INVALID_INPUT')
        if (reason.length === 0) reject('reqboard_archive_submit 未执行：unlisted_ack[].reason 不能为空（豁免必须写理由）', 'REQBOARD_INVALID_INPUT')
        return { path, reason }
      })
      if (unlistedAck.length > 200) {
        reject('reqboard_archive_submit 未执行：unlisted_ack 过多（≤200）——这么多文件应当收进 docs 清单', 'REQBOARD_INVALID_INPUT')
      }

      // 归档的对象是**已完成**的需求——它已经不在 open 集合里，所以这里按「本窗口的需求」
      // （sourceSessionId 锚点）判定，而不是按 open 判定（否则归档永远找不到自己的需求）。
      // t8/B11：该读只按 sourceSessionId 过滤（注释明说“不按 open 判定”）⇒ 正好是新端口的过滤维度
      const mine = (await requirementStoreOf(deps).listSummaries({ sourceSessionId: windowKey, scope: 'all' })).items
      if (mine.length === 0) reject('reqboard_archive_submit 未执行：本窗口没有需求', 'REQBOARD_NO_BOUND_REQ')
      const target = explicitId.length > 0
        ? mine.find(r => r.id === explicitId)
        : [...mine].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      if (target === undefined) {
        reject('reqboard_archive_submit 未执行：需求 ' + explicitId + ' 不是本窗口的需求', 'REQBOARD_NOT_BOUND_TO_WINDOW')
      }
      const actual = target
      // REQ-9f4a44：验收通过即 archived（归档自动化）——材料在 archived 下补齐；
      // `done` 为 legacy 兼容（历史需求仍可补材料，不被卡死）。
      if (actual.status !== 'archived' && actual.status !== 'done') {
        reject(
          'reqboard_archive_submit 未执行：需求处于 ' + actual.status
          + '，只有已归档（archived）或历史完成（done）的需求才能备归档材料',
          'REQBOARD_BAD_STATUS',
        )
      }
      try {
        assertArchiveMaterials(actual.category, {
          dir, docs, mergedInto, indexEntry,
          ...(manualUpdates.length > 0 ? { manualUpdates } : {}),
          ...(manualNote.length > 0 ? { manualNote } : {}),
        })
      } catch (err) {
        reject('reqboard_archive_submit 未执行：' + ((err as Error).message ?? String(err)), 'REQBOARD_INVALID_INPUT')
      }
      // REQ-2d1c74 FR-5：归档目录与清单内文档登记前可打开性校验——
      // 不存在的目录/文档路径当场拒（REQBOARD_FILE_MISSING），伪路径/越界报 REQBOARD_ARTIFACT_NOT_OPENABLE。
      const openDir = assertArtifactOpenable(deps.docs, dir)
      for (const d of docs) assertArtifactOpenable(deps.docs, d.path)

      // ── REQ-261004183621-de3f t2：对账**前移到写台账之前** ─────────────────────────────
      // 原实现是"先归档、后遍历目录、只警告不拦"（[REQ-2e9473 t12/W4] 的刻意选择：
      // 归档材料可能有意只收关键文档）。本需求把它升级为"对账 + 未列必须处置"：
      // ① 分类三份（已列 / 豁免 / 未列）；② 未列未豁免且未声明 → **当场拒绝（零写入）**。
      // 之所以必须前移：一旦先写了台账再拒绝，就会留下"拒了但已归档"的半截状态。
      // 对账根 = **调用方声明的目录**（`openDir`），而不是硬编码 `docs/requirements/<id>`：
      // 后者在 `agent-dh/docs/requirements/<id>` 这类调用下会遍历一个不存在的目录，
      // 于是"未列"永远为空、闸门形同不存在（实测于既有归档用例的前缀形态）。
      const reconcile = reconcileArchiveDir(deps, openDir, docs)
      const gate = deps.archiveUnlistedGate === 'warn' ? 'warn' : 'enforce'
      {
        const unlistedSet = new Set(reconcile.unlisted)
        for (const ack of unlistedAck) {
          if (!unlistedSet.has(ack.path)) {
            reject(
              'reqboard_archive_submit 未执行：unlisted_ack 里的 ' + ack.path
              + ' 并不在未列集合里（它要么已进清单、要么命中豁免规则）——请核对路径',
              'REQBOARD_INVALID_INPUT',
            )
          }
        }
        if (gate === 'enforce') {
          const acked = new Set(unlistedAck.map(x => x.path))
          const missing = reconcile.unlisted.filter(p => !acked.has(p))
          if (missing.length > 0) {
            reject(
              'reqboard_archive_submit 未执行：目录内还有 ' + String(missing.length) + ' 个文件既未列入清单、也未声明豁免：'
              + missing.slice(0, 8).join('、') + (missing.length > 8 ? ' 等' : '')
              + '。两种处置：① 把它们加进 docs 清单；② 传 unlisted_ack: [{path, reason}] 写明为何不收。'
              + '（工具无法判断哪些文件你有意不收——这是要你显式决定的事）',
              'REQBOARD_UNLISTED_ACK_REQUIRED',
            )
          }
        }
      }

      const nowTs = deps.clock.now()
      // ── 归档即沉淀（REQ-261001110934-3766 t7）：**先沉淀再记录**——写失败即抛错，
      //    避免"台账说归档了、知识层却没有"的半截状态（失败要响亮）。未装配知识层 → 不阻断。
      const deposit = await depositArchiveKnowledge(deps, {
        requirementId: actual.id,
        requirementTitle: actual.title,
        indexEntry,
        mergedInto,
        dir: openDir,
        docKinds: docs.map(d => d.kind),
        archivedOn: new Date(nowTs).toISOString().slice(0, 10),
        hasRetro: docs.some(d => d.kind === 'retro'),
      })
      const knowledgeLine = deposit.deposited
        ? '\n知识层：已沉淀 ' + String(deposit.id) + '（docs/knowledge/entries/' + String(deposit.id) + '.md）'
        : '\n知识层：未沉淀（' + String(deposit.reason ?? '未知原因') + '）'
      const result = await mutateIfPresent(requirementStoreOf(deps), actual.id, (req) => {
        req.archive = {
          dir: openDir, docs, mergedInto, indexEntry,
          ...(manualUpdates.length > 0 ? { manualUpdates } : {}),
          ...(manualNote.length > 0 ? { manualNote } : {}),
          // REQ-261004183621-de3f t2：对账结果落记录（看板与事后复核的查询面；评论只作留痕）
          reconcile: {
            gate,
            listed: reconcile.listed,
            exempted: reconcile.exempted,
            unlisted: reconcile.unlisted,
            acknowledged: unlistedAck,
            at: nowTs,
          },
          submittedAt: nowTs,
          submittedBy: { kind: 'agent', sessionId: windowKey },
        }
        // REQ-9f4a44：材料补齐即归档收尾——写 archivePath（原"人点归档"承担的落章动作）
        if (req.status === 'archived') req.archivePath = openDir
        req.comments.push({
          id: deps.ids.comment(),
          body: '[归档] 材料已备（REQ-9f4a44：验收通过即自动归档，此步为材料补齐）：' + dir
            + '\n文档：' + docs.map(d => d.kind + '=' + d.path).join('；')
            + '\n合并进：' + mergedInto.join('；')
            + '\n索引：' + indexEntry
            + (manualUpdates.length > 0
              ? '\n说明书更新：' + manualUpdates.map(u => u.path + '#' + u.section + '（' + u.summary + '）').join('；')
              : (manualNote.length > 0 ? '\n说明书更新：无（' + manualNote + '）' : ''))
            // REQ-261004183621-de3f FR-5：对账摘要进留痕（人复核时不必回看工具回执）
            + '\n清单对账：已列 ' + String(reconcile.listed.length)
            + ' · 豁免 ' + String(reconcile.exempted.length)
            + ' · 未列 ' + String(reconcile.unlisted.length)
            + '（闸门=' + gate + '）'
            + (unlistedAck.length > 0
              ? '\n已声明不收：' + unlistedAck.slice(0, 8).map(x => x.path + '（' + x.reason + '）').join('；') + (unlistedAck.length > 8 ? ' 等' : '')
              : '')
            + knowledgeLine,
          createdAt: nowTs,
          createdBy: { kind: 'agent', sessionId: windowKey },
        })
        req.updatedAt = nowTs
        req.updatedBy = { kind: 'agent', sessionId: windowKey }
        return { changed: true }
      })
      const changed = result?.requirement
      if (changed === undefined) reject('reqboard_archive_submit 写入失败：台账状态异常', 'REQBOARD_STORE_INCONSISTENT')
      // ── 产物登记（REQ-31e11f t4）：archive 产物 ───────────────────────────
      await mutateIfPresent(requirementStoreOf(deps), changed.id, (r) => {
        registerArtifact(r, {
          stage: 'done', kind: 'archive', path: openDir,
          registeredAt: nowTs, registeredBy: { kind: 'agent', sessionId: windowKey },
        })
        return { changed: true }
      })
      // REQ-261004183621-de3f t2：未列信息改为使用**前面那次对账**的结果（不再第二次遍历——
      // 两次遍历就是两份口径，且第一次已经决定了"能不能提交"）。
      const unlisted = reconcile.unlisted
      return {
        success: true,
        requirement_id: changed.id,
        status: changed.status,
        required_docs: [...(ARCHIVE_DOC_RULES[actual.category ?? 'feature'].requiredDocs)],
        reconcile: {
          gate,
          listed: reconcile.listed,
          exempted: reconcile.exempted,
          unlisted,
          acknowledged: unlistedAck,
        },
        ...(unlisted.length > 0
          ? { unlisted_files: unlisted, warning: '⚠️ 需求目录内有 ' + unlisted.length + ' 个文件未列入归档清单：' + unlisted.slice(0, 8).join('、') + (unlisted.length > 8 ? ' 等' : '') }
          : {}),
        note: '归档材料已备齐并登记（ACCEPT→ARCHIVED 已自动完成，无需人工点归档）'
          + (unlisted.length > 0 ? '；另有 ' + unlisted.length + ' 个目录内文件未列入清单（见 warning/unlisted_files）' : ''),
      }
    }

/**
 * 归档清单对账（REQ-261004183621-de3f t2 / design/architecture.md「对账三分类」）。
 *
 * 三分类：
 *   · **已列**：出现在 `docs` 清单里（同时接受工作区相对与需求目录相对两种写法，沿用原口径）；
 *   · **豁免**：命中 `ARCHIVE_EXEMPTIONS`（工具重建物：`rtm-*.yml` 与 `rtm-*` 目录 / `queue.json` / `state/`）；
 *   · **未列**：两者都不是——**必须由人/agent 显式处置**（收进清单或声明不收并写理由）。
 *
 * 只遍历一次：调用方拿这份结果去做闸门判定、写记录与拼返回体（两次遍历 = 两份口径）。
 */
function reconcileArchiveDir(
  deps: Pick<UseCaseDeps, 'docs'>,
  reqRootRel: string,
  docs: readonly { path: string }[],
): { listed: string[]; exempted: Array<{ path: string; rule: string }>; unlisted: string[] } {
  const listed = docs.map(d => d.path)
  const listedPaths = new Set(listed)
  const exempted: Array<{ path: string; rule: string }> = []
  const unlisted: string[] = []
  const walk = (relDir: string, rel: string): void => {
    // 文档仓储的 list 已吞掉"目录不存在/不可读"（返回 []）——原 try/catch 语义等价。
    for (const entry of deps.docs.list(relDir)) {
      if (entry.name.startsWith('.')) continue
      const relPath = rel.length > 0 ? rel + '/' + entry.name : entry.name
      if (!entry.isFile) { walk(relDir + '/' + entry.name, relPath); continue }
      const workspacePath = reqRootRel + '/' + relPath
      if (listedPaths.has(workspacePath) || listedPaths.has(relPath)) continue
      const rule = matchArchiveExemption(relPath)
      if (rule !== undefined) exempted.push({ path: workspacePath, rule: rule.id })
      else unlisted.push(workspacePath)
    }
  }
  walk(reqRootRel, '')
  return { listed, exempted, unlisted }
}
