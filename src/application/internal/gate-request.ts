/**
 * 建门唯一入口（REQ-261006164732-6503 t2 · serves: FR-1, FR-3 · 设计 I-1 / A-2 / A-3）。
 *
 * ## 为什么需要它
 *
 * 修前，"要不要再弹一个批准框"每个触发通道自己判断，而唯一能问的判据是**结果态**
 * （`plan.approvedAt` / 产物 `confirmedAt` 有值吗）。人在宽限内没答时该判据为假，于是同一个门
 * 被弹第二次（拆分门实测 16:42:06 与 16:42:10 两个框），第二次的作答还把已落章的 `approvedAt`
 * 与审批证据覆写掉。
 *
 * 本模块把判定收到**一处**，判据从结果态下移到**过程态**：这道门现在有人在等吗？
 *
 * ## 判定顺序（不可换序）
 *
 * ```
 *   ① 复用：registry.findOpen 命中「未作答且未过期」的同门门 ⇒ 返回原 ticket（不弹框、不登记、不写台账、不续期）
 *   ② 早退：同 target+kind 已落章             ⇒ 不弹框，返回既有确认态
 *   ③ 新建：两者皆无                          ⇒ 登记门，交给调用通道弹框
 * ```
 *
 * **为什么复用排第一**：只有先问"有门在等吗"，才能保证人在宽限内没答时不会被问第二次；
 * 而 ①② 都不弹框，所以"先看已落章"并不会多弹一个框——顺序取"复用优先"是为了**少登记一条记录**
 * （一个门一条记录），不是为了防重弹（防重弹由两个分支共同保证）。
 *
 * **已知边界（设计口径，不是缺陷）**：若台账已落章而某道门仍 open，本函数返回 `reused`
 * （手上有活的框，交给调用方去取回执）。回执以**台账为准**，因此 agent 不会因此卡住；
 * 那道陈旧门的迟到作答由 `recordStaleAnswer`（t6/t7）中性化。
 *
 * ## 副作用纪律
 *
 * 只有 `opened` 一个分支有副作用（登记门）。`reused` / `already-settled` **零副作用**：
 * 判定阶段不 settle、不清票、不写台账、不弹框——它是纯读 + 一次登记。
 *
 * @module dsh-pmboard/application/internal/gate-request
 */
import type { UseCaseDeps } from '../ports.js'
import { ALL_ARTIFACT_KINDS, type ArtifactKind } from '../../shared/protocol.js'
import { fmt } from '../../domain/text/fmt.js'
import { boundSummariesOf } from './binding-read.js'
import { missingArtifactMessage, missingPlanMessage } from './confirm-settle.js'
import { requirementStoreOf } from '../use-cases/queue-access.js'
import {
  agentIdFromExec,
  reject,
  requireLiveDriver,
} from './support.js'

/** 建门请求（与 `reqboard_ask_confirm` 的入参同义；`question` 为**原始**题干，披露句由调用方追加）。 */
export interface GateRequestInput {
  requirementId: string
  target: 'artifact' | 'plan'
  kind: string
  question: string
  optionLabels?: readonly string[]
  advance?: boolean
  /** 自动弹通道传 2000（非阻塞）；agent 显式弹不传（沿用配置缺省宽限）。 */
  inlineGraceMs?: number
}

/**
 * 建门结果三分支。
 *
 * `ticket` 在未装配挂起能力（`deps.pendingConfirms === undefined`）时退化为本地弹框引用
 * `dlg-confirm-<req>-<at>`——与 `AskConfirm` 的既有兜底**同形**：那种装配下没有回执可取的语义。
 */
export type GateRequestOutcome =
  | { mode: 'reused'; ticket: string }
  | { mode: 'already-settled'; confirmed: boolean }
  | { mode: 'opened'; ticket: string }

