---
req: REQ-261003191948-e94a
doc: frontend
serves: FR-4
---

# 前端设计 · 客户端不再吞掉服务端说的话（REQ-261003191948-e94a）

> 条件必交：`requirement.md` front-matter 声明 `sides: backend, frontend`，故本份必交。
> 本文档只覆盖**客户端半**（`src/client/**`）；宿主半见 `backend.md`。

## 问题定位 `serves: FR-4`

看板页面在本次事故里显示的是「加载失败：Error: HTTP 404」——**404 这个字是客户端自己造的**。

```
浏览器                 服务端
  │  fetch /state        │
  │ ────────────────────▶│  503 {success:false, error:'台账未迁移…', code:…, hint:…}
  │ ◀────────────────────│
  │  unwrap(): if (!res.ok) throw new ApiError('HTTP ' + res.status)   ← 响应体在这里被丢弃
  ▼
buildError('Error: HTTP 503')   ← 服务端说了原因，客户端没听
```

结论：宿主侧修好之后，**如果不动客户端，用户仍然只能看到一个状态码**。FR-4 是让这次修复
真正到达用户眼睛的那一环。

## 目录与包结构 `serves: FR-4`

```
src/client/
├── api.ts                    （本需求改动：unwrap / fetchReqFile / ApiError）
├── board-mount.ts            （本需求改动：catch 分支传 hint）
├── render/
│   └── dom-utils.ts          （本需求改动：buildError 增 hint 参数与命令块）
└── styles/                   （不改：命令块复用既有 .dsh-pm-error 容器与等宽字体令牌）

tests/
└── api-client.test.ts        （本需求改动：追加非 2xx 错误体透出用例）
```

| 路径（工作区相对） | 内容（一句话职责） | 新增/改动 | 落此处的理由（为什么不放别处） |
|---|---|---|---|
| `src/client/api.ts` | 数据层：`unwrap` 解析非 2xx 错误体；`ApiError` 增 `hint` | 改动 | 丢体就发生在 `unwrap` 这一行，修在源头才不会有第二条丢体的路径 |
| `src/client/render/dom-utils.ts` | `buildError(message, hint?)` 渲染原因 + 可复制命令块 | 改动 | 既有 `buildError` 就在此处，且被 `view.ts` 再导出（多入口共用同一个渲染） |
| `src/client/board-mount.ts` | 失败分支把 `ApiError.hint` 传给 `buildError` | 改动 | 唯一的顶层 `fetchAll` 捕获点 |
| `src/client/styles/` | 不改 | — | 命令块用既有错误容器的样式令牌，不新增视觉资产 |

## 呈现设计 `serves: FR-4`

```
┌─ 项目看板 ────────────────────────────────────────────┐
│                                                       │
│  ⚠ 加载失败                                            │
│  检测到 legacy 单册 /Users/mac/.dsh/dsh-reqboard.json， │  ← err.message（服务端原文）
│  但数据根 /Users/mac/.dsh/reqboard 尚未迁移。           │
│                                                       │
│  在终端执行：                                          │
│  ┌─────────────────────────────────────────────────┐  │
│  │ node --import tsx/esm scripts/migrate-ledger-…  │  │  ← err.hint（可选中复制）
│  └─────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

渲染契约：

```ts
export function buildError(message: string, hint?: string): string {
  const head = `<div class="dsh-pm-board"><div class="dsh-pm-error">加载失败：${esc(message)}`
  if (hint === undefined || hint.trim().length === 0) return head + '</div></div>'
  return head
    + `<div class="dsh-pm-error-hint-label">在终端执行：</div>`
    + `<pre class="dsh-pm-error-hint">${esc(hint)}</pre>`
    + '</div></div>'
}
```

- `esc()` 是既有实现，**必须**继续用于 message 与 hint 两处（hint 含用户主目录路径，不转义会破 HTML）。
- hint 用 `<pre>` 而非 `<code>`：命令含换行与路径分隔符，`<pre>` 保住空白且可直接框选复制。
- **不加"复制"按钮**：本需求边界写明不做独立交互设计；`<pre>` 的可选中性已满足"可复制"。

## 数据流 `serves: FR-4`

```
fetchAll()
  └─ api.fetchState()
       └─ unwrap(fetch(BASE + '/'))
            ├─ res.ok ─▶ 解析 {success,data} ─▶ BoardState ─▶ render()
            └─ !res.ok ─▶ 读 body
                           ├─ body.error 有 ─▶ ApiError(body.error, body.code, body.hint)
                           └─ body.error 无 ─▶ ApiError('HTTP ' + status)
  └─ catch (err) ─▶ buildError(err.message, err.hint) ─▶ viewEl.innerHTML
```

两条分支的区别只有一个：**服务端有没有说话**。客户端不猜原因（不说"可能是网络问题"），
也不吞原因（不把 503 显示成 404）。

## 边界 `serves: FR-4`

- **不做**独立的"未就绪全屏页"或引导向导——本需求只到文案 + 命令块。
- **不做**错误重试按钮 / 自动轮询恢复：这不是临时态，重试一万次结果一样（`data-model.md` 明确不返回 `Retry-After`）。
- **不改** `subscribeEvents`（SSE）的连接语义：未就绪时 EventSource 收到 503 会自行按既有策略重连，
  服务端不再挂起连接即可（见 `backend.md` 的 T5）。
- **不引入**任何新依赖、不做 i18n 抽取（本仓文案此前均为中文字面量）。
