---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5]
sides: [frontend, backend]
---

# REQ-261004111917-f473 · 看板/需求详情深链 404：让 /dashboard#pmboard?req=… 重新可达

## TL;DR

- **是什么**：修好「从会话点开需求详情」这条链接——现在点 `/dashboard#pmboard?req=REQ-…` 整页 404。
- **为什么现在做**：看板早已迁为 DSH 原生面板，`/dashboard` 是旧 SPA 时代的死路径，而插件仍**三处产出**该链接（工具回执 + PM 引导段）。任何窗口、任何用户点它都必然 404。
- **得到什么**：点链接 → 落到看板并**定位到该需求**（面板内导航），不再整页 404；board_link 字段契约不变。

## 一句话目标 + 可证伪判定标准

**目标**：插件产出的需求详情深链在**当前 GUI**（桌面端 `dsh-app://app/` 与 `http://127.0.0.1:<port>` 同源转发）点得通，且落在**正确的需求详情**上；点不通时也不出现整页 404。

**判定标准（跑什么、看到什么算完成）**：

1. `curl -i http://127.0.0.1:19387/dashboard` → **不再 404**（200 中转页或 302 均可，design 定），且 hash 不被服务端吞掉。
2. 桌面端点会话/工具回执里的 `/dashboard#pmboard?req=<REQ>` → 面板切到「项目看板」且**定位到该需求详情**；再点一次同链接 → 仍能定位（不粘滞、不残留状态）。
3. 新增单测全绿：hash 解析三态（无 hash / 只有 `#pmboard` / `#pmboard?req=REQ-x`）、兼容路由响应形状、focus 与 selectPanel 各被调用一次。
4. 回归：改了客户端源码后 `pnpm build:client` 退出码 0（C-12：`[verify-client] OK`）。

## 业务流程图

```
会话/工具回执里点「看板链接」/dashboard#pmboard?req=REQ-x
        │
        ├─ 桌面端：dsh-app://app/dashboard…  ──▶ Electron 协议处理器 ──▶ 转发宿主
        └─ Web：  http://host:port/dashboard… ──▶ 宿主 webServer
                                   │
                      宿主 /dashboard 兼容入口（FR-1）
                                   │  保留 hash 落到应用根
                                   ▼
                        应用根 / 加载 ──▶ 客户端读 #pmboard?req=REQ-x（FR-2）
                                   │
                selectPanel('dsh-pmboard') + 一次性 focus(REQ-x) + 清 hash
                                   │
                          需求详情页（已定位到该需求）
```

## 产品定义

**是什么**：对**旧深链**的一次兼容修复——让 `/dashboard#pmboard?req=REQ-…` 这条在会话与工具回执里流传的链接，重新成为「一键打开该项目需求详情」的可用入口。

**核心价值**：把「从对话打开需求详情」的动线接回来。现状是点一下就整页 404，用户只能自己到侧栏找面板、再翻列表找人。

**与现状的区别**：现状宿主没有任何 `/dashboard` 路由，静态兜底对未知路径直接 404（无 SPA 兜底），插件却仍在产出这条链接；修完是「点得通且定位准确」，而不是「删掉链接让人自己找」。

## 用户与角色

| 角色 | 什么场景用 | 痛点（现状） |
|---|---|---|
| 看板使用者 / PM | 在会话或工具回执里看到「看板链接」，想直接看这条需求 | 点击 → 整页 404，动线断在第一步 |
| Agent（各窗口） | 回执里带 `board_link`，指望人能一键跳转 | 链接是死的，等于给了个坏入口 |
| 插件维护者 | 改链接语义或补路由 | `board_link` 已写在三个工具 schema 里，字段动不得 |

## 边界

