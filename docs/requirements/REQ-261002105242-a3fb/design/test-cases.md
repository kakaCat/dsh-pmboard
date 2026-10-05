# REQ-261002105242-a3fb 测试用例 · 判据怎么跑、跑出什么算过 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

> 本文件是 `requirement.md` 判定标准 A1–A6 的落地映射。**修前必红**的四条是回归锚点：
> 它们的失败就是缺陷，通过就是修复。全部用例走 Node 环境纯字符串断言（无 DOM、无浏览器）。

## 测试策略与分层 `serves: FR-5`

| 层 | 覆盖什么 | 写法 | 为什么这样选 |
|----|---------|------|-------------|
| 单元（纯函数投影） | `toReqCards` / `toTerminalCards` / `renderArchivedBar` | 直接 import，构造 `BoardState` 字面量 | 与 `client-view.test.ts` 同款纪律：视图层不依赖浏览器即可断言 |
| 字符串不变量 | `buildBoard` / `buildListView` / `buildReqDetail` 的输出 | `toContain` / `not.toContain` + 分段比对 | 本需求的缺陷**全部**是"字符串里没有该有的段"，字符串断言即真实症状 |
| 模块面断言 | 移除的 `archiveReq` 不再导出 | `import * as api` 后断言键不存在 | 防止"删了调用点、留了导出"的半截清理 |
| 静态/构建 | 类型零新增错误、bundle 可重建 | `npx tsc --noEmit` / `pnpm build:client` | 仓库规范 C-15 / C-12 |
| 人工浏览器验证 | 归档需求回看的真实观感（折叠、点击、DAG 渲染） | 手测步骤 | 自动化 E2E 成本高于收益，在验收材料里显式登记为人工替代 |

## 用例表 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

| 用例 | 层级 | 断言 | 跑法（命令） | 期望（括号内为修前） | 实际文件 |
|------|------|------|-------------|---------------------|----------|
| A1-1 归档条渲染 | 单元 | `renderArchivedBar(toTerminalCards(state))`：含 `data-archived-bar`、`data-archived-count`、每条 chip 带 `data-action="open-req"` + `data-req`；`<details` 段**不含** `open` 属性（默认折叠） | `npx vitest run tests/archived-entry.test.ts` | 全部命中（修前：函数不存在 → 必红） | `tests/archived-entry.test.ts` |
| A1-2 归档不进泳道但可见 | 字符串 | `buildBoard(state)`：`data-archived-bar` 段**之前**的部分不含归档需求 id；该 id 在归档条段内出现 | 同上 | 成立（修前：整页不含该 id → 必红） | `tests/archived-entry.test.ts` |
| A1-3 超限与空态 | 单元 | 2 条终态 + `limit=1` ⇒ 含「另有 1 条未显示」；`renderArchivedBar([])` ⇒ `''` | 同上 | 成立 | `tests/archived-entry.test.ts` |
| A1-4 计数与取消态 | 单元 | 1 archived + 1 canceled ⇒ summary 同时给出「已归档 1」「已取消 1」；canceled chip 带 `data-status="canceled"` | 同上 | 成立 | `tests/archived-entry.test.ts` |
| A2 归档详情可回看 | 字符串 | `buildReqDetail(archivedReq, [3 张任务])`：含 `dsh-pm-dag-panel`、3 个 `data-task="…"` 行、统计卡「总任务 3」 | 同上 | 成立（修前：数据能渲染但**无入口**，本用例锁住"有入口即能看"的一半） | `tests/archived-entry.test.ts` |
| A3 归档详情只读 | 字符串 | `buildReqDetail` 对 `archived` / `canceled` / `done`(带材料) 三种状态：均**不含** `move-req`、`plan-approve`、`plan-reject`、`verify-pass`、`verify-rework`、`archive-req`；且不含 `dsh-pm-action-bar` | 同上 | 三种状态全部为空操作条（**修前必红**：`canceled`+未批准计划会渲染「批准计划」；`done` 渲染「归档」） | `tests/archived-entry.test.ts` |
| A4 列表终态分组复活 | 字符串 | `buildListView` 传入 `done + archived + canceled`：分组标题含「已完成 / 已归档」；archived / canceled 行可见 | 同上 | 成立（**修前必红**：archived 被上游投影滤掉，终态组只剩 done） | `tests/archived-entry.test.ts` |
| A5 僵尸入口消失 | 模块面 + 字符串 | `'archiveReq' in api === false`；`buildReqDetail(done 带材料)` 不含 `archive-req`；`renderArchiveSection(done)` 文案不再出现「点「归档」」指引 | 同上 | 成立（**修前必红**：三处都在） | `tests/archived-entry.test.ts` |
| A6 投影不变量（FR-5 回归） | 单元 | ① `toReqCards` 不含 archived/canceled、**仍含 done**；② `toTerminalCards` 只含 archived/canceled、不含 done；③ 两集合互斥且并集 = 全部需求；④ 终态需求 `totalCount ===` 其任务数 | `npx vitest run tests/archived-entry.test.ts tests/client-view.test.ts tests/token-card.test.ts` | 全部成立（修前：`toTerminalCards` 不存在 → 必红） | `tests/archived-entry.test.ts`、`tests/client-view.test.ts`、`tests/token-card.test.ts` |
| A7 静态与构建 | 静态 | 本次改动文件无新增 `tsc` 错误；client bundle 重建通过 | `npx tsc --noEmit` ／ `pnpm build:client` | ≤ 基线 223 个错误且新增文件零错误；`[verify-client] OK … CSS 分片完整` | — |

