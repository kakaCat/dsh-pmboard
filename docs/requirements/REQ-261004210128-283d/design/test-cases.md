---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8
---

# 测试用例设计：看板会话运行中指示（REQ-261004210128-283d） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

> 判据一律可跑：每条 TC 都写明**断言什么、跑哪条命令、期望看到什么**。
> 测试环境：`node`（客户端渲染层是纯字符串函数，无需真实 DOM / 真实会话）。

## 测试层级与命令 `serves: FR-1, FR-3, FR-4, FR-5, FR-6, FR-8`

| 层级 | 命令 | 通过条件 |
|------|------|----------|
| 单测（新增） | `npx vitest run tests/client-session-running.test.ts` | 全绿（TC-01～TC-07） |
| 渲染回归 | `npx vitest run tests/client-view.test.ts tests/board-attach.test.ts` | 全绿（TC-08～TC-10 + 既有断言不改判据即过） |
| 类型 | `pnpm typecheck` | 退出码 0，总错误数 ≤ 223 基线，改动文件零错误（C-15） |
| 客户端构建 | `pnpm build:client` | 输出 `[verify-client] OK … 关键符号齐全, 样式归属章在场, CSS 分片完整`（C-12） |
| 全量回归 | `pnpm test` | 失败数 ≤ 106 基线，新增用例全绿（C-14） |
| 人工 E2E | 打开看板 + 让绑定窗口跑一个回合 | TC-11（截图入 evidence） |

## 单测用例（`tests/client-session-running.test.ts`，新增） `serves: FR-1, FR-2, FR-5, FR-6`

| 编号 | 输入 | 断言 |
|------|------|------|
| TC-01 | 假投影 `byId = { a: { running: true }, b: { running: false } }` | `isSessionRunning('a') === true`；`'b'` 与 `'zzz'` 均 `false` |
| TC-02 | 假投影 `sessions = undefined` / `list` 缺失 | 三个导出函数**都不抛**；`isSessionRunning('a') === false`；`runningSessionIds().size === 0` |
| TC-03 | 假投影缺 `subscribe`（旧客户端形状） | `subscribeSessionRunning(fn)` 返回可安全调用的 no-op 退订；调用 `fn` 不被触发 |
| TC-04 | `seats = [owner:a, worker:b]`，`isRunning` 仅对 `b` 为真 | `requirementRunning` 为 `true`（席位权威、任一即算） |
| TC-05 | 无 `seats`、`sourceSessionId = a`；`isRunning` 对 `a` 真 / 对 `b` 真 | 前者 `true`、后者 `false`（折算单 owner） |
| TC-06 | 无 `seats` 且无 `sourceSessionId` | `requirementRunning` 为 `false`（人工建卡） |
| TC-07 | 订阅回调 + 假 store 通知 | 回调被触发恰 1 次；调用退订后再通知 → 触发次数不变（退订生效、可重复调用） |

## 渲染回归用例（`tests/client-view.test.ts` / `tests/board-attach.test.ts`） `serves: FR-3, FR-4, FR-8`

| 编号 | 输入 | 断言 |
|------|------|------|
| TC-08 | `renderReqCard(card, now, archived, new Set(['s-a']))`，卡 `sourceSessionId='s-a'` | 输出含 `data-running="true"` 恰 1 次；`aria-label` 非空；同输入再调结果**逐字节相等**（幂等） |
| TC-09 | 同卡但 `running` 参数**省略** | 输出**不含** `data-running`；与改动前基线逐字节一致（旧调用点零回归） |
| TC-10 | `buildBoard(state, now, 'list', {}, NO_ARCHIVED, new Set(['s-a']))` | 列表行含 `data-running="true"`；泳道↔列表对同一需求**同时**出现/消失 |

## 重绘门控用例（并入会话运行态用例文件或 board-attach） `serves: FR-5, FR-8`

| 编号 | 输入 | 断言 |
|------|------|------|
| TC-12 | 已挂载附件 + 无关会话（不属任何需求）在 `byId` 上切换 `running` | 渲染计数**不增加**（门控生效） |
| TC-13 | 相关会话切换 `running` | 渲染计数 +1，且渲染输出含/不含 `data-running` 与状态一致 |
| TC-14 | `dispose()` 之后再触发 store 通知 | 不触发渲染；退订句柄被清空（无泄漏） |

## 人工 E2E 与截图证据 `serves: FR-3, FR-5, FR-7`

| 编号 | 步骤 | 期望（截图存 evidence） |
|------|------|-------------------------|
| TC-11a | 让某需求绑定窗口跑一个长回合，打开看板泳道视图 | 该卡出现转圈；同泳道其它卡无 |
| TC-11b | 切到列表视图 | 同一需求行出现同款转圈 |
| TC-11c | 回合结束后不刷新页面，等待 ≤2s | 指示自动消失 |
| TC-11d | 系统开启「减少动态效果」后重看 | 指示为静态半环 |
| TC-11e | 切暗色主题 | 指示可辨 |

## 判定标准 A → 用例对照 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

| 需求文档断言 | 承接用例 |
|--------------|----------|
| A1 泳道卡出现运行中指示 | TC-08, TC-11a |
| A2 列表行出现同款指示 | TC-10, TC-11b |
| A3 结束即消失（实时） | TC-13, TC-11c |
| A4 人工建卡不误报 | TC-06, TC-09 |
| A5 多席位任一在跑即显示 | TC-04 |
| A6 无关会话抖动不重绘 | TC-12 |
| A7 服务不可得时诚实 | TC-02, TC-03 |
| A8 既有渲染不回归 | TC-09, TC-10「省略参数」分支 |
| A9 动效偏好被尊重 | TC-11d（+ 样式媒体查询静态检查） |
| A10 构建 / 类型 / 测试达标 | 上表「测试层级与命令」四行 |

## 基线阈值（不许放宽） `serves: FR-8`

| 项 | 基线 | 本次门槛 |
|----|------|----------|
| `pnpm test` 失败数 | 106 | ≤ 106，且新增用例全绿 |
| `pnpm typecheck` 错误数 | 223 | ≤ 223，改动文件零错误 |
| `pnpm build:client` | `[verify-client] OK` | 必须 OK（样式归属章 + 分片完整） |
