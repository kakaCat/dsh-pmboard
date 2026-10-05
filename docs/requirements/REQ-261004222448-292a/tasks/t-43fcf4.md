# t-43fcf4 服务端聚合查询：report、docs、dag、token 扩展

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
服务端聚合查询：report、docs、dag、token 扩展

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
命令 pnpm test -- tests/query-report 全绿；断言包含：缺口条数与 unreceived 条款数加挂起确认数一致；各阶段占比合计为 100%（容差 0.5）；每条优化点包含数字；无快照且合计为 0 时 availability 返回 none 且页面不出现 0 值表。

## 实施方案（implementation）
新增四个查询文件：src/application/query/QueryReport.ts（结论头、操作条、状态带，含 buildGaps 四类判定与 verdictLine）、QueryDocs.ts（文档铺开清单、核验表、门禁裁决留痕、归档）、QueryDag.ts（图数据与每步执行结果，取任务执行记录与最近汇报）、QueryToken.ts（在现有 token 装配上加每次调用均、缓存命中率、优化点、可得性三态）。聚合全在服务端，前端不遍历。

## 上游产出摘要（dependsSummary）
- 定死接口与降级契约（六端点 + 信封类型）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
