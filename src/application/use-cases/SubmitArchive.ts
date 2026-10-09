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
// REQ-261006201841-944d t2（FR-1/FR-2）：归档目标的**事实判定**（存在 / 非空 / 锚点可达）
// + 根校正（按这条需求自己的 workspaceRoot，而不是"最后一次会话残留的根"）。
import { assertArchiveTargetsOpenable, splitManualAnchor } from '../internal/archive-targets.js'
import { applyRequirementWorkspaceRoot } from '../internal/support.js'
// REQ-261004183621-de3f t2：归档清单对账（豁免规则单点在 domain）
import { matchArchiveExemption } from '../../domain/requirement/archive-exemptions.js'
// REQ-261006201841-944d t4（FR-5/FR-6）：归档渲染物——渲染器是 domain 纯函数，
// 幂等比对与机器产物分类的纯函数与它同源（分类只走 ARCHIVE_EXEMPTIONS 一张表）。
import {
  buildMachineGroups,
  renderArchiveManifest,
  stripRenderedAtLines,
  type MachineArtifactReading,
} from '../../domain/requirement/archive-manifest.js'
import {
  reject,
  agentIdFromExec,
  requireLiveDriver,
  // 归档清单是**工作区相对落盘**：写前核验写盘根（根错配即拒，写侧不降级）
  // —— tests/project-scope.test.ts「工作区相对写盘点必须受保护」要求的保护点。
  ensureWritableProjectRoot,
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
          // REQ-261006201841-944d FR-2：锚点写进 path；`section` 是废弃字段——
          // 只在调用方确实写了它时才落库（空串不再进台账，避免"字段在但没意义"的噪声）。
          const legacySection = normalizeText(o.section, 'manual_updates[].section', 200)
          return {
            path: normalizeText(o.path, 'manual_updates[].path', 400),
            ...(legacySection.length > 0 ? { section: legacySection } : {}),
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
      // REQ-261006201841-944d t2（D-4）：**读盘之前**先按这条需求自己的根校正 ——
      // `deps.docs` 是宿主级、跨窗口共享的单例，根会被别的窗口改掉；不校正就会去错误的目录上判
      // （两个相反方向都坏：误拦合法归档，或静默放行不存在的目标）。
      applyRequirementWorkspaceRoot(deps, actual)

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

      // ── REQ-261006201841-944d t2：**闸 1 / 闸 2**（FR-1 / FR-2）──────────────────────────
      // 形态已在 assertArchiveMaterials 判过；这里判事实：合并去向**存在且非空**，
      // 说明书更新点的锚点在该文档的标题锚点集合里。拒绝消息带 路径 + 生效根 + 判据来源 三要素。
      const manualAnchors = manualUpdates
        .map(u => splitManualAnchor(u.path))
        .filter((x): x is { path: string; anchor: string } => x !== undefined)
      let targets: Awaited<ReturnType<typeof assertArchiveTargetsOpenable>>
      try {
        targets = await assertArchiveTargetsOpenable(deps, actual, { mergedInto, manualAnchors })
      } catch (err) {
        // 内层消息已按本仓惯例自带 `（CODE）` 后缀；这里剥掉再由 reject 统一补一次，
        // 否则会出现 `（CODE）（CODE）` 的双后缀（实测过一次，别退回去）。
        const e = err as Error & { code?: string }
        const code = e.code ?? 'REQBOARD_INVALID_INPUT'
        const body = String(e.message ?? err).replace(new RegExp('（' + code + '）\\s*$'), '')
        reject('reqboard_archive_submit 未执行：' + body, code)
      }

      // ── REQ-261006201841-944d t4（FR-5/FR-6）：渲染 `archive.md` 并写盘 ────────────────
      // 次序（设计 backend.md S-5「次序即语义」）：
      //   闸 1/闸 2 → **一次目录遍历** → 渲染 archive.md → docs.write → 补登 docs → 对账 → 沉淀 → 写台账。
      // 三条理由：① 遍历先于写盘——渲染输入里的机器产物读数与对账三分类必须是**同一份观测**
      // （两次遍历 = 两份口径）；② 渲染与写盘都在**唯一那次台账写之前**——失败即整体拒绝、
      // 台账零写入，不会留"台账说归档了、目录里没有"的半截（R-4 / FR-5 验收 3）；
      // ③ `archive.md` 必须在**对账之前**补登清单——它不命中豁免表，不补登就是"自己渲染的文件把自己挡住"。
      const nowTs = deps.clock.now()
      // `archive.md` 是本需求的**结论文件**：进 docs 清单用既有 kind `notes`（B-2：不扩 kind 值域；
      // 也不能塞进豁免表——FR-6 的机器产物分区用的正是同一张表，塞进去会把结论文件折叠成机器产物）。
      const manifestPath = openDir.replace(/\/+$/, '') + '/archive.md'
      const docsWithManifest = docs.some(d => d.path === manifestPath)
        ? docs
        : [...docs, { kind: 'notes' as const, path: manifestPath }]
      const walk = walkArchiveDir(deps, openDir)
      // 机器产物读数：逐路径复用 `matchArchiveExemption`（与对账同一张表，不新写分类规则）。
      const machineReadings: MachineArtifactReading[] = []
      for (const e of walk.entries) {
        const rule = matchArchiveExemption(e.rel)
        if (rule === undefined) continue
        machineReadings.push({
          path: e.rel,
          bytes: e.bytes,
          // 台账镜像才需要摘出"任务数 / 依赖边 / 就绪数 / 生成时间"；读不到 → 按"无法解析"降级
          // （摘要是增益不是判据：坏 JSON 不得让一次合法归档失败）。
          ...(rule.id === 'ledger-mirror' ? { text: await readTextIfPresent(deps, openDir + '/' + e.rel) } : {}),
        })
      }
      let manifestText = ''
      let manifestBytes = 0
      let manifestWritten = false
      try {
        manifestText = renderArchiveManifest({
          requirementId: actual.id,
          title: actual.title,
          category: actual.category ?? 'feature',
          renderedAt: nowTs,
          indexEntry,
          dir: openDir,
          docs: docsWithManifest,
          mergedInto: targets.mergedInto,
          manualUpdates,
          ...(manualNote.length > 0 ? { manualNote } : {}),
          machine: buildMachineGroups(machineReadings),
          listedCount: docsWithManifest.length,
        })
        // **幂等**：剔除由 `renderedAt` 派生的「渲染时刻：」行后逐字节相同 → 不写盘、保留盘上首次时刻。
        // 不许拿整篇字节相等当判据——那样每次提交都因时刻不同而重写，`written=false` 永远拿不到。
        const existing = deps.docs.exists(manifestPath) ? await deps.docs.read(manifestPath) : undefined
        if (existing === undefined || stripRenderedAtLines(existing) !== stripRenderedAtLines(manifestText)) {
          // 写前核验工作区根：错配即拒（异常由本 try 捕获 → 整体拒绝、台账零写入）
          ensureWritableProjectRoot({ docs: deps.docs }, actual)
          await deps.docs.write(manifestPath, manifestText)
          manifestWritten = true
        }
        manifestBytes = new TextEncoder().encode(manifestText).length
      } catch (err) {
        // 渲染失败 / 写盘失败（只读目录、权限）→ **整体拒绝**，台账零写入（异常绝不进入 mutateIfPresent）。
        const e = err as Error & { code?: string }
        const code = typeof e.code === 'string' && e.code.startsWith('REQBOARD_') ? e.code : 'REQBOARD_IO_FAILED'
        reject(
          'reqboard_archive_submit 未执行：归档渲染物写入失败（**台账零写入**，不留半截状态）：'
          + manifestPath + ' —— ' + String(e.message ?? err),
          code,
        )
      }

      // ── REQ-261004183621-de3f t2：对账（三分类 + 未列必须处置），复用上面那一次遍历 ────────
      // 原实现是"先归档、后遍历目录、只警告不拦"（[REQ-2e9473 t12/W4] 的刻意选择：
      // 归档材料可能有意只收关键文档）。本需求把它升级为"对账 + 未列必须处置"：
      // ① 分类三份（已列 / 豁免 / 未列）；② 未列未豁免且未声明 → **当场拒绝（零写入）**。
      // 之所以必须在写台账之前：一旦先写了台账再拒绝，就会留下"拒了但已归档"的半截状态。
      // 对账根 = **调用方声明的目录**（`openDir`），而不是硬编码 `docs/requirements/<id>`：
      // 后者在 `agent-dh/docs/requirements/<id>` 这类调用下会遍历一个不存在的目录，
      // 于是"未列"永远为空、闸门形同不存在（实测于既有归档用例的前缀形态）。
      // 集合口径：`listed ∪ exempted ∪ unlisted = 遍历全集 ∪ {archive.md}`——`archive.md` 要么已在
      // 遍历全集里（二次提交），要么已因补登而计入"已列"（首次提交），两个方向都不落"未列"。
      const reconcile = classifyArchiveDir(walk, openDir, docsWithManifest)
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

      // ── 归档即沉淀（REQ-261001110934-3766 t7）：**先沉淀再记录**——写失败即抛错，
      //    避免"台账说归档了、知识层却没有"的半截状态（失败要响亮）。未装配知识层 → 不阻断。
      const deposit = await depositArchiveKnowledge(deps, {
        requirementId: actual.id,
        requirementTitle: actual.title,
        indexEntry,
        mergedInto,
        dir: openDir,
        docKinds: docsWithManifest.map(d => d.kind),
        archivedOn: new Date(nowTs).toISOString().slice(0, 10),
        hasRetro: docsWithManifest.some(d => d.kind === 'retro'),
      })
      const knowledgeLine = deposit.deposited
        ? '\n知识层：已沉淀 ' + String(deposit.id) + '（docs/knowledge/entries/' + String(deposit.id) + '.md）'
        : '\n知识层：未沉淀（' + String(deposit.reason ?? '未知原因') + '）'
      const result = await mutateIfPresent(requirementStoreOf(deps), actual.id, (req) => {
        req.archive = {
          dir: openDir, docs: docsWithManifest, mergedInto, indexEntry,
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
            + '\n文档：' + docsWithManifest.map(d => d.kind + '=' + d.path).join('；')
            + '\n合并进：' + mergedInto.join('；')
            + '\n索引：' + indexEntry
            + (manualUpdates.length > 0
              ? '\n说明书更新：' + manualUpdates.map(u => manualUpdateLabelOf(u) + '（' + u.summary + '）').join('；')
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
      // REQ-261006201841-944d t4：**先问"这次登记会不会变"，不会变就不 mutate**。
      // 为什么：冷侧只读门（`domain/requirement/ColdWrite`）要求"这次变更真的动了归档收尾的触发键
      // （`archive` / `artifacts`）"才豁免；而"同材料再提一次"（FR-5 验收标准 2）时登记按
      // `stage+kind+path` 幂等命中、什么都不改 ⇒ 空 mutation 被判 `REQBOARD_COLD_IMMUTABLE`，
      // 把一次合法的幂等重提变成硬错误——而且它发生在**首次 mutate 之后**，会留下
      // "台账已改、回执却是错误"的半截。预判用一份克隆跑同款登记（规则仍单点在 `registerArtifact`）。
      const archiveArtifact = {
        stage: 'done' as const,
        kind: 'archive' as const,
        path: openDir,
        registeredAt: nowTs,
        registeredBy: { kind: 'agent' as const, sessionId: windowKey },
      }
      const artifactProbe = { ...changed, artifacts: [...(changed.artifacts ?? [])] } as typeof changed
      if (registerArtifact(artifactProbe, archiveArtifact)) {
        await mutateIfPresent(requirementStoreOf(deps), changed.id, (r) => {
          registerArtifact(r, archiveArtifact)
          return { changed: true }
        })
      }
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
        // REQ-261006201841-944d t2（I-5）：本次判据的生效根与逐条读数——
        // 让人能复核「在哪个根上判的、每条目标多少字节」，而不是只看到一个 success: true。
        resolved_targets: {
          root: targets.root,
          by: targets.by,
          attributed: targets.attributed,
          merged_into: targets.mergedInto.map(t => ({ path: t.path, ok: t.ok, bytes: t.bytes ?? 0 })),
          manual_anchors: targets.manualAnchors.map(t => ({ path: t.path, anchor: t.anchor, ok: t.ok })),
        },
        // REQ-261006201841-944d t4（I-5）：渲染物落点与"本次是否写了盘"——幂等可观测
        // （`written=false` = 内容与盘上一致、未重写；这是 FR-5 验收标准 2 的机器可读读数）。
        archive_manifest: { path: manifestPath, written: manifestWritten, bytes: manifestBytes },
        ...(unlisted.length > 0
          ? { unlisted_files: unlisted, warning: '⚠️ 需求目录内有 ' + unlisted.length + ' 个文件未列入归档清单：' + unlisted.slice(0, 8).join('、') + (unlisted.length > 8 ? ' 等' : '') }
          : {}),
        note: '归档材料已备齐并登记（ACCEPT→ARCHIVED 已自动完成，无需人工点归档）'
          + (unlisted.length > 0 ? '；另有 ' + unlisted.length + ' 个目录内文件未列入清单（见 warning/unlisted_files）' : ''),
      }
    }

/**
 * 说明书更新点的人读标签（REQ-261006201841-944d FR-2）。
 *
 * 新形态下锚点已在 `path` 里，直接用它；**旧形态**（历史台账里 path 不带 `#`）才把 `section`
 * 回落呈现——两者都不得丢信息（存量不可追溯，但必须仍可读）。
 */
function manualUpdateLabelOf(u: { path: string; section?: string }): string {
  if (u.path.includes('#')) return u.path
  const legacy = typeof u.section === 'string' ? u.section.trim() : ''
  return legacy.length > 0 ? u.path + '（旧：' + legacy + '）' : u.path
}

/**
 * 一次目录遍历（REQ-261006201841-944d t4）：**只读一次盘**，供机器产物分区与三分类对账共用。
 *
 * 为什么把"遍历"和"分类"拆开（原先是一个 `reconcileArchiveDir`）：渲染 `archive.md` 要用目录实测
 * 读数（类别 / 数量 / 体积），而渲染发生在**写盘之前**、对账发生在**补登清单之后**——同一份观测
 * 分两步消费，才能既满足次序契约、又避免两次遍历（两次遍历 = 两份口径）。
 */
interface ArchiveDirWalk {
  /** 目录内文件（相对**需求目录**的路径 + 字节数；不含目录项与点开头的隐藏文件）。 */
  readonly entries: ReadonlyArray<{ readonly rel: string; readonly bytes: number }>
}

/** 遍历需求目录（`deps.docs.list` 已吞掉"目录不存在/不可读"→ 空数组）。 */
function walkArchiveDir(deps: Pick<UseCaseDeps, 'docs'>, reqRootRel: string): ArchiveDirWalk {
  const entries: Array<{ rel: string; bytes: number }> = []
  const walk = (relDir: string, rel: string): void => {
    for (const entry of deps.docs.list(relDir)) {
      if (entry.name.startsWith('.')) continue
      const relPath = rel.length > 0 ? rel + '/' + entry.name : entry.name
      if (!entry.isFile) { walk(relDir + '/' + entry.name, relPath); continue }
      entries.push({ rel: relPath, bytes: entry.size })
    }
  }
  walk(reqRootRel, '')
  return { entries }
}

/** 读文本；读不到 → undefined（摘要降级为「无法解析，仅报体积」，不影响归档成败）。 */
async function readTextIfPresent(deps: Pick<UseCaseDeps, 'docs'>, relPath: string): Promise<string | undefined> {
  try {
    return await deps.docs.read(relPath)
  } catch {
    return undefined
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
 * 纯内存分类（不遍历）：观察来自调用方那次唯一的 `walkArchiveDir`；
 * `archive.md` 因已补登清单而计入"已列"，故不变量是 `listed ∪ exempted ∪ unlisted = 遍历全集 ∪ {archive.md}`。
 */
function classifyArchiveDir(
  walk: ArchiveDirWalk,
  reqRootRel: string,
  docs: readonly { path: string }[],
): { listed: string[]; exempted: Array<{ path: string; rule: string }>; unlisted: string[] } {
  const listed = docs.map(d => d.path)
  const listedPaths = new Set(listed)
  const exempted: Array<{ path: string; rule: string }> = []
  const unlisted: string[] = []
  for (const entry of walk.entries) {
    const workspacePath = reqRootRel + '/' + entry.rel
    if (listedPaths.has(workspacePath) || listedPaths.has(entry.rel)) continue
    const rule = matchArchiveExemption(entry.rel)
    if (rule !== undefined) exempted.push({ path: workspacePath, rule: rule.id })
    else unlisted.push(workspacePath)
  }
  return { listed, exempted, unlisted }
}
