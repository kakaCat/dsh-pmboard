# REQ-260930230225-71be 接口设计 · 槽位 / DOM / CSS / 定位契约 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6

> 本需求没有网络接口、没有函数签名变更、没有错误码；对外契约就是**槽位注册**、**DOM 类名与数据属性**、
> **CSS 选择器与档位阈值**、**面板定位**四类。以下每一条都是可被探针或单测断言的形式。

## I-1 · 槽位注册契约 serves: FR-1

`src/client/index.ts`，改动前 → 改动后：

| 项 | 改动前 | 改动后 |
|----|--------|--------|
| 槽位名 | `conversation.session.header.utilities` | `conversation.session.header.actions` |
| `id` | `PANEL_NAME + ':progress'` | 不变 |
| `order` | `5` | `0`（模式标签 `-10`、Team 导航 `-20`、subagent 目录 `-30`，故渲染在模式之后） |
| `inject` | `(sessionId) => ({ sessionId })` | 不变（两个槽位同为 session 作用域） |
| 组件 | `RequirementProgressAction` | 不变 |

```ts
slots.inject('conversation.session.header.actions', () =>
  slots.register(
    {
      name: 'conversation.session.header.actions',
      id: PANEL_NAME + ':progress',
      order: 0,
      inject: (sessionId: string) => ({ sessionId }),
    },
    RequirementProgressAction,
  ),
)
```

语义不变：无绑定需求时组件返回 `null`，座位不占空间（槽位宿主是 list，空 occupant 无宽度）。

## I-2 · DOM 契约（保持不变） serves: FR-3

本需求**不新增、不删除、不改名**任何类名或数据属性；档位降级全部由 CSS 完成，故 DOM 只有一处变化：
**位置**（父容器由 `headerUtilities` 变为 `headerActions`）。CSS 依赖的既有契约：

| 选择器 | 语义 | 用途 |
|--------|------|------|
| `.dsh-pm-cprog` | 组件根（`position: relative`） | 面板包含块 |
| `.dsh-pm-cprog-inline` | 芯片外壳（可点、有 title） | 宽度上限 + 内层滚动 |
| `.dsh-pm-flow` | 节点行（`display:flex`） | 横向滚动兜底 |
| `.dsh-pm-flow-node[data-state]` | `done` / `current` / `pending` / `skipped` | 档位 C/D 的显隐按状态区分 |
| `.dsh-pm-flow-node[data-selected]` | `"true"` 时高亮 | 选中态（不变） |
| `.dsh-pm-flow-dot` / `.dsh-pm-flow-meta` / `.dsh-pm-flow-label` / `.dsh-pm-flow-token` / `.dsh-pm-flow-link` | 圆点 / 名称行 / 节点名 / token / 连线 | 四档降级的四个抓手 |
| `.dsh-pm-cprog-inline-count` | `done/total` 或状态词 | 全档位恒显 |
| `.dsh-pm-cprog-detail-panel` | 详情面板 | 定位契约见 I-4 |

## I-3 · CSS 档位契约 serves: FR-2, FR-3

落点：`src/client/styles/board.ts`（流程图区段）与 `src/client/styles/token.ts`（token 行）。
阈值来自单一源 `FLOW_TIERS`（D-3），以模板插值写进 CSS 字符串，避免 CSS 与测试各写一份数字。

```css
/* FR-2 收缩与兜底：容器不再由内容撑开 */
.dsh-pm-cprog { min-width: 0; max-width: 100%; }
.dsh-pm-cprog-inline { min-width: 0; max-width: 64vw; }   /* 64vw = 不支持容器查询时的硬上限 */
.dsh-pm-flow { overflow-x: auto; }                        /* 既有规则，保留 */

/* FR-3 档位 B（≤ 880）：去 token */
@container (max-width: 880px) {
  .dsh-pm-flow-token { display: none; }
}
/* FR-3 档位 C（≤ 620）：去连线 + 非当前节点名 */
@container (max-width: 620px) {
  .dsh-pm-flow-link { display: none; }
  .dsh-pm-flow-node:not([data-state="current"]) .dsh-pm-flow-meta { display: none; }
  .dsh-pm-flow-node { min-width: 28px; }
}
/* FR-3 档位 D（≤ 460）：只留圆点 + 计数 */
@container (max-width: 460px) {
  .dsh-pm-flow-node .dsh-pm-flow-meta { display: none; }
  .dsh-pm-flow-node { min-width: 24px; }
}
```

说明：匿名 `@container` 查询自动匹配最近的 `container-type: inline-size` 祖先，即官方 `.titleRow`；
若本组件哪天被放到没有容器祖先的位置，全部降级规则不命中 → 退化为全量渲染（与现状一致），不报错。

## I-4 · 详情面板定位契约 serves: FR-4

```css
.dsh-pm-cprog-detail-panel {
  position: absolute; top: calc(100% + 8px); right: 0; left: auto; z-index: 60;
  width: min(420px, calc(100vw - 32px));
  max-height: min(68vh, calc(100vh - 100px));
  overflow-y: auto;
}
@container (max-width: 620px) {
  .dsh-pm-cprog-detail-panel {
    position: fixed; top: 78px; right: 12px; left: auto;   /* 视口右上，锚点与图表位置解耦 */
  }
}
```

| 量法（探针） | 通过条件 |
|--------------|----------|
| 面板 `getBoundingClientRect()` | `left ≥ 0` 且 `right ≤ innerWidth - 0.5`（六档） |
| 面板高度 | `height ≤ innerHeight - 100 + 0.5`（滚动条在面板内部） |

## I-5 · 不变式与错误语义 serves: FR-1, FR-2, FR-5

- **无错误码**：所有失败路径沿用现状——拉进度失败静默、无绑定需求返回 `null`、节点详情加载失败在面板内显示文案。
- **不变式 1**：本组件对进度接口只读，不发任何写请求（`fetch` 仅 `GET …/session/:id/progress` 与 `GET …/requirements/:id/stages`）。
- **不变式 2**：DOM 结构与类名不变（I-2），因此节点面板、DAG 挂载、看板入口的既有选择器与监听器不受影响。
- **违反任一条** → 单测 `tests/header-progress-responsive.test.ts` 或探针退出码非 0。
