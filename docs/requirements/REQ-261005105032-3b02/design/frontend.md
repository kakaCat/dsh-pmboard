---
serves: FR-1, FR-2, FR-3, FR-4, FR-7, FR-9, FR-11
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-7, FR-9, FR-11]
---

# 前端设计（REQ-261005105032-3b02） serves: FR-1, FR-2, FR-3, FR-4, FR-7, FR-9, FR-11

> 条件必交：本需求 `requirement.md` front-matter `sides` 含 `frontend`，故交本份。
> 本需求是**流水线机制改造**（原型进流水线 + 裁定落账 + 契约同源 + 校验同源），前端改动**极小**。
> 前端只有三件事：文档 Tab 把原型作为**确定交付物**单列（brief §10 #30）+ 验收单新增两个对照项渲染 +
> 保住既有分组计数恒等式。本包是**命令式字符串渲染**（无组件框架），故下文用「渲染块」表达组件结构。

## 原型页面 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

**本需求没有独立原型**——如实写，不拿别的页面充数。

| 项 | 事实 |
|---|---|
| 本需求有无原型资产 | **无**。交付物是「原型机制」本身（产物身份 + 门禁 + 权威版本 + 锚点判据），不是某个界面 |
| 为什么不补画一张 | 规则随本需求一起落地，此刻画图没有可对照的门禁；且会把「机制即交付物」混算成两件事（边界 1/7：不追溯存量） |
| 未来 UI 需求的原型放哪 | `docs/requirements/<REQ>/prototypes/<name>.html` + 权威清单 `prototypes/INDEX.md`（引用 brief 第 1 节；旧路径 `prototype/*.html` 仍识别并提示迁移） |
| 本需求自身的适配口径 | **都不做**（brief §10 #29）：规则由本需求实现，生效前不追溯（边界 1/7）；本需求无独立原型资产，也不写 `prototype_exempt`，本文件如实写明 |

前端侧只需把下面三件事**如实呈现**（不重算、不兜底伪造）：

| 呈现项 | 来源（唯一事实源） | 页面怎么说 |
|---|---|---|
| 有没有交原型 | 台账产物（`kind=prototype`） | 原型行存在 / 明说"未交原型"，不留白 |
| 哪一版是权威 | 服务端投影 `DocPanelEntry.prototypeRole` / `supersededBy`（`QueryDocs` 读 `INDEX.md` 得出，brief §10 #32） | 权威行标「权威」；被取代行标「被取代」并给 `被取代于` |
| 原型有没有判据 | 原型内 `id="FR-N"` 区块 + `<!-- proto-geometry {json} -->` 注释块 | 只显示"有/缺"，**不显示阈值**（阈值由设计阶段按真实数据定死，见 requirement.md 裁定 D-10） |

## 目录与包结构 <!-- serves: FR-2, FR-7 -->

改动落在三处：**取数（application/query）+ 渲染（client/views/panels）+ 唯一事实源（shared）**。

| 路径（完整相对路径） | 内容（文件 + 一句话职责） | 新增/改动 | 落此处的理由 |
|---|---|---|---|
| `src/application/query/QueryDocs.ts` | 交付物白名单增 `prototypes/*.html` 与 `prototypes/INDEX.md`；读 `INDEX.md` 投影 `prototypeRole` / `supersededBy`；原型不再落「其它发现」 | 改动 | 文档 Tab 的**服务端聚合**在此，`documents` / `discovered` 的划分与恒等式必须同处一处 |
| `src/client/views/panels/docs.ts` | 确定文档块内原型单列（`data-doc-group="prototype"`）+ 原型计数；核验表渲染两个对照项 | 改动 | 文档 Tab 面板就在此文件（纯字符串渲染、可单测），不为一点点改动新建面板 |
| `src/shared/artifact-labels.ts` | `KIND_LABELS` / `KIND_ICONS` 增 `prototype` 中文名「原型」与图标（brief §10 #33，**必须改**） | 改动 | 中文名唯一事实源；新增 kind 未配中文名会被 `tests/artifact-labels.test.ts` 的中文名护栏用例拦下 |
| `src/shared/protocol.ts` | `DocPanelKind` 增 `'prototype'`、`DocPanelEntry` 增可选原型字段、`VerificationItemSource` 增两分支（形状见文末「决议回填」节） | 改动 | 前后端共用契约层，文档面板载荷的唯一形状定义处 |
| `src/client/styles/report.ts` | 新增 ≤3 条规则（原型行/原型徽标），仅复用既有令牌 | 改动 | 文档 Tab 样式作用域在 `[data-report-shell]` 内，不新建样式文件 |
| `src/client/views/verification.ts`、`src/client/views/panels/{trunk,dag,dialogue,prompts,token}.ts` | 不改 | 不改 | 验收单列与文案已是单点，本需求不在客户端另有落点 |

