# 架构设计（REQ-261003215944-9e04）

> 每章标题行必须带 `serves: FR-x` 标注（缺标注 = 孤儿章节被门禁拦）。
> 图一律 ASCII 字符画，**禁用 mermaid**。
> 本文档回答：**分几层改、每层改什么、边界在哪**；接口签名见 `interfaces.md`，字段契约见 `data-model.md`。

## 目标与总体方案 `serves: FR-1, FR-2, FR-4`

**问题**：今天 pmboard 的协作模型是**独占**——一条需求绑一个窗口、一个窗口只容一条在飞需求、agent 想开新窗口没有任何机械手段。

**当前状况**（全部带 file:line）：

| 卡点 | 现状 | 位置 |
|------|------|------|
| 一窗口一条需求 | 第二条立项在**弹框之前**就被拒 | `src/application/use-cases/CaptureRequirement.ts:121-124`（`REQBOARD_WINDOW_BOUND`）、`src/application/internal/support.ts:611` |
| 一需求一个窗口 | `sourceSessionId` 单值；读取端 16 处 `bound[0]` 再折叠 | `src/shared/protocol.ts:1177`、`src/application/internal/binding-read.ts:39` |
| 没有第二条绑定入口 | 无解绑 / 换绑 / 加席位 | 全仓 grep 零命中 |
| 开窗只能靠人 | `executorHint='fresh-window'` 只是一句文案 | — |
| Dive 写入散在七处 | 同规则手抄两份（`recoverHealth` / `armExplicit`） | 见 `requirement.md` FR-9 表 |
| 文档读根不是会话工作区 | 服务端用插件宿主 cwd；客户端同源错根 | `src/http/routers/artifacts.ts:54`、`src/client/open-doc.ts:68-77` |

**设计方案（三件结构性改动 + 一件收敛）**：

1. **开窗交给 DSH 的会话 fork**（FR-1）：pmboard 不自己造会话协议，直接调 host 侧 `ctx.sessionController.fork({ sessionId, atSeq? })`
   （`packages/api/session-controller/src/commands.ts:221-304`，`@Remote('fork')` 见 `index.ts:414-416`），
   或用 `ctx.sessionController.create({ cwd, workspaceId, agentPreset })`（`types.ts:285-296`）建全新空会话。
   两条路产出的都是 `session-<uuid>`，**而 pmboard 的窗口码就是 root agent 的 id = 会话 id**
   （`src/adapters/SessionProbeAdapter.ts:79-85`），所以 fork 出来的子会话天然是一个"未绑定需求的新窗口"。
2. **绑定的承载单元从"一个窗口码"变成"席位表"**（FR-2/FR-3/FR-4）：`RequirementRecord` 新增可选 `seats: WindowSeat[]`，
   `sourceSessionId` 原样保留为 owner 锚点（**不动 52 条存量（2026-10-04 实测：15 热 + 37 归档）**）；授权判定从"窗口是否绑定"升级为"这个席位能不能做这个动作"。
3. **Dive 的写入收敛成单一入口**（FR-9/FR-10）：域层纯函数 `transitionDive` 按**事件**计算下一个 `dive` 状态与留痕，
   application 层 `applyDiveTransition` 是唯一写盘路径；推进弹框、看板「继续」、自动恢复、阶段推进、人工 clear_pause 全部改为调它。
4. **文档读根与会话同源**（FR-11）：读根不再取 `process.cwd()`，改取**发起阅读的会话工作区**；客户端与预检共用同一条判定。

**不这么做的后果**：继续在 15 个用例里散着 `bound[0]` 与 `dive.*` 赋值，每加一个入口就多一份手抄规则——
本仓已有 `stages`、`requirement_refs` 两次"声明了却没落库"的先例，规则散写必然再次漂移。

## 模块改动地图 `serves: FR-1, FR-2, FR-3, FR-4, FR-9, FR-10, FR-11`

