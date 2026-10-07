<!-- serves: FR-6, FR-8 -->
# 接口设计（REQ-261006130057-7a43）

> 契约定不死不许进拆分。本文所有形状以 `src/shared/protocol.ts` 既有类型为基线，**新增**部分逐字段给出。

## Tab 注册契约（client） `serves: FR-8`

- `ReportTabKey` 增加 `'verify'`（`src/client/views/report-tabs.ts`）。
- `REPORT_TABS` 顺序：`trunk → docs → dag → dialogue → **verify** → token → prompts`
  （第 5 枚；原型实测 `verifyTabIndex1Based=5`）。
- `TAB_ICONS.verify = '✅'`（只作 `data-proto-icon-before` 锚，可见图标走 `TAB_ICON_SVG` 内联 SVG，新增一枚）。
- `ReportResponse.tabCounts` 增加可选字段：

```ts
tabCounts?: {
  trunk?: string; docs?: string; dag?: string; dialogue?: string
  verify?: string   // 待裁决项数（'2'）；无验收单 = 字段缺省，不渲染、禁 '0' 冒充
  token?: string; prompts?: string
}
```

- badge 口径：只填**服务端数好的**待裁决数（`pending + unverified`，与 `outcome.pendingItems` 同口径）；
  前端不遍历、不推算（沿用 FR-11 #4 / T-8 纪律）。

## 面板端点契约（HTTP） `serves: FR-8`

- `PanelEndpoint` 增加 `'verify'`（`src/http/routers/panels.ts`）。
- 路由：`GET /requirements/:id/verify` → `QueryVerify` 装配 → `VerifyPanelResponse`。
- 三态沿用面板机制：`loading / degraded / error`；**旧服务端无此端点** → 404 按 degraded 处理，
  文案指引回「文档」Tab（不白屏）。
- 不新增错误码；鉴权/校验与其它面板端点完全一致。

## VerifyPanelResponse 数据契约 `serves: FR-8`

```ts
export interface VerifyPanelResponse {
  /** 当前验收单：整份照抄 req.verification.sheet（与 docs 面板现行同源，不重排字段） */
  sheet?: VerificationSheet
  /** 历史验收单（v1/v2…；req.verification.sheetHistory） */
  history?: VerificationSheet[]
  /** RTM 验收追踪（每 FR 一行）：读 rtm-accepting.yml 的 acceptance_tracking
      （vendor/reqboard/src/types/rtm.ts 的 AcceptanceTracking，形状复用不另造）。
      缺省 = 无 RTM 数据 → 前端降级为逐项平铺 */
  tracking?: AcceptanceTracking[]
  /** 覆盖链（每 FR 三态布尔）：由 TraceabilityProjection 推导——
      design = fr_id ∈ fr_to_design；tasks = ∈ fr_to_tasks；tests = ∈ fr_to_tests。
      缺省 = 无 RTM 数据 → 覆盖链列整体不渲染 */
  coverage?: Record<string, { design: boolean; tasks: boolean; tests: boolean }>
  /** 追溯三映射原样透出（D-10 返工，服务端不做 join）：fr_to_design / fr_to_tasks / fr_to_tests
      照抄 assembleTraceability 的 TraceabilityProjection；前端据此把主表按 FR 成行
      （行键 = FR 号；归属链 = fr_to_tasks ∪ fr_to_tests；覆盖链 chip = 该 FR 在不在三张映射里），
      归不进任何 FR 的项另起「需求级 / 对照项」行。缺省 = 无 RTM 数据 → 前端逐项平铺 */
  frMap?: {
    fr_to_design?: Record<string, string[]>
    fr_to_tasks?: Record<string, string[]>
    fr_to_tests?: Record<string, string[]>
  }
  /** FR 号 → 名称（D-10 返工补）：读需求文档（`requirementDocPathOf` 定位的 requirement.md）里
      `- **FR-N: 名称**——…` 的标题行，只取冒号后到 `**` 之间的名称（`——` 之后是说明，不算名称）。
      候选读根按 docRootsOf + docsAt 逐个试（两口未装配时用 docs）。
      **只包含能解析出的 FR**；缺省 = 文档读不到 / 文档端口未装配 / 文档里没有这种标题行
      ——前端退回「只渲染编号」，服务端绝不编名称兜底（读侧也绝不抛）。 */
  frNames?: Record<string, string>
  /** 材料摘要（交付结论 + 证据清单），来自 req.verification 提交材料 */
  materials?: { summary?: string; evidence: string[] }
  /** 待裁决项数（与 tabCounts.verify 同源同值） */
  pendingCount?: number
}
```

