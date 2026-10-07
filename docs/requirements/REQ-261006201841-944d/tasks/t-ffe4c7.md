# t-ffe4c7 闸 1/闸 2 事实判定与 SubmitArchive 接线（按需求自身 workspaceRoot 判在不在）·测试

> 需求：REQ-261006201841-944d 归档校验与知识层覆盖度加固（合并去向存在性 + 归档沉淀覆盖度 + 归档目录呈现）

## 在做什么
闸 1/闸 2 事实判定与 SubmitArchive 接线（按需求自身 workspaceRoot 判在不在）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-06T13:04:25.058Z，窗口 session-95c36a7d-56ac-4360-be5b-44d0ebb9a1a5）

测试段完成：本卡判据 7/7 全绿、RV-1 单跑通过；全量回归读数已采集并逐条归因（本次引入 63 条属契约升级，其余为其他窗口在飞）。

### 完成项

- 判据命令：npx vitest run tests/archive-targets-gate.test.ts → 1 file / 7 tests passed
- RV-1 单跑（-t 目标不存在）→ 1 passed，拒绝消息含路径 + 生效根 + by=path-fallback
- 全量回归快照：6478 用例、失败 463；逐条归因后本次归档面新增 63 条（旧形态夹具，归 t11）
- 树内其余 300+ 条新增失败经逐条查看为其他窗口在飞（footprint/plan/accept-sheet 等），非本次引入

### 改动文件

- `tests/archive-targets-gate.test.ts`

### 下一步

t3/t4 承接渲染物；t11 承接 63 条旧形态用例升级

---
