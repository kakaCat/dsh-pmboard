---
requirement_refs: [FR-7]
serves: [FR-7]
---

# 前端设计（REQ-261006201841-944d 归档条来源三态） `serves: FR-7`

> 状态：design · 窗口 session-95c36a7d · 2026-10-06
> 范围：本文只写**端侧前端**（`requirement.md` front-matter `sides` 含 frontend）——看板归档条的来源三态标注 + 点开后的来源提示块。
> 服务条款：**FR-7**。FR-1…FR-6、FR-8 的判据在服务端与知识层，见 `architecture.md` / `data-model.md` / `interfaces.md`。
> 契约纪律：`/state` payload（I-8）与 `renderArchivedBar(cards, limit, origins)` 签名及 DOM（I-9）**逐字照用**，本文不改签名、不发明第二套字段。

## 原型页面 `serves: FR-7`

**唯一权威原型**：`prototypes/archive-source-label.html` —— 即 `prototypes/INDEX.md` 四列表格里状态为
`authoritative` 的那一条（服务条款 FR-7）。表内其余行均为 `superseded`——本文**一处不引**（引到被取代版本会被版本门硬拒）。

**锚点**：`prototypes/archive-source-label.html#FR-7`（页内 `<section id="FR-7">`）。锚点只用于定位页内区块，
**不计入 serves**（`protoRefs` 单独记账）。

原型里已有的三态与交互路径：

| 页内区块 | 内容 | 本设计对应 |
|---|---|---|
| §1 三态并排对照 | A 本仓 / B 在别处（`dsh-notice-webhook`、`quantsys-v2`）/ C 归属未知，各 3 条 chip | C-1-1、C-2 |
| §2 紧凑态与 hover 态 | 默认紧凑、hover 态、来源标注不位移 | 样式与主题「hover 不位移」 |
| §3 点开后的提示块 | B 态「在别处」提示（来源项目 / 判据 / 下一步）；C 态「归属未知」提示；A 态对照（不插块） | C-3 |
| §4 归档材料人读面小样 | FR-5 人读三件套 + FR-6 机器产物折叠（一行一类 + `queue.json` 摘要） | 仅作人读面参照，页内区块 `id=fr-5-fr-6-archive-materials` **不是 FR 锚点** |
| §5 改动面 | DOM / 新增选择器 / 判据单一来源 / 可访问性 | 目录与包结构、样式与主题、前端边界 |

| 页面/组件（编号） | 原型锚点（`P-x/C-x ↔ #FR-N`） | 关联 D-x | 该处结构与交互（一句话） |
|---|---|---|---|
| P-1 | P-1 ↔ prototypes/archive-source-label.html#FR-7 | D-4、D-6 | 看板底部「已归档」条：chip 尾部带来源标注，三态并排可对照 |
| C-1-1 | C-1-1 ↔ prototypes/archive-source-label.html#FR-7 | D-6 | 归档 chip：点开走既有 `open-req`，C 态必须与 A 态视觉可分 |
| C-3 | C-3 ↔ prototypes/archive-source-label.html#FR-7 | D-2、D-6 | 详情顶部来源提示块：把「为什么读不到」说清楚，不越界读别的项目 |
| C-3（§4 参照） | C-3 ↔ prototypes/archive-source-label.html#FR-7 | D-2 | 人读面分层：结论 / 去向 / 清单在顶层，机器产物折叠——前端不据此推断文件位置 |

**交互路径**（点什么 → 发生什么 → 去哪）：

1. 点 chip → 冒泡到既有 `data-action="open-req"` 委托 → `mode = { kind: 'req', reqId }` → 重绘为需求详情（**不新增事件类型**）。
2. B/C 态 chip 点开 → 详情根 `.dsh-pm-detail[data-detail-req]` 内、头部段之后出现 C-3 提示块；A 态点开 → 不出现任何提示块。
3. 点详情「← 看板」（既有 `data-action="back"`）→ 回看板，归档条与标注逐字不变。

