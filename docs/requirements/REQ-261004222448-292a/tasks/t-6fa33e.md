# t-6fa33e DAG Tab（复用现有画布 + 每步执行结果）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
DAG Tab（复用现有画布 + 每步执行结果）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
命令 pnpm test -- tests/report-dag 全绿；断言包含：表头八列齐；失败行渲染 error 原文且可见；manual 触发行显示 manual；现有 DAG 画布容器存在且视图状态用例仍通过。

## 实施方案（implementation）
新增 src/client/views/dag-panel.ts：挂载现有 dag-mount 组件（画布与交互一律不改）；下方每步执行结果表八列（卡、阶段、谁做、触发、起止、结果、产出与汇报、证据与错误），含失败行（错误原文与重跑次数）与手动触发行示例。

## 上游产出摘要（dependsSummary）
- 前端壳：头部三块 + Tab 容器 + 懒加载 + 局部更新

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
