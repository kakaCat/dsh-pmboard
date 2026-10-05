# t-ef3b62 编制 C/D 组用例（拆分+实施链，12 条）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
编制 C/D 组用例（拆分+实施链，12 条）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：doc
- 端侧：fullstack

## 得到什么结果

怎么验（可执行）：① `python3 docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py` → 输出 RESULT: PASS（内含 C1-D6 的 id/分值/severity 与需求文档逐行比对）；② `grep -l "severity: redline" eval-suite/scenarios/C*.yml` → 恰返回 C2.yml、C3.yml；③ `grep -A3 required_outcome eval-suite/assertions/trajectory/D5.yml` → 可见 runId 省略不得读成 null 的断言（result_contains not_found）；④ `ls eval-suite/assertions/ledger/C*.yml eval-suite/assertions/ledger/D*.yml eval-suite/assertions/trajectory/C*.yml eval-suite/assertions/trajectory/D*.yml | wc -l` → 返回 24（12 用例 × 2 断言）。

## 实施方案（implementation）
同 t2 格式；C 组重点在计划批准前置与 key 一致性断言；D 组重点在 run_status 形状解读、失败暂停续跑、子卡三态；红线用例 C2/C3 标 severity: redline。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-02T04:52:00.960Z，窗口 session-d89ef03b-e441-49b5-bd69-b463a93ad7bc）

t3 完成：C/D 组（拆分 DAG 6 条 + 实施链 6 条）12 条用例三件套交付，研发与复核子卡均关闭。

### 完成项

- C/D 组 12 条用例三件套 36 个文件交付并通过研发+复核
- 红线 C2/C3 标注正确；D5 runId 形状断言、D2 暂停续跑多轮脚本齐备
- 产物类 C5/D4 挂 rubric_ref 闭环

### 改动文件

- `eval-suite/scenarios/`
- `eval-suite/assertions/ledger/`
- `eval-suite/assertions/trajectory/`

### 下一步

t6：报告模板+评分汇总+全量自检。

---