### 原型观测量（只记名与实测值） `serves: FR-7`

全部取自原型 `<!-- proto-geometry … -->` 块，测量条件：窗宽 **1280**、静态读数（`inflight`）。

| 观测量 | 实测值 | 口径 |
|---|---|---|
| `chipHeight` | 24px | 单条 chip 高度（`font-size:11px` + `padding:2px 8px` + `border:0`） |
| `chipWidthWidest` | 456px | 最宽一条的自然宽（10px id + 标题 + 计数 +「别处·dsh-notice-webhook」） |
| `chipWidthCeiling` | 480px | 原型里 chip 的宽度上限声明（`max-width`） |
| `textWidthCeiling` | 200px | 标题截断上限 |
| `srcNameWidthCeiling` | 150px | 项目名截断上限 |
| `idFontSize` | 10px | REQ id 字号（既有 chip 为 11px） |
| `chipsGap` | 6px | chip 横向间距（`.dsh-pm-archived-chips { gap }`） |
| `barPaddingY` | 8px | 归档条纵向内边距（`padding: 8px 20px`；chip 行 `padding-top` 同为 8px） |
| `stateGroupCount` | 3 | 三态组数（A 本仓 / B 在别处 / C 归属未知） |

### 阈值（本文定案——阈值属设计决策，不写回原型） `serves: FR-7`

| 阈值 | 取值 | 与观测量的关系 | 越界时的行为 |
|---|---|---|---|
| chip 单行最大宽度 | **480px**（窄屏 `min(480px, 100%)`） | 取 `chipWidthCeiling`；须 ≥ `chipWidthWidest`(456) + 24px 余量 | 先截断标题、再截断项目名；**chip 不折行** |
| 标题截断 | **200px** | 取 `textWidthCeiling` | 省略号截断；全值仍由 `title` 披露 |
| 项目名截断 | **150px** | 取 `srcNameWidthCeiling` | 省略号截断；依据 = 实测最长项目名 `dsh-notice-webhook` 在该档仍整名显示 |
| chip 高度上限 | **24px** | 取 `chipHeight` | 超过即视为布局回归：`.dsh-pm-archived-chips` 显式 `align-items: flex-start` |
| REQ id 字号 | **10px** | 取 `idFontSize`（既有 11px → 降 1px） | 不降则加标注必折行（11px id 单占约 150px）；替代方案见 K-1 |
| 归档条纵向内边距 | **8px（不变）** | 取 `barPaddingY` | 归档条总高不变——37 条回看的密度不因本需求膨胀 |
| 三态值域 | **3**（`local` / `elsewhere` / `unknown`） | 取 `stateGroupCount` | 出现第 4 个 `kind` → 按 `unknown` 渲染，不静默当 A 态 |

## 目录与包结构 `serves: FR-7`

```
src/client/
├── views/board.ts        （改动：renderArchivedBar 增第三参 + 新增提示块渲染器）
├── views/stage-detail.ts （改动：旧详情 head 段接受可选 origin 入参）
├── views/report-tabs.ts  （改动：新壳 head 段接受可选 origin 入参）
├── styles/base.ts        （改动：归档条分片新增 4 条选择器）
├── types.ts              （改动：RequirementOrigin + BoardState.origins）
└── board-mount.ts        （改动：1 处接线，把 state.origins[reqId] 下传）
```

