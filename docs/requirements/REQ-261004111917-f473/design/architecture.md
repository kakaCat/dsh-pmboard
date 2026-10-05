---
req: REQ-261004111917-f473
doc: architecture
serves: FR-1, FR-2, FR-3
---

# 架构设计 · 看板深链 404 兼容（REQ-261004111917-f473）

> 面向：零上下文的执行者——只凭本文档 + `requirement.md` 就应能写出拆分计划。

## 现状与缺口 `serves: FR-1`

**问题**：会话/工具回执里的「看板链接」`/dashboard#pmboard?req=REQ-…` 在当前 GUI 点击即整页 404。

**当前状况（实测证据）**：

| # | 事实 | 证据 |
|---|---|---|
| E-1 | 宿主没有 `/dashboard` 路由 | `curl -i http://127.0.0.1:19387/dashboard` → `404` |
| E-2 | 静态兜底只认 `/`、`/index.html`、`/assets/*`、`/favicon.svg`、`/manifest.webmanifest` | 桌面端 `protocol.handle` 的白名单分支；Web 端 `frontend-static` 只服务 dist 真实文件 |
| E-3 | 未知路径由宿主兜底 → 404（无 SPA 兜底） | `webserver` 的 fallback 座位实现 |
| E-4 | 插件三处仍产出该链接 | `QueryState.ts:189` / `CreateRequirement.ts:82` / `CaptureRequirement.ts:291` |
| E-5 | 聊天与文档里的相对链接没有外链判定，点击即整页导航 | 只有 `http:`/`https:` 走外部打开，其余走默认导航 |

**为什么必须这么改**：链接是**插件自己产出**的，用户只是点它；要么让 URL 活过来，要么就别再发这个 URL。
本设计选前者，且**不动 `board_link` 字符串形态**（PM 引导段与三个工具 schema 依赖它）。

## 兼容入口 + 客户端消费 `serves: FR-1, FR-2`

```
会话/工具回执里点 /dashboard#pmboard?req=REQ-x
        │
        ├─ 桌面端：dsh-app://app/dashboard… ──▶ Electron protocol.handle ──▶ 不在白名单 → 转发宿主
        └─ Web：  http://host:port/dashboard… ─▶ 宿主 webServer 命名路由（先于 fallback 命中）
                                   │
                      【新增】exact 路由 /dashboard（FR-1）
                                   │  200 text/html 中转页（location.replace('/' + location.hash)）
                                   ▼
                       dsh-app://app/#pmboard?req=REQ-x  （hash 原样保留）
                                   │
                       应用根 / 加载 ──▶ 插件 client apply()
                                   │
                【新增】consumePmboardDeepLink(location.hash, ports)（FR-2）
                     ├─ 先 focus(REQ-x)：看板已挂载 → 订阅者立刻定向
                     │                    看板未挂载 → 落一次性意图，挂载时 takeBoardFocus
                     ├─ 再 selectPanel('dsh-pmboard')：失败按帧重试（注册可能晚于 apply）
                     └─ 识别即清 hash（消费即清，不粘滞）
                                   ▼
                          需求详情页（已定位到该需求）
```

**关键点：谁在什么时候知道什么**

- 服务端**看不到 hash**（浏览器不发送片段），所以「保留 req」只能由客户端完成 → 中转页把 `location.hash` 带过去。
- 面板注册是 `slots.inject` 延迟生效的，`layout.selectPanel` 在面板未注册时会**抛错**（官方 ui-layout 语义），
  故选择动作必须容忍「晚一拍」→ 有界重试。

## 模块改动地图 `serves: FR-1, FR-2, FR-4`

```
  [新] src/http/legacy-board-route.ts ──┐
                                       ├──▶ src/index.ts（webServer 注入块：再注册一条 exact 路由）
  src/http/routes.ts（不动）───────────┘         └── 返回组合 disposer（撤两条路由）
                                                  │
  [新] src/client/deep-link.ts ──────────▶ src/client/index.ts（apply 尾部消费一次）
            │  parse（纯）      │  ports（注入）
            │                   ├──▶ board-focus.requestBoardFocus（既有）
            │                   └──▶ page-runtime.getPageLayout().selectPanel（既有）
            └─ 依赖 ──▶ src/client/board-focus.ts（新增订阅通道）
                              ▲
  src/client/board-mount.ts ──┘（挂载时 subscribe，dispose 时 unsubscribe）
```

**改动清单**：

