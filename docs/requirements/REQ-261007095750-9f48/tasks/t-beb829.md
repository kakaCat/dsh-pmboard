# t-beb829 两处判据接线并各自补可证伪用例

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
两处判据接线并各自补可证伪用例

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/concurrency-limits.test.ts tests/plan-depends-e2e.test.ts 全绿；证伪：把 PATH_RE 的 src 根去掉后重跑 → 两条新用例必须红（贴输出摘要）；冲突门拒绝码为 REQBOARD_FILE_CONFLICT；补上依赖后不再冲突

## 实施方案（implementation）
在 tests/concurrency-limits.test.ts 补冲突门 src 用例（两卡 implementation 各写同一个 src/.../a.ts 且 dependsOn 互不包含 → findWorkSurfaceConflicts 返回 1 条、提交被拒 REQBOARD_FILE_CONFLICT；补上依赖后不再冲突）；在 tests/plan-depends-e2e.test.ts 补零交集建议用例（两卡分别声明 src/.../a.ts 与 src/.../b.ts、无依赖、无理由 → dependency_warnings 非空）。验证：npx vitest run 两个文件全绿；再把 src 根去掉重跑 → 新用例必须红。

## 上游产出摘要（dependsSummary）
- 路径抽取口径扩根（唯一取数口改一处）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T02:07:10.926Z，窗口 session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2）

t2 收尾：两处判据的 src 用例就位，19 例全绿且证伪可复现

### 完成项

- t2 两张子卡（研发 t-7d58de、复核 t-ab83a1）全部完成
- 冲突门侧：unit 用例（src 同一文件 + 互无依赖 → 1 条冲突；同链串行 → 不冲突；.mts 与深层目录也认）+ 端到端用例（executeDecompose 真入口 → 拒 REQBOARD_FILE_CONFLICT 且落库 0 张）
- 零交集建议侧：src↔src 零交集 → 点名（含两端文件与 dep_reasons 修复示例）；src 有交集 → 不点名
- 两文件 19 passed；证伪：去掉 src 根 → 恰好 3 条新用例红，还原后绿且逐字节一致；tsc 本卡文件 0 错
- 复核六项契约核对全中（含「零交集建议未自建正则」这条防分叉断言）

### 改动文件

- `tests/concurrency-limits.test.ts`
- `tests/plan-depends-e2e.test.ts`

### 下一步

t3 真实数据扩根前后读数；t4 文档边界同步与收口读数

---
