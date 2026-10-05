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
## 汇报 1（2026-10-05T01:33:56.571Z，窗口 session-00af6c69-e55e-4878-8d4e-74056a439b01）

这一步做完，详情页四个 Tab 与常驻头部要的数都能在服务端一次算清：缺口可数、占比可对、优化点带数字、读不到的块明说不可用；「几件事等人」与缺口条数一致。

### 完成项

- 四聚合查询落地：首屏结论头与操作条、文档三合一、任务图与每步执行结果、按阶段 token
- 缺口四类判定与状态页同源；几件事等人的数字等于缺口条数（按需求判定）
- Token 阶段表加每次调用均与缓存命中两列，优化点每条带依据数字，三态降级不给零值表
- 文档缺件标灰划线、门禁六道带裁决与退回理由原文、归档清单透传
- 依赖三处接线：挂起确认口、会话探针、文档仓储（缺省各有明确降级说辞）
- 自测：38 例全绿；typecheck 本卡文件零错误

### 改动文件

- `src/application/query/QueryReport.ts`
- `src/application/query/QueryDocs.ts`
- `src/application/query/QueryDag.ts`
- `src/application/query/QueryToken.ts`
- `src/application/query/contracts.ts`
- `tests/query-report.test.ts`

### 下一步

t6 接线六条只读路由（本卡工作已完成，待开卡收口）

---
