---
serves: [FR-1, FR-2, FR-3, FR-4, FR-5]
---

# 用例设计（REQ-261005123641-3982）

> 场景按「谁触发 → 期望结果」写；引用需求条款，不重复接口细节（见 `interfaces.md`）。

## UC-1 立项写入（窗口 A）`serves: FR-1, FR-2, FR-3`

| 步骤 | 动作 | 期望 |
|---|---|---|
| 1 | A 调 `reqboard_capture` | 入口按 A 的会话根校正共享单例（既有行为） |
| 2 | 弹框作答（期间 B 窗口调 `reqboard_status`，单例根被改成 B 项目） | ——（这正是旧缺陷的触发条件） |
| 3 | A 用**弹框解析出的 `workspaceRoot`** 调守卫（`create` **之前**） | 校正到该根 → 通过；台账零写入前失败则无任何副作用 |
| 4 | `create` + `draft→brainstorming` | 记录落在 A 项目根下；回执 `used_project_root` = A 项目根 |
| 5 | B 的产物 | B 目录零新增 |

**旧行为对照**：旧实现在第 4 步之后才守卫，且拿第 2 步被改掉的单例根比较 → 报错但记录已建。

## UC-2 批准计划 → 自动落库（窗口 C）`serves: FR-1, FR-2`

| 步骤 | 动作 | 期望 |
|---|---|---|
| 1 | 人在弹框/看板批准计划 | `landApprovedPlan` 入口取**该 REQ 记录**的根 |
| 2 | 期间别的窗口改过单例根 | 不构成拒绝理由（守卫先校正再到） |
| 3 | 落库 | 任务卡与 `queue.json` 落在该 REQ 的项目根下；需求推进到 `implementing` |
| 4 | 真失败（如 FR 覆盖门不过） | 不推进 + 系统评论（原因 + 恢复路径）——既有语义不变 |

## UC-3 过程写入（RTM / 完工记录 / 验收文档 / 接收标记）`serves: FR-2, FR-4`

任何写盘点（`rtm-yaml.ts:157`、`ReportTask.ts:85`、`verification-doc-writer.ts:44`、
`SyncRequirementMarks.ts:44`、`queue-access.ts:116,126`）统一：**按 REQ id 取记录 → 校正 → 写**。
结论：多窗口并行不再是这些路径的失败因素；它们与人是否开着看板无关。

## UC-4 只读调用与看板渲染（污染源本身）`serves: FR-1`

| 角色 | 行为 | 期望 |
|---|---|---|
| 窗口 B 的 `reqboard_status` | `agentIdFromExec` → 校正单例根 | 允许（保持现状）；**但对 A 的判定不再有影响** |
| 看板渲染 B 项目的需求 | `applyRequirementWorkspaceRoot` | 同上 |
| 任何人 | 读「本次写入根」 | 以**记录**为准，可观测字段 `used_project_root` 如实反映 |

## UC-5 异常流 `serves: FR-2, FR-5`

| 异常 | 期望表现 | 恢复路径 |
|---|---|---|
| 记录声明的根不是绝对路径 / 目录不存在 / 不可读 | 写侧**拒绝**：`REQBOARD_INVALID_WORKSPACE`（含该路径 + 建议）；**不降级到会话 cwd** | 修记录（或按项目规范重建需求），不得靠重试绕过 |
| 校正动作不可用（仓储不支持 `setWorkspaceRoot`）且将写往别处 | `REQBOARD_PROJECT_ROOT_MISMATCH`（两个绝对路径） | 属装配缺陷，报出即修装配 |
| 记录未声明根（存量） | 回落调用窗口 cwd 并标注 | 无需动作；如需固化，走既有需求字段变更流程 |
| 守卫在 `create` 之前拒绝 | 台账零写入，回执无 `requirement_id` | 修根后重新 `reqboard_capture` |
