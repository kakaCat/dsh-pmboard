---
req: REQ-261001154450-b918
doc: use-cases
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8
---

# 用例设计 · 八个真实场景（REQ-261001154450-b918）

> **TL;DR**：每个用例都写清——谁触发、读什么、跑什么、**什么算过**。全部来自 REQ-8475 的实测现场，
> 不是假想场景；"过"的判据都能用命令或台账字段复现。

## UC-1 验收通过但没填实际结果 `serves: FR-1`

| 项 | 内容 |
|---|---|
| 触发 | 验收人对某验收项选"通过"，Q2（实际结果）留空 |
| 系统做什么 | 该项记 `unverified`；本批可落库；`gate_status` 变 `pending` |
| 什么算过 | `verification.sheet.items[i].status === 'unverified'`；台账里**搜不到**占位文案"未附实际结果"；需求不能归档 |

## UC-2 系统项零处置点通过 `serves: FR-2`

| 项 | 内容 |
|---|---|
| 触发 | 验收单含 `gapKind` 项（如 `traceability`），选"通过"且处置为空 |
| 系统做什么 | 整批拒绝，`system_item_disposition_required`，列出缺处置的项 |
| 什么算过 | 调用返回拒绝且 message 含该 `gapKind` 项 id；台账**无**该批裁决记录 |

## UC-3 批准计划后没人推第一张骨牌 `serves: FR-3`

| 项 | 内容 |
|---|---|
| 触发 | 人批准计划（`plan.approvedAt` 落章），agent 不调 `reqboard_task_run` |
| 系统做什么 | 落库 + 推进 `implementing` 后自动投递一次链 |
| 什么算过 | `reqboard_run_status` 的 `jobStatus !== 'not_found'`；无需任何人工 move 即有子卡推进 |

## UC-4 连关两张卡撞 60s 节流 `serves: FR-4`

| 项 | 内容 |
|---|---|
| 触发 | agent 在 60s 内关闭同需求第二张卡 |
| 系统做什么 | 拒绝并给出可执行指引 |
| 什么算过 | message 含**剩余等待秒数**与合规路径（等待 / 交给链）；agent 无需猜 `sleep 62` |

## UC-5 陈旧挂起挡住收尾 `serves: FR-5`

| 项 | 内容 |
|---|---|
| 触发 | 一个未作答挂起放置超过 TTL（现场：`pc-2c6cfb` 挡了归档提交） |
| 系统做什么 | 挂起过期，不再拦写路径；取回执返回 `expired:true` + 指引 |
| 什么算过 | 超 TTL 后 `reqboard_submit(kind=archive)` 不再返回 `REQBOARD_CONFIRM_PENDING` |

## UC-6 归档材料没交却已 archived `serves: FR-6`

| 项 | 内容 |
|---|---|
| 触发 | 验收全过 → 需求 `archived`，但从未提交 `kind=archive` |
| 系统做什么 | `closingGap='archive_missing'`，看板与 status 显示"收尾未闭环" + 下一步 |
| 什么算过 | `reqboard_status.closing_gap === 'archive_missing'`；看板可见红标；归档后该字段消失 |

## UC-7 落库后 FR 引用全空 `serves: FR-7`

| 项 | 内容 |
|---|---|
| 触发 | 计划任务表与覆盖表都没写 FR 引用（现场：8475 的 32/32 全空） |
| 系统做什么 | 提交/落库阶段直接拒绝 `REQBOARD_PLAN_REFS_MISSING`，指出哪张卡 |
| 什么算过 | `queue.json` 每张顶层卡 `requirementRefs` 非空；`fr_coverage.coverage_rate === 100` |

## UC-8 新增规范条目的期望不可达 `serves: FR-8`

| 项 | 内容 |
|---|---|
| 触发 | 写一条 C 条目，期望为"退出码 0"，而仓库当前不满足（现场：C-15 遇 212 个类型错误） |
| 系统做什么 | `kb:check` 的 K11 报错：期望必须可判定；退出码类断言必须附 `基线：`声明 |
| 什么算过 | 补上基线声明后 `pnpm run kb:check` 退出码 0；删掉声明后立刻转红 |
