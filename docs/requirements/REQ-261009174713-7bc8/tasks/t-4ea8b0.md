# t-4ea8b0 jobs 兜底改端口注入

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
jobs 兜底改端口注入

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
grep -rn "adapters/DshJobsAdapter" packages/pmboard-core/src | wc -l == 0；QueryRunStatus 注入/缺省两分支单测全绿

## 实施方案（implementation）
改 QueryRunStatus.ts 移除 adapters/DshJobsAdapter 的 import，只接受注入的 jobs resolver；根包装配处注入 DshJobsAdapter；保持「调用方注入优先」语义。

## 上游产出摘要（dependsSummary）
- core 包落位与 import 重写

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-09T15:46:00.269Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

t14 验收复核通过（该改动在 t12 期间已提前落地）：core 内 adapters/DshJobsAdapter 提及为 0；注入链路完整（根包构造 → QueryState 映射 → QueryRunStatus 缺省 undefined 不猜）；单测 10/10 全绿。

### 完成项

- 验收一：grep -rn 'adapters/DshJobsAdapter' packages/pmboard-core/src | wc -l = **0**（core 不再自己构造适配器）
- 验收二：npx vitest run tests/unit/query-run-status.test.ts → 1 文件 **10 例全绿**（覆盖注入与缺省两分支）
- 注入链路完整（三段实测）：① 根包 src/index.ts:1134 `useCaseDeps.jobs = new DshJobsAdapter(jobsCtx)`（且 isAvailable 先探测）；② core 的 QueryState.ts:89-103 把它映射为 dshJobsAdapter 形参；③ QueryRunStatus.resolveJobsAdapter(params) 只读 params.dshJobsAdapter，缺省返回 undefined
- 缺省语义符合设计口径：嵌入调用 / 测试没注入 → 不查 job 状态、按无运行态返回（不猜、不编造 running）——注释里写明「core 自己摸 globalThis 等于把宿主边界搬进 L1」
- 判据：core 内 globalThis 相关 jobs 兜底已归零；RF-12 由本卡承接

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/pmboard-core/src/application/use-cases/QueryRunStatus.ts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-core/src/application/query/QueryState.ts`
- `.worktrees/req-261009174713-7bc8/src/index.ts`

### 下一步

本卡两条验收均满足；子卡链（t-5c415b 研发 / t-f50f63 复核 / t-25b71c 测试）待按三阶段登记后关父卡——收尾方式与 t16/t18 同款。

---
