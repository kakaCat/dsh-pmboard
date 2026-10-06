# t-dcdb26 客户端展示面：卡面计数兜底 + 分层剪边落进 topoLevels + 本地 live 收编

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
客户端展示面：卡面计数兜底 + 分层剪边落进 topoLevels + 本地 live 收编

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：ui
- 端侧：frontend

## 得到什么结果
`npx vitest run tests/canceled-hidden-view.test.ts tests/card-layer.test.ts tests/dag-panel.test.ts tests/client-subtask-view.test.ts` 全绿；断言：对 132 = 106 + 26 标本渲染后 `canceledRowsShown === 0`（chip / bar / trace / node 四类选择器的 `[data-status="canceled"]` 命中数均为 0）且 `liveCardCount === 106`、`dagRowsShown === 106`（`.dsh-pm-sn-dag-task` 条数 `=== 106`）；把**未过滤**数组直接喂 `toCard` 时 `totalCount === liveCountOf(tasks) === 106`（不靠上游）；`topoLevels` 对「活卡 x 唯一前置 y 已取消」给出 `get(0)` 含 x 且 x 层号 `=== 0`（**不是 1**）——删掉剪边即必红；`data-dag-statuses` 取值里不含 `canceled`；可见文本与 `title` / `aria-label` / `data-*` 里 `已取消` / `canceled` 命中 `=== 0`；源码 `includeCanceled` / `showCanceled` 命中 `=== 0`；**原型对照（可失败）**：权威原型 `prototypes/dag-canceled-hidden.html#FR-1` 声明的观测量 `canceledRowsShown = 0`、`liveCardCount = 106` 与 `#FR-5` 的 `canceledLedgerRows = 26`，必须与本用例从渲染文本数与台账数出的同名观测量逐字相等（界面 0 条 **且** 台账 26 条一起断言）；`#FR-2` 的 `ganttBarsShown = 106`、`traceRowsShown = 106` 与甘特/追溯渲染条数相等。`pnpm verify:client` 与 `pnpm typecheck` 退出码 0。

## 实施方案（implementation）
① `src/client/views/board.ts` 的 `toCard`：`totalCount` / `doneCount` 改走 `liveTasksOf` / `liveCountOf`（**独立漏点**：只要该函数拿到未过滤数组，读数就会退回 132 ⇒ **不假设「上游 /state 好了这里就自动好」**）；同文件「在途」计数里手写的 `t.status !== 'canceled'` 换成 `isLiveTask(t)`（去掉任务级字面量）。② `src/client/stage-panel.ts` 的 `topoLevels`：**剪边必须落进函数内部**——对不在 `byId` 里的前置边**直接丢弃**，不再当 `lv = 0` 计入 `1 + max(...)`（现实现会造幽灵前置、让活卡凭空多一层）；实现走 `layerInputOf` / `splitDependencyEdges`，层号按活卡压实、不留「第 N 层 · 0 张」空层。③ `src/client/node-panel.ts` 同款 `topoLevels` 照同一口径剪边（会话框节点面板与看板阶段详情两块必须一致），但**不加第二份 filter**（上游基类已剔卡）。④ `src/client/render/subtask-view.ts` 的本地 `live` 辅助删掉，改调 `liveTasksOf`。⑤ **不改** `timeline.ts` / `board-mount.ts` / `panels/dag.ts` 的算法（吃已过滤载荷）；`data-dag-statuses` 因此天然不含 `canceled` 档，**不许**在这里补第二份判定。新增 `tests/canceled-hidden-view.test.ts`（TC-1 + TC-11 + 原型对照判据）。验证：`npx vitest run tests/canceled-hidden-view.test.ts` + `pnpm verify:client`。依据 design/frontend.md §四个取数边界 ①/② 与 §严格不可见。

## 上游产出摘要（dependsSummary）
- 加 TaskRecord 三个加性可选字段与 markCanceled 写入口，并接四个取消写入点
- API 边界收敛：/state 的 tasks / ready / 计数全部按活卡下发
- 服务端投影收敛：阶段详情基类一次收敛 + DAG 层号现算 + 文档/报告/状态面收编

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T17:13:21.991Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

t8 收口：看板客户端四个展示面只剩活卡，分层不再被幽灵前置抬高；并按原型九条观测量逐条对照通过。

### 完成项

- 客户端四处展示面统一到活卡；分层剪边落进 topoLevels（消除幽灵前置）
- 原型对照九条观测量逐条实测相等，界面 0 条与台账 26 条一起断言
- client 产物按规矩重建，未踩构建新鲜度门
- 复核抓获并修掉一处文案扫描抓不到的真泄漏（追溯链渲染取消卡产物）
- 四段子卡逐段汇报并收口；尺寸与类型分层两处遗留如实登记

### 改动文件

- `src/client/stage-panel.ts`
- `src/client/node-panel.ts`
- `src/client/views/board.ts`
- `src/client/render/subtask-view.ts`
- `src/application/query/live-artifacts.ts`
- `src/application/query/QueryStageDetail.ts`
- `src/application/query/QueryDocs.ts`
- `tests/canceled-hidden-view.test.ts`
- `tests/stage-panel.test.ts`

### 下一步

t9 防漂移基线与 t11 视图依赖矩阵（等 t8/t10 收口）；追溯链泄漏的回归断言补强中

---
## 汇报 2（2026-10-05T17:16:19.038Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

t8 收口后补强（母卡已 done）：追溯链泄漏从此有锁——22 条用例，且逆验证证明「文案扫描抓不到」这条判断成立。

### 完成项

- 追溯链剔卡回归锁：新增 5 条用例（装配出口 0 条 / 追溯链 26→0 / fail-open 三种认不出形态 / 源码锚点 / 边界声明）
- 用例数 17 → 22，文件 tests/canceled-hidden-view.test.ts
- 逆验证实证：换回不过滤 → 新增 5 条必红，而含文案扫描的既有 17 条全绿（证明文案扫描抓不到该泄漏）
- 锁住单点最脆前提：必须收到全量台账，否则 canceledIdsOf 得空集、fail-open 静默放行（已加源码锚点）
- 两条残余如实登记：withCardDoc 是第二条读径（当前无泄漏）与追溯节点点击行为不在本口径内

### 改动文件

- `tests/canceled-hidden-view.test.ts`

### 下一步

t9 防漂移基线与 t11 视图依赖矩阵收口后进 t12/t13

---
