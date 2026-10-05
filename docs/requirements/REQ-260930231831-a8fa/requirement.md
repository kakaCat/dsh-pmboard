# REQ-260930231831-a8fa 修复 Dive 唤醒链：AgentDeliverer 构造参数错位致闸门确认后不自动续跑

> 档位：轻档（单点根因 + 单点修复，无第二个未定决策）· 类型：feature（实为缺陷修复，按立项弹框作答归档）

## TL;DR

**现象**：在设计→拆分等人机闸门点「通过」之后，会话不再被自动唤醒；用户不敲一句「继续」，流水线就停在原地。看板与台账都显示"已推进"，日志里没有面向人的报错——典型的静默停摆。

**根因**：确认后的唤醒只有一条路，而这条路断在装配处。

```
人工门确认（通过）
   └─► 闸门后置链 H1→H5
         └─► H4「唤醒」= 硬编码 skip（code=dive_handles_resume）  ← 唤醒托管给 Dive
               └─► Dive 回合驱动器 drive()
                     └─► delivery.createRoundMessage(...)
                           └─► ✗ TypeError: this.idFactory is not a function
                                 （组合根把 {plugin} 传进了 idFactory 位）
                                 └─► requestDrive 捕获 → disarm(state,'driver-failed')
                                       └─► dive.activation = 'disarmed'
                                             └─► 之后 requirement-moved / idle / 催办
                                                 全部在 isDrivableRequirement() 静默 return
```

**修法**：把组合根的构造改回与类签名一致（补真实 id 工厂）；加一条"组合根形状 = 类签名"的测试防再次漂移；让 disarm 不再静默（写台账 comment）。

## 判定标准（可证伪）

| 断言 | 量法（命令 / 观察点） | 通过条件 |
|------|----------------------|----------|
| A1 组合根形状守卫 | 新增 `tests/dive-wake-wiring.test.ts`：用真实 `createCaptureRuntime` + 真实 round driver 驱动一次 | `requestDrive` 后 agent inbox 收到 **1 条** `source.kind='dive'` 消息（修前为 0 条且抛错 → 该测试修前必红） |
| A2 投递器单测迁移 | `npx vitest run tests/agent-deliverer.test.ts` | 全绿（迁到 `createRoundMessage`/`deliverMessage` 新 API） |
| A3 类型错误消失 | `tsc --noEmit -p tsconfig.json \| grep pm-capture-root` | 无 `TS2554: Expected 3 arguments, but got 2`（修前命中 1 行） |
| A4 不再被误 disarm | 对一个 armed 需求触发一次驱动，随后读台账 | `dive.roundsInStage ≥ 1`（准入计数）且 `dive.activation` 仍为 `armed` |
| A5 端到端不敲字 | armed 需求确认一个人工门后**不发任何消息**，观察会话日志 30s | 出现 `source.kind='dive'` 的 user 消息并起一轮（修前必须人工敲「继续」） |
| A6 disarm 可见 | 人为构造任一 disarm 路径（如投递失败）后读台账 | 需求上有一条含 reason 的 comment（修前只有 `logger.warn`） |

## 产品定义

"Dive 自动续跑"是本插件流水线的驱动引擎：需求在 `brainstorming → design → decomposing → implementing → accepting` 之间前进时，**每一次阶段切换或人工门确认后，都需要有人把 agent 从"停下等人"叫起来**。插件把这件事交给 Dive 回合驱动器（唯一驱动点：`agent/status === 'idle'`；事件源：`reqboard/requirement-moved`），并规定只有 `dive.activation === 'armed' && phase === 'active'` 的需求允许起轮。

因此「确认之后能不能自动继续」这件事，实际由三个部件共同保证：

| 部件 | 职责 | 现状 |
|------|------|------|
| 闸门后置链 H4 | 历史唤醒实现 | 已改为硬编码 skip，明确把唤醒托管给 Dive |
| Dive 回合驱动器 `drive()` | 真正起轮：构造回合消息 → 投递 → 预留/准入 | 逻辑正确，但**第一步构造消息就抛错** |
| 投递器 `AgentDeliverer` | `createRoundMessage`（构造）/ `deliverMessage`（投递） | 类签名 `(resolveAgents, idFactory, plugin)`，装配点仍按旧 options 对象调用 |

链路断在第三格与装配点的接缝上——单点错位，后果是整条自动流水线停摆；而 `disarm` 只在 `logger.warn` 里留痕，看板不显示、台账不记录，用户只能看到"它不动了"。

## 用户与角色

- **会话里的用户（需求方）**：期望「点通过＝流水线继续」。现在必须在每个阶段手工敲一句「继续」，且得不到任何"为什么需要我敲"的解释——这是本次立项的直接来源。
- **实施 agent**：回合边界由人喂消息决定，而不是由闸门事件决定；每个阶段都要重复"卡住 → 等人 → 被叫起来"。
- **插件维护者**：需要一个防漂移的守卫。类签名从 `(resolveAgents, options)` 改成三参位置参数时，装配点与旧测试都没跟上；`tsc` 本可报错，但仓库现有 212 个类型错误、构建走 tsdown（不做类型检查），这条信号被淹没。

## 功能点

