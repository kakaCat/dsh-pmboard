# t-9f4f1d 文档模板加两节（关键决策与取舍、技术方案与亮点）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
文档模板加两节（关键决策与取舍、技术方案与亮点）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：doc
- 端侧：doc

## 得到什么结果
命令 grep -l "关键决策与取舍" templates/design/*.md templates/brainstorming/*.md | wc -l 返回不小于 2；命令 git diff --name-only 表明既有节名未被改名（仅新增行）。

## 实施方案（implementation）
在 templates/design/architecture.md 及适用的设计模板里加两节骨架（关键决策与取舍、技术方案与亮点）；在 templates/brainstorming/feature.md 及按类型的模板里加同名节或指向设计节的说明。不改既有节名，只新增。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
