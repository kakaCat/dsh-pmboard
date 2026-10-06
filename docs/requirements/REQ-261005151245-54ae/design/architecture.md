---
serves: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 架构设计（REQ-261005151245-54ae）

> 需求源：`requirement.md`（FR-1~FR-7）。本份定「继承读什么、写在哪一层、机制落在哪一处」。
> 字段契约见 `data-model.md`，签名与错误语义见 `interfaces.md`，用例见 `use-cases.md`，验收见 `test-cases.md`。

## TL;DR `serves: FR-1, FR-2, FR-5`

一句话：**在开窗之后补三步「落定」** —— 读一次源会话画像，把标题写定、把模型写定、
把模式（Agent 预设）随建会话请求带入，然后**如实回报三项状态**。

- 读写都只经**一个**已有入口：宿主 `sessionController`（`projections` / `rename` / `selectModel` / `create`）。
- 机制只实现**一处**（`application/internal/window-inherit.ts` + 适配器三个新方法），
  三个开窗入口（`reqboard_open_window` / `reqboard_handoff` / 看板迁移开窗）都是调用方。
- 继承**绝不改变**开窗成败：三项状态进回执 `inheritance`，人读得到、agent 读得到。

## 分层与职责边界 `serves: FR-1, FR-2, FR-4`

| 层 | 放什么 | 为什么 |
|---|---|---|
| `application/internal/window-inherit.ts`（新增） | 纯函数 `increasedWindowTitle` / `presetInheritanceOf` + 编排 `readWindowProfile` / `applyWindowInheritance` | 零 IO、可单测；application 层禁 import 宿主包（层边界门禁） |
| `application/ports.ts`（加性） | `WindowSourceProfile` / `WindowModelSelection` / `WindowInheritance` / `WindowInheritanceStatus` + `WindowOpenerPort` 三个**可选**方法 | 端口在 application，实现留在 adapters；可选 = 测试替身与旧装配不被迫改 |
| `adapters/SessionWindowOpener.ts`（改） | `readProfile` / `rename` / `selectModel` 的**唯一** I/O 实现 | 与既有 `fork` / `create` / `resolveSourceProject` 同一处，服务按调用时解析的既有风格不变 |
| `application/use-cases/OpenWindow.ts` / `HandoffOwner.ts`（改） | 接线：读画像 → 建窗（create 带 preset）→ 落定 → 投递 | 用例层负责顺序与回执；三个入口共用同一编排 |
| `http/routers/settings-support.ts`（改） | 迁移开窗传显式语义标题并回传 `inheritance` | 路由没有 `exec`，与既有"直接用端口"的口径一致 |

## 现状病灶：只造会话，不写属性 `serves: FR-1, FR-3, FR-4`

```
插件开窗（今天）                          GUI 自己 fork（人点「分支」时）
  sessionController.fork({sessionId})      sessions.fork({sessionId, increaseTitle:true})
        │                                        │
        ├─ 标题：无 ← 缺口 ①                     ├─ fork 后补一次 rename（标题递增）
        ├─ 模式：宿主按源会话 observation 继承     └─ 标题「源标题 (1)」写定
        └─ 模型：宿主取**全局默认** ← 缺口 ②
  sessionController.create({workspaceId|cwd})
        ├─ 标题：无 ← 缺口 ①
        ├─ 模式：默认预设 ← 缺口 ③（请求体根本没有 agentPreset）
        └─ 模型：全局默认 ← 缺口 ②
```

三条事实（均已核实，出处见下表）：

| 事实 | 出处 |
|---|---|
| 插件只把 `sessionId` / `atSeq` 交给 `fork`，`create` 只带落点 | `src/adapters/SessionWindowOpener.ts:93-122`、`:45-51` |
| GUI 的标题递增是**客户端补的一次 rename**，不是 fork 的能力 | 宿主 `packages/api/session-controller/src/client/sessions/service.ts:451-473` |
| 宿主 fork 的模型取全局默认；fork **会**继承 preset；create 支持 `agentPreset` 入参 | 宿主 `packages/api/session-controller/src/commands.ts:105-144`、`:266-284` |

⇒ 缺的不是"新能力"，是**插件这条路没走完宿主已有的两步**（写标题、写模型）。

## 目标架构：一次冷读 + 三步落定 `serves: FR-1, FR-2, FR-3, FR-4`

