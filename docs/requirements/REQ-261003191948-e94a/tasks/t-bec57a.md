# t-bec57a 给迁移门补只读预检与可复制迁移命令·研发

> 需求：REQ-261003191948-e94a 迁移门拒绝启动时静默失败：界面只显示 404，没有任何迁移指引

## 在做什么
给迁移门补只读预检与可复制迁移命令·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-03T11:26:22.932Z，窗口 session-44207972-0dfc-41f4-89c0-01681149cd30）

研发段交付：迁移门新增只读预检与可复制 hint，抛错版改为同源外壳；测试 7 个用例全绿。

### 完成项

- migrationGate.ts 144 行：预检与抛错两入口同源，hint 单一构造点
- migration-gate.test.ts 137 行：新增 3 条用例锁三态、占位符与 message 同源
- npx vitest run tests/reqboard/migration-gate.test.ts 7 个用例全绿
- 两文件均为新增未跟踪文件，故以行数与 vitest 输出作交付摘要
- npx tsc --noEmit 命中改动文件错误数 0（全量 150，基线 223）

### 改动文件

- `src/repositories/migrationGate.ts`
- `tests/reqboard/migration-gate.test.ts`

### 下一步

交复核子卡 t-5479a5 做独立复核

---
