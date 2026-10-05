---
req: REQ-261004111917-f473
doc: interfaces
serves: FR-1, FR-2, FR-3, FR-4
---

# 接口设计 · 看板深链 404 兼容（REQ-261004111917-f473）

> 契约先定死：签名（参数/返回/错误码）与形状（字段/类型/约束）。契约定不死不许进拆分。

## 宿主 HTTP 路由契约 `serves: FR-1`

**注册**（`src/index.ts` 的 `webServer` 注入块，与既有 `/dashboard/api/reqboard` 前缀路由并列）：

```ts
webServer.register({ kind: 'exact', path: '/dashboard',   handler: createLegacyBoardRouteHandler() })
webServer.register({ kind: 'exact', path: '/dashboard/',  handler: createLegacyBoardRouteHandler() })
```

- 为什么是 `exact`：命名路由**先于 fallback 匹配**，故这两条路径不再落进静态兜底（E-3）。
- 为什么不与既有前缀路由冲突：`exact` 表与 `prefix` 表分离；`/dashboard` 也不满足前缀
  `/dashboard/api/reqboard` 的匹配（需 `p` 或 `p/` 开头）。
- 两条（带/不带尾斜杠）都注册：旧链接无尾斜杠，但手工输入/二次转发可能出现尾斜杠，
  两者行为必须一致。

**方法与状态码**：

| 方法 | 路径 | 状态 | 响应头 | 响应体 |
|---|---|---|---|---|
| GET | `/dashboard`、`/dashboard/` | 200 | `content-type: text/html; charset=utf-8`、`cache-control: no-store` | 中转 HTML（下） |
| HEAD | 同上 | 200 | 同上（无体，Node 自动去体） | — |
| POST/PUT/DELETE/… | 同上 | 405 | `allow: GET, HEAD`、`content-type: text/plain; charset=utf-8` | `method not allowed` |

**中转 HTML（唯一允许的实现形状，单测按此断言）**：

```html
<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>项目看板</title></head><body>
<script>location.replace("/" + location.search + location.hash)</script>
<noscript>项目看板已迁到应用内：请打开侧栏「项目看板」。</noscript>
</body></html>
```

**约束**：
- 必须含子串 `location.replace`（FR-5 断言锚点），且表达式必须同时带 `location.search` 与 `location.hash`
  ——req 在片段里，服务端看不到，只有客户端能带过去。
- `cache-control: no-store`：中转页不可被缓存，否则一次点击后长期失效。
- **零业务数据**：不读台账、不回任何 REQ 字段（避免把无鉴权路径变成信息出口）。
- **幂等**：同一请求重复十次，响应逐字节相同（无时间戳、无随机）。

## 客户端模块契约 `serves: FR-2, FR-3`

新增 `src/client/deep-link.ts`（纯解析 + 注入端口；零 DOM、零 window 直接引用）：

```ts
export type DeepLinkParse =
  | { kind: 'ignored' }                        // 与本插件无关的 hash：完全不动
  | { kind: 'ok'; reqId?: string }             // 是看板深链；reqId 可选
  | { kind: 'malformed'; raw: string }         // 是看板深链，但 req 形状非法

export type DeepLinkOutcome = 'ignored' | 'opened' | 'focused' | 'malformed' | 'failed'

export interface DeepLinkPorts {
  selectPanel(id: string): void        // 官方 layout.selectPanel；面板未注册时会抛
  requestFocus(reqId: string): void    // board-focus.requestBoardFocus
  clearFocus(): void                   // board-focus.clearBoardFocus（失败兜底）
  clearHash(): void                    // 清 location.hash（消费即清）
  defer?(run: () => void): void        // 重试调度；缺省 setTimeout(run, 16)
  log?(message: string, detail?: unknown): void
}

export function parsePmboardDeepLink(hash: string): DeepLinkParse
export async function consumePmboardDeepLink(
  hash: string, ports: DeepLinkPorts, opts?: { maxAttempts?: number },
): Promise<DeepLinkOutcome>
```

**解析规则**（`parsePmboardDeepLink`，纯函数）：

| 输入 hash | 结果 |
|---|---|
| `''`、`'#'`、`'#pmboardx'`、`'#other'` | `{ kind: 'ignored' }` |
| `'#pmboard'`、`'#pmboard?'`、`'#pmboard?foo=1'` | `{ kind: 'ok' }`（无 reqId） |
| `'#pmboard?req=REQ-261004111917-f473'` | `{ kind: 'ok', reqId: 'REQ-261004111917-f473' }` |
| `'#pmboard?req=abc'`、`'#pmboard?req='`、`'#pmboard?req=Req-1'` | `{ kind: 'malformed', raw: 'abc' \| '' \| 'Req-1' }` |
| `'#pmboard?req=%20REQ-a%20'` | `{ kind: 'ok', reqId: 'REQ-a' }`（trim 后判定） |

- 前缀判据：必须**恰好**是 `#pmboard`，其后只能是串尾或 `?`（`#pmboardx` 必须 ignored）。
- req 形状：`/^REQ-/`（与 `board-entry.ts` 的 `REQ_ID_SHAPE` 同口径，不在这里发明第二套规则）。
- 多个 `req` 参数：取第一个。

**消费顺序**（`consumePmboardDeepLink`，固定时序，测试按序断言）：

