# REQ-261002153446-c600 看板窗口 chip：已归档会话点击后取消归档并打开

> 档位：轻档（改动面小、无第二个未定决策）· 类型：feature

## TL;DR

看板（列表视图 / 泳道 / 需求详情）里的「窗口」与「会话」chip 指向的会话一旦被归档，
chip 变灰、点击只弹一句 `该会话已归档（日志保留、侧栏不可见），无法跳转`——**等于点了没用**。
而看板正是「回到产生该需求的窗口」的唯一入口：会话归档后侧栏不再显示，用户在 GUI 里没有别的路回去。

本次改成：**点击已归档 chip = 先取消归档（`workspaces.unarchiveSession(sid)`）→ 再走既有跳转**
（`layout.selectPanel(null)` 收面板 + `uiWorkspace.openSession(sid)` 打开会话）。
取消归档失败或客户端不具备该能力时，仍给**明确原因**（不静默、不假装跳过去了）。

```
现在：点灰 chip → alert「该会话已归档…无法跳转」→ 死路

改后：点灰 chip → unarchiveSession(sid) ─┬─ 成功 → selectPanel(null) → openSession(sid) → 会话打开
                                        └─ 失败 → alert「取消归档失败：<原因>」（不 openSession）
```

## 判定标准（可证伪）

| 断言 | 量法 | 通过条件 |
|------|------|----------|
| A1 归档会话可一键回去 | 单测：`jumpToSession` 传入在 `archivedSessionIds` 里的 sid，假 `unarchiveSession` 记录时间线 | 返回 `opened`，时间线为 `unarchive:<sid>` → `selectPanel:null` → `openSession:<sid>` |
| A2 恢复失败要响亮 | 单测：`unarchiveSession` 抛错 | 返回 `restore-failed`，时间线**无** `openSession`（不假装打开） |
| A3 能力缺失保留旧语义 | 单测：workspaces 投影没有 `unarchiveSession` | 返回 `archived`，且**不**调用 `selectPanel`/`openSession` |
| A4 非归档会话零副作用 | 单测：未归档 sid 跳转 | 时间线**无** `unarchive`，且既有顺序断言不变 |
| A5 文案反映新行为 | 单测：`jumpResultMessage('restore-failed', sid)` 与 chip HTML | 提示含「取消归档失败」；已归档 chip 的 `title` 含「点击取消归档并打开」 |
| A6 套件全绿 | `npx vitest run tests/session-jump.test.ts tests/board-info-fixes.test.ts` | 0 failed（含新增用例） |
| A7 类型与构建 | `npm run typecheck` / `pnpm build:client` | 均成功（无新增类型错误） |

## 产品定义

看板顶部的「负责人」列与需求详情、任务详情里会渲染两类会话 chip：

| chip | 来源字段 | 语义 |
|------|----------|------|
| `窗口 w-xxxxxxxx` | `requirement.sourceSessionId` | 该需求是在哪个 GUI 会话窗口里立项的 |
| `会话 xxxxxxxx…` | 任务 `executions[].sessionId` | 哪个执行会话跑过这张卡 |

chip 的行为契约由 `src/client/render/dom-utils.ts`（渲染）+ `src/client/session-jump.ts`（跳转）两处共同定义：
**它必须是一个能真的把人带回那个会话的动作**。归档会话在 DSH 里是「日志保留、侧栏不可见」，
因此「跳过去也打不开」；但 DSH 客户端 `workspaces` 服务已提供**幂等**的 `unarchiveSession(sessionId)`，
恢复后会话回到它原来的侧栏位置（归档从不动分组账目）。

所以新契约是：**已归档 chip 仍是可点按钮，点击 = 恢复 + 打开**；这是同一个动作的两个步骤，
不是两个功能。恢复是幂等的（对未归档 id 调用是空操作），重复点击安全。

## 用户与角色

- **看板使用者（人）**：想回到某个需求/某张卡当时那个窗口继续干活或核对上下文；他点的意图是「打开它」，
  不是「知道它归档了」。
- **实施 agent**：验收时需要人回到产生该需求的窗口复现问题；死路会让验收卡住。
- **前端维护者（本插件）**：需要 chip 的行为契约写在一处（`jumpToSession`），
  渲染层只负责把「点击会发生什么」写进 `title`，不在两处各写一套判定。

