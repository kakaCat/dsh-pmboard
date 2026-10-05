# REQ-261002153446-c600 测试策略与用例 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

## 策略 `serves: FR-5`

- **层级**：纯函数/模块级单测（vitest，node 环境）。`session-jump.ts` 不依赖真实 DOM，测试显式注入假服务投影并记录**调用时间线**——顺序与有无都可证伪。
- **可跑命令**：`npx vitest run tests/session-jump.test.ts tests/board-info-fixes.test.ts`
- **断言口径**：不看实现细节，只看「返回什么结果 + 按什么顺序调了哪些服务 + 渲染出的 HTML 里有什么」。

## 用例清单 `serves: FR-1, FR-2, FR-3, FR-4`

| 编号 | 场景 | 输入 | 预期结果 |
|---|---|---|---|
| TC-1 | 已归档会话点击 = 恢复后打开 | `archived=[sid]`、提供 `unarchiveSession`、会话在列表 | 返回 `opened`；时间线 `unarchive:sid → selectPanel:null → openSession:sid` |
| TC-2 | 恢复失败要响亮 | 同上，但 `unarchiveSession` 抛错 | 返回 `restore-failed`；时间线**无** `openSession` |
| TC-3 | 能力缺失保留旧语义 | `archived=[sid]`、投影**不含** `unarchiveSession` | 返回 `archived`；时间线为空 |
| TC-4 | 未归档会话零副作用 | 普通 sid | 返回 `opened`；时间线**无** `unarchive`，顺序断言与既有用例一致 |
| TC-5 | 已归档 chip 文案 | 列表视图 + `archivedSessionIds` 含该 sid | HTML 含 `data-archived="true"`、`is-archived`，且 `title` 含「点击取消归档并打开」 |
| TC-6 | 结果文案齐备 | 逐值调 `jumpResultMessage` | `opened` 为空串；`restore-failed` 含「取消归档失败」；`archived` 含「已归档」；`missing` 含 sid 短码；`unavailable` 含「暂不可用」 |

## 回归与门禁 `serves: FR-5`

| 项 | 命令 | 通过条件 |
|---|---|---|
| 单测 | `npx vitest run tests/session-jump.test.ts tests/board-info-fixes.test.ts` | 0 failed（含 TC-1..TC-6） |
| 类型检查 | `npm run typecheck` | 不高于 HEAD 基线（历史错误另计） |
| 客户端构建 | `pnpm build:client` | `[verify-client] OK`（改了客户端源码必须重建 bundle，规范 C-12） |
| 既有回归 | 上述两个文件既有用例 | 全部保持通过；`archived` 语义仅按 TC-3 收窄 |

## 手工验收 `serves: FR-1, FR-3`

1. 在侧栏归档某个有需求绑定的会话 → 看板该需求行的窗口 chip 变灰、title 显示「点击取消归档并打开」。
2. 点击该 chip → 会话恢复（侧栏可见）且 GUI 跳转到该会话、看板面板收口。
3. 再次归档同一会话 → 行为可重复（幂等、可逆）。
