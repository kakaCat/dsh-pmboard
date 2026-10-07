# t-7d58de 两处判据接线并各自补可证伪用例·研发

> 需求：REQ-261007095750-9f48 拆分依赖判据的 src/ 盲区修复（PATH_RE 扩根）

## 在做什么
两处判据接线并各自补可证伪用例·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T02:06:49.534Z，窗口 session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2）

研发段完成：冲突门与零交集建议的 src 用例各就位，19 例全绿且证伪可复现

### 完成项

- tests/concurrency-limits.test.ts §6.4 新增两条：src 落点冲突（互无依赖+同一 src 文件 → 1 条冲突；同链串行 → 不冲突；.mts 与深层目录也认）
- tests/concurrency-limits.test.ts 新增端到端用例：走 executeDecompose 真入口，两卡声明同一 src 文件且互无依赖 → 拒 REQBOARD_FILE_CONFLICT 且落库 0 张（零副作用）
- tests/plan-depends-e2e.test.ts §FR-3③ 新增：src↔src 零交集 → 点名建议（含两端文件与 dep_reasons 修复示例）；src 有交集 → 不点名
- npx vitest run tests/concurrency-limits.test.ts tests/plan-depends-e2e.test.ts → 2 files / 19 passed（本卡新增 3 例）
- 证伪成立：去掉 PATH_RE 的 src 根重跑 → 恰好这 3 条新用例红（16 passed / 3 failed），还原后 19 passed 且文件逐字节一致
- npx tsc --noEmit -p tsconfig.json → 本卡两文件 0 错（存量仅 1 条属并发窗口在制）
- git diff --stat：concurrency-limits.test.ts +51 行、plan-depends-e2e.test.ts +95/-4 行

### 改动文件

- `tests/concurrency-limits.test.ts`
- `tests/plan-depends-e2e.test.ts`

### 下一步

复核段按卡验收标准逐条复核（含证伪记录与拒绝码）

---