| 路径（完整相对路径） | 内容（一句话职责） | 新增/改动 | 落此处的理由（为什么不放别处） |
|---|---|---|---|
| src/client/views/board.ts | 归档条 chip 三态渲染 + 来源提示块渲染（纯字符串） | 改动 | 归档条与提示块是同一套「来源标注」语汇；分两文件会造出两份文案与两个判据读点 |
| src/client/styles/base.ts | 归档条分片：三态 4 条选择器 + chip 行对齐 | 改动 | 既有 `.dsh-pm-archived-*` 分片就在此处；换文件会让同族样式分居两处 |
| src/client/types.ts | `RequirementOrigin` 类型与 `BoardState.origins` 可选字段 | 改动 | 与既有 `BoardState` 定义同处，前端只有一个 payload 类型入口 |
| src/client/board-mount.ts | 装配点：把 `state.origins?.[reqId]` 传给两条详情渲染路径 | 改动 | 详情视图的唯一装配处；不在这接线就得让两个渲染函数自己去读全局 state |
| src/client/views/stage-detail.ts | `buildReqDetail(..., origin?)`：旧详情回落路径的提示块位 | 改动（可选尾参） | 旧路径的 head 段在这里产出；缺省不传 = 产物逐字不变 |
| src/client/views/report-tabs.ts | `buildReportShell(..., opts.origin?)`：新壳 head 段的提示块位 | 改动（可选字段） | 新壳的分段装配在这里，提示块落在 head 段内不破坏既有分段断言 |

**数据源（服务端，非前端文件）**：`src/http/routers/stages.ts` 派生 `origins`（I-8）——前端只消费，不派生。

## 组件结构 `serves: FR-7`

```
P-1 看板视图（buildBoard：泳道 + 底部归档条；纯字符串、零 DOM）
├── C-1 归档条（renderArchivedBar：<details class="dsh-pm-archived-fold" data-archived-bar> 折叠回看）
│   └── C-1-1 归档 chip（<button data-action="open-req" data-status>：REQ id · 标题 · n/m 进度）
│       └── C-2 来源标注（<span class="dsh-pm-archived-src" data-src>：本仓 | 别处·项目名 | 归属未知）
│           ← state.origins[reqId]（缺键 → 该条整段不渲染）
└── ← 无事件订阅：点击走既有 open-req 委托，归档条不新增 Events

P-2 需求详情（新壳 buildReportShell / 旧详情回落 buildReqDetail；根 .dsh-pm-detail[data-detail-req]）
└── C-3 来源提示块（renderArchivedSourceHint：B/C 态可读提示；A 态与缺 origins 时返回 ''）
    ← origin（由 board-mount 按 state.origins[reqId] 下传；缺省 = 不渲染）
```

关键入参与事件：

- `renderArchivedBar(cards, limit = ARCHIVED_CHIPS_MAX, origins?)`：第三参缺省 = 旧服务端 → 不渲染来源标注。
- `renderArchivedSourceHint(reqId, origins?)`：返回字符串；`origins` 缺省 / 缺该 req 键 / `kind === 'local'` → 返回 `''`。
- Events：**零新增**（本仓客户端为「字符串渲染 + `data-action` 事件委托」，不引入组件事件）。

## 页面与组件（编号表） `serves: FR-7`

| 编号 | 类型 | 名称 | 职责（动宾结构，含响应操作） | 数据来源（接口/状态/Props） | 新增/改动 | serves |
|---|---|---|---|---|---|---|
| P-1 | 页面 | 看板视图 | 展示泳道与底部归档条，点击 chip 切到该需求详情 | `/state` → `BoardState` → `buildBoard(state, …)` | 改动 | FR-7 |
| C-1 | 组件 | 归档条 | 折叠展示终态需求条目、提示超限条数，并向下透传 `origins` | `toTerminalCards(state)` + `state.origins` | 改动 | FR-7 |
| C-1-1 | 组件 | 归档 chip | 展示 REQ id / 标题 / 进度，响应点击打开详情 | `ReqCard` + `origins[req.id]` | 改动 | FR-7 |
| C-2 | 组件 | 来源标注 | 展示该需求来源三态的可读文本，不单独响应点击（点击归 chip） | `origins[reqId].kind / projectName` | 新增 | FR-7 |
| C-3 | 组件 | 来源提示块 | 在详情顶部说明「在别处 / 归属未知」并给下一步入口，不响应点击 | `origins[reqId]`（仅 `elsewhere` / `unknown` 渲染） | 新增 | FR-7 |

