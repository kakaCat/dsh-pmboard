---
req_id: REQ-261003222428-3556
serves: FR-1, FR-2, FR-3, FR-5, FR-6, FR-7
---

# 接口设计（REQ-261003222428-3556）

> 原则：对外工具签名零破坏；新增能力只开必要的口，且每个口都先说清「谁能用」。

## 对外接口变更 `serves: FR-3, FR-6`

| 接口 | 变化 | 谁能用 |
|---|---|---|
| `POST /dashboard/api/reqboard/req/rebind` | **新增**：看板「改绑到本窗口」——body `{id, windowKey, reason?}`；目标窗口必须在线；留痕经 applyRebind | **仅人**（看板通道；agent 面不注册改绑工具 = 代码级拒绝） |
| `reqboard_status` 回执 | 新增 `plugin_build`（可选键） | agent / 看板（只读） |
| `reqboard_submit(kind=plan)` 回执 | 新增 `dependency_warnings`（可选键） | agent |
| `reqboard_ask_confirm` / confirm 回执 | 新增 `stamped`（可选键，落章清单） | agent / 看板 |

## 内部接口（模块边界） `serves: FR-1, FR-2, FR-5, FR-7`

| 模块 | 签名 | 说明 |
|---|---|---|
| `driveChain` | 新增可选第 6 参 `ownRunId` | 向后兼容（同步兼容路径不传，行为同旧） |
| `groupSubtaskEvents(events, tasks)` | 新增（advance-parallel.ts） | 批次事件 → 写集分组（组间串行、组内并行） |
| `wakeAcceptance(deps, requirementId)` | 新增（wake-liveness.ts） | wake 受理判据；deps 只读注入（store/agents） |
| `applyRebind(req, input)` | 新增（binding-write.ts） | store.mutate 草稿上改绑 + 留痕；同窗口幂等 |
| `detectCrossCardOverwrite` | 新增可选第 6 参 `myWindow` | 并行下自己的落盘由自己的窗口解释；不传 = 旧行为 |
| `GROUP_CONFIRM_KINDS` / `aggregateUnconfirmedLabels` | 新增导出（artifact-gates.ts） | 成组确认与催办聚合的单一事实源 |

## 刻意不动的接口 `serves: FR-1, FR-2`

- `selectAdvanceBatch` 选择规则零改动（行为不变式 1）。
- `WakeHeartbeatDeps.wake` 保持 `boolean | Promise<boolean>`（原因走诊断日志，不造签名级联）。
- JobsPort / WorkflowRunner / RequirementStore 端口形状零变更。
