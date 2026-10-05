---
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
---

# 测试用例（REQ-261004095621-c167） <!-- serves: FR-1, FR-4 -->

## 用例清单 `serves: FR-4`

| 编号 | 层次 | 跑什么 | 期望 |
|---|---|---|---|
| TC-1 | 单测 | `pnpm vitest run tests/kb-client-page.test.ts` | 全绿（含"侧栏图标必须是合法 React 元素：自身与子元素都带 `$$typeof`"） |
| TC-2 | 知识层 | `pnpm kb:check` | 退出码 0（生成物零漂移 + 九项自检 + 覆盖度） |
| TC-3 | 构建 | `pnpm build:client` | `[verify-client] OK … 关键符号齐全, 样式归属章在场, CSS 分片完整` |
| TC-4 | 类型 | `npx tsc --noEmit 2>&1 \| grep -c 'error TS'` | ≤ 144（2026-10-04 基线），改动文件零新增 |
| TC-5 | 红线断言 | `grep -rn "conversation.input.model" src/client` | 无输出（本仓不注册该席位） |
| TC-6 | 回归 | `pnpm vitest run tests/client-page-panel.test.ts tests/panel-icon.test.ts tests/client-page-register.test.ts` | 全绿（沿用既有基线，失败数不得增加） |

## 反向演练（防"断言写了个寂寞"） `serves: FR-4`

- **演练**：把 `src/client/page/register-knowledge.ts` 的 `createElement(...)` 改回裸对象 `{type,props}` → **TC-1 必红**（`$$typeof` 断言失败）。
- **口径**：同 `tests/binding-trace.test.ts` 的反向演练——断言必须能抓住它要防的那个缺陷。
- **实测记录**：2026-10-04 修复前，该缺陷在线上表现为 `sidebar.panellist` 的 `pmboard-knowledge` 条目 `active:false`（退役）。

## 人工/端到端口径（不可自动化，需用户配合） `serves: FR-1, FR-3`

| 编号 | 场景 | 操作 | 记录 |
|---|---|---|---|
| MAN-1 | 现象复核 | 用户在会话里点一次模型控件 | 记下"点前 `active` / 点后 `active`"两条快照（本案例：`true → false`） |
| MAN-2 | 归因取证 | 复现后看控制台 | 抄录 `slot entry crashed in '<slot>': <error>` 原文与堆栈 |
| MAN-3 | 修复验证 | 重装客户端后再点 3 次 | `Slots.listSubTree(root='conversation.input.model')` 的 `occupants[0].active` 恒为 `true` |

## 回归基线（开工时实测，改动不得变差） `serves: FR-4`

- `pnpm test`：48 文件 / 98 例红（**存量**：typecheck 门禁 144 个既有 TS 错误、size-budget 报其他文件、
  缺开发依赖 `react-dom/server` 与 `@deepseek-ai/dsh-session`、`node-panel-styles` 令牌断言漂移）；
  本需求改动后**不得新增**失败。
- `npx tsc --noEmit`：144 个错误（存量），本需求涉及文件 **0 新增**。