## 状态与降级矩阵 `serves: FR-7`

| # | 输入条件 | chip 表面（C-2） | chip 属性 | chip `title` | 提示块（C-3） | 依据 |
|---|---|---|---|---|---|---|
| S-1 | `origins` 整个缺省（旧服务端） | 无来源标注 | 无 `data-src` / 无 `data-project` | 逐字 = 原标题 | 不渲染 | I-9 逐字降级 |
| S-2 | `origins` 有，但缺该 req 键 | 该条无标注；其他条照常 | 同上 | 逐字 = 原标题 | 该条不渲染 | I-9（逐条降级，不整条带崩） |
| S-3 | `kind = 'local'` | `本仓`（纯文字，最轻） | `data-src="local"` | 逐字 = 原标题 | 不渲染 | FR-7 流程 2 |
| S-4 | `kind = 'elsewhere'` + `projectName` | `别处·<span class="dsh-pm-archived-src-name">项目名</span>` | `data-src="elsewhere" data-project="项目名"` | `标题（项目名）` | B 态提示块 | FR-7 流程 3；I-8 |
| S-5 | `kind = 'elsewhere'` 但 `projectName` 缺失（契约违约） | `别处·未命名项目`（**不编造**名字） | `data-src="elsewhere"`，**不输出** `data-project` | `标题（未命名项目）` | B 态提示块，来源项目行写「服务端未提供项目名」 | 数据模型约束②：`elsewhere` 必带 `projectName` |
| S-6 | `kind = 'unknown'` | `归属未知`（警示色 + 虚线边框胶囊） | `data-src="unknown"`，无 `data-project` | `标题（归属未知）` | C 态提示块 | **D-6**：台账 3 条无 `workspaceRoot` 的记录一律标「归属未知」，不冒充本仓 |
| S-7 | `kind` 值域外（第 4 值） | 同 S-6 | 同 S-6 | 同 S-6 | C 态提示块 | 阈值表 · 三态值域（值域外不静默放行） |

**三态的判据来源只有一处**（**D-4**：跨项目一律按 `projectId` / `workspaceRoot` 定位、不退回路径字符串比较）：
`data-src` 的取值**只**来自 `state.origins[reqId].kind`。前端代码里不出现 `startsWith` / 路径相等 /
`workspaceRoot` 拼接派生 `kind` 的写法——本文全篇不消费 `state.workspaceRoot`。

**点开后的提示块**（FR-7 验收标准 2：「点开一次，页面出现『在别处』提示文案，不再是空白块」）：

| 态 | 首行（加粗文案＝态的可读标识） | 其余行 | 下一步 |
|---|---|---|---|
| B 态（`elsewhere`） | `<b>在别处</b>` | 来源项目（`projectName`）· 判据 `by`（`project-id` / `path-fallback`） | 到该项目里打开 DSH 看板「已归档」；或在该项目目录下打开 `docs/requirements/<REQ>/archive.md` |
| C 态（`unknown`） | `<b>归属未知</b>` | 原因：台账记录既无 `projectId` 也无 `workspaceRoot` · 本次兜底：归档校验按当前工作区执行，但展示层不把兜底当身份（**D-6**） | 核实该需求当初是否在本仓创建；是 → 人工补台账 `workspaceRoot`（本需求不追溯改写） |

两态都带一句不越界声明（FR-7 边界 1）：本仓看板**不读**别的项目工作区。
需求根的绝对路径**由服务端随 `origins[reqId].root` 下发**（I-8 已增该可选字段，裁定见 K-3），
B 态提示块显示它——但前端**只显示、不比较、不拼接**：不得用 `state.workspaceRoot` 自己拼一个根出来
（那正是 D-4 禁止的路径拼接型判定）；`root` 缺键（`unknown` 态或旧服务端）时该行整行不渲染。

