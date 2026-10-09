---
req_id: REQ-261009125641-c424
title: Dive 升级为 DriveEngine —— 设计阶段重做调研（DSH Goal 关键方法级）
status: design
serves: SP-1, SP-2, SP-3, SP-4, SP-5, SP-6
---

# 架构设计（REQ-261009125641-c424）

> 本文是**重做后的调研**：第一轮结论建立在 `goal-round-driver/src/index.ts` 单文件对位上；
> 本轮把 `@deepseek-ai/dsh-goal` 域**逐方法**读完后，有 **4 条结论口径被修正**（标 ⚠️）。
> 修正不是推翻方向，是找到了真正的机制来源：**原生之所以能做出那套纪律，是因为它的真相源是会话事件日志。**

## 目标与总体方案 `serves: SP-1`

把 `application/dive/` 里"通用回合纪律"与"需求流水线业务"切开：

```
application/drive/                         ← 新增：DriveEngine 内核（零业务、零框架）
  ① 相位机：预留 queued → claimed → admitted（+ stale / cancelled）
  ② 双重栅栏：pre-step 前与 next() 后各一次（同源判定）
  ③ 停下以后：退避 / 熔断 / 内存闭锁 / 失败闩
  ④ 回合身份：本次回合的 (源键, revision, round) 可被外部查询（授权面用）
application/dive/                          ← 收窄为 DriveEngine 的第一个 DriveSource
  留下：阶段上限 / 人工门 / 弹框在途 / 预算闸 / 归属校验 / 实施阶段自动恢复 / 阶段化提示词
```

**内核必须知道的（6 项，逐项给"为什么非知道不可"）**：① 相位与计数（含上限）——栅栏要判 `round === count+1`；
② 预留身份四元组（源键/revision/round/正文）——认领与逐字比对的对象；③ 可否驱动（armed ∧ 非停手）——
`readyToDrive` 的唯一业务输入；④ 活体与空闲——驱动点判据；⑤ 投递出口——`followup` 的唯一通路；
⑥ 停手/终态出口——失败与上限的落点。
**不进内核**：人工门 / 弹框在途 / 预算闸 / 实施阶段自动恢复（它们已是"构造预留之前"的独立判据，搬位置即可）。

## 调研修正：DSH Goal 关键方法逐条 `serves: SP-1, SP-2, SP-3, SP-4, SP-5`

| 关键方法 | 位置（原生） | 做什么 | pm 侧对应 | 差距 |
|---|---|---|---|---|
| `commit()` | `goal/src/index.ts:609-626` | ① 先记 `pendingActivation{offset: session.seq, activation}` ② `session.append('goal/change', change)`（**durable 唯一写入口**）③ 仅当 `event.seq === pending offset` 才采纳 activation，**否则一律 disarmed** ④ 发 `goal/changed` | `mutateIfPresent(store, id, …)`：写入口 **8+ 处**分散 | ⚠️ 无"仅活写入可武装"的围栏 |
| `setActivation` + `agent/created → disarmed` | `index.ts:255-257`、`:496-515` | 武装态存 **WeakMap（内存，永不落盘）**；进程/会话起手一律 disarmed；变化时发 `goal/activation-changed` | `dive.activation` **落盘**在台账，与 `phase`/`driverHealth` 同处一条记录 | ⚠️ 两半混一条记录（分歧③④的根） |
| `expectCurrent(state, ref)` | `index.ts:456-466` | CAS：id+revision 必须等于当前，否则 `GOAL_STALE_REVISION` | 台账 `version` 乐观锁 | ≈ 等价 |
| `commitSnapshot` / `nextMutationTime` | `index.ts:579-606`、`:574-576` | 每次变更写**完整后置快照**；时间戳单调 `max(now, updatedAt)`（抗时钟回拨） | 无"完整快照"契约；无单调时间戳 | ⚠️ 缺 |
| `applyGoalProjection` | `index.ts:146-159` | fold 抛错 → 记 `failure` 字符串；此后**宿主读路径 throw，客户端停在最后一个合法值** | 读到什么算什么 | ⚠️ 缺失败闩 |
| `decodeGoalChange` / `applyGoalChange` / `validateSnapshotTransition` | `fold.ts:134-306` | 字段集**精确相等**（多一字段即 throw）；字符串必须已 normalize；revision 恰好 +1；除 edit 外不得改 definition；**每操作一张相位迁移表**；create 必须 revision=1/active/0 轮且 id 不可复用（`seenGoalIds`）；clear 是 tombstone 且**计数归零**；counters/timestamps 跨操作**守恒**（`createdAt` 相同、`updatedAt` 不减、`roundsStarted` 不变） | `transitionDive`（"事件→下一个 dive 状态"，无守恒校验）；且**全仓仅 1 处直写 `dive.phase`**（`round-driver.ts:418`） | ⚠️ 缺守恒与迁移表 |
| `user/message` 准入 | `fold.ts:321-331` | 只有 `source.kind='goal'` ∧ id/revision 匹配 ∧ **`round === roundsStarted+1`** ∧ 未超上限 ∧ phase=active → `roundsStarted = round`；**否则 throw** | `persistAdmission`（mutate 幂等写，失败只 `warn`） | ⚠️ 计数权威弱（本仓唯一"同号重发"窗口） |
| `goalToolExecution` / `requireDirectHuman` / `isMatchingGoalRound` / `completionAuthority` | `tool-goal/src/authority.ts:52-112` | 工具调用必须：精确活体 ∧ `status==='running'` ∧ `currentInitiator()===agent` ∧ **在打开的回合内**；`complete/block` 必须"直接人类回合（且 agent 是 root）"或"**本回合就是当前 goal round**" | **无** | ⚠️ **完全没有回合级授权面** |
| 两级 `invariant.ts` | `goal/src/invariant.ts`（80 行）、`goal-round-driver/src/invariant.ts`（86 行） | **独立实现**的增量 fold，挂 `internal/dispatch`（发布前校验）+ `session/event`（发布后提交），用 staged WeakMap 对齐；round-driver 那层用**包自己的渲染器**重算正文并 `isDeepStrictEqual` 逐字比对 | **无** | ⚠️ 无独立校验器 |
| 投影 zod schema | `index.ts:83-101` | 交叉不变量：current id ∈ `seenGoalIds`、`updatedAt>=createdAt`、`roundsStarted<=maxGoalRounds` | 结构校验有，交叉不变量无 | ❌ |

