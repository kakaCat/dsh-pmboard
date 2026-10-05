/**
 * 确认裁决应用（REQ-260924213231-b1c4 T-6 · serves: FR-3）——「落章 + 推进」的**唯一实现**。
 *
 * 为什么要抽出来：同一条「肯定作答 → 落章 → 推进（含批准拆分计划的门合并自动拆分）」
 * 既要在**宽限内同步**走，也要在**超宽限的后台续跑**里走；两份实现必然漂移。故
 * AskConfirm（宽限赛跑）与 ConfirmReceipt（后台落章）都调本模块，返回语义与改造前
 * 逐字一致（note / gate_failure / advanced / from / to）。
 *
 * @module dsh-pmboard/application/internal/confirm-settle
 */
import type { UseCaseDeps } from '../ports.js'
import { canReqTransition } from '../../shared/protocol.js'
import { fmt } from '../../domain/text/fmt.js'
import { advanceTargetFor, gateForTransition } from '../../domain/gate/GateCatalog.js'
import { checkDesignCompletenessGate, checkDesignDecompositionGate } from './content-gate-wiring.js'
import { landApprovedPlan } from './approved-plan-landing.js'
import { artifactsToConfirm, type GateFailure } from './artifact-gates.js'
import { captureSnapshot, transitionRequirement } from './token-usage.js'
// import { executeDecompose } from '../use-cases/Decompose.js' // 已改用 deps.jobs.start（REQ-260925212722-96e7 t-003dc5）
import { stampCheckpoint } from './interruption.js'
import { applyRequirementWorkspaceRoot, reject } from './support.js'

/** 通用确认推进的留痕原因（确认回执据此从 statusHistory 还原 from → to，单点定义）。 */
export const CONFIRM_ADVANCE_REASON = '确认弹框后自动推进（reqboard_ask_confirm）'
/** 批准拆分计划的门合并推进原因（同上，单点定义）。 */
export const PLAN_MERGE_ADVANCE_REASON = '批准拆分计划后自动进入实施（拆分确认门已并入批准门）'

/** 一次已作答的确认请求（同步与后台共用同一入参形状）。 */
import { syncRTMYaml } from './rtm-yaml.js'
import { requirementStoreOf, taskStoreOf, mutateIfPresent } from '../use-cases/queue-access.js'
import { advanceRequirement } from '../use-cases/AdvanceChain.js'
// FR-10：确认推进后的 dive 复位（唯一写入口）
import { applyDiveTransition } from '../dive/applyDiveTransition.js'
import { dispatchNoteOf } from './auto-advance-note.js'
// REQ-261002141430-a5ef FR-3：三条确认通道的唯一收敛点上解除等待（人已作答）
import { exitAwaitingConfirm } from './awaiting-confirm.js'

export interface ConfirmDecision {
  requirementId: string
  windowKey: string
  target: 'artifact' | 'plan'
  kind: string
  /** 弹框题干原文（留痕/证据用） */
  question: string
  /** 用户选中的选项 label（肯定项 = optionLabels[0]） */
  picked: string
  nowTs: number
  /** 是否允许自动推进（同 ask_confirm 的 advance 参数） */
  advance: boolean
}

/** 裁决应用结果（AskConfirm 与后台落章都据此组装返回体/回执）。 */
export interface ConfirmDecisionOutcome {
  from: string
  to: string
  advanced: boolean
  gateFailure?: GateFailure
  /** '已落章（via=session）' + 推进/缺口/自动开跑说明（逐字沿用改造前拼接） */
  note: string
}

