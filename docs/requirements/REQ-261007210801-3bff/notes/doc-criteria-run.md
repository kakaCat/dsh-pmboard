# DOC-1..5 判据执行记录（2026-10-07 · t-828532 / t-bc7074）

对象：`docs/requirements/REQ-261007210801-3bff/design/product-plan.md`（已确认的规划正文）

| 条款 | 判据命令 | 输出 | 要求 | 结论 |
|---|---|---|---|---|
| DOC-1 | `test -f design/product-plan.md` | 退出码 0 | 通过 | ✅ PASS |
| DOC-2 | `grep -c "体验与可视化" design/product-plan.md` | 6 | ≥1 | ✅ PASS |
| DOC-2（补充） | 四候选取舍理由在 §1（A 还债/B 自动化/C 体验/D 外发） | 命中 5 | 存在 | ✅ PASS |
| DOC-3 | `grep -c "^| P[0-9]" design/product-plan.md` | 4 | ∈ 3–7 | ✅ PASS |
| DOC-3（列头） | 清单表列头 | `| # | 事项 | 做什么 | 为什么排这里 | 验收锚点 |` | 四列齐 | ✅ PASS |
| DOC-4 | `grep -c "^- N[0-9]" design/product-plan.md` | 5 | ≥3 | ✅ PASS |
| DOC-5 | `grep -c "^| J[0-9]" design/product-plan.md` | 3 | ≥1 且验证方式列非空 | ✅ PASS |

五条判据全部满足取值要求。
