# REQ-260930230225-71be 会话头部需求流程图改为响应式并移到模式标签后

> 档位：轻档（改动面小、无第二个未定决策）· 类型：feature（实为会话头部布局缺陷修复 + 挂载点迁移）

## TL;DR

会话头部那张「需求流程图」（立项→需求分析→设计→拆分→实施→验收→归档）现在挂在
`conversation.session.header.utilities`，而该槽位的宿主 `.headerUtilities` 是 `flex:none`、
没有 `min-width:0`，**根本不参与收缩**；图内 7 个节点又是 `min-width:58px` 固定、6 条连线各 16px，
一行下来约 578px（带 token 可到 ~790px）。于是窄窗口下标题行被直接撑破，流程图既没随屏幕缩小，
也没落在用户期望的位置（「标准模式」标签后面）。

改法 = **换挂载点 + 让容器能被压缩 + 按标题行宽度分档降级 + 修正详情面板锚点**，共 4 件，
外加一个可复跑的 headless 探针把这四条量出来。宽屏（≥880px 容器宽）视觉与现状逐项一致。

```
现在：流程图挂在右上 utilities（flex:none，不收缩）
┌──────────────────────────────────────────────────────────────────────────┐
│ 会话标题 /                       [进度 ●─●─●─●─◉─○─○ 3/12] ← 撑破 ← 其他工具│
└──────────────────────────────────────────────────────────────────────────┘

改后：流程图挂在 header.actions，紧随「标准模式」标签；容器查询按宽度降级
┌──────────────────────────────────────────────────────────────────────────┐
│ 会话标题 /  [标准模式] [●─●─◉─○─○─○─○ 3/12]        [官方工具按钮…]        │
│                       ↑ order 0（preset 标签是 -10，故在其后）             │
└──────────────────────────────────────────────────────────────────────────┘
```

## 判定标准（可证伪）

用 headless Chrome 渲染「会话头部标本页」（复刻 `.titleRow` 的 inline-size 容器 + 真实插件 CSS +
真实节点模型），在六档视口宽度下断言：

| 断言 | 量法 | 通过条件 |
|------|------|----------|
| A1 标题行不溢出 | `.titleRow` 的 `scrollWidth - clientWidth` | 1280/1024/900/768/640/480 六档均 ≤ 0.5 |
| A2 档位可见集正确 | 逐档统计节点名 / token / 连线 / 圆点的 `display` | 与下方档位表逐档一致 |
| A3 当前节点恒可见 | `[data-state="current"]` 节点包围盒 | 各档可见且宽 > 0（降级不吞掉「我在哪」） |
| A4 详情面板不越界 | 图表点击后面板 `getBoundingClientRect()` | `left ≥ 0` 且 `right ≤ innerWidth`（六档） |
| A5 宽档零回归 | 880px 档节点数 / 连线数 / 计数文本 | 7 节点、6 连线、计数为 `done/total`，与迁移前一致 |
| A6 挂载点与顺序 | 源码单测：注册名与 order | `conversation.session.header.actions` 且 order = 0（>-10） |

复跑入口：`npx tsx scripts/header-progress-probe.mts`
（退出码 0 = 全档通过；1 = 有档不通过；2 = 环境不可用——响亮失败，不静默跳过）。

## 产品定义

「会话头部需求流程图」是本插件在 DSH 会话标题栏里放的一张常显小卡：它回答
**「这个会话绑定的需求走到哪一步了、做完几件事」**——圆点四态（完成 ✓ / 当前 ● / 未到序号 / 分类跳过 —），
节点间连线表示已推进的边，右侧计数是任务 `done/total`；点任意节点在下方展开该阶段详情面板
（任务清单 + 状态时间线 + DAG 画布）。

它的宿主是 DSH 官方会话头 `ConversationSessionHeader` 的标题行，该行只有三个座位：

| 座位 | 位置与约束 | 现状占用者 |
|------|-----------|-----------|
| `conversation.session.header.actions` | 标题右侧、`titleCluster` 内，`flex:none` | subagent 目录（-30）、Team 导航（-20）、**模式标签「标准模式」（-10）** |
| `conversation.session.header.utilities` | 标题行最右、`flex:none` 且 `margin-left:20px` | 日程（-5）、会话日志导出、在应用中打开 |
| `conversation.session.header.corner` | 更右侧的角落 | 右侧栏开关 |

标题行（`.titleRow`）是全头部**唯一**的 `container-type: inline-size` 容器，官方的模式标签正是靠
`@container (max-width: 540px)` 在窄屏自我隐藏的。本插件的流程图既没挂在这个容器语义下，
自身也没有任何宽度自适应规则——这就是「大小没适配屏幕」的全部根因。

受影响场景：小窗口 / 分屏 / GUI 内嵌面板 / 高分屏（CSS 宽度约 840px）/ 侧栏展开挤压会话宽度。

## 用户与角色

- **会话里的用户（PM / 需求方）**：长任务跑一半回头看「做到哪了」，靠这张图定位；标题行被撑破时它反而挡掉了官方工具按钮。
- **实施 agent**：向用户汇报进度、截图作为证据时，头部溢出会让截图不可用作证据。
- **前端维护者（本插件）**：需要一个明确的「挂载点 + 宽度档位」约定，而不是每次遇到窄屏再补一条 hack。

## 功能点

