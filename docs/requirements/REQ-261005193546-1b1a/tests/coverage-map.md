# 测试覆盖清单（REQ-261005193546-1b1a）

> 本文件是覆盖度门的机器可读来源：每个任务一段，`covers: <task-id>` 声明它由哪些判据覆盖。
> 子卡（研发/复核/测试）继承其父卡的判据——父卡的用例文件覆盖该卡全部阶段的产出。

## 定义活卡判据与依赖判定单点（9 个纯函数落既有 Predicates.ts）（t-239433）

covers: t-239433

证据：tests/live-tasks-predicates.test.ts

### 定义活卡判据与依赖判定单点（9 个纯函数落既有 Predicates.ts）·研发（t-6b8271）

covers: t-6b8271

证据（继承父卡）：tests/live-tasks-predicates.test.ts

### 定义活卡判据与依赖判定单点（9 个纯函数落既有 Predicates.ts）·联调（t-0106f8）

covers: t-0106f8

证据（继承父卡）：tests/live-tasks-predicates.test.ts

### 定义活卡判据与依赖判定单点（9 个纯函数落既有 Predicates.ts）·复核（t-833ef1）

covers: t-833ef1

证据（继承父卡）：tests/live-tasks-predicates.test.ts

### 定义活卡判据与依赖判定单点（9 个纯函数落既有 Predicates.ts）·测试（t-ec8dce）

covers: t-ec8dce

证据（继承父卡）：tests/live-tasks-predicates.test.ts

## 依赖判定四处收敛到单点，且 V-5 判据同批同源（防写路径被自己拒掉）（t-f93435）

covers: t-f93435

证据：tests/live-tasks-ready-single-source.test.ts

### 依赖判定四处收敛到单点，且 V-5 判据同批同源（防写路径被自己拒掉）·研发（t-4fcc8b）

covers: t-4fcc8b

证据（继承父卡）：tests/live-tasks-ready-single-source.test.ts

### 依赖判定四处收敛到单点，且 V-5 判据同批同源（防写路径被自己拒掉）·联调（t-b5ec1f）

covers: t-b5ec1f

证据（继承父卡）：tests/live-tasks-ready-single-source.test.ts

### 依赖判定四处收敛到单点，且 V-5 判据同批同源（防写路径被自己拒掉）·复核（t-b8470f）

covers: t-b8470f

证据（继承父卡）：tests/live-tasks-ready-single-source.test.ts

### 依赖判定四处收敛到单点，且 V-5 判据同批同源（防写路径被自己拒掉）·测试（t-1c5309）

covers: t-1c5309

证据（继承父卡）：tests/live-tasks-ready-single-source.test.ts

## 加 TaskRecord 三个加性可选字段与 markCanceled 写入口，并接四个取消写入点（t-c7b3da）

covers: t-c7b3da

证据：tests/canceled-task-trail.test.ts

### 加 TaskRecord 三个加性可选字段与 markCanceled 写入口，并接四个取消写入点·研发（t-4160d7）

covers: t-4160d7

证据（继承父卡）：tests/canceled-task-trail.test.ts

### 加 TaskRecord 三个加性可选字段与 markCanceled 写入口，并接四个取消写入点·联调（t-7af066）

covers: t-7af066

证据（继承父卡）：tests/canceled-task-trail.test.ts

### 加 TaskRecord 三个加性可选字段与 markCanceled 写入口，并接四个取消写入点·复核（t-aa57cd）

covers: t-aa57cd

证据（继承父卡）：tests/canceled-task-trail.test.ts

### 加 TaskRecord 三个加性可选字段与 markCanceled 写入口，并接四个取消写入点·测试（t-eb768b）

covers: t-eb768b

证据（继承父卡）：tests/canceled-task-trail.test.ts

## 两个 RTM 公开入口各自收敛为活卡（覆盖度分母剔卡）（t-847036）

covers: t-847036

证据：tests/rtm-yaml-live-tasks.test.ts

### 两个 RTM 公开入口各自收敛为活卡（覆盖度分母剔卡）·研发（t-5695d9）

covers: t-5695d9

证据（继承父卡）：tests/rtm-yaml-live-tasks.test.ts

### 两个 RTM 公开入口各自收敛为活卡（覆盖度分母剔卡）·联调（t-ed271f）

covers: t-ed271f

证据（继承父卡）：tests/rtm-yaml-live-tasks.test.ts

### 两个 RTM 公开入口各自收敛为活卡（覆盖度分母剔卡）·复核（t-1a6a81）

covers: t-1a6a81

证据（继承父卡）：tests/rtm-yaml-live-tasks.test.ts

### 两个 RTM 公开入口各自收敛为活卡（覆盖度分母剔卡）·测试（t-bbf451）

covers: t-bbf451

证据（继承父卡）：tests/rtm-yaml-live-tasks.test.ts

## API 边界收敛：/state 的 tasks / ready / 计数全部按活卡下发（t-9b6879）

covers: t-9b6879

证据：tests/state-payload-client.test.ts