```
                        ┌──────────────── 新增 ────────────────┐
   Agent ──▶ reqboard_open_window ──▶ OpenWindowTool ──▶ OpenWindow(use-case)
                                             │                    │
                                             │                    ├─▶ ctx.sessionController.fork/create  (DSH 现成)
                                             │                    ├─▶ [自署 kind] resolveAgent + followup/inject
                                             │                    └─▶ LedgerWriter: 登记席位
   Agent ──▶ reqboard_bind ────────▶ BindTool ──▶ BindSeat(use-case) ──▶ seats 追加/移除
                                             │
   reqboard_capture ──▶ CaptureRequirement ──┴─▶ [改] WINDOW_BOUND：拒绝 → 选择（second | handoff）
   reqboard_status  ──▶ StatusTool ─────────────▶ [改] 返回 seats[]

                        ┌──────────────── 新增（单一写入口）────────────────┐
   domain/dive/transition.ts  (纯函数 transitionDive)
              ▲    ▲     ▲      ▲       ▲        ▲         ▲
              │    │     │      │       │        │         │
   support.ts  ClearPause  rearm.recoverHealth  rearm.armExplicit  token-usage(阶段推进)
   (立项 arm)   (人 clear)                                        round-driver(准入计数)
              └── 全部改为调 application/dive/applyDiveTransition ──┘
                                    ▲
                                    └── 新增调用点：确认推进（AskConfirm/ConfirmArtifact）、看板「继续」

                        ┌──────────────── FR-11（读根同源）────────────────┐
   /state ──▶ [改] 显式给出 sessionWorkspaceRoot
   /docs/resolve + /file ──▶ [改] classify() 用会话根（保留需求级回退作第二跳）
   client open-doc.absolutizeDocPath ──▶ [改] 无需求段时用会话根
```

**改动清单**：

| 模块/文件 | 类型 | 改动内容 | 原因（serves） | 影响范围 |
|---|---|---|---|---|
| `src/tools/OpenWindowTool/` | 新增 | `reqboard_open_window` 工具定义 + 渲染 | FR-1, FR-8 | 工具注册表 `src/index.ts:590+` |
| `src/application/use-cases/OpenWindow.ts` | 新增 | fork/create + 席位登记 + 自署 kind 投递编排 | FR-1, FR-7, FR-8 | 新用例 |
| `src/adapters/SessionWindowOpener.ts` | 新增 | 只读端口 → `ctx.sessionController`（fork/create/resolveAgent） | FR-1, FR-7 | 新适配器 |
| `src/tools/BindTool/` | 新增 | `reqboard_bind` | FR-2 | 工具注册表 |
| `src/application/use-cases/BindSeat.ts` | 新增 | 席位增删 + 校验（owner 不可解绑 / 上限） | FR-2 | 新用例 |
| `src/shared/protocol.ts` | 修改 | 新增 `WindowSeat`；`RequirementRecord.seats?` | FR-2 | 台账 schema（可缺省） |
| `src/application/internal/window.ts` | 修改 | `isWindowBound`/`openRequirementsFor` → `seatsOf`/`canWrite` | FR-2, FR-3 | 15 个用例的校验点 |
| `src/application/internal/binding-read.ts` | 修改 | `boundSummariesOf` 按席位取用 | FR-3 | 16 处 `bound[0]` |
| `src/application/use-cases/CaptureRequirement.ts` | 修改 | `REQBOARD_WINDOW_BOUND` → 选择分支 | FR-4 | 立项路径 |
| `src/domain/dive/transition.ts` | 新增 | `transitionDive` + `DiveEvent` 表（零 import 外层） | FR-9 | 域层新模块（遵守 C-01） |
| `src/application/dive/applyDiveTransition.ts` | 新增 | 唯一写盘入口（幂等、永不抛、留痕） | FR-9 | 取代七处直写 |
| `src/application/internal/support.ts` | 修改 | 立项置 `arm` 改调 apply | FR-9 | 立项 |
| `src/application/use-cases/ClearPause.ts` | 修改 | 改调 `disarm-manual` | FR-9 | `reqboard_clear_pause` |
| `src/application/internal/rearm.ts` | 修改 | `recoverHealth`/`armExplicit` 合并为调 apply（两个事件） | FR-9 | 自动恢复 / 看板继续 |
| `src/application/internal/token-usage.ts` | 修改 | 阶段推进改调 `advance-stage` | FR-9 | 所有阶段推进 |
| `src/application/internal/rollback.ts` | 修改 | 回退解除自动链改调 `disarm-rollback`（**第 8 处写入点**，actor 透传） | FR-9 | 需求回退（`reqboard_move` 与看板两条路径） |
| `src/application/use-cases/AskConfirm.ts` / `ConfirmArtifact.ts` | 修改 | 落章推进后调 `confirm-advance` | FR-10 | 人工门 |
| `src/http/routers/requirements.ts` | 修改 | 看板「继续」走 `arm-explicit` 事件、resolve 读根 | FR-10, FR-11 | 看板 |
| `src/http/routers/artifacts.ts` | 修改 | `workspaceRoot()` 改会话根 + 返回 `sessionWorkspaceRoot` | FR-11 | 文档打开/预检 |
| `src/index.ts` + `src/http/routes.ts` | 修改 | 组合根注入 `sessions`，把 `sessionWorkspaceRoot` 解析器交给路由（取代 `process.cwd()`） | FR-11 | 全部 HTTP 读路径 |
| `src/client/open-doc.ts` | 修改 | `absolutizeDocPath` 无需求段回落会话根 | FR-11 | 看板与右侧栏 |
| `src/application/internal/migrate-dive-state.ts` | 不变 | **唯一豁免**：一次性迁移可继续直写 | FR-9 | 无 |

