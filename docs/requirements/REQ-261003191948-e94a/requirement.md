---
req_id: REQ-261003191948-e94a
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
sides: backend, frontend
---

# 迁移门拒绝启动时静默失败：界面只显示 404，没有任何迁移指引

> 面向：产品、开发、测试、用户——**写给人看**。
> **人读三件套**：TL;DR + ASCII 流程图 + 功能点总览表。
> **排版纪律**：禁超过 4 行的连续段落；并列 ≥3 项用列表/表格；图一律 ASCII 字符画，**禁 mermaid**。
>
> 类型：feature ｜ 档位：**轻档（bounded）** ｜ 立项：2026-10-03
> 工作区：`/Users/mac/Documents/ai/dsh/dsh-pmboard`

## TL;DR

一句话：**插件装配失败时，失败本身必须能被人看见——而不是让整条路由消失、界面只剩一个 404。**

现场是 2026-10-03 的真实事故：v10 迁移门发现「legacy 单册在场、数据根没迁移」，按设计抛错拒绝启动。
结果是 `/dashboard/api/reqboard/*` **一条路由都没注册**，看板页面只能显示 404，看不出任何原因。
排查全靠人工发现诊断日志停在「apply function STARTED」半句话上，再回读 `migrationGate.ts` 源码。

**本需求做一件事**：迁移门拒绝时改为进入「未就绪」态——路由在、但明确回 **503 + 原因 + 可复制的迁移命令**。
**不做一件事**：不覆盖迁移门之外的装配异常（真正的装配 bug 仍应让插件启动失败）。

## 业务流程图

```
 今天（失败 = 整条路由消失）              本需求后（失败 = 可解释的未就绪）
 ────────────────────────────             ──────────────────────────────────
  宿主启动                                  宿主启动
    │ apply()                                │ apply()
    ▼                                        ▼
  迁移门：单册在、meta.json 不在            迁移门：单册在、meta.json 不在
    │ throw REQBOARD_REQUIRES_MIGRATION       │ catch（只捕这一个 code）
    ▼                                        ▼
  fiber 失败 ⇒ 路由/工具/客户端全没          注册降级路由 ⇒ apply 正常返回
    │                                          │
    ▼                                          ▼
  看板页面显示「404」                        GET /state → 503 + 原因 + 迁移命令
    │ 用户不知道发生了什么                     │ 看板页面就地显示可复制的命令
    ▼                                          ▼
  人工翻日志 + 读源码才定位                  用户照命令跑迁移 → 重载 → 正常
```

## 产品定义

`dsh-pmboard` 是一个把「需求流水线」搬进 GUI 的 DSH 插件：宿主半提供台账与 HTTP/SSE API，客户端半渲染看板页面。

本需求修的是它的**失败面**：装配期致命错误目前是整条链路上**唯一一处静默面**——
项目自己的注释反复强调「失败要响亮、绝不静默降级」，但那一刻插件干脆不加载，连"我失败了"都传不出来。

**核心价值**：把「插件坏了」从**不可自解释**（404，得翻源码）变成**自解释**（503 + 一句人话 + 一条可复制命令）。
**与现状的区别**：现状是"要么全好、要么全无"；本需求引入第三种状态——**未就绪**：明确拒服务，但接受诊断。

## 用户与角色

| 角色 | 今天的痛 | 本需求后拿到的 |
|------|----------|----------------|
| 插件使用者 | 升级后发现看板页面 404，不知是自己没迁移还是插件坏了 | 页面直接写明「台账未迁移」+ 一条可复制命令 |
| 排查者（含 agent） | 只能靠人工翻 `state/reqboard-capture-diag.log`，日志还停在半句话上 | HTTP 503 响应体自带 `code` 与 `hint`；日志有完整一条 |
| 插件维护者 | 同类装配失败会被误判成前端路由问题，方向错了很久 | 失败形态有唯一语义（503 + 错误码），一眼归因 |

## 判定标准（可证伪）

| 断言 | 量法 | 通过条件 |
|------|------|----------|
| A1 未就绪也起得来 | 夹具：数据根只放 v9 单册（无 `meta.json`）→ 触发装配 | `apply` **不抛**；`/dashboard/api/reqboard/health` 与 `/state` 返回 **503**（不是 404） |
| A2 原因结构化 | 读上面两个 503 的响应体 | `success:false`、`code === 'REQBOARD_REQUIRES_MIGRATION'`、`error` 非空、`hint` 非空 |
| A3 命令可照抄 | 读 503 响应体的 `hint` | 含**真实** `dataRoot` 与 `ledgerFile` 路径、含 `migrate-ledger-v10.ts`；**不含** `<单册>`/`<数据根>` 占位符 |
| A4 客户端不再吞原因 | 单测：mock `fetch` 返回 503 + `{error,code,hint}` | 抛出的 `ApiError.message` 含服务端 `error` 文案，`ApiError.hint` 等于服务端 `hint`（现状只抛 `HTTP 503`） |
| A5 降级零副作用 | 同 A1 夹具；装配后看数据根与工具表 | 数据根**未新建** `requirements/`；`reqboard_*` 工具**零注册**；不返回空册 |
| A6 留痕响亮 | 同 A1 | 诊断日志出现一条含 `REQBOARD_REQUIRES_MIGRATION` 的完整记录（不再停在「apply function STARTED」）；宿主日志有 error 级一条 |
| A7 不越界覆盖 | 让装配抛一个**非迁移门**异常（如伪造 `code:'X'`） | 仍照旧抛出、插件启动失败（**不是** 503）——本需求只管迁移门 |