**不新增文件**：前端侧没有新模块——「原型是产物」是应用层与契约层的事，客户端只做呈现。

```
src/
├── application/query/QueryDocs.ts        （改：白名单 + 分组计数）
├── client/
│   ├── views/panels/docs.ts              （改：原型单列 + 核验表渲染）
│   └── styles/report.ts                  （改：≤3 条规则，无新全局变量）
└── shared/
    ├── artifact-labels.ts                （改：prototype 中文名「原型」/图标，#33）
    └── protocol.ts                       （改：契约新增值，形状见「决议回填」）
```

## 组件结构 <!-- serves: FR-7 -->

本包无组件框架：树的每个节点是 `docs.ts` 里的一个**渲染块纯函数**（入参 `unknown`，出参 HTML 字符串）。

```
P-1 文档 Tab（报告壳的一个 Tab：确定文档 / 生成物 / 其它发现 / 核验表 / 六道门 / 归档）
├── C-1 documentsSection（确定文档块：逐行铺开，本需求在此把原型单列）
│   └── → 行内 kind 文案走 artifact-labels；原型行带 data-doc-group="prototype"
├── C-2 discoveredSection（其它发现块：**原型必须从这里消失**，否则"交了原型"在页面上仍等于没交）
├── C-3 verificationSection（核验表七列照旧，本需求新增「与原型对照」项的渲染）
│   └── ← props：DocsResponse.verification.items（服务端整份照抄，前端不重排、不重写文案）
└── C-4 打开正文委派（data-open-doc → 壳 ctx.openDoc(path)）
    └── → 原型正文与其它文档走**同一条**通路：不新增弹窗、不新增路由
```

数据流：`QueryDocs`（服务端聚合）→ `DocsResponse` → 面板纯字符串渲染（无本地状态）→ 壳委派点开正文。

## 页面与组件（编号表） <!-- serves: FR-7 -->

| 编号 | 类型 | 名称 | 职责（动宾结构，含响应操作） | 数据来源（接口/状态/Props） | 新增/改动 | serves |
|---|---|---|---|---|---|---|
| P-1 | 页面 | 文档 Tab | 展示需求目录内的确定文档 / 生成物 / 其它发现 / 核验表 / 六道门 / 归档，点击文档在右侧栏打开正文 | `DocsResponse`（文档面板端点） | 改动 | FR-7 |
| C-1 | 渲染块 | 确定文档块 | 逐行铺开全部 `documents`（不折叠、不做内层滚动），行内 kind 显示「原型」 | `DocsResponse.documents[]` | 改动 | FR-2、FR-7 |
| C-2 | 渲染块 | 原型单列行 | 把 `kind === 'prototype'` 的行在确定文档块内单列（**保留 `data-doc-row="1"`**），给分组计数与权威/被取代标记 | `documents[]` 行（计数客户端算）+ `entry.prototypeRole` / `entry.supersededBy`（服务端投影） | 新增 | FR-2、FR-3 |
| C-3 | 渲染块 | 核验表 | 逐项渲染验收单七列，两个对照项（原型 / 裁定）照样铺开并标「需人工确认」 | `DocsResponse.verification.items[]` | 改动 | FR-7、FR-9 |
| C-4 | 委派 | 打开正文 | 点原型路径 → `ctx.openDoc(path)` → 官方右侧栏；禁用项不可点 | 既有 `data-open-doc` 委派 | 复用不改 | FR-7 |