### API 边界收敛：/state 的 tasks / ready / 计数全部按活卡下发·研发（t-6628a0）

covers: t-6628a0

证据（继承父卡）：tests/state-payload-client.test.ts

### API 边界收敛：/state 的 tasks / ready / 计数全部按活卡下发·联调（t-74f62e）

covers: t-74f62e

证据（继承父卡）：tests/state-payload-client.test.ts

### API 边界收敛：/state 的 tasks / ready / 计数全部按活卡下发·复核（t-318840）

covers: t-318840

证据（继承父卡）：tests/state-payload-client.test.ts

### API 边界收敛：/state 的 tasks / ready / 计数全部按活卡下发·测试（t-8c05b7）

covers: t-8c05b7

证据（继承父卡）：tests/state-payload-client.test.ts

## 服务端投影收敛：阶段详情基类一次收敛 + DAG 层号现算 + 文档/报告/状态面收编（t-051757）

covers: t-051757

证据：tests/canceled-projection-single-source.test.ts · tests/stage-detail.test.ts

### 服务端投影收敛：阶段详情基类一次收敛 + DAG 层号现算 + 文档/报告/状态面收编·研发（t-33894a）

covers: t-33894a

证据（继承父卡）：tests/canceled-projection-single-source.test.ts · tests/stage-detail.test.ts

### 服务端投影收敛：阶段详情基类一次收敛 + DAG 层号现算 + 文档/报告/状态面收编·联调（t-bd8663）

covers: t-bd8663

证据（继承父卡）：tests/canceled-projection-single-source.test.ts · tests/stage-detail.test.ts

### 服务端投影收敛：阶段详情基类一次收敛 + DAG 层号现算 + 文档/报告/状态面收编·复核（t-1e7746）

covers: t-1e7746

证据（继承父卡）：tests/canceled-projection-single-source.test.ts · tests/stage-detail.test.ts

### 服务端投影收敛：阶段详情基类一次收敛 + DAG 层号现算 + 文档/报告/状态面收编·测试（t-5b683c）

covers: t-5b683c

证据（继承父卡）：tests/canceled-projection-single-source.test.ts · tests/stage-detail.test.ts

## 服务端内部与用例面收编手写活卡 filter（只换判据来源，不改行为）（t-879f7e）

covers: t-879f7e

证据：tests/canceled-internal-collect.test.ts

### 服务端内部与用例面收编手写活卡 filter（只换判据来源，不改行为）·研发（t-e74663）

covers: t-e74663

证据（继承父卡）：tests/canceled-internal-collect.test.ts

### 服务端内部与用例面收编手写活卡 filter（只换判据来源，不改行为）·联调（t-ffcc34）

covers: t-ffcc34

证据（继承父卡）：tests/canceled-internal-collect.test.ts

### 服务端内部与用例面收编手写活卡 filter（只换判据来源，不改行为）·复核（t-324827）

covers: t-324827

证据（继承父卡）：tests/canceled-internal-collect.test.ts

### 服务端内部与用例面收编手写活卡 filter（只换判据来源，不改行为）·测试（t-f6b020）

covers: t-f6b020

证据（继承父卡）：tests/canceled-internal-collect.test.ts

## 客户端展示面：卡面计数兜底 + 分层剪边落进 topoLevels + 本地 live 收编（t-dcdb26）

covers: t-dcdb26

证据：tests/canceled-hidden-view.test.ts

### 客户端展示面：卡面计数兜底 + 分层剪边落进 topoLevels + 本地 live 收编·研发（t-ec8b81）

covers: t-ec8b81

证据（继承父卡）：tests/canceled-hidden-view.test.ts

### 客户端展示面：卡面计数兜底 + 分层剪边落进 topoLevels + 本地 live 收编·联调（t-dfa4e0）

covers: t-dfa4e0

证据（继承父卡）：tests/canceled-hidden-view.test.ts

### 客户端展示面：卡面计数兜底 + 分层剪边落进 topoLevels + 本地 live 收编·复核（t-29be55）

covers: t-29be55

证据（继承父卡）：tests/canceled-hidden-view.test.ts

### 客户端展示面：卡面计数兜底 + 分层剪边落进 topoLevels + 本地 live 收编·测试（t-5603c8）

covers: t-5603c8

证据（继承父卡）：tests/canceled-hidden-view.test.ts

## 字面量基线清单与「新增即红」独立用例（不挂进 layer-boundary）（t-e827bd）

covers: t-e827bd

证据：tests/live-tasks-single-source.test.ts

### 字面量基线清单与「新增即红」独立用例（不挂进 layer-boundary）·研发（t-77292d）

covers: t-77292d

证据（继承父卡）：tests/live-tasks-single-source.test.ts

### 字面量基线清单与「新增即红」独立用例（不挂进 layer-boundary）·复核（t-96dc12）

covers: t-96dc12

证据（继承父卡）：tests/live-tasks-single-source.test.ts

### 字面量基线清单与「新增即红」独立用例（不挂进 layer-boundary）·测试（t-05c5b1）

