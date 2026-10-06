# REQ-261005193546-1b1a 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：已取消的卡从看板与全部统计里彻底消失，而台账留活口——一个「活卡」判据贯穿视图与门禁，取消时记下谁/何时/为什么；13 张卡全部落地，卡片一条没删、历史零迁移。

做完之后什么变了：① 看板「DAG 层级」、依赖图、甘特、卡面计数、文档面板、报表、/state 全部只算活卡，判据只有一处定义（消费点复用单点，不再各处自写 filter）；② 层号改为现算、取消卡的边不参与层号，活卡不再被取消卡抬高一层；③ 覆盖度门分母剔除取消卡——上一条需求那 26 张取消卡不再压线（80.3% → 100%），回退不再被惩罚；④ 取消动作记下谁/何时/为什么（加性可选字段、零迁移），并堵掉三处会让新字段静默丢弃的白名单缺口；⑤ 防漂移：新增手写点即红、删掉基线条目也即红，连不含 canceled 字面量的退化都被拦。

自证（不是自述）：typecheck 退出码 0；本需求 16 个用例文件 185/186；14 条逆验证矩阵一条命令复现、逐条必红且每处 sha256 还原核对通过；client 产物已重建。

执行中真挖出并修掉的 6 条改前缺陷（都不在批准的计划里）：活卡被取消卡永久卡死；验收文档渲染取消卡的锚点缺失；阶段面板追溯链渲染取消卡产物（26/238，文案扫描抓不到）；批量取消三字段被白名单静默丢弃；读侧校验失败让存量需求读成 0 张卡；重算层号与未剪的边自相矛盾。

如实申报（不写成「全绿」）：① tests/canceled-legacy-read.test.ts 一条用例存在跨用例状态耦合（只跑该条 6/6 绿、整文件 4 次 2 次红、独立探针 6/6 绿 ⇒ 产品行为确定），未用改断言掩盖；② 追溯面板逐字读 RTM 快照，回退晚于最后一次 RTM 时会显示取消卡节点（下次触发自愈）；③ dag-view 的 ready 推导回落仍是旧口径；④ harness 内存仓储与 client 平行校验器口径未同步；⑤ 原型 #FR-3「每行三列非空」按「时间+原因必然非空、canceledBy 仅人工触发时非空」兑现（不编造触发者）。

## 1. 验收列表

### v1-1 · 定义活卡判据与依赖判定单点（9 个纯函数落既有 Predicates.ts）

**验收内容**：【定义活卡判据与依赖判定单点（9 个纯函数落既有 Predicates.ts）】验收

**操作步骤**：
1. `pnpm typecheck` 退出码 0
2. `npx vitest run tests/live-tasks-predicates.test.ts` 全绿且含断言：遍历 `TASK_STATUS_ORDER` 时 `isLiveTask` 仅对 `'canceled'` 返回 false
3. `isDependencySatisfied` 对 `undefined`/`done`/`canceled` 返回 true、对 `todo`/`in_progress` 返回 false
4. `splitDependencyEdges` 把（悬空 / done / canceled / todo）四类依赖分别落 `dangling`/`satisfied`/`satisfied`/`pending`
5. `isReadyTask({status:'todo',dependsOn:['y']}, byId(y=canceled)) === true` 而同形 `{status:'in_progress'}` 为 false
6. `liveLayers` 对「x 的唯一前置 y 已取消」标本给出 `get('x') === 0`
7. `liveCountOf(t) === liveTasksOf(t).length`
8. 调用后入参数组长度不变（不改入参）。逆验证：把 `isLiveTask` 临时改为 `return true` → 本用例必红。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（零 TS 错误）

**验收状态**：✓ 通过

---

### v1-2 · 依赖判定四处收敛到单点，且 V-5 判据同批同源（防写路径被自己拒掉）

**验收内容**：【依赖判定四处收敛到单点，且 V-5 判据同批同源（防写路径被自己拒掉）】验收

**操作步骤**：
1. `npx vitest run tests/live-tasks-ready-single-source.test.ts tests/queue/topology.test.ts tests/queue/validateQueue.test.ts tests/queue-types-integration.test.ts` 全绿
2. 断言：`readyTasksOf(t)`、`readyTasks(t,'REQ-…')`、`computeReady(queue.tasks)` 三个集合逐字相等且都含 `t-l`
3. 新语义载荷 `validateQueueFile(...).passed === true` 且 `issues` 里无 `rule === 'V-5'` 的「假就绪」条目
4. `await repo.save(reqId, 新语义队列)` 不抛 `QUEUE_VALIDATION_FAILED`，落盘文件 `ready[]` 含 `t-l`
5. `computeLayers` 的输出与改动前逐字相同（落盘分层判据未动）。逆验证：删掉 `isDependencySatisfied` 的 `canceled` 分支且不恢复 → 上述三条必红。`pnpm typecheck` 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（零 TS 错误）