## 样式与主题 `serves: FR-7`

**新增选择器恰好 4 条**（逐字照 I-9：`.dsh-pm-archived-src` 三态 + `.dsh-pm-archived-text`）：

| # | 选择器 | 声明要点 | 令牌 / 色值来源 |
|---|---|---|---|
| 1 | `.dsh-pm-archived-text` | `max-width: 200px; display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap` | 无新令牌（尺寸阈值见上表） |
| 2 | `.dsh-pm-archived-src[data-src="local"]` | `font-size: 10px; color: var(--dsw-text-secondary); opacity: .75; font-family: inherit` | `--dsw-text-secondary` |
| 3 | `.dsh-pm-archived-src[data-src="elsewhere"]` | `color: var(--dsw-accent); background: rgba(74,125,255,.10); border: 1px solid rgba(74,125,255,.28); border-radius: 4px; padding: 0 5px; font-size: 10px` | `--dsw-accent` + 既有分片同源 rgba（accent 74,125,255，见 `.dsh-pm-archived-chip:hover`） |
| 4 | `.dsh-pm-archived-src[data-src="unknown"]` | `color: var(--pm-c-warn); background: rgba(176,120,0,.14); border: 1px dashed rgba(176,120,0,.45); border-radius: 4px; padding: 0 5px; font-size: 10px; font-family: inherit` | `--pm-c-warn` + 既有分片同源 rgba（warn 176,120,0，见 `.dsh-pm-artifact-chip.pending`） |

另有**两条既有选择器上的小改动**（不是新增选择器）：`.dsh-pm-archived-chips` 加 `align-items: flex-start`
（否则 flex stretch 把 24px 的 chip 拉到 40px）；`.dsh-pm-archived-chip` 的宽度上限写成
`max-width: min(480px, 100%)`（窄屏不横向溢出，不新增断点）。

**为什么 C 态用警示色 + 虚线边框（而不是灰、也不只靠颜色）**：

- 灰 = 「没什么可说的」，会被读成「本仓默认」——那正是 **D-6** 要禁的「冒充本仓」。
- 虚线边框是**非颜色编码**的「这里有个待补的洞」，色盲用户同样可辨（满足 WCAG 1.4.1 不靠颜色单独传达信息）。
- 颜色只在第二层做强化：任取一条 chip 去掉颜色后，`本仓` / `别处·项目名` / `归属未知` 三段文本语义不丢。

**提示块零新增选择器**：容器复用既有的 `.dsh-pm-cprog-panel-note`（软底注记块），状态由首行加粗文案承担，
DOM 上用属性做测试钩子（属性不是选择器）：`<div class="dsh-pm-cprog-panel-note" data-archived-source-hint data-src="elsewhere|unknown" data-req="REQ-…">`。
原型 §3 给提示块画了 accent / warn 左侧色条，本稿去掉——守住「新增选择器 ≤4 条」的硬预算（见 K-2）。

**主题适配**：新增声明只用既有 `--dsw-*` / `--pm-*` 令牌与既有分片里出现过的同组 rgba，
不新增主题分支、不换字体族；深浅主题跟随既有 token 层，无需 `prefers-color-scheme` 规则。

## 状态管理 `serves: FR-7`

- `origins` 是**服务端推送的只读快照**，随 `BoardState` 同一刷新周期到达；不进任何新增客户端 store，也不做本地缓存。
- 组件**无内部状态**：hover 归 CSS `:hover`（无 JS 状态、无位移）；归档条折叠归 `<details>` 原生状态（既有）。
- 为什么不把 `origins` 提升为独立全局状态：它与其他 payload 字段同源同新鲜度，单独缓存会造出第二个新鲜度口径（本仓既有教训）。
- 为什么提示块不自己取数：详情两条渲染路径都由 `board-mount` 装配，取数点越少越不会出现「chip 说在别处、详情说本仓」的双口径。