**归属判据 = 产物 kind**（brief §10 #1 + #30 已钉死）：`DocPanelKind` 增 `'prototype'`，原型在确定文档块内**单列**；
`prototypes/INDEX.md` 的产物 kind 也是 `prototype`（`NAME_TO_KIND` 增规则，不落 notes），
故不再需要"按路径猜归属"——中文名走 `artifact-labels` 的「原型」。

**迁移期兜底**（只影响展示，不改台账）：本次改动前已登记为 `notes` 的旧原型行，kind 在台账里是写死的、不回填，
故 `prototypeGroupOf(path)`（认 `prototypes/` 与旧 `prototype/` 两个前缀）作为兜底把它们一并归入原型组，
避免权威清单被显示成「其他」；新登记一律走 kind。

**「权威 / 被取代」由服务端投影带出**：客户端不做文件 IO，`INDEX.md` 在服务端读。
按 brief §10 #32，`DocPanelEntry` 增**可选** `prototypeRole?: 'authoritative' | 'superseded'` 与 `supersededBy?: string`
（缺省不注入，旧形状不变）；分组计数（「原型 N 份」）仍可在客户端由行数算出，不需要新字段。

## 验收单「与原型对照」条目渲染 <!-- serves: FR-7, FR-9 -->

| 项 | 设计 |
|---|---|
| 条目从哪来 | 由验收单构造（domain 单点）产出，两个 item source（brief §10 #14）：`prototype-compare`（文案「与原型对照截图（含差异说明）」）与 `decision-compare`（裁定对照）；客户端**不复制文案、不本地拼第三条** |
| 载荷（brief §10 #37） | `{ kind:'prototype-compare'; prototypePath: string }` / `{ kind:'decision-compare'; decisionIds: string[] }`——都带载荷，供渲染与追溯；文案与载荷由 domain 写死，客户端只呈现 |
| UI 需求必出现 | 由服务端门禁保证（FR-7：#38 缺对照项 → 内部 `verification_prototype_compare_missing` / 传输 `REQBOARD_VERIFICATION_INCOMPLETE`，提交被拒）；客户端拿不到 `sides`，**不做**该判定，只如实渲染 |
| 怎么渲染 | 走既有七列，不新增列；两项均为「只能人来判」（`needsHuman` + `humanReason`），沿用既有显眼旗标 `dsh-pm-flag.verify-pending` |
| 可追编号（FR-9） | `criterion` / `evidence` 里带的 `FR-x` / `D-x` 由 domain 写死（`decisionIds` 亦然），客户端经 `mdInline` **如实渲染**，不解析编号做跳转 |
| 可断言 | 行上新增 `data-verify-source="<source.kind>"`（只加属性、不动列），使"UI 需求验收单含两个对照项"可字符串断言 |

**必须先补的三处判别分支**（brief §10 #31 已钉死；不补则新增 source 静默退化，这是本需求自己最该防的断链）：

| 消费者 | 现状 | 不补的后果 | 要求 |
|---|---|---|---|
| `src/application/use-cases/AcceptSheet.ts`（弹框 header） | `kind==='requirement' ? … : 验收项 {taskId}` | header 显示「验收项 undefined」 | 为 `prototype-compare` / `decision-compare` 各增中文标题分支 |
| `src/application/internal/accept-sheet-rtm-integration.ts` | `taskId ?? 'UNKNOWN'` | RTM 里 fr_id 落 `UNKNOWN` | 两个新 kind 各映射到原型/裁定标识 |
| `src/application/internal/status-rtm-integration.ts` | 同上 | 同上 | 同上 |
| `src/client/views/panels/docs.ts` | 只看 `resultSource` | （前端侧无退化风险） | 新增 `data-verify-source` 属性即可，列结构不动 |

## 状态管理 <!-- serves: FR-7 -->

- **无新增全局状态**：原型的"有没有 / 哪版权威 / 有没有锚点"全部来自服务端聚合结果，客户端不缓存、不派生第二份。
- **无新增组件内状态**：原型单列**不折叠**（沿用既有「一律铺开、不做内层滚动」纪律），故没有展开/收起态需要记。
- 为什么不上提为全局：文档 Tab 的一次渲染即完整消费（打开 → 取数 → 渲染 → 点开正文走委派），
  跨 Tab 共享只会多一处同步点；既有 `req-detail-store` 的共享边界不因本需求改变。

