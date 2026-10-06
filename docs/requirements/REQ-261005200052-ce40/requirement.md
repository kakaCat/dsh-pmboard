---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
sides: [backend]
---

# 需求说明（REQ-261005200052-ce40 原型登记不得钉死窗口：无门票不拦写路径 + 拦截文案只列真实出路）

> 本文档面向：产品、开发、测试、用户——**写给人看，不是写给代码看**。

## TL;DR

- **是什么**：显式登记原型（`reqboard_submit(kind=prototype)`）会**自动弹一次确认框**；人不在旁边时它留下一张**挂起票**，
  而挂起票会拦住**整个窗口**的写路径（submit / decompose / move / task_move）——紧接着的「提交文档」当场报 `REQBOARD_CONFIRM_PENDING`。
- **为什么**：prototype **不是人工确认门**（门只有 requirement / design / decomposition / verification），
  所以看板上**没有可点的确认控件**；但票的恢复指引却写着「去看板点确认按钮」，agent 只能干等 30 分钟。
- **得到什么**：登记原型不再钉窗口；守卫只拦「**真有门且真有可确认产物**」的票；拦截文案只列**真实存在**的出路。

## 业务流程图

```
修前（实测：探针 tests/_probe-prototype-pin.test.ts 可复跑）
  窗口 ──reqboard_submit(kind=prototype)──▶ 登记成功 + 自动弹确认框（宽限 2 秒）
                                              └─人不在──▶ 留下挂起票 pc-xxxxxx（kind=prototype）
  窗口 ──reqboard_submit(kind=requirement)──▶ ✗ REQBOARD_CONFIRM_PENDING（整个窗口被钉住）
                                              └─自救①取回执（只读）✗ ②看板点确认（无控件）✗ ③重发确认（再钉一张）
                                              只能干等 TTL（30 分钟）

修后
  窗口 ──reqboard_submit(kind=prototype)──▶ 登记成功 + 纯通知（不登记票、不拦写路径）
  窗口 ──reqboard_submit(kind=requirement)──▶ ✓ 正常受理
  真有门的票（G1 需求 / G2 设计 / G3 计划 / G4 验收）──▶ 照旧拦，且文案只给走得通的出路
```

## 产品定义

**拦截（停手守卫）本身是对的**：人在被问话时，agent 不该背着他继续产出下游产物。这条不变。

错的是**拦的对象与说法**：当前守卫只看「本窗口有没有未作答的票」，不问两件本该先问的事——
**这张票是不是一道门**（有没有人工确认门）、**这张票现在答得了吗**（台账里有没有可落章的产物）。
于是出现了「拦的东西不是门、且谁都答不了、agent 还被指去看一个不存在的按钮」的三重错配。

与现状的区别：

| 面 | 现状 | 本需求之后 |
|---|---|---|
| 原型登记 | 自动弹确认 → 无人作答即留票 → 整窗口锁 30 分钟 | 只发通知，不登记票，不拦写路径 |
| 守卫判据 | 有票就拦 | 有门 **且** 有可确认产物才拦（读时谓词，每次调用重算） |
| 恢复指引 | 固定列 ①②③ 三条，哪怕走不通 | 只列真实存在的出路；没有看板控件就不许写「去看板点」 |
| 登记通知 | 一律写「确认入口：看板一键确认」 | 无门产物写「无需人工确认（登记即生效）」 |

## 用户与角色

| 角色 | 什么场景用 | 痛点 |
|---|---|---|
| 窗口 agent | 提需求文档 / 设计 / 原型后继续干活 | 登记完原型就被自己的票钉住，接着的提交全被拒，且三条自救路都不通 |
| 人（看板） | 需要点确认放行下一阶段 | 被 agent 求「去点一下」，翻遍看板找不到 prototype 的确认控件（本来就不是门） |
| 维护者 | 加减产物种类 / 门禁 | 新增 kind 忘了配门，就会**悄悄**获得「钉死窗口 30 分钟」的副作用 |

## 功能点（需求条款）

| 编号 | 名称 | 一句话 |
|---|---|---|
| FR-1 | 原型登记不产生挂起票 | 登记成功只通知，不登记票、不进等待位、不拦写路径 |
| FR-2 | 守卫只拦「有门且有产物」的票 | 无确认门、或该 kind 台账内无产物 ⇒ 放行；真门照拦 |
| FR-3 | 文案只列真实出路 | 拒绝原文 / 回执 / status 的 recovery 与真实能力同源 |
| FR-4 | 通知不谎报确认入口 | 无门产物不得写「看板一键确认」 |
| FR-5 | 不造空票 | 登记票前先校验可落章；不可落章直接拒，不留票 |
| FR-6 | 口径锁与回归 | 用例锁死上面五条的判据单点，并锁「真门仍拦」 |

**FR-1: 原型登记的自动确认不再产生挂起票**

