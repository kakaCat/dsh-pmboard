# 设计 · 接口（REQ-261005143615-5ab1） `serves: FR-1, FR-3, FR-4, FR-5`

## 端点契约（加性变更） `serves: FR-4`

`GET /dashboard/api/reqboard/requirements/:id/docs`（查询参数 `?session=` 语义不变）

| 项 | 变更前 | 变更后 |
|---|---|---|
| `documents[].path` | 台账登记的工作区相对路径 | **不变**（对账口径） |
| `documents[].absPath` | 无 | **新增可选**：命中候选根时给出绝对路径；未命中/未判定不注入该键 |
| `documents[].state` | `confirmed｜pending｜unregistered｜file-missing` | 加 `'unknown'` |
| `generated[].absPath` | 无 | 新增可选（同上规则） |

调用方：客户端详情页壳（[board-mount.ts](../../../../../src/client/board-mount.ts) → `fetchReportDocs`）。
为兼容老客户端，`absPath` / `unknown` 都是**加法**：读侧不认即忽略（协议既有纪律）。

## 判定与字段的对应关系 `serves: FR-1, FR-3`

| 情形 | `state` | `absPath` | 页面 |
|---|---|---|---|
| 在需求根命中 | `confirmed` / `pending` | 需求根下绝对路径 | 可点开 |
| 在会话根命中 | 同上 | 会话根下绝对路径 | 可点开 |
| 候选根可用但文件不在 | `file-missing` | 不注入 | 划线 + 「文件缺失」 |
| 一个候选根都不可用 | `unknown` | 不注入 | 「未判定（读根不可得）」**不划线** |

## 错误语义 `serves: FR-3`

- 读根不可得**不是** 4xx/5xx：仍 200，状态 `unknown`（「这台机器上判不了」）。
- `deps.docsAt` / `deps.docRootsOf` 未装配（旧接线 / 单测桩）→ 走旧单根路径，
  `unknown` 永不出现，`absPath` 永不注入 —— 保证既有断言逐字不变。
- 需求不存在 → 404 `REQBOARD_NOT_FOUND`（不变）。

## 兼容与迁移 `serves: FR-5`

- 台账零迁移：`workspaceRoot` / `docBasePath` 字段早已在记录里（[protocol.ts:1299](../../../../../src/shared/protocol.ts#L1299)），本需求只是**用它**。
- 客户端加性渲染：不认 `unknown` 的旧客户端会按未知值走兜底文案（现有 `stateText` 兜底），不崩。
- 回滚：删掉两口注入即回旧行为；无需数据回填、无需双写。