### 这一轮真正学到的东西（三条） `serves: SP-1, SP-2`

1. **原生的纪律不是"写得严"，而是"真相源是事件日志"**：`goal/change` 是**耐久、带完整后置快照**的事件，
   所以 `roundsStarted` 能被 fold 出来、能重放、能被 invariant 独立复算。pm 的真相源是**台账文件**
   （当前状态，非事件流）——**照搬 fold 等于换真相源**，是另一个量级的改造。
2. **"人的意图"与"本进程是否被授权"是两件事**：原生把前者放 durable（phase），后者放内存（activation），
   并用 `pendingActivation + seq` 保证**只有活的写入能授予武装**。pm 把两者都写进台账，于是必须靠
   `isRecoverableDisarm`（"disarmed+active 就自动重武装"）打补丁——**补丁方向与原生相反**。
3. **回合消息在原生里是"令牌"**：不只是"把模型拉起来"，还是"授权模型改目标"的凭据
   （`isMatchingGoalRound`：本回合必须有 `round === goal.roundsStarted` 的 goal 消息）。
   pm 的 Dive 只做前半句，工具层完全不知道"这次调用是不是被正当拉起的回合"。

## 设计决策 `serves: SP-1, SP-2, SP-3, SP-4, SP-5, SP-6`

### DD-1 两半分离：durable 相位 / 运行时授权 `serves: SP-4`

- **durable（台账）**：`status`、`dive.phase`（active/paused）、阶段计数——可重放语义、可被人改。
- **runtime（内存）**：`activation`（本次运行是否获得自动续跑授权）、闭锁、退避账——**不落盘**。
- 武装规则学 `pendingActivation`：写入者随身带一个**本次进程的令牌**；读回时令牌不匹配 ⇒ **视为未武装**。
  等价效果：**重放/恢复出来的状态永远不会重新武装**，只有活的写入会。
- ⚠️ 这条**替代**了第一轮 SP-4 的"收窄自动重武装范围"——不是收窄，是**换机制**：
  误伤自愈仍然保留（人/看板/心跳的活写入会带令牌），而"从历史里读出来就自动武装"被结构性禁止。

### DD-2 计数权威：不换真相源，改为"写失败即停手 + 通知帧带快照" `serves: SP-2`（⚠️ 口径修正）

- **不照搬 fold**（理由见上"三条"第 1 条）；第一轮"否掉 fold"的结论**保留**，但理由从"成本太高"改成"**那要换真相源**"。
- 采纳两条小步：① 准入写失败 ⇒ **停手（闭锁）+ 响亮留痕**，而不是只 `warn` 后继续（这是"同号回合重发"的唯一来源）；
  ② `RequirementChange` 通知帧从 delta 升级为**最小后置快照**（`RequirementSummary` 已带 `version`/`status`/
  `paused`/`autoRun`/`advanceAlert`，**只缺 `dive`**），把驱动热路径上的"回读 store"拿掉。
- 判据：`grep -rn "persistAdmission" src` 的写失败分支必须走到 disarm/latch；通知帧含 `dive` 字段。

