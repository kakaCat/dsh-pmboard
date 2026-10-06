/**
 * AcceptSheet 用例（REQ-47939a t6）——从 host/agent-tools.ts 的 defineAcceptSheetTool / reqboard_accept_sheet 工厂**逐字搬入**编排。
 *
 * 零行为变更：拒绝条件、错误码与消息文案与搬迁前一致；规则仍单点于 domain/。
 *
 * @module dsh-pmboard/application/use-cases/AcceptSheet
 */
import { deliverWorktreeNotice } from '../internal/worktree-notice.js'
import { firstWritableBound } from '../../application/internal/window.js'
import type { UseCaseDeps } from '../ports.js'
import {
  normalizeText,
} from '../../shared/protocol.js'
import { ACCEPT_ITEM_OPTIONS, FINAL_DECLINE_LABEL, FINAL_PASS_LABEL } from '../../domain/text/labels.js'
import { clip, fmt } from '../../domain/text/fmt.js'
import { pmHeader } from '../../domain/text/pm-badge.js'
import { LIMITS } from '../../domain/limits.js'
import { boundSummariesOf } from '../internal/binding-read.js'
import { applyVerdicts } from '../internal/verdicts.js'
import { captureSnapshot, transitionRequirement } from '../internal/token-usage.js'
import { rewriteVerificationDoc } from '../internal/verification-doc-writer.js'
import { stampCheckpoint } from '../internal/interruption.js'
import {
  reject,
  agentIdFromExec,
  requireLiveDriver,
} from '../internal/support.js'
import { checkAcceptanceGate } from '../internal/accept-sheet-rtm-integration.js'
import { needsResultInput, humanNotice, itemSourceTitle, itemResultBindingEnabled, type SheetItemLike } from '../../domain/workflow/AcceptanceSheetSpec.js'
import { requirementStoreOf, taskStoreOf, mutateIfPresent, createManyQueue } from './queue-access.js'