## 功能点

- **FR-1: 已归档会话点击即取消归档并打开**——`jumpToSession` 命中已归档集合时，先 `await workspaces.unarchiveSession(sid)`，成功后继续既有跳转路径，整体返回 `opened`
- **FR-2: 恢复失败或能力缺失时响亮失败**——`unarchiveSession` 抛错 → 返回新结果 `restore-failed`（不调用 `openSession`）；workspaces 投影不含该方法 → 保留 `archived` 语义，提示里说清是「客户端不支持取消归档」
- **FR-3: chip 文案反映「恢复并打开」**——已归档 chip 保持灰态样式，但 `title` 改为「已归档（sid）：点击取消归档并打开」，让点击前就看得见会发生什么
- **FR-4: 跳转语义零回归**——恢复成功后仍严格「先 `layout.selectPanel(null)` 收面板、再 `uiWorkspace.openSession(sid)`」；未归档会话的路径与副作用完全不变（不误调 `unarchiveSession`）
- **FR-5: 行为由单测锁死**——`tests/session-jump.test.ts` 新增 A1–A4 用例，`tests/board-info-fixes.test.ts` 覆盖 A5 文案（含把既有基线红 `jumpResultMessage('unavailable')` 文案对齐）

## 边界

**做**：

1. `src/client/session-jump.ts`：`WorkspacesServiceFace` 增可选 `unarchiveSession`；`SessionJumpResult` 增 `restore-failed`；已归档分支改为「先恢复再跳」，`handleSessionJump` 的预检查改为交给同一路径处理
2. `src/client/render/dom-utils.ts`：已归档 chip 的 `title` 文案改为「点击取消归档并打开」（仍是 `data-action="jump-session"` 的可点按钮）
3. `src/client/board-mount.ts`：`jumpResultMessage` 增 `restore-failed` 文案；`unavailable` 文案对齐既有断言（含「暂不可用」）
4. 单测：`tests/session-jump.test.ts`（A1–A4）、`tests/board-info-fixes.test.ts`（A5）

**不做**：

1. 不加二次确认弹框：用户点的就是「打开」，恢复幂等、可逆（会话仍可再归档），不值得多一次点击
2. 不动 DSH 宿主：不改 `workspaces` 实现、不改会话列表与归档逻辑；只调用它已有的 `unarchiveSession`
3. 不改看板跳转的**目的地**语义：不新增「跳转前先切工作区」、不改 `openSession` 收口规则、不动需求/任务详情的其他按钮
4. 不碰需求归档（`archived` 需求状态）与 `docs/` 材料流程——本需求只涉及**会话（DSH session）**的归档

## 档位依据（轻档）

- **L1 一句话目标 + 可证伪判定**：点已归档窗口 chip = 取消归档并打开——判定见上表 A1–A7。
- **L2 范围边界**：见上「做」4 条、「不做」4 条，名单之外即本次不做。
- **L3 轻路径依据**：改动面 = 1 个跳转模块 + 1 个文案 + 1 个结果文案 + 2 个测试文件；接口（`unarchiveSession`）与顺序（恢复 → 收面板 → 开会话）已在本文定死，无第二个未定决策。
- **L4 批准闸门 + 下一步**：下一步 = design；本文件落盘 → `reqboard_submit(kind=requirement)` 登记 → `reqboard_ask_confirm(target=artifact, kind=requirement)` 请人确认，未获批准不得进入设计。
- **L5 轻档 ≠ 无产物**：本 `requirement.md` 即产物，落盘 + 登记 + 确认三步照走。
- **单向升级**：实施中若出现「需要改 DSH 宿主 `workspaces` 实现」「需要新增会话归档/恢复的**接口**（后端）」「需要在看板上新增会话管理界面」任一信号，立即停手升级重档，不反向降级。

## 下一步

design —— 用 `reqboard_ask_confirm(target=artifact, kind=requirement)` 交棒；未获批准不得进入设计。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1 |
| FR-2 | ✅ 已接收 | t1、t2 |
| FR-3 | ✅ 已接收 | t2 |
| FR-4 | ✅ 已接收 | t1、t3 |
| FR-5 | ✅ 已接收 | t3 |

> 无未接收条款（5 条全部有落点）。

<!-- reqboard:marks:end -->
