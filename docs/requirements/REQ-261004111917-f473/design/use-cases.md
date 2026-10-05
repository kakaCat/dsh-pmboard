---
req: REQ-261004111917-f473
doc: use-cases
serves: FR-1, FR-2, FR-3
---

# 用例设计 · 看板深链 404 兼容（REQ-261004111917-f473）

> 写给人看：每个用例回答「谁、点了什么、看到什么」。技术细节在 `interfaces.md`，此处只钉行为。

## UC-1 · 从会话点开某条需求详情（主用例）`serves: FR-1, FR-2`

**主角**：PM / 看板使用者。**入口**：会话消息或工具回执里的「看板链接」`/dashboard#pmboard?req=REQ-…`。

**前置**：GUI 已启动（桌面端 `dsh-app://app/` 或 Web 同源）；该 REQ 在台账里。

**主流程**：

1. 人点击链接 → 整页导航到 `/dashboard#pmboard?req=REQ-…`。
2. 宿主 exact 路由命中（**不再 404**），回 200 中转页。
3. 中转页执行 `location.replace('/' + location.search + location.hash)` → 应用根 `/#pmboard?req=REQ-…`。
4. 应用加载 → 插件 client `apply()` 消费深链：清 hash → 登记定位意图 → `selectPanel('dsh-pmboard')`。
5. 看板面板挂载 → 消费定位意图 → 直接渲染该需求详情页（含 DAG / 任务 / 评论）。

**人看到的**：需求详情页，标题与 REQ id 正确；地址栏/窗口不再停在 `/dashboard`。

**异常分支**：

| 分支 | 触发 | 期望 |
|---|---|---|
| 面板注册晚于消费 | `selectPanel` 首次抛错 | 按帧重试（≤10 次），最终仍打开（人察觉不到） |
| `layout` 服务缺失 | 服务未注入 | 面板不打开；打诊断日志；清定位意图；**不弹框、不白屏** |
| 重试耗尽 | 极端竞态 | 同上（`'failed'`），链接可再点一次 |
| REQ 不在台账 | 已删除/归档被清 | 面板照常打开，详情回落看板列表（既有 `render()` 行为），不报错 |

**后置**：hash 已清（刷新页面停留在看板/详情，不会重放跳转）；无持久化残留。

## UC-2 · 只打开看板（链接不带 req）`serves: FR-1, FR-2`

**入口**：`/dashboard#pmboard`（工具回执在无进行中需求时就是这条）。

**主流程**：同 UC-1 的 1–4；第 4 步不登记定位意图，只 `selectPanel`。

**人看到的**：项目看板默认视图（泳道/列表记忆照旧），不跳到任何具体需求。

**判据**：`requestFocus` 不被调用（I-3 的姊妹约束），面板打开次数恰 1。

## UC-3 · 人已经站在看板上时点链接 `serves: FR-2`

**为什么单列**：这是既有一次性持有器覆盖不到的路径——`selectPanel` 是空操作、面板不重挂，
`takeBoardFocus()` 不会被调用；没有订阅通道就是**静默无反应**。

**主流程**：

1. 应用根已是看板面板（`activePanelId === 'dsh-pmboard'`）。
2. 深链消费：清 hash → `requestFocus(reqId)` → 订阅者（已挂载的看板）**同步**收到 reqId。
3. 看板清阶段选中态、切 `mode = { kind:'req', reqId }` 并重绘。

**人看到的**：无需刷新，当场切到该需求详情。

**反面情形（必须不出现）**：既通知了订阅者、又留下 pending → 下次进看板又跳一次（双跳）。

## UC-4 · 无关或畸形 hash `serves: FR-3`

| 输入 | 期望行为 | 期望**不**发生 |
|---|---|---|
| `#`、空、`#other` | 完全不动（`ignored`） | 不清 hash；不开面板；不打接口 |
| `#pmboard?req=abc`、`#pmboard?req=` | 打开看板，**不定位**，记一条诊断日志（`malformed`） | 拿 `abc` 去查台账、弹窗报错 |
| `#pmboard?foo=1` | 打开看板，不定位（未知键忽略） | 因未知键判定为非法 |
| `#pmboard?req=REQ-…&req=REQ-…` | 打开看板并定位**第一个** | 抛错或二选一随机 |

## UC-5 · 中转页被非 GET 请求打到 `serves: FR-1`

**触发**：任何 POST/PUT/DELETE 打到 `/dashboard`（正常动线不会发生，属防御）。

**期望**：405 + `allow: GET, HEAD`，不落到看板面板、不转发业务接口。

**为什么值得单列**：命名路由先于 fallback 匹配，若 handler 不显式判方法，一个
`POST /dashboard` 会被当成「打开看板」成功返 200，把错误吞掉（响亮失败纪律）。

## 端到端验收动作（人可照做）`serves: FR-1, FR-2`

```
① 终端：curl -i http://127.0.0.1:19387/dashboard
   → 期望 200 + content-type: text/html + body 含 location.replace（不再 404）

② GUI：在任意会话里点工具回执中的 board_link（/dashboard#pmboard?req=<REQ>）
   → 期望：看板面板打开并停在**该需求**详情；窗口不停在 /dashboard

③ GUI：打开看板后（面板已在屏），再点一次同一条链接
   → 期望：当场切到该需求详情（UC-3），无「无反应」也无双跳

④ GUI：点一条只带 #pmboard 的链接 / 手工把 hash 改成 #pmboard?req=abc 后刷新
   → 期望：看板打开、不定位、不报错（UC-4）
```
