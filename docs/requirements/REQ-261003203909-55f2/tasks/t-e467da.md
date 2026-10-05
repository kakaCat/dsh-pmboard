# t-e467da 边界规则：STAGE_SCOPE_RULE 类型强制 + 四段规则 + prompt 快照

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
边界规则：STAGE_SCOPE_RULE 类型强制 + 四段规则 + prompt 快照

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
`npx vitest run tests/execute-task.test.ts` → 全绿（四段 prompt 快照断言）；`npx tsc --noEmit` 零新增；反向演练 R-1：摘 STAGE_SCOPE_RULE.e2e → tsc 报错（输出入 evidence/）

## 实施方案（implementation）
按 design/data-model.md §1 的边界规则文本落表；TC-7 断言四段 prompt 含对应边界规则文本、schema 族正确

## 上游产出摘要（dependsSummary）
- 契约：四段登记 + 模板键 + template 纯函数（SubtaskTemplate）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-03T16:24:37.686Z，窗口 session-e48f706a-b51f-47a9-85c5-47b7e59bba48）

边界规则收口：20 段全登记且编译强制（漏登记=编译错，R-1 演练在案），prompt 用例断言四段规则进提示词；另修一处基线长红用例与客户端 DAG 排序错乱

### 完成项

- STAGE_SCOPE_RULE 改 Record<StageKind,string>：20 段全登记成编译期义务；移除死配置键 doc（非 StageKind）
- 四段边界规则按 design/data-model.md §1 落表（与 STAGE_ACCEPTANCE 同源）；补齐既有 14 段的边界规则（此前仅 4 段有）
- TC-7：四段 prompt 含边界规则+凭证形态断言；manual 防伪造禁令原样进 prompt
- TC-3 第六表落地：SCOPE_RULE 与 STAGE_KINDS key 集合相等 + 每条规则带边界锚点
- R-1 反向演练：摘 e2e 规则 → tsc TS2741（输出入 evidence/r1-reverse-drill.txt）
- 顺手修两处：基线长红的凭证形态用例（integrate 误当写入族样本→改 dev）；客户端 DAG 排序硬编码四段→改从 STAGE_KINDS 派生（新段链序显示错乱修复）
- execute-task 24/24、关联四套件 78/78 全绿；tsc 我的文件零错误

### 改动文件

- `src/application/use-cases/ExecuteTask.ts`
- `src/client/dag/card-types.ts`
- `tests/execute-task.test.ts`
- `docs/requirements/REQ-261003203909-55f2/evidence/r1-reverse-drill.txt`

### 下一步

t5 manual 链行为卡（AdvanceChain awaiting-manual 分支）

---