```
源窗口（人已选好模式 + 模型）
   │
   ├─① 冷读画像（1 次）  opener.readProfile(source)
   │     sessionController.projections({sessionId: source})
   │       ├─ title          ← values.title
   │       ├─ agentPreset    ← values.agentPreset
   │       └─ modelSelection ← values.modelSelection.next
   │     读不到（服务未装配 / 抛错 / 会话不存在）→ { reason }，**不阻断**；
   │     三项按「读不到」记 failed（不是 skipped —— 读不到 ≠ 源没有）
   │
   ├─② 建会话（既有）
   │     fork  → 宿主已继承事件前缀 + preset；模型待补
   │     create→ 请求体 { workspaceId|cwd, agentPreset? }（preset 随请求带入）
   │
   └─③ 落定三步（各自独立、互不短路）
         rename(child, 显式标题 ?? increasedWindowTitle(源标题))     [FR-1]
         preset 三态（由①的读数推得，不再多打一次宿主）              [FR-3]
         selectModel(child, 源模型选择)                              [FR-4]
              │
              ▼
        inheritance{title,preset,model,reasons} → 回执 → （可选）投递底稿
```

**关键点**：`title` / `agentPreset` / `modelSelection` 是**同一次投影读**里的三个键，
不存在"读三次"；模式不另打一次宿主（理由见下一节），因此附加调用与需求 NFR 的 ≤3 次一致。

| 路径 | 附加宿主调用 | 明细 |
|---|---|---|
| `fork` | **3** | `projections` 1 + `rename` ≤1 + `selectModel` ≤1 |
| `create` | **3** | 同上（preset 搭在 `create` 请求里，**不额外调用**） |

## 模式继承为什么不用宿主 `agentPresets.select` `serves: FR-3`

| 方案 | 结论 | 理由 |
|---|---|---|
| `create` 请求体带 `agentPreset`（**采用**） | ✅ | 宿主 `create` 原生支持；一次调用完成；与 fork 的继承路径同构 |
| 建窗后调 `agentPresets.select(agent, preset)` | ❌ | ① 把一条继承变成**两条路径**（`create` 走 `select`、`fork` 走宿主继承）——正是本仓"两份真相必然漂移"的老毛病；② 需要额外注入 `agents` + `agentPresets` 两个服务、先 `agents.get(childId)` 拿到 Agent 对象，多一条取数路径；③ 该方法自带"会话已开轮即拒"的前置判据（`agent-preset/locked`，宿主 `packages/preset/agent-preset-registry/src/index.ts:318-326`）——`fork` 子会话带继承事件前缀，是否命中该判据取决于投影是否折算继承事件，**本设计未验证**；一个"可能抛"的写路径不该被当作唯一继承手段 |
| 建窗前用 `agentPresets.resolve(id)` 探存在性 | ❌ | 多一次调用（突破 NFR ≤3），且**探不到"坏预设"**（`resolve` 对 broken 预设不抛，真正抛错发生在 `mount` 阶段） |

**如实披露的例外**：预设不存在时，`create` 与 `fork` 都会失败 ⇒ **开窗失败**。
这不是本需求引入的行为（`mode=fork` 与 GUI fork 今天就是这样），本需求只是不再"悄悄用默认预设"。
另外，`fork` 路径的预设继承是**宿主构造事实**（`composeAgent(presetForObservation(source))`），
本设计据此把 `preset` 报为 `set`（画像里读到值即视为继承成功），**不额外读一次子会话核验**——
那会突破 NFR 的 ≤3 次调用；若将来要更强保证，可在实施后用探针加一条"子会话 preset == 源 preset"的实测。

## 接线表（改哪里 / 明确不改哪里） `serves: FR-5, FR-6`

| 模块 | 现状 | 改后 | 动调用点？ |
|---|---|---|---|
| `application/ports.ts` | `WindowOpenerPort` 三个方法 | 加 3 个可选方法 + `WindowCreateOptions.agentPreset` | 不动（加性） |
| `application/internal/window-inherit.ts` | 不存在 | **新增**四个导出（标题递增 / 读画像 / 算 preset 三态 / 落定编排） | 新文件 |
| `adapters/SessionWindowOpener.ts` | `createRequestOf` 只组装落点 | 透传 `agentPreset`；加 `readProfile` / `rename` / `selectModel` | 局部 |
| `use-cases/OpenWindow.ts` | 建窗 → 投递 | 读画像 → 建窗 → **落定** → 投递 | 局部 |
| `use-cases/HandoffOwner.ts` | `openTargetWindow` 返回窗口码 | 返回 `{ windowKey, inheritance? }` | 局部 |
| `http/routers/settings-support.ts` | `create` → 投递底稿 | `create` → **落定（显式标题）** → 投递 | 局部 |
| `tools/OpenWindowTool/*` | 无 `title` 入参 | 加 `title` + output schema 加 `inheritance` | 局部 |
| `tools/HandoffTool/*` | output schema 无 `inheritance` | 加 `inheritance` | 局部 |
| `src/index.ts` | 装配 `SessionWindowOpener(resolveService, resolveWorkspaceRegistry)` | **不改装配**（无需新服务注入） | **不动** |
| `src/client/**` | — | — | **一行不改**（`sides=[backend]`） |
| 宿主 DSH 仓库 | — | — | **一行不改** |