- **FR-1: 挂载点迁到「模式标签之后」**——注册槽位由 `conversation.session.header.utilities` 改为 `conversation.session.header.actions`，order = 0（模式标签是 -10，故渲染在其右侧）；仍为 session 作用域、仍注入 `sessionId`，无需求时渲染 null 的零噪音语义不变
- **FR-2: 标题行不再被撑破**——流程图容器可收缩（`min-width: 0` + `max-width: 100%` + 内层 `overflow-x: auto` 兜底），六档视口下 `.titleRow` 无横向溢出
- **FR-3: 按标题行宽度分档降级（容器查询）**——四档阈值写死，逐档只减信息不丢定位（当前节点恒可见）

  | 档位（`.titleRow` 容器宽） | 渲染内容 | 估算宽度 |
  |------|----------|----------|
  | ≥ 880px | 圆点 + 节点名 + 节点 token + 连线 + 计数（全量） | ~580–790px |
  | 620–880px | 去掉节点 token，其余同全量 | ~580px |
  | 460–620px | 再去掉连线与非当前节点的名称（只留圆点，当前节点保留名称） | ~260px |
  | < 460px | 只留圆点行 + 计数（模式标签亦已在 ≤540px 自行隐藏） | ~250px |

- **FR-4: 详情面板不越界**——面板锚点由 `right: 0` 改为以图表左缘为基准向右展开，宽度 `min(420px, calc(100vw - 32px))`；展开后包围盒完全落在视口内（迁移前左对齐会让窄屏面板向左出屏）
- **FR-5: 宽屏视觉零回归**——容器宽 ≥880px 时，节点尺寸/四态配色/连线/计数/点击展开行为与迁移前逐项一致，唯一差异是水平位置
- **FR-6: 可复跑的头部自适应探针**——新增探针脚本（标本页 + headless Chrome）覆盖 A1–A5 四条量法，并新增单测锁 A2/A6 的静态契约（挂载名、order、档位阈值、节点模型仍为 7 节点）

## 边界

**做**：

1. 挂载点与顺序迁移：`src/client/index.ts`（槽位名 + order + 注释里那句错误的「模式选择器在 utilities、order:10」一并改正）
2. 流程图响应式样式：`src/client/styles/board.ts`（`.dsh-pm-cprog` / `.dsh-pm-cprog-inline` / `.dsh-pm-flow*`）与 `src/client/styles/token.ts`（`.dsh-pm-flow-token`）里的容器查询档位；详情面板锚点与宽度上限
3. 把「需求状态 → 节点四态/标签/token」的映射抽成一个可离屏调用的纯函数（组件与探针共用同一份模型，避免探针自造一份会漂移的假数据）
4. 探针脚本 `scripts/header-progress-probe.mts` + 对应单测（阈值、挂载契约、模型形状）

**不做**：

1. 不改数据来源与状态机映射：`/session/:id/progress` 请求、15s 轮询、SSE 刷新、`FLOW` 七节点、`CATEGORY_FLOW_PROFILES` 跳过逻辑、`STATUS_LABEL` 全部保持原样
2. 不改详情面板内容与交互：node-panel 渲染器、时间线、DAG 画布、看板入口校验、`open-doc` 打开产物一律不动
3. 不改 DSH 宿主：不碰 `ui-conversation` / `ui-agent-preset` 源码，不改官方槽位定义与头部布局，只改本插件的注册与样式
4. 不做 JS 宽度监听 / ResizeObserver（容器查询足够），不给流程图加 hover 折叠或 Tooltip 形态的新交互

## 档位依据（轻档）

- **L1 一句话目标 + 可证伪判定**：把流程图从右上 utilities 移到模式标签后并让它随宽度降级——判定见上方 A1–A6 六条量法。
- **L2 范围边界**：见上「做」4 条、「不做」4 条，名单之外即本次不做。
- **L3 轻路径依据**：改动面 = 1 处注册（`src/client/index.ts`）+ 2 个 CSS 分片 + 1 个纯函数抽取 + 1 个探针脚本；档位阈值（880 / 620 / 460）与面板锚点已在本文定死，无第二个未定决策。
- **L4 批准闸门 + 下一步**：下一步 = design；本文件落盘 → `reqboard_submit(kind=requirement)` 登记 → `reqboard_ask_confirm(target=artifact, kind=requirement)` 请人确认，未获批准不得进入设计。
- **L5 轻档 ≠ 无产物**：本 `requirement.md` 即产物，落盘 + 登记 + 确认三步照走。
- **单向升级**：实施中若出现「需要 JS 监听宽度」「需要改 DSH 宿主头部结构」「需要改节点集合或数据结构」「需要重做面板为独立浮层组件」任一信号，立即停手升级重档，不反向降级。

## 总览

| 项 | 内容 |
|----|------|
| 挂载点 | `conversation.session.header.utilities` → `conversation.session.header.actions`（order 0） |
| 根因 | `.headerUtilities{flex:none}` 不收缩 + 节点 `min-width:58px` 固定 7 节点 ≈ 578px |
| 降级手段 | `.titleRow` 的 `@container` 查询四档（880 / 620 / 460） |
| 面板修正 | `right:0` → 左缘基准向右展开 + 宽度 `min(420px, 100vw-32px)` |
| 验证 | `npx tsx scripts/header-progress-probe.mts`（六档视口 × A1–A5）+ 单测（A2/A6） |
| 宽屏回归 | ≥880px 容器宽逐项与迁移前一致 |

## 下一步

design —— 用 `reqboard_ask_confirm(target=artifact, kind=requirement)` 交棒；未获批准不得进入设计。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t2、t3 |
| FR-2 | ✅ 已接收 | t4、t5 |
| FR-3 | ✅ 已接收 | t4、t5、t1 |
| FR-4 | ✅ 已接收 | t4、t5 |
| FR-5 | ✅ 已接收 | t5、t6 |
| FR-6 | ✅ 已接收 | t5、t6 |

> 无未接收条款（6 条全部有落点）。

<!-- reqboard:marks:end -->
