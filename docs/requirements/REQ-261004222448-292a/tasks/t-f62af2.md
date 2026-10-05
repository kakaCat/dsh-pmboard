# t-f62af2 Token Tab（按阶段 + 每次调用均与缓存命中 + 优化点）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
Token Tab（按阶段 + 每次调用均与缓存命中 + 优化点）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
命令 pnpm test -- tests/report-token 全绿；断言包含：各阶段占比合计与总计一致；每次调用均与缓存命中两列可见；优化点包含数字；不可得态页面不出现 0。

## 实施方案（implementation）
改 src/client/token-info.ts：主视图换成按阶段八列（含每次调用均与缓存命中）；加可优化点列表（每条带依据数字）；三态 full 与 partial 与 none，partial 列出缺快照的阶段；把固定系统提示词块移出本 Tab（迁到提示词 Tab）。不做内层滚动。

## 上游产出摘要（dependsSummary）
- 前端壳：头部三块 + Tab 容器 + 懒加载 + 局部更新

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
