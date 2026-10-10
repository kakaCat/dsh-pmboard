# pm-goal-round-driver

**以 goal 为基础**的回合驱动（用户裁定 2026-10-10：旧 `pm-round-driver` 作废、重写本包）。

## 它驱动什么

```
立项绑定？ → 六道闸 → goal 相位 → 跑 / 建下一个 goal / 请人判 stage
```

- **L2 任务目标（goal）**：管"这件事（这张卡）跑完没有" ⇒ 决定起轮与投递内容
- **L1 阶段目标（stage）**：管"这个阶段成没成" ⇒ goal 结束后由它判下一步
- 关键语义：**goal 结束不是终点**；stage 达成**不自动推进**（弹框请人裁决）

## 文件

| 文件 | 内容 |
|---|---|
| `src/types.ts` | 契约：`DecideInput` / `RoundDecision`（五态穷尽：drive / create-goal / wait-human / ask-stage-done / hold） |
| `src/decide.ts` | `decideGoalRound()` —— 七步决策树（立项绑定 → 闸 → goal × stage），**纯函数、零 I/O** |
| `src/invariant.ts` | INV-D1~D4：非 active 不得起轮 / 阶段已达成不得再建 goal / 停手必带原因 / create-goal 必带 taskId |
| `src/prompt.ts` | `renderRoundPrompt()` —— 投递提示词（阶段目标 + 达成判据 + 本轮做什么 + 边界 + 停手条件） |
| `src/hold.ts` | 停手纪律写入侧（闭锁置位/唯一解锁规则/退避账/熔断） |
| `src/act.ts` | `actOnDecision()` —— 决策五态 → 端口动作（I/O 全在端口后） |
| `src/admission.ts` | 投递纪律：`reserve` / `claim` / `discard` / `markStale` / `admit` / `release` / `deliverRound` |
| `src/subscriptions.ts` | **订阅持有**：root 组（`requirement-moved` / `agent/created`）+ per-agent 组（`agent/status` / `agent/inbox/*` / `session/event`，必须挂 `agent.ctx`，否则被作用域过滤器**静默丢弃**） |
| `src/heartbeat.ts` | 心跳对账（防静默停摆）：`planWake()` 纯判据 + 在闸整趟跳过 + 叫不醒达阈值写停手位 |
| `src/stage-prompt.ts` | **阶段裁决弹框（FR-8）**：`planStagePrompt()` 判据 + `proposeStageDone()` 有边界重弹（冷却 5min / 上限 2 次 / 指纹变了重新计 / 到顶留痕停手 / 永不抛） |
| `src/driver.ts` | **事件入口**：`createGoalRoundDriver()` —— `onIdle`（判据→决策→动作）/ `onInbox`（认领）/ `onInboxDiscarded` / `onTurnEnd`（准入 + 收尾注入）/ **`onPreStep`（进 step 前的栅栏：伪造·失效·重复就地拒收）** / **`onAgentError`（无 turn/end 形态的 agent 级错误：瞬时记账，达阈值熔断）** / **`onAgentDisposed`（清内存态）** / `requestDrive` / `teardown` / `whenQuiet` |

## 迁移进度（从 `pm-round-driver`）

| 部件 | 状态 |
|---|---|
| 决策树（goal × stage × 闸） | ✅ 本包已落（28 例测试绿） |
| 投递提示词 | ✅ 本包已落（按两层目标重写） |
| 停手纪律：闭锁 / 退避 / 上游闸 | ✅ **写入侧已迁**（`src/hold.ts`：唯一解锁规则「写过 + 台账显式 healthy」、人的意图优先、同因累加异因归零、达阈值熔断） |
| 决策 → 动作编排 | ✅ `src/act.ts`（五态映射端口；动作前再跑不变量，违反即抛、副作用不做） |
| 投递纪律：预留 → 投递 → 准入 | ✅ **已迁**（`src/admission.ts`：单飞预留、回合号接续、逐字认领、丢弃/失效永不计数、检查点前置、发失败清预留；栅栏判据复用 pm-core 纯函数） |
| 心跳对账 / 订阅分组 | ✅ 已迁（`src/heartbeat.ts` / `src/subscriptions.ts`） |
| 三入口补齐（pre-step 栅栏 / agent 级错误 / 处置清理） | ✅ 已补（重写 `dive-manager-wiring`·`dive-wake-wiring` 时要用到的面） |
| 事件入口（`onIdle` / `onInbox*` / `onTurnEnd`） | ✅ 已接（`src/driver.ts`） |
| 收尾注入点 | **不属本包**（用户裁定 2026-10-10）：收尾归**工具面**（`tool-pm-goal/src/wrapup.ts`，对齐宿主 `tool-goal`）——工具调用那一刻才知道目标刚变终态，且手里有 `exec.deferContext()` 注入点 |
| 弹框（gate-prompt）+ 阶段达成触发源（FR-8） | ✅ 已迁并升级（`src/stage-prompt.ts`：驱动拍判定 → 有边界请人裁决） |
| 接线（`pm/src/index.ts` 换成新驱动：`factsOf` / `delivery` / 弹框 / 心跳 / 订阅五处适配） | ⏳ **最后一步（未做）** |
| 删除旧包 `pm-round-driver` | ⏳ 新包验收通过后 |

## 迁移进度补充

`src/hold.ts` 直接复用 pm-core 的纯判据（`recordFailure` / `breakerTripped` / `backoffFor`），
**不复制一份计数规则**（本仓"两份真相必然漂移"的老病）。本包因此升到 **L2**（allow: pm-common / pm-core / pm-goal）。

## 接线清单（最后一步，未做）

新驱动的每个端口都要在组合根接上既有实现（本包不碰宿主与台账）：

| 端口 | 接什么 |
|---|---|
| `factsOf(agentId)` | 台账窄投影（`peekFacts`）+ 任务队列（ready 卡 / acceptance）+ 阶段文案 + `dive.roundsInStage` + 归属判据 |
| `delivery.*` | 既有投递器（`createRoundMessage` / `deliverMessage`）+ `checkpoint` + 准入计数写入 |
| `createTaskGoal` / `askStageDone` | `pm-goal` 的建目标 + `src/stage-prompt.ts` 的 `proposeStageDone` |
| `deferWrapup` | 宿主 `ToolRunContext.deferContext()` 位置 |
| 心跳 / 订阅 | `createGoalHeartbeat` + `wireGoal{Root,Agent}Subscriptions`（订阅持有者仍是 Dive 服务） |

## 测试

```bash
npx vitest run pm-goal-round-driver/tests
```