### DD-3 迁移表 + 守恒校验 `serves: SP-5`

`transitionDive` 从"事件 → 下一个状态"升级为**带守恒的相位迁移表**，照 `fold.ts:199-253` 的强度：

| 校验 | 规则 | 来源 |
|---|---|---|
| 不可变字段守恒 | 除"改目标/上限"类事件外，任何迁移不得改目标与上限 | `requireSameDefinition` |
| revision 连续 | 每次迁移 version 必须恰好 +1 | `requireNextRevision` |
| 计数守恒 | 非准入类迁移不得改 `roundsInStage`；计数不得回退 | `change.roundsStarted === state.roundsStarted` |
| 相位迁移表 | 每个事件声明允许的来源相位集与目标相位 | `validateSnapshotTransition` 的 switch |
| 时间戳单调 | `updatedAt` 不减（抗回拨） | `nextMutationTime` |

并把**唯一一处直写**（`round-driver.ts:418` 的 `r.dive.phase = 'paused'`）收口进该表——改后
`grep -rnE "dive\.(phase|activation) *=" src` 应为 **0 处**。
（数据字段 `roundsInStage`/`driverHealth`/`lastWakeAt` 不属相位机，但要收敛到**统一写入口**。）

### DD-4 内容不变式：指纹 + 独立校验器 `serves: SP-3`

两级，成本递增：

1. **当次**（已有）：pre-step 前后用 `sameQueued` 逐字比对内存登记副本。
2. **跨时间**（新增）：准入时把 `(requirementId, round, revision) → 正文指纹` 落盘；独立校验器（**不共用生产投影**）
   在任何需要时复算比对，不符即 fail。

- 拦得住：旧消息混入、同号不同文、历史被改写、重复投递。
- 拦不住：**渲染器自身的语义漂移**（改了文案但一致地重算）——这一类只能靠测试钉住（照
  `goal-round-driver/src/invariant.ts:54-57` 的"用包自己的渲染器重算"即属此类，故它也只能覆盖"内容来源"而非"内容质量"）。

### DD-5 回合身份与授权面（**本轮新增**） `serves: SP-1`

DriveEngine 暴露只读的"当前回合身份"（源键 + revision + round + 该回合是否为本进程发布），
工具层据此判"这次调用是不是发生在被正当拉起的回合里"。**首期只覆盖不可逆动作**
（推进阶段 / 归档 / 取消），不铺开到全部写工具（照 `completionAuthority` 的粒度：只拦"结束类"动词）。
判据：给一个"在无回合的窗口里调归档"的用例，须被拒且给稳定错误码。

### DD-6 读路径失败闩 `serves: SP-2`

读到不可信状态（校正失败 / 计数与指纹不一致）⇒ **宿主侧拒绝服务 + 客户端停在最后一个合法值**（两路分开），
而不是"读到什么算什么"。这是 `applyGoalProjection` 的 `failure` 闩的直接对照。

### DD-7 不做的事 `serves: SP-6`

不照搬 fold；不把 job 驱动（`reqboard_task_run` 后台链）并进来（三项语义皆不同）；
不把 invariant 做成"全量历史重放"（无事件源，见 DD-2）。

## 模块改动地图 `serves: SP-1`

| 文件 | 改动 |
|---|---|
| `src/application/drive/*`（新增） | 内核：相位机 / 栅栏 / 停手 / 回合身份 |
| `src/application/dive/round-driver.ts` | 拆：通用部分上移；业务部分留作 DriveSource |
| `src/application/dive/round-state.ts` | `RoundAttempt`/`DriverState`/`reservationValid` 上移内核；`isDrivableRequirement` 留业务 |
| `src/domain/dive/transition.ts` | 升级为带守恒的迁移表（DD-3） |
| `src/application/ports.ts` | `RequirementChange` 增加最小后置快照（DD-2）；新增回合身份只读端口（DD-5） |
| `src/index.ts` | 通知发射点带快照（去掉发射侧回读） |

## 迁移批次与验证 `serves: SP-1, SP-2, SP-3, SP-4, SP-5, SP-6`

| 批次 | 内容 | 判据（可执行） | 回滚位 |
|---|---|---|---|
| B1 | 抽内核，行为零变化 | 现有 dive 用例集全绿 | 改前全绿状态 |
| B2 | Dive 改为 DriveSource | 同上全绿 + `round-driver.ts` 行数下降 | B1 全绿 |
| B3 | DD-3 迁移表 + 收口唯一直写 | `grep -rnE "dive\.(phase|activation) *=" src` = 0；`npx vitest run tests/dive-*.test.ts` 全绿 | B2 全绿 |
| B4 | DD-2 计数 fail-closed + 通知帧快照 | 新增"写失败即停手"用例；帧含 `dive` | B3 全绿 |
| B5 | DD-4 指纹 + 独立校验器；DD-6 失败闩 | 各一条用例（含"篡改历史即报"与"读到不可信即拒绝"） | B4 全绿 |
| B6 | DD-5 授权面（不可逆动作） | "无回合调归档被拒"用例 + 稳定错误码 | B5 全绿 |

