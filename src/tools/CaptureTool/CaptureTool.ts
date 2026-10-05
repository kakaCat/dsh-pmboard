/**
 * reqboard_capture 工具壳（REQ-e3b6a0 t8 / FR-7）——三段式薄壳：prompt + 元数据/入参/输出
 * + execute 委托 application 用例（CaptureRequirement）。**不含任何领域判定**（规则只在 domain）。
 *
 * 为什么参数是"无（可选补充）"：四问题目由用例内部构造（口径与 schema 同源），
 * 调用方只可补充分类上下文——候选名称（title_options）与摘要/依据，不参与取值判定。
 *
 * @module dsh-pmboard/tools/CaptureTool
 */
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import { LIMITS } from '../../domain/limits.js'
import type { UseCaseDeps } from '../../application/ports.js'
import { captureRequirement } from '../../application/use-cases/CaptureRequirement.js'
import { CAPTURE_ANSWER_KEYS, type CaptureAnswerKey } from '../../application/internal/capture-mapping.js'
import { renderSmart } from '../shared.js'
import { captureSummary } from '../render-summaries.js'
import { CAPTURE_PROMPT } from './prompt.js'

/**
 * answers 各键的展示文案（Record<CaptureAnswerKey> 全键必填——从 CAPTURE_ANSWER_KEYS
 * 摘键/加键都会在这里形成 tsc 报错，防「常量改了、文案/schema 漏改」的半同步）。
 */
const ANSWER_KEY_DESCRIPTIONS: Record<CaptureAnswerKey, string> = {
  title: '用户确认的需求名称',
  category: '用户确认的需求类型',
  difficulty: '用户确认的提示词难度',
  docLocation: '用户确认的文档位置',
  // 第四问（工作区）的作答原样透传。**必须声明**：mapCaptureAnswers 的 answers 里就带
  // 这个键，而 schema 是 additionalProperties:false ⇒ 漏声明的后果是每次立项都报
  // `value.answers.workspace is not a declared property`（2026-10-03 实测，REQ-261003204143-3219）。
  workspace: '用户确认的工作区（哨兵值或自定义绝对路径）',
}

export function defineCaptureTool(deps: UseCaseDeps) {
  return defineTool({
    name: 'reqboard_capture',
    description: CAPTURE_PROMPT,
    parameters: {
      title_options: {
        type: 'array',
        description: '需求名称候选（可选，最多 3 个；首个 = 推荐项，用户仍可自定义输入）',
        items: { type: 'string' },
      },
      summary: {
        type: 'string',
        description: '工作摘要（可选，≤4000 字符；将作为需求描述底稿，留空则用名称兜底）；写法：每条短句（建议 ≤60 字）；需引号用「」避免半角双引号；文本过大拆成多次调用',
      },
      on_window_bound: {
        type: 'string',
        description: "本窗口已绑定在飞需求时的分支：second（默认）= 本窗口接第二个项目；handoff = 开一个新窗口并把它交给新窗口当 owner",
        enum: ['second', 'handoff'],
      },
      reason: {
        type: 'string',
        description: '立项依据（可选，≤4000 字符）：为什么值得立项，供人工判断',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          used_project_root: { type: 'string', description: '项目根（使用过的）' },
          success: { type: 'boolean', description: '是否立项成功' },
          requirement_id: { type: 'string', description: '创建成功时的 REQ id；未立项为空串' },
          bound_policy: { type: 'string', description: '本次走的分支：second（本窗口第二条）/ handoff（已交给新窗口）' },
          window_key: { type: 'string', description: 'handoff 时新窗口的窗口码（= 新会话 id）' },
          status: { type: 'string', description: '创建成功后的需求状态（brainstorming）' },
          answers: {
            type: 'object',
            additionalProperties: false,
            // properties 由 CAPTURE_ANSWER_KEYS **生成**（REQ-261003204143-3219 FR-3）：
            // 键清单单一事实源在 capture-mapping.ts——手写五行曾与 CaptureMapping.answers
            // 漂移（漏 workspace ⇒ 每份回执被绑定层拒收，2026-10-03 实测）。
            properties: Object.fromEntries(
              CAPTURE_ANSWER_KEYS.map((k) => [k, { type: 'string', description: ANSWER_KEY_DESCRIPTIONS[k] }]),
            ),
          },
          defaults_used: {
            type: 'array',
            description: '走了默认值的问项 id 清单（缺失回落时不静默猜）',
            items: { type: 'string' },
          },
          doc_location: { type: 'string', description: '需求文档存放位置（如 docs/requirements/<REQ>/）' },
          fallback: { type: 'string', description: 'board = 弹框通道不可用（不伪造立项）' },
          note: { type: 'string', description: '结果说明' },
          board_link: { type: 'string', description: '项目看板链接（点击后在应用内打开看板并定位该需求）' },
        },
      },
      render: renderSmart(captureSummary),
    },
    timeoutMs: LIMITS.timeoutInteractiveMs,
    execute: async (args: unknown, exec: ToolRunContext) => captureRequirement(deps, args, exec),
  } as any)
}