## 路由与导航 <!-- serves: FR-7 -->

- **无新增路由**、无路由参数改动：原型复用文档 Tab 既有的面板端点与壳内 Tab 切换。
- 打开原型正文走**既有** `[data-open-doc]` 委派（壳 `ctx.openDoc(path)` → 官方右侧栏），
  与其它文档行完全同一条链路；面板**故意不带** `data-action="open-doc"`（两处都带会点一下开两次）。
- 深链/回退行为不变：不新增 `#` 路由片段，不因原型引入新的前进/后退语义。
- **边界**：`#FR-N` 锚点在客户端**不做**跨文档跳转（打开的原型正文里跳锚点属新增交互面，brief 未要求）。

## 样式与主题 <!-- serves: FR-7 -->

- **不新增全局 CSS 变量**：原型单列复用既有令牌 `--pm-bg-soft` / `--pm-text2` / `--r1` / `--s2` / `--f-small`。
- 新增规则 ≤3 条，只写在 `src/client/styles/report.ts` 的 `[data-report-shell]` 作用域内（类名为本设计新增，非 brief 契约）：

| 选择器 | 规则（意图） |
|---|---|
| `[data-report-shell] .dsh-pm-doc-row[data-doc-group="prototype"] .dsh-pm-doc-kind` | 原型类型徽标用 `--pm-bg-soft` 底 + `--r1` 圆角，与既有 kind 徽标同款 |
| `[data-report-shell] .dsh-pm-proto-count` | 分组计数（「原型 N 份」）用 `--pm-text2` + `--f-small`，不抢主信息 |
| `[data-report-shell] .dsh-pm-doc-row[data-proto-role="superseded"]` | 被取代原型行标 `--pm-text3` 弱化（属性值取自 `prototypeRole`），避免把作废版读成权威 |

- **响应式**：不新增断点；沿用文档表既有 `flex-wrap`（窄屏行内换行），也不引入横向滚动。

## 依赖与第三方库 <!-- serves: FR-2, FR-4 -->

**无新增依赖**（含 devDependency）：

| 候选 | 否掉的理由 |
|---|---|
| HTML 解析库（cheerio / parse5 等） | 原型元数据是**单块注释** `<!-- proto-geometry {json} -->` + `id="FR-N"`，正则抽取即可（brief 第 1 节：不引 HTML 解析库）；为两处抽取引一棵 DOM 树不划算 |
| 前端框架 / 图标库 | 本包是命令式字符串渲染，图标走 `KIND_ICONS` 文本；引入框架等于重写面板（越界） |
| 视觉对比 / 截图 diff 库 | 边界 2 明确不做像素级视觉回归；原型对照是**人看截图**，不是机器比图 |

## 分组计数恒等式（诚实性判据） <!-- serves: FR-11, FR-7 -->

口径（brief §10 #34 已固化为决议，与 `QueryDocs.ts` 文件头 ⑤ 同源）：

| 项 | 口径 |
|---|---|
| 恒等式 | `documents` 中**来自台账的行数** + Σ `discovered[].count` == 台账产物总数（`artifacts.length`） |
| 不在恒等式内的 | 面板另列的「未登记」设计文档行——它来自"分类要求但未登记"，台账里本没有这条记录 |
| 本需求怎么动它 | 原型（`prototypes/*.html` + `INDEX.md`）从 `discovered` 搬到 `documents`：**两侧同源同改**，和不变 |
| 不许做的 | 去重、过滤、把原型同时留在 `discovered`（数字立刻对不上，等于悄悄吞记录） |
| 原型截图呢 | `prototypes/*.png` 等**不是**原型产物（kind 不是 prototype），继续留在 `discovered` 按后缀分组——与"原型单列"不冲突 |
| 展示侧判据 | 原型行**保留 `data-doc-row="1"`**，其条数仍 `== documents.length`（既有 `tests/docs-panel.test.ts` 里 `data-doc-row` 的计数断言，**不许破**） |

面板投影（`QueryDocs` / `StageOverview`）属于 FR-11 的**校验器同步清单**：本需求改了面板投影口径，
必须同步核对清单里的这一项，否则"面板改了、校验器不知道"就是下一处两份真相。

