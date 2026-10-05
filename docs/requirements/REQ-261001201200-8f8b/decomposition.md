# REQ-261001201200-8f8b 拆分计划 · 装配接缝修正 + disarm 可见化 + 误停摆恢复 + 守卫测试 serves: FR-1, FR-2, FR-3, FR-4

> 目标 + 做法：把「组合根构造投递器」这一处参数错位修正（本次唯一根因），让 armed 需求的
> 「人工门确认 → 自动起轮」恢复；把 disarm 从「只写进程日志」升级为「写台账 comment」，让停摆可见；
> 再给已误停摆的存量需求一条恢复路径（判别器 + 唯一恢复入口）。
> 台账 schema、回合语义、H4 托管设计、投递白名单、看板与工具面一律不动。

```
改动面（4 源文件 + 4 测试文件，零 schema 变更，不新增工具）

  src/wiring/pm-capture-root.ts          ← 主修：三参构造 + 可注入 id 工厂
  src/adapters/AgentDeliverer.ts         ← 构造期校验：idFactory 非函数即响亮抛出
  src/application/dive/round-driver.ts   ← disarm() 留痕 + onRequirementMoved 恢复检查
  src/application/dive/round-state.ts    ← 新增 isRecoverableDisarm（纯函数）
  src/application/internal/rearm.ts      ← 新增 rearmIfRecoverable（唯一恢复写入口）
  src/http/routers/requirements.ts       ← autorun(on=true) 也走恢复入口
  tests/dive-wake-wiring.test.ts         ← 新增：装配形状守卫（修前必红）
  tests/dive-rearm.test.ts               ← 新增：恢复入口与负例
  tests/agent-deliverer.test.ts          ← 迁移：deliver() → createRoundMessage/deliverMessage
  tests/dive-round-state.test.ts         ← 增：判别器真值表
```

## 1. 改动盘点 serves: FR-1, FR-2, FR-3, FR-4

| 动作 | 路径 | 说明 |
|------|------|------|
| 修改 | `src/wiring/pm-capture-root.ts` | `createCaptureRuntime` 的三参构造 `new AgentDeliverer(deps.getAgents, idFactory, deps.plugin)`；`CaptureRuntimeDeps` 增可选 `idFactory?: () => string`（缺省 `newCommentId()`） |
| 修改 | `src/adapters/AgentDeliverer.ts` | 构造期校验：`idFactory` 传了但不是函数 → 立即抛 TypeError（装配错误暴露在启动期）；`deliverMessage` 的三态返回与永不抛契约不变 |
| 修改 | `src/index.ts` | 调用 `createCaptureRuntime` 处显式传入 id 工厂（已有 `new RandomIdFactory()` 实例） |
| 新增 | `src/application/dive/round-state.ts` | `isRecoverableDisarm(req)`：`disarmed 且 phase=active` 为真；纯函数、零 IO |
| 新增 | `src/application/internal/rearm.ts` | `rearmIfRecoverable(deps, requirementId, trigger)`：条件写回 `armed` + `lastActiveAt` + `version+1` + 一条恢复 comment；返回是否真的恢复；幂等 |
| 修改 | `src/application/dive/round-driver.ts` | ① `disarm()` 追加 system comment（`reason=teardown` 不写）；② `onRequirementMoved` 先做恢复检查再 `requestDrive` |
| 修改 | `src/http/routers/requirements.ts` | `POST /req/autorun` 且 `on=true` 时调用同一恢复入口（显式表达「我要它继续」）；返回体形状不变 |
| 新增 | `tests/dive-wake-wiring.test.ts` | 装配形状守卫：真实 `createCaptureRuntime` + 真实 round driver，一次驱动即起轮（修前必红） |
| 新增 | `tests/dive-rearm.test.ts` | 恢复入口正例与负例（`disarmed/idle`、`paused` 不被覆盖） |
| 修改 | `tests/agent-deliverer.test.ts` | 旧两参 + 已删除的 `deliver()` → 新 API 四态断言 |
| 修改 | `tests/dive-round-state.test.ts` | 判别器真值表 |
| 删除 | — | 无（不删任何公开能力） |

## 2. 任务表 serves: FR-1, FR-2, FR-3, FR-4

| 计划 key | 任务标题 | phase | side | 依赖 | 摘要 |
|----------|----------|-------|------|------|------|
| t1 | 对齐投递器装配契约（组合根三参 + 可注入 id 工厂） | implement | backend | — | 主修点；契约先行 |
| t2 | 装配形状守卫与投递契约单测（修前必红 → 修后全绿） | test | backend | t1 | 锁死「装配点 = 类签名」 |
| t3 | disarm 写台账留痕（停摆可见） | implement | backend | t1 | round-driver 留痕（teardown 除外） |
| t4 | 误停摆恢复（判别器 + 恢复入口 + 两个调用点） | implement | backend | t1 | 存量 disarmed/active 可恢复，且不覆盖人的主动暂停 |
| t5 | 迁移兼容与端到端验证（回归基线 + 回滚说明） | test | backend | t2, t3, t4 | 跑全套命令、留证据、E2E 复核 |

**批次**：批次 1 = t1 → 批次 2 = t2、t3、t4（互不依赖，可并行）→ 批次 3 = t5。