export async function acceptSheet(deps: UseCaseDeps, args: unknown, exec: any): Promise<unknown> {
      const windowKey = agentIdFromExec(deps, exec)
      requireLiveDriver(deps, exec)
      const a = (args ?? {}) as { requirement_id?: unknown; batch_size?: unknown; version?: unknown }
      const explicitId = normalizeText(a.requirement_id, 'requirement_id', 64)
      const batchSize = Math.min(Math.max(Number(a.batch_size ?? LIMITS.sheetBatchDefault) || LIMITS.sheetBatchDefault, 1), LIMITS.sheetBatchMax)

      // t8/B11：绑定读走新端口（只读摘要）
      const bound = await boundSummariesOf(requirementStoreOf(deps), windowKey)
      if (bound.length === 0) reject('reqboard_accept_sheet 未执行：本窗口没有绑定中的需求', 'REQBOARD_NO_BOUND_REQ')
      const picked = explicitId.length > 0 ? bound.find(r => r.id === explicitId) : firstWritableBound(bound, windowKey)
      if (picked === undefined) {
        reject('reqboard_accept_sheet 未执行：需求 ' + explicitId + ' 不是本窗口绑定的进行中需求', 'REQBOARD_NOT_BOUND_TO_WINDOW')
      }
      // 判据过 → 取整条（下游要 verification?.sheet）
      const targetReq = await requirementStoreOf(deps).get(picked.id)
      if (targetReq === undefined) {
        reject('reqboard_accept_sheet 未执行：需求 ' + picked.id + ' 不在台账中', 'REQBOARD_REQUIREMENT_NOT_FOUND')
      }
      const sheet = targetReq.verification?.sheet
      if (sheet === undefined) reject('reqboard_accept_sheet 未执行：该需求还没有验收单（先 reqboard_verify_submit）', 'REQBOARD_NO_SHEET')
      if (a.version !== undefined && Number(a.version) !== sheet.version) {
        reject('reqboard_accept_sheet 未执行：验收单版本不匹配（当前 v' + sheet.version + '）', 'REQBOARD_VERSION_MISMATCH')
      }

      /**
       * 全部通过 → 直接弹「验收通过并归档」确认（REQ-2e9473 W6 闭环，用户指出）：
       * 逐项全过后不再要求人去点看板——同一次会话里接着弹最终确认，确认即归档。
       */
      const finalizeIfAllPassed = async (passed: number, failed: number): Promise<Record<string, unknown> | undefined> => {
        if (failed > 0) return undefined
        const cur = await requirementStoreOf(deps).get(targetReq.id)
        if (cur === undefined || cur.status !== 'accepting') return undefined
        const curSheet = cur.verification?.sheet
        // REQ-308b9a FR-9 / AC-9.3 + REQ-261006092213-4f5b FR-6（D-5）：放行判据 = **无 pending 且无 unverified**
        // （not_verifiable 算已裁决）。此前只看 pending ⇒「全部 unverified 也报全通过并归档」——底线形同不存在。
        if (curSheet !== undefined && curSheet.items.some(i => i.status === 'pending' || i.status === 'unverified')) return undefined
        if (!deps.questions.available()) {
          return { success: false, fallback: 'board', note: '全部 ' + passed + ' 项通过，但弹框通道不可用：请在看板点「验收通过」归档' }
        }
        const FINAL_YES = FINAL_PASS_LABEL
        let ans: { answers?: { id?: string; selected?: string[] }[] } | undefined
        try {
          ans = { answers: [...await deps.questions.ask([{
              id: 'final-pass',
              header: pmHeader('验收通过'),
              question: '全部 ' + passed + ' 项验收通过——是否验收通过并归档？',
              options: [
                { label: FINAL_YES, description: '需求进入归档态，随后补归档材料' },
                { label: FINAL_DECLINE_LABEL, description: '保持验收态，稍后再定' },
              ],
            }], {
              ...(exec.agent !== undefined ? { agent: exec.agent } : {}),
              signal: (exec as { signal?: unknown }).signal,
              // 闸门声明（REQ-e3b6a0 t7）：验收最终归档确认属 G4
              gate: 'G4',
            })] }
        } catch (err) {
          const code = (err as { code?: string }).code ?? ''
          if (code === 'DELEGATED_CALLER' || code === 'CALLER_NOT_LIVE') {
            return { success: false, fallback: 'board', note: '全部通过，但当前调用方无弹框权限：请在看板点「验收通过」' }
          }
          return { success: false, passed, failed: 0, note: '用户未作答最终确认：需求保持验收态（可重新调用本工具或看板确认）' }
        }
        if ((ans?.answers?.[0]?.selected?.[0] ?? '') !== FINAL_YES) {
          return { success: true, recorded: 0, pending: 0, passed, failed: 0, note: '用户选择暂不归档：需求保持验收态' }
        }
        const nowTs2 = deps.clock.now()
        const moved = await mutateIfPresent(requirementStoreOf(deps), targetReq.id, (r) => {
          if (r.status !== 'accepting') {
            throw Object.assign(new Error('需求当前处于 ' + r.status + '，不在验收态'), { code: 'bad_status' })
          }
          const v = r.verification
          if (v !== undefined) {
            v.reviewedAt = nowTs2
            v.reviewedBy = { kind: 'human', sessionId: windowKey }
            v.decision = 'pass'
          }
          // REQ-b545fe t5：使用唯一迁移助手
          transitionRequirement(r, 'archived', {
            at: nowTs2,
            actor: { kind: 'human', sessionId: windowKey },
            reason: '验收通过（弹框逐项全通过 → 会话确认）',
            snap: captureSnapshot(deps, windowKey),
          })
          r.comments.push({
            id: deps.ids.comment(),
            body: '[验收] 人工审核通过（弹框确认，' + passed + ' 项全通过）→ 自动归档',
            createdAt: nowTs2,
            createdBy: { kind: 'human', sessionId: windowKey },
          })
          // FR-6 写入器 A（T-9）：交棒即写 checkpoint（终态 → pendingAction=reqboard_status）
          stampCheckpoint(r, nowTs2, 'reqboard_accept_sheet')
          return { changed: true }
        }).catch((err: unknown) => {
          reject('reqboard_accept_sheet 归档失败：' + ((err as Error).message ?? String(err)), (err as { code?: string }).code ?? 'REQBOARD_STORE_INCONSISTENT')
        })
        const movedReq = moved?.requirement
        // REQ-260923222557-d3b0 FR-3：归档 → worktree 合并清理提示（事件型注入，失败不阻断）
        if (movedReq !== undefined) {
          deliverWorktreeNotice(deps, windowKey, 'archived', { requirementId: movedReq.id })
        }
        return {
          success: true, recorded: 0, pending: 0, passed, failed: 0,
          archived: true, status: movedReq?.status ?? 'archived',
          note: '✅ 验收通过 → 已归档：请调 reqboard_archive_submit 补归档材料（目录/清单/合并去向/索引）',
        }
      }

      // 本批要问的项：**pending + unverified**（复核 C1）。unverified 是"点了通过却没留下结果"，
      // 必须能**被重新问一次**（人在第 2 问补上实际结果即转 passed）；否则提示语让人"补齐结果"
      // 却没有任何入口，弹框通道就形成一个状态永不动、反复调用无效的死结。
      const pendingItems = sheet.items
        .filter(i => i.status === 'pending' || i.status === 'unverified')
        .slice(0, batchSize)
      if (pendingItems.length === 0) {
        const passedN = sheet.items.filter(i => i.status === 'passed').length
        const failedN = sheet.items.filter(i => i.status === 'failed').length
        const unverifiedN = sheet.items.filter(i => i.status === 'unverified').length
        const fin = await finalizeIfAllPassed(passedN, failedN)
        if (fin !== undefined) return fin as never
        return {
          success: true, requirement_id: targetReq.id, sheet_version: sheet.version,
          recorded: 0, pending: 0, passed: passedN, failed: failedN, unverified: unverifiedN,
          note: failedN > 0
            ? '有 ' + failedN + ' 项不通过：已自动回退实施并生成返工卡（REQ-308b9a FR-8）'
            : '全部已裁决（含不可验收项）→ 可点「验收通过」归档',
        } as never
      }

      if (!deps.questions.available()) {
        return {
          success: false, fallback: 'board',
          note: '弹框通道不可用（userQuestions 服务缺失）：请用户到项目看板验收面板逐项勾选（看板通道等效）',
        } as never
      }
      // 文案单点（REQ-47939a 返工）：与 client 徽章同源，不再各写一份
      const OPT_PASS = ACCEPT_ITEM_OPTIONS.pass
      const OPT_FIX = ACCEPT_ITEM_OPTIONS.fix
      const OPT_OTHER = ACCEPT_ITEM_OPTIONS.other
      let answers: { id?: string; selected?: string[]; custom?: string }[] = []
      try {
        answers = [...await deps.questions.ask(pendingItems.flatMap(it => ([{
            id: it.id,
            // REQ-260930183951-eb6c FR-4：弹框 header 也走 domain 单点（否则弹框里分不清是哪类缺口项）。
            // REQ-261005105032-3b02 §10 #31：来源→标题的判别同样收口到单一函数——原来此处内联写
            // `kind==='requirement' ? … : 验收项 {taskId}`，新增带载荷的来源后会渲染「验收项 undefined」。
            header: pmHeader(itemSourceTitle(it.source, it.criterion, it.gapKind)),
            // 题干长度纪律（LIMITS.popupCriterionMax/EvidenceMax）：宁可少给证据，也不能把选项挤出可视区
            question: clip(it.criterion, LIMITS.popupCriterionMax) + (it.evidence.length > 0
              ? fmt('\n（证据：{evidence}）', { evidence: clip(it.evidence[0] ?? '', LIMITS.popupEvidenceMax) })
              : ''),
            options: [
              // REQ-261001184609-cecb FR-2：有 agent 结果时不再要求人填——人只裁决
              { label: OPT_PASS, description: needsResultInput(it)
                ? '该验收项通过——请在自定义输入填实际结果（必填，REQ-260930094139-2d65 FR-1）'
                : '该验收项通过（实际结果已由 agent 记录，无需填写）' },
              { label: OPT_FIX, description: '需修改——请在自定义输入写意见' },
              { label: OPT_OTHER, description: '其他结论——请在自定义输入说明' },
            ],
          },
          {
            // REQ-261001154450-b918 FR-1：第二问专门收「实际结果」。旧实现只给一问
            // （选项 **或** 自定义输入二选一），选"通过"时拿不到文本，于是写了占位文案冒充通过。
            id: it.id + '#result',
            // PM 弹框 header 一律带标志（REQ-6f39b5 契约；漏了会被 pm-question-badge 用例抓出来）
            header: pmHeader('实际结果'),
            // REQ-261001170807-06fd FR-3：把**已有证据**随问一起递到眼前——人只做裁决，不再重抄一遍
            // （此前证据只在第一问、且被截到 40 字符，面对长命令/路径等于没有）。
            question: fmt('【{id}】{criterion}', { id: it.id, criterion: clip(it.criterion, LIMITS.popupEvidenceMax) })
              + (it.evidence.length > 0 ? fmt('\n已有证据：{ev}', { ev: clip(it.evidence[0] ?? '', LIMITS.popupEvidenceMax) }) : '')
              + (humanNotice(it) !== '' ? '\n' + humanNotice(it) : '')
              + '\n请贴实际结果（命令输出摘要 / 看到的界面 / 数据）；通过必填，留空则记「未复核」，不计入通过',
          },
        // REQ-261001184609-cecb FR-2：**验证是执行方的活，裁决是人的活**——
        // 该项已带结果时不抛第二问，人只点通过/退回（零输入即可完成裁决）。
        ].slice(0, needsResultInput(it) ? 2 : 1))), {
          ...(exec.agent !== undefined ? { agent: exec.agent } : {}),
          signal: (exec as { signal?: unknown }).signal,
          // 闸门声明（REQ-e3b6a0 t7）：验收逐项裁决属 G4
          gate: 'G4',
        })]
      } catch (err) {
        const code = (err as { code?: string }).code ?? ''
        if (code === 'DELEGATED_CALLER' || code === 'CALLER_NOT_LIVE') {
          return { success: false, fallback: 'board', note: '当前调用方无弹框权限：请用户到项目看板验收面板逐项勾选' } as never
        }
        // REQ-261001170807-06fd FR-4：**失败要响亮**——原来这里把任何异常都写成
        // "用户未作答（取消/暂离）"，把超时/中断/渲染故障一律栽给用户，真因被吞（用户实测中招）。
        const detail = clip(((err as Error).message ?? String(err)), 160)
        const aborted = code === 'ABORT_ERR' || /abort|cancel/i.test(detail)
        return {
          success: false,
          note: aborted
            ? fmt('弹框被中断（{detail}）：未记录任何裁决——重试或走看板验收面板', { detail })
            : fmt('验收弹框未完成（工具故障，**不是**你的操作）：{detail}；未记录任何裁决，重试或走看板验收面板', { detail }),
        } as never
      }

      const byId = new Map(answers.map(ans => [ans.id ?? '', ans]))
      // 回滚开关（REQ-261006092213-4f5b FR-8）：关闭 = 不结构化绑定 + 恢复 `evidence[0]` 兜底（今天的行为）。
      const bindingEnabled = itemResultBindingEnabled(process.env)
      const verdicts: { itemId: string; status: 'passed' | 'failed' | 'unverified'; opinion?: string }[] = []
      /**
       * 实际结果的取值单点（REQ-261006092213-4f5b FR-3 / FR-6 · D-5，顺序固定）：
       *   **第 2 问自填 → 第 1 问自填 →（非 needsHuman 时）该项 `result`**；三者皆空 ⇒ `unverified`。
       *
       * - 第 2 问只在 `needsResultInput` 为真时出现（无结果 / needsHuman），故有结果的项人零输入也能通过；
       * - **`needsHuman` 项不吃 `item.result` 兜底**（复核 B1）：`result` 只是"供人参照"的材料
       *   （data-model.md：needsHuman 与 result 可并存），判定依据在人眼里——FR-5 / UC-3 明写这类项是
       *   **唯一要人动手的分支**，否则「形式合规冒充实质合规」会在最该拦住的地方重演；
       * - **删掉 `evidence[0]` 兜底**（它是"未复核不可达"的直接原因：整单证据被当成每一项的实测结果）；
       * - 回滚开关 `DSH_REQBOARD_NO_ITEM_RESULT=1` 生效时**整段回到今天的行为**（复核 S1）：
       *   只走 第2问 → 第1问 → `evidence[0]`，不看 `item.result`。
       */
      const resultOf = (it: SheetItemLike): string => {
        const fromSecond = (byId.get(it.id + '#result')?.custom ?? '').trim()
        if (fromSecond.length > 0) return fromSecond
        const fromFirst = (byId.get(it.id)?.custom ?? '').trim()
        if (fromFirst.length > 0) return fromFirst
        // 旧口径（回滚开关开启）：恢复 `evidence[0]` 兜底——开关承诺"一行配置退回今天行为"。
        if (!bindingEnabled) return (it.evidence[0] ?? '').trim()
        // agent 提交时落章的实测结果就是「结果」——人点通过即视为已复核（D-1 / D-5）。
        // 但 needsHuman 项例外：它的判定依据在人眼里，agent 的 result 只是参照材料。
        if (it.needsHuman === true) return ''
        return (it.result ?? '').trim()
      }
      for (const it of pendingItems) {
        const ans = byId.get(it.id)
        if (ans === undefined) continue // 未作答 → 保持 pending（挂起点）
        const picked = ans.selected?.[0] ?? ''
        const custom = (ans.custom ?? '').trim()
        if (picked === OPT_PASS) {
          // REQ-261001154450-b918 FR-1（推翻 REQ-260930155231-0862 的兜底）：实际结果来自
          // **独立的第二问**（<id>#result），不再依赖"选项或自定义二选一"的巧合。
          // 拿不到结果 → 记 unverified（未复核）：不冒充通过、不写占位文案。
          const result = resultOf(it)
          if (result.length === 0) {
            verdicts.push({ itemId: it.id, status: 'unverified' })
          } else {
            verdicts.push({ itemId: it.id, status: 'passed', opinion: result })
          }
        } else {
          const opinion = custom.length > 0 ? custom : (picked.replace(/^[^\w\u4e00-\u9fa5]+/, '') || '需修改')
          verdicts.push({ itemId: it.id, status: 'failed', opinion })
        }
      }
      if (verdicts.length === 0) {
        return { success: false, note: '用户未选择任何项：未记录裁决（挂起）' } as never
      }

      const nowTs = deps.clock.now()
      const store = taskStoreOf(deps)
      const verdictTasks = await store.listByRequirement(targetReq.id)
      // ── 两存储的顺序契约（REQ-260927202051-f6df t9，D6 已与 reader-http 互认）──
      // reader-http 的 applyVerdicts 已裂变为"只读 tasks + 返回 reworkTasks（不再 push 台账）"，
      // 于是分三步：① 在**台账草稿**上算裁决（纯计算，不落盘）；② **先**把返工卡写进队列
      // （taskStore.createMany）；③ **后**把算好的需求记录整条替换进台账（repo.mutate）。
      // 反序会出现"返工卡已建、需求态未落"的悬空——故顺序是硬纪律，不是风格。
      // t8/B11：裁决改吃**单条**（clone 后交纯计算），不再为它拼 draftLedger
      const recForVerdicts = structuredClone(targetReq)
      const fromStatusBefore = targetReq.status
      let applied: ReturnType<typeof applyVerdicts>
      try {
        applied = applyVerdicts(
          recForVerdicts, verdictTasks, sheet.version, verdicts,
          { kind: 'human', sessionId: windowKey }, nowTs, () => deps.ids.comment(),
          captureSnapshot(deps, windowKey), // REQ-b545fe t5: 传快照供打回路径结算
        )
      } catch (err) {
        reject('reqboard_accept_sheet 记录失败：' + ((err as Error).message ?? String(err)), (err as { code?: string }).code ?? 'REQBOARD_INVALID_INPUT')
      }
      // FR-6 写入器 A（T-9）：裁决落库即写 checkpoint（挂起续验的下一步 = 再调本工具）
      stampCheckpoint(applied.requirement, nowTs, 'reqboard_accept_sheet')
      // ① 任务写（先）：返工卡物化到队列；幂等键 = 任务 id。
      if (applied.reworkTasks.length > 0) {
        await createManyQueue(deps, targetReq.id, applied.reworkTasks)
      }
      // ② 需求写（后）：把算好的需求记录整条替换（防并发漂移：状态与验收单版本须仍是计算时的）。
      const result = await mutateIfPresent(requirementStoreOf(deps), targetReq.id, (draft) => {
        // 乐观锁：状态与验收单版本必须仍是计算时的那份（否则说明计算期间被并发改过）
        if (draft.status !== fromStatusBefore || draft.verification?.sheet?.version !== sheet.version) {
          reject('reqboard_accept_sheet 记录失败：需求状态/验收单版本在计算期间发生变化，请重试', 'REQBOARD_STORE_INCONSISTENT')
        }
        // 整条替换（与旧写法 `ledger.requirements[idx] = applied.requirement` 同义）：
        // `version` 由适配器自增，故 applied.requirement 里的旧 version 会被覆盖，无需特殊处理。
        Object.assign(draft, applied.requirement)
        return { changed: true }
      })
      const changed = result?.requirement
      if (changed === undefined) reject('reqboard_accept_sheet 写入失败：台账状态异常', 'REQBOARD_STORE_INCONSISTENT')
      // REQ-308b9a FR-7 / AC-7.7：裁决落库后回填 verification.md 的验收结果表。
      await rewriteVerificationDoc({ repo: { get: (id) => requirementStoreOf(deps).get(id) }, docs: deps.docs }, targetReq.id, await store.listByRequirement(targetReq.id))
      const after = await requirementStoreOf(deps).get(targetReq.id)
      const s = after?.verification?.sheet
      const pending = s?.items.filter(i => i.status === 'pending').length ?? 0
      const failed = s?.items.filter(i => i.status === 'failed').length ?? 0
      // REQ-261006092213-4f5b FR-6：未复核项（人点了通过却没有结果）——**不计入通过**，也不许归档。
      const unverified = s?.items.filter(i => i.status === 'unverified').length ?? 0
      const reworkIds = applied.reworkTasks.map(t => t.id)
      // 本批记录后若已全过（且无未复核）→ 直接接着弹最终「验收通过并归档」确认（闭环）。
      // `finalizeIfAllPassed` 自己也守这条底线（无 pending 且无 unverified 才弹），这里是第一道闸。
      if (pending === 0 && failed === 0 && unverified === 0 && reworkIds.length === 0) {
        const fin2 = await finalizeIfAllPassed(s?.items.filter(i => i.status === 'passed').length ?? 0, 0)
        if (fin2 !== undefined) return fin2 as never
      }
      // RTM 集成：检查验收门禁（REQ-260925172227-2d61 FR-3）
      const rtmResult = checkAcceptanceGate(s)
      
      return {
        success: true,
        requirement_id: targetReq.id,
        sheet_version: sheet.version,
        recorded: verdicts.length,
        pending,
        passed: s?.items.filter(i => i.status === 'passed').length ?? 0,
        failed,
        unverified,
        // REQ-308b9a FR-8：裁决含 failed 时返回真实生成的返工卡 id 列表。
        rework_tasks: reworkIds,
        gate_status: rtmResult.gate_check.gate_status,
        archived: rtmResult.should_archive,
        note: failed > 0
          ? '有 ' + failed + ' 项不通过：已自动回退实施并生成 ' + reworkIds.length + ' 张返工卡（REQ-308b9a FR-8）'
          : (unverified > 0
              ? '本批已记录，但有 ' + unverified + ' 项未复核（点了通过却没结果）：不计入通过；再次调 reqboard_accept_sheet 会把这些项重新问一遍（补上实际结果即转通过）'
              : (pending > 0
                  ? '本批已记录（剩 ' + pending + ' 项待验）：再次调 reqboard_accept_sheet 从断点继续'
                  : '全部已裁决 → 请点「验收通过」归档（人工门）')),
      } as never
    }