---
requirement_refs: [FR-6]
---

# 测试用例设计（REQ-261002141430-a5ef）

> 全部集中在新增用例文件 `tests/dialog-inflight-stop.test.ts`（沿用仓库既有 fake 端口写法，零真实 IO）。
> **判定口径**：每条用例都写清"修前必红 / 修前无此路径"，能红的才叫回归用例。

## 用例总览 `serves: FR-6`

| 用例 | 断言一句话 | 覆盖 | 修前 |
|---|---|---|---|
| TC-1 | 挂起确认在途 → 不投回合 | FR-1 | **红**（照投） |
| TC-2 | 在途 → 实施链不派卡且 `stopped='awaiting-confirm'` | FR-1 | **红**（照派） |
| TC-3 | 作答到达 → 自动清停手位并触发续跑 | FR-3 | **红**（`wake()` 空实现） |
| TC-4 | **无在途 → 投递/派卡与改动前逐字一致**（反向自检） | FR-1 | 绿（守住不得回归） |
| TC-5 | 在途时 `recoverHealth` 拒绝且零写入 | FR-4 | **红**（任何 paused 都清） |
| TC-6 | 停手位残留但无在途（过期/重启）→ 心跳对账恢复 | FR-4 | **红**（无此趟） |
| TC-7 | Dive 门框与同拍起轮不并存 | FR-5 | **红**（同拍投出） |
| TC-8 | 通道不可用降级 → 不登记、无残留停手位 | FR-5 | 绿→固化 |
| TC-9 | `exit` 幂等；台账写失败响亮告警 | FR-3 | **红**（功能不存在） |

## TC-1 在途停手：不投回合 `serves: FR-1`

**测试目标**：弹框在途时，`drive()` 不得构造/投递回合消息。

**前置条件**：
- 假 agents + 假 delivery（记录 `createRoundMessage` / `deliverMessage` 调用次数）；
- 需求 `armed` + `driverHealth=healthy`，绑定窗口等于 agent id；
- 在途表 `enter({ref:'pc-test', requirementId, windowKey, kind:'confirm', suspend:true})`。

**测试步骤**：
1. `driver.onIdle(agent, () => {})`；
2. 等待 `whenQuiet()`；
3. 读数：投递次数、`driverHealth.state`。

**预期结果**：
- 投递次数 = 0（修前 = 1）；
- `driverHealth` 未被改成 `paused`（等人不是故障）；
- `dive.roundsInStage` 不变。

**覆盖场景**：
- [x] 正常流程（等人）
- [x] 边界值（宽限内作答路径不受影响——由 TC-3 覆盖）
- [x] 异常处理（投递端口抛错与否均不投）

## TC-2 在途停手：实施链不派卡 `serves: FR-1`

**测试目标**：在途时派卡准入命中新停因，且**不改** `autoRun`。

**前置条件**：`status='implementing'`、`autoRun=true`、存在 ready 任务；在途表有登记。

**测试步骤**：
1. 调推进器 `advance(requirementId)`；
2. 读数：`out.stopped`、要求 `autoRun`、任务状态。

**预期结果**：
- `out.stopped === 'awaiting-confirm'`；
- `req.autoRun === true`（**不变**）；`advance.noopStreak` 未增长（等人不算停滞）；
- 无新任务进入 `in_progress`。

**覆盖场景**：
- [x] 正常流程
- [x] 边界值（在途解除后同一入口恢复派卡 → TC-3）

## TC-3 作答到达：自动解除并续跑 `serves: FR-3`

**测试目标**：作答（肯定与否定两种）都解除停手位；续跑被触发一次。

**前置条件**：TC-1 的在途态；假 `questions` 返回既定答案；记录 `requestDrive`/续跑触发。

**测试步骤**：
1. 走 `askConfirm` 的挂起路径 → 后台作答到达；
2. 等待落章/留痕；
3. 读数：`driverHealth.reason`、在途表、台账 comment。

**预期结果**：
- `driverHealth` 无 `awaiting-confirm:` 前缀（= 恢复）；
- 在途表 `inFlightFor(requirementId) === false`；
- 新增一条恢复留痕（写清出口 = 作答）；
- 否定答复（需修改）同样恢复（不得因"没推进"就把 agent 冻住）。

**覆盖场景**：
- [x] 正常流程（肯定）
- [x] 分支（否定 / 需修改）
- [x] 异常处理（settle 抛错 → 仍恢复，避免静默停摆）

## TC-4 反向自检：无在途时不停 `serves: FR-1`

**测试目标**：本需求不得让正常自动流程变慢或停下。

**前置条件**：同一套假端口，**无**在途登记。

**测试步骤**：
1. 跑一遍 `onIdle` + `advance`；
2. 与改动前基线（固定 fixture 下的投递次数 / 派卡结果）逐项比对。