## 功能点

- **FR-1: 迁移门拒绝时进入未就绪态，而非整个不加载**
  `apply` 捕获 `code === 'REQBOARD_REQUIRES_MIGRATION'` 这一个错误：注册降级路由后**正常返回**（不 rethrow）。
  为什么不 rethrow：fiber 一旦失败，其 effect 会被全部 dispose，路由等于没注册——"能回答"是这一切的前提。

- **FR-2: 未就绪期间所有 reqboard 端点回 503 + 结构化原因**
  降级 handler 挂在同一个 `/dashboard/api/reqboard` 前缀上；`health`、`state`、以及其余全部子路径统一 503。
  响应体形状与既有信封一致：`{ success:false, error, code:'REQBOARD_REQUIRES_MIGRATION', hint }`。
  **绝不返回 404，也绝不返回空册**（空册＝"需求全没了"，正是迁移门要防的最坏结果）。

- **FR-3: hint 是代入真实路径的可复制命令**
  迁移门抛错时补一个 `hint` 字段：把具体的 `ledgerFile` 与 `dataRoot` 填进命令里，用户复制即跑。
  现状 message 里是 `<单册>`/`<数据根>` 占位符，用户还得自己去猜该替换成什么。
  message 文本保持不动（既有测试锁的是 `code` 与"不建目录"两条行为）。

- **FR-4: 客户端不再丢掉非 2xx 的原因**
  `src/client/api.ts` 的 `unwrap()` 现在遇到 `!res.ok` 直接丢弃响应体、只抛 `ApiError('HTTP 404')`——
  这正是用户看到"404"字样的直接来源：服务端就算说了原因也到不了界面。
  改法：非 2xx 时先尝试解析 JSON body，把 `error` / `code` / `hint` 组成人读文案；`ApiError` 增 `hint` 字段。
  看板报错区据此显示原因与命令（可复制），而不是一个状态码。

- **FR-5: 未就绪态零副作用**
  降级路径**不建** `ShardedRequirementStore`、不注册任何 `reqboard_*` 工具、不挂 systemPrompt 段与事件订阅。
  理由：半死不活的插件比干脆不加载更难排查；且必须在**任何写盘动作之前**退出，空册不会被"探路"坐实。

- **FR-6: 装配失败留痕响亮**
  命中降级时，宿主 `logger.error` 与文件化诊断通道各留一条完整记录（含错误码与 hint）。
  理由：「失败要响亮」是本仓铁律，而本次事故里诊断日志停在「apply function STARTED」半句话上，等于没留。

## 接口（对外入口）

| 入口 | 输入变化 | 输出变化 | 错误语义 |
|------|----------|----------|----------|
| `GET /dashboard/api/reqboard/health` | 无 | 未就绪时 `200 {status:'ok'}` 变为 **503** `{success:false, code, error, hint}` | 未就绪 → 503；正常 → 200 |
| `GET /dashboard/api/reqboard/state` | 无 | 同上 503（**不是** 404、**不是** 空册） | 未就绪 → 503；正常 → 200 |
| `GET /dashboard/api/reqboard/*`（其余子路径） | 无 | 同上 503 | 同上 |
| 看板 HTTP 客户端（`api.unwrap`） | 无 | 非 2xx 时解析错误体；`ApiError` 新增 `hint?: string` | 文案含服务端 `error`，`hint` 原样透传 |
| 迁移门 `assertLedgerMigrated` | 无 | 抛出的错误对象新增 `hint: string`（`code`/`dataRoot`/`ledgerFile` 不变） | 仍抛 `REQBOARD_REQUIRES_MIGRATION` |

## 数据契约

```ts
/** 未就绪响应体（FR-2 / FR-3）：与既有失败信封同形，只多一个可执行 hint。 */
interface NotReadyBody {
  success: false
  /** 人读原因（沿用迁移门 message） */
  error: string
  /** 机器可判的错误码：固定 REQBOARD_REQUIRES_MIGRATION */
  code: 'REQBOARD_REQUIRES_MIGRATION'
  /** 代入真实路径的可复制命令（FR-3） */
  hint: string
}
```

