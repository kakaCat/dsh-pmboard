# REQ-261002153446-c600 接口设计 · 跳转 / 服务调用 / chip 渲染 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

> 本需求没有网络接口、没有后端错误码；对外契约是**函数行为**、**服务调用**与**DOM 文案**三类。

## I-1 · jumpToSession 行为契约 `serves: FR-1, FR-2, FR-4`

```typescript
export async function jumpToSession(
  access: SessionServiceAccess,
  sessionId: string,
): Promise<SessionJumpResult>
```

| 前置条件 | 返回值 | 副作用（按时间顺序） |
|---|---|---|
| `uiWorkspace` 不可用 | `'unavailable'` | 无 |
| `layout` 不可用 | `'unavailable'` | 无 |
| 会话不在列表，refresh 后仍不在 | `'missing'` | `sessions.refresh()` |
| 未归档 | `'opened'` | `selectPanel(null)` → `openSession(sid)` |
| 已归档 + 无 `unarchiveSession` | `'archived'` | 无 |
| 已归档 + `unarchiveSession` 抛错 | `'restore-failed'` | `unarchiveSession(sid)`（抛错，**不**收面板、**不**开会话） |
| 已归档 + `unarchiveSession` 成功 | `'opened'` | `unarchiveSession(sid)` → `selectPanel(null)` → `openSession(sid)` |
| 目标即当前会话（未归档） | `'opened'` | 只 `selectPanel(null)`，不重复 `openSession` |

不变式：**只在「确认能打开」之后才产生恢复副作用**（可用性检查在恢复之前）；
恢复成功后的跳转顺序与既有实现逐项一致（先收面板、再切会话）。

## I-2 · workspaces 服务调用契约 `serves: FR-1, FR-2`

```typescript
// 调用形态（本插件只调不实现）
const ws = access.getWorkspaces()
if (typeof ws?.unarchiveSession === 'function') {
  await ws.unarchiveSession(sessionId)   // 幂等：未归档 id 是空操作
}
```

| 项 | 约定 |
|---|---|
| 入参 | 会话 id（`session-<uuid>` 形态），来自 host 落库字段 |
| 返回 | `Promise<void>`；成功即宿主归档集合已更新 |
| 错误 | 抛错 = 恢复未生效 → 上层返回 `'restore-failed'`，不吞异常（`console.error` 留痕） |
| 幂等 | 是；重复点击安全（第二次命中「未归档」路径，不再调用） |

## I-3 · chip 渲染契约 `serves: FR-3`

`sessionChipHtml` 输出形态（已归档时）：

```html
<button type="button" class="dsh-pm-window is-archived" data-action="jump-session"
        data-sid="session-…" data-archived="true"
        title="立项来源窗口已归档（session-…）：点击取消归档并打开">窗口 w-xxxxxxxx · 已归档</button>
```

| 属性 | 约定 |
|---|---|
| `data-action` | 恒为 `jump-session`（已归档也**不下线**成无 action 的 span） |
| `data-archived` | 已归档 = `"true"`，供样式与提示区分 |
| `title` | 已归档 → 前缀 `{kind}已归档（{sid}）：` + **「点击取消归档并打开」**；未归档 → 原「点击跳转到该会话」 |
| 文本 | 保持 `{label} · 已归档`，不新增/删除类名 |

## I-4 · 结果文案契约 `serves: FR-2`

`jumpResultMessage(result, sid)`（`src/client/board-mount.ts`）与 `handleSessionJump` 的 alert 同源同口径：

| 结果 | 文案要点 | 断言锚点 |
|---|---|---|
| `opened` | 空串（已跳过去，不打扰） | `''` |
| `archived` | 已归档 + **客户端不支持取消归档** | 含「已归档」 |
| `restore-failed` | **取消归档失败** + 未跳转 + 手动恢复建议 | 含「取消归档失败」 |
| `missing` | 不在当前会话列表 | 含「不在当前会话列表」+ sid 短码 |
| `unavailable` | 会话导航服务**暂不可用** | 含「暂不可用」 |

## I-5 · 错误语义 `serves: FR-2`

- **不新增对外错误码**：结果枚举即契约；所有失败路径都有对应文案，不存在静默返回。
- `restore-failed` 与 `archived` 的区别：前者是**执行失败**（能力在，动作抛错），后者是**能力缺失**（旧客户端）。
- 恢复成功不产生任何提示（与 `opened` 一致）——避免成功也弹窗的噪音。
