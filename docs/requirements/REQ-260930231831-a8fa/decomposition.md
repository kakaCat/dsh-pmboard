# REQ-260930231831-a8fa 拆分计划 · 装配接缝修正 + disarm 可见化 + 守卫测试 serves: FR-1, FR-2, FR-3

> 目标 + 做法：把「组合根构造投递器」这一处参数错位修正（本次唯一根因），让 armed 需求的
> 「人工门确认 → 自动起轮」恢复；把 `disarm` 从"只写进程日志"升级为"写台账 comment"，
> 让停摆可见；并用两条**修前必红**的守卫测试锁死"装配点 = 类签名"。
> 台账 schema、回合语义、H4 托管设计、看板/工具面一律不动。

```
改动面（3 源文件 + 2 测试文件，零 schema 变更）

  src/wiring/pm-capture-root.ts   ← 主修：三参构造 + 可注入 id 工厂
  src/adapters/AgentDeliverer.ts  ← 兜底：idFactory 非法/缺省时不抛构造期
  src/application/dive/round-driver.ts ← disarm() 增写一条 system comment
  tests/dive-wake-wiring.test.ts  ← 新增：T1 构造契约 + T2 一次驱动即起轮
  tests/agent-deliverer.test.ts   ← 迁移：deliver() → createRoundMessage/deliverMessage
  tests/dive-round-driver.test.ts ← 增：T5 disarm 留痕
```

## 1. 改动盘点 serves: FR-1, FR-2, FR-3

| 动作 | 路径 | 说明 |
|------|------|------|
| 修改 | `src/wiring/pm-capture-root.ts` | `createCaptureRuntime`：`new AgentDeliverer(deps.getAgents, deps.newMessageId ?? newCommentId, deps.plugin)`；`CaptureRuntimeDeps` 增可选 `newMessageId?: () => string` |
| 修改 | `src/adapters/AgentDeliverer.ts` | 构造期 idFactory 兜底（不可调用时回落到 `randomUUID()`），保证"构造即安全"，签名不变 |
| 修改 | `src/application/dive/round-driver.ts` | `disarm()` 在既有 `mutate('dive-disarm')` 内追加 `[Dive] 已解除武装（手动模式）：<reason>` 的 system comment；保持幂等与非抛 |
| 新增 | `tests/dive-wake-wiring.test.ts` | T1（构造不抛 + `messageId === message.id` + `source.kind='dive'`）、T2（真实驱动一次 → inbox 1 条、未被 disarm） |
| 修改 | `tests/agent-deliverer.test.ts` | 旧两参 + 已删除的 `deliver()` → 三参 + `createRoundMessage`/`deliverMessage` 四态 |
| 修改 | `tests/dive-round-driver.test.ts` | 新增 T5：投递失败 → disarm 且留痕；已 disarmed → 不重复写 |
| 删除 | — | 无（不删任何公开能力；`deliver()` 早已删除，本次只清理对它的残留引用） |

## 2. 任务表 serves: FR-1, FR-2, FR-3

| 计划 key | 任务标题 | phase | side | 依赖 | 摘要 |
|----------|----------|-------|------|------|------|
| t1 | 对齐投递器装配契约（组合根三参 + 可注入 id 工厂） | implement | backend | — | 修主因；新增 T1 守卫测试 |
| t2 | 投递契约与"一次驱动即起轮"回归测试 | test | backend | t1 | 迁移旧单测 + T2 用例 |
| t3 | disarm 写台账留痕（停摆可见） | implement | backend | — | round-driver 留痕 + T5 用例 |
| t4 | 迁移说明与端到端验证 | test | backend | t1, t2, t3 | 跑全套命令、留证据、E2E 复核 |

**批次**：批次 1 = t1、t3（互不依赖，可并行）→ 批次 2 = t2 → 批次 3 = t4。

## 3. 覆盖对照表 serves: FR-1, FR-2, FR-3

| 需求条款 | 接收任务 | 落点说明 |
|----------|----------|----------|
| FR-1 | t1、t4 | 装配三参化 + 端到端确认唤醒真的恢复 |
| FR-2 | t1、t2 | T1 守卫断言 + 旧单测迁移（形状一致性） |
| FR-3 | t3、t4 | disarm 写 comment + 验证材料里给出可见性证据 |

> 三条条款均有落点，无「本轮不做」条款。

## 4. 卡内验收（可证伪） serves: FR-1, FR-2, FR-3

| 计划 key | 验收命令 | 通过条件 |
|----------|----------|----------|
| t1 | `npx vitest run tests/dive-wake-wiring.test.ts`；`tsc --noEmit -p tsconfig.json 2>&1 \| grep pm-capture-root` | T1 通过（构造不抛、id 同值）；grep 无输出（TS2554 消失） |
| t2 | `npx vitest run tests/agent-deliverer.test.ts tests/dive-wake-wiring.test.ts` | 全绿；T2 断言 inbox 恰 1 条 `kind='dive'` 且未写 `dive-disarm` |
| t3 | `npx vitest run tests/dive-round-driver.test.ts` | 全绿；新增用例断言 comment 前缀与 reason，且重复 disarm 不追加 |
| t4 | 三条 vitest 合并跑 + `git diff --stat` | 全绿；diff 仅含 3 源文件 + 2 测试文件（无 schema/客户端改动）；E2E 结果已记录 |

## 5. 验收与证据 serves: FR-1, FR-2, FR-3

| 需求断言 | 证据形态 | 由谁产出 |
|----------|----------|----------|
| A1 组合根形状守卫 | vitest 输出（用例名 + passed） | t1 / t2 |
| A2 投递器单测迁移 | vitest 输出 | t2 |
| A3 类型错误消失 | `grep pm-capture-root` 无输出的命令与退出码 | t1 |
| A4 不再被误 disarm | 台账断言：`activation='armed'` 且 `roundsInStage ≥ 1` | t2 |
| A5 端到端不敲字 | 会话日志片段（`source.kind='dive'` 行 + 时间戳）；不便复现则如实标注"未跑" | t4 |
| A6 disarm 可见 | 台账 comment 原文 | t3 / t4 |

## 6. 边界与不变量（本次不做） serves: FR-1, FR-3

| 项 | 约定 |
|----|------|
| 存量 disarmed 需求的自动恢复 | **不做**（re-arm 入口/时机是第二个未定决策）；行为不变：仍需人工消息驱动 |
| 回合语义 | 不改文案、预留/准入纪律、回合上限、两个驱动点 |
| 唤醒托管 | 不恢复 H4 投递、不恢复已删除的 `deliver()`/`wake()` |
| schema | 不新增/不改台账字段，不做数据回填；回滚 = revert 单提交 |

## 7. 总览 serves: FR-1, FR-2, FR-3

| 项 | 内容 |
|----|------|
| 卡数 | 4（2 实现 + 2 测试/验证），批次 1/2/3 |
| 主修点 | `src/wiring/pm-capture-root.ts` 的 `new AgentDeliverer(...)` |
| 可见化 | `disarm()` 追加 system comment |
| 守卫 | T1/T2 修前必红（构造抛错 / inbox 0 条 + 被 disarm） |
| 零变更 | schema、客户端、工具面、H4 |

## 下一步

implementing —— 用 `reqboard_ask_confirm(target=plan)` 请人批准；未获批准不得落库任务卡。
