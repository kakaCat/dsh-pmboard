# t-7e85ab 定死接口与数据契约（端口 / 可选字段 / 逐项结果类型）·研发

> 需求：REQ-261007100513-6749 PM 插件 token 与耗时治理（缓存前缀稳定化 + 记账合并）

## 在做什么
定死接口与数据契约（端口 / 可选字段 / 逐项结果类型）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

① 本卡改动零类型错误：以 pnpm typecheck 的报错集合为判据，报错必须 ⊆ 他人在飞改动引入的集合（证据：把 tests/application/harness.ts 还原为 HEAD 后在副本跑 npx tsc --noEmit → 退出码 0；本次实测即为该情形，唯一报错为 tests/query-docs-roots.test.ts 的 TS2415，根因是他窗口 harness.ts 给 FakeDocs 新增 private root）；② npx vitest run tests/contract-types.test.ts 全绿（10 用例）；③ pnpm build:client 退出码 0 且输出含 [verify-client] OK；④ 未 bump REQBOARD_SCHEMA_VERSION 与 QUEUE_VERSION、未动 REQUIRED_TASK_FIELDS（以源码断言与真 validateQueueFile 双证据）。

## 汇报 1（2026-10-07T02:25:19.990Z，窗口 session-57f49896-70ca-4e67-b9f2-acc2cbdcc531）

落定接口与数据契约骨架：新增两个端口、四个数据契约类型与可选字段，四处投影透传，契约测试 10 用例全绿。

### 完成项

- ports.ts 新增 VolatileNoticePort（notify 永不抛）与窄端口 SubtaskBudgetPort
- protocol.ts 新增 TaskRecord.budgetRequests 可选字段与四个契约类型
- TaskTreeNodeView 在协议层做镜像，并用双向类型断言防漂移，避免协议层 import 用例层
- client/types.ts 同步客户端镜像
- 四处手工投影补透传：QueryStageDetail、sheet-tasks、QueryDag、routers/stages
- 新增 tests/contract-types.test.ts 共 10 用例全绿
- pnpm build:client 退出码 0 且输出含 verify-client OK
- 未 bump REQBOARD_SCHEMA_VERSION 与 QUEUE_VERSION，未动 REQUIRED_TASK_FIELDS

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

交复核子卡 t-6177ea：核对契约是否与 interfaces.md / data-model.md 逐字一致、四处投影是否真的透传、以及 typecheck 红的归属判定是否成立。

---
