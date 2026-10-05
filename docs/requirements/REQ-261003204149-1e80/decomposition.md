---
req: REQ-261003204149-1e80
doc: decomposition
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
---

# 拆分计划 · 需求级回退通道（REQ-261003204149-1e80）

> **TL;DR**：13 张卡，按"契约先行、实现随后、验证收口"三段：
> ① 判定与契约（t1 回退判定/状态机、t2 数据字段、t8 接口与 schema 声明）
> → ② 实现（t3 撤销、t4 卡处置、t5 闸门豁免、t6 拆分守卫、t7 编排、t9 两侧接入、t10 注入重算）
> → ③ 验证（t11 用例集、t12 回执防线、t13 兼容与回归收口）。
> **不换存储、无迁移脚本**；新增字段全可选，代码回滚即可逆。

```
t1 回退判定/状态机 ──────▶ t5 闸门豁免 ──┐
                                        │
t2 数据契约 ──┬─▶ t3 撤销语义 ──────────┼─▶ t7 编排 ──▶ t9 两侧接入 ──▶ t10 注入重算
              ├─▶ t4 卡处置 ──▶ t6 拆分守卫 ┘                    │
              └─▶ t8 接口契约 ─────────────────────────────────┘
                                                                  ▼
                              t11 用例集 ──▶ t12 回执防线 ──▶ t13 兼容与回归收口
```

## 改动盘点（`serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`）

| 文件 | 动作 | 说明 | 卡 |
|---|---|---|---|
| `src/domain/requirement/RollbackSpec.ts` | 新增 | `PIPELINE_ORDER` / `isRollback` / `stagesAfter`（纯函数，零 IO） | t1 |
| `src/domain/requirement/RequirementStatus.ts` | 修改 | 转移表改生成式合成；移除 `implementing>design` 人工门；终点与 `*>canceled` 原样 | t1 |
| `src/shared/protocol.ts` | 修改 | 新增可选字段 `RequirementRecord.rollback`、`TaskRecord.reworkOf` | t2 |
| `src/application/internal/rollback-revocation.ts` | 新增 | `applyRollbackRevocation`：撤章 / 撤批准 / `applyDocSync` / 留痕 / 评论 | t3 |
| `src/application/internal/rollback-tasks.ts` | 新增 | `planRollbackTasks`：旧卡 canceled + 物化重做卡 | t4 |
| `src/application/internal/artifact-gates.ts` | 修改 | `assertArtifactGates` 首部加 `isRollback` 方向性豁免 | t5 |
| `src/domain/workflow/DecomposeSpec.ts` | 修改 | `checkDecomposeIdempotency` 增 `ctx.rollbackTo` | t6 |
| `src/application/use-cases/Decompose.ts` | 修改 | 传 `ctx.rollbackTo`；落新卡前取消未取消的重做卡 | t6 |
| `src/application/internal/rollback.ts` | 新增 | `applyRequirementRollback`：编排撤销 + 卡处置（单点） | t7 |
| `src/application/use-cases/MoveRequirement.ts` | 修改 | 判定回退 → 调编排 → 回执带 `rollback` | t9 |
| `src/http/routers/requirements.ts` | 修改 | `handleReqMove` 回退分支改调同一编排（删自有那段） | t9 |
| `src/tools/MoveTool/MoveTool.ts` | 修改 | `output.schema` 声明 `rollback` 对象及四个子键 | t8 |
| `src/application/internal/interruption.ts` | 修改 | 回退后断点 `pendingAction` 按新状态重算（必要时补分支） | t10 |
| `src/application/dive/boundary-guard.ts` | 修改 | 回退时 `dive.activation='disarmed'` 并清 `pausedReason` | t10 |
| `tests/rollback-domain.test.ts` | 新增 | `isRollback` / `stagesAfter` / 转移表真值表 | t1 |
| `tests/rollback-revocation.test.ts` | 新增 | 撤章判据、撤批准、待同步幂等 | t3 |
| `tests/rollback-tasks.test.ts` | 新增 | 旧卡取消与重做卡一一对应 | t4 |
| `tests/move-rollback.test.ts` | 新增 | TC-1…TC-16（含双通道对拍） | t11 |
| `tests/output-contract.test.ts` | 修改 | 回退回执加入动态防线（嵌套键受递归校验） | t12 |
| 删除 | — | 无（`handleReqMove` 的旧回退分支改为委托，不是删文件） | — |