covers: t-05c5b1

证据（继承父卡）：tests/live-tasks-single-source.test.ts

## 迁移与兼容：零迁移核对 + 旧分片读取 + 读侧宽容 + V-5 分档（t-b4081e）

covers: t-b4081e

证据：tests/canceled-legacy-read.test.ts · tests/queue/

### 迁移与兼容：零迁移核对 + 旧分片读取 + 读侧宽容 + V-5 分档·研发（t-316478）

covers: t-316478

证据（继承父卡）：tests/canceled-legacy-read.test.ts · tests/queue/

### 迁移与兼容：零迁移核对 + 旧分片读取 + 读侧宽容 + V-5 分档·联调（t-269865）

covers: t-269865

证据（继承父卡）：tests/canceled-legacy-read.test.ts · tests/queue/

### 迁移与兼容：零迁移核对 + 旧分片读取 + 读侧宽容 + V-5 分档·复核（t-325a6a）

covers: t-325a6a

证据（继承父卡）：tests/canceled-legacy-read.test.ts · tests/queue/

### 迁移与兼容：零迁移核对 + 旧分片读取 + 读侧宽容 + V-5 分档·测试（t-c7c852）

covers: t-c7c852

证据（继承父卡）：tests/canceled-legacy-read.test.ts · tests/queue/

## 用例矩阵（一）：视图与依赖面 TC-2 / TC-3 / TC-4（t-74a5bd）

covers: t-74a5bd

证据：tests/canceled-layer-parity.test.ts · tests/canceled-ready-unlock.test.ts · tests/canceled-four-faces.test.ts

### 用例矩阵（一）：视图与依赖面 TC-2 / TC-3 / TC-4·研发（t-2bc7e2）

covers: t-2bc7e2

证据（继承父卡）：tests/canceled-layer-parity.test.ts · tests/canceled-ready-unlock.test.ts · tests/canceled-four-faces.test.ts

### 用例矩阵（一）：视图与依赖面 TC-2 / TC-3 / TC-4·复核（t-0429f9）

covers: t-0429f9

证据（继承父卡）：tests/canceled-layer-parity.test.ts · tests/canceled-ready-unlock.test.ts · tests/canceled-four-faces.test.ts

### 用例矩阵（一）：视图与依赖面 TC-2 / TC-3 / TC-4·测试（t-505407）

covers: t-505407

证据（继承父卡）：tests/canceled-layer-parity.test.ts · tests/canceled-ready-unlock.test.ts · tests/canceled-four-faces.test.ts

## 用例矩阵（二）：统计与审计面 TC-5 / TC-9 / TC-10（覆盖度两入口、台账不消失、文档面板）（t-3ed451）

covers: t-3ed451

证据：tests/canceled-coverage-gate.test.ts · tests/canceled-audit-holds.test.ts · tests/canceled-docs-panel.test.ts

### 用例矩阵（二）：统计与审计面 TC-5 / TC-9 / TC-10（覆盖度两入口、台账不消失、文档面板）·研发（t-4484ab）

covers: t-4484ab

证据（继承父卡）：tests/canceled-coverage-gate.test.ts · tests/canceled-audit-holds.test.ts · tests/canceled-docs-panel.test.ts

### 用例矩阵（二）：统计与审计面 TC-5 / TC-9 / TC-10（覆盖度两入口、台账不消失、文档面板）·复核（t-e1b238）

covers: t-e1b238

证据（继承父卡）：tests/canceled-coverage-gate.test.ts · tests/canceled-audit-holds.test.ts · tests/canceled-docs-panel.test.ts

### 用例矩阵（二）：统计与审计面 TC-5 / TC-9 / TC-10（覆盖度两入口、台账不消失、文档面板）·测试（t-f1a183）

covers: t-f1a183

证据（继承父卡）：tests/canceled-coverage-gate.test.ts · tests/canceled-audit-holds.test.ts · tests/canceled-docs-panel.test.ts

## 逆验证矩阵（14 条改坏必红）与端到端证据清单（t-848a93）

covers: t-848a93

证据：scripts/reverse-drill-matrix.mts --group canceled · tests/canceled-reverse-drill-coverage.test.ts

### 逆验证矩阵（14 条改坏必红）与端到端证据清单·研发（t-d6a19e）

covers: t-d6a19e

证据（继承父卡）：scripts/reverse-drill-matrix.mts --group canceled · tests/canceled-reverse-drill-coverage.test.ts

### 逆验证矩阵（14 条改坏必红）与端到端证据清单·复核（t-e1a1b4）

covers: t-e1a1b4

证据（继承父卡）：scripts/reverse-drill-matrix.mts --group canceled · tests/canceled-reverse-drill-coverage.test.ts

### 逆验证矩阵（14 条改坏必红）与端到端证据清单·测试（t-01e8c0）

covers: t-01e8c0

证据（继承父卡）：scripts/reverse-drill-matrix.mts --group canceled · tests/canceled-reverse-drill-coverage.test.ts
