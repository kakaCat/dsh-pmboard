# 数据模型设计 · REQ-261006094052-1da2 <!-- serves: FR-1, FR-2, FR-4 -->

> 关注点：**本次不改 schema**。本文件存在的意义是把「不改」写成可核验的结论，并列出被读写的既有字段
> 与它们的不变式——避免下一位执行者以为「推进逻辑改了，字段也该动」。

## D-1 结论：零 schema 变更 <!-- serves: FR-4 -->

- 不新增 `RequirementRecord` 字段、不新增 `StageArtifact` 字段、不改 `TaskRecord`。
- 不改台账 `schemaVersion`（当前 v9）；不写迁移脚本；不写回填。
- 不改任何产物文档的 front-matter 契约（`requirement_refs` / `sides` / `design_exempt` 语义不变）。

可核验：改动后 `git diff --stat` 里 `src/shared/protocol.ts` **无改动**。

## D-2 被读的字段（只读） <!-- serves: FR-1, FR-2 -->

| 字段 | 谁读 | 用途 |
|---|---|---|
| `RequirementRecord.status` | `AskConfirm` 早退分支 / `applyConfirmDecision` / `triggerAutoConfirm` | `advanceTargetFor(status)` 算推进目标；`triggerAutoConfirm` 用它判断「本次推进是否指向 design」 |
| `artifacts[].kind` + `confirmedAt` | `AskConfirm:94` | `alreadyConfirmed` = 该 kind 全部有确认章（判据不变） |
| `plan.approvedAt` | `AskConfirm:94-95` | `target=plan` 的「已确认」与 `planAwaitingAdvance`（判据不变） |
| `requirement.md` front-matter `sides` | `checkPrototypePresenceGate` / `isUiRequirement` | 判「是否 UI 需求」——**唯一判据**（`category-doc-sets`），本次复用不新写 |
| `artifacts[]`（原型） | `checkPrototypePresenceGate` | 存在门：登记的 prototype 产物数 > 0 即放行（含 `prototype_exempt` 生效路径） |

## D-3 被写的字段（与改造前逐字一致） <!-- serves: FR-1 -->

`applyConfirmedAdvance` 推进成功时写的字段**只有这四个**（+ 时间戳），全部沿用现有写入器：

| 字段 | 写入器 | 值 |
|---|---|---|
| `status` | `transitionRequirement`（`internal/token-usage.ts`） | `from → to` |
| `statusHistory[]` | 同上 | `{from, to, at: nowTs, actor:{kind:'human',sessionId:windowKey}, reason: CONFIRM_ADVANCE_REASON, snap}` |
| `comments[]` | 本单点 | `[自动推进] <from> → <to>：确认弹框肯定答复（reqboard_ask_confirm 原子推进）` |
| `checkpoint` | `stampCheckpoint(req, nowTs, 'reqboard_ask_confirm')` | 断点 = 最后一步之后的下一步 |
| `updatedAt` | `mutateIfPresent` 外层 | `nowTs` |

**不写**：`artifacts[].confirmedAt`（落章在调用方，早退分支此刻**已经是**已落章态，重复写会把
确认时间与证据洗成第二次；这也是一条不变式：单点不碰确认章）。

## D-4 不变式（可断言） <!-- serves: FR-2 -->

1. **落章与推进相互独立**：推进失败不回滚确认章；确认章存在不蕴含推进成功（`confirmed:true / advanced:false` 合法）。
2. **乐观并发**：单点内 `req.status !== from` ⇒ 不迁移（不把一个已被别人推进的需求再推一次，也不写重复评论）。
3. **不新增重复推进记录**：同一 `from → to` 只在真的迁移时写一条 `[自动推进]` 评论；重发已推进的需求时
   `status` 已变，`advanceTargetFor` 给的是**新的**目标（如 design → decomposing），此时它是一条**新的**迁移，
   不是重复（口径与 `reqboard_move` 一致）。
4. **闸门口径不变**：早退分支与首次确认读同一批门函数（`contentGatesForMove` / `checkDesignCompletenessGate`），
   不存在第二份判据；本次只补「推进」。

## D-5 迁移 / 回滚 <!-- serves: FR-4 -->

- **迁移**：无。存量「已落章未推进」的需求（含来源需求 REQ-261006092213-4f5b）**不需要回填数据**——
  重发一次确认门即按新逻辑推进（读路径不变，写路径自然受益）。
- **回滚**：`git revert` 三处源码改动即回到旧行为；无数据残留（旧行为下这些需求的台账本来就是合法的
  「已确认未推进」态）。回滚不需要跑任何脚本。
