# t-fa64d7 报告模板+评分汇总+全量自检

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
报告模板+评分汇总+全量自检

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：review
- 端侧：fullstack

## 得到什么结果
reports/TEMPLATE.md 六节齐全；自检记录列出 36 条用例三件套完整性核对结果（缺失=0）、红线清单（6 条）与需求文档一致、评分公式两处表述一致；发现的任何不一致已修复。验证：人工跑一遍自检清单并签字落档。

## 实施方案（implementation）
按 interfaces.md I-5 写六节报告模板；写评分汇总计算表（维度权重与红线规则，与 interfaces.md I-4 公式逐符号一致）；跑全量自检：36 条三件套齐全性、id/分值/severity 与需求文档一致性、断言算子合法性、rubric 引用闭环；自检结果落 notes。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-02T04:59:13.324Z，窗口 session-d89ef03b-e441-49b5-bd69-b463a93ad7bc）

t6 完成：报告模板、评分汇总表、全量自检记录三件套交付，自检 10 项全过；至此 6 张任务卡全部完成，测评套件内容齐套（36 用例三件套+5 rubric+runbook+模板+评分表）。

### 完成项

- 报告模板 reports/TEMPLATE.md：六节结构与 interfaces.md I-5 一致
- 评分汇总 eval-suite/scoring.md：公式与 I-4 逐符号一致，维度满分基线由 36 条 scenario 实算
- 全量自检落 notes/self-check-t6.md：36 条三件套缺失=0、红线 6 条一致、rubric 闭环
- t1-t5 五张父卡已全部收口（节流限速下逐张关闭）

### 改动文件

- `eval-suite/reports/TEMPLATE.md`
- `eval-suite/scoring.md`
- `docs/requirements/REQ-261002120707-deab/notes/self-check-t6.md`

### 下一步

需求全部任务完成 → 提交验收材料（kind=verification）。

---
