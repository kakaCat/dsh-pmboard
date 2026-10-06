# 设计：接口与契约（REQ-261005200052-ce40）

> 面：内部函数签名、工具返回体字段、文案契约、错误码。定不死不许进拆分。

## 内部接口（application 层） <!-- serves: FR-2, FR-3, FR-5 -->

| 函数 | 签名变化 | 语义 |
|---|---|---|
| `hasConfirmGateOf` | 新增 `(rec: PendingConfirmation) => boolean` | `target==='plan'` ⇒ true（G3 批准计划）；`target==='artifact'` ⇒ `kind ∈ Object.values(ARTIFACT_CONFIRM_GATES)` |
| `hasConfirmableArtifactOf` | 新增 `(req: RequirementRecord, rec: PendingConfirmation) => boolean` | `plan` ⇒ `req.plan !== undefined`；`artifact` ⇒ `(req.artifacts ?? []).some(a => a.kind === rec.kind)` |
| `livePendingConfirm` | 语义扩展（签名不变） | 判定序：注册表过滤 → 台账落章 → **无门放行** → **无产物放行** |
| `pendingConfirmFactsOf` | 新增 `(req, rec, now) => PendingConfirmFacts` | 生成诊断四要素与**可用出路清单** |
| `pendingConfirmRejectMessage` | `(p, facts?) => string` | 有 facts 时按可用出路生成；缺省保持旧文案（兼容既有调用点） |
| `artifactNotifyText` | 输出变化（签名不变） | 门感知：有门才写「确认入口」，无门写「无需人工确认（登记即生效）」 |

`PendingConfirmFacts` 形状（新增，**只读投影，不落盘**）：

```
{ requirementStatus: string        // 目标需求当前状态（终态时文案要写明 agent 侧无解）
  gate: boolean                    // 是否有确认门（FR-2 谓词④）
  artifactCount: number            // 该 kind 在册产物数（FR-2 谓词⑤）
  expiresAt: number                // (interruptedAt ?? createdAt) + TTL，供文案写"何时自动失效"
  usableRecovery: string[] }       // 真实可用出路（① 取回执恒定可用）
```

## 工具返回体与文案契约 <!-- serves: FR-3, FR-4 -->

| 面 | 位置 | 契约 |
|---|---|---|
| 写路径拒绝原文 | `pendingConfirmRejectMessage` | 必含：ticket、目标需求 id **与其状态**、被卡的产物（kind / 在册数）、失效时刻、**只列可用出路** |
| 挂起回执 | `ConfirmReceipt.receiptNote` | 同上口径；`interrupted` 文案不改既有语义，只补可用出路 |
| 状态投影 | `StatusTool` 的 `pending_confirms[]` | **追加**（不改旧键）：`requirement_status` / `gate` / `artifact_count` / `expires_at` / `usable_recovery` |
| 登记通知 | `artifactNotifyText` | 有门：保留「确认入口：项目看板 → 需求卡 → 「待确认」一键确认」；无门：改「无需人工确认（登记即生效）」 |

**禁止项（可断言）**：

1. 无确认门的 kind 的文案里**不得出现**「看板点确认」/「一键确认」；
2. 目标需求非本窗口进行中需求（如已归档）时**不得出现**「重新发起 ask_confirm 覆盖」；
3. 该 kind 在册产物数为 0 时**不得出现**「看板点确认」，且必须出现「先登记产物」这类下一步。

## 错误与拒绝条件 <!-- serves: FR-5 -->

| 码 | 触发点变化 | 说明 |
|---|---|---|
| `REQBOARD_MISSING_ARTIFACT` | **前移**到登记票之前（`askConfirm` 校验段） | 文案与既有 `applyConfirmDecision` 抛出的逐字一致，便于既有测试复用 |
| `REQBOARD_MISSING_PLAN` | 同上（`target='plan'` 且 `req.plan === undefined`） | 同上 |
| `REQBOARD_CONFIRM_PENDING` | 不变（真门照抛） | 文案由 `facts` 生成 |

错误码不新增、不改名：本次是**时序前移**与**文案补齐**，不是新协议。

## 兼容性 <!-- serves: FR-2, FR-5 -->

- 旧调用点不传 `facts` 时 `pendingConfirmRejectMessage` 行为逐字不变（既有用例可原样通过）。
- `StatusTool` 只增键，不改键；看板旧读侧不受影响。
- `askConfirm` 前移校验只影响"本来就会失败"的调用（产物缺失场景），成功路径的返回体不变。
