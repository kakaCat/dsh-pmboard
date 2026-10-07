# t-a3fa40 既有用例契约升级（7 个旧形态文件）与兼容回归

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
既有用例契约升级（7 个旧形态文件）与兼容回归

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：fullstack

## 得到什么结果
跑 npx vitest run tests/archive-reconcile.test.ts tests/archive-reconcile-e2e.test.ts tests/artifact-gates.test.ts tests/acceptance-archive.test.ts tests/archive-compat.test.ts tests/kb-archive-deposit.test.ts tests/output-contract.test.ts 全绿；且 diff 里不出现任何放宽判据的痕迹（逐条自查：无新增 skip/todo、无删除已有 expect、无把拒绝断言改成通过断言）；archive-compat 至少一条用例断言旧形态 archive.json 仍能渲染出 section 文本。

## 实施方案（implementation）
逐个改：tests/archive-reconcile.test.ts、tests/archive-reconcile-e2e.test.ts、tests/artifact-gates.test.ts、tests/acceptance-archive.test.ts、tests/archive-compat.test.ts、tests/kb-archive-deposit.test.ts、tests/output-contract.test.ts——把 manual_updates 的 path 改为 `docs/architecture/<doc>.md#<真实标题锚点>`，并用既有 stubDocFile（tests/helpers/tool-deps.ts）把目标文档写进桩工作区、把 merged_into 目标也 stub 出来；archive-compat 保留一条旧形态（无 #、有 section）的读侧渲染断言，钉住向后兼容。

## 上游产出摘要（dependsSummary）
- archive.md 写盘、幂等与清单补登（渲染失败即整体拒绝、台账零写入）
- 失效条件可判定性纯判定 + 沉淀侧派生（不再生产模板句）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T13:27:45.258Z，窗口 session-7bda6cee-8918-4b81-90e1-8536ee47f76d）

t11 全卡完成：既有用例的契约升级与兼容回归收口（含计划清单漏列的第 8 个同类文件）。

### 完成项

- 三条子卡全 done：研发/复核/测试各有汇报与读数
- 计划点名的 7 个文件升级到新契约，7 文件 111 条全绿
- 旧形态读侧渲染仍可出 section 文本，兼容不回退
- 无放宽判据痕迹：无新增 skip / todo / only，未删既有 expect
- 补做第 8 个同类文件 tests/application/use-cases.test.ts（计划清单遗漏）：同一类旧形态夹具，升级后 21/21
- 全量跑：16 个本需求相关测试文件 0 失败

### 改动文件

- `tests/archive-reconcile.test.ts`
- `tests/archive-reconcile-e2e.test.ts`
- `tests/artifact-gates.test.ts`
- `tests/acceptance-archive.test.ts`
- `tests/archive-compat.test.ts`
- `tests/kb-archive-deposit.test.ts`
- `tests/output-contract.test.ts`
- `tests/application/use-cases.test.ts`

### 下一步

t12 反向演练组 + 改动前后集合差 + 报告落盘（脚本由子代理落地中）

---
