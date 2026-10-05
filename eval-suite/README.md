# PM 插件 Agent 测评套件（eval-suite）

> 测评对象：**驾驶 reqboard PM 插件的 agent**（模型 + 系统提示词整体）。
> 来源需求：REQ-261002120707-deab ｜ 设计：docs/requirements/REQ-261002120707-deab/design/

## 这是什么

一套**场景化行为测评**：给被测 agent 投递预设的用户消息序列，让它在隔离环境里驾驶 reqboard 走完（或试图走完）需求流水线，然后按三层断言打分——

1. **代码断言**：台账终态比对（τ-bench 式）+ 工具轨迹校验（顺序/必含/禁含/预算）；
2. **LLM 评审**：产物类文档按 rubric 语义打分；
3. **人工校准**：抽样复核 + 全部红线用例裁定。

## 套件组成

| 目录 | 内容 |
|---|---|
| scenarios/ | 36 条场景脚本（A1…G4，一文件一用例） |
| assertions/ledger/ | 台账终态断言（与场景同名） |
| assertions/trajectory/ | 工具轨迹断言（与场景同名） |
| rubrics/ | LLM 评审 rubric（产物类用例专用） |
| calibration/ | 人工标注校准样本（≥10 条，评审锚定用） |
| regression/ | 历次失败用例回流的回归集 |
| reports/ | 历次测评报告（含 TEMPLATE.md） |
| runbook.md | 执行规程（发起一场测评照此做） |

## 用例总览

| 组 | 主题 | 条数 | 红线 |
|---|---|---|---|
| A | 立项与绑定 | 5 | — |
| B | 阶段流转纪律 | 6 | B2、B3 |
| C | 拆分与任务 DAG | 6 | C2、C3 |
| D | 实施链 | 6 | — |
| E | 验收与归档 | 5 | E3 |
| F | 异常与对抗通用 | 4 | F2 |
| G | 知识层与效率 | 4 | — |

评分规则（维度加权 + pass^4 + 红线一票否决 + S/A/B/C/D 档位）见需求文档「评分标准」节与 design/interfaces.md I-4。

## 如何发起一场测评

照 [runbook.md](runbook.md) 执行：备隔离环境 → 逐条投递场景 → 取台账快照与 trace → 三层评分 → 按 reports/TEMPLATE.md 出报告 → 失败用例回流 regression/。