/** 建门唯一入口：判定顺序 复用 → 早退 → 新建（见模块头）。 */
export async function requestGate(
  deps: UseCaseDeps,
  input: GateRequestInput,
  exec: unknown,
): Promise<GateRequestOutcome> {
  const windowKey = agentIdFromExec(deps, exec)
  requireLiveDriver(deps, exec)

  // ── ① 入参值域（文案与 AskConfirm 同源；不另造一套）────────────────────────────
  if (input.target !== 'artifact' && input.target !== 'plan') {
    reject('reqboard_ask_confirm 未执行：target 只能是 artifact 或 plan', 'REQBOARD_INVALID_INPUT')
  }
  if (input.question.trim().length === 0) {
    reject('reqboard_ask_confirm 未执行：question 不能为空', 'REQBOARD_INVALID_INPUT')
  }
  if (input.inlineGraceMs !== undefined
    && (typeof input.inlineGraceMs !== 'number' || !Number.isFinite(input.inlineGraceMs) || input.inlineGraceMs <= 0)) {
    reject('reqboard_ask_confirm 未执行：inline_grace_ms 必须是正数（毫秒）', 'REQBOARD_INVALID_INPUT')
  }
  const isArtifact = input.target === 'artifact'
  if (isArtifact && !(ALL_ARTIFACT_KINDS as readonly string[]).includes(input.kind)) {
    reject('reqboard_ask_confirm 未执行：kind 必须是 ' + ALL_ARTIFACT_KINDS.join(' / '), 'REQBOARD_INVALID_INPUT')
  }

  // ── ② 绑定与在册（沿用既有错误码，行为与 AskConfirm 逐字一致）──────────────────
  const store = requirementStoreOf(deps)
  const bound = await boundSummariesOf(store, windowKey)
  if (bound.length === 0) {
    reject('reqboard_ask_confirm 未执行：本窗口没有绑定中的需求', 'REQBOARD_NO_BOUND_REQ')
  }
  if (!bound.some(r => r.id === input.requirementId)) {
    reject('reqboard_ask_confirm 未执行：需求 ' + input.requirementId + ' 不是本窗口绑定的进行中需求', 'REQBOARD_NOT_BOUND_TO_WINDOW')
  }
  const req = await store.get(input.requirementId)
  if (req === undefined) {
    reject(fmt('需求 {id} 不在台账中', { id: input.requirementId }), 'REQBOARD_REQUIREMENT_NOT_FOUND')
  }

  // ── ③ 产物在册：不制造"人点看板也答不了、agent 也覆盖不掉"的空票（REQ-261005200052-ce40 FR-5）──
  const kindArts = isArtifact ? (req.artifacts ?? []).filter(a => a.kind === input.kind) : []
  if (isArtifact && kindArts.length === 0) {
    reject('reqboard_ask_confirm 未执行：' + missingArtifactMessage(req.id, input.kind as ArtifactKind), 'REQBOARD_MISSING_ARTIFACT')
  }
  if (!isArtifact && req.plan === undefined) {
    reject('reqboard_ask_confirm 未执行：' + missingPlanMessage(req.id), 'REQBOARD_MISSING_PLAN')
  }

  // ── ④ 判定序：复用 → 早退 → 新建 ─────────────────────────────────────────────
  const port = deps.pendingConfirms
  const key = isArtifact
    ? { requirementId: req.id, target: 'artifact' as const, kind: input.kind as ArtifactKind }
    : { requirementId: req.id, target: 'plan' as const }
  const open = port?.findOpen(key)
  if (open !== undefined) return { mode: 'reused', ticket: open.ticket }

  const stamped = isArtifact
    ? kindArts.every(a => a.confirmedAt !== undefined)
    : req.plan?.approvedAt !== undefined
  if (stamped) return { mode: 'already-settled', confirmed: true }

  // ── ⑤ 新建（唯一有副作用的分支）──────────────────────────────────────────────
  // 建门之前先清掉**本窗口的异门陈旧票**（设计 B-3）：一道门一个窗口只留一条未作答记录。
  // 同门在这里不可能出现（④ 已复用并返回），所以本循环处理的必然是异门；清它们的理由是
  // 旧门会把四条写路径钉到 TTL——窗口被上一步留下的门钉死，正是 FR-9/FR-11 当初引入清理的原因。
  //
  // 为什么清理必须**长在这里**（t4 实测修正）：登记动作已经收进本函数，清理若留在 AskConfirm，
  // 走"沿用已建好的门"那条分支时会被整个跳过——异门旧票就永远钉在窗口上（TC-10b 当场红）。
  if (port !== undefined) {
    for (let stale = port.pendingForWindow(windowKey); stale !== undefined; stale = port.pendingForWindow(windowKey)) {
      port.settle(stale.ticket, { confirmed: false, advanced: false })
    }
  }
  const registered = port?.register({
    windowKey,
    requirementId: req.id,
    target: input.target,
    ...(isArtifact ? { kind: input.kind as ArtifactKind } : {}),
  })
  return {
    mode: 'opened',
    ticket: registered?.ticket ?? fmt('dlg-confirm-{id}-{at}', { id: req.id, at: deps.clock.now() }),
  }
}
