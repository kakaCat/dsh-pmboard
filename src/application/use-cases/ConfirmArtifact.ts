/**
 * ConfirmArtifact 用例（REQ-47939a t6）——从 host/agent-tools.ts 的 defineConfirmArtifactTool / reqboard_confirm_artifact 工厂**逐字搬入**编排。
 *
 * 零行为变更：拒绝条件、错误码与消息文案与搬迁前一致；规则仍单点于 domain/。
 *
 * @module dsh-pmboard/application/use-cases/ConfirmArtifact
 */
import type { UseCaseDeps } from '../ports.js'
import { canWrite, firstWritableBound, seatOfSummary } from '../../application/internal/window.js'
import { boundSummariesOf } from '../internal/binding-read.js'
import { coverageGateOf, syncRTMYaml } from '../internal/rtm-yaml.js'
import { requirementStoreOf, taskStoreOf, mutateIfPresent } from './queue-access.js'
import {
  ALL_ARTIFACT_KINDS,
  normalizeText,
} from '../../shared/protocol.js'
import { fmt } from '../../domain/text/fmt.js'
import { envelope } from '../internal/gate-feedback.js'
import { artifactsToConfirm } from '../internal/artifact-gates.js'
import { checkDesignCompletenessGate, checkDesignDecompositionGate, contentGatesForMove } from '../internal/content-gate-wiring.js'
import { advanceTargetFor, gateFromStage } from '../../domain/gate/GateCatalog.js'
import { canReqTransition } from '../../domain/requirement/RequirementStatus.js'
import type { RequirementStatus } from '../../shared/protocol.js'

// FR-10：确认推进后的 dive 复位（唯一写入口）

import {
  reject,
  agentIdFromExec,
  requireLiveDriver,
  applyRequirementWorkspaceRoot,
} from '../internal/support.js'
// REQ-261006164732-6503 t13（serves: FR-4）：文字证据路径与其余通道共用**首写纪律**
// （独立复核发现的漏网写点之一：原本拿一份文本证据就能覆写已落章的 confirmedAt / 证据原文）
import { applyConfirmedAdvance, stampArtifactOnce, stampPlanOnce } from '../internal/confirm-settle.js'
import { finishConfirmAdvance } from '../internal/confirm-advance-finish.js'