**预期结果**：投递次数、回合号、派卡结果与基线**逐字一致**；`stopped` 不为 `awaiting-confirm`。

**覆盖场景**：
- [x] 正常流程
- [x] 边界值（在途表为空 vs 已全部 exit）

## TC-5 恢复不越权：`recoverHealth` 在途时拒绝 `serves: FR-4`

**测试目标**：看板「继续」/`requirement-moved` 不得在弹框在途时清掉停手位。

**前置条件**：`driverHealth={state:'paused',reason:'awaiting-confirm:pc-test'}` + 在途登记存在。

**测试步骤**：
1. `recoverHealth({repo, now, dialogInFlight}, id, 'board-resume')`；
2. 读数：返回值、`driverHealth`、新增 comment 数。

**预期结果**：
- 返回 `false`；`driverHealth` 原样（前缀仍在）；comment 数为 0（零写入）；
- 在途解除后再调一次 → 返回 `true` 且已转 `healthy`。

**覆盖场景**：
- [x] 正常流程
- [x] 异常处理（`dialogInFlight` 缺省注入 → 保持既有行为，向后兼容）

## TC-6 过期/重启兜底：心跳对账恢复 `serves: FR-4`

**测试目标**：停手位残留而无人等待时，周期性对账必须恢复（不静默停摆）。

**前置条件**：`driverHealth.reason='awaiting-confirm:pc-gone'`；在途表**空**（模拟 TTL 过期或进程重启）。

**测试步骤**：
1. `heartbeat.tick()`；
2. 读数：`resumed`、`driverHealth`、comment。

**预期结果**：
- `resumed` 含该需求；`driverHealth.state === 'healthy'`；
- 留痕写明"在途登记已消失（过期/重启），按无人等待处理"；
- 反向：在途仍在时，同一趟**不得**恢复。

**覆盖场景**：
- [x] 边界值（TTL 刚过 / 刚登记）
- [x] 异常处理（对账写失败 → 不阻断既有唤醒趟）

## TC-7 Dive 门框与起轮不并存 `serves: FR-5`

**测试目标**：门框弹框的**同一 idle 拍**不得再投出续跑回合。

**前置条件**：装配 `gatePrompt`（假 `questions` 挂住不返回）；需求满足门框触发条件；
round 半与采集半按组合根同款顺序接线（先 `captureTick` 再 `requestDrive`）。

**测试步骤**：
1. 触发一次 idle 拍；
2. 读数：弹框调用次数、投递次数。

**预期结果**：
- 弹框被投递 1 次；投递回合 0 次（修前 1 次）；
- 门框作答后：停手位被清、下一次 idle 拍照常起轮。

**覆盖场景**：
- [x] 正常流程
- [x] 分支（门框通道抛错 → 降级且不留停手位，见 TC-8）

## TC-8 降级不登记 `serves: FR-5`

**测试目标**：弹框通道不可用时不得登记在途（否则无人作答 = 永久停手）。

**前置条件**：假 `questions.available() === false`。

**测试步骤**：
1. 走 `askConfirm`（返回 `fallback=board`）与 `gatePrompt.prompt`（降级）；
2. 读数：在途表、`driverHealth`。

**预期结果**：在途表为空；`driverHealth` 无 `awaiting-confirm:` 前缀；两者返回体形状与改动前逐字一致。

**覆盖场景**：
- [x] 异常处理
- [x] 边界值（通道"曾可用"随后失效）

## TC-9 幂等与失败响亮 `serves: FR-3`

**测试目标**：`exit` 幂等；台账写失败不静默。

**前置条件**：注入会抛错的 repo；注入记录调用的假 `alert`。

**测试步骤**：
1. 连续 `exit` 三次同一 ref；
2. 制造 `mutate` 抛错后调 `enter`。

**预期结果**：
- 第 2、3 次 `exit` 零写入、不抛；
- `alert` 被调用一次（内容含需求 id 与"停手位写入失败"），在途表仍生效（拦截优先）。

**覆盖场景**：
- [x] 边界值
- [x] 异常处理

## 测试覆盖度统计 `serves: FR-6`

| 需求条款 | 关联用例 | 覆盖状态 |
|---|---|---|
| FR-1 | TC-1, TC-2, TC-4 | ✅ 已覆盖 |
| FR-2 | TC-1, TC-6, TC-9 | ✅ 已覆盖 |
| FR-3 | TC-3, TC-9 | ✅ 已覆盖 |
| FR-4 | TC-5, TC-6 | ✅ 已覆盖 |
| FR-5 | TC-7, TC-8 | ✅ 已覆盖 |
| FR-6 | 本文件全部用例 + C-14/C-15 基线（`pnpm test` / `pnpm typecheck`） | ✅ 已覆盖 |
