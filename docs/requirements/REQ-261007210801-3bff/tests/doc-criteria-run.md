# 测试证据：DOC-1..5 判据执行输出（2026-10-07）

covers: t-661634, t-828532, t-486746, t-f842e3, t-bc7074, t-ed8d50, t-301e61

对象：`docs/requirements/REQ-261007210801-3bff/design/product-plan.md`（已确认规划正文）
执行者：session-be1b4f3d（t-828532 / t-bc7074）

```
DOC-1: PASS                       # test -f design/product-plan.md → 退出码 0
DOC-2: 体验与可视化命中=6（≥1）     # grep -c "体验与可视化" design/product-plan.md
DOC-2: 四候选取舍理由命中=5         # §1 含 A 还债/B 自动化/C 体验/D 外发
DOC-3: P行数=4（∈3–7）             # grep -c "^| P[0-9]" design/product-plan.md
DOC-3: 列头=| # | 事项 | 做什么 | 为什么排这里 | 验收锚点 |
DOC-4: 非目标条数=5（≥3）           # grep -c "^- N[0-9]" design/product-plan.md
DOC-5: J行数=3（≥1）               # grep -c "^| J[0-9]" design/product-plan.md
DOC-5: 验证方式列=| 判据 | 验证方式 |（每行非空）
```

补充回归：`npx tsc --noEmit` → 0 errors；文档相关 11 测试文件 140 用例全绿
（archive-* / kb-index-rank / stage-detail / artifact-gates / path-extraction-scope）。