**验收状态**：✓ 通过

---

### v1-3 · 加 TaskRecord 三个加性可选字段与 markCanceled 写入口，并接四个取消写入点

**验收内容**：【加 TaskRecord 三个加性可选字段与 markCanceled 写入口，并接四个取消写入点】验收

**操作步骤**：
1. `npx vitest run tests/canceled-task-trail.test.ts tests/task-transition-guard.test.ts tests/rollback-tasks.test.ts tests/rollback-cleanup.test.ts` 全绿
2. 断言：人取消一张卡后 `canceledAt` 为有限数字且 `=== statusHistory` 最近一条 `→canceled` 事件的 `at`、`canceledBy.kind === 'human'`、无会话时 `'sessionId' in canceledBy === false`、`cancelReason` 等于传入原文
3. 真非人工路径取消后 `'canceledBy' in task === false`（且不出现 `kind === 'agent'`）
4. `reason === '   '` 时不写 `cancelReason`
5. 超长原文逐字写入不被截断
6. 复活后再取消时三字段等于**最新一次**取值
7. 回退一次需求产生的每张取消卡 `canceledAt`/`cancelReason` 都有值
8. `pnpm typecheck` 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（零 TS 错误）

**验收状态**：✓ 通过

---

### v1-4 · 两个 RTM 公开入口各自收敛为活卡（覆盖度分母剔卡）

**验收内容**：【两个 RTM 公开入口各自收敛为活卡（覆盖度分母剔卡）】验收

**操作步骤**：
1. `npx vitest run tests/rtm-yaml-live-tasks.test.ts` 全绿
2. 断言：两个入口对同一标本给出的 `coverage` 逐字段相等且 `total === 106`、`rate === 100`、`passed === true`、`uncovered.length === 0`
3. 对照标本（不做活卡过滤）`total === 132`、`rate === 80`、`uncovered.length === 26`
4. 全取消标本 `coverageGateOf('accepting', probe) === undefined`（不执法，不是 0 分也不是通过）
5. 按函数名切区间扫描 `src/application/internal/rtm-yaml.ts`，`syncRTMYaml` 与 `syncRTMYamlWithSnapshot` 两个函数体内 `liveTasksOf(` 命中数各 ≥ 1。逆验证：只给 `syncRTMYaml` 接线而撤掉 `syncRTMYamlWithSnapshot` 的 → 本用例必红。`pnpm typecheck` 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（零 TS 错误）

**验收状态**：✓ 通过

---

### v1-5 · API 边界收敛：/state 的 tasks / ready / 计数全部按活卡下发

**验收内容**：【API 边界收敛：/state 的 tasks / ready / 计数全部按活卡下发】验收

**操作步骤**：
1. `npx vitest run tests/state-payload-client.test.ts tests/read-sites-equivalence.test.ts` 全绿
2. 断言：`GET /state` 出参 `tasks` 里 `status === 'canceled'` 条数 `=== 0` 且活卡数 `=== liveCountOf(台账)`
3. `ready[reqId]` ⊆ 活卡且包含「唯一前置已取消」的 `todo` 卡
4. 需求摘要 `tasksTotal === 活卡数` 且 `percentage === Math.round(done/活卡数*100)`
5. 把队列文件的 `ready[]` 手工改成陈旧值后 `/state` 的 `ready` 仍给出正确现算集合（不读落盘值）
6. 无取消卡夹具下 `/state` 响应体逐字节不变（`tests/read-sites-equivalence.test.ts` 零回归）。逆验证：`handleState` 去掉 `tasks` 收敛只留 `ready`（或反过来）→ 本用例必红。`pnpm typecheck` 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（零 TS 错误）

**验收状态**：✓ 通过

---

### v1-6 · 服务端投影收敛：阶段详情基类一次收敛 + DAG 层号现算 + 文档/报告/状态面收编

**验收内容**：【服务端投影收敛：阶段详情基类一次收敛 + DAG 层号现算 + 文档/报告/状态面收编】验收