## 修前必红清单 `serves: FR-1, FR-3`

实施第一步就是先让它们红，再让它们绿：

1. `tests/archived-entry.test.ts` 的 A1-1 / A6：`toTerminalCards` / `renderArchivedBar` 尚不存在 → 导入即失败；
2. 同文件 A1-2 / A4：`buildBoard` / `buildListView` 里归档需求 id **完全不可达** → 断言失败；
3. 同文件 A3 / A5：`canceled` / `done` 会渲染出动作按钮、`archive-req` 三处残留 → 断言失败。

**反例取证（记录在验收材料）**：修前跑一遍并留输出，证明"不是文档臆想"——
`npx vitest run tests/archived-entry.test.ts` 的失败信息应逐条指向上述三条。

## 需同步修订的既有用例 `serves: FR-4`

这两条用例**编码了僵尸行为**，是本次要翻转的对象（翻转是本需求的一部分，不是"改测试迁就代码"）：

| 既有用例 | 位置 | 现状断言 | 修订为 |
|---------|------|---------|--------|
| 「已完成且材料已备：操作条给 archive-req」 | `tests/board-info-fixes.test.ts:169` | `actionBar(html)` 含 `data-action="archive-req"`，且全文恰好 1 处 | 断言 `done` 详情**整页不含** `archive-req`、不含 `dsh-pm-action-bar`；用例名同步改为「已完成且材料已备：无人工按钮（端点在 REQ-9f4a44 已移除）」 |
| 归档区用例的 `done` 分支 | `tests/client-view.test.ts:579` | `expect(detail).toContain('data-action="archive-req"')` | `expect(detail).not.toContain('data-action="archive-req"')`；`:585` 的 archived 断言保持 |
| 「归档/取消态不进泳道」 | `tests/client-view.test.ts:76` | archived/canceled 不出现在任何泳道 | **保持不变**（本需求不倒退该语义），另加「但出现在归档条」的姊妹断言 |

## 人工验证（浏览器） `serves: FR-1, FR-2`

| 步骤 | 观察点 | 通过条件 |
|------|--------|---------|
| 1. `pnpm build:client` 后刷新看板，滚到底部 | 归档条 | 出现「🗄 已归档 N（点击展开回看 DAG / 任务）」，**默认折叠**，泳道不受挤压 |
| 2. 展开归档条 | 条目列表 | 每条是 `REQ-id · 标题 · done/total`；取消态条目带删除线 |
| 3. 点 `REQ-261001213924-1441` | 需求详情 | 执行 Tab 画出 DAG；任务表 39 行；顶部**没有**操作条 |
| 4. 切到列表视图，翻到「已完成 / 已归档」组 | 行 | 归档需求以行形式出现，状态列显示「归档」，操作列为空 |
| 5. 点归档需求的「来源会话」chip | 会话 chip | 走既有「已归档会话」提示（灰显），不静默无反应 |

> 判定口径与 `requirement.md` 的 A1–A6 一致；第 3 步即用户在原始反馈里想做的动作（"我想看看那张 DAG"）。