`reqboard_submit(kind=prototype)` 登记成功后，**不得**经由 `triggerAutoConfirm` 在 ticket 表里留下记录。
允许保留一次**纯通知**（消息 / 看板 chip 级提示，不产生 `PendingConfirmation`）。

判据：登记后 `reqboard_status.pending_confirms` 为空；同窗口紧接着的 `reqboard_submit(kind=requirement)` 不被
`REQBOARD_CONFIRM_PENDING` 拒（前提：不存在别的活挂起票）。

**FR-2: 守卫只拦「确有确认门且有可确认产物」的挂起票**

`livePendingConfirm` 的判定补两个**读时谓词**（每次写路径调用重算，不留粘滞状态）：

- **有门**：`target='artifact'` 时 `kind` 必须命中 `ARTIFACT_CONFIRM_GATES` 的值域
  （requirement / design / decomposition / verification）；`target='plan'` 视为有门（G3 批准计划）。
- **有产物**：该 kind 在台账里**至少有一条产物**（否则没有任何东西可以被确认，人也点不了看板）。

两者任一不成立 ⇒ 放行（返回 `undefined`）；两者都成立 ⇒ 照旧拦。
产物一旦出现（含看板自动发现補登）⇒ 谓词立刻恢复拦截，**不是**一次性放行。

判据：直接调 `assertNoPendingConfirm` 传构造好的票；kind=prototype / 该 kind 无产物 ⇒ 不抛；
kind=verification 且有产物 / target=plan ⇒ 抛 `REQBOARD_CONFIRM_PENDING`。

**FR-3: 拒绝原文与回执只列真实存在的出路**

`pendingConfirmRejectMessage` / `PENDING_CONFIRM_RECOVERY` / `ConfirmReceipt` 的 note / `StatusTool` 的
`pending_confirms[].recovery` 共用同一份「可用出路」判据：

- 「看板点确认」只在**该 kind 真有门**时出现；
- 「重新发起 ask_confirm 覆盖」只在**目标需求是本窗口进行中需求且该产物已在册**时出现；
- 不满足时不列，并写明原因（如「该产物未登记：先登记产物」/「该需求已归档：agent 侧无法覆盖」）。

判据：对「kind=prototype 的票」「有门但无产物的票」分别断言文案里**不出现**不可用路径、且含原因定语。

**FR-4: 产物登记通知不得谎报确认入口**

`notifyArtifactRegistered` 的「确认入口：项目看板 → 需求卡 →「待确认」一键确认」仅在该 kind 有门时输出；
无门时改输出「无需人工确认（登记即生效）」。

判据：登记原型后的通知文本不含「一键确认」。

**FR-5: 不制造答不了的票**

登记挂起票**之前**先校验这次确认有东西可落章：`target='artifact'` 而台账无该 kind 产物、或 `target='plan'`
而无计划 ⇒ 直接拒（`REQBOARD_MISSING_ARTIFACT` / `REQBOARD_MISSING_PLAN`），**不 register、不进等待位、不拦写路径**。

判据：对无产物的需求调 `reqboard_ask_confirm` ⇒ 报缺产物；随后 `reqboard_status.pending_confirms` 仍为空，
同窗口写路径可用。

**FR-6: 口径锁与回归**

上面五条的判据必须**只有一处实现**（守卫 / 文案 / 通知三处共用），并有用例锁死：

1. 登记原型后窗口可继续提交（FR-1）；
2. 无门票 / 无产物票放行，真门票照拦（FR-2）；
3. 文案不列不可用路径（FR-3 / FR-4）；
4. 无产物不登记票（FR-5）；
5. 真门路径回归零变化：G1~G4 确认、计划批准、TTL 过期语义逐条不变（FR-6）。

判据：`npx vitest run tests/pending-guard.test.ts tests/submit-prototype.test.ts tests/ask-confirm-pending.test.ts` 退出码 0。

## 边界（不做什么）

- **不放宽任何真门禁**：G1 需求 / G2 设计 / G3 计划 / G4 验收的拦截口径、落章判定、推进白名单逐字不变。
- **不改 TTL**：30 分钟基准（`interruptedAt ?? createdAt`）与过期语义原样保留。
- **不给 agent 新增「任意作废挂起票」的入口**：agent 不得用任何手段取消一道真门（本次只放行"不是门"的票）。
- **不改验收单 / 不动物理产物 / 不做存量数据迁移**：守卫是读时谓词，存量票无需改写。
- 不做 A（把 prototype 补成真门，让看板出现可点控件）：需求侧确认原型本就是「可选加强」，
  为它加一道硬门等于把可选动作变成阻塞动作。
- 不做 B（去掉自动确认、什么都不通知）：登记后「人根本不知道有新原型」会让评审失去入口，至少保留通知。

## 讨论与裁定记录（D-x）

