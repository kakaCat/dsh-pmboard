# REQ-261002153446-c600 架构设计 · 看板 chip 的「恢复并打开」链路 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

> 改动面：客户端三个模块 + 两个测试文件。无新依赖、无新接口、无台账字段变化。

## 目标与总体方案 `serves: FR-1, FR-2`

**问题**：窗口/会话 chip 指向已归档会话时，点击只弹「已归档…无法跳转」——看板作为「回到该窗口」的唯一入口变成死路。

**当前状况**：`session-jump.ts` 的 `jumpToSession()` 在 `archivedSessionIds` 命中时直接 `return 'archived'`；`handleSessionJump()` 更早一步就用 `window.alert` 拦住，连 `jumpToSession` 都不进。

**设计方案**：把「已归档」从**终止条件**降级为**前置动作**——命中归档集合时先 `await workspaces.unarchiveSession(sid)`，
成功即继续原有跳转（`selectPanel(null)` 收面板 → `openSession(sid)`）；失败/能力缺失才终止并给出明确原因。

**不这么做的后果**：会话一旦归档，人只能离开看板去侧栏（已看不到该会话）——需求上下文断链，验收复现无路可走。

## 模块改动地图 `serves: FR-1, FR-2, FR-3`

```
点击 chip（data-action="jump-session"）
        │
        ▼
board-mount.onClick ──▶ handleSessionJump(sid)
        │                        │
        │                        ▼
        │                 jumpToSession(access, sid) ◀── 唯一判定点（新增 restore 前置）
        │                        │
        │        ┌───────────────┼────────────────┐
        │        ▼               ▼                ▼
        │  未归档：原样跳   归档：unarchiveSession   能力缺失/抛错
        │        │          ├─ 成功 → 原样跳        └─▶ 'archived' / 'restore-failed'
        │        │          └─ 抛错 → 'restore-failed'
        │        ▼
        │  layout.selectPanel(null) → uiWorkspace.openSession(sid)
        ▼
jumpResultMessage(result, sid) ──▶ 明确反馈（不静默）
        ▲
        └── dom-utils.sessionChipHtml：title 告知「点击取消归档并打开」
```

| 模块/文件 | 类型 | 改动内容 | serves |
|---|---|---|---|
| `src/client/session-jump.ts` | 改 | `WorkspacesServiceFace` 增可选 `unarchiveSession`；`SessionJumpResult` 增 `restore-failed`；归档分支改为「先恢复再跳」；`handleSessionJump` 去掉提前 alert 的预检查 | FR-1, FR-2, FR-4 |
| `src/client/render/dom-utils.ts` | 改 | 已归档 chip 的 `title` 文案改为「点击取消归档并打开」 | FR-3 |
| `src/client/board-mount.ts` | 改 | `jumpResultMessage` 增 `restore-failed` 文案、改写 `archived` 文案、`unavailable` 文案补「暂不可用」 | FR-2 |
| `tests/session-jump.test.ts` | 改 | 假服务投影加 `unarchiveSession` 与调用时间线；新增 4 条用例 | FR-5 |
| `tests/board-info-fixes.test.ts` | 改 | chip title 与结果文案断言 | FR-3, FR-5 |

## 依赖与分层 `serves: FR-1, FR-2`

- **无新增依赖**：`unarchiveSession` 是 DSH 客户端 `workspaces` 服务（`package.json` 的 `dsh.client.inject` 已含 `workspaces`）既有方法，`src/client/index.ts` 已把 `ctx.workspaces` 投射到 `window.__dshPmWorkspaces`，装配层零改动。
- **分层**：行为契约只写在 `session-jump.ts` 一处；渲染层（`dom-utils.ts`）只负责把「点击会发生什么」写进 `title`；调用方（`board-mount.ts`）只负责把结果翻译成人话。三处不重复判定。
- **依赖方向**：`board-mount → session-jump → (window 上的服务投影)`，不反向；渲染层不 import 行为层。

## 关键流程 `serves: FR-1, FR-4`

```
jumpToSession(sid)
   │
   ├─ uiWorkspace 缺失 ──────────────▶ 'unavailable'（不改任何状态）
   ├─ layout 缺失 ───────────────────▶ 'unavailable'（不改任何状态）
   │
   ├─ sid 在会话列表？
   │     ├─ 否 → sessions.refresh() → 仍否 ─▶ 'missing'
   │     └─ 是
   │          ├─ 未归档 ─────────────────▶ 收面板 → openSession → 'opened'
   │          └─ 已归档
   │               ├─ 无 unarchiveSession ─▶ 'archived'（旧语义，零副作用）
   │               ├─ unarchive 抛错 ─────▶ 'restore-failed'（不 openSession）
   │               └─ unarchive 成功 ────▶ 收面板 → openSession → 'opened'
```

| 决策 | 选项 A | 选项 B | 选了哪个 | 为什么 |
|---|---|---|---|---|
| 恢复时机 | 点击后立刻恢复（先于可用性检查） | 通过可用性检查、确认能打开后再恢复 | B | 打不开就不该改动宿主状态，避免「恢复了却没跳过去」的半成品 |
| 恢复失败是否仍尝试打开 | 仍然 openSession | 终止并报原因 | B | 归档会话在侧栏不可见，打开也没意义；静默失败会让人以为跳转生效 |
| 是否二次确认 | 先 confirm 再恢复 | 点击即恢复 | B | 点击意图就是「打开」；恢复幂等且可逆（还能再归档） |

## 失败模式与错误处理 `serves: FR-2`

| 失败模式 | 现象 | 处置 |
|---|---|---|
| 客户端无 `unarchiveSession`（旧版本/未注入） | 能力缺失 | 返回 `archived`，提示说清「客户端不支持取消归档」 |
| `unarchiveSession` 抛错（RPC 失败、会话被删） | 恢复未生效 | 返回 `restore-failed`，**不调用 openSession**，提示「取消归档失败…可到侧栏手动恢复」 |
| `uiWorkspace` / `layout` 未注入 | 跳不过去 | 沿用 `unavailable`，且**不恢复**（不留下半成品状态） |
| 目标会话已被删除 | 列表 refresh 后仍不命中 | 沿用 `missing` |

## 安全与回滚 `serves: FR-2, FR-3`

- **安全**：不新增对外请求；`unarchiveSession` 只接受形如 `session-<uuid>` 的会话 id，且来自 host 落库的 `sourceSessionId` / `executions[].sessionId`，不接受自由输入。
- **可逆**：恢复后可再次归档（DSH 侧栏原能力），本插件不新增第二个入口。
- **回滚路径**：还原三处源码（`session-jump.ts` 的恢复分支、`dom-utils.ts` 的 title、`board-mount.ts` 的文案）并 `pnpm build:client` 重新打包，即回到旧行为；无数据迁移、无残留字段。
