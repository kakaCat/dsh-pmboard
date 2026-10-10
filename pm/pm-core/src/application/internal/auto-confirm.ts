/**
 * 后台自动唤醒确认弹框（REQ-260929210741-30ae FR-1 / t4）。
 *
 * 提交产物后**非阻塞**触发确认弹框：用户在旁 → 2 秒宽限内直接作答（与原阻塞语义一致）；
 * 不在旁 → 迅速挂起 ticket，submit 立即返回，不拖住 agent 的回合。
 *
 * 为什么单独成模块：弹框的落章/推进实现只有一个（`use-cases/AskConfirm` → `internal/confirm-settle`），
 * 本文件只负责"后台 fire-and-forget 地调它"这一件事，避免各提交点各写一份赛跑逻辑。
 *
 * @module dsh-pmboard/application/internal/auto-confirm
 */
import type { UseCaseDeps } from '../ports.js'
import { askConfirm } from '../use-cases/AskConfirm.js'
import { requestGate } from './gate-request.js'
import { fmt } from '../../domain/text/fmt.js'
// REQ-261006094052-1da2 t3（serves: FR-3）：窄口径预判只用**既有单点**——
// 「本次推进的目标阶段」取 GateCatalog 的 advanceTargetFor，「是否缺原型」取原型存在门本体，
// 「什么算 UI 需求」由门自己去 category-doc-sets 判（本文件不另写一份判据）。
import { advanceTargetFor } from '../../domain/gate/GateCatalog.js'
import { checkPrototypePresenceGate } from './prototype-gates.js'
import { requirementStoreOf } from '../use-cases/queue-access.js'
import { applyRequirementWorkspaceRoot } from './support.js'

/** 赛跑宽限：2 秒——用户在旁会立刻看到弹框；不在旁迅速挂起 ticket 不拖 submit 返回。 */
const AUTO_CONFIRM_GRACE_MS = 2000

/** 自动唤醒入参（target/kind 与 reqboard_ask_confirm 同义）。 */
export interface AutoConfirmInput {
  requirementId: string
  /**
   * REQ-261006164732-6503 t3：由 `string` 收紧成门值域。
   * 为什么收紧而不是在函数里兜底：所有调用方本来就只传这两个字面量，收紧是**编译期**事实；
   * 写成 `string` 再运行时猜，等于把"传错了怎么办"留成一条静默分支。
   */
  target: 'artifact' | 'plan'
  kind: string
  question: string
}

export interface AutoConfirmResult {
  triggered: boolean
  /** 仅 triggered=false 时给出（通道探测失败）。 */
  reason?: string
}

/**
 * 后台触发确认弹框（fire-and-forget）。
 *
 * @returns `{triggered:true}`——实际落章/推进由 askConfirm 内部赛跑或挂起路径完成；
 *          通道探测失败或**本次推进注定进不去**（见下）时返回 `{triggered:false, reason}`。
 */
export async function triggerAutoConfirm(deps: UseCaseDeps, input: AutoConfirmInput, exec: unknown): Promise<AutoConfirmResult> {
  if (!deps.questions.available()) {
    return {
      triggered: false,
      reason: '弹框通道不可用（userQuestions 服务缺失）——请手动调 reqboard_ask_confirm',
    }
  }
  // ── REQ-261006094052-1da2 t3（serves: FR-3）：不制造注定失败的确认门 ────────────────
  // 只预判**原型存在门**这一道：本次确认要推进的目标是 design（brainstorming → design）、而需求
  // 声明了 frontend 端侧却没登记原型时，人确认了也进不去（推进被门拦下）——现场就是「人白答一次、
  // agent 还得再补一次确认」的死锁入口。此处早退**在登记任何挂起票之前**：挂起票会拦整个窗口的
  // 写路径（reqboard_submit / decompose / move），绝不能为一个进不去的确认钉上一张。
  //
  // 其余门（裁定门 / 内容门）**刻意不预判**：裁定门对**所有** feature 需求生效，宽口径会让一个新
  // feature 需求在写「讨论与裁定记录」节之前永远不被请人确认——等于把 REQ-261005200052-ce40
  // 决议 #13「确认章是可选加强」改成「下游齐了才配确认」。窄口径的代价与收益都写在这里。
  if (input.target === 'artifact') {
    const req = await requirementStoreOf(deps).get(input.requirementId)
    if (req !== undefined && advanceTargetFor(req.status) === 'design') {
      // 读盘前按需求工作区校正根（与 AskConfirm / confirm-settle 同款纪律）
      applyRequirementWorkspaceRoot(deps, req)
      const presence = await checkPrototypePresenceGate(deps.docs, req)
      if (presence !== undefined) return { triggered: false, reason: presence.message }
    }
  }
  // ── REQ-261006164732-6503 t3（serves: FR-1、FR-3）：建门唯一性判定早于**任何**投递 ──────────
  // 修前这里无条件 fire-and-forget 投递：人在宽限内没答时，agent 侧再发起一次确认就会变成**两个框**
  // （拆分门实测 16:42:06 自动框 + 16:42:10 agent 框）。现在先问建门唯一入口：已有在等的门 ⇒
  // 不再投递第二个框，如实回报「已有一道门在等（ticket=…）」；已落章 ⇒ 同样不投递。
  const gate = await requestGate(deps, {
    requirementId: input.requirementId,
    target: input.target,
    kind: input.kind,
    question: input.question,
    inlineGraceMs: AUTO_CONFIRM_GRACE_MS,
  }, exec)
  if (gate.mode === 'reused') {
    return { triggered: false, reason: fmt('该门已有一个在等的框（ticket={t}）：未重复弹框', { t: gate.ticket }) }
  }
  if (gate.mode === 'already-settled') {
    return { triggered: false, reason: '该门已落章：未重复弹框（以台账为准）' }
  }
  void (async () => {
    try {
      await askConfirm(deps, {
        requirement_id: input.requirementId,
        target: input.target,
        kind: input.kind,
        question: input.question,
        inline_grace_ms: AUTO_CONFIRM_GRACE_MS,
        // 门已由 requestGate 建好（opened）：沿用该 ticket，**不二次登记**（否则一道门两条记录）
        adopted_ticket: gate.ticket,
      }, exec)
    } catch (err) {
      // 失败要响亮：不静默吞掉，走失败告警端口留痕（告警本身失败也不影响主流程）。
      try {
        deps.alert?.alert({
          requirementId: input.requirementId,
          title: 'auto-confirm 触发失败',
          content: fmt('可手动 reqboard_ask_confirm：{msg}', { msg: String((err as Error).message ?? err) }),
        })
      } catch { /* 告警通道失败：不阻断 */ }
    }
  })()
  return { triggered: true }
}
