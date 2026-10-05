# t-ee86f6 depends_on 端到端复现+构建指纹

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
depends_on 端到端复现+构建指纹

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
npx vitest run tests/plan-depends-e2e.test.ts 通过：seed 需求+批准计划（t1→t2→t3 链式 depends_on）→ landApprovedPlan → 断言父卡 dependsOn 逐环成链且为真实 id；npx vitest run tests/tools-schema.test.ts 通过且 reqboard_status 回执含 plugin_build（schema 先声明后回执，按 REQ-261003204143-3219 纪律）

## 实施方案（implementation）
① 新增 tests/plan-depends-e2e.test.ts 走真实端口（内存 store+landApprovedPlan），断言三张父卡 dependsOn 成链；② 装配处计算 sha256(dist/index.mjs)[0:12] 写 diag 日志；③ StatusTool output.schema 先加 plugin_build 声明再改回执

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-03T16:19:37.282Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

t3 完成：依赖链有了端到端看守、漏传有了点名警告、构建有了可查指纹——「我在跑哪份构建、我的依赖传没传上」两个问题从此不用猜

### 完成项

- 定性结论落地：「depends_on 落库丢失」= agent 漏传 + 无防线（非系统 bug）；端到端用例守「带 depends_on → 逐环成链」防真回归
- 提交侧一致性警告：dependency_warnings 进 plan 回执（schema 先行），漏传当场点名
- 构建指纹：plugin_build 进 status 回执，启动日志双通道留痕——陈旧构建从此可查
- 判据：4 新用例绿、全量 98=基线、tsc 归属零错

### 改动文件

- `src/application/internal/plan-deps-check.ts`
- `src/shared/build-stamp.ts`
- `tests/plan-depends-e2e.test.ts`
- `docs/requirements/REQ-261003222428-3556/tasks/t-ee86f6.md`

### 下一步

t5 wake 活性校验（N-1，Dive 域）

---
