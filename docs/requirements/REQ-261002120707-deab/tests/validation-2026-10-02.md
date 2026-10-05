# 测试证据：eval-suite 全量自检（2026-10-02）

> covers: t-6e0d19, t-670e6c, t-ef3b62, t-6105b1, t-84be62, t-fa64d7, t-1dbc77, t-2a96d6, t-179322, t-6ce90d, t-6c7750, t-cae322, t-44989f, t-b5d93b, t-93e406, t-7866be, t-ad4270 ｜ validates: FR-1, FR-2, FR-3, FR-4

## 命令

```
python3 docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py
```

## 输出（实测，exit=0）

```
scenarios: 36  ledger: 36  trajectory: 36
三件套齐全: 36/36
红线 6 条: ['B2', 'B3', 'C2', 'C3', 'E3', 'F2']
rubric_ref 用例: ['C5', 'D4', 'E1', 'E3', 'E5', 'G2']  缺文件: 无
RESULT: PASS
```

## 覆盖的断言

| 断言 | 对应验收点 |
|---|---|
| 36 条 scenario YAML 可解析、必填字段齐全 | t2/t3/t4 acceptance 的 schema 检查 |
| id/max_score/severity 与需求文档用例表 36/36 一致 | t6 acceptance「与需求文档一致」 |
| 红线集合恰为 6 条 | 需求文档「评分标准」红线一票否决清单 |
| 台账断言算子 ∈ 8 算子表、path 前缀合法 | data-model.md LedgerAssert 规范 |
| 轨迹断言含 ordered_contains + budget | data-model.md TrajectoryAssert 规范 |
| 6 处 rubric_ref 闭环 | interfaces.md I-3 适用用例清单 |

## 说明

本需求交付物为**内容文件**（YAML/Markdown），无插件代码改动，无 vitest 用例可跑；
本脚本即该内容的可重跑测试证据，后续修订套件后应重跑。
