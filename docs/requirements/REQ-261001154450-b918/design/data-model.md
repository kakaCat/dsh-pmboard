---
req: REQ-261001154450-b918
doc: data-model
serves: FR-1, FR-2, FR-5, FR-6, FR-7
---

# 数据模型 · 裁决态 / 挂起 TTL / 计划引用 / 闭环字段（REQ-261001154450-b918）

> **TL;DR**：**零破坏性变更**——3 处新增可缺省字段 + 1 个联合类型新增成员；旧台账读得进、旧回执形状不变（少键不补 null）。

```
   VerificationItem.status   passed | failed  ──(+unverified)──►  旧读方按字符串处理，不受影响
   PendingConfirmation       +createdAt +ttlMs ──► 过期判定；旧记录无 createdAt = 不过期（向后兼容）
   TaskRecord                requirementRefs 已有字段，本次只保证"落库即有值"
   RequirementRecord         +closingGap（只读投影，不落盘）
```

## 验收单条目（VerificationItem） `serves: FR-1, FR-2`

| 字段 | 类型 | 现状 | 变更 | 约束 |
|---|---|---|---|---|
| `id` | string | 有 | 不变 | `v{n}-{i}` |
| `status` | `'passed' \| 'failed'` | 有 | **新增** `'unverified'` | 三态互斥 |
| `opinion` | string? | 允许占位文案 | 禁止占位；`unverified` 时可为空串 | 通过路径必须非空 |
| `gapKind` | `'e2e' \| 'orphan' \| 'consistency' \| 'traceability'` | 有 | 不变（作为"系统项"判据） | 系统项通过 → `opinion` 必填 |
| `userChoice` / `userFeedback` | string? | 有 | 不变 | 保留审计原样 |

**需求级判定（纯函数）**

| 输入 | 输出 |
|---|---|
| 全部 `passed` 且无 `unverified` | 可归档（`ACCEPTED_REQ_STATUS`） |
| 存在 `unverified` | `gate_status='pending'`，不归档；`unverified_items` 列出 id |
| 存在 `failed` | 走既有返工路径 |

## 挂起确认（PendingConfirmation） `serves: FR-5`

| 字段 | 类型 | 现状 | 变更 |
|---|---|---|---|
| `ticket` | `pc-…` | 有 | 不变 |
| `createdAt` | number | **无** | 新增（登记时刻） |
| `ttlMs` | number | **无** | 新增（登记时快照配置值，避免改配置影响存量） |
| `state` | `'pending' \| 'settled' \| 'expired' \| 'interrupted'` | 隐式 | 新增显式态 |

**过期语义**

| 条件 | 行为 |
|---|---|
| `now - createdAt < ttlMs` | 照旧：写路径被 `REQBOARD_CONFIRM_PENDING` 拦住 |
| 超时 | **不拦**；`pending_confirms` 不再列出；取回执返回 `expired:true` + 指引 |
| 旧记录（无 `createdAt`） | 视为不过期（向后兼容），但可选清理入口 |

## 计划任务引用（TaskRecord.requirementRefs） `serves: FR-7`

| 项 | 契约 |
|---|---|
| 来源优先级 | ① `reqboard_submit(kind=plan)` 的 `tasks[].requirement_refs`；② 计划文档覆盖表解析；③ 两者皆无 → 拒绝 |
| 落库 | `plan-landing` 写 `requirementRefs`（通道已存在，见 [plan-landing.ts:135](src/application/internal/plan-landing.ts#L135)） |
| 门禁 | 落库后逐卡校验非空（顶层卡至少 1 个 FR）；空 → `REQBOARD_PLAN_REFS_MISSING` |
| 消费 | RTM `serves` 字段、`fr_coverage`、追溯链三级统计（均已有读取方） |

## 收尾闭环字段 `serves: FR-6`

| 字段 | 位置 | 类型 | 语义 |
|---|---|---|---|
| `closingGap` | 只读投影（reqboard_status / 看板 / verification 顶部） | `'archive_missing' \| undefined` | `archived` 且无 `kind='archive'` 产物时为 `archive_missing` |
| `closed` | 同上 | boolean | `closingGap === undefined && status==='archived'` |

**不落盘**：闭环与否由台账实时推导（`artifacts` + `status`），避免引入可与真相漂移的冗余字段。

## 迁移与兼容 `serves: FR-1, FR-5, FR-6, FR-7`

| 场景 | 处理 |
|---|---|
| 存量已归档需求（如 REQ-261001143526-8475）无 archive 产物 | 读路径显示"收尾未闭环"，**不回写台账**、不算错误 |
| 存量验收单无 `unverified` | 按两态读，行为不变 |
| 存量挂起无 `createdAt` | 不过期（不误伤正在等待的真实挂起） |
| 回滚 | 三处新增字段均可缺省；关掉开关即回旧行为，无需数据迁移 |
