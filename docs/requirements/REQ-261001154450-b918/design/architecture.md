---
req: REQ-261001154450-b918
doc: architecture
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8
---

# 架构设计 · 收尾门硬化 + 自动链默认开（REQ-261001154450-b918）

> **TL;DR**：四处收口——① 验收裁决不再允许"通过但无实际结果"（域内新增 `unverified` 态，删掉占位兜底）；
> ② 计划落库时 `requirementRefs` 必须有值（新增引用通道 + 落库后门禁）；③ 计划批准与落库的**同一事务之后自动投递一次链**，
> 失败响亮报出；④ 收尾闭环可判定（`archived` 且归档产物齐）与规范期望可达性（新增 K11）各自变成机器可查的判据。

```
   验收裁决                          计划批准                        收尾
   +---------------------+     +----------------------+     +----------------------+
   | 弹框两问/项          |     | confirm-settle       |     | archived             |
   |  ① 裁决 ② 实际结果   |     |  落库(refs 必须有值) |     |   + archive 产物?    |
   | 缺结果 -> unverified | --> |  推进 implementing    | --> | 否 -> closingGap=红   |
   | 未复核不计入通过     |     |  自动投递一次链       |     | 是 -> 闭环            |
   +---------------------+     +----------------------+     +----------------------+
            |                             |                              |
            +-------- 域层：状态/门规（纯函数，零 I/O） -------------------+
```

## 目标与总体方案 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

| # | 收口点 | 机制（一句话） | FR |
|---|---|---|---|
| 1 | 验收不留白 | 通过项必须有实际结果；拿不到就记 `unverified`，**不计入通过** | FR-1 |
| 2 | 系统项必处置 | `gapKind` 项通过时 opinion 必填，否则整批拒绝 | FR-2 |
| 3 | 计划引用落库 | 计划任务表新增 `requirement_refs`；落库后逐卡校验非空 | FR-7 |
| 4 | 批准即开链 | 落库+推进的同一编排末尾自动投递一次；失败 → 响亮 | FR-3 |
| 5 | 节流可预期 | 拒绝文案给出剩余秒数与合规路径 | FR-4 |
| 6 | 挂起不粘滞 | 挂起确认加 TTL（复用 capture 拒绝的 30 分钟口径） | FR-5 |
| 7 | 收尾可判定 | `closed = archived && 有 archive 产物`；不闭环即红 | FR-6 |
| 8 | 规范自证 | kb-probe 新增 K11：期望必须可判定；退出码类须带基线声明 | FR-8 |

## 分层落点与依赖方向 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

依赖只许向内（domain ← application ← adapters/tools/http；client 自包含）：

| 层 | 模块 | 改什么 |
|---|---|---|
| domain | `workflow/AcceptanceSheetSpec.ts` | 系统项判定（已有 `gapKind`）复用为"必须处置"的判据 |
| domain | `workflow/DoneEvidenceSpec.ts`、`limits.ts` | 节流判定返回**剩余等待毫秒**（纯函数） |
| domain | `requirement/Predicates.ts` | 新增 `closingGapOf(req)`：闭环判定的纯函数 |
| application/internal | `verdicts.ts` | 去掉占位兜底路径；新增 `unverified` 裁决态与需求级"全通过"判定 |
| application/internal | `pending-confirm.ts` | 挂起 TTL 判定（`isPendingExpired`）+ 过期不拦 |
| application/internal | `content-gate-wiring.ts`、`plan-landing.ts` | `requirement_refs` 取值通道与逐卡非空门禁 |
| application/internal | `confirm-settle.ts` | 落库+推进之后自动投递一次链 |
| application/use-cases | `AcceptSheet.ts` | 弹框改两问一批；删除占位文案 |
| application/use-cases | `SubmitArtifact.ts`（kind=plan） | 计划任务表接受 `requirement_refs`；覆盖表解析失败即拒 |
| adapters/tools/http/client | 只读投影 + 徽标 | 暴露 `closingGap` / `unverified` 计数；不新增写路径 |
| scripts | `kb-probe.mts` | 新增 K11（期望可达性 / 基线声明） |

## 数据流 A：验收裁决（改后） `serves: FR-1, FR-2`

```
   ask(每项两问)                        域裁决（纯函数）
   +--------------------------+        +--------------------------------------+
   | Q1 <id>      选项裁决     |        | 通过 且 结果非空         -> passed    |
   | Q2 <id>#result 实际结果   | -----> | 通过 但 结果空           -> unverified|
   |   （仅在 Q1=通过 时必填） |        | 系统项(gapKind) 通过无处置 -> 整批拒绝 |
   +--------------------------+        | 改进/其他                -> failed    |
                                       +--------------------------------------+
                                                      |
                            需求级判定：全部 passed 且 0 unverified -> 归档
```

要点：

- 弹框仍是一次 `questions.ask`，只是每题拆两问；选项与自由文本不再互斥。
- 两问都拿不到结果 → 记 `unverified`（**不再写占位文案**），该批可落库但**需求不能归档**。
- 系统项 = `gapKind !== undefined` 或旧类前缀识别（`AcceptanceSheetSpec` 已有该判定）。

## 数据流 B：计划批准 → 落库 → 开链 `serves: FR-3, FR-7`

1. `SubmitArtifact(kind=plan)`：解析计划任务表的 `requirement_refs`；缺省时回退解析计划文档覆盖表；两者都解析不到 → 拒绝（`REQBOARD_PLAN_REFS_MISSING`）。
2. `ConfirmArtifact`/`confirm-settle`：落库（`plan-landing` 写 `TaskRecord.requirementRefs`）→ 推进 `implementing`（原子）。
3. **同一编排的末尾**：投递一次推进事件。成功 → 返回 `dispatched:true + runId`；未装配/失败 → `dispatched:false + reason`（不静默）。
4. 幂等：同一需求已有 active run 时不重复投递（沿用 `already_running` 语义）。

## 收尾闭环的判定 `serves: FR-6`

| 判据 | 值 |
|---|---|
| `closed` | `status === 'archived' && artifacts 中存在 kind==='archive'` |
| `closingGap` | 不满足时为 `'archive_missing'`，否则 `undefined` |
| 可见面 | `reqboard_status`、看板需求徽标、`verification` 页面顶部提示 |
| 行为 | **不阻断**归档本身（人工门不变），但任何"已完成"观感必须带红标与下一步指引 |

## 兼容与回滚 `serves: FR-1, FR-5, FR-6, FR-7`

- 新增字段全部可缺省：旧台账（无 `unverified`、无 TTL、无 `closingGap`）读取路径逐字节不变。
- `unverified` 是 `status` 联合类型的新增成员，旧读方按字符串处理不受影响。
- 回滚：四处收口各自独立，可用配置开关单独关闭（`acceptRequireResult` / `pendingConfirmTtlMs` / `autoAdvanceOnApprove`）；关掉后行为回到当日现状。

## 风险与对策 `serves: FR-1, FR-3, FR-6`

| 风险 | 对策 |
|---|---|
| 两问弹框拉长验收体验 | 只在 Q1=通过 时要求 Q2；批量仍是同一批，不增加弹框轮次 |
| 自动投递造成无人值守烧 token | 沿用现有"失败即暂停 + 告警"，不自动重试；投递一次为上限 |
| 收尾红标让人误以为可操作 | 红标只读，附"下一步：提交归档材料（reqboard_submit kind=archive）" |
