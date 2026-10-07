---
title: 子卡请求预算软门禁
updated: 2026-10-07
source: REQ-261007100513-6749
---

# 子卡请求预算软门禁（L2 领域篇）

> **TL;DR**：子卡（子代理领的卡）默认 **60 次请求/会话**的**软**上限：到顶**先停下、再汇报**，
> 续跑须 owner **显式放行并留痕**。四条不变量：
> ① **执法按子会话**（与卡片归属无关，多卡并行也生效），**归属只决定汇报去向**且三级不猜；
> ② **不要**用 `executions[].sessionId` 做归属，也**不要**反向用 `isIgnoredSession` 判子会话；
> ③ 到顶处置用**独立停手位**（不复用人工门 in-flight，否则会连带停发同需求所有可开工卡）；
> ④ 放行必须**显式 + CAS**（并发两个放行不许互相覆盖）。

**来源**：REQ-261007100513-6749（2026-10-07）。裁定：D-3（软门禁：超限先汇报、续跑须主窗口明确放行）。
动因实测：基线窗口单卡请求数 **65–157 次**（无上限），一次返工 4 张卡 15 分钟烧 72M 输入。

## 一、预算口径与单一落点

| 项 | 值 / 落点 |
|---|---|
| 默认预算 | `LIMITS.subtaskRequestBudget = 60`（`src/domain/limits.ts`，**全仓唯一**） |
| 卡上覆盖 | `TaskRecord.budgetRequests?: number`（可选；≤0 或非整数 → 按缺省 + **留一条诊断**，不阻断开工） |
| 计数单位 | 该**子会话**的 `assistant/message` 事件条数（一条 = 一次 LLM 请求） |
| 运行态 | `state/subtask-budget.json`（`SubtaskBudgetState`，类型**单点**在 `src/shared/protocol.ts`） |

`limit` 在**开窗时定格**（事后改台账 / 改 `budgetRequests` 不影响已开窗口）——避免「同一窗口
前后两次判定不同」的漂移（同类坑见 `claimedAt` 当基准那次）。

## 二、执法按子会话（与归属解耦）

```
子会话识别（正向判据）:  session.header.origin === 'subagent' || delegationDepth > 0
                        并排除 session-reqboard-* 内部会话
计数:                    session/event 的 assistant/message，按 session.id 累计（运行态文件）
到顶:                    used >= limit
   ├─ ① 先停：把「立即停止发起新请求」的指令投给**该子会话**（自署来源，走 inbox）
   ├─ ② 再报：写卡评论（已归属时）/ 写**需求级评论**（未归属时）
   └─ ③ 等放行：登记**独立停手位**；越界继续发请求 → 计数继续累加 + **再投一次**停止指令 + 逐次诊断
```

**两条反面教材（都是实测换来的）**：

1. **不要按 `ExecutionRecord.sessionId` 归属**：实测全仓 **2202/2202** 条该字段是 `session-*` **窗口码**，
   而子会话是 **UUID**（365 会话中 253 个）⇒ 精确查表永不命中；多卡并行（真实形态）下落「未归属」= **零计数**。
2. **不要反向用 `isIgnoredSession` 判子会话**：它只看 `parentSession !== undefined`，而 **fork 窗口**的
   header 正是 `origin=undefined | parentSession=有 | depth=0`（实测 3 例）⇒ fork 窗口会被误当子会话计数。

**归属三级（只影响汇报去向，不猜）**：

| 级别 | 条件 | 汇报去向 |
|---|---|---|
| `exact-session` | 某卡 `executions[].sessionId` == 该会话 id | 卡评论 |
| `parent-unique-in-progress` | 父窗口在该需求下**恰好一张** `in_progress` 卡 | 卡评论 + **写明归属依据** |
| 未归属 | 其余（含多张在制） | **需求级评论**（`comments.jsonl`）+ 通知 owner；**不写卡评论** |

## 三、独立停手位（为什么不能复用人工门）

- 停手位：`SubtaskRuntimePort.enterHalt / clearHaltsForTask`，按**卡 id 或 `sess:<会话>`** 登记，
  TTL = `LIMITS.budgetHaltTtlMs`（30 分钟），过期或被清后可**重新进入**（`reentries` 递增）。
- **不复用 `enterAwaitingConfirm` 的人工门 in-flight**：后者按 `requirementId` 登记，会让
  `dialogInFlightFor` 挡住自动链派卡 ⇒ **一张子卡到顶就把同需求所有可开工卡一起停摆**；
  而 D-3 的语义是「该卡停」而非「整需求停」。
- 不写 `dive.driverHealth`、不用 `deliver`/`followup`（后者会新起回合）。

## 四、放行（显式 + 幂等 + CAS）

```ts
reqboard_task_move({ task_id, budget: { release: true, add?, expectedWindowIndex? }, reason: '…' })
```

- 入口复用既有 `task_move`（**不新增工具**——工具 schema 每轮请求都要重发，新增一个就是长期成本）；
  席位/绑定检查与其它动作**同源**，`reason` 必填并只写**卡评论 + 运行态窗口**（**不改任务状态机**）。
- **幂等**：`release` 只推进一个窗口（`windowIndex += 1`、`used` 归零、`limit = add`）；
  重复放行不叠加。
- **CAS**：`expectedWindowIndex` 与当前窗口号不一致即拒 `REQBOARD_CONFLICT` 并回报**当前**窗口号、
  **零写入** —— 消掉 read-modify-write 丢放行的竞态（两个窗口同时放行时不许互相覆盖）。

## 五、降级与失败语义

| 情形 | 处置 |
|---|---|
| 运行态文件缺失 / 版本未知（`v≠1`）/ JSON 截断 | `decision=unknown`、`countable=false` → 卡评论标注「**计数不可得**」，**不按 0 通过**、不阻断开工 |
| 端口 `write` 失败 | 计数**内存态权威累计**（不静默失效）+ `memoryDiverged` 诊断；连续失败仍会计到顶 |
| 到顶后子代理仍继续 | 计数继续累加 + 重投停止指令 + 逐次诊断（软门禁，依赖子代理配合——**如实声明**） |
| 未归属会话的计数 | 只存内存、不落盘（跨重启无意义）；其停手位靠 TTL / 重新派发收敛 |

## 六、已知边界与后续项

1. 这是**软**门禁：不 kill 进程，靠"停止指令 + 子代理配合"；硬杀会把快干完的卡提前干掉（D-3 明确否掉）。
2. 归属桥**在真实数据上不存在**（§二），若将来要让卡级归属可用，正路是**派发时把子会话 id 写进
   `ExecutionRecord.sessionId`**（当前由宿主工具派发，插件无法拦截）。
3. `SubtaskBudgetState` 类型只许从 `src/shared/protocol.ts` 取用，**不得**在 `application/internal` 另立第二处声明。
