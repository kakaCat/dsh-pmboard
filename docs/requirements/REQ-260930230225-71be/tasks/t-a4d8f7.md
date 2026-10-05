# t-a4d8f7 抽出流程图模型与档位常量（契约卡）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
抽出流程图模型与档位常量（契约卡）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
运行 ./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts -t TC-5 → 输出 1 passed；运行 ./node_modules/.bin/tsc --noEmit -p tsconfig.json → 退出码 0。

## 实施方案（implementation）
新增 src/client/flow-chart-model.ts：导出 FLOW（七节点与序）、FLOW_TIERS{token:880,link:620,label:460}、类型 FlowNodeModel / FlowChartModel、纯函数 buildFlowChartModel(input)（状态→四态、分类→skipped、nodes[]→token、progress→countText、状态不在 FLOW 时 currentKey=null）。同卡新建 tests/header-progress-responsive.test.ts 并写 TC-5 模型映射用例（7 种 status 的 state 序列、skip、token、countText、currentKey=null）。本卡不改任何既有文件。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-09-30T15:13:49.694Z，窗口 session-a989385b-6ee0-4cbc-9b68-eeeca9a7b86c）

流程图的「口径」从界面代码里抽成了独立模型：哪个节点是当前、哪些已完成、哪类需求跳过哪一步、每个节点花了多少 token、右侧计数写什么，现在都能脱离界面单独断言。本卡落地后，后面的组件接线、样式档位、六档探针都基于同一份口径，不会再出现「前端算一套、探针量另一套」。

### 完成项

- 新增 src/client/flow-chart-model.ts：七节点 FLOW、状态中文表 STATUS_LABEL、档位常量 FLOW_TIERS、buildFlowChartModel() 纯函数与四个类型
- 映射规则逐条落到代码：状态→四态（前后 done / 当前 current / 之后 pending）、未知状态→无当前节点、分类流程跳过标记、token 只在有快照时出现、计数文案 done/total 或回落状态中文
- 新增 tests/header-progress-responsive.test.ts 的 TC-5 组（7 条用例，覆盖 D-2 映射规则表）
- 自测：vitest -t TC-5 → 7 passed（卡上写的是 1 passed，实际 7 条都命中该过滤器，全部通过）
- 自测：tsc 全仓基线本就是红的（276 行、74 个文件，均为既有债务）；本次两个新文件 0 错误

### 改动文件

- `src/client/flow-chart-model.ts`
- `tests/header-progress-responsive.test.ts`

### 下一步

t4 样式卡与 t3 视图接线卡都依赖本卡的 FLOW_TIERS 与模型；探针（t5）将直接调用本模型生成标本 DOM

---
