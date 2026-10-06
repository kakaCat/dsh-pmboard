---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 用户场景（REQ-261005213603-eaed）

> 只承载需求文档放不下的多角色 / 多分支场景。编号 UC-x 供测试用例与任务卡引用。

## 场景总览 `serves: FR-1`

| 场景 | 角色 | 触发 | 完成标志 | serves |
|---|---|---|---|---|
| UC-1 后台跑子卡，圆圈亮起 | 看板的人 | agent 投递 `reqboard_task_run`（或自动链触发）后窗口回合结束 | 卡面出现 `[data-running="true"]`，`aria-label="后台 run 进行中"` | FR-1, FR-3, FR-4 |
| UC-2 run 结束，圆圈熄灭 | 看板的人 | run 的 `finally` 清锁 | 不刷新页面，圈在 ≤20s 内消失 | FR-4 |
| UC-3 会话与锁同时成立 | 看板的人 / 读屏用户 | agent 正在窗口里跑回合，且该需求同时有 run 在跑 | 只出一个圈，且报「会话进行中」（成因优先级） | FR-3 |
| UC-4 残锁与时钟偏差 | 看板的人 | 进程被杀、锁未清（或系统时间回拨） | 最多亮到 stale（15min）后熄灭；时间在未来时判新鲜（与 host 同口径） | FR-2, FR-5 |
| UC-5 读数不可得 | 看板的人（旧服务端 / 无锁需求） | 摘要不带 `advanceLockAt`，或该需求无 run | 不渲染任何指示（无灰点、无「未知」）；不抛错 | FR-5 |
| UC-6 维护者读旧红线 | 后来实现者 | 打开 `docs/architecture/client-running-indicator.md` 或 283d 设计文档 | 看到「已被 REQ-261005213603-eaed 取代」标注，不会把新判据当缺陷删掉 | FR-6 |

## UC-1 后台跑子卡，圆圈亮起 `serves: FR-1, FR-3, FR-4`

- **用例角色**：看板的人（PM / 需求发起人）。
- **前置条件**：某需求 `autoRun` 已开或有 ready 卡；agent 调用了 `reqboard_task_run`（投递即返回，窗口回合已结束）。
- **交互流程**：
  1. agent 投递后台 run → host 认领推进锁（`advance.lockAt`）并每 30s 心跳续租；
  2. 锁写入 → 台账 revision bump → SSE → 看板重取 `/state` → 重绘；
  3. 人在看板上看到该需求卡面的 REQ id 后出现转圈；hover 显示「后台 run 进行中（子卡链在执行，窗口可以已空闲）」。
- **异常流**：
  - SSE 断流 → 既有 20s 轮询兜底（最迟 20s 后出现）；
  - 该需求同时有窗口在跑回合 → 圈仍只一个，报「会话进行中」（UC-3）。
- **后置条件**：卡面显示一个运行圈（`cause='run'`）。
- **完成标志**：DOM 中该卡出现 `[data-running="true"]` 且 `aria-label="后台 run 进行中"`。

## UC-2 run 结束，圆圈熄灭 `serves: FR-4`

- **用例角色**：看板的人。
- **前置条件**：UC-1 已成立（圈亮着）。
- **交互流程**：
  1. run 收尾（`finally` 清 `lockAt`/`runId`）→ revision bump → SSE → 重绘；
  2. 人未做任何操作（不刷新、不切页）即看到圈消失。
- **异常流**：
  - 清锁写盘失败 → 由 stale 兜底：最迟 `15min + 20s` 内熄灭（与 host 残锁容忍一致）；
  - SSE 断流 → 20s 轮询兜底。
- **后置条件**：卡面不含 `data-running`。
- **完成标志**：不刷新页面，圈在 ≤20s（正常清锁路径）内消失。

## UC-3 会话与锁同时成立 `serves: FR-3`