| 文件 | 动作 | 内容 | serves |
|---|---|---|---|
| `src/http/legacy-board-route.ts` | 新增 | `createLegacyBoardRouteHandler()`：GET/HEAD → 200 中转 HTML；其他方法 405 | FR-1 |
| `src/index.ts` | 改 | webServer 注入块内多注册 `/dashboard`、`/dashboard/` 两条 exact 路由；把两条路由的 disposer 一起返回 | FR-1 |
| `src/client/deep-link.ts` | 新增 | `parsePmboardDeepLink` / `consumePmboardDeepLink`（纯解析 + 注入端口） | FR-2, FR-3 |
| `src/client/board-focus.ts` | 改 | 新增 `subscribeBoardFocus`；有订阅者时 `requestBoardFocus` 直接通知而不留 pending | FR-2 |
| `src/client/board-mount.ts` | 改 | 挂载时订阅定位意图（已挂载也能切到该需求）；dispose 退订 | FR-2 |
| `src/client/index.ts` | 改 | `apply()` 尾部：注册完页面后消费一次 `location.hash` | FR-2, FR-3 |
| `src/tools/{Status,Capture,Create}Tool/*.ts` | 改 | `board_link` 描述改为「点击后在应用内打开看板并定位该需求」 | FR-4 |

**不改**：`board_link` 的产出字符串、`src/http/routes.ts`、台账数据、任何持久化格式。

## 关键结构决策 `serves: FR-1, FR-2, FR-3`

**D-1 · 兼容入口用 200 中转页，不用 302**
- 选 200 HTML 的理由：不依赖「自定义协议下 302 是否被渲染器跟随」这一未经取证的平台行为；
  中转页落点由我们自己的脚本决定，**响应形状可单测**（断言 body 含 `location.replace`）。
- 若选 302：`Location: /` 的片段继承虽由规范保证（RFC 9110 §10.2.2），但在 `dsh-app://` 下的实际跟随
  需要真机取证；一旦不跟随，用户看到的是空白页而不是看板——**失败形态更差**，故不选。
- 两种都不选 404：404 与「路径写错」不可区分，正是本需求要消灭的形态。

**D-2 · 深链消费 = 纯解析 + 注入端口**
- 解析（hash → 结构）是纯函数，端到端可单测；副作用（切面板/登记定位/清 hash）全部经端口注入。
- 为什么不在模块里直接读 `window`：本仓既有纪律（`board-entry.ts` / `board-focus.ts` 同款），
  且 DOM 依赖会把「逻辑对不对」和「环境有没有」混在一起测不出来。

**D-3 · `board-focus` 增加订阅通道（语义变化）**
- 现状：只看「面板点击时看板尚未挂载」这一条路径（一次性持有器）。
- 新增：`subscribeBoardFocus`——看板**已挂载**时（用户就在看板上）点深链也能切到目标需求。
- 语义变化（必须写进测试）：`requestBoardFocus(id)` 在**有订阅者**时通知订阅者并**不留 pending**；
  无订阅者时保持原一次性语义。这样不会出现「既通知了订阅者、又留给下次挂载再跳一次」的双跳。

**D-4 · 不新增全局量、不动 `board_link`**
- 复用既有模块级持有器与 `page-runtime` 的 layout 面；不挂新 `window.__dshPm*`。
- `board_link` 字符串一字不改（FR-4），只改工具 schema 的**描述文案**。

## 降级与失败路径 `serves: FR-3`

| 情形 | 行为 | 不许发生 |
|---|---|---|
| hash 与本插件无关（如空、`#other`） | 完全不动（返回 `ignored`），不清 hash | 误清用户 hash / 误开面板 |
| `#pmboard` 无 `req` | 只开面板，不定位 | 弹报错、写台账 |
| `req` 形状非法（非 `REQ-`） | 只开面板，记一条诊断日志（返回 `malformed`） | 拿乱码去打接口 |
| `layout` 服务未注入 | 打诊断日志后返回（返回 `failed`），清掉定位意图 | 静默当作已打开 |
| `selectPanel` 抛错（面板尚未注册） | 按帧重试（默认上限 10 次） | 无限重试、阻塞应用启动 |
| 重试耗尽 | 清定位意图 + 诊断日志（返回 `failed`） | 留一个「下次开看板突然跳走」的粘滞意图 |
| `history.replaceState` 抛错 | 回落 `location.hash = ''`（try/catch） | 因清理失败而中断后续流程 |

**共同纪律**：整条消费路径**不得抛到 `apply()` 之外**——深链是增强，坏了也不能拖垮插件加载。

## 回滚路径 `serves: FR-1`

纯新增（两条路由 + 一个客户端模块 + 一处订阅），**无数据迁移、无持久化格式变更**。
回滚 = 撤掉 `src/index.ts` 的两条注册与 `apply()` 尾部的一次消费调用 → 回到「点击 404」的旧行为；
已发出的 `board_link` 字符串不受影响（回滚后仍是死链，不会变成坏数据）。
