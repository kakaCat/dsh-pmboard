---
serves: [FR-1, FR-2, FR-3, FR-4]
---

# 设计：修复 reqboard 体检第一批边界 bug（H1/H2-role/M2/M6）

> 类型：bug 修复（4 处独立小修，规模小，按本仓「规模小可合一」裁定为单份设计文档）。
> 方法纪律（bug 类型档）：每处按 复现 → 根因 → 修复 三步走；根因均已定位到行，禁止"先改了看"。
> 证据基线：REQ-261007165643-4275 调研报告 §2.1/§2.2 + 本窗口 2026-10-07 现场复核。

## 总览 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 编号 | FR | 现场 | 修法一句话 | diff 量级 |
|------|-----|------|-----------|----------|
| H1 | FR-1 | `src/application/use-cases/AskConfirm.ts:449` | `user_feedback` 改条件展开，无反馈不带键 | 1 行 |
| H2-role | FR-2 | `src/http/routers/tasks.ts` `handleTaskMove` | 派生 role 并传入 `transitionTask` | 1 个函数内 |
| M2 | FR-3 | `src/domain/requirement/RequirementStatus.ts:112` | `HUMAN_ONLY_REQ_TRANSITIONS` 加 `canceled>draft` | 1 行 |
| M6 | FR-4 | `src/domain/workflow/DoneEvidenceSpec.ts:76-80` | 单条读数 clamp 到 [0, throttleMs] | 行内 |

四处共享同一条纪律：**修复落在既有收敛点内**（回执构造 / `transitionTask` /
`assertReqTransition` / `doneThrottleRemainingMs`），不新增状态、不新增边、不改存储格式。

## FR-1 修复设计：弹框否定回执 user_feedback 条件展开 <!-- serves: FR-1 -->

**复现**

任一人工门弹框（如需求文档确认），用户选「需要修改」或「暂停」且**不填反馈意见**：
AskConfirm 弹框路径返回 `{ success:true, confirmed:false, user_feedback: undefined, … }`，
经 dsh-tools `snapshotJsonValue` 校验（walkJsonValue 对 undefined 返回 void 0）必抛
`ToolOutputError: value is not lossless JSON`——软回执变成无信息硬错误。

**根因**

`AskConfirm.ts:449`（2026-10-07 工作树复核行号）：

```ts
user_feedback: userFeedback.length > 0 ? userFeedback : undefined,
```

显式写入 `undefined` 值的键。JSON 无损契约要求**缺席**而非 `undefined`；
与已修的 RunStatusTool null 透传事故同类（降级形状必须能通过自己的 schema）。

**修复**

条件展开，一行修：

```ts
...(userFeedback.length > 0 ? { user_feedback: userFeedback } : {}),
```

契约（定死）：弹框否定回执对象 `user_feedback` 键 **仅当反馈非空时存在**；
`success/confirmed/advanced/user_choice/note` 五键形状不变；肯定路径（落章推进）不受影响。

同文件其他回执分支已复核：肯定路径与 pending 路径均无 `user_feedback: undefined` 写法，本修唯一现场。

## FR-2 修复设计：handleTaskMove 按角色传 role <!-- serves: FR-2 -->

**复现**

看板（HTTP 面）把一张子卡（有 `parentId`）推向 `integrating` / `testing` / `in_review`：
`POST` 任务移动路由 → `handleTaskMove` → `transitionTask(task, to, { … })` 未传 `role`，
缺省 `'legacy'` 走存量卡转移表 → 非法转移被放行。子卡进入这些态后
SUBTASK_TRANSITIONS 无出边，卡死。

**根因**

`src/http/routers/tasks.ts` `handleTaskMove`（:131）调收敛点时缺 `role` 参。
工具面 `MoveTask.ts:232` 的 `roleOf` 早已按角色分表，HTTP 面是漏接的第二调用方
（`transitionTask` 全仓调用方：router / failure-handling / MoveTask——failure-handling
固定回 todo 不受影响）。

**修复**