## 关键流程一：开窗 → 席位 → 新项目 `serves: FR-1, FR-2, FR-4, FR-8`

```
agent                      pmboard                                  DSH host
  │                          │                                        │
  ├─ reqboard_open_window ──▶│                                        │
  │                          ├─ fork({sessionId}) ───────────────────▶ │ 新 session-<uuid>
  │                          │◀──────────── { sessionId: child } ─────┤ (parentSession=源, 同 workspace)
  │                          ├─ 登记席位（owner=child, 可选 worker）    │
  │                          ├─ resolveAgent(child) → 自署 kind 投递 ──▶│ 子会话起回合（人不在也留着）
  │◀─ { windowKey, note:"会话已创建，请在侧栏打开" } ───────────────────┤
```

**决策点**：

| 决策 | 选项 A | 选项 B | 选了哪个 | 为什么 |
|---|---|---|---|---|
| 造窗手段 | 自建会话协议 | 复用 `sessionController.fork`/`create` | **B** | DSH 已负责 seed/workspace/侧栏登记；自建必然漂移 |
| fork 还是 create | `fork`（带上下文） | `create`（空会话） | **默认 fork，`create` 可选** | 立项需要背景；纯新工作用 create 更干净 |
| 子会话要不要等人工回合 | 立即投底稿 | 不投，只建窗 | **投底稿但自署 kind** | 人打开就有上下文；自署 kind 保证不冒充人类 |

## 关键流程二：Dive 状态转化走单一入口 `serves: FR-9, FR-10`

```
调用点                      applyDiveTransition(deps, reqId, event)
  ├─ 立项 arm                     │
  ├─ clear_pause disarm-manual    ├─ 1. 读权威记录（定点读）
  ├─ 需求回退 disarm-rollback     ├─ 2. transitionDive(prev, {event,now,actor})  ← 纯函数，算 changed/next/comment
  ├─ 驱动失败 pause-runtime       ├─ 3. changed=false → 零写入返回
  ├─ 自动恢复 recover-auto        ├─ 4. changed=true  → 写回 + 追加 comment（createdBy 由事件决定）
  ├─ 看板继续 arm-explicit        └─ 5. 永不抛（调用点在事件/请求路径上）
  ├─ 阶段推进 advance-stage
  └─ 确认推进 confirm-advance
```

**红线（写进代码注释与单测）**：只有 `arm-explicit` 事件可以令 `activation: disarmed → armed`。
`confirm-advance` 与 `recover-auto` **一律不得**改写 `activation`——推进弹框是"确认这道门的产物"，不是"我同意自动跑"。

## 关键流程三：文档读根同源 `serves: FR-11`

```
看板按钮/右侧栏
   │
   ├─ 绝对化：有需求段？ ── 是 → 需求级 workspaceRoot
   │                     └─ 否 → 会话工作区根（改前是插件宿主 cwd ✘）
   │
   ├─ 预检 POST /docs/resolve ──▶ classify(path, root=会话根)
   └─ 打开 dsh-resource://file/session/<sid>/<绝对路径> ──▶ workspaceFiles.read
                                                             └─ 服务端同一条 classify 口径
```

**诚实降级**：两个根都取不到时，**不拼绝对路径**（拼出来必然 not-found，等于伪造"文件不存在"），
按相对路径交给 DSH 并打印诊断。

**取值机制（实现级，已核对可得性）**：插件当前用 `process.cwd()`
（`src/index.ts:185` → `src/http/routes.ts:66`），改法是在组合根惰性注入
`ctx.inject(['sessions'], …)` 取 `ctx.sessions.get(sessionId)?.header.cwd`
（`SessionStore` 见 `packages/core/session/src/index.ts:925`，其 `get` 即 `resolve: sessionId => this.get(sessionId)`；
header 的 `cwd` 被强制为绝对路径，见同文件 `:117-119`），冷会话可回落到 `sessionPersistence.stat()`（照 workspace-files 的写法）。
请求侧带上会话 id（客户端已有 `resolveCurrentSessionId()`，`src/client/open-doc.ts:30-42`）。