## 任务总览（`serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`）

| key | 标题 | phase | side | 依赖 | 一句话 |
|---|---|---|---|---|---|
| t1 | 回退判定与状态机：RollbackSpec + 生成式转移表 | implement | backend | — | 任意更早节点皆为合法回退边，判定只有一处 |
| t2 | 数据契约：`rollback` / `reworkOf` 可选字段 | implement | backend | — | 只加两个可选字段，其余复用既有结构 |
| t3 | 回退撤销语义：撤章 + 撤批准 + 标待同步 | implement | backend | t2 | 退回去再上来必须重新过门 |
| t4 | 旧任务卡处置：canceled + 物化重做卡 | implement | backend | t2 | 旧卡有归宿，重做可见，不谎报在制 |
| t5 | 产物闸门方向性豁免（与撤销同批） | implement | backend | t1, t3 | from 没做完也能退；前进门一字不松 |
| t6 | 拆分守卫：回退态可重建且不产双份卡 | implement | backend | t2, t4 | 解开"回得去、拆不了"的死结 |
| t7 | 回退编排单点：`applyRequirementRollback` | implement | backend | t3, t4, t5, t6 | 一笔原子事务，四类后果一次交代 |
| t8 | 接口契约：`reqboard_move` 回执与 schema 声明 | implement | backend | t2 | `rollback` 块逐键声明（当天两次事故的教训） |
| t9 | 用例接入：工具侧与看板侧共用编排 | implement | backend | t7, t8 | 删掉第二处实现，两侧同源 |
| t10 | 注入与断点重算：`pendingAction` + dive armed | implement | backend | t9 | 回退后不残留旧阶段的"下一步" |
| t11 | 回退用例集：TC-1…TC-16 + 双通道对拍 | test | backend | t9, t10 | 六条 FR 全部有用例，含判别力 A/B |
| t12 | 输出契约防线：回退回执加入动态校验 | test | backend | t8, t11 | 撤掉 schema 声明必红 |
| t13 | 兼容与回归收口：旧数据 + 基线 + 构建 | test | backend | t11, t12 | 无迁移、可代码回滚；失败数不高于基线 |

## 任务明细（`serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`）

**t1 回退判定与状态机：RollbackSpec + 生成式转移表**（`serves: FR-1`）

- implementation：新建 `src/domain/requirement/RollbackSpec.ts`（纯函数、零 IO，供 layer-boundary 检查）；
  改 `RequirementStatus.ts` 为 `FORWARD_EDGES`（显式）+ `BACKWARD_EDGES`（由 `PIPELINE_ORDER` 生成，
  仅对 draft..accepting 生成）+ 终点原样（`archived: []`/`done: []`/`canceled` 既有边），
  合成后导出同名 `REQ_TRANSITIONS`（形状与消费点零改动）；从 `HUMAN_ONLY_REQ_TRANSITIONS` 移除 `implementing>design`。
- acceptance：`npx vitest run tests/rollback-domain.test.ts` 全绿——① `isRollback` 真值表（含同阶段=false、
  前进=false、`archived→design`=false）；② `implementing` 的出边含 `design`/`brainstorming`/`draft`；
  ③ `archived`/`done` 仍无出边；④ `brainstorming>design`、`decomposing>implementing`、`accepting>archived`、`*>canceled`
  仍在人工门集合内。另跑 `npx vitest run tests/stage-boundary.test.ts tests/layer-boundary.test.ts` 不回归。

**t2 数据契约：`rollback` / `reworkOf` 可选字段**（`serves: FR-1, FR-4`）

- implementation：`src/shared/protocol.ts` 给 `RequirementRecord` 加
  `rollback?: { from; to; at; by; reason? }`、给 `TaskRecord` 加 `reworkOf?: string`；带注释说明"只存最近一次"。
- acceptance：`npx tsc --noEmit` 错误数 ≤ 开工前基线（当前 150）；`npx vitest run tests/queue tests/reqboard`
  不回归（旧台账/旧队列卡无这两个字段时读取行为与现状一致）。

