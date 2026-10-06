/**
 * AskConfirm 用例（REQ-47939a t6）——从 host/agent-tools.ts 的 defineAskConfirmTool / reqboard_ask_confirm 工厂**逐字搬入**编排。
 *
 * REQ-260924213231-b1c4 T-6（serves: FR-3）：弹框改**非阻塞投递**（I-3）——\`questions.ask\` 与宽限计时器赛跑：
 *   · 宽限内作答 → 与改造前**逐字一致**的同步落章/推进（旧语义回归，TC-6）；
 *   · 超宽限   → 登记挂起 ticket、立即返回 \`pending=true\`（**不判失败**，TC-5），
 *                 后台继续等作答并落章/推进/唤醒窗口。
 *
 * 抽出点（避免两份实现漂移）：落章+推进的唯一实现在 \`application/internal/confirm-settle.ts\`；
 * 赛跑/挂起/后台唤起在 \`application/internal/pending-confirm.ts\`。本文件只留编排与响应组装。
 *
 * 兼容性（interfaces.md 兼容性矩阵）：\`deps.pendingConfirms\` 缺省 = 未装配非阻塞能力 →
 * 完全走旧的阻塞语义（本文件那条分支一字未改）。
 *
 * @module dsh-pmboard/application/use-cases/AskConfirm
 */
import type { AskAnswer, UseCaseDeps } from '../ports.js'
import { firstWritableBound } from '../../application/internal/window.js'
import {
  ALL_ARTIFACT_KINDS,
  normalizeText,
  type ArtifactKind,
  type RequirementStatus,
} from '../../shared/protocol.js'
import { DEFAULT_CONFIRM_OPTIONS } from '../../domain/text/labels.js'
import { clip, fmt } from '../../domain/text/fmt.js'
import { pmHeader } from '../../domain/text/pm-badge.js'
import { LIMITS } from '../../domain/limits.js'
import { advanceTargetFor, gateForTransition, gateFromStage } from '../../domain/gate/GateCatalog.js'
// REQ-261002175818-80a8 t6 / FR-6：超容量摘要与容量解析都取**同一份**领域/配置单点（不另写一套口径）
import { overCapacitySummary } from '../../domain/task/Footprint.js'
import { checkDesignCompletenessGate, contentGatesForMove } from '../internal/content-gate-wiring.js'
import { boundSummariesOf } from '../internal/binding-read.js'
import { requirementStoreOf } from './queue-access.js'
// REQ-261004065652-5c1c FR-7：缺省宽限常量（配置缺省值与单点归一在 plugin-config）
import { CONFIRM_DEFAULT_GRACE_MS, resolveRoundCapacity } from '../../plugin-config.js'
import { applyConfirmDecision, applyConfirmedAdvance, missingArtifactMessage, missingPlanMessage, recordDeclinedConfirmation } from '../internal/confirm-settle.js'
// REQ-261006164732-6503 t4（serves: FR-1）：请求路径与自动弹通道共用**同一份**建门唯一性判定
import { requestGate } from '../internal/gate-request.js'
import {
  outcomeOf,
  raceAsk,
  suspendConfirm,
  type ConfirmSubmitted,
} from '../internal/pending-confirm.js'
import {
  reject,
  agentIdFromExec,
  requireLiveDriver,
  applyRequirementWorkspaceRoot,
} from '../internal/support.js'
// REQ-261002141430-a5ef FR-2/FR-3：弹框在途登记 + 停手位（投递前 enter、四条出口 exit）
import {
  enterAwaitingConfirm,
  exitAwaitingConfirm,
  type AwaitingExitReason,
} from '../internal/awaiting-confirm.js'
// REQ-261006094052-1da2 t2（serves: FR-1）：已落章的确认门重发也要真的推进——推进后与
// confirm-settle 的 confirm-advance 同源复位自动链健康位（FR-10 口径，绝不改 activation）。
import { applyDiveTransition } from '../dive/applyDiveTransition.js'

// 自动推进白名单来自闸门目录（REQ-e3b6a0 t2：原私有 ADVANCE_MAP 已收敛进 domain/gate/GateCatalog）。

