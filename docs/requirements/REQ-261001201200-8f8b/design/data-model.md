# REQ-261001201200-8f8b 数据模型设计 · 台账零新增字段，语义靠既有位组合 serves: FR-1, FR-3, FR-4

> 结论先行：**不改台账 schema**。本需求只新增两类写入——一条 comment（FR-3）与一次 activation 回写（FR-4），
> 都在既有字段的既有取值范围内。

## RequirementRecord.dive（不改） serves: FR-4

```ts
interface DiveState {
  activation: "armed" | "disarmed"    // 自动续跑是否启用
  phase: "active" | "idle" | "paused"  // 生命周期相位
  roundsInStage?: number               // 本阶段已准入回合数
  lastActiveAt?: number
  pausedReason?: string
}
```

本次**不新增、不删除、不改类型**。判别误停摆靠 `activation` 与 `phase` 的**既有组合**（判别矩阵见 interfaces.md）。

## 状态迁移表（本次相关的边） serves: FR-1, FR-4

| 起始 | 事件 | 目标 | 写入者 |
|------|------|------|--------|
| 无 dive | 立项（createRequirementDirect） | armed / active | 既有（创建即武装） |
| armed / active | 一次成功起轮并准入 | armed / active，roundsInStage 加 1 | 既有 persistAdmission |
| armed / active | 驱动或投递失败 | **disarmed / active** | 既有 disarm（修前无痕，修后加 comment） |
| disarmed / active | 人确认推进（requirement-moved）或看板「继续」 | **armed / active**（加 comment） | **本次新增 rearmIfRecoverable（FR-4）** |
| 任意 | 人 clear_pause | disarmed / idle | 既有 ClearPause |
| 任意 | 回合上限或 aborted | 任意 / paused | 既有 terminalBlock / pauseAborted |

不变量（本次新增，写进测试）：

1. `rearmIfRecoverable` **只在** `activation=disarmed 且 phase=active` 时写入；
2. 人主动停手（`phase=idle`）与终态暂停（`phase=paused`）**永不**被自动改写；
3. 一次 disarm 至多对应一条「解除武装」comment（不重复刷屏）。

## comment（复用既有形状） serves: FR-3

```ts
{
  id: "c-dive-disarm-<now>",
  body: "[Dive] 已解除武装（手动模式）：<reason>",
  createdAt: <now>,
  createdBy: { kind: "system" },
}
```

| 触发 | reason 取值 | 是否写 comment |
|------|-------------|----------------|
| drive 内投递失败 | queue-failed | 写 |
| 检查点失败 | checkpoint-failed | 写 |
| 驱动体异常 | driver-failed | 写 |
| pre-step 校验失败 | pre-step-error 或 prompt-rejected | 写 |
| agent 错误 | agent-error | 写 |
| 回合 max-tokens 或 aborted | max-tokens 或 aborted | 写 |
| 插件收尾 | teardown | **不写**（正常收尾） |

## 消息 id（新增使用，不入台账） serves: FR-1

`idFactory` 产出的 id 只进投递消息的 `message.id`，**不写台账**；缺省回落 `newCommentId()`（形如 c-xxxxxx）。
因此本需求的 id 变更**不构成数据契约变更**，不需要迁移。

## 迁移与回填 serves: FR-1, FR-4

- **不迁移**：台账无字段变化，旧数据可直接读。
- **不回填**：存量 13 条 disarmed 需求不做一次性批量重写（无法区分「误停摆」与「当时本就是手动跑」的历史意图）；靠 FR-4 的恢复入口在下一次推进事件中自然收敛。
- **可观测**：修后新增的 disarm comment 与 rearm comment 让「停摆/恢复」在台账与看板可见。
