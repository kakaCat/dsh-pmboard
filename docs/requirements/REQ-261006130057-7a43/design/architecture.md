<!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->
# 架构设计（REQ-261006130057-7a43 需求详情页 UI 优化）

> 读者：零上下文的执行者。本文回答「改哪些文件、怎么挂进去、不碰什么」。
> 蓝本：原型 `prototypes/detail.html` v1.5（`prototypes/INDEX.md` 唯一 authoritative）。

## 目标与总体方案 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

详情页 = 工作汇报壳（`src/client/views/report-tabs.ts`）：壳四段（头部 / 状态带 / Tab 栏 / 当前面板）
+ 六个同级 Tab（trunk 汇报 / docs 文档 / dag / dialogue 对话 / token / prompts 提示词）。
本轮**不动壳的四段更新机制与取数主链路**，做三件事：

1. **呈现层重组**（FR-1~FR-5）：头部三层、状态带缺口强化、评论紧凑、进度带/Tab 收敛、汇报网格——
   只改各段 render 函数与 `src/client/styles/report.ts`，不改数据形状。
2. **新增第七枚「验收」Tab**（FR-8，D-4/D-8）：新面板 `verify`，插在 dialogue 与 token 之间；
   主视图 = RTM 验收追踪列表；docs 面板的「核验 · 验收单」节**提出**（原位留迁移指引条）。
3. **对话面板改聊天形态**（FR-6，D-5/D-6/D-7）：气泡消息 + 吸顶分页条 + 只读（移除回复框）。

## 现状结构（事实，改动前基线） `serves: FR-1, FR-4, FR-7, FR-8`

- 壳：`src/client/views/report-tabs.ts`（917 行）——`buildReportShell` 拼四段（`ReportShellSegments`：
  head/band/tabs/panel），`createReportTabs` 管取数/缓存/事件；`REPORT_TABS` 注册表（顺序 = 渲染顺序）。
- 面板：`src/client/views/panels/{trunk,docs,dag,dialogue,token,prompts}.ts`，各自导出
  `ReportTabDef`（key/label/badge/render/degraded）。
- 端点：`src/http/routers/panels.ts` `PanelEndpoint = 'report'|'trunk'|'docs'|'dag'|'dialogue'|'prompts'|'token'`，
  路由 `GET /requirements/:id/<endpoint>`（`report/trunk` 两段写法归一到 trunk）。
- 头部/状态带：`src/client/views/report-head.ts` / `report-band.ts`（段 render，被壳调用）。
- 验收单现状落点：`panels/docs.ts` `verificationSection()`（「核验 · 验收单」节，数据来自
  `DocsResponse.verification`）。
- 样式：`src/client/styles/report.ts`（1462 行，`REPORT_CSS`），令牌 `--pm-*`（字阶六档 /
  --pm-accent 唯一强调色 / --pm-line / --pm-bg-soft / --pm-target 24px / --pm-dur*）。
  汇编入口 `src/client/styles.ts`（分片拼接，C-12 归口）。

## 模块改动地图 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

| 文件 | 类型 | 改动内容 | 原因（serves） |
|---|---|---|---|
| `src/client/views/report-tabs.ts` | 修改 | `ReportTabKey` 加 `'verify'`；`TAB_ICONS` 加 verify 图标；`REPORT_TABS` 注册 verifyPanel（dialogue 后）；tabCounts 类型加 `verify?: string` | FR-8 |
| `src/client/views/panels/verify.ts` | **新建** | 验收面板：RTM 验收追踪列表 + 行展开 + 材料/历史 + 解释性空态 + 降级文案 | FR-8 |
| `src/http/routers/panels.ts` | 修改 | `PanelEndpoint` 加 `'verify'`，接 `QueryVerify` | FR-8 |
| `src/application/query/QueryVerify.ts` | **新建** | 装配验收面板数据（sheet + RTM acceptance_tracking + 覆盖链 + 历史 + 材料） | FR-8 |
| `src/client/views/panels/docs.ts` | 修改 | 删 `verificationSection` 整块，原位渲染迁移指引条（指向验收 Tab）；该节断言同步 | FR-8 |
| `src/client/views/panels/dialogue.ts` | 修改 | 气泡化（人右蓝/窗口·agent 左紫/系统居中灰丸）；分页条移入滚动容器吸顶；**删底部回复框**；删检索框（见「边界裁决」） | FR-6 |
| `src/client/views/report-head.ts` | 修改 | 头部三层：标识行 / 标题行+操作右置 / 闸门提示条（琥珀，锚链缺口格） | FR-1 |
| `src/client/views/report-band.ts` | 修改 | 三格权重 1 : 1.5 : 0.9；缺口格红底+计数徽标；结果格占位态折叠一行 | FR-2 |
| `src/client/views/report-head.ts`（评论区） | 修改 | 最近评论单行截断 + 长日志收纳展开 | FR-3 |
| `src/client/views/report-head.ts`（进度带）+ `report-tabs.ts`（Tab 栏） | 修改 | 进度带 4px 色条 + 单行标签；Tab 栏 7 枚单行、徽章等宽 | FR-4 |
| `src/client/views/panels/trunk.ts` | 修改 | 模块标题/副题/来源并一行；短模块 2×2 网格 | FR-5 |
| `src/client/views/panels/dag.ts` | 修改 | 画布组件不动；容器通栏 + 顶部工具行（缩放/适应窗口/图例） + 空态文案 | FR-7 |
| `src/client/views/panels/{docs,token,prompts}.ts` | 修改 | 密度对齐字阶/紧凑表（docs 分节表、token 汇总卡+右对齐表、prompts chips+片段列表） | FR-6 |
| `src/client/styles/report.ts` | 修改 | 上述全部样式；新增类只引 `--pm-*` 令牌，不写裸色值 | FR-1~FR-8 |
| `src/client/req-detail-store.ts` / `board-mount.ts` | 修改 | verify 面板取数接线（沿用既有 PanelEntry 三态机制） | FR-8 |
| `scripts/fixtures/req-detail-specimen.mts` + 截图脚本 | 修改 | 标本加 verify 面板 mock；出 before/after 对照图 | FR-1~FR-8（验收证据） |
| `tests/*.test.ts` | 修改 | 见 test-cases.md：dialogue/docs/report-tabs 断言同步 + 新增 verify 断言组 | 全部 |