- **FR-1: 修正投递器装配（唯一根因）**——`src/wiring/pm-capture-root.ts` 的 `createCaptureRuntime` 按类签名三参构造 `AgentDeliverer`：`idFactory` 传真实消息 id 工厂（`newCommentId()` 或经 deps 注入以便测试固定），`plugin` 传本插件名；投递语义（三态判定、永不抛）保持不变
- **FR-2: 锁住"组合根形状 = 类签名"**——新增 `tests/dive-wake-wiring.test.ts`：以真实 `createCaptureRuntime` 产出的投递器接入真实 round driver，断言一次驱动后 inbox 收到 1 条回合消息；同时把 `tests/agent-deliverer.test.ts` 从已删除的 `deliver()` 旧 API 迁到 `createRoundMessage` / `deliverMessage`
- **FR-3: disarm 不再静默**——round-driver 的 `disarm()` 在 `logger.warn` 之外，向需求写一条含 reason 的 comment（`[Dive] 已解除武装（手动模式）：<reason>`），使"自动链停摆"在看板与台账可见，而不是只存在于进程日志里

## 边界

**做**：

1. 装配修正：`src/wiring/pm-capture-root.ts`（构造三参 + `createCaptureRuntime` 的 deps 增可选 id 工厂）；必要时在 `src/adapters/AgentDeliverer.ts` 补 idFactory 缺省兜底（不改变"永不抛/三态返回"契约）
2. 测试：`tests/agent-deliverer.test.ts` 迁移到新 API；新增 `tests/dive-wake-wiring.test.ts` 作为组合根形状守卫
3. disarm 留痕：`src/application/dive/round-driver.ts` 的 `disarm()` 增写台账 comment（含 reason）

**不做**：

1. **不改"存量已 disarmed 需求如何恢复自动续跑"的策略**——re-arm 的入口与时机（看板按钮 / clear_pause 语义扩展 / 确认门自动 re-arm）属新决策，本次明确不做，留待人工裁定或另立需求；本次只保证"不再被误 disarm"
2. 不改回合语义：`renderDiveRoundText` 文案、预留→认领→准入链路、回合上限与终态暂停、两个驱动点（`agent/status`、`reqboard/requirement-moved`）一律不动
3. 不碰唤醒的托管设计：不恢复 H4 的实际投递、不恢复已删除的 `deliver()` / `wake()` 直投路径、不调整后置链 handler 顺序

## 档位依据（轻档）

- **L1 一句话目标 + 可证伪判定**：让"确认之后 agent 能被自动叫起来"重新成立——判定见 A1–A6（其中 A1/A3 在修前必然失败）。
- **L2 范围边界**：上面「做」3 条、「不做」3 条；名单之外即本次不做，尤其"存量 disarmed 的恢复策略"已显式排除。
- **L3 轻路径依据**：改动面 = 1 处装配 + 1 处 disarm 留痕 + 2 个测试文件；根因单点、修复方式唯一、无需新增子系统或数据模型。
- **L4 批准闸门 + 下一步**：本文件落盘 → `reqboard_submit(kind=requirement)` 登记 → `reqboard_ask_confirm(target=artifact, kind=requirement)` 请人确认；未获批准不得进入设计。
- **L5 轻档 ≠ 无产物**：本 `requirement.md` 即产物，落盘 / 登记 / 确认三步照走。
- **单向升级信号**（出现任一即停手升级重档，不反向降级）：要新增 re-arm 子系统或改 `dive` 数据模型 / 要改阶段纪律与回合上限 / 要把 disarm 的可见性做成看板新面板。

## 风险与已知缺口

| 项 | 说明 |
|----|------|
| 存量需求不自动恢复 | 修复只让**之后**的驱动不再抛错、不再被误 disarm；已被 disarm 的存量需求（含 REQ-260930230225-71be）仍需人工敲一句才能继续——这是「不做」第 1 条的已知代价 |
| 类型错误基线 | 仓库现有 212 个 tsc 错误；本次只消除本行的 TS2554，不承诺降低基线 |
| 端到端验证成本 | A5 需要真实会话（armed 需求 + 人工门 + 不敲字观察）；若不便复现，以 A1 的真实装配单测作为等价证据并如实标注 |

## 总览

| 项 | 内容 |
|----|------|
| 现象 | 人工门确认后不自动唤醒，必须人工敲「继续」 |
| 根因 | `new AgentDeliverer(getAgents, { plugin })` 与三参签名错位 → `createRoundMessage` 抛 TypeError → 被就地 `disarm('driver-failed')` |
| 后果链 | disarmed → `isDrivableRequirement()` 静默 return → requirement-moved / idle / 催办全部空转；除立项外无 re-arm 路径 |
| 实据 | 台账：无回合却 disarm（`roundsInStage=0` 而 `lastActiveAt`=首次驱动拍）；会话：零条 `source.kind='dive'` 消息，各回合均由手打「继续」启动；`tsc`：`pm-capture-root.ts(56,21) TS2554` |
| 修复 | 装配三参 + 形状守卫测试 + disarm 写台账留痕 |
| 验证 | `npx vitest run tests/dive-wake-wiring.test.ts tests/agent-deliverer.test.ts`；`tsc \| grep pm-capture-root` 无命中 |

## 下一步

design —— 用 `reqboard_ask_confirm(target=artifact, kind=requirement)` 交棒；未获批准不得进入设计。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1、t4 |
| FR-2 | ✅ 已接收 | t1、t2 |
| FR-3 | ✅ 已接收 | t4、t3 |

> 无未接收条款（3 条全部有落点）。

<!-- reqboard:marks:end -->