## 路由与导航 `serves: FR-7`

- **无新增 / 无改动路由**：本仓看板是单页视图切换（`mode` 闭包变量），没有 URL 路由。
- 导航路径（逐字沿用既有）：chip → `data-action="open-req"` → `mode = { kind: 'req', reqId }` → `render()`。
- C-3 位置：详情根 `.dsh-pm-detail[data-detail-req]` 内、**头部段之后**（新壳落在 head 段内，旧详情落在 head 之后）；不新开路由、不弹窗。
- 返回路径不变（既有 `data-action="back"`）；旧服务端（缺 `origins`）下，详情与看板都与改动前一致（S-1）。

## 可访问性 `serves: FR-7`

- **三态皆有可读文本**：`本仓` / `别处·项目名` / `归属未知`——不靠颜色单独传达信息。
- **`title` 全值披露**：标题被 CSS 截断到 200px，全值仍在 `title` 里；B/C 态只**追加**后缀（`（项目名）` / `（归属未知）`），不吞掉原标题。
- **hover 无位移**：`:hover` 只改背景与前景，不改 `padding` / `border-width` / `display`——行宽不跳动（无 CLS、无误点）。
- **焦点描边不删**：本稿不写任何 `outline: none` / `outline: 0`，保留 UA 默认焦点环（也不新增选择器，见 K-6）。
- **点击目标不缩**：chip 高度维持 24px（既有值），提示块不覆盖 chip 的可点区域。
- **不新增 `aria-*`**：不扩大 I-9 的 DOM 契约；chip 的可访问名已含 REQ id / 标题 / 进度 / 来源文本。

## 前端边界（不做的事） `serves: FR-7`

- **不做跨项目读文件**（FR-7 边界 1）：前端只显示来源与提示文案，不去别的项目工作区取数。
- **不比较路径字符串派生 `kind`**（**D-4**）：`kind` 只从 `state.origins[reqId]` 读；前端无 `startsWith` / 路径相等 / 根拼接。
- **不编造来源**（**D-6**）：无 `projectName` 时写「未命名项目」，无 `kind` 时按未知处理；绝不用 `projectId` 冒充可读名字，也绝不把 C 态渲染成 A 态。
- **不引入文件物理位置语义**（**D-2**：机器产物只做呈现层折叠、不搬迁）：提示块里出现的 `docs/requirements/<REQ>/archive.md` 只是一个**给人抄的固定相对路径**；前端不据此推断机器产物在哪、不提供「打开目录 / 搬迁」类入口。
- **不新增事件类型、不改既有属性语义**：`data-action / data-req / data-status / title` 逐字保留。
- **不改既有行为**：`renderArchivedBar` 前两参语义、`ARCHIVED_CHIPS_MAX`、`<details>` 默认折叠、列表视图不出现归档条——一律不动。

## 前端用例与判据 `serves: FR-7`

断言口径 = 字符串包含 / 不包含（可被 `tests/` 逐条落地），全部为纯函数调用，零 DOM。

