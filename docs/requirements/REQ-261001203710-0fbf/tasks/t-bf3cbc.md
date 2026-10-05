# t-bf3cbc 查规范读不到时，说清是「没生成」还是「找错项目」

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
查规范读不到时，说清是「没生成」还是「找错项目」

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
1) `npx vitest run tests/project-scope.test.ts -t "知识层"` → 两病因两串不同文案均通过；2) 反向断言：把索引临时改名后不得出现「未初始化」字样；3) `npx tsc --noEmit` 不高于基线 192。

## 实施方案（implementation）
kb 检索读取处：按当前项目根解析；文件不存在时区分两种病因——① 本项目确实未生成 → 报「本项目知识层未生成」+ 解析出的项目根 + `npx tsx scripts/kb-build.mts --write`；② 空间错配 → 报「项目根与索引位置不一致」+ 两个路径。沿用统一信封，不新增枚举。测试：两病因各一例（含改名反向例）。

## 上游产出摘要（dependsSummary）
- 把「这条记录属于哪个项目」定成一个唯一口径

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
