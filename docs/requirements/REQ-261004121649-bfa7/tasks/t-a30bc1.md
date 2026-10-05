# t-a30bc1 回退物化要幂等、要有上限：超限整次拒绝，队列零新增·联调

> 需求：REQ-261004121649-bfa7 回退把需求埋了：重做卡递归膨胀且没有撤销入口

## 在做什么
回退物化要幂等、要有上限：超限整次拒绝，队列零新增·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-04T08:45:02.736Z，窗口 session-51baeeda-dbe8-4048-8bc8-b036050d7957）

联调段复核：会话侧与看板侧两条回退路径做的是同一件事。这一步做完，什么变了——同一个需求从窗口回退和从看板回退不再各写各的，新增字段的消费点也没有漏（早先漏过测试消费者，这次专门盘了）。

### 完成项

- 两条回退路径消费同一份编排结果：会话侧 MoveRequirement.ts:87-90 与看板侧 requirements.ts:154-157 都按「取消顶层父卡 + 复位子卡」一次写入
- 两边都取自同一个 applyRequirementRollback 的 taskPlan，不新造第二套判定
- 新增字段 resetTasks 的消费点盘全（grep 确认仅这两处，无遗漏消费者）
- 契约面同步：tests/rollback-tasks.test.ts:106 的严格相等断言已含 resetTasks: []，7 passed
- 顺序纪律未变：任务先写（队列）→ 需求后写（台账），复位与取消同在一个 mutate 内

### 改动文件

- `src/application/use-cases/MoveRequirement.ts`
- `src/http/routers/requirements.ts`
- `tests/rollback-tasks.test.ts`

### 下一步

复核段：对照设计逐条核对，偏离项定性

---