| 用例 | 构造 | 断言（含 / 不含） | 依据 |
|---|---|---|---|
| U-1 | `renderArchivedBar(cards)` 只传两参（旧服务端） | **不含** `dsh-pm-archived-src`、**不含** `data-src=`；`title="<标题原文>"` 逐字 | I-9 逐字降级 |
| U-2 | `origins` 有别的 req、无本条该键 | 该条不含 `dsh-pm-archived-src`；**另一条**含 `data-src="elsewhere"`（逐条降级） | I-9 |
| U-3 | `{ kind: 'local' }` | 含 `data-src="local"` 与 `>本仓<`；**不含** `别处`、**不含** `归属未知`；`title` 逐字 = 原标题 | FR-7 流程 2 |
| U-4 | `{ kind: 'elsewhere', projectId: 'p1', projectName: 'dsh-notice-webhook' }` | 含 `data-src="elsewhere"`、`data-project="dsh-notice-webhook"`、`dsh-pm-archived-src-name`；`title` 含 `（dsh-notice-webhook）` | FR-7 流程 3、I-8 |
| U-5 | `{ kind: 'elsewhere' }`（缺 `projectName`） | 含 `别处·未命名项目`；**不含** `data-project`（空值属性 = 编造） | 数据模型约束② |
| U-6 | `{ kind: 'unknown' }` | 含 `data-src="unknown"` 与 `归属未知`；**不含** `本仓`、**不含** `data-project` | **D-6**、FR-7 流程 4 |
| U-7 | `{ kind: 'orbit' }`（值域外） | 产物与 U-6 同形（按 `unknown` 渲染），不抛错 | 阈值表 · 三态值域 |
| U-8 | 任一态 | `data-action="open-req"`、`data-req`、`data-status`、`n/m` 计数逐字保留；`<details>` 无 `open` | I-9、既有归档条用例 |
| U-9 | `renderArchivedSourceHint(id, { kind: 'elsewhere', projectName: 'x', by: 'project-id' })` | 含 `data-archived-source-hint`、`data-src="elsewhere"`、`<b>在别处</b>`、项目名、不越界声明 | FR-7 验收标准 2 |
| U-10 | `{ kind: 'unknown' }` | 含 `<b>归属未知</b>`、`projectId`、`workspaceRoot`、不越界声明 | **D-6** |
| U-11 | 缺省 / `{ kind: 'local' }` | 返回 `''`（空串——不占位、不渲染隐藏元素） | FR-7 流程 2（A 态对照） |
| U-12 | `buildReqDetail(...)` 不传可选尾参；`buildReportShell(...)` 不传 `opts.origin` | 产物与改动前**逐字节一致** | I-9 逐字降级 |

## 依赖与第三方库 `serves: FR-7`

**零新增依赖。**

| 依赖 | 版本 | 用途 | 为什么选它（不选的替代方案） |
|---|---|---|---|
| 无 | — | — | 三态是纯字符串 + CSS；引 UI 组件库 / 图标库会引入新视觉体系并违反 FR-7 边界 2（沿用既有分片与令牌） |

## 关键决策与取舍 `serves: FR-7`

| # | 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|---|
| K-1 | 「缺 `origins` 逐字不变」的**范围** | 让 `.dsh-pm-archived-id` / `.dsh-pm-archived-text` 两处包裹也只在新态出现 | 两处包裹与 10px id **全局生效**，逐字不变的承诺只覆盖「属性与来源标注」 | I-9 的 DOM 契约把这两个 span 写进 chip 形态；原型定案 id 降 1px 省约 20px，否则加标注必折行 |
| K-2 | 提示块的视觉区分 | 照原型 §3 给提示块画 accent / warn 左侧色条 | 复用既有 `.dsh-pm-cprog-panel-note`（**零新增选择器**），B/C 靠首行加粗文案区分 | 新增选择器硬预算 = 4 条（I-9）；色条要占第 5 条。代价是提示块的「态」不如 chip 显眼，由 chip 的虚线胶囊补偿 |
| K-3 | 提示块是否显示需求根 / 需求目录绝对路径 | 照原型 §3 显示绝对路径（需给 I-8 的 `origin` 加 `root` 字段） | **采纳**：I-8 的 `RequirementOrigin` 增可选 `root`（服务端派生的生效根），B 态提示块显示它，`root` 缺键时整行不渲染 | 前端不准自己拼根（**D-4**）；但**显示服务端下发的根**不是"比较/拼接路径"，不触红线。扩一个可选字段的代价 < 让设计与权威原型互相说谎的代价 |
| K-4 | chip 宽度上限 | 原型原样 `max-width: 480px` | `max-width: min(480px, 100%)` | 窄屏（可用宽 < 520px）480px 会横向溢出；`min()` 不新增断点也不新增选择器 |
| K-5 | C 态配色 | 灰（「没什么可说」）+ 仅颜色编码 | `--pm-c-warn` 警示色 + **虚线边框** | 灰会被读成「本仓默认」，正犯 **D-6** 要禁的「冒充本仓」；虚线是「待补的洞」的非颜色编码，色盲可辨 |
| K-6 | 焦点环 | 统一成 report.ts 那套 halo | 不写 `outline` 重置，保留 UA 默认焦点环 | 统一 halo 的 `:is()` 链作用域在 `[data-report-shell]`，归档条不在其中；要统一就得再加选择器，超出 4 条预算 |