**t3 回退撤销语义：撤章 + 撤批准 + 标待同步**（`serves: FR-3`）

- implementation：新建 `src/application/internal/rollback-revocation.ts`，按 `stagesAfter(to)` 撤章
  （`delete confirmedAt/confirmedBy/confirmedVia`，**保留登记**）；`to` 早于 `decomposing` 时清
  `plan.approvedAt/approvedBy`；调 `applyDocSync(req, source, …)` 标下游待同步；写 `req.rollback` 与 `[回退]` 评论。
- acceptance：`npx vitest run tests/rollback-revocation.test.ts` 全绿——① 目标 `design` 时 `design` 之后全部产物无章、
  `design` 本身若有章也被撤（`design` 晚于 `design` 为假 → 设计自身不撤，需断言边界）；
  ② `plan.approvedAt===undefined`；③ 连续两次回退到同一目标 → `docSyncPending` 无重复 source 条目。

**t4 旧任务卡处置：canceled + 物化重做卡**（`serves: FR-4`）

- implementation：新建 `src/application/internal/rollback-tasks.ts`，旧卡全 `canceled` 并 push
  `revisions[{kind:'rollback', reason, changes}]`；为每张旧卡物化 `{ id: 新t-id, title:'[重做] '+旧.title,
  reworkOf: 旧.id, status:'todo', dependsOn: [], phase/side/acceptance/implementation 继承旧卡 }`；
  保持"任务先写、需求后写"的落库顺序。
- acceptance：`npx vitest run tests/rollback-tasks.test.ts` 全绿——① 2 张旧卡（done + in_progress）→ 全 canceled；
  ② 重做卡数 = 2 且 `reworkOf` 一一指向旧卡、`dependsOn` 为空、`status==='todo'`；③ 旧卡 `revisions` 各含 1 条 rollback。

**t5 产物闸门方向性豁免（与撤销同批）**（`serves: FR-2, FR-3`）

- implementation：`assertArtifactGates` 首部加 `if (isRollback(from, to)) return undefined`（紧跟既有
  `to === 'canceled'` 豁免），并在注释里写清"安全责任转移到同一笔 mutate 内的撤销"。
- acceptance：`npx vitest run tests/artifact-gates.test.ts` 全绿——① `decomposing→design` 且无 `decomposition` 产物 → 返回 `undefined`；
  ② 前进方向 `decomposing→implementing` 未确认计划 → 仍返回 `artifact_not_confirmed`；
  ③ `→canceled` 豁免不变。**判别力**：临时删掉该豁免 → ① 必红。

**t6 拆分守卫：回退态可重建且不产双份卡**（`serves: FR-4`）

- implementation：`checkDecomposeIdempotency(status, tasks, ctx?)` 增 `ctx.rollbackTo`；`ctx.rollbackTo === status`
  时放行；`Decompose.ts` 在落库前把该需求下**未取消的重做卡**标 canceled，再落新卡。
- acceptance：`npx vitest run tests/decompose-tools.test.ts tests/move-rollback.test.ts` 全绿——① 回退态重拆成功，
  未取消卡数 = 新计划卡数（无重复）；② 非回退态重复拆分 → 仍 `REQBOARD_ALREADY_DECOMPOSED`（事故 B 防线未削弱）。

**t7 回退编排单点：`applyRequirementRollback`**（`serves: FR-3, FR-4, FR-5`）

- implementation：新建 `src/application/internal/rollback.ts`，把 t3 的撤销与 t4 的卡处置串成一笔编排，
  返回 `{ revocation, taskPlan }`；调用方负责在**同一笔 mutate** 内落库；任一步抛错整体回滚。
- acceptance：`npx vitest run tests/move-rollback.test.ts -t "原子性"` 全绿——注入"卡处置抛错"后，
  台账里状态、章、批准、卡五项**全部保持回退前原样**（无中间态）。

**t8 接口契约：`reqboard_move` 回执与 schema 声明**（`serves: FR-1`）

