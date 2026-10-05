# t-cc816f 挂起确认机制扩写：storage-action + 一次性 consume

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
挂起确认机制扩写：storage-action + 一次性 consume

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/reqboard/pending-confirm-consume.test.ts 全绿：同一 ticket 两次 consume 只第一次成功（第二次返回失败且不消费状态）；过期 ticket 拒绝；未落章 ticket 拒绝。

## 实施方案（implementation）
改 src/adapters/PendingConfirmRegistry.ts：register() 接受 target:'storage-action' 且 requirementId 可空（存储开关是宿主级动作），新增 consume(ticket) 原子校验『已落章 + 未过期 + 未消费』并置为已消费（并发两次只成功一次，落章沿用 settle 既有形状含 channel/sessionId/pluginVersion）；新增 tests/reqboard/pending-confirm-consume.test.ts。

## 上游产出摘要（dependsSummary）
- 定契约：端口 + 设置解析纯函数 + SQLite DDL 常量 + 错误码映射

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T09:13:44.974Z，窗口 session-f92af7dc-0c8b-4759-bbc9-a0b9916aae1b）

这张卡做完，换数据库开关从「前端自觉」变成了「代码不允许」：没经人确认的调用拿不到票据，而票据用一次就作废。顺带堵掉一个会白白放行一次切换的畸形确认漏洞。

### 完成项

- 切库的「人工确认」有了代码级门槛：一张票据只能消费一次，重放与并发都只成功一次
- 畸形确认不再被误当成已确认（原来会白白放行一次后端切换），改为 fail-closed
- 宿主级动作走独立表：不会拦截任何需求的写路径
- 既有产物/计划确认路径一字未动，回归只多出本卡 8 条新用例
- 两条会坑到路由卡的约束写成说明文件（共享类型未含该动作；403 必须靠消费票据判定）

### 改动文件

- `src/adapters/PendingConfirmRegistry.ts`
- `tests/reqboard/pending-confirm-consume.test.ts`
- `docs/requirements/REQ-261004103330-005f/notes/t7-upstream-notes.md`

### 下一步

批次 3 中路由卡按说明文件接线

---
