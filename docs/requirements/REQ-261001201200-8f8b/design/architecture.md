# REQ-261001201200-8f8b 架构设计 · 唤醒链的装配修正与失效可见化 serves: FR-1, FR-2, FR-3, FR-4

> 范围：只改「构造投递器」「disarm 留痕」「误停摆恢复」三处接缝；回合语义（预留/准入/回合上限）、
> 唯一驱动点（agent/status 为 idle）、闸门后置链顺序一律不动。

## TL;DR serves: FR-1, FR-2, FR-3

唤醒链上有四个部件，本次只修最后一格的**构造入参**，并给停摆加一个可见信号：

```
  人工门确认
      │  (reqboard/requirement-moved)
      ▼
  闸门后置链 H1..H5 ── H4 = skip（唤醒托管给 Dive，保持不动）
      │
      ▼
  Dive round driver  drive()  ── 回合语义不动
      │
      ▼
  AgentDeliverer.createRoundMessage()  ← ✗ 修前：idFactory 位收到 {plugin} → TypeError
      │                                   修后：注入真实 id 工厂 → 正常构造
      ▼
  deliverMessage() → agent.followup() → 起轮
```

```
修前（静默停摆）                        修后（起轮 + 失败可见 + 可恢复）
─────────────────────────────           ──────────────────────────────────
drive() ─► TypeError ─► disarm           drive() ─► 构造 OK ─► followup ─► 起轮
                          │                                        │
                          └─ 只有 logger.warn                     └─ 失败才 disarm
                             (看板/台账均不可见)                       └─ + 台账 comment（FR-3）
                                                                      └─ 下次人推进时自动重新武装（FR-4）
```

## 组件与职责 serves: FR-1, FR-3, FR-4

| 组件 | 文件 | 本次动作 |
|------|------|----------|
| 组合根（捕获根） | src/wiring/pm-capture-root.ts | 按类签名三参构造投递器；CaptureRuntimeDeps 增可选 id 工厂（FR-1） |
| 投递器适配器 | src/adapters/AgentDeliverer.ts | 构造期把非函数的 idFactory 判为装配错误并响亮抛出；投递语义不变（FR-1） |
| 回合驱动器 | src/application/dive/round-driver.ts | disarm 增写台账 comment（FR-3）；onRequirementMoved 先做误停摆恢复再 requestDrive（FR-4） |
| 回合状态（纯函数） | src/application/dive/round-state.ts | 新增 isRecoverableDisarm 判别器（FR-4，零 IO） |
| 恢复入口 | src/application/internal/rearm.ts | 新增 rearmIfRecoverable（FR-4，唯一写入口） |
| 看板控制面 | src/http/routers/requirements.ts | autorun(on=true) 也走同一恢复入口（FR-4，显式表达「我要它继续」） |
| 组合根调用方 | src/index.ts | 显式传 idFactory（已有 RandomIdFactory 实例）（FR-1） |

## 改动点清单 serves: FR-1, FR-2, FR-3, FR-4

1. **FR-1**：`src/wiring/pm-capture-root.ts` 的 `createCaptureRuntime` 第 56 行由两参改三参；`CaptureRuntimeDeps` 增 `idFactory?: () => string`；`src/index.ts` 调用处显式传入。
2. **FR-2**：新增 `tests/dive-wake-wiring.test.ts`（真实组合根 + 真实 round driver，一次驱动即起轮，修前必红）；`tests/agent-deliverer.test.ts` 从已删除的 `deliver()` 迁到 `createRoundMessage` / `deliverMessage`。
3. **FR-3**：`round-driver.ts` 的 `disarm()` 增写一条需求 comment（非 teardown 路径才写；teardown 是正常收尾，不算停摆）。
4. **FR-4**：新增纯函数判别器 + 唯一恢复入口；在 `onRequirementMoved` 与看板 autorun(on) 两处调用。

## 数据流（修后一次人工门确认） serves: FR-1, FR-3, FR-4

```
人点确认（弹框或看板）
  → 落章 + 推进（既有逻辑不动）
  → store.mutate(requirement-moved)
  → ctx.emit(reqboard/requirement-moved)          ← index.ts 既有桥接
  → roundDriver.onRequirementMoved(requirementId)
       ├─ 若 isRecoverableDisarm(需求) → rearmIfRecoverable(…) 写回 armed + 留痕 comment   （FR-4）
       └─ requestDrive(state)
            → drive() → createRoundMessage()（修后不再抛）→ deliverMessage() → agent.followup()
                 └─ 失败 → disarm()（写台账 comment）                                        （FR-3）
```

## 为什么不改架构 serves: FR-1

- **H4 保持 skip**：唤醒仍由 Dive 唯一托管，本次不复活旧 followup 投递通道（避免两条唤醒路径打架）。
- **投递白名单不动**：非 armed+active 仍绝不投递会话；本次只是让 armed 的需求真的能投出去。
- **回合语义不动**：预留 / 准入 / 回合上限 / 唯一驱动点都不动，故障面因此被限制在「构造」这一格。

## 风险与边界 serves: FR-4

| 风险 | 判断 | 处置 |
|------|------|------|
| 自动恢复覆盖了人的有意停手 | 有意停手（clear_pause）会写 phase=idle；终态暂停写 phase=paused | 判别器只认 activation=disarmed 且 phase=active，二者天然排除 |
| 插件重启后（teardown 遗留 disarmed）被自动续跑 | 这是**期望行为**：重启不该永久打死自动链 | 明示为有意后果，并在设计里记录 |
| 恢复后立刻再次投递失败 → 反复 re-arm | disarm 与 requirement-moved 不同源，不构成自激循环 | 单次恢复只由一次 requirement-moved 触发；失败即停（不重试） |
| 存量 13 条 disarmed 需求不会一次性复活 | 恢复只在「下一次推进事件」发生 | 与需求边界一致（不做批量重写）；人在看板点「继续」可立即触发 |