**契约（定死）**：

1. 新增导出助手（落点 `src/application/internal/task-transition.ts`，收敛点同文件、
   router 已在导入它，零新增依赖方向）：

   ```ts
   /** 角色判定：子卡（有 parentId）/ 父卡（有子卡）/ 存量卡——与工具面 MoveTask 同口径。 */
   export function roleOfTask(task: TaskRecord, tasks: readonly TaskRecord[]): TaskRole
   ```

   语义逐字对齐 `MoveTask.ts:232`：`parentId` 非空串 → `'subtask'`；
   `tasks.some(t => t.parentId === task.id)` → `'parent'`；否则 `'legacy'`。
   （`MoveTask` 内部 `roleOf` 是否改为委托本助手：允许但**非必须**，避免顺手重构。）

2. `handleTaskMove` 的 `mutate` 回调内（`tasks` 数组在场）：

   ```ts
   transitionTask(task, to, { at: now(), actor: …, ...(reason ? { reason } : {}), role: roleOfTask(task, tasks) })
   ```

行为变化面：子卡经 HTTP 面只能走 SUBTASK_TRANSITIONS（todo→in_progress→done 等合法边）；
父卡 / 存量卡读数不变（`roleOfTask` 对它们返回与现状一致的表）。
actor 鉴权（H2 另一半）**不在本设计**——见「边界」节。

## FR-3 修复设计：canceled>draft 入人工门 <!-- serves: FR-3 -->

**复现**

agent 调 `reqboard_move` 把 `canceled` 需求推向 `draft`：`assertReqTransition` 只查
`HUMAN_ONLY_REQ_TRANSITIONS`（无此键）→ 放行。人刚做的取消被 agent 撤销。
任务侧对称边 `canceled>todo` 已在 `HUMAN_ONLY_TASK_TRANSITIONS`，需求侧不对称。

**根因**

`RequirementStatus.ts:112` 的 `HUMAN_ONLY_REQ_TRANSITIONS` 收齐了各阶段 `>canceled`
与 `accepting>archived`，漏了复活边 `canceled>draft`。
`SYSTEM_REQ_TRANSITIONS`（:145-149）本就不含该键——system 已被 `system_gate` 拦住，
唯一敞口是 actor=agent。

**修复**

集合内加一行（带注释，与既有条目同款式）：

```ts
'canceled>draft', // 复活需求（破坏性逆动作）：取消是人工门，复活同门（与任务侧 canceled>todo 对称）
```

**契约（定死）**：`assertReqTransition('canceled','draft','agent')` 抛
`{ code: 'human_gate' }`；`actor='human'` 放行；`actor='system'` 仍抛 `system_gate`（不变）。
派生面零手改：`agentNextActions('canceled')` 由同一集合过滤，自动不再含 `draft`；
`canReqTransition` / `REQ_TRANSITIONS` 边表不动（合法边仍在，只是 agent 不可发起）。

## FR-4 修复设计：throttleRemainingMs 读数 clamp <!-- serves: FR-4 -->

**复现**

某任务的 `statusHistory` 出现 `h.at > now`（时钟回拨 / 漂移 / 跨机写入的未来时间戳）：
`left = throttleMs - (now - h.at)` > throttleMs，`doneThrottleRemainingMs` 返回超 60s
的读数，拒绝文案出现「还需等待 90 秒」这类不可能值。

**根因**

`DoneEvidenceSpec.ts:76-80` 对每条 done 历史算 `left` 后取大，无上下界保护。
返回契约本应是 [0, throttleMs]，下界有 `remaining > 0 ? remaining : 0` 兜底，上界没有。

**修复**

行内 clamp（取大之前钳单条读数）：

```ts
const left = Math.max(0, Math.min(throttleMs, throttleMs - (now - h.at)))
```

**契约（定死）**：`doneThrottleRemainingMs` 返回值恒 ∈ `[0, throttleMs]`；
正常历史（h.at 在过去）读数逐值不变；未来时间戳读数 = throttleMs（而非溢出值）。

