# t-b9dd2c 文档 Tab（文档铺开 + 核验 + 门禁留痕）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
文档 Tab（文档铺开 + 核验 + 门禁留痕）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
命令 pnpm test -- tests/report-docs 全绿；断言包含：文档行数与台账文档数一致；核验表包含实际结果、来源（agent 或 human）、需人工三列；文件缺失行的类名包含缺失标记且可见划线样式。

## 实施方案（implementation）
新增 src/client/views/docs-panel.ts：文档逐行铺开（类型、路径、登记时间、状态；文件缺失行划线标灰）；核验表照抄现有验证区列（实际结果、来源为 agent 或 human、需人工、意见、裁决）；门禁裁决留痕表（结论、方式、时间、理由）。

## 上游产出摘要（dependsSummary）
- 前端壳：头部三块 + Tab 容器 + 懒加载 + 局部更新

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
