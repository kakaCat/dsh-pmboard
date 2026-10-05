# 测试用例设计（REQ-261002120707-deab）

> 本需求交付物为测评套件**内容文件**（无代码改动），测试方式 = 可重跑校验脚本 + 人读复核。
> 脚本：`docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py`。

## 功能测试用例

### TC-1: 用例库三件套完整性 `covers: t-670e6c, t-ef3b62, t-6105b1, t-179322, t-6c7750, t-44989f` `validates: FR-2`

**测试目标**：36 条用例各有 scenario + ledger 断言 + trajectory 断言。

**前置条件**：t2/t3/t4 已交付。

**测试步骤**：
1. 运行 `python3 docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py`

**预期结果**：
- 输出 `三件套齐全: 36/36` 且 `RESULT: PASS`（exit=0）
- 无「缺用例」「缺字段」「YAML 解析失败」行

**覆盖场景**：
- [x] 正常流程（全量 36 条）
- [x] 异常处理（YAML 解析失败/缺文件会 FAIL，exit=1）

### TC-2: 用例表一致性 `covers: t-6ce90d, t-cae322, t-b5d93b` `validates: FR-2`

**测试目标**：id/max_score/severity 与需求文档用例库表逐行一致。

**测试步骤**：同 TC-1（脚本内置 36 行期望值表逐行比对）。

**预期结果**：无 `max_score …≠…` / `severity …≠…` 行；红线集合输出恰为 `['B2','B3','C2','C3','E3','F2']`。

### TC-3: 断言合法性 `covers: t-179322, t-6c7750, t-44989f` `validates: FR-1`

**测试目标**：台账断言只用算子表 8 算子、path 前缀合法；轨迹断言含 ordered_contains 与 budget。

**测试步骤**：同 TC-1。

**预期结果**：无「非法算子」「path 前缀非法」「缺 ordered_contains」「缺 budget」行。

### TC-4: rubric 引用闭环 `covers: t-84be62, t-93e406, t-7866be` `validates: FR-1, FR-3`

**测试目标**：产物类用例（C5/D4/E1/E3/E5/G2）的 rubric_ref 均有对应 rubrics/ 文件。

**测试步骤**：同 TC-1。

**预期结果**：输出 `缺文件: 无`。

### TC-5: 评分公式与报告模板一致 `covers: t-6e0d19, t-1dbc77, t-2a96d6, t-fa64d7, t-ad4270` `validates: FR-3, FR-4`

**测试目标**：scoring.md 公式与 design/interfaces.md I-4 逐符号一致；reports/TEMPLATE.md 六节齐全；README/runbook 与 architecture.md 布局及需求文档执行规程一致（覆盖骨架卡 t1 及其子卡）。

**测试步骤**：
1. 人读 `eval-suite/scoring.md` 公式块与 `docs/requirements/REQ-261002120707-deab/design/interfaces.md` I-4 节对照
2. 人读 `eval-suite/reports/TEMPLATE.md` 数节数
3. 人读 `eval-suite/README.md`、`eval-suite/runbook.md` 对照 `design/architecture.md` 目录布局与需求文档「执行规程」节

**预期结果**：6 个公式符号（case_pass/redline_failed/dim_score/total/pass_at_k/grade）一致；模板 6 节齐全；README/runbook 与设计布局、需求规程无偏离。

## 测试覆盖度统计

| 需求条款 | 关联任务 | 测试用例 | 覆盖状态 |
|---|---|---|---|
| FR-1 测评框架 | t1/t2/t3/t4/t5 | TC-3, TC-4, TC-5 | ✅ 已覆盖 |
| FR-2 用例库 | t2/t3/t4 | TC-1, TC-2 | ✅ 已覆盖 |
| FR-3 评分标准 | t5/t6 | TC-4, TC-5 | ✅ 已覆盖 |
| FR-4 执行规程 | t1/t6 | TC-1, TC-5 | ✅ 已覆盖 |