- 迁移门错误对象：`{ code, dataRoot, ledgerFile, hint }`（`hint` 为新增字段，其余字段名与语义不变）
- 客户端 `ApiError`：`{ message, code?, hint? }`（`hint` 为新增可选字段；旧调用方不受影响）
- 不新增 HTTP 路由前缀，不加新端点，不改 SSE 帧形状，不 bump `REQBOARD_SCHEMA_VERSION`

## 迁移与兼容

| 旧物 | 怎么办 | 依据 |
|------|--------|------|
| 正常（已迁移 / 全新安装）的启动路径 | 行为**逐字节不变**：走原有装配，降级分支永不进入 | FR-1 只捕一个 code |
| 既有依赖 `assertLedgerMigrated` 抛错的测试 | 仍抛同一个 `code`，`message` 文本不变；新增 `hint` 不改变断言 | `tests/reqboard/migration-gate.test.ts` |
| 既有断言 `unwrap` 抛 `HTTP 5xx` 的客户端测试 | 文案从 `HTTP 503` 变为含服务端 `error` 的人读文案——**这是本需求要的行为变更**，测试同步更新 | FR-4 / A4 |
| 回滚 | 去掉 `apply` 里的 catch 即回到"装配失败 = 插件不加载" | 无数据面变更，纯行为回滚 |

## 验收（怎么跑）

```bash
# 1 未就绪装配：夹具「有单册、无 meta.json」→ apply 不抛，health/state 均 503（A1 / A2 / A5）
npx vitest run tests/reqboard/degraded-startup.test.ts

# 2 hint 可照抄：503 响应体 hint 含真实路径与 migrate-ledger-v10.ts、不含占位符（A3）
npx vitest run tests/reqboard/degraded-startup.test.ts -t hint

# 3 迁移门既有行为不回退：仍抛同 code、仍不建目录（A5 / 兼容）
npx vitest run tests/reqboard/migration-gate.test.ts

# 4 客户端透出原因：503 + {error,code,hint} → ApiError 文案与 hint（A4）
npx vitest run tests/api-client.test.ts

# 5 不越界：非迁移门异常仍让装配失败（A7）
npx vitest run tests/reqboard/degraded-startup.test.ts -t '非迁移门'

# 6 纪律：客户端构建 + 类型检查（C-12 / C-15）
pnpm build:client && pnpm typecheck
```

**真实冒烟**（复现本次事故同形）：

1. 造夹具：数据根只放 v9 单册，`meta.json` 不存在；
2. 启动装配 → `curl -i /dashboard/api/reqboard/health` → **503** 且 body 含迁移命令（现状：404、空 body）；
3. 照 `hint` 跑一次迁移 → 重新装配 → `/state` 返回 **200** 与真实需求条数；
4. 全程不需翻日志、不需读源码。

## 边界

1. **做**：迁移门（`REQBOARD_REQUIRES_MIGRATION`）这一条路径的未就绪态——降级路由 + 503 结构化原因 + 可复制 hint + 客户端透出。
2. **不做**：**不覆盖迁移门之外的装配异常**。存储构造失败、工具注册失败等真正的装配 bug 仍照旧抛出、插件启动失败——
   统一降级会让"插件看起来已加载"，把排查方向带偏（本次已与用户逐条裁定，取保守范围）。
3. **不做**：不做独立的"未就绪全屏页"视觉设计，本次只到**文案 + 命令呈现**。
4. **不做**：不改 DSH 核心那条「装配失败 ⇒ 客户端 bundle 不参与启动图」的行为（跨仓，`dsh-client-modules` 的 `entry.fiber` 过滤）。
5. **不做**：降级态不注册任何工具、不建任何目录、不返回空册。

## 根因（定位与划界）

- **代码级根因**：`src/index.ts:153` 的 `assertLedgerMigrated` 在 `apply` **最早**处抛错，
  而此时**尚未**走到 `src/index.ts:565` 的 `webServer.register(...)`——于是路由、工具、客户端半边**一起消失**。
- **可观测性根因**：`src/client/api.ts:21` 的 `unwrap()` 在 `!res.ok` 时**丢弃响应体**，客户端结构性失去"听到失败原因"的能力。
- **本节点只定位与划界，不写修复代码**；具体改法属 design 节点。

## 批准闸门

下一步：**design** —— 用 `reqboard_ask_confirm(target=artifact, kind=requirement)` 交棒；**未获批准不得进入**。

设计阶段要交齐 feature 全套设计文档（`design/` 下）：`architecture.md`、`data-model.md`、`interfaces.md`、
`test-cases.md`、`use-cases.md`，并按 front-matter 声明的 `sides: backend, frontend` 另交 `frontend.md`、`backend.md`。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1、t4、t7 |
| FR-2 | ✅ 已接收 | t7、t2、t3 |
| FR-3 | ✅ 已接收 | t1、t7 |
| FR-4 | ✅ 已接收 | t7、t5、t6 |
| FR-5 | ✅ 已接收 | t4、t7、t3 |
| FR-6 | ✅ 已接收 | t4、t7 |

> 无未接收条款（6 条全部有落点）。

<!-- reqboard:marks:end -->