- **FR 行组装**（D-10 返工后口径）：`frMap` 有值 → **每 FR 一行**（行键 = FR 号，按 FR 编号数值
  升序）；该 FR 名下的逐项按 `rtmTraceIdOf(source)` 命中 `fr_to_tasks ∪ fr_to_tests` 归入
  （tracking 行同键同归），多子项取最严重状态（不通过 > 待裁决 > 未复核 > 通过）+「N 项」计数；
  归不进任何 FR 的项（需求级 / prototype-decision 对照项）另起「需求级 / 对照项」行排在 FR 行之后。
  `frMap` 缺省时退回 `tracking` 按 `fr_id` 归组的逐项平铺（老路径）。
  逐项明细仍从 `sheet.items` 取（`result / resultSource / needsHuman / humanReason /
  evidence / opinion / status`）——**两源按 `rtmTraceIdOf(source)` 对齐**
  （domain/workflow/AcceptanceSheetSpec.ts 既有单点函数，禁止各写一份）。
- **禁 0 冒充**：`sheet` 缺省 = 「尚未提交」空态；`items: []` = 「单空」空态，两种空态文案分开
  （沿用 docs.ts `data-verify-empty` 现行两分支）。
- **FR 名称（D-10 返工已补）**：`frMap` 只透三张映射、`tracking` 只带追溯键、`sheet` 只有逐项的
  criterion/howToVerify——FR 标题在**需求文档**里，故服务端补读 `requirement.md` 抽 `FR-N: 名称`
  并随 `frNames` 下发（读不到即缺省，见上）。前端 FR 列因此渲染「**编号 + 名称**」（原型同态）；
  名称缺省 / 该 FR 不在表里 → 退回只渲染编号，**前端不编名称**。触发返工的判据：
  D-10「验收 Tab 的 FR 行与原型不一致——原型是编号 + 名称」。

## 对话分页契约 `serves: FR-6`

现状（不改造的部分）：`LoadedDialogue`（panels/dialogue.ts）已定义
`items / dropped / pageKnown / hasMore / before / total`；「加载更早」按钮
（`data-action="dialogue-load-earlier"`）已在。缺口：服务端游标未接（pc-261004222448-292a-01）。

- 请求：`GET /requirements/:id/dialogue?before=<ms 时间戳>&limit=<n>`，
  `limit` 缺省 40（与原型「已加载 40/152 条」口径一致）；`before` 缺省 = 最新一页。
- 响应：在既有 `items` 外补 `page` 字段：

```ts
{
  items: DialogueItem[]
  page: { hasMore: boolean; before?: number; total: number }
  // 勘误（复核 P2-2）：page 为**必填**（REQ-292a 起即是，新服务端恒发）；
  // 「旧服务端无 page」的兼容由客户端 pageKnown 判缺省承担，不靠协议可选。
}
```

- **正序**：`items` 按 `at` 升序（旧→新，最新在末尾/底部，D-5）；`before` = 本页最早一条的 `at`。
- 合并：前端 `mergeEarlier`（report-tabs.ts 既有）按 `itemIdentityOf` 去重拼接，不改。

## 渲染输出契约（DOM 锚点） `serves: FR-6, FR-8`

实施必须产出的可断言锚点（验收单据此比对，类名进样式分片 report.ts）：

| 锚点 | 位置 | 说明 |
|---|---|---|
| `data-tab="verify"` / `data-panel="verify"` | Tab 栏第 5 枚 / 面板根 | 顺序断言：dialogue 之后、token 之前 |
| `data-rtm-table="1"` | 验收面板主表 | 每 FR 一行 `tr[data-fr="FR-N"]` |
| `data-fr-name="<名称>"` | FR 行的名称位（D-10 返工） | 有 `frNames[FR-N]` 才渲染；缺省只有编号 |
| `data-cov="design|tasks|tests"` | 覆盖链 chip | ✓/✗ 真实文本字符，不只颜色 |
| `data-verify-empty="1"` | 空态 | 两分支（未提交 / 单空）沿用 |
| `data-fr-detail="FR-N"` | 行展开区 | 逐项实际结果（result/needsHuman/humanReason/证据） |
| `data-badge-verify="1"` | Tab 徽标 | 值 = pendingCount，无单不渲染 |
| `data-chat-scroll="1"` | 对话滚动容器 | 460px 有界（内滚动白名单唯一豁免，见 architecture §边界裁决 3） |
| `data-chat-pager="1"` | 吸顶分页条 | `position:sticky; top:0`，在滚动容器内部第一个子元素 |
| `data-msg="human|agent|system"` | 聊天气泡 | inferred=true 的系统消息带 `data-inferred="1"` 琥珀标 |

## 兼容矩阵 `serves: FR-6, FR-8`

| 组合 | 行为 |
|---|---|
| 新前端 + 新服务端 | 全部能力 |
| 新前端 + 旧服务端 | verify 面板 degraded 指引回文档 Tab；对话无 `page` → 分页条降级；tabCounts 无 verify → 不渲染徽标 |
| 旧前端 + 新服务端 | 新端点无人调用，零影响；docs 核验节仍在（服务端不删 DocsResponse.verification） |