## 跨会话通讯：能做什么、不能做什么 `serves: FR-7`

**回答"能跨会话发送消息吗"**：**能，但不是"任意两个会话都能互发"**。DSH 只有三条路，各有硬边界：

| 通道 | 能否跨会话 | 边界 | 证据 |
|---|---|---|---|
| `subagents.sendMessage` | 能，**只限直系** | 只能发给「直接子会话」或「直接父会话」；发父还需要 **subagent activation** 记录 | `packages/subagent/subagent/src/continuation.ts:194-200`、`:215-232` |
| `sessionController.prompt` | 能，任意会话 | **红线禁用**：无条件把 source 标成 `{kind:'user'}`，等于冒充人类、绕过全部人工门 | `packages/api/session-controller/src/commands.ts:331-336` |
| `resolveAgent` + `agent.followup`/`inject` | **能，任意会话，冷会话也行** | 必须**自署 `source.kind`**；`followup` 起一个回合，`inject` 静默注入（busy 也可） | `packages/schedule/schedule/src/runtime.ts:101-123`（resolveAgent → `createUserMessage({source:{kind:'schedule'}})` → `followup` → `sessions.flush`） |
| `agentTeams`（对等通讯） | 能（对等），**本机未装载** | 走它会得到 `DSH_TEAMS_UNAVAILABLE` | `src/adapters/AgentTeamsAdapter.ts:39` |

**本需求的关键事实（实施时最容易踩）**：`fork` 出来的子会话虽然 `header.parentSession` 指向源会话
（`session-controller/src/commands.ts:276`），但它**不是 subagent run**，
所以 `continuation.ts:222-227` 会**明确抛** `UNAUTHORIZED`（原文：*"is not a resident continuable child and cannot send to parent"*）。
⇒ **fork 窗口之间用不了 `sendMessage`**，窗口间通信必须走第三条路自建（这正是 FR-7 的存在理由）。

**反过来说**：`subagent` 工具派生的子 agent 与它的父窗口**可以**用 `sendMessage` 直系对话——
那是另一套谱系（run + activation），与本需求的"fork 窗口"不是一回事，设计里不许混用。

## 安全与红线 `serves: FR-5, FR-6, FR-7`

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| 用 `sessionController.prompt` 跨窗口投递 | 消息被标 `{kind:'user'}`（`commands.ts:331-336`）→ 绕过 goal 与 pmboard **全部**人工门 | 只走 `resolveAgent` + `followup`/`inject` + 自署 kind；加**静态断言**用例：`src/` 内零命中 `sessionController.prompt` |
| 借"自主立项/拆分"伸缩人工门 | G0/G3 被架空 | `requireDirectHuman`（`SessionProbeAdapter.ts:115-141`）与 `planApproved`（`Decompose.ts:96`）**一行不改**；A5/A6 两条断言反向锁死 |
| `confirm-advance` 顺手改 `activation` | 人的意图被 agent 代签 | 事件表里 `confirm-advance` 不含 `activation` 字段；A11 断言 |
| 席位无上限 | 台账膨胀、授权面扩散 | `REQBOARD_SEAT_LIMIT`（建议 8） |
| 读根放开 | 读到工作区外文件 | 沿用既有 `classify` 的 `..`/反斜杠/越界拒绝，**不新增**放行面 |

## 错误处理 `serves: FR-1, FR-2, FR-11`

| 错误码 | 触发条件 | 用户看到什么 | 如何恢复 |
|---|---|---|---|
| `REQBOARD_OPEN_WINDOW_UNAVAILABLE` | 源会话无已完成回合（`session/fork-unavailable`）或 `sessionController` 不可得 | "无法 fork（无已完成回合），可改用 mode=create" | 换 `mode:'create'` |
| `REQBOARD_INVALID_INPUT` | `role` 非法 / 解绑 owner / 跨需求绑席位 | 明确指名字段与合法值 | 改参数 |
| `REQBOARD_SEAT_LIMIT` | 席位超上限 | 当前席位表与上限 | 先解绑 |
| `REQBOARD_DOC_ROOT_UNAVAILABLE`（新，FR-11） | 会话根与需求根都取不到 | "无法解析工作区根，已按相对路径交给 DSH" | 检查会话/需求 `workspaceRoot` |
| 既有 `REQBOARD_DIRECT_HUMAN_REQUIRED` | 自主回合试图立项/拆分 | **保持原样**（这是设计） | 人来说一句话 |

