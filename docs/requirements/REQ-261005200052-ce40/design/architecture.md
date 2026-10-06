# 设计：架构（REQ-261005200052-ce40）

> 面向：零上下文的执行者。配合 [requirement.md](../requirement.md) 阅读。本文只写方向与做法，不含任务拆分。

## 目标与总体方案 <!-- serves: FR-1, FR-2 -->

一句话问题：**停手守卫只问「本窗口有没有未作答的票」，不问「这张票是不是一道门、现在答得了吗」。**

总体方案是**双向收口 + 判据单点**：

```
源头（A）  原型登记 → 只通知，不产生挂起票
守卫（C）  livePendingConfirm 补两谓词：有门？有产物？ —— 读时判定
表述       拒绝原文 / 回执 / status / 登记通知的「出路清单」由同一判据生成
```

明确不动的三件：

- G1~G4（requirement / design / decomposition / verification）的落章与推进口径；
- TTL 与过期基准（`interruptedAt ?? createdAt` + 30 分钟）；
- `PENDING_CONFIRM_BLOCKED_TOOLS` 的四条写路径名单。

## 判据单点与数据流 <!-- serves: FR-2, FR-3 -->

```
写路径工具入口（submit / decompose / move / task_move）
  └─ assertNoPendingConfirm(deps, windowKey)
        └─ livePendingConfirm(deps, windowKey)          ← 唯一判据点
             ① pendingForWindow(windowKey)             注册表：未 settle / 未过期
             ② requirementStoreOf(deps).get(reqId)     台账：**已在读**，不新增 I/O
             ③ targetConfirmedInLedger(req, rec)       既有：台账已落章 ⇒ 放行
             ④ hasConfirmGateOf(rec)            【新增】无门 ⇒ 放行
             ⑤ hasConfirmableArtifactOf(req, rec)【新增】无产物 ⇒ 放行
        ├─ 拦截：pendingConfirmRejectMessage(rec, facts)
        └─ 放行：undefined
```

`facts`（诊断四要素，供四处文案共用）：`requirementStatus` / `gate` / `artifactCount` /
`expiresAt` / `usableRecovery[]`。

放行**不写任何状态**：④⑤ 是读时谓词，每次写路径调用重算；产物一旦出现（含看板自动发现補登），
拦截立刻恢复——不留粘滞标记，也不新增持久字段。

## 与既有机制的关系 <!-- serves: FR-1, FR-2, FR-6 -->

| 既有机制 | 本需求的关系 |
|---|---|
| `targetConfirmedInLedger`（台账已落章 ⇒ 放行） | **原样保留**，判定顺序排在新增谓词之前 |
| TTL / `markInterrupted` | 原样保留；只是不再需要它来兜底"不是门的票" |
| `ARTIFACT_CONFIRM_GATES`（G1~G4 的产物 kind） | 升级为「有门」判据的**唯一事实源**，禁止再写第二份 kind 名单 |
| `triggerAutoConfirm` | 保留给真门产物（requirement / design / decomposition / verification）；原型不再调用 |
| `notifyArtifactRegistered` → `artifactNotifyText` | 改为**门感知**：无门产物不写「确认入口」 |
| 回滚 | 两处改动都不产生持久状态：回滚 = 还原代码，台账零迁移 |

## 不做的事（边界） <!-- serves: FR-2, FR-6 -->

- 不给 agent 新增「作废挂起票」入口：真门不得被 agent 取消。
- 不把 prototype 补成真门（那会把「可选加强」变成阻塞动作）。
- 不改回执的 `confirmed` 口径（仍以台账 `confirmedAt` / `approvedAt` 为准）。
- 不改 status 投影既有键的名字与语义，只**追加**可用出路信息。
