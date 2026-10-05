# t-ab048e 前端壳：头部三块 + Tab 容器 + 懒加载 + 局部更新

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
前端壳：头部三块 + Tab 容器 + 懒加载 + 局部更新

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
命令 pnpm test -- tests/report-shell 全绿；断言包含：首屏请求数不超过 2 且不含正文；未点过的 Tab 请求数返回 0；未激活面板的 token 选择器返回 null；模拟一次 revision 变更后滚动位置、展开态、当前 Tab 均不变；终态下动作按钮数返回 0；档二渲染不包含文档表、成本、提示词正文选择器。

## 实施方案（implementation）
新增三个视图文件：src/client/views/report-head.ts（结论头、窗口跳转按钮、操作条按钮与后果说明、终态只读）、report-band.ts（做到哪了、缺口、结果与成效三格）、report-tabs.ts（六个同级 Tab、角标数字、切到才请求、未激活面板不入 DOM、按需求与 Tab 与 revision 组成的内存缓存键）；改 src/client/board-mount.ts 为分段局部更新；档二收敛到同一数据模型，档一不改。

## 上游产出摘要（dependsSummary）
- 接线六条只读路由（分页 + 入参校验 + 降级）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
