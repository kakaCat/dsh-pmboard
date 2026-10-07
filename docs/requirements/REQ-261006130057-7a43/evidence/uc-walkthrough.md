# t10 兼容回归收尾 · UC-1~UC-6 走查记录（REQ-261006130057-7a43）

> 走查人：实施窗口 agent ｜ 日期：2026-10-06 ｜ 依据：`design/use-cases.md`
> 命令与输出摘要逐条附；图像证据在 `evidence/`。

## 命令门禁

| 命令 | 退出码 | 摘要 |
|---|---|---|
| `pnpm build` | 0 | host（tsdown）+ client 全过；`[verify-client] OK bundle=729836 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整` |
| `pnpm build:client` | 0 | 同上（client 分片完整） |
| `pnpm test` | 见下节 | 失败 68 = 基线 68；9 条集合差异全部归因另一窗口在途改造（本需求零新增失败） |
| `pnpm exec tsc --noEmit` | 2 | 唯一错 `tests/query-docs-roots.test.ts TS2415`（另一窗口在途，本需求文件面零错） |
| `npx tsx scripts/req-report-probe.mts` | 0 | PROBE PASS 4/4；verifyTabIndex1Based=5；A3 唯一豁免 `.chat-scroll`；命中区豁免已清零 |
| `npx tsx scripts/req-7a43-ui-shot.mts` | 0 | SHOT PASS 5/5 + before 副本 sha256 守卫过 |
| `npx tsx scripts/req-detail-ui-contrast.mts` | 0 | CONTRAST PASS；四对实算 4.92/4.82/4.63/5.09 |

## UC-1 在途需求首屏四问 `serves: FR-1, FR-2, FR-3, FR-4`

- **是什么**：标题行 19px（`--pm-head-title-fs`）+ 标识行（REQ-id 等宽 / 状态药丸 / 分类难度 / 内联时间 / 席位右置）。
- **到哪了**：进度带 8 段（✓ 完成 / ▸ 当前 / 无标记未开始），当前段取主色 + 2px 指示条。
- **卡在哪**：缺口格红底 + `2px` 左红条 + 计数徽标（值 = `waitingHuman`，与 verdictLine 同源）。
- **要我做什么**：标题行右端操作聚合（本阶段合法动作，集合 = `buildReportActionBar` 现行输出）；闸门提示条「⚠ 需人工确认 · N 件缺口等人裁决」+「查看缺口 ↓」锚链。
- 证据：`ui-after-1280-inflight.png`、`ui-after-900-inflight.png`（900 档状态带单列、缺口格 `order:-1` 排第一）。
- 结论：**通过**（探针 1280/900 两档硬判据 + 截图人眼核对）。

## UC-2 验收阶段逐项裁决 `serves: FR-8`

- 切「验收」Tab（第 5 枚，`verifyTabIndex1Based=5`）→ 汇总行「FR 验收进度 a/b 通过 · c 待裁决 · d 不通过」+ 版本签 → 主表每 FR 一行（覆盖链 `设计✓ 任务✓ 测试✗` / 怎么验 / 验收状态五态 / 裁决·意见）→ 行展开 `data-fr-detail` 看逐项实际结果 / `needsHuman`+`humanReason` / 证据 → 待裁决行内单选 + 表底「提交裁决」（复用既有 `submit-verdicts` 收集链，无假按钮）。
- 无 RTM 时降级逐项平铺（覆盖链列整列不渲染，文案「RTM 追踪缺失」）；两态空态不画空表格。
- 证据：`uc2-verify-panel-1280.png`、`tests/verify-panel.test.ts`（20 例）、`tests/query-verify.test.ts`（T-20）。
- 结论：**通过**。

## UC-3 翻历史对话 `serves: FR-6`

- 最新在底部（正序）；吸顶分页条 `.chat-scroll` 内第一子元素 `position:sticky`（「↑ 加载更早消息」+「第 N/M 页」+「已加载 x/y 条」）；长日志折叠可展开；**无发送输入框**，底部只读行「历史聊天记录 · 只读 —— 共 N 条，本页 M 条」。
- `pageKnown=false`（旧服务端）→ 分页条降级不可用态 + 说明，不猜「没有更早」。
- 证据：`ui-after-1280-inflight-dialogue.png`、`tests/dialogue-panel.test.ts`（24 例）。
- 结论：**通过**。

## UC-4 看 DAG 画布 `serves: FR-7`

- 画布组件零改动；容器通栏 + 顶部工具行（缩放四件 disabled 占位 + title 说明，不进点击链）+ 四态图例（待办/在跑/完成/阻塞，色点带文字标签）+ 无任务空态单独成块。
- 证据：`uc4-dag-panel-1280.png`、`tests/dag-panel.test.ts`、探针 A13 dag 面板（命中区/内滚动/图例）。
- 结论：**通过**（画布交互与改造前一致：`git diff src/client/dag src/client/dag-view.ts src/client/dag-mount.ts` 为空）。

## UC-5 旧服务端降级 `serves: FR-6, FR-8`

- 新前端 + 旧服务端：`/verify` 404 → `port-unavailable` degraded 信封 + 固定文案「服务端版本过旧，验收单暂在『文档』Tab 核验节查看」（不白屏、不报错）；对话无 `page` → 分页条降级；`tabCounts.verify` 缺省 → 不渲染徽标（禁 `0` 冒充）。
- 证据：`tests/query-verify.test.ts` T-22、`tests/report-tabs.test.ts`（404→degraded / '0' 不渲染）、`tests/report-degrade.test.ts`。
- 结论：**通过**。

## UC-6 锚链与跨 Tab 跳转 `serves: FR-3, FR-8`

- 文档 Tab 迁移指引条「去验收 Tab →」（`switch-tab` + `data-tab="verify"`）→ 切到验收 Tab；
- 头部最近评论「全部对话 →」（`switch-tab` + `data-tab="dialogue"`）→ 切到对话 Tab；
- 闸门提示条「查看缺口 ↓」（`data-action="scroll-gap-focus"` → `scrollIntoView`，**不走 hash 信道**，避免与宿主深链路由抢信道）→ 滚到状态带缺口格。
- 证据：`tests/docs-panel.test.ts`（T-6 迁移指引）、`tests/report-shell.test.ts`（T-12 锚链 + 终态豁免）、`tests/report-firstscreen-gaps.test.ts`。
- 结论：**通过**。

## 遗留（如实登记，不静默）

1. `pnpm exec tsc --noEmit` 唯一错 `tests/query-docs-roots.test.ts:36 TS2415` —— 另一窗口在途（`tests/application/harness.ts` 新加 `private root` 与其子类冲突），非本需求文件面；本需求文件零错。
2. `pnpm test` 68 条失败 = 基线 68（新增 9 / 不再失败 9 为集合差异），9 条新增逐条归因另一窗口（board.ts / verification.ts 等其它 REQ 改动、error-code-inventory、live-tasks-single-source、artifact-openable、typecheck）；**未执行 baseline --refresh**，避免替他人销账。
3. 复核挂账保留项：dag 图例三条内联 rgba（同块存量惯例）、docs.ts `relPathHint` 与 `pathCellOf` 有重复 rel 计算（建议级）、原型未补 2px 指示条一笔（结构锚点不受影响）。
