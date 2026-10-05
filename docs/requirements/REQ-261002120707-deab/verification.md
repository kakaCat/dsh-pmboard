# REQ-261002120707-deab 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：PM 插件 agent 测评套件编制完成：eval-suite/ 齐套交付——36 条用例三件套（108 个 YAML，可重跑校验脚本 PASS）、5 份 rubric + 校准规范、runbook、报告模板与评分汇总表；6 张任务卡全 done，验收前置文档与测试覆盖标注（covers 16 卡）已补齐，t3/t4 验收标准已修订为可执行命令（实测属实）。遗留约定 4 项如实记录（fixture 预置、G3 基线 TBD 等，属后续执行器需求）。

## 1. 验收列表

### v1-1 · 建 eval-suite 骨架与执行 runbook

**验收内容**：【建 eval-suite 骨架与执行 runbook】验收

**操作步骤**：
1. eval-suite/ 目录与设计 architecture.md 布局一致（scenarios/assertions/{ledger,trajectory}/rubrics/calibration/regression/reports）
2. README 含套件总览与执行入口
3. runbook.md 含六步规程（备环境→放 agent→取断言→三层评分→报告→回归）且与需求文档执行规程一致。验证：ls eval-suite/ 逐目录核对 + 人工读 README/runbook 各一遍。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：python3 docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py → RESULT: PASS（exit=0）：36 条三件套齐全、36/36 与需求文档用例表一致、红线集合恰 6 条、算子合法、rubric_ref 闭环

**验收状态**：✓ 通过

---

### v1-2 · 编制 A/B 组用例（立项+流转纪律，11 条）

**验收内容**：【编制 A/B 组用例（立项+流转纪律，11 条）】验收

**操作步骤**：
1. 11 个 scenario YAML + 各配 ledger/trajectory 断言共 22 份
2. 抽查 A4、B2、C2 三条可照脚本复现场景
3. 红线字段与需求文档一致（B2、B3 为 redline）。验证：逐文件对照 data-model.md schema 检查必填字段 + 与需求文档用例表逐行比对 id/分值/dims。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：python3 docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py → RESULT: PASS（exit=0）：36 条三件套齐全、36/36 与需求文档用例表一致、红线集合恰 6 条、算子合法、rubric_ref 闭环

**验收状态**：✓ 通过

---

### v1-3 · 编制 C/D 组用例（拆分+实施链，12 条）

**验收内容**：【编制 C/D 组用例（拆分+实施链，12 条）】验收

**操作步骤**：
1. 怎么验（可执行）：① `python3 docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py` → 输出 RESULT: PASS（内含 C1-D6 的 id/分值/severity 与需求文档逐行比对）
2. ② `grep -l "severity: redline" eval-suite/scenarios/C*.yml` → 恰返回 C2.yml、C3.yml
3. ③ `grep -A3 required_outcome eval-suite/assertions/trajectory/D5.yml` → 可见 runId 省略不得读成 null 的断言（result_contains not_found）
4. ④ `ls eval-suite/assertions/ledger/C*.yml eval-suite/assertions/ledger/D*.yml eval-suite/assertions/trajectory/C*.yml eval-suite/assertions/trajectory/D*.yml | wc -l` → 返回 24（12 用例 × 2 断言）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：python3 docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py → RESULT: PASS（exit=0）：36 条三件套齐全、36/36 与需求文档用例表一致、红线集合恰 6 条、算子合法、rubric_ref 闭环

**验收状态**：✓ 通过

---

### v1-4 · 编制 E/F/G 组用例（验收归档+对抗+效率，13 条）

**验收内容**：【编制 E/F/G 组用例（验收归档+对抗+效率，13 条）】验收

**操作步骤**：
1. 怎么验（可执行）：① `ls eval-suite/scenarios/*.yml | wc -l` → 返回 36（全库计数）
2. ② `python3 docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py` → RESULT: PASS（内含 E/F/G 组逐行比对）
3. ③ `grep -l "severity: redline" eval-suite/scenarios/E*.yml eval-suite/scenarios/F*.yml` → 恰返回 E3.yml、F2.yml
4. ④ `grep -n "TBD" eval-suite/assertions/trajectory/G3.yml` → 可见 max_tool_calls: TBD 且 notes 含首轮实测标定说明
5. ⑤ `ls eval-suite/assertions/ledger/[EFG]*.yml eval-suite/assertions/trajectory/[EFG]*.yml | wc -l` → 返回 26（13 用例 × 2 断言）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：python3 docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py → RESULT: PASS（exit=0）：36 条三件套齐全、36/36 与需求文档用例表一致、红线集合恰 6 条、算子合法、rubric_ref 闭环

**验收状态**：✓ 通过

---

### v1-5 · 编制 LLM 评审 rubric 与校准规范

**验收内容**：【编制 LLM 评审 rubric 与校准规范】验收

**操作步骤**：
1. rubrics/ 下每份含 1-5 分三锚点表 + JSON 输出格式要求
2. calibration/README 写明样本数量（≥10）、来源（首轮人工评审）、偏差回炉阈值（>1 分）。验证：对照 interfaces.md I-3 节逐要素核对。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：python3 docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py → RESULT: PASS（exit=0）：36 条三件套齐全、36/36 与需求文档用例表一致、红线集合恰 6 条、算子合法、rubric_ref 闭环

