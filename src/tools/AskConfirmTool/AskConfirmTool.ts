/**
 * reqboard_ask_confirm 工具壳（REQ-47939a t8）——**confirm_artifact 并入 ask_confirm**。
 *
 * 三条路径与现状逐一对应：① evidence 非空 → ConfirmArtifact（文字证据核验）；
 * ② evidence 为空 + 弹框可用 → AskConfirm（弹框落章+推进）；
 * ③ 弹框不可用 → AskConfirm 内部返回 fallback=board。返回键为两个用例的并集。
 *
 * REQ-260924213231-b1c4 FR-3（I-3）：弹框路径非阻塞——宽限内作答返回体逐字不变；
 * 超宽限返回 \`pending=true + ticket\`（**不判失败**），随后用 reqboard_confirm_receipt 取回执。
 *
 * @module dsh-pmboard/tools/AskConfirmTool
 */
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import { LIMITS } from '../../domain/limits.js'
import type { UseCaseDeps } from '../../application/ports.js'
import { askConfirm } from '../../application/use-cases/AskConfirm.js'
import { confirmArtifact } from '../../application/use-cases/ConfirmArtifact.js'
import { normalizeText } from '../../shared/protocol.js'
import { renderSmart } from '../shared.js'
import { askConfirmSummary } from '../render-summaries.js'
import { ASK_CONFIRM_PROMPT } from './prompt.js'

export function defineAskConfirmTool(deps: UseCaseDeps) {
  return defineTool({
    name: 'reqboard_ask_confirm',
    description: ASK_CONFIRM_PROMPT,
    parameters: {
      requirement_id: { type: 'string', description: '需求 id（REQ-xxxxxx）；不传默认本窗口绑定的需求' },
      target: { type: 'string', description: 'artifact（确认产物）| plan（批准拆分计划）', required: true },
      kind: { type: 'string', description: '产物类型（target=artifact 时必填）：requirement/design/plan/decomposition/verification/archive' },
      question: { type: 'string', description: '弹框问题（写清确认什么、确认后会发生什么；弹框路径必填）；写法：每条短句（建议 ≤60 字）；需引号用「」避免半角双引号；文本过大拆成多次调用' },
      options: {
        type: 'array',
        description: '选项标签列表（第一个 = 肯定项，确认后落章+推进；缺省：确认推进/需要修改/暂停）',
        items: { type: 'string' },
      },
      advance: { type: 'boolean', description: '确认后是否自动推进到下一阶段（默认 true）' },
      evidence: { type: 'string', description: '文字证据路径：用户在 ask_user_question 中的确认答复原文（必填于该路径，须命中真实用户消息）' },
      inline_grace_ms: { type: 'number', description: '非阻塞宽限窗口（毫秒）：缺省不传 = 阻塞等待（等到作答/取消/中止才返回，与原生 ask_user_question 一致）；显式传正数 = 主动放弃阻塞，超时即返回 pending=true + ticket、loop 继续跑（后果自负）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean' },
          confirmed: { type: 'boolean', description: '弹框路径：用户是否选肯定项' },
          advanced: { type: 'boolean', description: '弹框路径：是否已自动推进' },
          from: { type: 'string', description: '弹框路径：推进前状态' },
          to: { type: 'string', description: '弹框路径：推进后状态' },
          requirement_id: { type: 'string', description: '被确认的需求 id' },
          fallback: { type: 'string', description: 'board = 弹框不可用，请走看板确认按钮' },
          target: { type: 'string', description: '文字证据路径：artifact | plan' },
          kind: { type: 'string', description: '文字证据路径：产物类型' },
          via: { type: 'string', description: '文字证据路径：确认来源（session）' },
          // REQ-261003222428-3556 FR-7 / N-3：成组确认的落章清单——一次确认盖了哪些产物，
          // 如实列出（task_detail/task_output/design 成组时尤其需要，否则"确认了一次"说不清盖了几份）。
          stamped: { type: 'array', items: { type: 'string' }, description: '文字证据路径：本次落章的产物路径清单（成组确认时 >1 份）' },
          evidence_verified: { type: 'boolean', description: '文字确认是否通过 capture-hook 核验（命中真实用户消息）' },
          user_choice: { type: 'string', description: '弹框路径（非肯定项）：用户选择的选项文本' },
          user_feedback: { type: 'string', description: '弹框路径（非肯定项）：用户输入的修改意见或反馈' },
          pending: { type: 'boolean', description: 'REQ-260924213231-b1c4 FR-3：超宽限挂起（弹框已投递、人未作答）——不判失败，凭 ticket 取回执' },
          ticket: { type: 'string', description: 'FR-3：挂起确认标识（pc-…），回执 reqboard_confirm_receipt(ticket) 的入参' },
          interrupted: { type: 'boolean', description: 'REQ-260927123256-196b FR-4：阻塞等待被中止（deadline/取消）——已留可查挂起记录，凭 ticket 取回执' },
          gate_failure: {
            type: 'object',
            description: 'REQ-2d1c74 FR-2：G2 文档集完整性闸门未过（落章保留、推进被拦）时的结构化缺口（code/gaps/message）',
            additionalProperties: true,
          },
          note: { type: 'string' },
        },
      },
      render: renderSmart(askConfirmSummary),
    },
    timeoutMs: LIMITS.timeoutInteractiveMs,
    execute: async (rawArgs: unknown, exec: ToolRunContext) => {
      // REQ-261006164732-6503 t13（serves: FR-1）：`adopted_ticket` 是**内部**参数（建门方沿用自己那口门），
      // 绝不能从工具面注入——本工具 parameters 没声明它，而绑定层不设 `additionalProperties:false`
      // （独立复核 findings-4），于是调用方本可以凭一个 ticket 绕过建门唯一入口、直接弹出第二个框。
      // 内部调用方（auto-confirm / SubmitVerification）走的是 `askConfirm` 直调，不经本边界。
      // 注意：就地清洗后仍以 `args` 分派——工具壳的"evidence 非空 → confirmArtifact，否则 askConfirm"
      // 是被静态断言钉住的规范形状（tests/tools-dispatch.test.ts），改名会撞它。
      const args = { ...((rawArgs ?? {}) as Record<string, unknown>) }
      delete args.adopted_ticket
      const evidence = normalizeText((args as { evidence?: unknown }).evidence, 'evidence', 2000)
      return evidence.length > 0 ? confirmArtifact(deps, args, exec) : askConfirm(deps, args, exec)
    },
  } as any)
}
