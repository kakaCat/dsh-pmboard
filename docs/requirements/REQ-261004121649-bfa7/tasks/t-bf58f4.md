# t-bf58f4 老数据兜底与回执诚实性：没有回退序号的旧卡怎么匹配·联调

> 需求：REQ-261004121649-bfa7 回退把需求埋了：重做卡递归膨胀且没有撤销入口

## 在做什么
老数据兜底与回执诚实性：没有回退序号的旧卡怎么匹配·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-04T08:54:01.834Z，窗口 session-51baeeda-dbe8-4048-8bc8-b036050d7957）

联调段：回执一路透出没有被路由层改造过。这一步做完，什么变了——人在看板上看到的 matchedBy 与用例断言的是同一个字段，不用担心「接口回执说精确、实际是猜的」这种两套口径。

### 完成项

- HTTP 出口原样透出用例回执（requirements.ts:723 ok(res, result)），路由层不再自行拼回执字段——单一实现处
- 响应字段与设计 interfaces §三 约定一致：canceled / restoredLinks / note，另加 id / rollbackSeq / matchedBy / skipped（只增既有消费者不受影响）
- 兜底口径在出口上可见：matchedBy 直接进响应体，看板与人无需读日志就能知道这次是精确还是猜的
- 用例断言与出口字段同源：断言的就是 RollbackCleanupResult 的字段，不存在「用例测 A、出口给 B」
- 自测：tests/rollback-cleanup.test.ts → 12 passed

### 下一步

复核段：对照 data-model.md 兼容节核对兜底口径

---
