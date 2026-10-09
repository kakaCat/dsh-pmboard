# 测试用例 `serves: DOC-1, DOC-2, DOC-3, DOC-4, DOC-5`

本需求的「测试」= 需求文档 DOC-1..5 判据命令的逐条执行。用例与实测结果：

| 用例 | 条款 | 命令 | 期望 | 实测 |
|---|---|---|---|---|
| TC-1 | DOC-1 | `test -f design/product-plan.md` | 退出码 0 | 0 ✅ |
| TC-2 | DOC-2 | `grep -c "体验与可视化" design/product-plan.md` | ≥1 且含四候选取舍 | 6，理由在 §1 ✅ |
| TC-3 | DOC-3 | `grep -c "^| P[0-9]" design/product-plan.md` | ∈ 3–7 且四列齐 | 4，列头齐 ✅ |
| TC-4 | DOC-4 | `grep -c "^- N[0-9]" design/product-plan.md` | ≥3 | 5 ✅ |
| TC-5 | DOC-5 | `grep -c "^| J[0-9]" design/product-plan.md` | ≥1 且验证方式列非空 | 3 ✅ |

执行全记录：../notes/doc-criteria-run.md；证据副本：../tests/doc-criteria-run.md。