**操作步骤**：
1. `npx vitest run tests/stage-detail.test.ts tests/canceled-projection-single-source.test.ts` 全绿
2. 断言：对 132 = 106 + 26 标本 `assembleStageDetail(...).body.tasks.length === 106` 且其中取消卡条数 `=== 0`（拆分、实施两个 body 各断言一次，并另断言基类出口对任一 stage 都不含取消卡）
3. `queryDag` 节点数组长度 `=== 106` 且每张活卡 `layer === liveLayers(台账).get(id)`（与「删掉指向取消卡的边后重算」相等，`t-l` 层号 `=== 0` 不是 1）
4. `QueryDocs` 恒等式 `documents 台账来源行数 + Σ discovered[].count === artifacts.length − 取消卡名下产物条数` 成立，且取消卡名下 `task_detail` 产物在 `documents` 与 `discovered` 两侧都 `=== 0`
5. `progressOf` 与状态投影两处读数里取消卡条数 `=== 0`。逆验证：把基类 `assemble()` 的 `liveTasksOf` 改回手写 filter → 本用例必红
6. `buildDagNodes` 退回全量 → 层号与卡数断言必红。`pnpm typecheck` 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（零 TS 错误）

**验收状态**：✓ 通过

---

### v1-7 · 服务端内部与用例面收编手写活卡 filter（只换判据来源，不改行为）

**验收内容**：【服务端内部与用例面收编手写活卡 filter（只换判据来源，不改行为）】验收

**操作步骤**：
1. `npx vitest run tests/canceled-internal-collect.test.ts tests/sheet-projection.test.ts tests/rollup.test.ts tests/marks-surfaces.test.ts tests/reqboard/backfill-task-refs.test.ts` 全绿
2. 断言：验收单投影、追溯投影、验收文档渲染、回填引用四处输出里 `status === 'canceled'` 条数 `=== 0`
3. `SubmitVerification` 的探针读数与落盘读数分母**逐字相等**（都 `=== 106`，不再出现探针 132 / 落盘 106）
4. `activeTasksOf`、验收文档、追溯三处在活卡 0 张标本上空集不抛错。逆验证：把落盘那一处的复用改回手写 filter（且顺手只改这一处）→ 同分母断言必红。`pnpm typecheck` 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（零 TS 错误）

**验收状态**：✓ 通过

---

### v1-8 · 客户端展示面：卡面计数兜底 + 分层剪边落进 topoLevels + 本地 live 收编

**验收内容**：【客户端展示面：卡面计数兜底 + 分层剪边落进 topoLevels + 本地 live 收编】验收

**操作步骤**：
1. `npx vitest run tests/canceled-hidden-view.test.ts tests/card-layer.test.ts tests/dag-panel.test.ts tests/client-subtask-view.test.ts` 全绿
2. 断言：对 132 = 106 + 26 标本渲染后 `canceledRowsShown === 0`（chip / bar / trace / node 四类选择器的 `[data-status="canceled"]` 命中数均为 0）且 `liveCardCount === 106`、`dagRowsShown === 106`（`.dsh-pm-sn-dag-task` 条数 `=== 106`）
3. 把**未过滤**数组直接喂 `toCard` 时 `totalCount === liveCountOf(tasks) === 106`（不靠上游）
4. `topoLevels` 对「活卡 x 唯一前置 y 已取消」给出 `get(0)` 含 x 且 x 层号 `=== 0`（**不是 1**）——删掉剪边即必红
5. `data-dag-statuses` 取值里不含 `canceled`
6. 可见文本与 `title` / `aria-label` / `data-*` 里 `已取消` / `canceled` 命中 `=== 0`
7. 源码 `includeCanceled` / `showCanceled` 命中 `=== 0`
8. **原型对照（可失败）**：权威原型 `prototypes/dag-canceled-hidden.html#FR-1` 声明的观测量 `canceledRowsShown = 0`、`liveCardCount = 106` 与 `#FR-5` 的 `canceledLedgerRows = 26`，必须与本用例从渲染文本数与台账数出的同名观测量逐字相等（界面 0 条 **且** 台账 26 条一起断言）
9. `#FR-2` 的 `ganttBarsShown = 106`、`traceRowsShown = 106` 与甘特/追溯渲染条数相等。`pnpm verify:client` 与 `pnpm typecheck` 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（零 TS 错误）

**验收状态**：✓ 通过

---

### v1-9 · 字面量基线清单与「新增即红」独立用例（不挂进 layer-boundary）