不新建目录；不改 `src/domain` / `vendor`；不改任何台账写路径。

## 新增「验收」Tab 的装配 `serves: FR-8`

- **注册**：`REPORT_TABS = [trunk, docs, dag, dialogue, verify, token, prompts]`（第 5 枚，D-4；
  原型实测 `verifyTabIndex1Based=5`）。
- **取数**：沿用壳的「切到才取 + 三态（loading/degraded/error）+ 缓存」机制，新端点
  `GET /requirements/:id/verify` → `QueryVerify`（接口契约见 interfaces.md §2/§3）。
- **徽标**：`tabCounts.verify` = 待裁决项数（服务端从 sheet 逐项 status 数好；无验收单=字段缺省不渲染，
  禁 `0` 冒充——沿用 FR-12 口径）。
- **迁移**：docs 面板核验节删除，原位渲染一行指引「『核验·验收单』已独立为「验收」Tab →」
  （`data-action="switch-tab" data-tab="verify"`）；旧链接/书签 `?tab=docs` 不受影响。

## 降级与兼容 `serves: FR-6, FR-8`

- **旧服务端无 verify 端点**（新前端 + 旧服务端）：面板走既有 degraded 分支，文案说清
  「服务端版本过旧，验收单暂在『文档』Tab 核验节查看」——**不白屏、不报错**（board-mount.ts
  的既有兼容纪律）。
- **RTM 缺失**：覆盖链三枚 chip 与 RTM 行按「无追溯数据」降级（增强层缺失不打断渲染，FR-9 口径）；
  无 acceptance_tracking 时列表退化 = 验收单逐项平铺（每行仍按 fr_id 归组，能归几行归几行）。
- **无验收单**：解释性空态三行（没交 / 找谁交 / 交了会看到什么），不画空表格（沿用 docs.ts 现行口径）。
- **对话面板**：旧服务端无 `page` 字段 → `pageKnown=false`，分页条只显示「加载更早」不可用态 +
  说明，不猜成「没有更早」（沿用 `LoadedDialogue` 现行不变量）。

## 边界裁决（写死，不再议） `serves: FR-6`

1. **回复框删除**（D-6）：`panels/dialogue.ts` 底部回复框（`data-role="comment-input"` + `add-comment`）
   整块移除；评论能力仍在「汇报 Tab 最近评论 / 时间线」既有通道，不丢功能。
2. **页内检索框一并移除**：原型 v1.5 无检索框且经人定稿（D-9），验收单含 prototype-compare 锚点比对，
   实施必须与原型一致；如验收阶段要求找回，走变更流程。
3. **对话面板有界内滚动是例外**：壳的「一律铺开、不做内层滚动」不变量（REQ-261004222448-292a
   FR-11 #7）对**对话面板单独开口子**——D-5/D-7 裁定的聊天形态（吸顶分页条 + 固定高滚动区）
   在语义上必须有界；开口范围 = 仅 `.chat-scroll`（460px），其余面板维持无内层滚动，
   探针判据按面板白名单豁免。
4. **DAG 画布零改动**（D-3）：`src/client/dag*` 与 `panels/dag.ts` 的画布渲染/交互一行不动，
   只动容器与工具行。