- **用例角色**：看板的人；读屏用户。
- **前置条件**：agent 正在窗口里跑回合（会话 `running=true`），且该需求同时有新鲜推进锁。
- **交互流程**：
  1. 渲染时 `requirementRunningMark` 先判会话判据 → 命中即返回 `{ cause: 'session' }`；
  2. 渲染层只渲染一个圈。
- **异常流**：无（两个判据都由同一函数收敛）。
- **后置条件**：单卡内 `data-running="true"` 计数 == 1。
- **完成标志**：`aria-label="会话进行中"`（而非 run 文案）。

## UC-4 残锁与时钟偏差 `serves: FR-2, FR-5`

- **用例角色**：看板的人。
- **前置条件**：进程被杀导致锁未清（最后心跳 ≤15min 前）；或系统时间被回拨。
- **交互流程**：
  1. 渲染时按 `now - advanceLockAt < LIMITS.advanceLockStaleMs` 判定；
  2. 过期后由 20s 轮询触发的重绘熄灭圈。
- **异常流**：
  - 时间在未来（`now - lock < 0`）→ 判新鲜（与 host `AdvanceChain.ts:747` 同一表达式）；
  - 恰好等于阈值 → 判**不**新鲜（同 host 的 `<`）。
- **后置条件**：残锁最多造成 15min 假亮；时钟偏差不放大（与 host 同偏差）。
- **完成标志**：真值表单测断言「恰好 stale → false」「未来时间 → true」。

## UC-5 读数不可得 `serves: FR-5`

- **用例角色**：看板的人（旧服务端 / 无 run 的需求）。
- **前置条件**：服务端为旧版（摘要无 `advanceLockAt`），或该需求当前没有 run。
- **交互流程**：
  1. `requirementRunInFlight` 收到缺键 / 非有限数 → `false`；
  2. `renderRunningDot(undefined)` 返回空串。
- **异常流**：会话 store 服务未注入（旧客户端）→ 既有降级路径照旧（本次不新增服务依赖）。
- **后置条件**：输出与改动前逐字节一致。
- **完成标志**：`buildBoard(state, 1)` 不含 `data-running`；控制台零 `error`。

## UC-6 维护者读旧红线 `serves: FR-6`

- **用例角色**：后来实现者。
- **前置条件**：有人要按旧文档「禁止 advanceLockAt 近似推断」把新判据删掉。
- **交互流程**：
  1. 打开 `docs/architecture/client-running-indicator.md` 的红线节；
  2. 看到就地标注：`advanceLockAt` 已由 REQ-261005213603-eaed 取代为正式判据（附表达式与阈值出处）；
  3. 同页仍能看到 `executions[].outcome === 'running'` 的禁用表述。
- **异常流**：标注只加不删——283d 的历史结论与验收档案保持原样。
- **后置条件**：旧文档不再误导。
- **完成标志**：两条 grep 断言（见 test-cases.md）命中。

## 用例 ↔ 条款对照 `serves: FR-1`

| 条款 | 覆盖用例 |
|---|---|
| FR-1 | UC-1 |
| FR-2 | UC-4 |
| FR-3 | UC-1、UC-3 |
| FR-4 | UC-1、UC-2 |
| FR-5 | UC-4、UC-5 |
| FR-6 | UC-6 |

## 关键决策与取舍 `serves: FR-3`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 双成因时显示哪个 | 显示 run 成因（更"新"） | 会话优先 | 会话回合是更直接的事实；run 成因兜底（D-3 的呈现口径） |
| 残锁场景 | 另设更严的 UI 阈值 | 与 host 同一 15min | 阈值单一来源；假亮窗口与 WIP 闸门容忍一致 |
| 无读数 | 灰点 / 「未知」 | 什么都不渲染 | 需求 283d 的既有红线（FR-5） |

## 技术方案与亮点 `serves: FR-1`

- **一个 mark 覆盖全部场景**：六个场景里，判据差异全被 `requirementRunningMark` 吸收，渲染层与视图层不做分支（可核验指向：`src/client/session-running.ts` 新函数 + `tests/client-session-running.test.ts` 真值表）。
