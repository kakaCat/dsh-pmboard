# t-74eb0c 定死接口与数据契约（端口 / 可选字段 / 逐项结果类型）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
定死接口与数据契约（端口 / 可选字段 / 逐项结果类型）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果

① 本卡改动零类型错误：以 pnpm typecheck 报错集合为判据，报错必须 ⊆ 他人在飞改动引入的集合（实测唯一报错为 tests/query-docs-roots.test.ts 的 TS2415，根因是他窗口 tests/application/harness.ts 给 FakeDocs 新增 private root；HEAD 版本无该字段，只读取证）；② npx vitest run tests/contract-types.test.ts 全绿（10 用例）；③ pnpm build:client 退出码 0 且输出含 [verify-client] OK；④ 未 bump REQBOARD_SCHEMA_VERSION 与 QUEUE_VERSION、未动 REQUIRED_TASK_FIELDS；⑤ 契约层对照设计文档逐字核对无偏离（复核 19 项），复核 P2 已按归属携带到 t3/t4/t5/t7 的验收标准。

## 实施方案（implementation）
按 interfaces.md 的 I-1~I-5 与 data-model.md 落类型：① src/application/ports.ts 加 VolatileNoticePort（notify 永不抛）与运行态存储端口方法；② src/shared/protocol.ts 加 TaskRecord.budgetRequests?: number、VolatileNoticeKind、TaskMoveItemResult、TaskTreeSummary、SubtasksBudgetState；③ 客户端镜像 src/client/types.ts 同步；④ 四处手工投影补字段透传：src/application/query/QueryStageDetail.ts、src/application/internal/sheet-tasks.ts、src/application/query/QueryDag.ts、src/http/routers/stages.ts；⑤ 新增 tests/contract-types.test.ts 断言端口与字段存在、且 budgetRequests 不进 REQUIRED_TASK_FIELDS。不动状态机、不 bump REQBOARD_SCHEMA_VERSION / QUEUE_VERSION。验证：pnpm typecheck 零错 + pnpm build:client 退出码 0。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T02:32:41.521Z，窗口 session-57f49896-70ca-4e67-b9f2-acc2cbdcc531）

t1 父卡交付：接口与数据契约定死并落库，契约层经对抗式复核 19 项无偏离。

### 完成项

- 子卡 t-7e85ab（研发）与 t-6177ea（复核）均 done
- ports.ts 新增 VolatileNoticePort 与 SubtaskBudgetPort（notify 签名与设计逐字一致）
- protocol.ts 新增 TaskRecord.budgetRequests 可选字段与四个契约类型；树节点镜像 12 字段全等且双向断言防漂移
- client/types.ts 客户端镜像同步；四处手工投影全部透传且缺省不写键
- 未 bump REQBOARD_SCHEMA_VERSION 与 QUEUE_VERSION；budgetRequests 未进 REQUIRED_TASK_FIELDS
- 实跑契约测试 10 用例全绿、build:client 退出码 0 且 verify-client OK
- 复核逐字核对 19 项，契约层无偏离
- 归属切分：本卡 7 文件 diff 约三分之二为他人 hunk（REQ-261006201814-ac4f / 261006201841-944d / 261006211623-9dc1 / 261006201920-2adc 等），验收只以本卡证据为准
- P2 七条已按归属携带到 t3/t4/t5/t7 验收标准；设计文档已补类型落点与 write 失败语义一句

### 改动文件

- `src/application/ports.ts`
- `src/shared/protocol.ts`
- `src/client/types.ts`
- `src/application/query/QueryStageDetail.ts`
- `src/application/internal/sheet-tasks.ts`
- `src/application/query/QueryDag.ts`
- `src/http/routers/stages.ts`
- `tests/contract-types.test.ts`

### 下一步

t2（头部稳定化）与 t4（记账批量）依赖已满足，可开工；t3/t4/t5/t7 验收标准已携带复核结论。

---
