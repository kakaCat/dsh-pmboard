<!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 -->
# 测试用例（REQ-261006130057-7a43）

> 验收口径可执行：跑什么命令、看到什么算过。T 编号供验收单逐项引用。
> 总命令：`pnpm test`（C-14 与基线比对）+ `pnpm exec tsc --noEmit`（C-15）+
> `pnpm build:client`（C-12：关键符号齐全、样式归属章在场、CSS 分片完整）。

## 渲染断言（新增，tests/verify-panel.test.ts） `serves: FR-8`

- **T-1 Tab 顺序**：`buildTabBar` 产物中 `data-tab="verify"` 存在，且次序 =
  trunk < docs < dag < dialogue < **verify** < token < prompts（7 枚）。
- **T-2 RTM 主表**：有 sheet + tracking 时渲染 `data-rtm-table="1"`；每 FR 一行
  `tr[data-fr]`；覆盖链 chip 含真实文本 ✓/✗（`data-cov`）；无 tracking 时表格退化逐项平铺
  且覆盖链列不出现。
- **T-3 空态两分支**：无 sheet → `data-verify-empty="1"` 含「尚未提交」；items 空 →
  含「没有逐项」；两态都不出现 `<table>`。
- **T-4 行展开**：`data-fr-detail="FR-N"` 内含 result / needsHuman+humanReason / 证据；
  `not_verifiable` 项不被算进「待裁决」计数（与 isFullyDecided 同口径）。
- **T-5 徽标口径**：`tabCounts.verify` = pending+unverified 计数；无 sheet → 字段缺省 →
  DOM 无 `data-badge-verify`（禁 '0'）；值与服务端 pendingCount 一致。
- **T-6 迁移指引**：docs 面板不再出现 `data-verify-table` / `data-doc-section="verification"`，
  出现迁移指引条且 `data-tab="verify"` 可切。

## 渲染断言（修改，tests/dialogue-panel.test.ts） `serves: FR-6`

- **T-7 气泡三态**：`data-msg="human"` 靠右蓝 / `data-msg="agent"` 靠左紫 /
  `data-msg="system"` 居中灰丸；`inferred` 系统消息带 `data-inferred="1"`。
- **T-8 只读**：产物**不含** `data-role="comment-input"` 与 `data-dialogue-search`
  （回复框与检索框均删除）；含只读说明行（历史记录 · 共 N 条 · 本页 M 条）。
- **T-9 吸顶分页条**：`data-chat-pager="1"` 是 `data-chat-scroll="1"` 的第一个子元素；
  `pageKnown=false` 时渲染降级态且不渲染「加载更早」可用按钮。
- **T-10 正序**：渲染顺序 = `at` 升序（旧→新）。
- **T-11 过滤不变量**：产物不出现 tool/call、reasoning 字样（既有反例断言保留）。

## 渲染断言（修改，tests/report-tabs / docs / band / head 相关） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-7`

- **T-12 头部三层**：标识行 / 标题行（操作按钮右置聚合）/ 闸门提示条（有缺口才渲染，
  含锚链 `查看缺口`）。
- **T-13 状态带权重**：缺口格带计数徽标且值 = `waitingHuman`；`outcome===undefined` 时
  结果格折叠一行（不出现逐项计数）。
- **T-14 评论紧凑**：长评论带「长日志已收纳」标 + 展开钮；短评论单行。
- **T-15 汇报网格**：模块头一行化（标题+副题+来源同行）；空节「不编不留白」文案在。
- **T-16 DAG 适配**：工具行（缩放/适应窗口/图例四态）在；画布容器 `dag-canvas-container`
  结构不变（画布组件零改动回归）。
- **T-17 未激活面板不在 DOM**（既有判据保留）：`data-panel=` 计数 = 1。

## 视觉对照（截图脚本，复用改造） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

- **T-18 before/after 出图**：改造 `scripts/req-detail-ui-shot.mts` 系脚本，标本
  （`scripts/fixtures/req-detail-specimen.mts`）加 verify 面板 mock 与对话气泡 mock；
  出 1280/900 × 在途/终态 + `#tab-verify` / `#tab-dialogue` 各一张，人评审对照原型 v1.5。
- **T-19 几何探针**：`tabsTop / headHeight / bandHeight / verifyTabIndex1Based` 复测
  （data-model §观测量集；判定阈值写在探针脚本断言里，不进 geometry 块）；
  内层滚动判据按白名单豁免 `.chat-scroll`（其余面板维持零内滚动）。

## 服务端（tests/query-verify.test.ts + 对话游标） `serves: FR-6, FR-8`

- **T-20 QueryVerify 装配**：sheet/history/tracking/coverage/materials/pendingCount 六段
  与台账+RTM 一致；RTM 文件缺失时 tracking/coverage 缺省不抛（增强层降级）。
- **T-21 对话游标**：`?before=<ts>&limit=40` 返回 `page{hasMore,before,total}`；
  越界/缺参走缺省；items 升序。
- **T-22 兼容**：`DocsResponse.verification` 保留（旧前端不受影响）；旧服务端无 verify
  端点 → 前端 degraded 文案断言。

## 通过口径 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

- `pnpm test` 全绿（含既有套件——dialogue/docs 旧断言按 T-6/T-8 同步改写，**不许删测试凑绿**）；
  `pnpm exec tsc --noEmit` 零错；`pnpm build:client` 输出 verify-client OK。
- T-18 截图人评审通过（对照原型 v1.5）；验收单 prototype-compare 项锚点 8/8 命中。
