# REQ-260930231831-a8fa 用例 · 门确认后的自动续跑、失败可见与存量边界 serves: FR-1, FR-2, FR-3

> 三个用例，两种角色：**主流程**（修后自动起轮）、**异常流程**（失败仍可见）、**边界**（存量不改，如实说明）。

## TL;DR serves: FR-1, FR-3

```
                    ┌─────────────────────────────────────────────┐
   人（需求方）      │ UC-1 门确认后自动续跑（主流程）              │
        │            │ UC-2 投递失败 → disarm 且台账可见（异常）    │
        └── 点「通过」┤ UC-3 存量 disarmed 需求（边界，本次不改）    │
                    └─────────────────────────────────────────────┘
```

| 用例 | 角色 | 修前 | 修后 |
|------|------|------|------|
| UC-1 | 需求方 / 实施 agent | 门确认后无人唤醒，须人工敲「继续」 | 门确认后自动起轮，无需人工消息 |
| UC-2 | 维护者 / 需求方 | 只写进进程日志，看板无感 | 台账留 comment，看板可见"已转手动模式" |
| UC-3 | 需求方 | 需人工消息（无解释） | **不变**（明确不在本次范围），但文档与看板说明原因 |

## UC-1 · 人工门确认后自动续跑 serves: FR-1, FR-2

| 项 | 内容 |
|----|------|
| 触发 | 对 `armed + active` 需求，人在弹框/看板确认一个人工门（产物确认或计划批准） |
| 前置 | 需求 `dive.activation='armed'`、`phase='active'`；绑定窗口在线（`agents.get(windowKey)` 有 agent 句柄） |
| 步骤 | ① 确认落章 + 状态推进 → ② 台账发 `requirement-moved` → ③ round driver 收到事件置 `requested` → ④ agent 空闲拍执行 `drive()` → ⑤ `createRoundMessage` 构造回合消息 → ⑥ `deliverMessage` → `agent.followup()` → ⑦ 回合进入 history → ⑧ 准入计数 `roundsInStage = round` |
| 期望 | 30s 内自动起一轮；会话日志出现 `source.kind='dive'` 的 user 消息；台账 `activation` 仍为 `armed`、`roundsInStage ≥ 1` |
| 失败分支 | agent 忙 → `readyToDrive` 不成立，`requested` 保持，下个空闲拍重试（既有行为）；`deliverMessage` 失败 → 转 UC-2 |

## UC-2 · 投递失败：disarm 但台账可见 serves: FR-3

| 项 | 内容 |
|----|------|
| 触发 | 驱动过程中真实失败：窗口离线 / agent 无 `followup` / `followup` 抛错 / 检查点失败 / 驱动体异常 |
| 步骤 | ① 失败点返回 `delivered:false` 或抛错 → ② `requestDrive` 守卫捕获 → ③ `disarm(state, reason)` → ④ 写台账：`activation='disarmed'` + 追加 system comment → ⑤ `logger.warn`（保留第一现场） |
| 期望 | 需求上出现 `[Dive] 已解除武装（手动模式）：<reason>`；看板能看到这条 comment；`disarm()` 不抛、不中断后续事件处理 |
| 幂等 | 已是 `disarmed` 时不再写（不刷屏）；同一 reason 反复触发不产生多条 |
| 边界 | 写台账失败 → 只 `logger.warn`，**不冒泡**（不把留痕失败升级成驱动失败） |

## UC-3 · 存量 disarmed 需求（本次范围外，行为不变） serves: FR-1

| 项 | 内容 |
|----|------|
| 触发 | 打开一个在修复前就被误 disarm 的需求（如 REQ-260930230225-71be） |
| 本次行为 | **不变**：`isDrivableRequirement()` 为假 → 驱动静默跳过；仍由人工消息（如「继续」）驱动推进 |
| 为什么不改 | re-arm 的入口与时机（看板按钮 / `reqboard_clear_pause` 语义扩展 / 确认门自动 re-arm）是**第二个未定决策**，需人工裁定；本次按轻档纪律显式排除，避免悄悄扩范围 |
| 补救路径（现在就能用） | 人工发一条消息即恢复该阶段推进；或重建需求；或在看板/工具层后续另立需求实现 re-arm |
| 诚实边界 | 修复**不承诺**存量需求自动复活；验收材料必须写明这一点，不得把"修好了"读成"历史停摆都好了" |

## 端到端走查（人工，对应 T7） serves: FR-1, FR-2

1. 立项一个新需求（弹框作答即 `armed`），或确认本需求自身走完拆分 → 进入 `implementing`；
2. 在弹框/看板确认一个人工门（产物确认或计划批准）；
3. **不要发任何消息**，观察会话 30 秒；
4. 期望：会话自动出现一轮（回合消息文本以「继续执行需求 …（Dive 模式自动续跑，第 N 回合）」开头）；
5. 若未自动起轮：读台账 `dive.activation` 与 `roundsInStage`，并按 data-model.md 的只读判据定位（是否被误 disarm、是否有 comment 说明 reason）——**失败要响亮，不得静默判定通过**。
