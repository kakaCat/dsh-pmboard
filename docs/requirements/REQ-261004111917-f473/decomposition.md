---
req_id: REQ-261004111917-f473
serves: FR-1, FR-2, FR-3, FR-4, FR-5
---

# 拆分计划（REQ-261004111917-f473）

> 依据：`design/{architecture,interfaces,data-model,use-cases,test-cases}.md`（均已确认）。
> **契约卡不单列**：本需求的接口/数据契约已在设计阶段定稿并经人确认（`design/interfaces.md`
> 的宿主路由形状与 `deep-link.ts` 签名、`design/data-model.md` 的三态结构与 10 条不变量），
> 实现卡按其中签名逐字实现；不再造一张「把已冻结的东西再抄一遍」的空卡。
> 纪律：每卡 acceptance 必须能跑；无接口可联调的卡 `skipIntegration`（避免空联调段）。

## 目标

让插件产出的需求详情深链 `/dashboard#pmboard?req=REQ-…` 在当前 GUI 点得通：
宿主补兼容入口（不再 404）→ 客户端把 `req` 从片段里带回来 → 看板面板打开并定位到该需求。
`board_link` 字符串与契约不变（只改工具 schema 文案）。

## 改动盘点

| 文件/区域 | 动作 | 归属卡 |
|---|---|---|
| `src/http/legacy-board-route.ts` | 新增（GET/HEAD→200 中转页，其余 405；零台账读取） | t1 |
| `src/index.ts` | 修改（webServer 注入块并列注册 `/dashboard`、`/dashboard/` 两条 exact 路由；返回组合 disposer） | t1 |
| `tests/legacy-board-route.test.ts` | 新增（最小假 `req/res`，仿 `tests/reqboard/degraded-startup.test.ts`） | t1 |
| `src/client/deep-link.ts` | 新增（三态解析 + 注入端口消费，全程不抛） | t2 |
| `src/client/index.ts` | 修改（apply 尾部消费一次 `location.hash`，端口接线） | t2 |
| `tests/deep-link.test.ts` | 新增（解析六态 + 时序 + 重试/兜底） | t2 |
| `src/client/board-focus.ts` | 修改（新增 `subscribeBoardFocus`；有订阅者时不留 pending） | t3 |
| `src/client/board-mount.ts` | 修改（挂载订阅定位意图；dispose 退订） | t3 |
| `tests/board-focus.test.ts` | 修改（追加订阅语义用例；既有 5 条不动） | t3 |
| `tests/board-attach.test.ts` | 修改（追加 TC-8 已挂载定向、TC-9 dispose 退订） | t3 |
| `src/tools/StatusTool/StatusTool.ts:202`、`src/tools/CaptureTool/CaptureTool.ts:80`、`src/tools/CreateTool/CreateTool.ts:71` | 修改（仅 `board_link` 描述文案） | t4 |
| `tests/tool-schema-board-link.test.ts` | 新增（文案 + 产出字符串回归） | t4 |
| `docs/requirements/REQ-261004111917-f473/`（证据/验收材料） | 新增（构建与真机证据） | t5 |

**不动**：`src/http/routes.ts`、`board_link` 的产出字符串（三处）、台账/RTM/队列存储、`session-jump.ts`、`board-entry.ts`。

## 任务表

| key | 标题 | phase | side | depends_on | serves |
|---|---|---|---|---|---|
| t1 | 宿主兼容入口：/dashboard 不再 404 | implement | backend | — | FR-1, FR-5 |
| t2 | 客户端深链消费：清 hash → 定位 → 切面板 | implement | frontend | — | FR-2, FR-3, FR-5 |
| t3 | board-focus 订阅通道 + 看板挂载定向 | implement | frontend | — | FR-2, FR-5 |
| t4 | 兼容口径回归 + 工具 schema 文案 | implement | backend | — | FR-4, FR-1 |
| t5 | 构建 + 端到端联调 + 全量回归 | test | fullstack | t1, t2, t3, t4 | FR-1, FR-2, FR-3 |

**并行说明**：t1（宿主）/ t2（`deep-link.ts` + client 接线）/ t3（`board-focus.ts` + `board-mount.ts`）/
t4（tools 文案）改动面互不重叠，可并行；t2 与 t3 的**行为耦合**（UC-3「人已站在看板上」）
由 t5 的端到端步骤 ③ 收口——两张卡各自的单测都不依赖对方在场。

