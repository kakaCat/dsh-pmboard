# REQ-261001201200-8f8b 修复节点确认后不唤醒 agent：AgentDeliverer 缺 idFactory 致 Dive 唤醒链断裂

> 档位：轻档（单点装配根因 + 单点修复；无第二个未定决策）· 类型：feature（实为缺陷修复，按立项弹框作答归档）
>
> 升级触发（单向，出现即停手改重档）：出现第二个独立决策 / 要动架构 / 要改数据模型。

## TL;DR

**现象**：人机闸门确认（会话弹框点「通过」、或看板「推进节点」）之后，需求状态照常推进，但**会话不再被唤醒**；用户不敲一句「继续」，流水线就停在原地。台账与看板都显示已推进，没有任何面向人的报错——典型静默停摆。

**这不是弹框工具的缺陷**：弹框照常收集人的裁决、照常落章与推进（台账可见）。断的是「确认之后把 agent 叫起来」这条**唤醒链**。

```
人工门确认（通过）
   └─► 闸门后置链 H1→H5
         └─► H4「唤醒」= 硬编码 skip（code=dive_handles_resume）        ← 唤醒唯一托管给 Dive
               └─► Dive 回合驱动器 drive()
                     └─► delivery.createRoundMessage(...)
                           └─► ✗ TypeError: this.idFactory is not a function
                                 （组合根把 {plugin} 传进了 idFactory 位，少传一个参数）
                                 └─► requestDrive 捕获 → disarm(state, driver-failed)
                                       └─► 台账 dive.activation = disarmed
                                             └─► 此后 requirement-moved / idle 拍 / 催办
                                                 全部在 isDrivableRequirement() 静默 return
```

**修法**：组合根按类签名三参构造 AgentDeliverer（补真实 id 工厂）；加「组合根形状 = 类签名」的守卫测试；disarm 从只写进程日志升级为写台账留痕（停摆可见）；并为**已被误 disarm 的存量需求**给出恢复路径。

## 判定标准（可证伪，全部可跑）

| 断言 | 量法（命令 / 观察点） | 通过条件（括号内为修前实测值） |
|------|----------------------|--------------------------------|
| A1 组合根形状守卫 | 新增 tests/dive-wake-wiring.test.ts（真实 createCaptureRuntime 产出的投递器 + 真实 round driver，驱动一次）→ npx vitest run tests/dive-wake-wiring.test.ts | 绿：inbox 收到 **1 条** source.kind=dive 消息（修前必红：抛 this.idFactory is not a function） |
| A2 投递器单测 | npx vitest run tests/agent-deliverer.test.ts | 9/9 绿（**修前 9 failed**，报错全为 this.idFactory is not a function） |
| A3 类型错误归零 | npx tsc --noEmit -p tsconfig.json，过滤 pm-capture-root | 无输出（**修前实测** src/wiring/pm-capture-root.ts(56,21): error TS2554: Expected 3 arguments, but got 2.） |
| A4 不再被误 disarm | 对 armed 需求触发一次驱动后读台账 | dive.roundsInStage ≥ 1 且 dive.activation 仍为 armed（修前：首次驱动即 disarmed、roundsInStage 恒 0） |
| A5 端到端不敲字 | 确认一个人工门后**不发任何消息**，观察会话 | 出现 source.kind=dive 的用户消息并起一轮；~/.dsh/sessions 中该来源命中数由 **0** 变 ≥1 |
| A6 disarm 可见 | 触发任一 disarm 路径（如投递失败）后读台账 | 需求上出现含 reason 的 comment（修前只有 logger.warn，台账无痕） |
| A7 恢复路径可用 | 对一个历史 disarmed 需求执行恢复入口，再触发一次驱动 | 该需求重新起轮（inbox 收到 dive 回合消息）；且**人主动暂停**的需求不被自动覆盖 |

## 产品定义

「Dive 自动续跑」是本插件流水线的驱动引擎：需求在 brainstorming → design → decomposing → implementing → accepting 之间前进时，**每一次阶段切换或人工门确认后，都要有人把 agent 从「停下等人」叫起来**。插件把这件事**唯一**托管给 Dive 回合驱动器（唯一驱动点 agent/status 为 idle，事件源 reqboard/requirement-moved），并规定只有 dive.activation 为 armed 且 phase 为 active 的需求允许起轮。

