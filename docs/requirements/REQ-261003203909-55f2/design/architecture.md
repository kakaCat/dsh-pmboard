# 架构设计 · 子卡阶段模板补充

> **TL;DR**：纯增量改动——枚举加四段、模板表加两键、计划表加一字段、AdvanceChain 加一条
> manual 分支。零存量改写、零凭证门结构变更；三个调研遗留决策点在此裁定（§2）。

## 1. 模块改动图 · serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7

```
 计划提交                    落库（decompose）              懒展开（开工）              执行/凭证
 ┌──────────────────┐      ┌───────────────────────┐      ┌─────────────────┐      ┌──────────────────┐
 │ SubmitTool        │      │ plan-landing.ts        │      │ lazy-expand.ts   │      │ ExecuteTask.ts    │
 │  tasks[].template │─────>│  template→stages 解析   │────>│ resolveSubtask   │────>│ STAGE_SCOPE_RULE  │
 │  （新字段，FR-4）  │      │  + TaskRecord.template │      │ Stages（零改动） │      │ （改 Record 强制）│
 └──────────────────┘      └───────────────────────┘      └─────────────────┘      └──────────────────┘
        │ 校验：template 必须命中              │ stages 已解析好，            │ manual 段不派 run，
        │ SUBTASK_TEMPLATES 键，               │ 展开逻辑一行不动             │ 落清单→awaiting-manual
        │ 否则计划被拒（响亮）                  │                              │ （AdvanceChain 新分支）
        ▼                                     ▼                              ▼
 protocol.ts:852 旁                  SubtaskTemplate.ts                domain/card-types.ts
 新增 validateTemplateRef            STAGE_KINDS+4 / 模板键+2            STAGE_TO_PHASE_COLOR+4
 （与 validateExplicitStages 并列）   （Record 类型强制全登记）           （Record 类型强制）
```

改动文件清单（全部增量，无存量改写）：
- `src/domain/task/SubtaskTemplate.ts`：枚举/标签/验收/证据族 +4 段；模板表 +2 键；新增 `validateTemplateRef`。
- `src/domain/card-types.ts`：`STAGE_TO_PHASE_COLOR` +4 项（缺 = 编译错，天然门禁）。
- `src/application/use-cases/ExecuteTask.ts`：`STAGE_SCOPE_RULE` +4 项并改 `Record<StageKind,string>`（FR-7）。
- `src/application/internal/plan-landing.ts`：template 解析 + 透传。
- `src/tools/SubmitTool/`：schema + description（template 字段与优先级口径）。
- `src/application/use-cases/AdvanceChain.ts`：manual 段分支（§3）。
- `docs/knowledge/conventions.md`：工程操作节新增「新增 stageKind 七处登记」规范条目（FR-7）。

## 2. 三个决策点的裁定 · serves: FR-1, FR-2, FR-4, FR-5

**D-1（integrate 默认段策略）→ 维持默认四段，不改默认链。**
理由：削段静默、留段响亮——多一张空联调卡的成本是子代理写一句「本卡没有可联调的接口」
（可见、可统计），少一张该联调的卡则无任何机制兜底（静默漏联调）。FR-4 的 template 字段落地后，
「无接口」的声明成本降为零（`template: 'change-only'` 或 `skipIntegration`），
默认链无需为此转向。94 张联调卡 85% 有真实完工结论，不支持改默认。

**D-2（manual 凭证形态）→ 独立段（证据族 = file），不是 verify 的属性。**
理由：「这步归人」需要改变**链的行为**（停下等人，§3），属性位表达不了行为；
且独立段的登记点全部类型强制，漏登记编译期即炸，比属性分支安全。
凭证形态定 file 族：核对清单必须落盘（`docs/requirements/<REQ>/manual/<taskId>.md`），
人核对后窗口 agent 补核对结果更新文件——与写入族「文件存在 + mtime ≥ 链出身」判定天然同构，
凭证门零改动。

**D-3（一等声明形态）→ 计划任务表加 `template` 字段，落库时解析为 stages。**
理由：① 人批准计划时看到的是解析后的具体链（批准所见即落库所得，杜绝「批了 A 落了 B」）；
② `TaskRecord.template` 冗余记录引用键，「哪类卡用哪条链」从此可统计（本次调研靠手写
stages 反推组合，下次直接 group by template）；③ 只加映射键不加字段则计划可读性不变、
统计维度依旧缺失。

**FR-6 的实现修正（采集族 → capture 段）**：调研结论「凭证门补采集族」经设计评估修正为
**新增 `capture` 段（file 族）**——采集产物（截图/探针输出/基线文件）落盘后，
与写入族「文件存在 + mtime」判定完全同构，新增第三族枚举要动凭证门结构
（`subtask-evidence.ts` 判定链 + workflow-script schema 分流），风险远大于收益。
段级方案用既有机制承接同一批工作，验收模板与边界规则按采集语义定制。需求目标
（采集类工作有承接、不挤 dev/test）不变。

## 3. manual 段的链行为（本需求唯一的行为变更） · serves: FR-2

现状链语义里没有任何「停下来等人动手」的形态（`awaiting-confirm` 等的是**弹框作答**，
不是**线下作业**）。manual 段引入第三种停链形态，行为契约：

1. `runSubtaskStep` 前置判断 `stageKind === 'manual'` → **不派 workflow run**：
   落核对清单骨架（`docs/requirements/<REQ>/manual/<taskId>.md`，核对项由父卡验收标准生成）
   + 子卡置 in_progress + comment 提示「本卡需人工核对」+ alert 端口告警。
2. 链停 `stopped='awaiting-manual'`：**不动 autoRun、不计 noopStreak、不是失败**（同
   `awaiting-confirm` 的口径——等人不是停摆）。工具回执如实说「等人工核对，完成后
   调 reqboard_task_report 补记录即续跑」。
3. 人完成核对（真机重载/浏览器走查）→ 窗口 agent 把核对结果写进清单文件并
   `reqboard_task_report`（filesChanged 含清单与截图）→ 凭证门按 file 族放行 → done →
   下次 `reqboard_task_run` 链续跑。
4. 防伪造：清单骨架由系统生成（含生成时间戳），凭证门的 mtime 判定要求**核对后的更新**
   晚于骨架生成——只生成骨架不核对无法过门。

## 4. 兼容与回滚 · serves: FR-1, FR-2, FR-3, FR-6

- 存量台账零改写：四段是新增枚举值，旧卡 stageKind 不变；客户端徽标走 `STAGE_LABELS`
  单点自动跟随，未知值回落原词不崩（既有口径）。
- 模板表新增键只影响**新提交的计划**；template 字段可选，旧计划缺省行为一字不变。
- 在跑的链不受影响（懒展开发生在开工时）。
- 回滚 = revert：无数据迁移、无台账手术。
