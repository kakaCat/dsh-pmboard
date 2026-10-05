# 接口设计 · 子卡阶段模板补充

> **TL;DR**：两个 schema 变更（submit 计划任务 +template、回执/台账 +template）、
> 两个新纯函数（validateTemplateRef / resolveTemplateStages）、一条 AdvanceChain 分支。
> 错误码两个新增，全部响亮。

## 1. `reqboard_submit(kind=plan)` · serves: FR-4, FR-5

**请求变更**：`tasks[]` 元素新增可选字段——

```jsonc
{
  "template": {
    "type": "string",
    "description": "引用子卡链模板键（如 change-only / acceptance / ops / data）；与 stages 二选一，skipIntegration 可叠加"
  }
}
```

**校验**（protocol.ts 计划解析层，与 `validateExplicitStages` 并列调用）：

| 输入 | 结果 |
|---|---|
| `template` 命中 `SUBTASK_TEMPLATES` 键 | 通过 |
| `template` 非法键 | **拒绝计划**，错误码 `REQBOARD_TEMPLATE_INVALID`，文案列出合法键清单 |
| `template` 与 `stages` 同时给出 | **拒绝计划**，错误码 `REQBOARD_TEMPLATE_CONFLICT`（二选一，禁止双口径） |
| `template` + `skipIntegration: true` | 通过（先取模板链再裁 integrate） |

**错误码**：

- `REQBOARD_TEMPLATE_INVALID`：`非法 template：{key}（合法键：{keys}）`
- `REQBOARD_TEMPLATE_CONFLICT`：`stages 与 template 二选一，不得同时给出（card: {key}）`

## 2. 领域纯函数（SubtaskTemplate.ts 追加） · serves: FR-4, FR-5

```ts
/** template 引用键校验：命中模板表 → 链；未命中 → 结构化原因（调用方拼 REQBOARD_TEMPLATE_INVALID）。 */
export function validateTemplateRef(
  template: unknown,
): { ok: true; value: readonly StageKind[] } | { ok: false; error: string }

/** 计划卡 → 落库 stages 的统一解析（优先级单点）：stages > template > undefined（交回 phase/side/分类兜底）。 */
export function resolvePlanStages(draft: {
  stages?: readonly unknown[]
  template?: string
}): { ok: true; value: readonly StageKind[] | undefined } | { ok: false; error: string }
```

`resolvePlanStages` 是优先级的**唯一实现点**：plan-landing 调它一次，结果写进
`TaskRecord.stages`；`lazy-expand.resolveSubtaskStages` 一行不改（它收到的已是解析好的 stages）。

## 3. `plan-landing.ts` 落库 · serves: FR-4

```ts
// PlanTaskDraft 追加
template?: string

// 落库逻辑（landPlanTasks 内，伪码）
const resolved = resolvePlanStages(draft)          // 校验已在计划提交时做过，此处重算只为落库值
if (resolved.ok && resolved.value !== undefined) {
  task.stages = [...resolved.value]                // 批准所见 = 落库所得
}
if (draft.template !== undefined) task.template = draft.template   // 冗余记录引用键（统计维度）
```

## 4. AdvanceChain manual 分支 · serves: FR-2

`AdvanceStop` 新增取值：

```ts
| 'awaiting-manual'   // manual 段等人工核对：不动 autoRun、不计 noopStreak、不是失败
```

`runSubtaskStep` 前置分支（在 `executeSubtask` 调用**之前**）：

```ts
if (subtask.stageKind === 'manual') {
  // ① 核对清单骨架落盘：docs/requirements/<REQ>/manual/<taskId>.md
  //    内容 = 父卡验收标准拆核对项 + 生成时间戳（mtime 判定的锚）
  // ② 子卡 todo → in_progress（开执行记录，trigger='auto'）
  // ③ comment + alert：「本卡需人工核对，完成后 reqboard_task_report 补记录续跑」
  // ④ 返回 step outcome='ok'，event='AWAIT_MANUAL' → driveChain 停于 'awaiting-manual'
}
```

**工具回执**（TaskExecuteTool/TaskRunTool 壳）：`stopped === 'awaiting-manual'` →
如实文案：「链停在人工核对卡 t-xxx：清单已落盘 `docs/.../manual/t-xxx.md`，请人工核对后
调 reqboard_task_report 补核对记录，链即续跑」。不映射为错误码（这不是失败）。

**续跑路径**（零新接口）：人核对 → agent 更新清单文件 → `reqboard_task_report`
（filesChanged 含清单+截图）→ 凭证门按 file 族放行（mtime > 骨架生成时间）→
`reqboard_task_move(done)` → 下次 `reqboard_task_run` 链续。

## 5. 登记点清单（新增 stageKind 的七处） · serves: FR-7

| # | 位置 | 强制方式 |
|---|---|---|
| 1 | `STAGE_KINDS` / `STAGE_LABELS` / `STAGE_ACCEPTANCE` / `STAGE_EVIDENCE_KIND`（SubtaskTemplate.ts） | `Record<StageKind,…>` 编译强制 |
| 2 | `STAGE_TO_PHASE_COLOR`（card-types.ts） | `Record<StageKind,…>` 编译强制 |
| 3 | `STAGE_SCOPE_RULE`（ExecuteTask.ts） | 本次改 `Record<StageKind,string>` 后编译强制 |
| 4 | workflow-script schema 族（workflow-script.ts） | 从 `STAGE_EVIDENCE_KIND` 派生，自动跟随 |
| 5 | 客户端徽标/排序（subtask-view.ts / dag） | 复用 `STAGE_LABELS` 单点，自动跟随 |
| 6 | AdvanceChain 行为分支（仅 manual 需要） | 用例覆盖（test-cases.md TC-5） |
| 7 | eval-suite fixtures 与 `docs/knowledge/conventions.md` 规范条目 | kb:check 覆盖度门禁 |

## 6. 不变的接口 · serves: FR-1, FR-3, FR-6

- `reqboard_task_run` / `reqboard_task_report` / `reqboard_task_move`：schema 零变更
  （manual 续跑复用既有 report 通道）。
- 凭证门 `assertDoneEvidence` / `subtask-evidence.ts`：判定逻辑零变更（三新段复用
  file/verdict 两族）。
- `lazy-expand.resolveSubtaskStages`：零变更。