| 编号 | 原话来源 | 裁定 | 影响 FR | 判据 |
|---|---|---|---|---|
| D-1 | 「拦截是对的，要按照拦截要求修改才是对的，是不是被卡住了没有告诉agent为什么原因」 | 拦截口径不得放宽；要改的是「拦的东西必须真的是门、且答得了」与「拦住时必须说清为什么、哪条出路真的通」 | FR-2、FR-3 | 真门用例仍抛 `REQBOARD_CONFIRM_PENDING`；文案断言不出现不可用路径 |
| D-2 | 「是因为把原型添加后产生的bug，你看看是添加什么导致的。」 | 根因定为 t10 原型登记编排第 ⑤ 步 `triggerAutoConfirm(kind='prototype')`：用「可选加强」的措辞触发了「硬拦写路径」的挂起票 | FR-1、FR-4 | 探针 `tests/_probe-prototype-pin.test.ts` 复现（auto_confirm=triggered、票 kind=prototype、后续提交被拒）；修后同探针转为回归断言 |
| D-3 | 「同意」（对 A+C 修法的答复） | 采用 A+C：A=原型登记不再产生挂起票；C=守卫侧「无门票不拦写路径」兜底 | FR-1、FR-2 | FR-1/FR-2 的判据用例 |

## 非功能需求

- **兼容**：存量挂起票零迁移——判定改为读时谓词，旧记录按新判据即时生效；旧台账字段不增不改。
- **性能**：守卫每次写路径调用仅多一次内存判定 + 复用**已在读**的那份 `RequirementRecord`，不新增 I/O。
- **可观测**：放行/拦截都要能在 `reqboard_status.pending_confirms` 与拒绝原文里看出「为什么」。

## 验收标准（整体）

1. 在一个 brainstorming 需求的窗口里显式登记原型（真 fs + 真工具壳）：
   `pending_confirms` 为空，紧接着 `reqboard_submit(kind=requirement)` 不被 `REQBOARD_CONFIRM_PENDING` 拒。
2. 构造「kind=prototype 的票」与「kind=requirement 但台账无产物的票」：守卫放行，且文案不含不可用出路。
3. 构造「kind=verification 且产物在册未落章」的票与 `target=plan` 的票：守卫**照拦**，文案含「看板点确认」。
4. `npx vitest run tests/pending-guard.test.ts tests/submit-prototype.test.ts tests/ask-confirm-pending.test.ts` → 退出码 0。
5. `npx tsc --noEmit -p tsconfig.json` → 退出码 0（C-15）。
6. 全量 `pnpm test` 与基线比对零新增失败（C-14）。

## 关键决策与取舍

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 原型要不要继续弹确认 | 保留票 + 把 prototype 配成真门（看板补控件） | 登记只通知、不产生票 | 需求侧确认原型是「可选加强」（D-2 的实测代码注释即如此写）；为可选动作加硬门 = 把可选变阻塞 |
| 守卫怎么改 | 只改登记侧（源头不发票） | 源头 + 守卫双向（A+C） | 只改源头救不了存量票与将新增的无门 kind；守卫兜底是同一判据的单点，成本一次内存判定 |
| 文案怎么改 | 删掉第三条出路 | 按能力动态列 | 「③ 重发确认」对归档需求必失败、对无产物需求必失败；写死就会再骗一次 |

## 技术方案与亮点

- **判据单点**：新增 `livePendingConfirm` 内的「有门 / 有产物」两谓词，守卫、拒绝文案、回执、status 投影、通知文案**共用**
  （门值域直接取 `ARTIFACT_CONFIRM_GATES`，不再各写一份 kind 名单）。
- **读时谓词而非一次性状态**：放行不写任何"已作废"标记，产物一出现即恢复拦截——不留粘滞状态，也不引入新持久字段。
- **与常规做法的差异**：不加"agent 侧作废入口"这种看似方便的后门（那会削弱真门），而是让**不是门的票从来不存在**。

## 依赖与约束

- 依赖（强）：`ARTIFACT_CONFIRM_GATES`（门值域唯一事实源，`GateCatalog.ts` / `ArtifactSpec.ts`）。
- 依赖（强）：`triggerAutoConfirm` / `askConfirm` 的票登记时序（`AskConfirm.ts:184` 前后）与 `notifyArtifactRegistered` 文案。
- 约束：不改 `PENDING_CONFIRM_BLOCKED_TOOLS` 的名单（四条写路径），不放宽 `targetConfirmedInLedger` 落章判定。
- 约束：`kind=prototype` 仍需保留在 `ALL_ARTIFACT_KINDS`（登记路径依赖它），只是不再进票表。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t-028d50 |
| FR-2 | ✅ 已接收 | t-97e904 |
| FR-3 | ✅ 已接收 | t-1c8e8d |
| FR-4 | ✅ 已接收 | t-1c8e8d |
| FR-5 | ✅ 已接收 | t-028d50 |
| FR-6 | ✅ 已接收 | t-78a4c9 |

> 无未接收条款（6 条全部有落点）。

<!-- reqboard:marks:end -->
