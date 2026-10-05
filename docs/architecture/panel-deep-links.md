# 深链与面板导航（L2 领域篇）

> **TL;DR**：看板从「`/dashboard` SPA 页面」迁成 DSH **原生面板**之后，旧 URL 深链
> （`/dashboard#pmboard?req=REQ-…`）不再是页面而是**死路径**——宿主没有该路由、静态兜底又没有
> SPA fallback，点一下必 404。要让旧链接活过来需要**三段配合**：宿主的 **exact 兼容入口**
> （把请求送回应用根并保留片段）→ 客户端的**片段消费**（切面板 + 登记定位）→ 看板的**定位通道**
> （未挂载走一次性持有器，已挂载走订阅）。三条硬纪律：**服务端看不到片段**、
> **发出去的 URL 就是契约**、**改 `src` ≠ 改现场**。

## 为什么需要它（根因备忘）

| 失效点 | 机理 | 症状 |
|---|---|---|
| 面板时代没有 URL | 页面改成 keyed 插槽占用者，宿主不再有 `/dashboard` 路由 | `curl -i .../dashboard` → 404 |
| 静态兜底不兜 SPA | `frontend-static` 只服务 dist 里真实存在的文件，未知路径 404 | 深链整页 404，且与「路径写错」不可区分 |
| 桌面端只放行白名单 | `dsh-app://app/` 协议处理器只自己服务 `/`、`/index.html`、`/assets/*` 等，其余**转发宿主** | 自定义协议下同样落到宿主的 404 |
| 聊天里的相对链接是整页导航 | 只有 `http:`/`https:` 走外部打开，相对链接走默认导航 | 点击即整页加载，不是「面板内切换」 |
| 片段不随请求发送 | HTTP 请求不含 `#fragment`（RFC 9110 §4.2） | 服务端**永远**看不到 `req`，定位只能由客户端完成 |

**事实来源**：2026-10-04 实测 + REQ-261004111917-f473 的 `evidence/README.md`（E-1 线级、E-3 运行态）。

## 三段链路（谁在什么时候知道什么）

```
会话/回执里的深链 /dashboard#pmboard?req=REQ-x
   │
   ├─ 桌面：dsh-app://app/dashboard… ─▶ 协议处理器 ─▶ 转发宿主
   └─ Web： http://host:port/dashboard… ─▶ 宿主 webServer
                       │
        ① exact 兼容入口（路由先于 fallback 命中）
           ↓ 200 中转页：location.replace("/" + location.search + location.hash)
        应用根 /#pmboard?req=REQ-x
                       │
        ② 客户端消费片段（插件 apply 期）
           ↓ 清 hash → 登记定位 → selectPanel('dsh-pmboard')（有界重试）
        ③ 看板定位通道
           ├─ 面板未挂载：一次性持有器，挂载时 takeBoardFocus()
           └─ 面板已在屏：订阅通道同步通知；不可见实例返回「未消费」→ 意图回落
```

## 三条硬纪律

1. **服务端看不到片段**：任何把参数放进 `#` 的深链，都必须由客户端把片段带回来——
   服务端能做的最多是「原样保留」它（中转页用 `location.hash` 转发）。
2. **发出去的 URL 就是契约**：只要还有一处产出旧链接（工具回执、PM 引导段、用户收藏），
   旧路径就必须有兼容入口；反过来，改了路由机制要回头看**谁还在发旧 URL**。
3. **改 `src` ≠ 改现场**：`package.json` 的 `main`/`exports` 指向 `dist`，
   运行中的宿主在**启动时**加载模块——重建产物不会热替换。真机验证必须「重建 + 重载插件」。

## 兼容入口的形状（为什么是 200 中转页）

| 选项 | 取舍 |
|---|---|
| **200 中转页**（选中） | 落点由自己的脚本决定，**响应形状可单测**；不依赖平台对重定向的处理 |
| 302 到 `/` | 片段继承虽由规范保证（RFC 9110 §10.2.2），但依赖「自定义协议下渲染器是否跟随重定向」这一未经取证的行为；一旦不跟随，用户看到**空白页**（比 404 更差） |
| 什么都不做 | 404 与「路径写错」不可区分 |

**其余约束**：非 GET/HEAD 一律 405 + `allow`（命名路由先于 fallback，不判方法会把 `POST /dashboard`
当成「打开看板」成功返 200，把错误吞掉）；`cache-control: no-store`（中转页被缓存住就长期失效）；
零业务数据（这条路径无鉴权，不能变成信息出口）；响应逐字节幂等。

## 定位通道的两种顺序

| 顺序 | 通道 | 关键点 |
|---|---|---|
| 看板**尚未挂载**（深链主路径：整页加载 → apply 期消费） | 一次性持有器（`board-focus`） | 登记 pending，面板挂载时 `takeBoardFocus()` 取走即清；**不落存储、不进 URL 常驻**（防粘滞） |
| 看板**已在屏** | 订阅通道（`subscribeBoardFocus`） | 面板不重挂 → 一次性持有器永远不会被取走，故必须能「同步通知」；有订阅者时**不留 pending**（防双跳） |

**两条容易漏的边界**：

- **可见性门闩**：已挂载但不可见的实例不该吃掉意图。监听者显式返回 `false` 表示「我没消费」，
  全部未消费时意图**回落为 pending**（否则「隐藏实例吃掉 → 随即被卸载」会让用户永远看不到这次定位）。
- **抛错要留痕**：订阅者抛错按「未消费」处理并打一条诊断——「点了没反应且无痕迹」是最差形态。

## 改这里要动哪些文件 + 回归怎么跑

| 位置 | 作用 |
|---|---|
| `src/http/legacy-board-route.ts` | 中转页 handler（GET/HEAD→200；其余 405）与成组注册（失败回滚） |
| `src/index.ts`（webServer 注入块） | 注册两条 exact 路由并返回组合 disposer |
| `src/client/deep-link.ts` | 片段三态解析 + 注入端口消费（清 hash → 登记 → 重试切面板） |
| `src/client/board-focus.ts` / `board-mount.ts` | 一次性持有器 + 订阅通道 + 挂载订阅/退订 |
| `src/client/index.ts` | apply 期消费一次 `location.hash`（页面注册**之后**） |

回归：`npx vitest run tests/legacy-board-route.test.ts tests/deep-link.test.ts tests/board-focus.test.ts tests/board-attach.test.ts tests/apply-wiring.test.ts`
—— 真机还要「`pnpm build` + 重载插件」后 `curl -i http://127.0.0.1:<port>/dashboard` 期望 200。

## 关联

- 线级联调证据与真机四步：`docs/requirements/REQ-261004111917-f473/evidence/README.md`
- 构建产物 ≠ 已加载模块：[插件运行前提](plugin-runtime-prerequisites.md) §二/§三
- 面板与插槽注册面：[项目说明书](../architecture/project-manual.md) 的注册面清单
