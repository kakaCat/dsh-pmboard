---
req: REQ-261001154450-b918
doc: interfaces
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8
---

# 接口设计 · 验收裁决 / 链投递 / 挂起 / 计划引用 / 规范自检（REQ-261001154450-b918）

> **TL;DR**：对外**不新增工具**，只改 4 个既有工具的回执与校验、加 1 个配置项、加 1 项门禁检查。
> 所有新增错误码以 `REQBOARD_` 前缀 + 人话 message + 修复指引三元组返回。

```
   reqboard_accept_sheet ──┐
   reqboard_ask_confirm  ──┤
   reqboard_submit(plan) ──┼──► 既有工具壳（入参兼容）──► 新校验/新回执
   reqboard_status       ──┘
   pnpm run kb:check     ─────► 新增 K11
```

## 工具回执与校验变更 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-7`

| 工具 | 现状 | 变更（入参兼容） |
|---|---|---|
| `reqboard_accept_sheet` | 每题一问（选项 or 自定义） | 每题两问（`<id>` 选项 + `<id>#result` 文本）；回执新增 `unverified` 计数 |
| `reqboard_submit(kind=plan)` | tasks 无 FR 字段 | tasks 接受 `requirement_refs?: string[]`；解析失败即拒 |
| `reqboard_ask_confirm` | 挂起无有效期 | 挂起登记带 `createdAt`；过期后不再拦写路径 |
| `reqboard_confirm_receipt` | 未作答 → `confirmed:false` | 过期未作答 → 追加 `expired:true` + 恢复指引 |
| `reqboard_status` | 无收尾字段 | 新增 `closing_gap` 与 `unverified_items` |
| `reqboard_task_move`（撞节流） | "已有关闭，请稍后" | message 含 `剩余 {n} 秒` + 合规路径 |

## 错误码表 `serves: FR-1, FR-2, FR-4, FR-5, FR-7`

| 码 | 触发 | message 要点 | FR |
|---|---|---|---|
| `result_required`（复用 `opinion_required` 口径） | 通过但实际结果为空且未启用 `unverified` 降级 | 指出哪一项、怎么补 | FR-1 |
| `system_item_disposition_required` | 系统项通过但处置为空 | 列出缺处置的系统项 id | FR-2 |
| `REQBOARD_DONE_THROTTLED` | 60s 内已有关闭 | 剩余秒数 + 合规路径 | FR-4 |
| `REQBOARD_PLAN_REFS_MISSING` | 计划任务表与覆盖表都取不到 FR 引用 | 指出哪张卡、怎么写 | FR-7 |
| `REQBOARD_PENDING_EXPIRED`（仅信息码，不拒绝） | 取回执时挂起已过期 | 说明可作废 + 下一步 | FR-5 |

## 配置项 `serves: FR-5, FR-1`

| 键 | 缺省 | 语义 |
|---|---|---|
| `pendingConfirmTtlMs` | `30 * 60 * 1000` | 挂起确认有效期（与 `CAPTURE_REJECTION_TTL_MS` 同口径） |
| `acceptRequireResult` | `true` | `false` = 允许降级为 `unverified`（仍不计入通过） |
| `autoAdvanceOnApprove` | `true` | `false` = 关闭批准后自动投递 |

## 只读可见性（不新增写路径） `serves: FR-6, FR-1`

| 面 | 字段 | 语义 |
|---|---|---|
| `reqboard_status` | `closing_gap?: 'archive_missing'` | 非空即"收尾未闭环" |
| `reqboard_status` | `unverified_items?: string[]` | 未复核项 id 列表 |
| 看板徽标 | 红/黄标 + 下一步 | 只读，不提供"一键闭环" |
