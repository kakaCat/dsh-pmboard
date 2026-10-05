/**
 * HandoffTool 工具壳（REQ-261004150249-731e FR-5）——三段式薄壳：prompt + 元数据/入参/输出 + execute 委托用例。
 * 判定与文案全在 application 层（`handoffRequirement`），本文件只做入参声明与回执渲染。
 *
 * 工具名里**不含 rebind 字样**：看板改绑（`applyRebind`，human_gate）是另一条通道；
 * agent 面只有「把 owner 交给新窗口」这一条自主口（见 tests/binding-trace.test.ts 的静态断言）。
 *
 * @module dsh-pmboard/tools/HandoffTool
 */
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { UseCaseDeps } from '../../application/ports.js';
import type { HandoffThresholds } from '../../application/internal/handoff-policy.js';
import { handoffRequirement } from '../../application/use-cases/HandoffOwner.js';
import { HANDOFF_PROMPT } from './prompt.js';
import { LONG_TEXT_ARG_NOTE, renderSmart } from '../shared.js';

/** 造窗方式（受控枚举，与 OpenWindowTool 同款写法：字面量数组经 const 收窄）。 */
const HANDOFF_MODES = ['fork', 'create'] as const;

/** 回执一句话摘要：谁交给谁、角色怎么换、底稿投出去了没有。 */
const handoffSummary = (v: unknown): string => {
  const o = (v ?? {}) as Record<string, unknown>;
  if (o['success'] === false) return `❌ 交接被拒：${String(o['message'] ?? '见明细').slice(0, 80)}`;
  const d = (o['delivery'] ?? {}) as Record<string, unknown>;
  const seed = d['delivered'] === true
    ? '底稿已投递'
    : `底稿未投递（${String(d['reason'] ?? '原因未知')}）`;
  const self = o['self_initiated'] === true ? 'agent 自主' : '人明确要求';
  return `🔁 交接 ${String(o['requirement_id'] ?? '?')}：${String(o['from_window'] ?? '?')} → ${String(o['to_window'] ?? '?')}`
    + `（旧 observer / 新 owner，${self}，${seed}）`;
};

export interface HandoffToolOptions {
  /**
   * 三档水位覆盖（与 `defineBindTool(deps, { seatsMax })` 同款：组合根读配置、工厂收生效值）。
   * 缺省走 `deps.handoff`，再缺省内置 `0.75/0.85/0.90`——`deps.handoff` 的组合根注入是另一张卡。
   */
  thresholds?: HandoffThresholds;
}

export function defineHandoffTool(deps: UseCaseDeps, opts?: HandoffToolOptions) {
  return defineTool({
    name: 'reqboard_handoff',
    description: HANDOFF_PROMPT,
    parameters: {
      reason: {
        type: 'string' as const,
        description: '交接原因（进留痕评论；建议写明水位与阶段）。非顶墙档必填。' + LONG_TEXT_ARG_NOTE,
      },
      mode: {
        type: 'string' as const,
        enum: [...HANDOFF_MODES],
        description: '新建窗口的方式：fork = 带旧上下文；create = 全新空会话（缺省，靠断点 + 输入包接续）',
      },
      to_window: {
        type: 'string' as const,
        description: '指定接管窗口（= 会话 id）；缺省 = 新建一个窗口。不能等于本窗口（会 REQBOARD_HANDOFF_TARGET_INVALID）',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean', description: '交接是否成立（投递失败不影响本字段）' },
          requirement_id: { type: 'string', description: '被交接的需求 id' },
          from_window: { type: 'string', description: '原窗口（= 调用窗口）' },
          to_window: { type: 'string', description: '新窗口（新建时为 = 新会话 id）' },
          old_role: { type: 'string', description: '原窗口交接后的角色：observer（只读，看得见进度）' },
          new_role: { type: 'string', description: '新窗口的角色：owner' },
          self_initiated: { type: 'boolean', description: '是否 agent 自主发起（只有 fork / critical 顶墙档为 true）' },
          delivery: {
            type: 'object',
            additionalProperties: false,
            description: '底稿投递结果（未投递时该键仍出现，delivered=false + reason）',
            properties: {
              delivered: { type: 'boolean', description: '是否投递成功' },
              kind: { type: 'string', description: '自署来源（恒为 reqboard-handoff，永不为 user）' },
              reason: { type: 'string', description: '未投成功时的原因' },
            },
          },
          context_pressure: {
            type: 'object',
            additionalProperties: false,
            description: '触发依据（读数原样透传，供人事后复盘；缺席字段整体省略）',
            properties: {
              contextWindow: { type: 'number', description: '上下文窗口大小（tokens）' },
              pressureTokens: { type: 'number', description: '当前压力占用（tokens）' },
              projectedTokens: { type: 'number', description: '预计占用（tokens，不参与判据）' },
              source: { type: 'string', description: '读数来源：projection = 可用；unavailable = 取不到' },
            },
          },
          note: { type: 'string', description: '人话说明：写没写台账（含幂等）、投没投递、是否自主发起、未投时怎么接手' },
        },
      },
      render: renderSmart(handoffSummary),
    },
    async execute(
      input: { reason?: string; mode?: 'fork' | 'create'; to_window?: string },
      context: ToolRunContext,
    ) {
      return await handoffRequirement(
        deps,
        {
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
          ...(input.mode !== undefined ? { mode: input.mode } : {}),
          ...(input.to_window !== undefined ? { to_window: input.to_window } : {}),
        },
        context,
        opts?.thresholds,
      );
    },
  });
}
