# 拆分计划（REQ-261002120707-deab）

## 目标与做法

把已确认的设计（architecture/data-model/interfaces 三份）落成**可执行的测评套件内容**：在 `eval-suite/` 目录下产出 36 条场景脚本 + 配套台账/轨迹断言 + LLM 评审 rubric + 执行 runbook + 报告模板。

做法：先建骨架与格式锚点（README/runbook），再按用例分组并行编制场景与断言，rubric 单独一卡，最后报告模板 + 全量一致性自检收尾。

## 任务表

| key | 标题 | phase | depends_on | 产出 |
|---|---|---|---|---|
| t1 | 建 eval-suite 骨架与执行 runbook | doc | — | README.md、runbook.md、目录结构 |
| t2 | 编制 A/B 组用例（立项+流转纪律，11 条） | doc | t1 | scenarios/A1-B6 + assertions 配套 |
| t3 | 编制 C/D 组用例（拆分+实施链，12 条） | doc | t1 | scenarios/C1-D6 + assertions 配套 |
| t4 | 编制 E/F/G 组用例（验收归档+对抗+效率，13 条） | doc | t1 | scenarios/E1-G4 + assertions 配套 |
| t5 | 编制 LLM 评审 rubric 与校准规范 | doc | t1 | rubrics/*.md、calibration/README |
| t6 | 报告模板 + 评分汇总 + 全量自检 | review | t2,t3,t4,t5 | reports/TEMPLATE.md、自检记录 |

## 条款覆盖对照表

| key | 覆盖条款 |
|---|---|
| t1 | FR-4（执行规程与目录骨架） |
| t2 | FR-2（用例库 A/B 组） |
| t3 | FR-2（用例库 C/D 组） |
| t4 | FR-2（用例库 E/F/G 组） |
| t5 | FR-1（评审方法层）、FR-3（rubric 属评分标准） |
| t6 | FR-3（评分汇总）、FR-4（报告模板） |

## 验收要点

- 36 条用例 = 需求文档用例库表逐条落地，id/分值/severity/维度一致；
- 每条用例三件套齐全（scenario + ledger 断言 + trajectory 断言，产物类另有 rubric 引用）；
- 格式符合 data-model.md 的 YAML schema 与算子表；
- 报告模板六节齐全，评分公式与 interfaces.md 一致。