## 覆盖对照表

| 需求条款 | 接收任务 |
|---|---|
| FR-1 | t1 |
| FR-2 | t2, t3 |
| FR-3 | t2 |
| FR-4 | t4 |
| FR-5 | t1, t2, t3 |

## 各卡验收（可证伪）

- **t1**：`npx vitest run tests/legacy-board-route.test.ts` → 全绿，逐条含：
  GET → 200 且 `content-type` 含 `text/html`、`cache-control=no-store`、body 含 `location.replace`
  且同带 `location.search` 与 `location.hash`；POST → 405 且 `allow: GET, HEAD`；
  两次 GET 的 body **逐字节相同**；body 不含 `REQ-` 与 `requirements` 字样（零业务数据）。
- **t2**：`npx vitest run tests/deep-link.test.ts` → 全绿，逐条含：解析六态表（表见
  `design/interfaces.md` §解析规则）；调用序列 `clearHash → requestFocus → selectPanel`；
  `selectPanel` 前 2 次抛、第 3 次成功 → 返回 `'focused'` 且 `selectPanel` 恰 3 次、`clearFocus` 0 次；
  恒抛且 `maxAttempts=3` → `'failed'` 且 `clearFocus` 1 次且 `peekBoardFocus()` 为 `undefined`；
  `'#other'` → 四个端口调用次数全为 0。
- **t3**：`npx vitest run tests/board-focus.test.ts tests/board-attach.test.ts` → 全绿，逐条含：
  既有 5 条 focus 用例仍绿；有订阅者时 `requestBoardFocus` 通知且 `peekBoardFocus()` 为 `undefined`；
  订阅者抛错不影响其他订阅者；挂载完成后（非重新挂载）调 `requestBoardFocus('REQ-a')`
  → `el.innerHTML` 含 `data-detail-req="REQ-a"`；`dispose()` 后 `requestBoardFocus` 回到一次性语义。
- **t4**：`npx vitest run tests/tool-schema-board-link.test.ts` → 全绿，逐条含：三处
  `board_link.description` 含「并定位」且**不含**「可在会话中点击跳转」；
  三处产出值仍为 `/dashboard#pmboard?req=<REQ>`（`QueryState.ts:189`、`CreateRequirement.ts:82`、
  `CaptureRequirement.ts:291`）。
- **t5**：`pnpm build` 退出码 0 且 `dist/index.mjs`、`lib/client.js` 均有新产物（C-11）；
  `grep -c 'location.replace' dist/index.mjs` ≥ 1；`pnpm build:client` 输出 `[verify-client] OK`；
  `npx vitest run tests/reqboard tests/application tests/http tests/deep-link.test.ts tests/legacy-board-route.test.ts tests/board-focus.test.ts tests/board-attach.test.ts`
  失败数 ≤ 开工基线（开工时实测并记进卡文档）；`npx tsc --noEmit` 归属本需求文件零新增 `error TS`；
  真机四步（`design/use-cases.md` §端到端验收动作 ①~④）逐条给命令 + 输出摘要
  （宿主需重载插件后执行；②③ 为人工点击，给截图路径或文字证据）。

## 兼容与回滚

- **旧调用方**：`board_link` 字符串不变 → PM 引导段、三处工具回执、用户收藏的旧链接全部继续可用；
  修复后这些链接从「必 404」变成「能定位」。
- **旧链接形态**：无 `req`（`#pmboard`）、带尾斜杠（`/dashboard/`）、带未知 query 键均按设计降级
  （开面板、不定位、不报错），由 t1 与 t2/t4 的用例覆盖。
- **回滚**：撤 `src/index.ts` 两条注册 + `src/client/index.ts` 一次消费调用即可回到旧行为；
  无数据迁移、无持久化格式变更、无台账字段改动。

## 边界（不做）

与需求文档「边界」三条一致：不做可分享 URL 的 SPA 路由改造；不动 `board_link` 字段名与字符串形态；
不为 `/session/<id>` 等其他旧深链做同类兼容。没写进边界的即本次不做。
