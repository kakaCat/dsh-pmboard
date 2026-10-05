# t-cbc2f6 渲染断言·架构与降级

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
渲染断言·架构与降级

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：frontend

## 得到什么结果
命令 pnpm test -- tests/report-shell.test.ts tests/report-degrade.test.ts 全绿；断言与取数架构与降级两组逐条对应（不少于 13 条）；其中包含无内层滚动容器的反例断言与不得用 0 表示未知的反例断言。

## 实施方案（implementation）
新增 tests/report-shell.test.ts 与 tests/report-degrade.test.ts，覆盖取数架构与降级两组断言（请求计数、未激活面板缺席、无内层滚动、三类空态、不得用 0 表示未知）。

## 上游产出摘要（dependsSummary）
- 前端壳：头部三块 + Tab 容器 + 懒加载 + 局部更新

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