## 关键决策与取舍 `serves: SP-1, SP-2, SP-4`

| 取舍点 | 否掉了什么 | 为什么 |
|---|---|---|
| 两半分离（DD-1） | 继续把 activation 落盘 + 自动重武装 | 落盘的"进程授权"必然要靠补丁自愈，且方向与原生相反；分离后"重放不武装"是结构性质，不靠判据 |
| 不换真相源（DD-2） | 照搬 fold（要求 append-only 需求事件流） | 那是另一个量级的改造；小步两步已能消掉"同号重发"与"热路径回读" |
| 指纹不变式而非纯函数重建（DD-4） | 复刻"内容可由渲染器重建" | pm 正文含动态阶段与快照，渲染器本身会变；只能钉住"来源"不能钉住"质量" |
| 授权面只覆盖不可逆动作（DD-5） | 全量写工具都加令牌校验 | 铺开会把日常写路径全绑到回合上下文，代价大于收益（YAGNI） |
| 本需求不落代码 | 边调研边改 | 需求类型是 spike（产出是答案）；迁移批次交给下一个 refactor 需求 |

## 风险与遗留 `serves: SP-1`

- **R1 内核抽象过度**：抽早了会把"只有一个使用方"的东西做成框架。缓解：DriveSource 只按当下已知的第二个场景
  （授权面/通知帧）设计，不预留第三个。
- **R2 指纹落盘增长**：每回合一条指纹，长期累积。缓解：与需求同生命周期（归档即随目录回收），不建全局索引。
- **R3 授权面误伤**：用户手动在窗口里说"归档"会被令牌校验挡住。缓解：照原生口径——**直接人类回合同样是合法授权来源**
  （`requireDirectHuman`），人说话永远算数。
- **遗留**：`driverHealth` / `wake-heartbeat` / `awaiting-confirm` 三处各写 `driverHealth`，统一写入口未定；
  留待 B4 落地时一并裁定。

## 测试策略 `serves: SP-1, SP-2, SP-3, SP-4, SP-5, SP-6`

- **行为基线**：`tests/dive-*.test.ts` 与 `tests/unit/**dive**` 全套作为"重构零漂移"的判据（B1/B2 的闸）。
- **新增用例**：写失败即停手（B4）、指纹不符即报（B5）、读不可信即拒（B5）、无回合调归档被拒（B6）、
  "重放不武装"（B1 内核：给定历史状态直接构造 runtime，应判未武装）。
- **双实现互证**（学两级 invariant）：指纹校验器**不 import 生产投影**，自带解析。

## 文档更新清单 `serves: SP-1`

- `docs/architecture/project-manual.md`：新增/改写「DriveEngine 与 Dive」一节（内核职责、两半状态模型、授权面）。
- `src/application/drive/README` 或模块头注释：内核"必须知道的 6 项"与"不进内核"清单（防后来者把业务塞回来）。

## 调研修正登记（C-x） `serves: SP-2, SP-3, SP-4`

⚠️ 本次重做调研对第一轮的 4 条口径修正，逐条登记（含修正依据）:

| 编号 | 第一轮口径 | 修正后 | 修正依据 |
|---|---|---|---|
| C-1 | SP-2"否掉 fold：要求产物簿成为全序事件源，成本太高" | 否掉，但理由改为"**那要换真相源**（原生 fold 的前提是 `goal/change` 耐久事件流，pm 无此物）" | `fold.ts:313-332` + `index.ts:146-159` |
| C-2 | SP-4"收窄自动重武装的范围" | 改为**换机制**：activation 移出 durable + `pendingActivation` 式"只认活写入"围栏 | `index.ts:609-626`、`:255-257` |
| C-3 | SP-3"只能做弱不变式" | 保留，但补上"为什么原生能做强的"：它的正文由**包自己的渲染器**重算（`invariant.ts:54-57`），而 pm 的正文依赖动态阶段 | `goal-round-driver/src/invariant.ts` |
| C-4 | 第一轮未识别 | **新增 DD-5 授权面**：回合消息在原子里同时是"令牌"（`authority.ts:88-104`），pm 侧完全缺失 | `tool-goal/src/authority.ts` |

## 技术方案与亮点 `serves: SP-1`

未使用（本需求为 spike，交付调研结论与设计决策；实现细节在后续 refactor 需求的 design 中展开）。
