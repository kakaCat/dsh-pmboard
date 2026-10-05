# REQ-260930231831-a8fa 测试策略 · 六条断言怎么跑、看到什么算过 serves: FR-1, FR-2, FR-3

> 原则：**修前必红、修后必绿**。A1/A3/A6 三条在修复前就有确定的失败读法（否则它们不是证据）。

## TL;DR serves: FR-1, FR-2, FR-3

| 层级 | 文件 | 覆盖断言 | 角色 |
|------|------|----------|------|
| 单测（契约） | `tests/dive-wake-wiring.test.ts`（新增） | A1 | 主证据：装配点与签名一致，能真正投出回合消息 |
| 单测（适配器） | `tests/agent-deliverer.test.ts`（迁移） | A2 | 投递三态与消息形状不回归 |
| 单测（驱动器） | `tests/dive-round-driver.test.ts`（复用） | A4、A6 | 起轮/准入不再被误 disarm；disarm 留痕 |
| 静态检查 | `tsc --noEmit -p tsconfig.json` | A3 | 编译期信号：装配点参数个数 |
| E2E（人工复核） | 真实会话 | A5 | 门确认后不敲字即自动起轮 |

> 新增/修改的测试文件**头部前 20 行必须带 `serves: FR-x`**（本仓孤儿测试门禁按此判定），
> 否则拆分阶段会以 `orphan test file` 记红。

## 用例矩阵 serves: FR-1, FR-2, FR-3

| 用例 | 层级 | 文件 | 触发 | 断言 | 命令 | 期望 |
|------|------|------|------|------|------|------|
| T1 组合根能构造回合消息 | 单测 | `tests/dive-wake-wiring.test.ts` | `createCaptureRuntime({plugin,getAgents})` → `deliverer.createRoundMessage({...})` | 不抛；`messageId === message.id`；`source.kind === 'dive'` | `npx vitest run tests/dive-wake-wiring.test.ts` | 通过（**修前：抛 `TypeError: … is not a function`**） |
| T2 一次驱动即起轮 | 单测 | 同上 | 真实投递器 + 真实 `createDiveRoundDriver`，armed 需求 + idle agent → `requestDrive` | inbox 收到 1 条 `kind='dive'` 消息；台账 `activation` 仍为 `armed` | 同上 | 通过（**修前：inbox 0 条 + 台账被写成 `disarmed`**） |
| T3 投递三态不回归 | 单测 | `tests/agent-deliverer.test.ts` | 在线 / 离线 / 无 followup / `get` 抛错 四态 | `delivered` 与 `reason` 符合契约，且**永不抛** | `npx vitest run tests/agent-deliverer.test.ts` | 全绿 |
| T4 无谓 disarm 消失 | 单测 | `tests/dive-round-driver.test.ts` | armed 需求正常投递路径 | 台账不出现 `dive-disarm` 写；`roundsInStage` 随准入 +1 | `npx vitest run tests/dive-round-driver.test.ts` | 全绿 |
| T5 disarm 留痕 | 单测 | `tests/dive-round-driver.test.ts` | 构造投递失败（`deliverMessage` 返回 `delivered:false`） | 需求上出现含 `driver-failed`/`queue-failed` 的 system comment；`activation='disarmed'` | 同上 | 通过（**修前：只有 logger.warn，无 comment**） |
| T6 编译期信号 | 静态 | — | 类型检查 | `pm-capture-root.ts` 无 `TS2554` | `tsc --noEmit -p tsconfig.json \| grep pm-capture-root` | 无输出（**修前：1 行命中**） |
| T7 门确认后不敲字 | E2E（人工） | 真实会话 | 对 armed 需求确认一个人工门，**不发任何消息** | 30s 内自动起一轮：会话日志出现 `source.kind='dive'` 的 user 消息 | 看板点确认 → 观察会话 | 自动起轮（修前：必须人工敲「继续」） |

## 命令与期望输出 serves: FR-2

```bash
# 主证据（契约 + 起轮）
npx vitest run tests/dive-wake-wiring.test.ts
# 期望：Test Files  1 passed (1) / Tests  2 passed (2)

# 适配器与驱动器不回归
npx vitest run tests/agent-deliverer.test.ts tests/dive-round-driver.test.ts
# 期望：全绿；无新增 skip

# 编译期不再错位
tsc --noEmit -p tsconfig.json 2>&1 | grep pm-capture-root
# 期望：无输出（退出码 1 = grep 未命中，属通过）
```

## 断言与证据对应 serves: FR-1, FR-2, FR-3

| 需求文档断言 | 由谁证 | 证据形态 |
|--------------|--------|----------|
| A1 组合根形状守卫 | T1/T2 | vitest 输出 + 用例名 |
| A2 投递器单测迁移 | T3 | vitest 输出 |
| A3 类型错误消失 | T6 | grep 无命中的命令与输出 |
| A4 不再被误 disarm | T2/T4 | 台账断言（activation/roundsInStage） |
| A5 端到端不敲字 | T7 | 会话日志片段（`source.kind='dive'` 行）+ 时间戳 |
| A6 disarm 可见 | T5 | 台账 comment 原文 |

## 已知局限 serves: FR-3

| 项 | 说明 |
|----|------|
| A5 依赖真实会话 | 若不便复现（需要新 armed 需求 + 人工门），以 T2 的真实装配单测作为**等价证据**，并在验收材料里如实标注"E2E 未跑"。 |
| 存量 disarmed 不在本测试面内 | T1–T7 只证"不再被误 disarm"；存量恢复属"不做"边界，其行为（需人工消息）不构成本需求失败。 |
| 类型错误基线 | 仓库现有 212 个 tsc 错误：本需求只承诺 T6 无命中，不承诺降低总基线。 |
