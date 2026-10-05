# t-7ef8ec 回退撤销语义：撤章 + 撤批准 + 标待同步

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
回退撤销语义：撤章 + 撤批准 + 标待同步

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
新增 tests/rollback-revocation.test.ts 并跑全绿：① 目标 design 时 stage 晚于 design 的产物全部无章，且 design 自身不被误撤；② plan.approvedAt===undefined；③ 连续两次回退到同一目标，docSyncPending 无重复 source 条目。

## 实施方案（implementation）
新建 src/application/internal/rollback-revocation.ts 的 applyRollbackRevocation：按 stagesAfter(to) 撤章（delete confirmedAt/confirmedBy/confirmedVia，保留登记）；to 早于 decomposing 时清 plan.approvedAt/approvedBy；调 applyDocSync 标下游待同步；写 req.rollback 与一条 [回退] 评论列明作废清单。

## 上游产出摘要（dependsSummary）
- 数据契约：rollback / reworkOf 可选字段

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-03T13:03:49.869Z，窗口 session-a3e5e82b-b588-4c77-b458-9c2065eb0e87）

撤销语义落地：退回去的时候，下游那几个「已确认」会如实作废、计划批准会被收回——于是退回去再往上走时，每一道人工门都得重新过，不会凭旧章白送。

### 完成项

- 新增 applyRollbackRevocation：撤章（保留登记）／撤批准／标待同步／写 rollback 留痕与评论
- 三条规则判据同源（stagesAfter），无硬编码阶段名，避免「退回 design 却漏撤批准」
- 9 例单测全绿 + 判别力 A/B 自证（撤掉撤章逻辑 → 3 条必红）
- 全量失败数与基线持平、tsc 无新增；双向差集皆空
- 幂等断言逼出一处真缺陷（待同步 source 推导）并已修掉

### 改动文件

- `src/application/internal/rollback-revocation.ts`
- `tests/rollback-revocation.test.ts`

### 下一步

投递下一张 ready 卡：旧任务卡处置 或 接口契约

---
