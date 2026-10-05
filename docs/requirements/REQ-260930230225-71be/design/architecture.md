# REQ-260930230225-71be 架构设计 · 会话头部流程图挂载点与自适应层 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6

> 目标：把流程图从 `header.utilities` 迁到 `header.actions`（模式标签之后），并在它和标题行之间加一层**宽度自适应层**，把「宽度由内容撑开」改成「宽度由档位契约决定」。纯前端展示层：请求、数据、节点集合、面板内容全部不变。

## A-1 · 现状与故障链 serves: FR-1, FR-2

```
现在：挂在 utilities（flex:none，不收缩）                         用户看到
┌─────────────────────────────────────┐   7 节点 min-width:58px   ┌──────────────────────┐
│ .titleRow                            │   + 6 连线 × 16px         │ 标题行被撑破          │
│  ├ .titleCluster（flex:1，能缩）      │   ≈ 578px（带 token 790） │ 流程图不随屏幕缩小    │
│  │   ├ .crumbs（overflow:hidden）     │  ──────────────────────►  │ 官方工具按钮被挤出去  │
│  │   └ .headerActions（模式标签在这） │  .headerUtilities 无      │ 面板 right:0 锚在图表 │
│  └ .headerUtilities ◄ 流程图在这 ─────┤   min-width:0、不收缩     │ 右侧（在右上角）      │
└─────────────────────────────────────┘                            └──────────────────────┘
```

| 失效点 | 位置 | 后果 |
|--------|------|------|
| 挂错座位 | `src/client/index.ts` 注册到 `…header.utilities` | 落在行最右，且不在 `titleCluster` 的收缩链里 |
| 宿主不收缩 | DSH `.headerUtilities{flex:none}` | 撑破标题行，且拿不到 `.titleRow` 的容器查询语义 |
| 容器无上限 | `.dsh-pm-cprog` / `.dsh-pm-cprog-inline` 无 `min-width:0` / `max-width` | 内层 `overflow-x:auto` 永远不生效 |
| 节点固定宽 | `.dsh-pm-flow-node{min-width:58px}` | 7 节点宽度写死，无法降级 |
| 面板锚点 | `.dsh-pm-cprog-detail-panel{right:0}` | 图表移到左侧后，420px 面板会向左越出视口 |

## A-2 · 目标结构与信息层级 serves: FR-1, FR-3

```
改后：挂在 header.actions，紧随模式标签（order 0 > preset -10）
┌─────────────────────────────────────────────────────────────────────────┐
│ .titleRow（inline-size container）                                       │
│  ├ .titleCluster（flex:1 / min-width:0）                                  │
│  │   ├ nav.crumbs（可缩到 0）                                             │
│  │   └ .headerActions                                                     │
│  │       ├ [subagent 目录 -30][Team 导航 -20][标准模式 -10]               │
│  │       └ .dsh-pm-cprog ◄ 本插件（order 0）                              │
│  └ .headerUtilities（日程 / 日志 / 在应用中打开）                          │
└─────────────────────────────────────────────────────────────────────────┘
```

档位表（容器 = `.titleRow` 的 inline-size，由官方 `container-type: inline-size` 提供）：

| 档位 | 容器宽 | 渲染内容 | 估算图表宽 |
|------|--------|----------|-----------|
| A 全量 | ≥ 880px | 圆点 + 节点名 + 节点 token + 连线 + 计数 | 578（带 token 至 790） |
| B 去 token | 620–880px | 圆点 + 节点名 + 连线 + 计数 | 578 |
| C 圆点为主 | 460–620px | 圆点 + 仅当前节点名 + 计数（连线隐藏） | 280 |
| D 最简 | < 460px | 圆点 + 计数 | 184 |

三档降级**只减信息不丢定位**：当前节点名在 C 档保留、圆点在全部档位可见、计数（`done/total`）恒在。
档位边界附近的内部横向滚动是**已接受的残余**（A-6 / D-4 记录），不作为 FR-2 的判定对象。

