---
req: REQ-261004111917-f473
doc: data-model
serves: FR-2, FR-3
---

# 数据模型 · 看板深链 404 兼容（REQ-261004111917-f473）

> 本需求**不新增任何持久化数据**：改动只涉及「URL 片段 → 内存结构」的规范化与一次性意图的
> 生命周期。下面把结构与不变量定死，避免实现期各自发明判据。

## 深链标识（URL 片段）`serves: FR-2`

**语法**（客户端本地解析，服务端永远看不到片段）：

```
deep-link   = "#pmboard" [ "?" query ]
query       = *( key "=" value "&" )
key         = "req"                      ; 其余键忽略（向前兼容）
value       = REQ-id                     ; 合法形状见下
REQ-id      = "REQ-" 1*( ALPHA / DIGIT / "-" )
```

**规范化规则**：

| 步骤 | 规则 | 理由 |
|---|---|---|
| 前缀 | 必须恰好 `#pmboard`，后接串尾或 `?` | `#pmboardx` 是别人的 hash，误吃会抢别人的深链 |
| 解码 | 用 `URLSearchParams` 解码（`%20` 等） | 链接可能被聊天渲染器转义过 |
| 取值 | 取第一个 `req`，`trim()` 后判定 | 多值取首；空白不算值 |
| 形状 | `^REQ-` 前缀命中即合法，否则 `malformed` | 与 `board-entry.ts` 的 `REQ_ID_SHAPE` 同源口径 |
| 缺省 | 无 `req` / 空值 → 无定位目标（合法） | 「打开看板」本身是有效诉求（UC-2） |

**为什么不在服务端解析**：HTTP 请求不含片段（RFC 9110 §4.2），中转页只能用
`location.hash` 把它交给客户端——这是本设计把解析放在客户端**唯一**的原因，不是偏好。

## 客户端结构 `serves: FR-2, FR-3`

```ts
// 解析结果（判别联合，三态互斥）
type DeepLinkParse =
  | { kind: 'ignored' }                    // 非本插件深链
  | { kind: 'ok'; reqId?: string }         // 本插件深链；reqId 可有可无
  | { kind: 'malformed'; raw: string }     // 是本插件深链但 req 形状非法（raw 仅用于日志）

// 消费结果（给调用方与测试看的结论）
type DeepLinkOutcome = 'ignored' | 'opened' | 'focused' | 'malformed' | 'failed'
```

**状态归属**（全部在内存，无持久化）：

| 状态 | 归属 | 生命周期 | 清理时机 |
|---|---|---|---|
| 一次性定位意图 `pendingReqId` | `board-focus.ts` 模块级变量（既有） | 登记 → `takeBoardFocus()` 取走即清 | 面板挂载消费、`clearBoardFocus()`、或深链失败兜底 |
| 定位订阅者集合 | `board-focus.ts` 模块级 `Set`（新增） | 看板挂载时加入、`dispose()` 移除 | 逐个 try/catch，单个抛错不影响其他 |
| 深链解析结果 | `consumePmboardDeepLink` 局部 | 一次调用内 | 调用结束即丢 |

**为什么不落 localStorage / 不把 `req` 常驻 URL**：既有设计纪律（REQ-260928222643-4d34 FR-2）——
一次性意图「不落浏览器存储、不进 URL、不挂 window 属性」，否则会形成粘滞状态：
下次打开看板无缘无故跳到某个旧需求。本需求沿用同一条纪律。

## 不变量（可被单测直接证伪）`serves: FR-3`

| # | 不变量 | 反向行为（必须判红） |
|---|---|---|
| I-1 | `ignored` 时**零副作用**：不调 `clearHash` / `requestFocus` / `selectPanel` | 任何一次调用都算违约 |
| I-2 | 识别为深链后 `clearHash` 恰好被调 **1** 次 | 0 次 = 刷新重放；≥2 次 = 抖动 |
| I-3 | `malformed` 时不调 `requestFocus`，但仍调 `selectPanel` | 拿乱码登记定位意图 = 违约 |
| I-4 | `ok` 且带 `reqId` 时，`requestFocus` 在 `selectPanel` **之前**调用 | 顺序颠倒会让「面板未挂载」路径丢目标 |
| I-5 | 选择成功时 `selectPanel` 被调用次数 ∈ [1, maxAttempts]，且首次必调 | 0 次 = 面板没打开 |
| I-6 | `'failed'` 时 `clearFocus` 恰好 1 次，且**不残留** `pending`（`peekBoardFocus()===undefined`） | 残留 = 下次开看板莫名跳转 |
| I-7 | 有订阅者时 `requestBoardFocus(id)` **不写** `pending` | 双跳：订阅者跳一次、下次挂载再跳一次 |
| I-8 | 消费函数**不抛异常**（异常一律转成 `'failed'`） | 抛到 `apply()` 会让插件半边加载失败 |
| I-9 | 路由响应**逐字节幂等**（同请求两次响应相等） | 含时间戳/随机即违约 |
| I-10 | 路由响应不含任何 REQ 字段（不读台账） | 把无鉴权路径变成信息出口 = 违约 |

## 兼容与回滚 `serves: FR-2`

- **向前兼容**：query 里的未知键忽略（未来可能加 `stage=` 等参数）；`#pmboard` 之后无 query 仍合法。
- **向后兼容**：`board_link` 字符串不变，旧链接（甚至别人收藏的）在修复后开始能用；
  旧客户端（未重建 bundle 的页面）遇到新路由只会看到一个中转页——它自身不消费 hash 时
  停在 `/#pmboard?req=…` 的应用根，**不会 404**（比现状更好，且无数据风险）。
- **无迁移**：没有存储格式、没有台账字段、没有一次性的数据回填；`orders`/`schema` 版本不动。
- **回滚**：删两条路由注册 + 删 `apply()` 尾部一次调用 → 行为回到「点击 404」，无脏数据。

## 与既有结构的边界 `serves: FR-2`

| 既有结构 | 本需求关系 | 说明 |
|---|---|---|
| `board-focus.ts`（一次性持有器） | **扩展** | 新增订阅通道；`request` 在有订阅者时改为「通知 + 不留 pending」 |
| `page-runtime.ts`（layout 面） | **复用** | 只读 `getPageLayout()`，不新增持有器 |
| `board-entry.ts`（节点面板入口） | **不动** | 它走「校验 → 登记 → selectPanel」，本需求的消费函数不替代它 |
| `session-jump.ts` | **不动** | 会话跳转是另一条动线，边界第 3 条明确不做 |
| 台账 / RTM / 队列 | **不动** | 本需求零数据面改动 |