## 3. 覆盖对照表 serves: FR-1, FR-2, FR-3, FR-4

| 需求条款 | 接收任务 | 落点说明 |
|----------|----------|----------|
| FR-1 修正投递器装配 | t1、t2、t5 | 三参构造 + 缺省 id 工厂 + 构造期校验；守卫测试与端到端确认唤醒真的恢复 |
| FR-2 锁住组合根形状 = 类签名 | t2、t5 | 新增必红守卫 + 旧单测迁移 + 回归基线比对 |
| FR-3 disarm 不再静默 | t3、t5 | round-driver 写 system comment（teardown 除外）+ 验收材料给出台账原文 |
| FR-4 存量误停摆可恢复 | t4、t5 | 判别器 + 唯一恢复入口 + 两个调用点；负例保证人的主动暂停不被覆盖 |

> 四条条款均有落点，无「本轮不做」条款。

## 4. 卡内验收（可证伪） serves: FR-1, FR-2, FR-3, FR-4

| 计划 key | 验收命令 | 通过条件 |
|----------|----------|----------|
| t1 | `npx tsc --noEmit -p tsconfig.json 2>&1` 后过滤 `pm-capture-root`；再用 tsx 直接调 `createCaptureRuntime` 产出的 deliverer 调 `createRoundMessage` | 过滤结果为空（TS2554 消失）；`createRoundMessage` 返回非空 `messageId`；第二参传非函数时构造期抛 TypeError |
| t2 | `npx vitest run tests/dive-wake-wiring.test.ts tests/agent-deliverer.test.ts` | 全绿（修前：9 failed，报错全为 `this.idFactory is not a function`）；断言 inbox 恰 1 条 `source.kind=dive` 且未被 disarm |
| t3 | `npx vitest run tests/dive-round-driver.test.ts` | 全绿；新增用例断言 comment 前缀 `[Dive] 已解除武装（手动模式）：` 与 reason；`teardown` 路径不写；重复 disarm 不追加 |
| t4 | `npx vitest run tests/dive-round-state.test.ts tests/dive-rearm.test.ts` | 全绿；真值表 5 行逐行通过；集成用例：`onRequirementMoved` 后台账 `activation=armed` 且 inbox 收到 dive 消息；`disarmed/idle` 与 `paused` 零写入 |
| t5 | `pnpm build`；`npx vitest run`；`git diff --stat` | `pnpm build` 退出码 0；全套失败数不高于基线 106 failed / 2807 passed；diff 只含本计划列举的文件（无 schema、无客户端改动）；E2E 结果（会话出现 `source.kind=dive`、台账 `roundsInStage` 由 0 增长）已记录 |

## 5. 验收与证据 serves: FR-1, FR-2, FR-3, FR-4

| 需求断言 | 证据形态 | 由谁产出 |
|----------|----------|----------|
| A1 组合根形状守卫 | vitest 输出（用例名 + passed） | t2 |
| A2 投递器单测迁移 | vitest 输出（9 passed） | t2 |
| A3 类型错误归零 | tsc 过滤结果的命令与空输出 | t1 |
| A4 不再被误 disarm | 台账断言：`activation=armed` 且 `roundsInStage ≥ 1` | t2、t5 |
| A5 端到端不敲字 | 会话中 `source.kind=dive` 的消息行 + 时间戳；`~/.dsh/sessions` 命中数由 0 变大于 0 | t5 |
| A6 disarm 可见 | 台账 comment 原文 | t3、t5 |
| A7 恢复路径可用 | 对一条 `disarmed/active` 需求触发恢复后 `roundsInStage` 开始增长；`disarmed/idle` 不被覆盖 | t4、t5 |

## 6. 边界与不变量（本次不做） serves: FR-1, FR-4

| 项 | 约定 |
|----|------|
| H4 唤醒托管 | 不恢复 H4 投递、不恢复已删除的 `deliver()` 与 `wake()`；唤醒仍由 Dive 唯一托管 |
| 回合语义 | 不改预留、准入、回合上限、驱动点与投递白名单 |
| schema 与迁移 | 不新增或修改台账字段，不做数据回填；存量 disarmed 需求不做批量重写 |
| 人的主动暂停 | `phase=idle`（clear_pause）与 `phase=paused`（回合上限/aborted）永不被自动恢复覆盖 |
| 回滚 | revert 三个源文件改动即可；无数据迁移，回滚后行为与修前逐字一致 |

## 7. 总览 serves: FR-1, FR-2, FR-3, FR-4

| 项 | 内容 |
|----|------|
| 卡数 | 5（3 实现 + 2 测试/验证），批次 1/2/3 |
| 主修点 | `src/wiring/pm-capture-root.ts` 的 `new AgentDeliverer(...)` 少传一参 |
| 可见化 | `disarm()` 追加 system comment |
| 可恢复 | `isRecoverableDisarm` + `rearmIfRecoverable` + 两个调用点 |
| 守卫 | T1 装配形状守卫修前必红（构造抛错） |
| 零变更 | schema、客户端、工具面、H4 托管设计 |

## 下一步

implementing —— 用 `reqboard_ask_confirm(target=plan)` 请人批准；未获批准不得落库任务卡。
