# t-c5da35 修改 package.json 添加服务声明

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
修改 package.json 添加服务声明

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
运行 git diff package.json 确认已在 inject 数组中添加 userQuestions

## 实施方案（implementation）
在 package.json 第 77 行的 dsh.client.inject 数组中添加 "userQuestions" 声明。修改 1 个文件，添加 1 行代码。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