## 决策与取舍 `serves: FR-1, FR-5, FR-6`

| 取舍点 | 否掉的方案 | 选了 | 为什么 |
|---|---|---|---|
| 继承失败的位置 | 任一失败即整条开窗失败 | 建窗成功即成功，三项状态进回执 | 窗口本身有价值；失败多半是读数问题（需求 D-4；与既有 `delivery` 同款） |
| 三步之间 | 串成一条链，前一步失败就停 | **不短路**，三步都试 | 标题写不上不该连带模型也不继承（FR-5 验收 2） |
| 机制落点 | 三个入口各写一遍 | 编排一处 + 适配器一处 | 本仓"两份真相必然漂移"的既有教训（需求 D-5） |
| 标题口径 | 语义化命名（需求名 · 续作） | 逐字沿用 GUI 递增口径 + 显式 `title` 逃生口 | 与人在界面上点 fork 的结果一致（需求 D-3） |
| 迁移窗口标题 | 也递增源标题 | 显式语义名「台账迁移窗口」 | 迁移窗口不是续作，标题要说明它干什么（FR-6） |

## 风险与对策 `serves: FR-3, FR-5`

| 风险 | 对策 |
|---|---|
| 源画像读不到（服务未装配 / 会话不存在 / 投影抛错） | 适配器 `readProfile` **抛错**，`readWindowProfile` 收成 `reason`（**不静默返回 undefined**）；无显式标题时三项皆 `failed` + 原因；开窗照旧 |
| 「读不到」被误报成「源没有」 | 两态分开：`failed`（想做没做成）vs `skipped`（本来就没有）；文案规则单点在 `interfaces.md`，测试 T-05/T-10/T-13 各锁一条 |
| 源会话是全新空白（无标题、无模型读数） | 该两项 `skipped` + 原因；不编造标题、不回落全局默认（FR-2 边界） |
| `rename` / `selectModel` 局部失败 | 记 `failed` + 宿主错误原文；另两项照常尝试 |
| 源 `agentPreset` 已被删（自定义模式移除） | `create`/`fork` 失败 → 开窗失败，回执给宿主原文（与 GUI fork 同行为，见上节） |
| 高频开窗放大宿主调用 | 附加 ≤3 次/次开窗；串行、无轮询、无重试；探针打印耗时 |
| 工具 output schema 把新字段滤掉 | 三处 schema（两个工具 + 路由响应）同步声明 `inheritance`；回归用例断言字段真的出现在回执里 |

## 不做的架构改造 `serves: FR-5`

- **不改宿主**：不动 `session-controller` 的 `fork` 语义（"fork 用全局默认模型"是上游事实）。
- **不扩 `WindowCreateOptions` 的互斥语义**：`agentPreset` 与 `workspaceId`/`cwd` 正交，不参与"二者互斥"判定。
- **不给模式/模型加显式覆盖入参**：本期新增入参只有 `title`（需求边界「不做模型/模式的可选覆写」）。
- **不追溯既有窗口**：只影响新开窗口，不做批量修补。
- **不新增 `REQBOARD_*` 错误码**：继承只有 set / skipped / failed 三态。

## 变更记（相对需求文档的澄清） `serves: FR-3, FR-5`

- 需求文档 FR-3 的验收标准 1 写的是"`create` 收到的请求体含 `agentPreset`，且与 `workspaceId`（或 `cwd`）
  **同时**出现不互斥"——本份据此明确：互斥判定**只针对落点两字段**，`agentPreset` 不参与（见 `interfaces.md`）。
- 需求文档 NFR「附加宿主调用 ≤ 3 次」的括号枚举（`projections` 1 + `rename` ≤1 + `selectModel` ≤1）**成立**：
  预设随 `create` 请求带入、不额外调用（见「模式继承为什么不用宿主 `agentPresets.select`」）。
- 需求文档 FR-3 标题写「`fork` 路径**核验**宿主是否已继承」——本设计**不额外读一次子会话做核验**，
  口径按该条正文（"只要求回执如实标注 preset 的来源"）实现：`fork` 的预设继承是宿主**构造事实**
  （`composeAgent(presetForObservation(source))`），据此报 `set`；加一次核验读会让附加调用变 4 次、
  突破同一份 NFR。若后续要更强保证，用探针补"子会话 preset == 源 preset"的实测即可，不必动生产路径。
- 需求文档业务流程图一处写「inheritance 三项 `reported=false`」——冻结回执没有 `reported` 字段，
  三项取值一律是 `set` / `skipped` / `failed`（本份与 `data-model.md` 为准）。
- 需求文档已人确认并落章，按平台规则**不在 design 阶段重交需求文档**；上述澄清以本节留痕，
  实施与验收以本设计与 `interfaces.md` 为准。
