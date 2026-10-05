# t1 已知影响与偏差登记（REQ-261003204149-1e80）

> 本文是 t1《回退判定与状态机》复核与测试两段的留痕：**该说的都说了**——
> 一处行为变更（连带三处既有断言更新）、一处偏差，都不隐藏。

## 一、行为变更：`agentNextActions` 现在含回退目标（连带更新三处既有断言）

**这不是纯文案问题，实测直接红了三处既有断言**——它们编码的是旧规则「回退须人点」：

| 既有断言（位置） | 旧期望 | 新期望（本需求语义） |
|---|---|---|
| `tests/domain/subtask-status.test.ts` | `agentNextActions('implementing')` = `['accepting']` | `['accepting','draft','brainstorming','design','decomposing']` |
| `tests/domain/subtask-status.test.ts` | `assertReqTransition('implementing','design','agent')` 抛 `human_gate` | 不抛（回退对 agent 开放） |
| `tests/domain/subtask-status.test.ts` | 同上 `'system'` 抛 `human_gate` | 抛 `system_gate`（人工门移除后，拒绝理由变成「不在 system 白名单」） |
| `tests/domain/requirement-status.test.ts` | `agentNextActions('accepting')` = `['implementing']` | `['draft','brainstorming','design','decomposing','implementing']` |
| `tests/tools-status.test.ts` | `reqboard_status` 的 `implementing.next_actions` = `['accepting']` | 同上五项 |

**为什么更新断言而不是改实现**：`agentNextActions` 的既有定义是
「合法转移剔除人工门」，本身没变；变的是**回退不再是人点**这件事——那是本需求
（FR-1）要达成的目标。把回退目标从这个列表里剔除反而会让 agent 看不见「能退到哪」，
与「由 agent 自行判断退回哪个节点」的决策相悖。故按新契约更新断言，并在断言旁写明
这是**行为变更的如实反映**、不是放宽。

**残留（留待验收判断，不在 t1 处理）**：`reqboard_status` 的 note 文案用的是
「里程碑处用 reqboard_move 自行推进（…）」，把回退目标与前进目标并列在「推进」一词下
（位置：`application/query/QueryState.ts`）。信息正确（这些确实是 agent 可自行发起的转移），
只是**用词**不够精确。若要拆成「前进 / 可回退」两组，判据已有现成的 `isRollback`，
改动面 = 一处字符串 + 可能的快照基线。

## 二、偏差：`isRollback` 的判据比设计文档写得更紧

**设计文档原文**（`design/architecture.md` §回退判定）：`isRollback` = "两者在序中且
`index(to) < index(from)`"。

**实际实现**：`isRollback(from, to) = to ∈ rollbackTargetsOf(from)`（成员判定）。

**差异点**：`archived → design` 在下标比较下为 **true**，在成员判定下为 **false**。

**为什么按实现收紧**：需求文档「边界（不做什么）」明确"不做归档后的回退——`archived`/`done`
仍是终点（无出边，保持现状）"。下标比较会把终点也算作可回退源，与该边界冲突。

**为什么不改设计文档**：外部接口与行为未变（`archived` 仍无出边、仍不可回退），
这是设计表述的精度问题，不是契约变更；改已确认产物要走变更流程，收益不抵成本。
**留痕在此**，供验收环节判断是否需要回写设计文档。

## 三、验证证据（现场基线对照，非历史快照）

同一工作区、只差本轮改动，各跑一次**全量**：

| 验证项 | 含本轮改动 | 现场基线（暂存本轮改动后） |
|---|---|---|
| `npx vitest run` 失败数 | **98** | **98**（持平） |
| 通过数 | 3375 | 3356（+19 = 本卡新增用例） |
| 仅本轮出现的失败 | — | **空**（`comm -13` 差集为 ∅） |
| `npx tsc --noEmit` | 150 | 150（持平，无新增） |

补充证据：

| 验证项 | 结果 |
|---|---|
| `npx vitest run tests/rollback-domain.test.ts` | 19 passed |
| `npx vitest run tests/domain/requirement-status.test.ts tests/domain/subtask-status.test.ts tests/rollback-domain.test.ts tests/application/use-cases.test.ts` | 58 passed |
| `npx vitest run tests/stage-boundary.test.ts` | 6 passed |
| 判别力 A/B | 让 `rollbackTargetsOf` 恒返回空 → 5 条断言必红，恢复后全绿 |
| 归属对照 | `routes-rollup`（2 例）与 `layer-boundary`（3 例）经 `git stash` 对照证明改动前同样红，且命中文件都不是本卡文件 |