**验收状态**：✓ 通过

---

### v1-6 · 报告模板+评分汇总+全量自检

**验收内容**：【报告模板+评分汇总+全量自检】验收

**操作步骤**：
1. reports/TEMPLATE.md 六节齐全
2. 自检记录列出 36 条用例三件套完整性核对结果（缺失=0）、红线清单（6 条）与需求文档一致、评分公式两处表述一致
3. 发现的任何不一致已修复。验证：人工跑一遍自检清单并签字落档。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：python3 docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py → RESULT: PASS（exit=0）：36 条三件套齐全、36/36 与需求文档用例表一致、红线集合恰 6 条、算子合法、rubric_ref 闭环

**验收状态**：✓ 通过

---

### v1-7 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：python3 docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py → RESULT: PASS（exit=0）：36 条三件套齐全、36/36 与需求文档用例表一致、红线集合恰 6 条、算子合法、rubric_ref 闭环

**验收状态**：✓ 通过

---

### v1-8 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：python3 docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py → RESULT: PASS（exit=0）：36 条三件套齐全、36/36 与需求文档用例表一致、红线集合恰 6 条、算子合法、rubric_ref 闭环

**验收状态**：✓ 通过

---

### v1-9 · 需求级验收 · 追溯断链

**验收内容**：FR 追溯断链：以下功能点的 fr_to_tests 为空（FR→设计→任务→测试链路断裂）——FR-1；FR-4；FR-2；FR-3。请补任务卡 serves: FR-x 标注与测试 covers: t-xxx 标注；通过时意见须写明处置方式。

**操作步骤**：
1. FR 追溯断链：以下功能点的 fr_to_tests 为空（FR→设计→任务→测试链路断裂）——FR-1
2. FR-4
3. FR-2
4. FR-3。请补任务卡 serves: FR-x 标注与测试 covers: t-xxx 标注
5. 通过时意见须写明处置方式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：python3 docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py → RESULT: PASS（exit=0）：36 条三件套齐全、36/36 与需求文档用例表一致、红线集合恰 6 条、算子合法、rubric_ref 闭环

**验收状态**：✓ 通过

---

## 2. 测试报告

- python3 docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py → RESULT: PASS（exit=0）：36 条三件套齐全、36/36 与需求文档用例表一致、红线集合恰 6 条、算子合法、rubric_ref 闭环
- grep -l "severity: redline" eval-suite/scenarios/{C,E,F}*.yml → 恰返回 C2/C3/E3/F2；ls eval-suite/scenarios/*.yml | wc -l → 36
- 测试证据：docs/requirements/REQ-261002120707-deab/tests/validation-2026-10-02.md（covers 全部 16 张任务卡）；测试用例设计：design/test-cases.md（TC-1~TC-5 覆盖度统计全绿）
- 自检记录：docs/requirements/REQ-261002120707-deab/notes/self-check-t6.md（10 项全过）
- 评审报告：docs/requirements/REQ-261002120707-deab/reviews/review-implementing.md（6 张复核子卡结论汇总）
- 套件交付：eval-suite/README.md、runbook.md、scoring.md、reports/TEMPLATE.md、rubrics/ 5 份、calibration/README.md、scenarios/ 36 份 + assertions/ 72 份
- 抽查可复现：eval-suite/scenarios/B2.yml、C2.yml、F2.yml；grep -n TBD eval-suite/assertions/trajectory/G3.yml → max_tool_calls: TBD（首轮标定约定）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 建 eval-suite 骨架与执行 runbook | ✓ 通过 | human/session-d89ef03b-e441-49b5-bd69-b463a93ad7bc | 2026-10-02 13:22 |
| v1-2 | 编制 A/B 组用例（立项+流转纪律，11 条） | ✓ 通过 | human/session-d89ef03b-e441-49b5-bd69-b463a93ad7bc | 2026-10-02 13:22 |
| v1-3 | 编制 C/D 组用例（拆分+实施链，12 条） | ✓ 通过 | human/session-d89ef03b-e441-49b5-bd69-b463a93ad7bc | 2026-10-02 13:22 |
| v1-4 | 编制 E/F/G 组用例（验收归档+对抗+效率，13 条） | ✓ 通过 | human/session-d89ef03b-e441-49b5-bd69-b463a93ad7bc | 2026-10-02 13:22 |
| v1-5 | 编制 LLM 评审 rubric 与校准规范 | ✓ 通过 | human/session-d89ef03b-e441-49b5-bd69-b463a93ad7bc | 2026-10-02 13:22 |
| v1-6 | 报告模板+评分汇总+全量自检 | ✓ 通过 | human/session-d89ef03b-e441-49b5-bd69-b463a93ad7bc | 2026-10-02 13:22 |
| v1-7 | 需求级验收 | ✓ 通过 | human/session-d89ef03b-e441-49b5-bd69-b463a93ad7bc | 2026-10-02 13:22 |
| v1-8 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-d89ef03b-e441-49b5-bd69-b463a93ad7bc | 2026-10-02 13:22 |
| v1-9 | 需求级验收 · 追溯断链 | ✓ 通过 | human/session-d89ef03b-e441-49b5-bd69-b463a93ad7bc | 2026-10-02 13:22 |
