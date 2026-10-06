# t-74a5bd 用例矩阵（一）：视图与依赖面 TC-2 / TC-3 / TC-4

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
用例矩阵（一）：视图与依赖面 TC-2 / TC-3 / TC-4

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：fullstack

## 得到什么结果
`npx vitest run tests/canceled-layer-parity.test.ts tests/canceled-ready-unlock.test.ts tests/canceled-four-faces.test.ts` 全绿；断言：三处层号逐卡相等且 `t-l` 层号 `=== 0`；四处就绪输出都含 `t-l` 且两两相等、`/state` 的 `ready[reqId]` 含 `t-l`；四展示面读数全部 `=== 106` 且 `=== liveCountOf(S-1)`、`doneCount === 100`、比率 `=== 0.94`；对照 S-2 四数 `=== 132`、比率 `=== 0.76`、与 S-1 的差值 `=== 26`（`=== 台账取消卡数`）。三条判据各自可失败：逆验证分别去掉 `topoLevels` 剪边 / 把任一就绪判据改回 `=== 'done'` / 只改 `/state` 而把 `toCard` 留旧口径 → 对应文件必红。`pnpm typecheck` 退出码 0。

## 实施方案（implementation）
新增三个用例文件（标本 S-1 = 132 张 = 106 活卡 + 26 已取消，其中活卡 `t-l`（`todo`）的唯一前置 `t-c` 已取消；S-2 = 同标本但不过滤，只用于证明差值）：① `tests/canceled-layer-parity.test.ts`（TC-2）——三处层号同台比对：服务端 `liveLayers`、把指向取消卡的边删掉后**手工重算**、以及客户端真正算层的 `topoLevels`；逐卡相等，`t-l` 层号 `=== 0`（不是 1），层号按活卡压实无「第 N 层 · 0 张」空层，`t-l` 仍在活卡集合里（不成孤岛）。② `tests/canceled-ready-unlock.test.ts`（TC-3）——`readyTasks`（shared）/ `computeReady`（写路径）/ `readyTasksOf`（application）/ `isReadyTask`（单点）/ `/state` 的 `ready[reqId]` 五处都含 `t-l` 且前四个集合两两相等，容器内 `[data-status="canceled"]` 条数 `=== 0`（证明「真的能开工」，不是复述「不掉层」）。③ `tests/canceled-four-faces.test.ts`（TC-4）——四个展示面同数：DAG 层级行数、`toCard` 的 `doneCount`/`totalCount`、`.dsh-pm-gantt-bar` 条数、`.dsh-pm-trace-node[data-type="task"]` 条数，四数全等于 `liveCountOf(S-1)`；对照 S-2 同一组读数差 `=== 26`。追溯那一面**只对「上线后新触发过 RTM」的标本断言数值**，存量标本只断言「不出现取消卡行」。验证：`npx vitest run tests/canceled-layer-parity.test.ts tests/canceled-ready-unlock.test.ts tests/canceled-four-faces.test.ts`。依据 design/test-cases.md TC-2/TC-3/TC-4 与 §边界与假红防线。

## 上游产出摘要（dependsSummary）
- 客户端展示面：卡面计数兜底 + 分层剪边落进 topoLevels + 本地 live 收编

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T17:20:40.567Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

t11 收口：视图与依赖面有了承重矩阵——层号、就绪、四展示面同数三组判据各自可失败，且互不串味。

### 完成项

- 视图与依赖面矩阵：层号三处同台、五处就绪、四展示面同数，共 17 条用例
- 三条逆验证各自必红且互不串味（证明判据承重、不是摆设）
- 追溯面按两形态处置：从没触发过 RTM 断 0 行；陈旧快照如实声明会渲染 26 条
- 两处遗留如实登记：读路径追溯按活卡交集（另立卡）、dag-view 推导回落仍是旧口径
- 三段子卡逐段汇报并收口

### 改动文件

- `tests/canceled-layer-parity.test.ts`
- `tests/canceled-ready-unlock.test.ts`
- `tests/canceled-four-faces.test.ts`

### 下一步

t13 逆验证矩阵（等 t12 收口）

---
## 汇报 2（2026-10-05T17:20:58.278Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

t11 收口：视图与依赖面有了承重矩阵——层号、就绪、四展示面三组判据各自可失败且互不串味。

### 完成项

- 视图与依赖面矩阵：层号三处同台、五处就绪、四展示面同数，共 17 条用例
- 三条逆验证各自必红且互不串味（判据承重、不是摆设）
- 追溯面两形态处置：从没触发过 RTM 断 0 行；陈旧快照如实声明会渲染 26 条
- 两处遗留如实登记：读路径按活卡交集追溯、dag-view 推导回落仍是旧口径
- 三段子卡逐段汇报并收口

### 改动文件

- `tests/canceled-layer-parity.test.ts`
- `tests/canceled-ready-unlock.test.ts`
- `tests/canceled-four-faces.test.ts`

### 下一步

t13 逆验证矩阵（等 t12 收口）

---
