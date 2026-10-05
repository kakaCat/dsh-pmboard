# REQ-260930230225-71be 数据模型 · 图表模型与档位常量 serves: FR-1, FR-2, FR-3, FR-4

> 本需求**不改任何持久化数据、不改任何接口字段**；新增的「数据模型」是客户端内部的一份只读派生模型
> （进度 payload → 节点模型），以及被 CSS 与测试共用的档位常量。

## D-1 · 持久化与接口：零变更 serves: FR-1

| 数据 | 改动 | 说明 |
|------|------|------|
| `GET …/session/:sessionId/progress` 响应 | 不改 | `requirement` / `progress` / `nodes` / `timeline` / `tasks` 字段按现状消费 |
| `GET …/requirements/:id/stages`（详情面板） | 不改 | 面板内容与 DAG 挂载逻辑不动 |
| 需求 / 任务台账 | 不改 | 本需求不写台账（除 reqboard 流程产物） |
| 迁移 / 回填 | 无 | 无 schema、无版本兼容分支 |

## D-2 · 派生模型：buildFlowChartModel serves: FR-1, FR-3

新增 `src/client/flow-chart-model.ts`（纯函数，无 DOM、无 fetch、无 React）。组件与探针共用它，
保证「探针测的档位行为」对着与线上同一份节点模型。

```ts
export type FlowNodeState = 'done' | 'current' | 'pending'

export interface FlowNodeModel {
  key: string                 // 'draft' | 'brainstorming' | 'design' | 'decomposing' | 'implementing' | 'accepting' | 'archived'
  label: string               // '立项' | '需求分析' | '设计' | '拆分' | '实施' | '验收' | '归档'
  index: number               // 0-based，未到节点的圆点显示 index + 1
  state: FlowNodeState        // 相对当前节点：之前 done / 相等 current / 之后 pending
  skipped: boolean            // 该分类流程跳过此节点（CATEGORY_FLOW_PROFILES）
  token?: number              // 仅当进度 payload 的 nodes[] 给了该 key 的 tokens.total 才出现
}

export interface FlowChartModel {
  nodes: readonly FlowNodeModel[]  // 恒 7 项，与 FLOW 同序
  currentKey: string | null        // 状态不在 FLOW 中（如 canceled）时为 null → 全部 pending
  statusKey: string                // 原样回传的 requirement.status
  statusLabel: string              // 状态中文（STATUS_LABEL）
  countText: string                // total > 0 ? done + '/' + total : statusLabel
  category: string                 // 缺省 'feature'
  closed: boolean                  // 该会话已无进行中需求，展示的是最近完成锚点
}
```

映射规则（逐条可断言）：

| 输入 | 输出 |
|------|------|
| `status` = FLOW 第 i 项 | `nodes[i].state = 'current'`，`< i` 为 `done`，`> i` 为 `pending` |
| `status` 不在 FLOW（如 `canceled`） | `currentKey = null`，全部 `pending` |
| `category` 的 profile.stages 不含某 key | 该节点 `skipped = true`（与缺产物标红区分，沿用现状语义） |
| `nodes[]` 该 key 有 `tokens.total`（number） | `token = total`，否则字段整体省略 |
| `progress.total > 0` | `countText = done + '/' + total`；否则 `countText = statusLabel` |

## D-3 · 档位阈值常量（单一源） serves: FR-3

```ts
/** 容器查询阈值（px）：CSS 与测试共用，避免两处各写一份数字。 */
export const FLOW_TIERS = {
  token: 880,   // ≤ 此宽：隐藏节点 token
  link: 620,    // ≤ 此宽：隐藏连线与非当前节点名
  label: 460,   // ≤ 此宽：隐藏全部节点名，只留圆点 + 计数
} as const
```

消费方式：`styles/board.ts` 用模板串把三个值插进 `@container` 规则；单测断言 CSS 里出现
`max-width: 880px / 620px / 460px` 且与常量相等（改一处即两处同步，不会漂移）。

## D-4 · 兼容与降级 serves: FR-2, FR-4

| 场景 | 行为 | 依据 |
|------|------|------|
| 无绑定需求 / 接口失败 / `hasRequirement` 非 true | 组件返回 `null`，座位不占位 | 现状语义，不改 |
| 浏览器不支持 `@container` | 全部降级规则不命中 → 全量渲染；由 `max-width: 64vw` + 内层 `overflow-x: auto` 保证行不溢出 | I-3 |
| 档位边界附近（如容器 ≈ 620） | 图表内部可能出现横向滚动条（残余，记录在案） | A-6 |
| 面板处于窄档 | 切 `position: fixed` 视口右上定位，保证左右都不越界 | I-4 |
| 官方槽位/宿主 CSS 变更 | 只依赖 `.headerActions` / `.titleRow` 的公开语义（session 作用域 + inline-size 容器）；若官方移除容器语义，退化为全量渲染 | I-3 |