## 配置项 `serves: FR-2, FR-11`

| 配置项 | 默认值 | 作用 | 改了会怎样 |
|---|---|---|---|
| `seats.max` | 8 | 单需求席位数上限 | 调大 → 授权面扩散；调小 → 大型协作被挡 |
| `openWindow.autoSeed` | `true` | 开窗后是否自动投递底稿 | 关掉 → 新窗口空白，人需自己描述背景 |
| `docs.rootSource` | `'session'` | 读根来源（`session` / `requirement` / `legacy-cwd`） | 设 `legacy-cwd` 即回滚到 FR-11 改前行为（应急开关） |

## 测试策略 `serves: FR-1, FR-9, FR-11`

| 场景 | 输入 | 预期输出 | 用例编号 |
|---|---|---|---|
| fork 开窗 | `reqboard_open_window({mode:'fork'})` | 新 `windowKey`，`parentSession`=源 | TC-1 |
| 无完成回合 | 对刚建的会话 fork | `REQBOARD_OPEN_WINDOW_UNAVAILABLE` | TC-2 |
| 席位增删 | `reqboard_bind` 加/解 worker | `seats` 变化，owner 不变 | TC-6, TC-7 |
| 越权 | worker 推阶段 | `human_gate`/越权码拒绝 | TC-8, TC-9 |
| 事件表 | 8 事件 × 关键状态 | 纯函数单测全绿；非法事件零写入 | TC-17–TC-25 |
| 推进弹框 | `round-limit` 暂停下确认 | 归零 + healthy，`activation` 不变 | TC-26 |
| 零 prompt | 静态 grep | `src/` 零命中 | TC-4 |
| 读根 | 两条 curl | `state.workspaceRoot`=会话根；非需求文档 openable | TC-30, TC-31 |

（编号以 `test-cases.md` 为准，该文档共 TC-1–TC-36；完整用例表见该文件。）

## 文档更新清单 `serves: FR-1, FR-11`

| 文档 | 更新内容 | 负责人 |
|---|---|---|
| `docs/architecture/project-manual.md` | 新增「席位模型与开窗」「Dive 状态转化单一入口」两节 | 本需求实施窗口 |
| `docs/knowledge/architecture.md` | 补「读路径根权威源 = 会话工作区」一条 | 同上 |
| `README.md` | 工具表加 `reqboard_open_window` / `reqboard_bind` | 同上 |

## 待裁定决策点（design 确认时请一并裁定） `serves: FR-9`

**问题**：需求回退（`rollback.ts:72`）会写 `activation='disarmed'`，而**回退可由 agent 经 `reqboard_move` 触发**
（`docs/architecture/requirement-rollback.md` 把"agent 明知需求描述不对也退不回去"列为已修的缺口）。
这与 `src/shared/protocol.ts:1056` 的纪律「`activation` 只有人能改写」存在张力——它是本仓既有的一条**潜在冲突**，
本需求只是把它暴露出来，**不擅自判它**。

**两个选项**：

| 选项 | 做法 | 好处 | 代价 |
|---|---|---|---|
| A（本设计默认） | 保留"回退即解除自动链"（回退不变量 ④），但把它变成显式事件 `disarm-rollback` 并**如实记录 actor** | 不破坏回退不变量；不丢 FR-5 的安全意图（没有任何"系统偷偷改意图"的隐式路径） | `activation` 仍可能被 agent 触发的路径改写，纪律文本需要补一句"回退除外" |
| B | 收紧为"只有人能触发回退"（agent 侧 `reqboard_move` 回退方向一律拒绝） | 纪律文本零例外，最干净 | 拿掉一条 agent 自纠错能力（回退文档刚补上的那条） |

**建议**：选 A，并把 `protocol.ts:1056` 的纪律文本改成"只有人（或显式回退事务）能改写，且一律留痕 actor"——
理由是回退本身要过人工门与产物撤销，不是"运行时故障"那一类偷偷改写。

## 遗留问题 `serves: FR-4, FR-11`

| 问题 | 影响 | 计划何时解决 |
|---|---|---|
| 按卡租约与孤儿跨窗口回收 | 多席位并行时同一张卡可能被两个席位领 | 另立一期（见 `docs/handoff/multi-window-collaboration-draft.md` FR-4） |
| GUI 并列窗口 | 只能建会话 + 切页，不能真的并排 | DSH 侧能力，非本需求 |
| `docs.rootSource` 应急开关长期保留 | 两个读根并存 | 观察一期后决定是否删开关 |