唤醒链的职责划分与实际状态：

| 部件 | 职责 | 现状 |
|------|------|------|
| 闸门后置链 H4 | 历史唤醒实现 | 已改为硬编码 skip，明确把唤醒托管给 Dive（h4-resume.ts） |
| pending-confirm.wake() | 历史「作答后唤醒」 | 已改为空实现（注释「deliver 已删除」），text 成死代码 |
| 投递白名单（组合根） | 规定「非 armed+active 绝不投递会话」 | 生效中 |
| Dive 回合驱动器 drive() | **唯一**真正起轮：构造回合消息 → 投递 → 预留/准入 | 逻辑正确，但**第一步构造消息就抛错** |
| 投递器 AgentDeliverer | createRoundMessage（构造）/ deliverMessage（投递） | 类签名三参 (resolveAgents, idFactory, plugin)，装配点仍按旧 options 形态调用 |

链路断在最后一格与装配点的接缝上——**单点错位**，后果是整条自动流水线停摆；而 disarm 只在 logger.warn 留痕，台账不记录、看板不显示，用户只能看到「它不动了」。

**影响面**：不是个别需求、个别阶段，而是**每一个需求、每一次人工门确认**。实测证据（本机台账 ~/.dsh/dsh-reqboard.json，21 条需求）：

- dive.roundsInStage 大于 0 的需求：**0 条**——从未有任何一个 Dive 回合被准入；
- ~/.dsh/sessions 全量搜索 source.kind 为 dive：**0 条**——Dive 自动续跑事实上从未生效过一次；
- 13 条 disarmed、3 条 dive 缺失、5 条 armed（只是尚未被驱动过，一旦驱动即被误 disarm）。

## 用户与角色

- **会话里的用户（需求方）**：期望「点通过 ＝ 流水线继续」。现在必须在每个阶段手工敲一句「继续」，且得不到任何「为什么需要我敲」的解释——本次立项的直接来源。
- **实施 agent**：回合边界由人喂消息决定，而不是由闸门事件决定；每个阶段都重复「卡住 → 等人 → 被叫起来」。
- **插件维护者**：需要一个防漂移守卫。类签名从 options 形态改成三参位置参数时，装配点与旧测试都没跟上；tsc 本可报错（TS2554），但仓库既有大量类型错误 + 构建走 tsdown（不做类型检查），这条信号被淹没。
- **看板使用者**：需要「为什么停了」可见——现在停摆只在进程日志里，看板显示正常。

## 功能点

- **FR-1: 修正投递器装配（唯一根因）**——src/wiring/pm-capture-root.ts 的 createCaptureRuntime 按类签名三参构造 AgentDeliverer：idFactory 传真实消息 id 工厂（经 deps 注入以便测试固定），plugin 传本插件名；投递语义（三态返回、永不抛）保持不变。
- **FR-2: 锁住「组合根形状 = 类签名」**——新增 tests/dive-wake-wiring.test.ts（真实组合根 + 真实 round driver，一次驱动即起轮，修前必红）；并把 tests/agent-deliverer.test.ts 从已删除的 deliver() 旧 API 迁到 createRoundMessage / deliverMessage。
- **FR-3: disarm 不再静默**——round-driver 的 disarm() 在 logger.warn 之外，向需求写一条含 reason 的 comment（形如 [Dive] 已解除武装（手动模式）：原因），使「自动链停摆」在看板与台账可见。
- **FR-4: 存量的误 disarm 可恢复**——为已 disarmed 的需求提供明确的恢复入口（重新武装 → 下一次驱动即起轮）；同时**人主动暂停**（reqboard_clear_pause）不得被自动恢复覆盖。恢复入口的具体机制在 design 阶段收敛为一个方案。

## 接口与契约