1. `parse` → `ignored` 立即返回 `'ignored'`（**不碰 hash、不碰 focus、不碰面板**）。
2. 识别为深链 → 先 `ports.clearHash()`（消费即清，避免刷新重放；失败也要清，见 FR-3 降级表）。
3. `kind==='ok' && reqId` → `ports.requestFocus(reqId)`（**先登记意图再切面板**：面板挂载时会
   `takeBoardFocus()` 消费该意图，这是「面板尚未挂载」的主要路径）。
4. `ports.selectPanel('dsh-pmboard')`：抛错则按 `defer` 重试，最多 `maxAttempts`（缺省 10）次。
5. 返回：选择成功且登记了 focus → `'focused'`；选择成功未登记 → `'opened'`；
   `malformed` 且选择成功 → `'malformed'`；重试耗尽 → `clearFocus()` + log + `'failed'`。
   （`'failed'` 优先级最高：选择没成，前面的结果都不算数。）
6. 全程 `try/catch` 兜底：任何意外 → log + `clearFocus()` + `'failed'`，**绝不向 `apply()` 抛出**。

## board-focus 契约变更 `serves: FR-2`

```ts
export function subscribeBoardFocus(listener: (reqId: string) => void): () => void
```

| 情形 | 行为（新语义） |
|---|---|
| 有 ≥1 订阅者时 `requestBoardFocus(id)` | **同步**通知全部订阅者；`pending` 保持清空（不再留一次性意图） |
| 无订阅者时 `requestBoardFocus(id)` | 与现状一致：写入 `pending`，等 `takeBoardFocus()` 取走 |
| `requestBoardFocus('')` / 纯空白 | 清 `pending`，**不通知**订阅者 |
| 某订阅者抛错 | 逐个 try/catch：不影响其他订阅者，也不影响调用方 |
| `takeBoardFocus` / `peekBoardFocus` / `clearBoardFocus` | 语义不变（既有 5 条单测必须继续全绿） |

**为什么必须有订阅通道**：用户可能**正站在看板上**点这条链接。此时 `selectPanel(id)` 是空操作、
面板不重挂 → `takeBoardFocus()` 永远不会被调用 → 原一次性持有器在这条路径上是个静默黑洞。

## board-mount 订阅点契约 `serves: FR-2`

在 `createBoardAttachment` 挂载段（事件委派之后、`return` 之前）：

```ts
const unsubFocus = subscribeBoardFocus((reqId) => {
  activeStage = undefined                 // 与既有 open-req 同款：清阶段选中态
  mode = { kind: 'req', reqId }
  render()
})
```

- `dispose()` 中调用 `unsubFocus()`（与既有 `unsubEvents` / 轮询清理同一处，只撤自己那条）。
- `state` 尚未就绪（`undefined`）时 `render()` 渲染空态；首次 `fetchAll()` 完成后按 `mode` 渲染详情
  ——不需要额外分支（既有 `render()` 已按 `mode` 收窄）。
- 不改 `open-req` 分支：那条路径（用户在看板上点卡片）仍走原逻辑。

## 工具 schema 文案变更 `serves: FR-4`

| 文件 | 现状描述 | 改为 |
|---|---|---|
| `src/tools/StatusTool/StatusTool.ts:202` | 项目看板链接（可在会话中点击跳转） | 项目看板链接（点击后在应用内打开看板并定位该需求） |
| `src/tools/CaptureTool/CaptureTool.ts:80` | 同上 | 同上 |
| `src/tools/CreateTool/CreateTool.ts:71` | 同上 | 同上 |

**不变**：`board_link` 的**值**（`/dashboard#pmboard?req=<REQ>`）在 `QueryState.ts:189`、
`CreateRequirement.ts:82`、`CaptureRequirement.ts:291` 三处一字不改——改值会破坏 PM 引导段与
外部消费者的既有契约（需求边界第 2 条）。

## 错误与降级矩阵 `serves: FR-3`

| 触发条件 | 返回/行为 | 日志 | 是否清 focus |
|---|---|---|---|
| hash 无关 | `'ignored'`，零副作用 | 无 | 否（不碰） |
| `layout` 未注入 | 不调 `selectPanel` | `log('深链：layout 不可用')` | 是（`'failed'`） |
| 重试耗尽 | `'failed'` | `log('深链：面板选择失败', { attempts })` | 是 |
| `req` 形状非法 | `'malformed'`（仍开面板） | `log('深链：req 形状非法', { raw })` | 否（从未登记） |
| `clearHash` 抛错 | 吞掉，继续后续步骤 | `log('深链：清 hash 失败')` | 不影响 |
| 其他未预期异常 | `'failed'` | `log('深链：消费异常', err)` | 是 |

## 单测锚点（供 test-cases.md 引用） `serves: FR-5`

- `parsePmboardDeepLink` 六态表（上「解析规则」逐行）。
- `consumePmboardDeepLink` 时序：`clearHash` → `requestFocus` → `selectPanel`（用记录调用序列的假端口断言）。
- 重试：`selectPanel` 前 2 次抛、第 3 次成功 → `'focused'` 且 `selectPanel` 恰好被调 3 次（注入同步 `defer`）。
- 失败兜底：`selectPanel` 恒抛 → `'failed'` 且 `clearFocus` 被调 1 次、调用序列止于 `maxAttempts`。
- 路由 handler：GET → 200 + `location.replace`；POST → 405 + `allow`；两次 GET 响应逐字节相同。
