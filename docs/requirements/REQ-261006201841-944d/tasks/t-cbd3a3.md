# t-cbd3a3 存量归档只读核对脚本 + 报告（按每条需求自己的根解析，真失效 2 条）·研发

> 需求：REQ-261006201841-944d 归档校验与知识层覆盖度加固（合并去向存在性 + 归档沉淀覆盖度 + 归档目录呈现）

## 在做什么
存量归档只读核对脚本 + 报告（按每条需求自己的根解析，真失效 2 条）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T13:10:34.328Z，窗口 session-95c36a7d-56ac-4360-be5b-44d0ebb9a1a5）

研发段完成：存量归档只读核对脚本落地，锚点复用 listHeadingAnchors 单一实现。

### 完成项

- 新建 scripts/archive-ledger-audit.mts（只读核对，--json / --out / --ledger-root）
- 在 operations.ts EXCLUDED 登记脚本（理由必填），避免 K10 覆盖度连锁
- 脚本产出报告落 docs/requirements/REQ-261006201841-944d/archive-reconcile-report.md

### 改动文件

- `scripts/archive-ledger-audit.mts`
- `src/domain/knowledge/operations.ts`
- `docs/requirements/REQ-261006201841-944d/archive-reconcile-report.md`

### 下一步

联调段

---
