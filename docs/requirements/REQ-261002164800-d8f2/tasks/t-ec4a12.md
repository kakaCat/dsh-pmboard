# t-ec4a12 补写入口：reqboard_task_refs 工具 + 看板改卡路由复用同一用例·测试

> 需求：REQ-261002164800-d8f2 修复计划落库 refs 断链：门禁不对称 + 计划通道丢字段 + 无补写入口

## 在做什么
补写入口：reqboard_task_refs 工具 + 看板改卡路由复用同一用例·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-02T09:20:39.743Z，窗口 session-fcfe356b-c62e-48cd-aee7-a94245188531）

测试段：补写入口 6 条用例全绿；工具 schema 与输出契约门禁对本工具零失败，类型错误未增

### 完成项

- npx vitest run tests/reqboard/task-refs-repair.test.ts → 6 passed
- npx vitest run tests/tools-schema.test.ts tests/output-contract.test.ts tests/reqboard → 286 passed / 3 failed（3 项均为既有失败：TaskAdopt / Knowledge / Regenerate）
- npx tsc --noEmit → 187 个错误（与改动前同数，未超基线 223）；本卡改动文件零错误
- 修前必红有据：改动前 src 内 requirementRefs 的写点只有建卡一处，无任何补写入口

### 改动文件

- `tests/reqboard/task-refs-repair.test.ts`

### 下一步

父卡收口；下一张 ready 卡为 t-14c7b1（存量回填器）

---