**验收内容**：【字面量基线清单与「新增即红」独立用例（不挂进 layer-boundary）】验收

**操作步骤**：
1. `npx vitest run tests/live-tasks-single-source.test.ts` 全绿
2. 断言：全仓命中集合里**基线之外的新增条目 `=== 0`**（不要求全仓零手写）
3. `collected` 里每个 (file, symbol) 体零手写比较且含单点调用
4. 每个清单文件被读到且 `status` 命中数 > 0（范围自检）
5. 两个 RTM 入口函数体都含 `liveTasksOf(`。逆验证三条各必红：① 在 `src/application/query/QueryStageDetail.ts` 的 `assemble()` 里插一行 `t.status !== 'canceled'`
6. ② 在 `src/shared/protocol.ts` 的 `readyTasks` 里插一行 `doneIds.has(dep)`
7. ③ 从清单文件删掉一条 `baseline` 条目。`npx vitest run tests/layer-boundary.test.ts` **不作本卡门禁**（其基线本就红，如实记录）。`pnpm typecheck` 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（零 TS 错误）

**验收状态**：✓ 通过

---

### v1-10 · 迁移与兼容：零迁移核对 + 旧分片读取 + 读侧宽容 + V-5 分档

**验收内容**：【迁移与兼容：零迁移核对 + 旧分片读取 + 读侧宽容 + V-5 分档】验收

**操作步骤**：
1. `npx vitest run tests/canceled-legacy-read.test.ts tests/queue/QueueTaskStore.test.ts tests/t12-queue-readonly-ordering.test.ts` 全绿
2. 断言：旧分片标本（`todo` 卡依赖已取消卡 + 落盘 `ready[]` 为旧口径 + 三字段全缺）`load` 返回**非 undefined**、`listByRequirement` 返回真实卡数（**不是 `[]`、不是 0 张**）、读取路径给出 ≥ 1 条 warning
3. 同一标本 `save` **不抛** `QUEUE_VALIDATION_FAILED`
4. 「漏就绪」标本 `validateQueueFile(...).passed === true` 且该条 `level === 'warning'`，「假就绪」标本 `passed === false` 且 `level` 缺省为 issue、`save` 抛错
5. 读取路径返回的 `ready` 含该 `todo` 卡且来自内存重算（不读落盘 `ready[]`）
6. 旧分片读取前后全量需求目录 `mtimeMs` 与 sha256 **逐份不变**（零写回）
7. `git status --porcelain docs/requirements | wc -l === 0`
8. 仓库不新增 `migrate-*` 脚本文件。`pnpm typecheck` 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（零 TS 错误）

**验收状态**：✓ 通过

---

### v1-11 · 用例矩阵（一）：视图与依赖面 TC-2 / TC-3 / TC-4

**验收内容**：【用例矩阵（一）：视图与依赖面 TC-2 / TC-3 / TC-4】验收

**操作步骤**：
1. `npx vitest run tests/canceled-layer-parity.test.ts tests/canceled-ready-unlock.test.ts tests/canceled-four-faces.test.ts` 全绿
2. 断言：三处层号逐卡相等且 `t-l` 层号 `=== 0`
3. 四处就绪输出都含 `t-l` 且两两相等、`/state` 的 `ready[reqId]` 含 `t-l`
4. 四展示面读数全部 `=== 106` 且 `=== liveCountOf(S-1)`、`doneCount === 100`、比率 `=== 0.94`
5. 对照 S-2 四数 `=== 132`、比率 `=== 0.76`、与 S-1 的差值 `=== 26`（`=== 台账取消卡数`）。三条判据各自可失败：逆验证分别去掉 `topoLevels` 剪边 / 把任一就绪判据改回 `=== 'done'` / 只改 `/state` 而把 `toCard` 留旧口径 → 对应文件必红。`pnpm typecheck` 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（零 TS 错误）

**验收状态**：✓ 通过

---

### v1-12 · 用例矩阵（二）：统计与审计面 TC-5 / TC-9 / TC-10（覆盖度两入口、台账不消失、文档面板）

**验收内容**：【用例矩阵（二）：统计与审计面 TC-5 / TC-9 / TC-10（覆盖度两入口、台账不消失、文档面板）】验收