- **AgentDeliverer 构造契约（本次唯一改动面）**：constructor(resolveAgents, idFactory: () => string, plugin: string)。idFactory 必须可调用且稳定产出非空字符串；createRoundMessage 抛出即视为装配错误（由 FR-2 的守卫测试兜住）。
- **CaptureRuntimeDeps（组合根入参）**：新增 idFactory?: () => string（可选，缺省回落到插件现有 id 工厂），plugin 语义不变。调用方 src/index.ts 处已有 new RandomIdFactory()，可直接取其 comment() 或新增 message()。
- **deliverMessage 返回形状不变**：{ delivered: boolean; reason?: string }，永不抛。
- **台账（RequirementRecord）**：**不改数据模型**；FR-3 只往既有 comments 数组追加一条（沿用既有 comment 形状）；FR-4 只改 dive.activation 的取值时机，不增字段。

## 迁移与兼容

- **行为兼容**：createRoundMessage / deliverMessage 的对外形状零变化；未装配 idFactory 时回落既有工厂，调用方不需要改。
- **旧测试**：tests/agent-deliverer.test.ts 引用的 deliver() 已在「全面 Dive 化」中删除，本需求一并迁移（修前 9 failed，属既有红）。
- **旧数据**：台账无需迁移。存量 disarmed 需求由 FR-4 的恢复入口处理，**不做**一次性批量重写（避免把「人主动暂停」的需求误武装）。
- **回滚**：改动集中在 1 个装配点 + 1 个适配器构造 + 1 个 disarm 分支，回滚即还原这三处，无数据副作用。

## 边界

**做**：

1. 装配修正：src/wiring/pm-capture-root.ts（三参构造 + CaptureRuntimeDeps 增可选 id 工厂）；必要时在 src/adapters/AgentDeliverer.ts 补 id 工厂缺省兜底（不改变「永不抛 / 三态返回」契约）。
2. 测试：tests/agent-deliverer.test.ts 迁移到新 API；新增 tests/dive-wake-wiring.test.ts 作为组合根形状守卫。
3. disarm 留痕：src/application/dive/round-driver.ts 的 disarm() 增写台账 comment（含 reason）。
4. 恢复路径：给已 disarmed 需求一个明确入口重新武装（FR-4）。

**不做**：

1. **不改「H4 为 skip、唤醒托管给 Dive」的架构决断**——唤醒仍由 Dive 唯一托管，本次只把断掉的投递接回来。
2. **不改回合语义**（预留 / 准入 / 上限 / idle 驱动点 / 投递白名单）与台账 schema。
3. **不做存量需求的批量自动重新武装**——恢复只走显式入口；「人主动暂停」优先级高于自动续跑。

## 证据（本次实测）

1. **复现**（tsx 直连真实源码）：走组合根构造的投递器 → createRoundMessage 抛 this.idFactory is not a function；同输入改三参构造 → 正常产出 messageId，deliverMessage 返回 delivered 为 true。
2. **类型检查**：tsc --noEmit 直报 src/wiring/pm-capture-root.ts(56,21): error TS2554: Expected 3 arguments, but got 2.
3. **既有测试**：npx vitest run tests/agent-deliverer.test.ts → **9 failed / 9**，报错全为 this.idFactory is not a function（同时暴露第二重契约不一致：测试与组合根都按 options 形态调用，类已改为三参位置参数）。
4. **台账**：21 条需求中 roundsInStage 大于 0 的 **0 条**；13 disarmed / 3 dive 缺失 / 5 armed。
5. **会话**：~/.dsh/sessions 中 source.kind 为 dive 的消息 **0 条**。
6. **历史**：同缺陷的前一次立项 REQ-260930231831-a8fa 仍停在 implementing，4 张卡 t-dfaada / t-220e7a / t-38e435 / t-1cb840 全部 todo——它正是被自己描述的这个 bug 卡死的。本需求与该需求**同源**，实施时需人工裁定是复用它还是以本需求为准（避免两份修复同时落地）。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1、t2、t5 |
| FR-2 | ✅ 已接收 | t2、t5 |
| FR-3 | ✅ 已接收 | t5、t3 |
| FR-4 | ✅ 已接收 | t5、t4 |

> 无未接收条款（4 条全部有落点）。

<!-- reqboard:marks:end -->