/** 非肯定作答的留痕（同步路径与后台续跑共用；原 AskConfirm 内联块逐字搬入）。 */
export async function recordDeclinedConfirmation(
  deps: UseCaseDeps,
  input: { requirementId: string; windowKey: string; question: string; picked: string; userFeedback: string; nowTs: number },
): Promise<void> {
  const feedbackNote = input.userFeedback.length > 0 ? fmt('。用户意见：{fb}', { fb: input.userFeedback }) : ''
  await mutateIfPresent(requirementStoreOf(deps), input.requirementId, (req) => {
    req.comments.push({
      id: deps.ids.comment(),
      body: '[确认弹框] 用户未确认（选择：' + (input.picked || '（未选）') + '）——节点未推进。问题：' + input.question + feedbackNote,
      createdAt: input.nowTs,
      createdBy: { kind: 'human', sessionId: input.windowKey },
    })
    req.updatedAt = input.nowTs
    // FR-6 写入器 A（T-9）：未确认也是一次交棒——断点写 checkpoint，pendingAction 重算为
    // 「再发一次 ask_confirm」（状态未变），随后被 turn/end 的异常原因覆盖。
    stampCheckpoint(req, input.nowTs, 'reqboard_ask_confirm')
    return { changed: true }
  })
}

/**
 * 应用一次**肯定**作答：落章（artifact 成组 / plan 批准）→ 可选推进 → 拆分计划门合并开跑。
 * 任一步被闸门拒绝即抛（调用方按同步/后台两种语境处置）。行为与改造前 askConfirm 内联块逐字一致。
 */