export async function confirmArtifact(deps: UseCaseDeps, args: unknown, exec: any): Promise<unknown> {
      const windowKey = agentIdFromExec(deps, exec)
      requireLiveDriver(deps, exec)
      const a = (args ?? {}) as { requirement_id?: unknown; target?: unknown; kind?: unknown; evidence?: unknown; advance?: unknown }
      const explicitId = normalizeText(a.requirement_id, 'requirement_id', 64)
      const targetKind = normalizeText(a.target, 'target', 32)
      const kindRaw = normalizeText(a.kind, 'kind', 64)
      const evidence = normalizeText(a.evidence, 'evidence', 2000)
      if (evidence.length === 0) {
        reject(
          'reqboard_confirm_artifact 未执行：必须附 evidence（用户在 ask_user_question 中的答复原文）'
          + '——会话确认靠它留痕可审计',
          'REQBOARD_INVALID_INPUT',
        )
      }
      // 文字确认核验（REQ-2e9473 t10 三通道③）：evidence 必须引用时间窗内真实存在的
      // 用户消息原文——agent 转述"用户同意了"不算数，系统要能独立见证用户意志。
      // 弹框答复请走 reqboard_ask_confirm（系统直接见证，免 evidence 引证）。
      let evidenceVerified: boolean | undefined
      // 端口封装核验通道：undefined = 缓冲未注入（搬迁前 deps.recentUserMsgs === undefined → 放行并标注）；
      // 返回结构 = 命中/未命中（含 reason）。时间窗由适配器内部统一（CONFIRM_EVIDENCE_WINDOW_MS），此处传值仅占位。
      const check = deps.session.matchesRecentUserMessage(windowKey, evidence, 60 * 60 * 1000)
      if (check !== undefined) {
        if (!check.ok) {
          // REQ-260924213231-b1c4 FR-2/I-9：文案走统一信封（what —— why。补齐：how），判定不动。
          reject(
            envelope({
              lead: 'reqboard_confirm_artifact 未执行：',
              what: '文字确认证据「' + evidence.slice(0, 60) + '」',
              why: '核验失败——' + check.reason + '（未命中该窗口真实用户消息）',
              how: '引用用户最近真实消息原文重调 reqboard_ask_confirm(evidence=...)；或改走弹框路径 reqboard_ask_confirm（系统直接见证，免引证）；兜底由用户在看板一键确认',
            }),
            'REQBOARD_EVIDENCE_FAKE',
          )
        }
        evidenceVerified = true
      }
      if (targetKind !== 'artifact' && targetKind !== 'plan') {
        reject('reqboard_confirm_artifact 未执行：target 只能是 artifact 或 plan', 'REQBOARD_INVALID_INPUT')
      }
      if (targetKind === 'artifact' && !(ALL_ARTIFACT_KINDS as readonly string[]).includes(kindRaw)) {
        reject(
          'reqboard_confirm_artifact 未执行：kind 必须是 ' + ALL_ARTIFACT_KINDS.join(' / '),
          'REQBOARD_INVALID_INPUT',
        )
      }

      // t8/B11：绑定读走新端口（只读摘要）
      const bound = await boundSummariesOf(requirementStoreOf(deps), windowKey)
      if (bound.length === 0) reject('reqboard_confirm_artifact 未执行：本窗口没有绑定中的需求', 'REQBOARD_NO_BOUND_REQ')
      const picked = explicitId.length > 0 ? bound.find(r => r.id === explicitId) : firstWritableBound(bound, windowKey)
      // FR-3：把关人工门（确认产物/计划）是 **owner-only**——worker 能备料，不能代替 owner 拍板。
      if (picked !== undefined) {
        const verdict = canWrite(seatOfSummary(picked, windowKey), 'confirm-gate')
        if (!verdict.ok) {
          reject('reqboard_confirm_artifact 未执行：本席位无权把关人工门（只有 owner 能确认产物）', verdict.code)
        }
      }
      if (picked === undefined) {
        reject(
          'reqboard_confirm_artifact 未执行：需求 ' + explicitId + ' 不是本窗口绑定的进行中需求',
          'REQBOARD_NOT_BOUND_TO_WINDOW',
        )
      }
      // 判据过了才取**整条**（下游要整条字段）；get() 可空 ⇒ 显式守卫
      const targetReq = await requirementStoreOf(deps).get(picked.id)
      if (targetReq === undefined) {
        reject(fmt('reqboard_confirm_artifact 未执行：需求 {id} 不在台账中', { id: picked.id }), 'REQBOARD_REQUIREMENT_NOT_FOUND')
      }

      // ── REQ-2d1c74 FR-3：确认 kind=design 落章前扫描拆分内容（三通道之一：文字证据）──
      if (targetKind === 'artifact' && kindRaw === 'design') {
        // REQ-260930193929-897b FR-1：读盘前按需求工作区校正根
        // （不校正时 list(design/) 在错误根下返回空数组 → 本门静默放行）。
        applyRequirementWorkspaceRoot(deps, targetReq)
        const scan = await checkDesignDecompositionGate(deps.docs, targetReq)
        if (scan !== undefined) reject(fmt('reqboard_confirm_artifact 未执行：{msg}', { msg: scan.message }), scan.code)
      }

      // ── REQ-261006164732-6503 t13（serves: FR-4）：文字证据路径的落章**首写纪律** ──────────────
      // 独立复核（reviews/independent-review.md 阻断-2）实测：这条路径原本没有守卫，拿一份文本证据
      // 就能把已落章产物的 confirmedAt / confirmedEvidence 覆写（实测 9 → 1000、证据原文被换）。
      //
      // 判据**只用首写纪律**（下方 stamp*Once），不按"迁移是否已发生"拒绝：本通道还承担**补章**职责
      // ——历史用例 `confirm-group.test.ts::非 design kind 维持首份落章` 钉着「阶段已推进、产物尚无章」
      // 时仍可补盖（那是有章可补，不是覆写）。

      // ── 门禁预检（FR-2 触发点 5 / FR-5）：实施覆盖度必须 100% 才允许批准计划 ──
      // 覆盖度来自 rtm-decomposing.yml（设计章节 → 台账任务）。⚠️ 本构建里"批准计划"先于
      // "拆分落库"，故此时台账通常还没有任务 → total=0 不拦截（coverageGateOf 的边界语义）；
      // 只有在任务已先落库的流程下才真正执法。这一数据流限制见验收文档"已知缺口"。
      // 存量/直种需求（artifacts 为空）豁免——与本仓既有口径一致。
      if (targetKind === 'plan' && (targetReq.artifacts ?? []).length > 0) {
        const planGateProbe = await syncRTMYaml(deps, await taskStoreOf(deps).listByRequirement(targetReq.id), targetReq.id, 'confirm:plan')
        const implGate = coverageGateOf('decomposing', planGateProbe)
        if (implGate !== undefined && !implGate.passed) {
          reject(
            'reqboard_confirm_artifact(target=plan) 被实施覆盖度门禁拒绝：' + (implGate.message ?? '实施覆盖度不足')
              + '。请为缺少任务的设计章节补上覆盖任务后重新提交计划。',
            'REQBOARD_IMPLEMENTATION_COVERAGE_GATE',
          )
        }
      }

      const nowTs = deps.clock.now()
      // FR-7（REQ-261003222428-3556 / N-3）：落章清单带出 mutate——回执如实列出盖了哪些产物
      // （成组 kind 一次可能盖 N 份，回执只说"确认了"就是黑箱）。
      let stampedPaths: string[] = []
      const result = await mutateIfPresent(requirementStoreOf(deps), targetReq.id, (req) => {
        if (targetKind === 'artifact') {
          // REQ-2d1c74 FR-2 + REQ-261003222428-3556 FR-7：成组 kind 一次全落章（GROUP_CONFIRM_KINDS 单一事实源）
          const arts = artifactsToConfirm(req, kindRaw as never)
          if (arts.length === 0) {
            reject(
              'reqboard_confirm_artifact 未执行：需求 ' + req.id + ' 没有 kind=' + kindRaw
              + ' 的产物（请先提交该阶段产物）',
              'REQBOARD_MISSING_ARTIFACT',
            )
          }
          stampedPaths = arts.map(x => x.path)
          let stampedNow = 0
          for (const art of arts) {
            // REQ-261006164732-6503 t13：首写即事实（共用单点，不再自写守卫）
            if (stampArtifactOnce(art, nowTs, {
              by: { kind: 'human', sessionId: windowKey },
              via: 'session',
              evidence,
            })) stampedNow += 1
          }
          // REQ-261006164732-6503 t13：评论只在**真的盖上**时才写——否则重复提交证据会反复留
          // 「人已确认」的假记录（复核阻断-2 的现场就是这么留下第二条批准记录的）
          if (stampedNow > 0) {
            req.comments.push({
              id: deps.ids.comment(),
              body: fmt('[产物确认·会话] 人经 ask_user_question 确认产物（kind={kind}{group}）：{paths}\n答复原文：{ev}', {
                kind: kindRaw,
                group: arts.length > 1 ? fmt('，成组确认 {n} 份', { n: arts.length }) : '',
                paths: arts.map(x => x.path).join('、'),
                ev: evidence,
              }),
              createdAt: nowTs,
              createdBy: { kind: 'human', sessionId: windowKey },
            })
          }
        } else {
          if (req.plan === undefined) {
            reject('reqboard_confirm_artifact 未执行：需求 ' + req.id + ' 还没有拆分计划', 'REQBOARD_MISSING_PLAN')
          }
          // REQ-261006164732-6503 t13：首写即事实（计划侧共用单点）——不再无条件赋值
          stampPlanOnce(req.plan, nowTs, {
            by: { kind: 'human', sessionId: windowKey },
            via: 'session',
            evidence,
          })
          delete req.plan.rejectedAt
          delete req.plan.rejectedReason
          req.comments.push({
            id: deps.ids.comment(),
            body:
              '[计划] 已批准（会话确认）：' + req.plan.tasks.length + ' 个任务'
              + '\n答复原文：' + evidence,
            createdAt: nowTs,
            createdBy: { kind: 'human', sessionId: windowKey },
          })
        }
        req.version += 1
        req.updatedAt = nowTs
        req.updatedBy = { kind: 'human', sessionId: windowKey }
        return { changed: true }
      })
      const changed = result?.requirement
      if (changed === undefined) reject('reqboard_confirm_artifact 写入失败：台账状态异常', 'REQBOARD_STORE_INCONSISTENT')
      // RTM 触发点 3/5：确认产物 / 批准计划 → 对应 RTM 落章
      await syncRTMYaml(deps, await taskStoreOf(deps).listByRequirement(changed.id), changed.id, targetKind === 'artifact' ? 'confirm:artifact' : 'confirm:plan')

      // ── FR-13（REQ-260927100007-b8ba）：落章后**必须能推进** ────────────────────
      // 事故：证据路径只落章，返回 note 指向未注册的 `reqboard_move`；而弹框路径因
      // "产物已确认"早返回 → 门放行了、节点却永远停在原地（静默死锁）。
      // 现在与看板/弹框四路径同语义：落章后按 `advanceTargetFor(from)` 推进，
      // 且**护栏要求被确认的 kind 正是该门要求的 kind**（防"再点一次 = 连跳两格"）。
      // 说明：本块只处理 artifact；plan 的"落章 + 落库 + 进实施"门合并在 confirm-settle（弹框路径），
      // 其落库修复见 FR-1，未落实前不得在此单推进计划。
      let advanced = false
      let advanceNote = ''
      /** 被内容门 / G2 拦下时的结构化缺口（落章保留、推进被拦 → 如实回执，不静默）。 */
      let gateFailureOut: { message: string; code?: string; gaps?: string[] } | undefined
      if (a.advance !== false && targetKind === 'artifact') {
        const gate = gateFromStage(changed.status)
        const gateMatches = gate !== undefined && gate.requiredKind === kindRaw
        const to = advanceTargetFor(changed.status)
        if (!gateMatches) {
          advanceNote = fmt('；未推进：kind={kind} 与当前门要求的产物不符', { kind: kindRaw })
        } else if (to === undefined) {
          advanceNote = fmt('；未推进：当前状态 {s} 无可自动推进的下一阶段', { s: changed.status })
        } else if (!canReqTransition(changed.status as never, to as never)) {
          advanceNote = fmt('；未推进：{from} → {to} 不在状态表内', { from: changed.status, to })
        } else {
          // ── REQ-261005105032-3b02 §10 #46：唯一 async 内容门 ─────────────────────
          // 调用顺序照 interfaces.md 钉死：① 同步门（上面 gateMatches / canReqTransition 已过）
          // → ② contentGatesForMove → ③ 既有 designGateFailure（G2）兜底。
          // 失败只**不推进**（落章保留：确认动作本身有效），缺口经 advanceNote + gate_failure 如实告知。
          let gateFailure: { message: string; code?: string; gaps?: string[] } | undefined =
            await contentGatesForMove(deps.docs, changed, changed.status, to as never, {
              ...(deps.session !== undefined ? { sessionProbe: deps.session } : {}),
            })
          if (gateFailure === undefined && gate.id === 'G2') {
            // REQ-260930193929-897b FR-1：读盘前按需求工作区校正根
            applyRequirementWorkspaceRoot(deps, changed)
            gateFailure = await checkDesignCompletenessGate(deps.docs, changed)
          }
          if (gateFailure !== undefined) {
            advanceNote = '；' + gateFailure.message
            gateFailureOut = gateFailure
          } else {
            // t3（REQ-261007135258-331a FR-2）：推进改调**唯一实现** `applyConfirmedAdvance`
            // —— 它内含统一收尾（清停手位 + 复位运行时健康）。本路径此前只有"自己的 dive 复位"、
            // 完全不碰停手位：人在弹框里确认过（留下 awaiting-confirm:*）之后再走证据路径，
            // 台账停手位没人清 ⇒ 链永远不动（这正是 2026-10-07 那次 2.5 小时静默停摆的一半成因）。
            const advanceOut = await applyConfirmedAdvance(deps, {
              requirementId: changed.id,
              windowKey,
              from: changed.status as RequirementStatus,
              to: to as RequirementStatus,
              nowTs: deps.clock.now(),
              reason: fmt('会话确认产物（kind={kind}，evidence 已核验）即推进', { kind: kindRaw }),
              commentBody: fmt('会话确认产物（kind={kind}，evidence 已核验）', { kind: kindRaw }),
              sourceLabel: 'evidence',
            })
            advanced = advanceOut.advanced
            advanceNote = advanceOut.advanceNote
          }
        }
      }
      // ── FR-10（REQ-261003215944-9e04）：未推进时补一次收尾 ────────────────────
      // 已推进 ⇒ 单点内部已收尾（含清停手位），本处不重复；未推进（门拦下 / kind 不符 /
      // 无可推进目标）⇒ 由本处补一次收尾，`stageChanged:false`（域规则只复位健康位、
      // 不归零 roundsInStage——FR-10 既有语义逐字保留）。
      if (!advanced) {
        await finishConfirmAdvance(deps, {
          requirementId: changed.id,
          windowKey,
          from: changed.status as RequirementStatus,
          to: (advanceTargetFor(changed.status) ?? changed.status) as RequirementStatus,
          nowTs: deps.clock.now(),
          stageChanged: false,
        })
      }
      return {
        success: true,
        requirement_id: changed.id,
        target: targetKind,
        kind: targetKind === 'artifact' ? kindRaw : '',
        via: 'session',
        advanced,
        // FR-7 / N-3：落章清单（成组确认时 >1 份；plan 分支无产物 → 省略键，无损 JSON 纪律）
        ...(stampedPaths.length > 0 ? { stamped: stampedPaths } : {}),
        ...(evidenceVerified === true ? { evidence_verified: true } : {}),
        // §10 #46：门拦下推进时的结构化缺口（advanceNote 已含可读消息；键缺省 = 没被拦）
        ...(gateFailureOut !== undefined ? { gate_failure: gateFailureOut } : {}),
        note: (targetKind === 'artifact'
          ? '产物已确认（via=session），对应门已放行'
          : '计划已批准（via=session），可用 reqboard_move 推进到 decomposing')
          + (advanced ? '；已推进' : '') + advanceNote
          + (evidenceVerified === true ? '；文字确认已核验（命中真实用户消息）' : '；⚠️ 文字确认核验未启用（recentUserMsgs 未注入）——建议改用 reqboard_ask_confirm'),
      }
    }