## 关键决策与取舍 <!-- serves: FR-2, FR-7, FR-11 -->

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 原型在文档 Tab 的位置 | 留在「其它发现」（现状） | **进确定交付物**（白名单加两行） | 留在 `discovered` 里，"交了原型"在页面上仍等于没交——这正是 317 行倾倒的教训 |
| 怎判定"是不是交付物" | 排除法（排掉 .png/.yml） | **白名单**（沿既有口径） | 排除法会让自动扫描到的东西**自动**变成文档；白名单要求新增交付物时显式加一行 |
| 归属判据 | 按路径前缀猜归属 | **按产物 kind**（`DocPanelKind` 增 `'prototype'`，#30；`INDEX.md` 也归 prototype，#1） | 路径猜归属会在"kind 已是 prototype"之后变成第二套口径；kind 判据才与台账一致 |
| 旧登记（kind 写死为 notes） | 回填台账 kind | **展示侧兜底**（`prototypeGroupOf(path)` 归组），台账不动 | 登记时的 kind 不回填；兜底只为不让权威清单显示成「其他」，不影响门禁 |
| 客户端要不要做门禁判定 | 面板自己判"UI 需求缺原型" | **不判**，只如实呈现 | 客户端拿不到 `sides` 与门禁上下文；判据留在应用层，避免两处真相 |
| 原型行要不要折叠/内层滚动 | 折叠成一行 + 组内滚动 | **一律铺开** | 与既有纪律同款，且 `data-doc-row` 计数恒等式是机械判据 |
| 锚点 `#FR-N` 要不要可点跳转 | 点锚点定位到原型区块 | **不做** | brief 未要求；跨文档锚点跳转是新增交互面（列为边界，不是缺陷） |
| 中文名从哪来 | 面板再写一份本地映射 | **只走 `artifact-labels`** | 该模块头点名的"六处各自为政的中文映射漂移"老路，不再走一遍 |

## 技术方案与亮点 <!-- serves: FR-2, FR-7, FR-9 -->

**技术栈与关键依赖**：

| 依赖 | 版本 | 用途 | 为什么选它（不选的替代方案） |
|---|---|---|---|
| 无新增 | — | — | 全部复用既有 TypeScript + 命令式字符串渲染 + vitest 字符串断言 |

**模块划分**：

| 模块 / 文件 | 职责 |
|---|---|
| `src/application/query/QueryDocs.ts` | 决定「确定交付物 vs 其它发现」的划分与计数（含恒等式） |
| `src/client/views/panels/docs.ts` | 把聚合结果渲染成可断言的 HTML 字符串（原型单列 + 核验表） |
| `src/shared/artifact-labels.ts` | 原型的中文名与图标（唯一事实源） |
| `src/shared/protocol.ts` | 文档面板与验收项的载荷形状（KIND_LABELS 之外的契约面） |

**设计模式**：**单点事实源**（标签走 `artifact-labels`，文案走 domain）+ **纯函数渲染**（入参 `unknown`、出参字符串，
便于直接断言，不需要 DOM）+ **诚实性判据**（分组恒等式不是样式问题，而是可失败的账目断言）。未使用组件/MVC 等模式（本包无框架）。

**关键实现手法**：

| 手法 | 说明 |
|---|---|
| 把恒等式当断言而非注释 | 恒等式两侧同源同改，任何一侧漏改都在页面上立刻表现为数字对不上 |
| 路径前缀兜底函数 | `prototypeGroupOf(path)` 只用于**本次改动前已登记**的旧行（kind 写死为 notes，不回填），新登记一律按 kind |
| 只加属性不加列 | 新增 `data-doc-group` / `data-proto-role` / `data-verify-source`，不动既有列结构与既有断言（`data-doc-row` 计数） |
| 缺什么就说缺什么 | 未交原型、缺锚点、非权威版本各有说辞，不留白（沿既有「缺什么就说什么」空态纪律） |

**攻克的难点**：