- implementation：`MoveTool` 的 `output.schema` 增加 `rollback` 对象（`additionalProperties: false` +
  `artifacts_revoked` / `plan_approval_revoked` / `tasks_canceled` / `tasks_reworked` 四键）；
  前进方向**整体省略** `rollback`（不发 `null`/`undefined`）。
- acceptance：`npx vitest run tests/tools-schema.test.ts tests/output-contract.test.ts` 不回归；
  `grep -n "rollback" src/tools/MoveTool/MoveTool.ts` 能看到四键声明。

**t9 用例接入：工具侧与看板侧共用编排**（`serves: FR-1, FR-5`）

- implementation：`MoveRequirement.ts` 判定 `isRollback` 后调 `applyRequirementRollback`，回执带 `rollback`；
  `http/routers/requirements.ts` 的 `handleReqMove` 回退分支改调同一编排并**删除自有那段回退逻辑**。
- acceptance：`npx vitest run tests/move-rollback.test.ts -t "双通道"` 全绿——同一 from→to 经工具与经 route
  得到相同 `status`/错误码/回执结构；`grep -c "applyRequirementRollback" src/application/use-cases/MoveRequirement.ts src/http/routers/requirements.ts` 各 ≥ 1。

**t10 注入与断点重算：`pendingAction` + dive armed**（`serves: FR-6`）

- implementation：回退成功后调 `stampCheckpoint(req, now, 'reqboard_move')` 使断点按新状态重算；
  回退时置 `req.dive.activation='disarmed'` 并清 `pausedReason`；核对 `internal/interruption.ts` 的
  `pendingActionFor` 对新状态有分支（缺则补）。
- acceptance：`npx vitest run tests/move-rollback.test.ts -t "注入"` 全绿——① 回退到 `design` 后断点 `pendingAction`
  为设计阶段动作且**不含**验收/实施指引；② 回退后 `dive.activation==='disarmed'`。

**t11 回退用例集：TC-1…TC-16 + 双通道对拍**（`serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`）

- implementation：新建 `tests/move-rollback.test.ts`，装置用 `tests/application/harness.ts` 真 store 真 TaskStore，
  夹具 `seedDeepRollbackFixture`（implementing + design 已确认 + 计划已批准 + 2 张卡）；逐条落
  `design/test-cases.md` 的 TC-1…TC-16。
- acceptance：`npx vitest run tests/move-rollback.test.ts` 全绿且**用例数 ≥ 16**；
  判别力 A/B 三条各做一次（撤豁免 → TC-4 红；撤撤销 → TC-7 红；撤守卫放宽 → TC-11 红），证据落 `notes/`。

**t12 输出契约防线：回退回执加入动态校验**（`serves: FR-1`）

- implementation：在 `tests/output-contract.test.ts` 的动态 describe 里加"回退成功路径"用例
  （断言 `rollback` 四键均被声明），复用既有递归校验 `assertConformsToSchema`。
- acceptance：`npx vitest run tests/output-contract.test.ts -t "回退"` 绿；**判别力**：临时从 schema 删掉
  `tasks_reworked` 声明 → 该用例必红且消息含 `未在 output.schema 声明`。

**t13 兼容与回归收口：旧数据 + 基线 + 构建**（`serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`）

- implementation：无新代码；产出兼容性与回归证据（旧台账无 `rollback`/`reworkOf` 的读取行为、
  回滚路径演练、全量回归与基线比对），落 `notes/`。
- acceptance：① `npx vitest run` 失败数 ≤ 开工前基线（先在 HEAD 取一次数留档）；
  ② `npx tsc --noEmit` 无新增错误；③ `pnpm build` 退出码 0 且输出含 `[verify-client] OK`；
  ④ 代码回滚演练：还原本轮改动后旧台账仍可读（`npx vitest run tests/queue` 不回归）。

## 不在本计划内（`serves: FR-1`）

- **不做 undo / 事件回放**、**不做归档后回退**、**不换存储不重做看板交互**（见需求文档「边界」三条）。
- **不重写验收返工路径**（`verdicts.ts` 已有实现）——本计划只在数据对照表里与其保持口径一致。
- **`reqboard_capture` / `reqboard_submit` 回执漂移修复**已在本窗口作为**范围外 hotfix** 完成
  （见需求文档「依赖与约束」），不占本计划任务。