## 技术方案与亮点 `serves: FR-7`

**技术栈与关键依赖**：无新增（既有 TypeScript 字符串渲染 + CSS 分片拼接），见上节。

**模块划分**：

| 模块 / 文件 | 职责 |
|---|---|
| src/client/views/board.ts | chip 三态渲染 + 提示块渲染（纯字符串，零 DOM、零 IO） |
| src/client/styles/base.ts | 三态 4 条选择器 + chip 行对齐 |
| src/client/types.ts | `RequirementOrigin` / `BoardState.origins`（可选字段，旧 payload 兼容） |
| src/client/board-mount.ts | 装配点：`state.origins?.[reqId]` 下传（1 处） |
| src/client/views/stage-detail.ts / report-tabs.ts | 两条详情路径的可选 `origin` 入参（缺省零变化） |

**设计模式**：**哑视图（humble view）+ 服务端派生视图模型**——判据全在服务端（架构取向 A-4），
客户端只做字符串投影，没有客户端状态机。收益：三态用例是纯函数调用，不需要 DOM 环境或事件模拟。

**关键实现手法**：

- 缺省第三参让来源标注**整段短路**（不是「渲染空 span」）：旧输入下连属性都不出现，降级在字节层可辨（U-1）。
- 三态取值只查一次表（`origins?.[id]?.kind ?? null`），后续分支不再读 state——判据单点，不出现第二处读法。
- chip 表面文本与 `title` 后缀同源（一个变量同时喂两处），避免「看到的」与「读到的」不一致。
- 提示块 A 态/缺省返回**空串**而非隐藏元素：不占位、不参与布局，也不给测试留「看着空其实在」的歧义。

**攻克的难点**：

- 加标注后 chip 折行 → 把宽度交给阈值（标题 200px、项目名 150px）+ id 降 1px + `min(480px,100%)`；实测最宽 456px 仍单行（`chipWidthWidest`）。
- flex stretch 把 24px 的 chip 拉到 40px → `.dsh-pm-archived-chips { align-items: flex-start }`（原型实测）。
- 详情有两条渲染路径（新壳 / 旧详情回落），提示块要一处设计两处落地且缺省零变化 → 可选入参 + 缺省短路，不新增事件与路由（U-12）。

**与常规做法的差异**：

| 差异 | 常规做法 | 本方案 | 为什么 | 可核验指向（文件 / 测试） |
|---|---|---|---|---|
| 来源判定位置 | 前端拿 `workspaceRoot` 与需求目录比路径 | 服务端派生 `kind`，前端只读 | **D-4**：判据只能有一处实现 | I-8 派生规则表；U-3…U-6 |
| 三态视觉 | 三色 chip 或加图钉图标 | 文本为主 + 一处虚线边框 | 色盲可辨；不引新视觉体系（FR-7 边界 2） | 样式 4 条选择器；K-5 |
| 提示块承载 | 弹窗 / 新路由页 | 详情 head 段之后的纯字符串块 | 不加导航面；旧服务端逐字降级 | U-9…U-12 |
| 兼容策略 | 新字段必填 | 第三参可选 + 整段短路 | 新前端 + 旧服务端不白屏（既有纪律） | U-1、U-12 |