export async function applyConfirmDecision(
  deps: UseCaseDeps,
  exec: unknown,
  d: ConfirmDecision,
): Promise<ConfirmDecisionOutcome> {
  const targetKind = d.target
  const kindRaw = d.kind
  const nowTs = d.nowTs
  const before = await requirementStoreOf(deps).get(d.requirementId)
  if (before === undefined) {
    reject('reqboard_ask_confirm 未执行：需求 ' + d.requirementId + ' 不在台账中', 'REQBOARD_STORE_INCONSISTENT')
  }

  // ── REQ-261002141430-a5ef FR-3：**人已作答**（走到这里就说明裁决到了）→ 先解除等待 ──
  // 为什么放在本函数开头：这里是弹框 / 看板 / 文字证据三条确认通道的**唯一收敛点**，
  // 一处覆盖三条路；放在开头是因为"等待已经结束"与后续落章/推进是否成功无关——
  // 推进失败也不该把 agent 冻在"等人"上。
  void exitAwaitingConfirm(
    {
      // B12 阶段②c：写入走新端口（未装配则 requirementStoreOf 响亮抛错）
      store: requirementStoreOf(deps),
      ...(deps.dialogs === undefined ? {} : { dialogs: deps.dialogs }),
      now: () => deps.clock.now(),
      ...(deps.alert === undefined ? {} : { alert: deps.alert }),
    },
    { requirementId: d.requirementId, reason: 'board' },
  )

  // ── REQ-2d1c74 FR-3：确认 kind=design 落章前扫描拆分内容（三通道之一：会话弹框）──
  // 用户已作答，但检出拆分内容即拒——不落章、不推进（扫描只读，无副作用）
  if (targetKind === 'artifact' && kindRaw === 'design') {
    // REQ-260930193929-897b FR-1：读盘前按需求工作区校正根。
    // 不校正时 list(design/) 在错误根下返回空数组 → 本门**静默放行**（漏放本应拦下的拆分内容）。
    applyRequirementWorkspaceRoot(deps, before)
    const scan = await checkDesignDecompositionGate(deps.docs, before)
    if (scan !== undefined) reject(fmt('reqboard_ask_confirm 未执行：{msg}', { msg: scan.message }), scan.code)
  }

  // ── 肯定项：落章（与 reqboard_confirm_artifact 同语义）────────────────
  const evidence = '用户在 reqboard_ask_confirm 弹框（问题："' + d.question + '"）中选择"' + d.picked + '"'
  await mutateIfPresent(requirementStoreOf(deps), d.requirementId, (req) => {
    if (targetKind === 'artifact') {
      // REQ-2d1c74 FR-2：kind=design 成组落章（全部 design 产物一次确认）
      const arts = artifactsToConfirm(req, kindRaw as never)
      if (arts.length === 0) {
        throw Object.assign(
          new Error('需求 ' + req.id + ' 没有 kind=' + kindRaw + ' 的产物（请先提交该阶段产物）'),
          { code: 'REQBOARD_MISSING_ARTIFACT' },
        )
      }
      for (const art of arts) {
        art.confirmedAt = nowTs
        art.confirmedBy = { kind: 'human', sessionId: d.windowKey }
        art.confirmedVia = 'session'
        art.confirmedEvidence = evidence
      }
    } else {
      if (req.plan === undefined) {
        throw Object.assign(new Error('需求 ' + req.id + ' 还没有拆分计划'), { code: 'REQBOARD_MISSING_PLAN' })
      }
      req.plan.approvedAt = nowTs
      req.plan.approvedBy = { kind: 'human', sessionId: d.windowKey }
      req.plan.approvedVia = 'session'
      req.plan.approvedEvidence = evidence
      delete req.plan.rejectedAt
      delete req.plan.rejectedReason
    }
    req.comments.push({
      id: deps.ids.comment(),
      body: '[确认弹框] 用户确认（' + (targetKind === 'artifact' ? 'kind=' + kindRaw : '批准计划') + '）：' + evidence,
      createdAt: nowTs,
      createdBy: { kind: 'human', sessionId: d.windowKey },
    })
    req.updatedAt = nowTs
    req.updatedBy = { kind: 'human', sessionId: d.windowKey }
    // FR-6 写入器 A（T-9）：落章即写 checkpoint（下一步由状态+产物态重算；后续推进覆盖之）。
    stampCheckpoint(req, nowTs, 'reqboard_ask_confirm')
    return { changed: true }
  }).catch((err: unknown) => {
    reject('reqboard_ask_confirm 落章失败：' + ((err as Error).message ?? String(err)), (err as { code?: string }).code ?? 'REQBOARD_STORE_INCONSISTENT')
  })

  // ── 推进（可选，限白名单转移）───────────────────────────────────────
  // RTM 触发点 3/5：确认落章后同步 RTM（ask_confirm 弹框与看板确认都走这里）
  // D4：syncRTMYaml 第 2 参 tasks（RTM 的任务视图随 v9 改读队列）。
  await syncRTMYaml(deps, await taskStoreOf(deps).listByRequirement(d.requirementId), d.requirementId, targetKind === 'artifact' ? 'confirm:artifact' : 'confirm:plan')

  const from = (await requirementStoreOf(deps).getSummary(d.requirementId))?.status ?? before.status
  const to = advanceTargetFor(from)
  let advanced = false
  let advanceNote = ''
  // 2026-09-21：批准拆分计划（target=plan 且已在拆分阶段）不走通用推进——
  // 须先拆分落库再进实施（顺序在下方「门合并」块里保证）
  const planInDecomposing = targetKind === 'plan' && from === 'decomposing'
  // REQ-2d1c74 FR-2：G2 弹框确认后的自动推进先过文档集完整性闸门（四路径之一）。
  // 落章保留（确认动作有效），推进可拦——缺口经返回体 gate_failure 如实告知。
  let designGateFailure: GateFailure | undefined
  if (d.advance && to !== undefined && !planInDecomposing && gateForTransition(from, to)?.id === 'G2') {
    const fresh = await requirementStoreOf(deps).get(d.requirementId)
    if (fresh !== undefined) {
      // REQ-260930193929-897b FR-1：读盘前按需求工作区校正根
      // （本行即事故中真正被误拦的那一步：报「requirement.md 不存在」而文件在盘上）。
      applyRequirementWorkspaceRoot(deps, fresh)
      designGateFailure = await checkDesignCompletenessGate(deps.docs, fresh)
    }
  }
  if (designGateFailure !== undefined) {
    advanceNote = '；design → decomposing 未推进：' + designGateFailure.message
  } else if (d.advance && to !== undefined && !planInDecomposing && canReqTransition(from, to as never)) {
    try {
      await mutateIfPresent(requirementStoreOf(deps), d.requirementId, (req) => {
        if (req.status !== from) return undefined
        // REQ-b545fe t3：使用唯一迁移助手
        transitionRequirement(req, to as never, {
          at: nowTs,
          actor: { kind: 'human', sessionId: d.windowKey },
          reason: CONFIRM_ADVANCE_REASON,
          snap: captureSnapshot(deps, d.windowKey),
        })
        req.comments.push({
          id: deps.ids.comment(),
          body: '[自动推进] ' + from + ' → ' + to + '：确认弹框肯定答复（reqboard_ask_confirm 原子推进）',
          createdAt: nowTs,
          createdBy: { kind: 'human', sessionId: d.windowKey },
        })
        stampCheckpoint(req, nowTs, 'reqboard_ask_confirm')
        return { changed: true }
      })
      advanced = true
    } catch (err) {
      advanceNote = '；推进失败：' + ((err as Error).message ?? String(err))
    }
  } else if (d.advance) {
    advanceNote = '；当前状态 ' + from + ' 无可自动推进的下一阶段（验收/归档走验收单流程）'
  }

  // ── FR-10（REQ-261003215944-9e04）：确认推进之后，让自动链真的能接着跑 ─────────
  // 现场观感是「人工门确认后不自动续跑」——因为确认路径原先完全不碰 dive：
  //   · 跨阶段：阶段推进已把回合计数归零（transitionRequirement 里的 advance-stage），
  //     但**运行时暂停位（driverHealth=paused）没人复位** → 链仍停着；
  //   · 同阶段：什么都没发生 → 达上限停下后，人确认了也照样不动。
  // 这里统一走 `confirm-advance` 事件（规则在 domain/dive/transition.ts）：复位健康位、
  // 按需归零，**绝不改写 activation**——确认这道门不等于同意自动跑（那是看板「继续」的事）。
  await applyDiveTransition(
    { store: requirementStoreOf(deps), now: () => deps.clock.now() },
    d.requirementId,
    'confirm-advance',
    { kind: 'human', sessionId: d.windowKey },
    { stageChanged: advanced && to !== undefined && to !== from, status: from },
  )

  // ── REQ-4842fe t10：批准拆分计划 = 落章 + 拆分落库 + 开跑（门合并，FR-16）────
  // 2026-09-21 用户裁定（w-2105d331 代录）：拆分计划挪到**拆分阶段**提交与批准——
  // 本块在 from=decomposing 时生效：先落章 decomposition 产物（拆分计划本体）→
  // 自动落库任务卡 → 自动进实施 + autoRun=true → 触发首个推进事件，中途不再打断。
  // （legacy：design 阶段批准的旧计划走通用推进到 decomposing，之后在拆分阶段手动
  //   reqboard_decompose + 确认 decomposition 产物，退化为门合并前的两步流程。）
  let autoNote = ''
  if (targetKind === 'plan' && from === 'decomposing') {
    // ── 门合并第一步：decomposition 产物落章（拆分清单不再单独弹「确认」）───────────
    await mutateIfPresent(requirementStoreOf(deps), d.requirementId, (req) => {
      const art = (req.artifacts ?? []).find(x => x.kind === 'decomposition')
      if (art !== undefined) {
        art.confirmedAt = nowTs
        art.confirmedBy = { kind: 'human', sessionId: d.windowKey }
        art.confirmedVia = 'session'
        art.confirmedEvidence = evidence
      }
      req.comments.push({
        id: deps.ids.comment(),
        body: fmt('[门合并] 批准拆分计划：decomposition 产物自动落章（不再单独弹「确认拆分清单」）', {}),
        createdAt: nowTs,
        createdBy: { kind: 'human', sessionId: d.windowKey },
      })
      req.updatedAt = nowTs
      return { changed: true }
    })

    // ── 门合并第二步：**同步落库任务卡**（REQ-260927100007-b8ba FR-1）────────────
    // 旧实现把落库委托给 Dive 续跑（createdCount=0），而实际需求 dive=null、全仓无人 armed →
    // 委托从未被触发：台账 0 任务、看板拆分节点 DAG 空白、实施覆盖度为 0，且零告警静默数日
    // （这正是用户实测报的「拆分确认没有 DAG 层级展示」）。
    // 现改为：批准的同一次调用内先落库、落库成功才推进；任一步失败 → 不推进 + 响亮留痕。
    try {
      const tools = (exec as { tools?: { todo_write?: (a: unknown) => Promise<unknown> } } | undefined)?.tools
      // 落库编排的唯一实现（REQ-261002164800-d8f2 t3 / FR-1）：取数单点 + FR 覆盖硬门 + 幂等都在里面。
      // 本块此前把这三件事各写一遍（并在卡级缺引用时抛错拒绝**整批**），是本需求要收敛的重复实现。
      const landed = await landApprovedPlan(deps, {
        requirementId: d.requirementId,
        windowKey: d.windowKey,
        nowTs,
        source: 'confirm',
        ...(tools === undefined ? {} : { tools }),
      })
      // 幂等（死锁修复配套）：G3 重弹框确认时任务卡通常已落库——不得重复拆分，
      // 直接抛给下方 catch 的"已落库 → 仍推进"路径进入实施（不产生幽灵卡）。
      if (landed.alreadyLanded > 0) {
        throw Object.assign(
          new Error(fmt('该需求已落库 {n} 个未取消任务，跳过重复拆分（幂等）', { n: landed.alreadyLanded })),
          { code: 'REQBOARD_ALREADY_DECOMPOSED' },
        )
      }
      const createdCount = landed.createdCount
      // 落库成功的同一调用内推进到实施（原子：要么真的落库并推进，要么响亮地失败）
      await mutateIfPresent(requirementStoreOf(deps), d.requirementId, (req) => {
        if (req.status !== 'decomposing') return undefined
        transitionRequirement(req, 'implementing', {
          at: nowTs,
          actor: { kind: 'human', sessionId: d.windowKey },
          reason: PLAN_MERGE_ADVANCE_REASON,
          snap: captureSnapshot(deps, d.windowKey),
        })
        req.autoRun = true
        req.comments.push({
          id: deps.ids.comment(),
          body: fmt('[自动开跑] 批准拆分计划 → 自动拆分 {n} 张卡并落库 → 自动进入实施（autoRun=true）', { n: createdCount }),
          createdAt: nowTs,
          createdBy: { kind: 'human', sessionId: d.windowKey },
        })
        stampCheckpoint(req, nowTs, 'reqboard_ask_confirm')
        return { changed: true }
      })
      advanced = true
      autoNote = fmt('；已同步落库 {n} 张任务卡并推进到 implementing', { n: createdCount })
      // FR-6：卡级无落点不拦，但必须在**两处**可见——回执里（调用方当场看到）与需求评论（看板上看得见）。
      // 只写回执等于把"这批卡的引用是空的"藏进一次性返回体里，事后没人查得到。
      if (landed.warning !== undefined) {
        autoNote += '；' + landed.warning
        await mutateIfPresent(requirementStoreOf(deps), d.requirementId, (r) => {
          r.comments.push({
            id: deps.ids.comment(),
            body: landed.warning as string,
            createdAt: nowTs,
            createdBy: { kind: 'system' },
          })
          r.updatedAt = nowTs
          return { changed: true }
        })
      }
      
      // 🆕 立即触发任务执行（不等 Dive 续跑）
      try {
        autoNote += dispatchNoteOf(await advanceRequirement(deps, d.requirementId, exec))
      } catch (err) {
        // 触发失败不阻断推进，只留痕
        autoNote += fmt('；触发任务执行失败（可手动 reqboard_task_run）：{msg}', { msg: String((err as Error).message ?? err) })
      }
    } catch (err) {
      const errMsg = String((err as Error).message ?? err)
      const taskCount = (await taskStoreOf(deps).listByRequirement(d.requirementId)).filter(t => t.status !== 'canceled').length
      if (taskCount > 0) {
        // 落库已生效（后续文档/RTM 步骤失败）——仍推进，避免「卡已落、状态卡在拆分」的半迁移态
        try {
          await mutateIfPresent(requirementStoreOf(deps), d.requirementId, (req) => {
            if (req.status !== 'decomposing') return undefined
            transitionRequirement(req, 'implementing', {
              at: nowTs,
              actor: { kind: 'human', sessionId: d.windowKey },
              reason: PLAN_MERGE_ADVANCE_REASON,
              snap: captureSnapshot(deps, d.windowKey),
            })
            req.autoRun = true
            req.comments.push({
              id: deps.ids.comment(),
              body: fmt('[自动开跑] 批准拆分计划 → 已落库 {n} 张卡（收尾步骤报错：{msg}）→ 自动进入实施', { n: taskCount, msg: errMsg }),
              createdAt: nowTs,
              createdBy: { kind: 'human', sessionId: d.windowKey },
            })
            return { changed: true }
          })
          advanced = true
          autoNote = fmt('；已落库 {n} 张任务卡并推进到 implementing（收尾步骤报错：{msg}）', { n: taskCount, msg: errMsg })
          
          // 🆕 立即触发任务执行（不等 Dive 续跑）
          try {
            autoNote += dispatchNoteOf(await advanceRequirement(deps, d.requirementId, exec))
          } catch (err) {
            autoNote += fmt('；触发任务执行失败（可手动 reqboard_task_run）：{msg}', { msg: String((err as Error).message ?? err) })
          }
        } catch (err2) {
          autoNote = fmt('；落库收尾与推进均失败：{msg}', { msg: String((err2 as Error).message ?? err2) })
        }
      } else {
        autoNote = fmt('；自动拆分/开跑失败（计划已批准，可手动调 reqboard_decompose 重试）：{msg}', {
          msg: errMsg,
        })
        // FR-2：失败响亮化——系统评论（含恢复指引）+ advance.pausedReason + 高优告警；**不推进**
        await mutateIfPresent(requirementStoreOf(deps), d.requirementId, (req) => {
          req.comments.push({
            id: deps.ids.comment(),
            body: fmt(
              '[自动开跑失败] {reason}。\n\n恢复路径（两条都可执行）：① 按上面的原因修好计划文档的「覆盖对照表」（或把确实不做的条款在需求文档里标「本轮不做」）后，手动调 reqboard_decompose(requirement_id="{reqId}") 重试；② 在看板点「拆分」按钮重试。\n若只是个别卡缺条款引用（卡已落库），用 reqboard_task_refs 补写即可。',
              { reason: errMsg, reqId: d.requirementId },
            ),
            createdAt: nowTs,
            createdBy: { kind: 'system' },
          })
          if (req.advance === undefined) req.advance = {}
          req.advance.pausedReason = 'auto_decompose_failed: ' + errMsg
          req.updatedAt = nowTs
          return { changed: true }
        })
        deps.alert?.alert({
          requirementId: d.requirementId,
          title: '自动开跑失败',
          content: fmt('需求 {id} 批准计划后自动拆分/开跑失败：{msg}', { id: d.requirementId, msg: errMsg }),
        })
      }
    }
  }

  return {
    from,
    to: (advanced ? to : from) as string,
    advanced,
    ...(designGateFailure !== undefined ? { gateFailure: designGateFailure } : {}),
    note: '已落章（via=session）'
      + (advanced ? '，已推进：' + from + ' → ' + to : '')
      + advanceNote
      + autoNote,
  }
}
