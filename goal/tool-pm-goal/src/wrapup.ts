/**
 * **收尾指令**（对齐宿主 `@deepseek-ai/dsh-tool-goal/src/wrapup.ts` 的 `renderWrapupContext`：
 * **归工具面**——工具调用那一刻才知道"目标刚变终态"，且它手里有 `exec.deferContext()` 注入点）。
 *
 * 【宿主解决什么】自主回合报了 `complete` / `blocked` 之后，如果直接硬停回合，模型就没机会
 * 对用户交代一句。宿主改成"注入一段收尾指令"，让模型**在回合结束前**写一条收尾消息。
 *
 * 【pm 的差异（两层 goal 带来的三处）】
 *   ① **完成 ≠ 阶段完成**：`complete` 只说明这张卡/这件事完了——收尾话里必须讲清
 *      "阶段是否完成由系统判、必要时会弹框请人裁决"，**不许**模型自己宣布阶段完成；
 *   ② `blocked` 要指名"需要人做什么"（pm 的恢复路径是人：看板「继续」/裁决）；
 *   ③ 停手闸（闭锁/退避/上游/预算）**不**触发收尾——那不是目标终态，是"这一拍不跑"，
 *      保持沉默停手（本仓"停手不是故障"的既有纪律，收尾话会把它变成噪音）。
 *
 * 【为什么不放驱动包】驱动只在 idle 拍判"该不该跑"，看不到"这一次工具调用把目标判成终态了"；
 * 宿主也放在工具包（`tool-goal/src/wrapup.ts`）。驱动侧不需要这条判据。
 *
 * @module dsh-pmboard/goal-round/wrapup
 */

/** 需要收尾的目标终态（**闭集**：只有这两种）。 */
export type WrapupKind = 'goal-complete' | 'goal-blocked'

/**
 * `update` 动作 → 是否需要收尾（**闭集**：只有 complete / blocked）。
 *
 * 其余动作不收尾：`pause`/`resume` 不是终态，`block` 之外的停手闸
 * （闭锁/退避/上游/预算）也不是目标终态——收尾话会把它们变成噪音。
 */
export function wrapupKindOf(action: string | undefined): WrapupKind | undefined {
  if (action === 'complete') return 'goal-complete'
  if (action === 'block') return 'goal-blocked'
  return undefined
}

export interface WrapupInput {
  readonly kind: WrapupKind
  /** 终态目标的陈述（原样回显，防模型漂移）。 */
  readonly objective: string
  /** 挂载卡（pm 特有：收尾要能指到具体产出）。 */
  readonly taskId?: string
  /** `blocked` 的结构化原因（必填；`complete` 不出现该键）。 */
  readonly blockedReason?: string
  /** 本阶段达成进度（收尾时给一句背景，避免"以为整个项目完了"）。 */
  readonly stageProgress?: { readonly done: number; readonly total: number }
}

/** 事实纪律（对齐宿主 GROUNDING）：只报本会话能站住的事实，缺的说缺。 */
const GROUNDING = '只报本会话里站得住的事实（做过的、验证过的、产出在哪）；'
  + '会话里没有的细节就直说没有，不要编。'

/**
 * 渲染一段收尾指令（进会话历史，逐字可核）。
 */
export function renderWrapupPrompt(input: WrapupInput): string {
  const head = '目标：' + JSON.stringify(input.objective)
    + (input.taskId === undefined ? '' : '\n挂载卡：' + input.taskId)
  const progress = input.stageProgress === undefined
    ? ''
    : '\n（阶段进度：' + input.stageProgress.done + '/' + input.stageProgress.total + ' 段已达成）'

  if (input.kind === 'goal-blocked') {
    return [
      '<goal_blocked>',
      head,
      '卡点：' + JSON.stringify(input.blockedReason ?? '未说明'),
      progress,
      '',
      '这张卡的目标被判为 blocked，本轮自主运行到此结束。现在给用户写收尾消息：',
      '① 已经完成到什么程度；② 卡点是什么、你试过什么；③ 明确需要人做什么才能继续',
      '（pm 的恢复路径是人：看板「继续」或裁决）。',
      GROUNDING,
      '直接对用户说话；本回合不要再调任何工具——后续工作等人下一条指令。',
      '</goal_blocked>',
    ].join('\n')
  }

  return [
    '<goal_complete>',
    head,
    progress,
    '',
    '这张卡的目标已 complete，本轮自主运行到此结束。现在给用户写收尾消息：',
    '① 结论（做成了什么）；② 怎么验证的；③ 产出在哪（文件 / 卡 / 产物路径）。',
    '注意：完成 ≠ 阶段完成——阶段是否达成由系统判（必要时会弹框请人裁决），',
    '你不要自行宣布阶段完成，也不要顺手推进需求状态。',
    GROUNDING,
    '直接对用户说话；本回合不要再调任何工具——后续工作等人下一条指令。',
    '</goal_complete>',
  ].join('\n')
}
