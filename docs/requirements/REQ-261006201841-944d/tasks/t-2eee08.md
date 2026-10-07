# t-2eee08 既有用例契约升级（7 个旧形态文件）与兼容回归·研发

> 需求：REQ-261006201841-944d 归档校验与知识层覆盖度加固（合并去向存在性 + 归档沉淀覆盖度 + 归档目录呈现）

## 在做什么
既有用例契约升级（7 个旧形态文件）与兼容回归·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T13:23:55.875Z，窗口 session-7bda6cee-8918-4b81-90e1-8536ee47f76d）

研发段完成：7 个旧形态用例升级到新契约，目标文档真 stub 出来备用例钉住。

### 完成项

- 升级 7 个文件：archive-reconcile / reconcile-e2e / artifact-gates / acceptance-archive / compat / kb-archive-deposit / output-contract
- manual_updates 的 path 改为带真实标题锚点，merged_into 目标一并 stub 进桩工作区
- archive-compat 保留一条旧形态（无 # 有 section）读侧渲染断言，钉住向后兼容
- 未放宽判据：无新增 skip / todo / only，未删既有 expect
- 判据：7 文件 111 条全绿

### 改动文件

- `tests/archive-reconcile.test.ts`
- `tests/archive-reconcile-e2e.test.ts`
- `tests/artifact-gates.test.ts`
- `tests/acceptance-archive.test.ts`
- `tests/archive-compat.test.ts`
- `tests/kb-archive-deposit.test.ts`
- `tests/output-contract.test.ts`

### 下一步

复核段：核对升级为契约升级而非放宽判据

---