- **不做**：不把看板改造成「可分享 URL 的 SPA 路由」。本次只补**兼容入口**，看板仍是 DSH 原生面板。
- **不做**：不动 `board_link` 的字段名与字符串形态（PM 引导段与三个工具 schema 依赖它）。
- **不做**：不为别的深链（如 `/session/<id>`）做同类兼容——本次只覆盖 `/dashboard#pmboard`。
- 没写进上述边界的，即本次不做。

## 功能点（需求条款）

### 功能点总览

| 编号 | 功能（一句话概述） | 优先级 |
|------|------------------|--------|
| FR-1 | 兼容入口 `/dashboard` 不再 404（保留 hash 落到应用根） | P0 |
| FR-2 | 客户端消费 `#pmboard?req=`：切面板 + 定位需求 + 清 hash | P0 |
| FR-3 | 解析容错与降级：畸形 hash / 服务缺失不报错不阻断 | P0 |
| FR-4 | `board_link` 契约不变，仅同步工具 schema 描述 | P1 |
| FR-5 | 可证伪单测：解析三态 + 路由形状 + 面板/focus 调用 | P0 |

### 详细说明

**FR-1: 兼容入口 /dashboard**
`GET /dashboard`（含任意 query，hash 不在请求里）不再 404：宿主注册 exact 路由，把请求送回应用根并保留 hash（200 极薄中转页或 302，design 定）。
判据：`curl -i .../dashboard` 非 404；浏览器实测 hash 未被吞（落到 `/#pmboard?req=REQ-x`）。

**FR-2: 客户端消费 #pmboard?req=**
客户端启动时解析 `location.hash`：命中 `#pmboard` → `selectPanel('dsh-pmboard')`；带 `req=REQ-…` → 登记一次性定位意图（复用 `board-focus`）并渲染该需求详情；消费后清 hash（不粘滞、不落存储、不入 URL 常驻）。

**FR-3: 解析容错与降级**
hash 缺失/畸形（非 `REQ-` 形状）→ 只开面板、不定向，不报错、不弹框；`layout` 服务不可用 → 打诊断日志、不阻断应用启动。

**FR-4: board_link 契约不变**
三处产出的 `board_link` 字符串保持不变（仍为 `/dashboard#pmboard?req=<REQ>`）；仅把工具 schema 描述从「可在会话中点击跳转」改为如实口径（点击后在应用内打开看板并定位）。

**FR-5: 可证伪的单测**
新增单测覆盖：hash 解析三态；兼容路由响应形状（非 404 + 保留 hash 的落点）；面板与 focus 各被调用一次、畸形输入零副作用。

## 现状证据（E）

- **E-1**：`curl -i http://127.0.0.1:19387/dashboard` → `HTTP/1.1 404 Not Found`（2026-10-04 本机实测）。
- **E-2**：静态兜底只认 `/`、`/index.html`、`/assets/*`、`/favicon.svg`、`/manifest.webmanifest`，其余路径转发宿主 → 未知路由 404（桌面端 `apps/desktop/src/main.ts` 的 `protocol.handle` 同款口径）。
- **E-3**：产出方三处 —— `src/application/query/QueryState.ts:189`、`src/application/use-cases/CreateRequirement.ts:82`、`src/application/use-cases/CaptureRequirement.ts:291`。
- **E-4**：聊天/文档里的相对链接没有外链判定（仅 `http:`/`https:` 走外部打开），点击即整页导航 → 必落到宿主 → 必 404。

## 已定决策与待裁定项

- **已定**：走「兼容入口 + 客户端 hash 消费」，不动 `board_link` 契约（见边界第 2 条）。
- **待裁定（design 阶段）**：兼容入口用 200 中转页还是 302；`dsh-app://` 下 `location.replace` 的可靠性需实测取证。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1 |
| FR-2 | ✅ 已接收 | t2、t3 |
| FR-3 | ✅ 已接收 | t2 |
| FR-4 | ✅ 已接收 | t4 |
| FR-5 | ✅ 已接收 | t1、t2、t3 |

> 无未接收条款（5 条全部有落点）。

<!-- reqboard:marks:end -->