## 文件结构（修改清单） <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 文件 | 动作 | 职责一句话 |
|------|------|-----------|
| `src/application/use-cases/AskConfirm.ts` | 修改 | FR-1：回执 user_feedback 条件展开 |
| `src/application/internal/task-transition.ts` | 修改 | FR-2：新增导出 `roleOfTask`（角色判定单源） |
| `src/http/routers/tasks.ts` | 修改 | FR-2：`handleTaskMove` 派生 role 并传参 |
| `src/domain/requirement/RequirementStatus.ts` | 修改 | FR-3：人工门集合加 `canceled>draft` |
| `src/domain/workflow/DoneEvidenceSpec.ts` | 修改 | FR-4：left 行内 clamp |
| `tests/ask-confirm.test.ts` | 修改 | FR-1 回归用例 |
| `tests/http-task-move-role.test.ts` | **新建** | FR-2 回归用例（HTTP 面角色门） |
| `tests/domain/requirement-status.test.ts` | 修改 | FR-3 回归用例 |
| `tests/done-throttle-guidance.test.ts` | 修改 | FR-4 回归用例 |

无新建源码文件、无删除文件。

## 回归测试落点 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| FR | 测试文件 | 断言 |
|-----|---------|------|
| FR-1 | `tests/ask-confirm.test.ts`（新增用例） | 弹框否定 + 空反馈：回执 `success:true, confirmed:false`；`JSON.stringify` 不抛；`'user_feedback' in receipt === false`；有反馈时键存在且等值 |
| FR-2 | `tests/http-task-move-role.test.ts`（新建，harness 参照 `tests/canceled-internal-collect.test.ts` 对 routers/tasks 的直调方式） | 子卡 → integrating/testing/in_review 抛 invalid_transition 且任务字段零改动；存量卡 todo→in_progress→testing 老路径放行；父卡合法边放行 |
| FR-3 | `tests/domain/requirement-status.test.ts`（新增用例） | agent 走 canceled→draft 抛 `code:'human_gate'`；human 放行；system 抛 `system_gate`；`agentNextActions('canceled')` 不含 `draft` |
| FR-4 | `tests/done-throttle-guidance.test.ts`（新增用例） | `h.at = now + 30_000` → 返回 ≤ 60_000（= throttleMs）；`h.at = now - 10_000` → 返回 ≈ 50_000（行为不变） |

## 数据层与回滚 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

- **不改表 / 不改 schema**：五处源码均为判定与回执形状，台账（queue.json / 分片需求文件）
  格式零变化，无迁移。
- **存量数据不修**：已卡进非法态的子卡（若有）不做数据修复，另立修缮项（需求文档已声明）。
- **回滚**：四个源码文件各自独立，`git revert` 单提交即回滚；无配置项、无特性开关需要清理。

## 边界（不做什么） <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

- 不做 H2 的 HTTP 面 actor 鉴权模型（报告 4.0 节：需一次小型设计，另立项）。
- 不做 H3（跨进程写锁）、M1 / M3 / M4 / M5（报告建议的后续批次）。
- 不动 `canceled>archived` 是否挂人工门（报告未裁决，维持现状）。
- 不做存量非法态子卡的数据迁移；不做任何顺手重构（`MoveTask.roleOf` 委托化是允许项非必须项）。
- 不改工具 schema / prompt 文案（本批纯运行时行为修复）。

## 验收口径 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

1. 上表 4 组回归用例全部通过：`pnpm test` 退出码 0 且与基线比对无新增失败（C-14）。
2. 类型检查：`pnpm typecheck` 退出码 0（C-15）。
3. 需求文档四条 FR 的 grep 判据逐条命中（AskConfirm 条件展开 / tasks.ts 传 role /
   RequirementStatus 含 `canceled>draft` / DoneEvidenceSpec 可见 clamp）。
4. diff 盘点与「文件结构」表一致：5 个源码文件 + 4 个测试文件，无表外改动。