| 难点 | 怎么解开 |
|---|---|
| 面板 kind 是 7 值闭集，而产物 kind 要增一枚（`Record<ArtifactKind, DocPanelKind>` 必须穷尽） | 已由 brief §10 #30 + #33 定死：`DocPanelKind` 增 `'prototype'`，`artifact-labels` 配中文名「原型」并同步穷尽性 |
| 验收项 source 是判别联合，增值会让既有三处 `taskId ?? 'UNKNOWN'` 静默退化 | 已由 brief §10 #31 定死：两个新分支 + 三处 taskId 分支必须同改（见「验收单」节表） |
| 权威标记在客户端拿不到（无文件 IO） | 已由 brief §10 #32 定死：服务端投影 `prototypeRole?` / `supersededBy?`，缺省不注入、旧形状不变 |
| 恒等式与新增白名单相互作用 | 原型从 `discovered` 搬到 `documents`，两侧在同一次改动内完成，并以条数断言守住 |

**与常规做法的差异**：

| 差异 | 常规做法 | 本方案 | 为什么 | 可核验指向（文件 / 测试） |
|---|---|---|---|---|
| 原型在文档页的身份 | 附件 / 「其它发现」里的一类后缀 | **确定交付物 + 权威标记 + 可点开** | "没进交付物清单"就等于页面承认它可交可不交 | `QueryDocs.ts` 白名单；`docs-panel.test.ts` |
| 分组计数 | 只说"还有很多" | **恒等式可对账** | 分类只许搬家不许丢东西 | `QueryDocs.ts` 文件头 ⑤；`docs-panel.test.ts`（`data-doc-row` 计数断言） |
| 原型对照验收 | 人手临时开修复会话 | **验收单固定两项**（原型对照 + 裁定对照，本次必查） | 把偶发的人眼发现变成每次必查 | 两个 item source + 面板渲染 + `data-verify-source` |
| 标签文案 | 面板各写一份 | **唯一事实源 + 护栏测试** | 六处漂移是既有教训 | `artifact-labels.ts`；`tests/artifact-labels.test.ts`（中文名护栏用例） |

## brief §10 决议回填（原 4 处待定已闭环） <!-- serves: FR-2, FR-7, FR-9 -->

本文件原先的 4 处「待定（需补充 brief）」已按 brief §10 逐条替换为决议，无遗留未决项：

| 原待定项 | 决议（brief §10） | 本文件的落点 |
|---|---|---|
| 本需求自身是否要交原型 / 写 exempt | **#29 都不做**：规则生效前不追溯，如实写"无独立原型资产" | 「原型页面」节末行 |
| 原型在文档 Tab 的协议形态 | **#30** `DocPanelKind` 增 `'prototype'`，确定文档块内**单列**，原型行**保留 `data-doc-row="1"`** | 「页面与组件」C-2 + 「恒等式」节 |
| 验收项 source 联合形状 | **#31** 增 `prototype-compare` / `decision-compare` 两分支，**必须同改三处 taskId 分支**；载荷形状见 **#37** | 「验收单」节两张表 |
| 权威/被取代的服务端字段 | **#32** `DocPanelEntry` 增可选 `prototypeRole?: 'authoritative' 或 'superseded'` 与 `supersededBy?: string`（缺省不注入） | 「页面与组件」C-2 + 「样式与主题」 |
| 关联决议（一并回填） | **#1** `INDEX.md` 的 kind = `prototype` · **#33** `artifact-labels` 配中文名「原型」+ 穷尽性 · **#34** 恒等式精确口径 · **#14/#37/#38** 两个对照项及其载荷/错误码 | 「原型页面」「目录与包结构」「恒等式」「验收单」节 |

## 前端侧边界（不做什么） <!-- serves: FR-7, FR-1 -->

| 不做 | 理由 |
|---|---|
| 不在客户端做原型门禁/权威版本判定 | 判定在应用层；客户端只呈现（两处真相 = 下一个断链） |
| 不追溯存量需求的原型展示 | 边界 1/7：不追溯；旧需求只享受解析修好的红利 |
| 不做像素级视觉对比 | 边界 2：只做结构 + 几何量 + 令牌，且对照是"人看截图" |
| 不给非 UI 需求加原型仪式 | 边界 4：`sides` 不含 frontend 的需求页面不因此多任何一行 |
| 不新增弹窗、不新增路由、不引新依赖 | brief 第 9 节"最小改动"；打开正文复用既有右侧栏 |