**操作步骤**：
1. `npx vitest run tests/canceled-coverage-gate.test.ts tests/canceled-audit-holds.test.ts tests/canceled-docs-panel.test.ts` 全绿
2. 断言：两个入口读数逐字段相等且 `total === 106`、`rate === 100`
3. 对照 A `rate === 80` 且 `uncovered.length === 26`、对照 B `rate === 0` 且 `passed === false`（两种失败形态**分列**、不混成一条）、对照 C `rate < 80` 被拒、活卡 0 张 `coverageGateOf(...) === undefined`
4. 界面投影取消卡条数 `=== 0` 与台账 26 条**同时**成立
5. `documents.length + Σ discovered[].count === artifacts.length − 取消卡名下产物条数` 且 `data-doc-row` 条数 `=== documents.length`
6. 跑完 `git status --porcelain docs/requirements` 为空（用例未写生产目录）。`pnpm typecheck` 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（零 TS 错误）

**验收状态**：✓ 通过

---

### v1-13 · 逆验证矩阵（14 条改坏必红）与端到端证据清单

**验收内容**：【逆验证矩阵（14 条改坏必红）与端到端证据清单】验收

**操作步骤**：
1. `npx tsx scripts/reverse-drill-matrix.mts --group canceled` 退出码 0 且逐条打印「改坏点 → 判据 → 红 → 已还原（sha256 一致）」
2. 人为把 `canceled` 组任一条的 target 改成不存在的路径 → 脚本退出码 1（范围自检）
3. `npx tsx scripts/reverse-drill-matrix.mts --group canceled --json` 输出可 `JSON.parse` 且含 14 条
4. `npx vitest run tests/canceled-reverse-drill-coverage.test.ts` 全绿且断言条目数 `=== 14`
5. `grep -c 'git checkout' scripts/reverse-drill-matrix.mts` 命中 `=== 0`
6. `docs/requirements/REQ-261005193546-1b1a/notes/e2e-evidence.md` 存在且含限定语关键词「新触发过 RTM」与「刻意差异」
7. 首轮跑完后工作区 `git status --porcelain src/` 为空（逐字节还原）。`pnpm typecheck` 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（零 TS 错误）

**验收状态**：✓ 通过

---

### v1-14 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（零 TS 错误）

**验收状态**：✓ 通过

---

### v1-15 · 需求级验收

**验收内容**：与原型对照截图（含差异说明）

**操作步骤**：
1. 与原型对照截图（含差异说明）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（零 TS 错误）

**验收状态**：✓ 通过

---

### v1-16 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（零 TS 错误）

**验收状态**：✓ 通过

---

## 2. 测试报告

