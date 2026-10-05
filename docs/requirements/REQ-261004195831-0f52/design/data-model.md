---
serves: FR-1, FR-2, FR-3, FR-4
---

# 数据模型设计（REQ-261004195831-0f52） serves: FR-1, FR-2, FR-3, FR-4

> **服务端/台账：无变更**（无新表、无新字段、无 schema 迁移、无索引变更）——
> 本需求只新增**客户端页面内存态**。为免歧义，本文档先明确"不改什么"，再定义新增的内存结构。

## 无变更声明 serves: FR-1

| 对象 | 结论 | 依据 |
|---|---|---|
| 服务端台账（`RequirementRecord` / `RequirementSummary`） | **不变** | B12 ⑥-① 已定稿：摘要走 `/state`，全文走 `GET /requirements/:id` |
| 落盘文件（`dsh-reqboard.json` / 分片） | **不变** | 本需求纯读路径，不写台账 |
| 浏览器存储（`localStorage` / `sessionStorage`） | **不新增写入** | 详情全文只在页面内存；既有键（`dsh-pmboard:view` / `dsh-pmboard:list` / DAG 视图键）语义不动 |
| SSE 帧、分页、`tokenTotals` 派生 | **不变** | 超出 requirement.md 边界 1，属升级信号 |

## ReqDetailEntry（新增：详情取数状态） serves: FR-1, FR-2, FR-3

**用途**：描述「某条需求的详情全文现在处于什么状态」——视图据此决定渲染全文、骨架、未找到还是失败。

**定义**：

```typescript
/** 详情取数结果四态（判别联合：状态与数据同生共死，不会出现「有 error 又有 record」）。 */
type ReqDetailEntry =
  | { status: 'loading'; reqId: string; startedAt: number }
  | {
      status: 'ready'
      reqId: string
      /** 全文：GET /requirements/:id 的 data.requirement（唯一正文数据源） */
      record: RequirementRecord
      /** 响应里的全局台账版本（失效判据之一） */
      revision: number
      /** 本条目取到的时刻（诊断/单测用） */
      fetchedAt: number
    }
  | { status: 'missing'; reqId: string; message: string }
  | { status: 'error'; reqId: string; message: string; hint?: string; code?: string }
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 | 约束 |
|---|---|---|---|---|
| `status` | `'loading' \| 'ready' \| 'missing' \| 'error'` | 是 | 四态之一 | 判别键；只允许这四个值 |
| `reqId` | `string` | 是 | 需求 id（`REQ-…`） | 必须等于请求时的 id；响应 id 不一致 → 丢弃该响应（FR-2 边界） |
| `record` | `RequirementRecord` | `ready` 必填 | 详情全文 | 含 `comments` 等本体字段；渲染前仍要走 FR-4 防御 |
| `revision` | `number` | `ready` 必填 | 响应携带的台账全局版本 | 与 `record.version` 一起作失效判据 |
| `fetchedAt` | `number` | `ready` 必填 | 取到时刻（ms） | 仅诊断/单测使用，不参与失效判定 |
| `message` | `string` | `missing`/`error` 必填 | 人读文案（服务端 `error` 或「未找到需求 <id>」） | 不得吞掉服务端给的原文 |
| `hint` | `string` | 否 | 服务端给的可复制修复命令 | 透传给 `buildError` 同款呈现 |
| `code` | `string` | 否 | `ApiError.code`（如 `REQBOARD_NOT_FOUND`） | 404 判定用，不展示给用户 |

**索引设计**：内存 `Map<string, ReqDetailEntry>`，键 = `reqId`。
容量上限 16（超出按插入序淘汰最旧，`Map` 的「重插即最新」语义与 `dag/view-state.ts` 同款）；
**不落盘**，页面刷新即清空（与既有泳道位置记忆同纪律）。

**关联关系**：

| 关联到 | 类型 | 外键 | 说明 |
|---|---|---|---|
| `BoardState.requirements`（摘要） | 1:1（按 id） | `reqId` ↔ `RequirementSummary.id` | 摘要提供标题/状态等骨架信息；**本体字段一律取自本结构** |
| `BoardState.tasks` | 1:N（按 `requirementId` 过滤） | `RequirementRecord.id` | 任务列表仍来自 `/state`（本来就全量下发，不改） |

## 失效与去重判据 serves: FR-1, FR-3

**取数决策表**（`ensure(reqId)` 的完整语义，实现照此逐条落地）：

| 当前条目 | 触发条件 | 动作 | 依据 |
|---|---|---|---|
| 无 | 首次进入详情 | 发 1 次请求 → `loading` | FR-1 |
| `loading` | 同 id 再次 `ensure`（SSE + 轮询同 tick） | **复用在途 Promise**，不发新请求 | FR-3 去重 |
| `ready` | 摘要 `version` 未变、且响应 `revision` 等于当前台账 `revision` | 直接复用，不发请求 | FR-1 边界（不强制重取） |
| `ready` | 摘要 `version` 变大，或台账 `revision` 变了 | 发 1 次请求替换条目 | FR-3 刷新同步 |
| `missing` / `error` | 同 id 再次 `ensure` 且未被用户显式重试 | 复用既有结果（不自动重试风暴） | FR-3 |
| 任意 | 响应的 `reqId` ≠ 当前视图的 `reqId`（乱序/过期） | 丢弃响应，不改写当前视图 | FR-2 边界 |
| 任意 | 用户点「重试」 | 强制取数（清缓存后 `ensure`） | FR-2 |

**计数口径（单处定死）**：

| 展示位置 | 口径 |
|---|---|
| 详情页「💬 评论（N 条）」与评论列表 | 全文 `record.comments.length`（FR-4 兜底为空数组时为 0） |
| 看板卡片 / 泳道 / 会话面板的评论数 | 摘要 `commentCount`（首屏唯一可用来源） |
| 两者关系 | **不得在同一次详情渲染里混用**：详情页一律用全文口径；摘要口径只服务卡片层 |

## 迁移与回滚 serves: FR-2

- **迁移**：无。新结构是页面内存态，不存在历史数据，也没有版本兼容问题。
- **回滚**：删除该结构与其消费点（详见 architecture.md §兼容与回滚），无残留数据需清理。
- **失败语义**：取不到全文时**不**用摘要冒充全文（否则又是一次「静默失数据」），一律走 FR-2 三态。