## A-3 · 分层职责 serves: FR-2, FR-3, FR-4

| 层 | 文件 | 本次改动 | 职责边界 |
|----|------|----------|----------|
| 注册层 | `src/client/index.ts` | 槽位名 `utilities` → `actions`；`order: 5` → `0`；订正两处旧注释 | 只决定座位，不碰渲染 |
| 模型层 | `src/client/flow-chart-model.ts`（新增） | 抽出 `buildFlowChartModel()` + 档位阈值常量 `FLOW_TIERS` | 纯函数：输入进度 payload，输出节点模型；不碰 DOM / CSS |
| 视图层 | `src/client/conversation-progress.ts` | 改为消费模型（DOM 结构、类名、点击行为不变） | 只把模型映射成既有标记 |
| 样式层 | `src/client/styles/board.ts` `styles/token.ts` | 收缩规则 + 四档 `@container` + 面板双模定位 | 全部宽度与定位行为都在 CSS |
| 探针 | `scripts/header-progress-probe.mts`（新增） | 六档视口 × 布局断言 | 布局回归门，不参与运行时 |

## A-4 · 详情面板的定位模型 serves: FR-4

面板是 `.dsh-pm-cprog`（`position:relative`）的绝对定位子元素，其包含块只有图表自身大小，
因此**不能**再假设「图表在行最右」。改为按档位切两种定位（纯 CSS，无 JS）：

| 档位 | 定位 | 锚点 | 越界风险 |
|------|------|------|----------|
| 容器 > 620px | `position: absolute` | `right: 0`（从图表右缘向左展开） | 图表右缘 ≈ 容器 − 180 ≥ 420，面板落在视口内 |
| 容器 ≤ 620px | `position: fixed` | `top: 78px; right: 12px`（视口右上） | 右侧恒为 `100vw − 12`，左侧 = `100vw − 12 − width` ≥ 12 |

官方的 `Menu` / `Tooltip` / `PickerPopover` 同样用 `position: fixed`（React 树中无 transform 祖先，
官方注释明确「避免 transform 以免成为 fixed 的包含块」），故 fixed 在此环境安全。
宽度一律 `min(420px, calc(100vw - 32px))`，高度上限 `min(68vh, calc(100vh - 100px))`。

## A-5 · 回滚路径 serves: FR-5

- 改动集中在 3 个源文件（1 处注册、1 个新增模型文件、2 个 CSS 分片）+ 1 个新增探针脚本，
  **无数据迁移、无配置开关、无接口变更**；回滚 = 还原这些文件。
- 宽档（容器 ≥ 880px）不命中任何降级规则，只命中「挂载点 + 面板右对齐」——渲染与改动前逐项一致。
- 若迁移后发现官方 `header.actions` 座位被约束（例如官方新增占用者导致拥挤），
  回滚到 `utilities` 只需还原 `index.ts` 的一行槽位名与 order，CSS 档位规则对两个座位都成立。

## A-6 · 不变式与残余风险 serves: FR-5, FR-6

不变式（探针 + 单测共同断言）：

1. 六档视口下 `.titleRow` 无横向溢出（`scrollWidth - clientWidth ≤ 0.5`）——FR-2 的硬判定。
2. 容器 ≥ 880px 时节点数 = 7、连线数 = 6、计数文本 = `done/total`（宽档零回归）。
3. 当前节点（`[data-state="current"]`）在全部档位可见。

残余风险（记录、不隐藏）：

- 档位边界附近（如容器 ≈ 620 时线条刚隐藏前后）图表内部可能出现 1 条横向滚动条。
  探针会把每档 `chartScrollX`（图表 `scrollWidth - clientWidth`）打进 DIAG 行，便于观测但不判失败。
- 不支持 `@container` 的引擎会忽略全部降级规则，退化为「全量 + 内部滚动」；
  由 `.dsh-pm-cprog-inline { max-width: 64vw }` 与内层 `overflow-x: auto` 兜底，行仍不溢出。