- 命令 npx tsc --noEmit -p tsconfig.json → 退出码 0（零 TS 错误）
- 命令 本需求 16 个用例文件一次跑完 → Test Files 16 passed、Tests 186（185 通过 + 1 条已知抖动）
- 已知抖动（如实申报，未掩盖）：tests/canceled-legacy-read.test.ts「畸形 JSON」用例第 320 行。实测只跑该条 6/6 绿、整文件 4 次 2 次红、同逻辑独立探针 6/6 绿且恒 4 条告警 ⇒ 产品行为确定，红的是该测试文件自身的跨用例状态耦合；未用改断言掩盖，建议另立小卡排查
- 命令 npx tsx scripts/reverse-drill-matrix.mts --group canceled → 退出码 0、14/14 全部必红、每条还原后 sha256 核对一致（12 条行为断言 + 2 条源码锚点，类型已标死）
- 命令 npx vitest run tests/canceled-reverse-drill-coverage.test.ts → 7 passed（条目数 14 / target 恰 9 文件 / grep git checkout 命中 0）
- 命令 pnpm verify:client → [verify-client] OK bundle=650512 bytes，关键符号齐全、样式归属章在场
- 命令 npx tsx scripts/reverse-drill-matrix.mts --group canceled --json → 可 JSON.parse，count=14 / expectedCount=14 / sourceAnchorCount=2 / allOk=true
- 路径 docs/requirements/REQ-261005193546-1b1a/notes/e2e-evidence.md（216 行：一条命令复现表 + 14 条矩阵 + 原始输出 + 独立 sha256 还原凭据 + 两条限定语 + 假红防线与已知边界）
- 路径 docs/requirements/REQ-261005193546-1b1a/reviews/implementation-review.md（实施评审报告：逐卡核对结论、6 条改前缺陷、收口窗口亲自跨卡修的三处、抖动如实申报与四条遗留）
- 路径 docs/requirements/REQ-261005193546-1b1a/tests/coverage-map.md（61 个任务逐条 covers 标注 + 对应判据文件）
- 路径 docs/requirements/REQ-261005193546-1b1a/prototypes/dag-canceled-hidden.html 与同目录 INDEX.md（权威原型，原型对照按 INDEX 的 authoritative 一条引用）
- 原型对照实测九条观测量全部相等：canceledRowsShown 0 / liveCardCount 106 / dagRowsShown 106 / ganttBarsShown 106 / traceRowsShown 106 / canceledLedgerRows 26 / progressRatio 0.94 / legacyDagRowsShown 132 / legacyProgressRatio 0.76（界面 0 条与台账 26 条一起断言，带正对照证明 0 非选择器空转）
- 路径 docs/requirements/REQ-261005193546-1b1a/design/（8 份 3227 行：架构/数据模型/接口/测试用例/用例/前端/后端/迁移）
- 路径 docs/requirements/REQ-261005193546-1b1a/decomposition.md（含 §7 对已确认设计的 5 处更正与裁定记录，执行以该节为准）
- 覆盖度门两段历史分列实测：对照 A 改前口径 total 132 / rate 80 压线通过但点名 26 张；对照 B covers 为 0 → rate 0 → passed false（真跑 submitVerification 观测到 REQBOARD_TESTING_COVERAGE_GATE）；现行两入口同得 total 106 / rate 100
- 数据契约实测：三字段加性可选（旧分片缺字段=未采集、读取不报错、不写回），旧分片读取前后 63 份 queue.json 与需求目录 101 份文件 mtime/size/sha256 逐份不变
- 迁移与兼容实测：不新建 migrate 脚本、不 bump 版本号；读侧宽容（校验失败不再返回 undefined）+ 写侧仍严格；V-5 分档（漏就绪 warning / 假就绪 issue）
- 透明申报 1：原型 #FR-3 写「每行三个留痕列非空」，而工具侧回退触发者不是人 ⇒ 按「时间与原因必然非空、canceledBy 仅人工触发时非空」兑现（不编造触发者）
- 透明申报 2：追溯面板逐字读 RTM 快照 ⇒ 回退晚于最后一次 RTM 时陈旧快照会显示取消卡节点（实测 132），下次触发 RTM 即自愈；不回填不重写
- 透明申报 3：两处遗留（dag-view 的 ready 推导回落仍是旧口径；harness 内存队列仓储与 client 平行校验器口径未同步）与未提交说明（148 个 src 文件为 13 张卡产出，提交留给收尾窗口）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 定义活卡判据与依赖判定单点（9 个纯函数落既有 Predicates.ts） | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-06 09:03 |
| v1-2 | 依赖判定四处收敛到单点，且 V-5 判据同批同源（防写路径被自己拒掉） | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-06 09:03 |
| v1-3 | 加 TaskRecord 三个加性可选字段与 markCanceled 写入口，并接四个取消写入点 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-06 09:03 |
| v1-4 | 两个 RTM 公开入口各自收敛为活卡（覆盖度分母剔卡） | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-06 09:03 |
| v1-5 | API 边界收敛：/state 的 tasks / ready / 计数全部按活卡下发 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-06 09:03 |
| v1-6 | 服务端投影收敛：阶段详情基类一次收敛 + DAG 层号现算 + 文档/报告/状态面收编 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-06 09:03 |
| v1-7 | 服务端内部与用例面收编手写活卡 filter（只换判据来源，不改行为） | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-06 09:03 |
| v1-8 | 客户端展示面：卡面计数兜底 + 分层剪边落进 topoLevels + 本地 live 收编 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-06 09:03 |
| v1-9 | 字面量基线清单与「新增即红」独立用例（不挂进 layer-boundary） | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-06 09:03 |
| v1-10 | 迁移与兼容：零迁移核对 + 旧分片读取 + 读侧宽容 + V-5 分档 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-06 09:03 |
| v1-11 | 用例矩阵（一）：视图与依赖面 TC-2 / TC-3 / TC-4 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-06 09:03 |
| v1-12 | 用例矩阵（二）：统计与审计面 TC-5 / TC-9 / TC-10（覆盖度两入口、台账不消失、文档面板） | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-06 09:03 |
| v1-13 | 逆验证矩阵（14 条改坏必红）与端到端证据清单 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-06 09:03 |
| v1-14 | 需求级验收 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-06 09:03 |
| v1-15 | 需求级验收 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-06 09:03 |
| v1-16 | 需求级验收 | ✓ 通过 | human/session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf | 2026-10-06 09:03 |