export async function askConfirm(deps: UseCaseDeps, args: unknown, exec: any): Promise<unknown> {
  const windowKey = agentIdFromExec(deps, exec)
  requireLiveDriver(deps, exec)
  const a = (args ?? {}) as {
    requirement_id?: unknown; target?: unknown; kind?: unknown
    question?: unknown; options?: unknown; advance?: unknown; inline_grace_ms?: unknown
    /**
     * 内部参数（不经工具面暴露）：门已由 `requestGate` 建好时**沿用该 ticket**。
     * REQ-261006164732-6503 t3：`requestGate` 是建门唯一入口，自动弹通道先经它判定再投递；
     * 若这里再登记一次，一道门就会有两条记录（唯一性当场失效）。
     */
    adopted_ticket?: unknown
  }
  const explicitId = normalizeText(a.requirement_id, 'requirement_id', 64)
  const targetKind = normalizeText(a.target, 'target', 32)
  const kindRaw = normalizeText(a.kind, 'kind', 64) as ArtifactKind
  const adoptedTicket = normalizeText(a.adopted_ticket, 'adopted_ticket', 64)
  const question = clip(normalizeText(a.question, 'question', 2e3), LIMITS.popupQuestionMax)
  const options = Array.isArray(a.options) ? (a.options as unknown[]).map((o) => normalizeText(o, 'options[]', 200)).filter((o) => o.length > 0).slice(0, 5) : []
  const advance = a.advance !== false
  if (question.length === 0) reject('reqboard_ask_confirm 未执行：question 不能为空', 'REQBOARD_INVALID_INPUT')
  if (targetKind !== 'artifact' && targetKind !== 'plan') reject('reqboard_ask_confirm 未执行：target 只能是 artifact 或 plan', 'REQBOARD_INVALID_INPUT')
  if (targetKind === 'artifact' && !ALL_ARTIFACT_KINDS.includes(kindRaw)) reject('reqboard_ask_confirm 未执行：kind 必须是 ' + ALL_ARTIFACT_KINDS.join(' / '), 'REQBOARD_INVALID_INPUT')
  const graceRaw = a.inline_grace_ms
  if (graceRaw !== undefined && (typeof graceRaw !== 'number' || !Number.isFinite(graceRaw) || graceRaw <= 0)) reject('reqboard_ask_confirm 未执行：inline_grace_ms 必须是正数（毫秒）', 'REQBOARD_INVALID_INPUT')
  const optionLabels = options.length > 0 ? options : [...DEFAULT_CONFIRM_OPTIONS]
  const bound = await boundSummariesOf(requirementStoreOf(deps), windowKey)
  if (bound.length === 0) reject('reqboard_ask_confirm 未执行：本窗口没有绑定中的需求', 'REQBOARD_NO_BOUND_REQ')
  const picked = explicitId.length > 0 ? bound.find((r) => r.id === explicitId) : firstWritableBound(bound, windowKey)
  if (picked === undefined) reject('reqboard_ask_confirm 未执行：需求 ' + explicitId + ' 不是本窗口绑定的进行中需求', 'REQBOARD_NOT_BOUND_TO_WINDOW')
  const targetReq = await requirementStoreOf(deps).get(picked.id)
  if (targetReq === undefined) reject(fmt('需求 {id} 不在台账中', { id: picked.id }), 'REQBOARD_REQUIREMENT_NOT_FOUND')
  // ── REQ-261006164732-6503 t4（serves: FR-1、FR-2）：请求路径先过**建门唯一入口** ──────────────
  // 与自动弹通道**同一份判定实现**，判据是过程态（这道门有人在等吗），不是结果态（落章了吗）：
  //   · reused          ⇒ 复用：返回原票、不弹第二个框（拆分会话实测的双框事故就此闭合）
  //   · already-settled ⇒ 落到下面的既有早退块（推进/缺口/文案逐字不变）
  //   · opened          ⇒ 门已登记，继续走原有投递（沿用该票，见下方 adoptedFromGate）
  //
  // **例外：带着 adopted_ticket 进来时不判定**——那表示"这道门就是本次调用自己建的，这次投递即交付"。
  // 若不例外，投递方（triggerAutoConfirm / SubmitVerification 先建门再投递）会被自己的门判成 reused，
  // 于是永远不投递（实测：auto-confirm 用例 waitFor 超时，一个框都弹不出来）。
  // 弹框通道不可用时**不建门**：登记一张没人能答的票会把窗口钉到 TTL。
  // 此时返回一个空票的 opened，让下方的既有「通道不可用 → fallback=board」分支原样接管（行为不变）。
  const gate = adoptedTicket.length > 0
    ? ({ mode: 'opened', ticket: adoptedTicket } as const)
    : deps.questions.available()
      ? await requestGate(deps, {
        requirementId: targetReq.id,
        target: targetKind as 'artifact' | 'plan',
        kind: kindRaw,
        question,
        ...(graceRaw === undefined ? {} : { inlineGraceMs: graceRaw }),
      }, exec)
      : ({ mode: 'opened', ticket: '' } as const)
  if (gate.mode === 'reused') {
    return {
      success: true,
      confirmed: false,
      advanced: false,
      pending: true,
      ticket: gate.ticket,
      requirement_id: targetReq.id,
      note: '该确认已有一道门在等（ticket=' + gate.ticket + '）：未重复弹框。'
        + '请调 reqboard_confirm_receipt(ticket="' + gate.ticket + '") 取回执，或到项目看板作答。',
    }
  }
  // REQ-261002175818-80a8 t6 / FR-4、FR-6：超容量清单必须**摆在人眼前**——批准前是本段文本唯一的
  // 可见窗口，而"指望调用方自己再拼一句"等于把披露交给自觉（本仓反复踩过的形态），故在这里自动追加。
  // 摘要自带「超容量…」标签（这里只拼接、不另写措辞）；无超容量卡 ⇒ 空串 ⇒ 连分隔符都不加，
  // popupQuestion 与改造前**逐字节相同**（既有文本的消费者与测试不受累）。
  const ocapSummary = targetKind === 'plan' ? overCapacitySummary(targetReq.plan?.tasks ?? [], resolveRoundCapacity({ capacity: deps.capacity }).value) : ''
  const popupQuestion = targetKind === 'plan'
    ? clip(fmt('{q}（批准后将自动拆分任务卡并立即开跑，中途不再打断；如需干预可在看板暂停或取消）', { q: question })
      + (ocapSummary.length === 0 ? '' : '；' + ocapSummary), LIMITS.popupQuestionMax)
    : question
  const kindArts = (targetReq.artifacts ?? []).filter((a) => a.kind === kindRaw)
  const alreadyConfirmed = targetKind === 'artifact' ? kindArts.length > 0 && kindArts.every((a) => a.confirmedAt !== undefined) : targetReq.plan?.approvedAt !== undefined
  const planAwaitingAdvance = targetKind === 'plan' && targetReq.plan?.approvedAt !== undefined && targetReq.status === 'decomposing'
  if (alreadyConfirmed && !planAwaitingAdvance) {
    // ── REQ-261005105032-3b02 §10 #46：唯一 async 内容门（弹框确认后的**推进块**，本文件这一处）──
    // 调用顺序照 interfaces.md 钉死：① 同步门（走到这里即"产物已确认"，同步门已过）→
    // ② contentGatesForMove → ③ 既有 design 完整性门（**原样保留，不合并**）。
    // 失败表现照 backend.md：advanced:false + gate_failure 回执 + 「未推进：<message>」（不推进）。
    const label = targetKind === 'artifact'
      ? '产物 ' + kindRaw + ' 已确认，未重复弹框（FR-9/FR-11）'
      : '拆分计划已批准，未重复弹框（FR-9/FR-11）'
    const advanceTo = advanceTargetFor(targetReq.status)
    if (advanceTo !== undefined) {
      applyRequirementWorkspaceRoot(deps, targetReq)
      const contentGate = await contentGatesForMove(
        deps.docs, targetReq, targetReq.status, advanceTo as RequirementStatus,
        { ...(deps.session !== undefined ? { sessionProbe: deps.session } : {}) },
      )
      if (contentGate !== undefined) {
        return {
          success: true,
          confirmed: true,
          advanced: false,
          requirement_id: targetReq.id,
          gate_failure: contentGate,
          note: label
            + fmt('；{from} → {to} 未推进：{msg}', { from: targetReq.status, to: advanceTo, msg: contentGate.message }),
        }
      }
    }
    let earlyGate
    // REQ-261006094052-1da2 t2：设计完整性门的**适用条件与主路径同一份**——applyConfirmDecision 用的是
    // `gateForTransition(from, to)?.id === 'G2'`，而这里原来只按 `kind=design` 判。只按 kind 判会留一条
    // 后门：在 design 阶段用 `kind=requirement` 重发确认，就能**绕过 G2 直接推进到 decomposing**
    // （本仓反复栽过的「某条路径漏门 = 后门」形态）。保留原 kind=design 条件（旧的「已确认设计产物
    // → 报缺口」语义不变），并补上 G2 条件；G2 只挂在 design → decomposing，故下面的文案仍然准确。
    const designGateApplies = (targetKind === 'artifact' && kindRaw === 'design')
      || (advanceTo !== undefined && gateForTransition(targetReq.status, advanceTo as RequirementStatus)?.id === 'G2')
    if (designGateApplies) {
      applyRequirementWorkspaceRoot(deps, targetReq)
      earlyGate = await checkDesignCompletenessGate(deps.docs, targetReq)
    }
    const unregistered = (earlyGate?.gaps ?? []).filter((g) => g.includes('未登记')).length
    const gapNote = earlyGate === undefined ? '' : fmt('；design → decomposing 未推进：{msg}', { msg: earlyGate.message }) + (unregistered > 0 ? fmt('。仍有 {n} 份未登记', { n: unregistered }) : '')
    // ── REQ-261006094052-1da2 t2（serves: FR-1、FR-2）：闸门**全过** ⇒ 兑现推进 ────────────
    // 缺陷现场：这一段以前直接落到下面的 return（advanced:false）——闸门算了却不兑现，
    // 于是「已落章 + 产物补齐」之后 agent 无路可走（move 被人门拒）。现在调**同一份**推进实现
    // （applyConfirmedAdvance，与首次确认共用），闸门不过的两条路径（上面）**一字未改**。
    if (earlyGate === undefined && advanceTo !== undefined && advance) {
      const advancedBy = await applyConfirmedAdvance(deps, {
        requirementId: targetReq.id,
        windowKey,
        from: targetReq.status,
        to: advanceTo as RequirementStatus,
        nowTs: deps.clock.now(),
      })
      if (advancedBy.advanced) {
        // FR-10（REQ-261003215944-9e04）：确认推进之后让自动链真的能接着跑——与
        // applyConfirmDecision 的 confirm-advance 事件同源（复位健康位、按需归零，绝不改 activation）。
        await applyDiveTransition(
          { store: requirementStoreOf(deps), now: () => deps.clock.now() },
          targetReq.id,
          'confirm-advance',
          { kind: 'human', sessionId: windowKey },
          { stageChanged: true, status: targetReq.status },
        )
        return {
          success: true,
          confirmed: true,
          advanced: true,
          from: targetReq.status,
          to: advanceTo,
          requirement_id: targetReq.id,
          note: label + fmt('；已自动推进：{from} → {to}', { from: targetReq.status, to: advanceTo }),
        }
      }
      return {
        success: true,
        confirmed: true,
        advanced: false,
        requirement_id: targetReq.id,
        note: label + advancedBy.advanceNote,
      }
    }
    return {
      success: true,
      confirmed: true,
      advanced: false,
      requirement_id: targetReq.id,
      ...earlyGate !== undefined ? { gate_failure: earlyGate } : {},
      note: label + gapNote
    }
  }
  if (!deps.questions.available()) return {
    success: false,
    confirmed: false,
    advanced: false,
    fallback: 'board',
    note: '弹框通道不可用（userQuestions 服务缺失）：请用户到项目看板点确认按钮；或由 agent 改用 ask_user_question + reqboard_confirm_artifact 两步走'
  }
  const gateId = gateFromStage(targetReq.status)?.id
  const submitted: ConfirmSubmitted = {
    requirementId: targetReq.id,
    windowKey,
    target: targetKind as 'artifact' | 'plan',
    kind: kindRaw,
    question,
    optionLabels,
    advance
  }
  // ── REQ-261005200052-ce40 FR-5：**登记挂起票之前**先问「这次确认有没有东西可落章」──────────
  // 没有产物 = 人点看板也答不了（看板确认同样要求产物在册）、agent 也覆盖不掉；此时若还登记票，
  // 就把窗口钉死（实测：落章失败却留下新票，TTL 从新票重新计时 30 分钟）。故此处直接拒，不留票。
  if (targetKind === 'artifact' && kindArts.length === 0) {
    reject('reqboard_ask_confirm 未执行：' + missingArtifactMessage(targetReq.id, kindRaw), 'REQBOARD_MISSING_ARTIFACT')
  }
  if (targetKind === 'plan' && targetReq.plan === undefined) {
    reject('reqboard_ask_confirm 未执行：' + missingPlanMessage(targetReq.id), 'REQBOARD_MISSING_PLAN')
  }
  const ask = deps.questions.ask([{
    id: 'confirm',
    question: popupQuestion,
    header: pmHeader('确认'),
    options: optionLabels.map((label: string, i: number) => ({
      label,
      ...i === 0 ? { description: '确认后自动落章并推进' } : {}
    }))
  }], {
    ...exec.agent !== undefined ? { agent: exec.agent } : {},
    signal: exec.signal,
    ...gateId === undefined ? {} : { gate: gateId }
  })
  const port = deps.pendingConfirms
  if (graceRaw !== undefined && port === undefined) reject(fmt('reqboard_ask_confirm 未执行：显式 inline_grace_ms（{g}）需要挂起确认能力，本实例未装配（pendingConfirms 缺省）——不传宽限即缺省阻塞等待，或修复装配（REQBOARD_NONBLOCK_UNAVAILABLE）', { g: String(graceRaw) }), 'REQBOARD_NONBLOCK_UNAVAILABLE')
  // REQ-261004065652-5c1c FR-7：**缺省有界宽限**。三档语义（判定写死在用例里，配置只提供数值）：
  //   · 显式 inline_grace_ms → 覆盖（不变）
  //   · 未装配 pendingConfirms → 没有挂起能力 ⇒ 只能全阻塞（**不制造'假非阻塞'**）
  //   · 配置 confirmDefaultGraceMs = 0 → 显式回到旧的全阻塞（一键回退）
  //   · 否则取配置值（从 LIMITS 派生，见 plugin-config）
  // 修前缺省是全阻塞：实测一次弹框吞掉宿主的 3600000ms（1 小时）工具超时后被中止——
  // 期间整个窗口死等、Dive 也停手等人，人不在就等于停摆一小时。
  const configuredGrace = deps.confirmDefaultGraceMs
  const effectiveGrace = graceRaw !== undefined ? graceRaw : port === undefined || typeof configuredGrace === 'number' && configuredGrace <= 0 ? undefined : typeof configuredGrace === 'number' && Number.isFinite(configuredGrace) ? configuredGrace : CONFIRM_DEFAULT_GRACE_MS

  // 门已由 requestGate 建好（opened）时沿用它的 ticket；调用方显式带来（adopted_ticket）时同理。
  // 这里**不再登记、也不再清理陈旧票**：
  //   · 不登记 —— requestGate 是建门唯一入口（再登记一次会让一道门有两条记录）；
  //   · 不清理 —— 异门陈旧票的清理随建门动作一起在 requestGate 里做（t4 实测：留在本文件会被
  //     adopt 分支整个跳过，异门旧票就永远钉在窗口上）。
  const adoptedFromGate = gate.mode === 'opened' ? gate.ticket : adoptedTicket
  const ticket = port !== undefined && adoptedFromGate.length > 0 ? adoptedFromGate : undefined
  const dialogRef = ticket ?? fmt('dlg-confirm-{id}-{at}', {
    id: targetReq.id,
    at: deps.clock.now()
  })
  // REQ-261006170150-52cc FR-1：把本次这票的 ref 随 submitted 传下去（同步作答与挂起后台续跑共用），
  // 收敛点据此在**落章/推进之前**带 ref await 清位；缺失时收敛点退回旧行为。
  submitted.dialogRef = dialogRef
  const awaiting = {
    store: requirementStoreOf(deps),
    ...deps.dialogs === undefined ? {} : { dialogs: deps.dialogs },
    now: () => deps.clock.now(),
    ...deps.alert === undefined ? {} : { alert: deps.alert },
    // REQ-261006170150-52cc FR-2：本通道的清位出口（**否定作答** / 取消 / 降级 / 挂起收尾）
    // 也要请求一次驱动——否则「人答了否定」之后链上什么都没发生，而这不是"无事发生"，
    // 是**该续跑却没被叫**（修前症状：不落章不推进，agent 也不动）。
    // 肯定作答走收敛点自己的补发口径（`applyConfirmDecision`），两边互斥不叠加。
    ...(deps.notifyDrivable === undefined ? {} : { onCleared: deps.notifyDrivable })
  }
  const exitAwaiting = async (reason: AwaitingExitReason): Promise<void> => {
    await exitAwaitingConfirm(awaiting, {
      requirementId: targetReq.id,
      ref: dialogRef,
      reason
    })
  }
  enterAwaitingConfirm(awaiting, {
    requirementId: targetReq.id,
    windowKey,
    ref: dialogRef,
    kind: 'confirm',
    suspend: effectiveGrace !== undefined,
    question
  })
  if (effectiveGrace === undefined) {
    let answers
    try {
      answers = await ask
    } catch (err) {
      const body = handleAskFailure(deps, exec, err, ticket, targetReq.id)
      await exitAwaiting('canceled')
      return body
    }
    const body = await settleAnswers(deps, exec, answers, submitted)
    if (port !== undefined && ticket !== undefined) port.settle(ticket, outcomeOf(body))
    await exitAwaiting('answered')
    return body
  }
  const raced = await raceAsk(ask, effectiveGrace)
  if (raced.kind === 'answered') {
    const body = await settleAnswers(deps, exec, raced.answers, submitted)
    if (port !== undefined && ticket !== undefined) port.settle(ticket, outcomeOf(body))
    await exitAwaiting('answered')
    return body
  }
  if (raced.kind === 'rejected') {
    const body = handleAskFailure(deps, exec, raced.err, ticket, targetReq.id)
    await exitAwaiting('degraded')
    return body
  }
  const guardedAsk = ask.then((a) => a, (err) => {
    exitAwaiting('canceled')
    throw err
  })
  return suspendConfirm(deps, guardedAsk, submitted, ticket as string, async (answers) => {
    try {
      return await settleAnswers(deps, exec, answers, submitted)
    } finally {
      await exitAwaiting('answered')
    }
  })
}
/**
* 弹框抛错的两条降级（与改造前逐字一致）：无弹框权限 → `fallback=board`；
* 取消/暂离（ASK_ABORTED 等）→ 中性返回，**不算错误**。
*/
function degradedAnswer(err: unknown): Record<string, unknown> {
  const code = (err as { code?: string }).code ?? ''
  if (code === 'DELEGATED_CALLER' || code === 'CALLER_NOT_LIVE') return {
    success: false,
    confirmed: false,
    advanced: false,
    fallback: 'board',
    note: '当前调用方无弹框权限（subagent/非活窗口）：请用户到项目看板点确认按钮完成本次确认'
  }
  return {
    success: false,
    confirmed: false,
    advanced: false,
    note: '用户未作答（取消/暂离）：节点未推进。稍后可重新发起 reqboard_ask_confirm'
  }
}
/**
* 弹框在等待/赛跑期间失败或中止的统一处置（REQ-260927123256-196b FR-4 / I-1）：
*   · `ASK_ABORTED` 或 `exec.signal.aborted` → **响亮留痕**：`markInterrupted(ticket)`
*     （守卫继续拦，直到人作答或显式解除），返回 `pending:true + ticket + interrupted:true`；
*   · 其余（`ASK_CANCELLED` 用户取消 / `DELEGATED_CALLER` 等降级）→ `settle`（守卫放行）后
*     走**与改造前逐字一致**的 `degradedAnswer`。
*
* 未装配注册表时没有可留痕的 ticket（仅测试/旧装配形态）：中止按中性降级返回——
* 绝不把一次中止静默伪装成「已确认」或「成功」。
*/
function handleAskFailure(deps: UseCaseDeps, exec: any, err: unknown, ticket: string | undefined, requirementId: string): Record<string, unknown> {
  const port = deps.pendingConfirms
  if ((((err as { code?: string }).code ?? '') === 'ASK_ABORTED' || exec?.signal?.aborted === true) && port !== undefined && ticket !== undefined) {
    port.markInterrupted(ticket)
    return interruptedBody(ticket, requirementId)
  }
  if (port !== undefined && ticket !== undefined) port.settle(ticket, {
    confirmed: false,
    advanced: false
  })
  return degradedAnswer(err)
}
/**
* 阻塞等待被中止的返回体（I-1 中止分支）：`pending:true + ticket + interrupted:true`。
* note 必含两条恢复命令（取回执 / 看板确认）与「收到作答前不得产出下游产物」。
*/
function interruptedBody(ticket: string, requirementId: string): Record<string, unknown> {
  return {
    success: false,
    confirmed: false,
    advanced: false,
    pending: true,
    ticket,
    requirement_id: requirementId,
    interrupted: true,
    note: fmt('本次确认等待已被中止（弹框可能已消失），已留下可查的挂起记录（ticket={t}）。**收到作答前不得产出下游产物**（本窗口 reqboard_submit / reqboard_decompose / reqboard_move / reqboard_task_move 会被代码级拒绝）。恢复路径：① 调 reqboard_confirm_receipt(ticket="{t}") 取回执；② 到项目看板点确认按钮。', { t: ticket })
  }
}
/**
* 已作答 → 裁决（同步路径与后台续跑共用）。非肯定项只留痕不推进；肯定项走
* \`applyConfirmDecision\`（落章 + 可选推进 + 批准计划的门合并开跑）。
* 返回体形状与改造前逐字一致（output-contract 静态扫描逐键对账）。
*/
async function settleAnswers(
  deps: UseCaseDeps,
  exec: any,
  answers: readonly AskAnswer[],
  s: ConfirmSubmitted,
): Promise<Record<string, unknown>> {
  const answer = answers[0]
  const picked = answer?.selected?.[0] ?? answer?.custom ?? ''
  const affirmative = picked.length > 0 && picked === s.optionLabels[0]
  const nowTs = deps.clock.now()
  if (!affirmative) {
    const userFeedback = answer?.custom?.trim() ?? ''
    await recordDeclinedConfirmation(deps, {
      requirementId: s.requirementId,
      windowKey: s.windowKey,
      question: s.question,
      picked,
      userFeedback,
      nowTs
    })
    return {
      success: true,
      confirmed: false,
      advanced: false,
      user_choice: picked || '（未选）',
      user_feedback: userFeedback.length > 0 ? userFeedback : undefined,
      note: fmt('用户选择"{picked}"：未落章、未推进。{feedback}按用户意见修改后可重新发起确认', {
        picked: picked || '（未选）',
        feedback: userFeedback.length > 0 ? fmt('用户反馈：{fb}。', { fb: userFeedback }) : ''
      })
    }
  }
  const outcome = await applyConfirmDecision(deps, exec, {
    requirementId: s.requirementId,
    windowKey: s.windowKey,
    target: s.target,
    kind: s.kind,
    question: s.question,
    picked,
    nowTs,
    advance: s.advance,
    // REQ-261006170150-52cc FR-1：本次这票的 ref（缺省 ⇒ 收敛点退回旧行为）
    ...(s.dialogRef === undefined ? {} : { dialogRef: s.dialogRef })
  })
  // REQ-261006164732-6503 t6（serves: FR-5）：作答未生效（门已被取代 / 需求已推进）⇒ 回执不得谎报
  // "已确认"——它只留了一条痕。
  if (outcome.stale !== undefined) {
    return {
      success: true,
      confirmed: false,
      advanced: false,
      requirement_id: s.requirementId,
      note: outcome.note,
    }
  }
  return {
    success: true,
    confirmed: true,
    advanced: outcome.advanced,
    from: outcome.from,
    to: outcome.to,
    requirement_id: s.requirementId,
    ...outcome.gateFailure !== undefined ? { gate_failure: outcome.gateFailure } : {},
    note: outcome.note
  }
}


