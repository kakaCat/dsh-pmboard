---
req_id: REQ-261005151245-54ae
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7]
sides: [backend]
---

# 开窗补齐继承：新窗口写入标题并继承源窗口模式与 LLM 模型

> 面向：产品、开发、测试——**写给人看**。
> 人读三件套：TL;DR + ASCII 流程图 + 功能点总览表。
> 排版纪律：禁超过 4 行的连续段落；并列 ≥3 项用列表/表格；图一律 ASCII 字符画，**禁 mermaid**。
> 术语：「模式」= **Agent 预设**（标准 / PTC / 极简 / 创造模式，宿主字段 `agentPreset`），
> 不含计划模式（plan）与权限/沙箱模式——后两者一个随事件前缀、一个属客户端设置（见 D-2）。

## TL;DR

- **是什么**：让「开一个新窗口」开出来的窗口**像源窗口**——有可辨识的标题，并继承源窗口的 Agent 预设（模式）与所选 LLM 模型。
- **为什么现在做**：实测这条链路只造出「一个空白会话」——侧栏无标题、模式回落默认、模型回落全局默认；
  人在新窗口里第一件事就是手工把标题、模式、模型重设一遍，交接/续作场景下等于白开。
- **得到什么**：开窗后新窗口在侧栏有「源标题 (1)」这样的标题、模式芯片与模型选择器与源窗口一致；
  哪一项没继承上会**如实写在回执里**，不静默。

## 一句话目标 + 可证伪判定标准

**目标**：`reqboard_open_window` / `reqboard_handoff`（新建窗口）/ 看板迁移开窗造出的窗口，
标题、Agent 预设（模式）、LLM 模型三项与源窗口一致；任一项做不到时回执如实标注，开窗本身不失败。

**判定标准（跑什么、看到什么算完成）**：

1. `./node_modules/.bin/vitest run tests/open-window-inherit.test.ts` 全绿（新增），且覆盖：
   - fork 成功后**额外调一次** `rename`，标题按 GUI 口径递增（`X` → `X (1)`，`X (2)` → `X (3)`）；
   - 显式 `title` 入参优先，覆盖递增口径；
   - `create` 请求体带 `agentPreset`（= 源会话 `projections.values.agentPreset`）；
   - 子会话收到 `selectModel`，入参逐字等于源会话的 `modelSelection.next`（含 `reasoningEffort`）；
   - 源画像读不到 / `rename` 抛错 / `selectModel` 抛错 → `success: true` 且 `inheritance` 对应项标 `failed` + 原因。
2. `npx tsx scripts/open-window-inherit-probe.mts` 退出码 **0**（新增探针，对假宿主服务 dry-run）：
   打印 `source_title / child_title / source_preset / child_preset / source_model / child_model` 六个读数，并断言三对读数相等。
3. 回归（既有契约不破）：`./node_modules/.bin/vitest run tests/open-window-tool.test.ts tests/open-window-project-root.test.ts tests/handoff-owner.test.ts` 全绿。
4. 实机（人可复核）：在一个「创造模式 + 非默认模型」的窗口里调 `reqboard_open_window` →

   侧栏出现标题为「<源标题> (1)」的新会话 → 打开它 → 模式芯片显示创造模式、模型选择器显示同一个模型。

5. 构建与全量：`pnpm build` 退出码 0；`pnpm test` 失败数不高于基线 106（见 `docs/requirements/REQ-261001110934-3766/evidence/full-test-comparison.txt`）。

## 档位依据（重档）

- **新决策点 ≥2**：标题口径（GUI 递增 vs 语义化命名）、继承失败语义（降级回报 vs 整条失败）、机制落点（端口一处 vs 三入口各写）。
- **动对外契约**：三个入口的回执形状新增 `inheritance` 字段；`reqboard_open_window` 新增 `title` 入参；开窗端口新增读画像 / 改标题 / 设模型三项能力。
- **跨模块一致**：端口（ports）+ 适配器（adapters）+ 两个用例（OpenWindow / HandoffOwner）+ HTTP 迁移路由 + 装配（index.ts）五处须口径一致。
- **不可反向降级**：一旦发现要改「建会话≠打开窗口」的诚实降级文案或要动宿主侧行为，即升级为跨仓需求，不在本需求内消化。

## 业务流程图

```
源窗口（人已选好模式 + 模型，标题「登录重构」）
    │  调 reqboard_open_window（或 reqboard_handoff / 看板迁移开窗）
    ▼
┌─────────────────────────────────────────────────────────────┐
│ ① 冷读源会话画像（一次读三样）                                │
│    projections({sessionId}) → title / agentPreset / modelSelection.next │
└─────────────────────────────────────────────────────────────┘
    │  画像可得？──── 否 ──▶ 继续开窗，inheritance 三项 reported=false + 原因  [FR-2/FR-5]
    ▼ 是
┌─────────────────────────────────────────────────────────────┐
│ ② 建新会话                                                    │
│    fork：宿主已继承事件前缀与 preset；标题/模型仍需补          │
│    create：请求体带 workspaceId|cwd + agentPreset              │
└─────────────────────────────────────────────────────────────┘
    ▼
┌─────────────────────────────────────────────────────────────┐
│ ③ 补齐三项（各自独立，互不阻断）                              │
│    rename(child, 源标题 (1))    ← 显式 title 优先              │
│    selectModel(child, 源模型)                                 │
│    （create 的 preset 已在 ② 带入；fork 的 preset 需核验）     │
└─────────────────────────────────────────────────────────────┘
    ▼
④ 回执：window_key + inheritance{title,preset,model,reasons}  →  可选投递底稿  [FR-5/FR-6]
```

## 产品定义

**开窗继承**是开窗能力的**一致性补齐**：新窗口不再是一张白纸，而是源窗口的**可继续版本**——
谁开的窗，就用谁的模式与模型，标题也能一眼认出它是从哪个窗口分出来的。

- **核心价值**：把「开新窗口」从「开完还要手工配三样」变成「开完直接接着干」；
  在交接（handoff）与迁移场景里，这一点直接决定新窗口能不能无解释地接手。
- **与现状的区别**：现状三个入口都只保证「会话建成、落在对的项目」；
  标题靠人改、模式与模型靠人重选，且**没有任何提示说它们没继承上**。

**三要素检查清单**：

- [x] 说清楚"是什么"：开窗时补标题 + 继承 Agent 预设与 LLM 模型。
- [x] 说清楚"核心价值"：新窗口开箱即用，交接不再需要人复述配置。
- [x] 说清楚"与现状的区别"：从"造一个空白会话"到"造一个源窗口的续作版本"，且失败如实回报。

## 用户与角色

| 角色 | 什么场景用 | 痛点（现状） |
|---|---|---|
| 用户 / PM | 一条需求干不完、让 agent 开第二个窗口接着干 | 新窗口无标题、模式回落默认、模型不是刚选的那个；得手工重设 |
| 用户 / PM | 看板「存储与数据库」页发起台账迁移，等迁移窗口干活 | 迁移窗口模式/模型是默认值，长任务跑在与源窗口不同的模型上 |
| Agent（源窗口） | 水位到顶，用 `reqboard_handoff` 交出需求 | 交出去的窗口与自己的运行配置不一致，接管方按不同模式/模型干活，行为漂移 |
| Agent（新窗口） | 接管后立刻开工 | 不知道源窗口用的哪个模型与模式；只能问人或按默认硬干 |
| 开发 / 测试 | 验证「开窗」这条链路 | 只能断言"建了会话"，没有可断言的标题/模式/模型契约 |

## 功能点（需求条款）

### 功能点清单

| 编号 | 功能（一句话概述） | 优先级 |
|------|------------------|--------|
| FR-1 | 新窗口写标题：源标题按 GUI 口径递增（`X` → `X (1)`），显式 `title` 优先 | P0 |
| FR-2 | 冷读源会话画像：一次读 `title` / `agentPreset` / `modelSelection.next`，读不到即"不可得"而非报错 | P0 |
| FR-3 | 继承模式：`create` 请求体带 `agentPreset`；`fork` 路径核验宿主是否已继承 | P0 |
| FR-4 | 继承模型：对子会话调 `selectModel`，入参等于源会话的 `modelSelection.next` | P0 |
| FR-5 | 诚实降级与回执：`inheritance{title,preset,model,reasons}` 三态，任一项失败不影响开窗成功 | P0 |
| FR-6 | 三入口统一：`reqboard_open_window` / `reqboard_handoff` / 看板迁移开窗共用同一机制 | P0 |
| FR-7 | 可证伪回归：单测 + 探针 + 实机复核三件套 | P0 |

**优先级说明**：本期全部 P0——六条功能点共同构成"一致性"这一个能力，少任何一条都会退化成"部分继承"，
反而比现状更难解释（人分不清是没继承还是没实现）。

### 详细说明

**FR-1: 新窗口写标题（GUI 递增口径 + 显式覆盖）**

标题规则**逐字沿用** GUI 侧既有口径（`src/client/sessions/service.ts` 的 `increasedForkTitle`）：
匹配 `^(.*?)\((\d+)\)$` 与全角 `（\d+）`，命中则末组 +1，否则追加 ` (1)`。

- 输入：源窗口标题（冷读得到）、可选显式 `title`（工具入参）。
- 输出：子会话标题被写定；回执 `inheritance.title` ∈ `set | skipped | failed`。
- 错误语义：源无标题 → `skipped`（与 GUI 行为一致：无标题就不改名，不编造）；`rename` 抛错 → `failed` + 原因。

**验收标准**：

1. 源标题 `登录重构` → 子标题 `登录重构 (1)`；源标题 `登录重构 (2)` → 子标题 `登录重构 (3)`；全角 `登录重构（3）` → `登录重构（4）`。
2. 传 `title: "台账迁移窗口"` → 子标题恰为 `台账迁移窗口`（不递增、不加后缀）。
3. 源无标题且未传 `title` → 不调 `rename`，回执 `inheritance.title == "skipped"`。

**FR-2: 冷读源会话画像**

用**一次**宿主调用 `sessionController.projections({ sessionId })` 读全三样，不新增数据源、不 resume 源会话：

| 读数 | 出处 | 缺失时 |
|---|---|---|
| 标题 | `values.title`（string） | `title: undefined` |
| 模式 | `values.agentPreset`（string） | `preset: undefined` |
| 模型 | `values.modelSelection.next`（`{provider, model, reasoningEffort?}`） | `model: undefined` |

- 整次读失败（服务缺失 / 抛错 / 会话不存在）→ **不阻断开窗**，画像整体按 `undefined` 处理，回执三项均 `failed` 并带原因。
- 边界：`reasoningEffort` 可缺省；缺省时**不传**该字段（不填 `undefined` 占位）。

**验收标准**：

1. 假宿主服务返回三项 → 三次后续调用（`rename` / `selectModel` / `create.agentPreset`）的入参与读数逐字相等。
2. `projections` 抛错 → 开窗仍 `success: true`，`inheritance` 三项 `failed` 且 `reasons` 含原文错误消息。
3. 读数里 `title` 为空串 → 视为无标题（`skipped`），不写入空标题。

**FR-3: 继承模式（agentPreset）**

- `create` 路径：请求体新增 `agentPreset`（当前 `createRequestOf` 只组装 `workspaceId` / `cwd`）。
- `fork` 路径：宿主会按源会话 observation 继承 preset（`composeAgent(presetForObservation(source))`），
  本需求**不改宿主行为**；只要求回执如实标注 `preset` 的来源（继承成功 / 读不到 / 未继承）。
- 边界：源画像里 `agentPreset` 缺失（旧会话、未登记预设）→ `skipped`，不猜默认值。

**验收标准**：

1. `create` 收到的请求体含 `agentPreset: "<源预设 id>"`，且与 `workspaceId`（或 `cwd`）**同时**出现在同一请求里不互斥。
2. 源画像无 `agentPreset` → 请求体**不含**该键（不是含 `undefined`），回执 `inheritance.preset == "skipped"`。

**FR-4: 继承模型**

- 子会话建好后调 `sessionController.selectModel({ sessionId: child, provider, model, reasoningEffort? })`。
- 入参**逐字**取源会话 `modelSelection.next`；`next` 缺失（源从未选过模型）→ `skipped`，不猜测、不回落全局默认。
- 已知副作用（D-6）：`selectModel` 会在后台把该选择存成**全局默认模型**——与「人在新窗口选一次模型」同效，本期接受。

**验收标准**：

1. `selectModel` 收到 `{sessionId: <child>, provider, model}`，第三项 `reasoningEffort` 仅在源读数有时出现。
2. `selectModel` 抛错 → 开窗仍成功，`inheritance.model == "failed"` + 原因原文。
3. 源 `modelSelection.next == null` → 不调 `selectModel`，`inheritance.model == "skipped"`。

**FR-5: 诚实降级与回执**

回执新增字段（三个入口同形）：

| 字段 | 类型 | 语义 |
|---|---|---|
| `inheritance.title` | `'set' \| 'skipped' \| 'failed'` | 标题是否写定 |
| `inheritance.preset` | 同上 | 模式是否继承 |
| `inheritance.model` | 同上 | 模型是否继承 |
| `inheritance.reasons` | `string[]` | 每项 `skipped` / `failed` 的可读原因（`set` 不产生条目） |

纪律：

- 继承是**尽力而为**：任一项失败都**不**改变 `success`，绝不因为标题没写上就让窗口不成立。
- 但**绝不静默**：三项状态必进回执；`reasons` 只写真实原因原文，不写"应该没问题"这类推测。
- 与既有 `delivery` / `degraded_note` 措辞纪律一致：回执里**不许**出现「已打开窗口」这类断言。

**验收标准**：

1. 三项全成功 → `inheritance == {title:'set',preset:'set'(或'skipped'),model:'set',reasons:[]}`。
2. 三项全失败 → 同一响应里 `success: true`、`window_key` 非空、`inheritance.reasons.length >= 1`。
3. 回归：`open-window-tool.test.ts` 既有断言（窗口码 ≠ 源、`parent_session_id`、`degraded_note` 含「请在侧栏打开」、不含「已打开」）逐字不破。

**FR-6: 三入口统一**

同一份继承机制服务三个入口（机制落点由设计阶段定，纪律是**只有一处实现**）：

| 入口 | 源窗口 | create / fork |
|---|---|---|
| `reqboard_open_window` | 调用窗口 | 缺省 fork，可 `create` |
| `reqboard_handoff`（新建接管窗口） | 原窗口 | 缺省 create，可 `fork` |
| 看板「存储与数据库」→ 迁移开窗 | 发起页面的会话 | create |

- 三入口都不新增「必须人点一下」的步骤；继承全自动。
- 迁移开窗的标题：走显式 `title`（语义名，如「台账迁移窗口」），不递增源标题（该窗口不是续作）。

**验收标准**：

1. 三个入口各一条单测，断言同一份 `inheritance` 形状与同一套递增/覆盖规则。
2. 任一入口的源画像不可得时，三者行为一致：开窗成功 + 三项 `failed` + 原因，**不出现**两入口 `skipped`、一入口 `failed` 的分叉。

**FR-7: 可证伪回归**

- 新增 `tests/open-window-inherit.test.ts`（假宿主服务，覆盖 FR-1 ~ FR-5 全部分支）。
- 新增探针 `scripts/open-window-inherit-probe.mts`：打印六个读数并断言三对相等，退出码 0。
- 实机复核路径写进验收材料（GUI 里看标题 / 模式芯片 / 模型选择器三处）。

**验收标准**：

1. `vitest run tests/open-window-inherit.test.ts` 退出码 0。
2. `npx tsx scripts/open-window-inherit-probe.mts` 退出码 0 且输出六个读数。
3. 实机三处观察各一张截图（或文字记录路径）进 `evidence/`。

## 边界（不做什么）

- **不改 DSH 宿主**：不动 `packages/api/session-controller` 的 `fork` / `create` / `rename` / `selectModel` 实现；
  宿主 `fork` 用全局默认模型这件事是**上游事实**，本需求用自己的 `selectModel` 纠正，不去改上游语义。
- **不动客户端 UI**：不加、不改看板/会话界面上的按钮与提示；标题、模式、模型都是宿主侧会话属性，界面会自然反映。
- **不做「模型/模式的可选覆写」**：本期新增入参只有 `title` 一个；模式与模型没有显式覆盖参数
  （理由：需求是"继承"，不是"配置"；要换模型人在新窗口自己换，或在源窗口换好再开）。
- **不承诺「已经替你打开了窗口」**：DSH 无 per-session URL 与导航推送，措辞纪律照旧（沿用 `OPEN_WINDOW_DEGRADED_NOTE`）。
- **不追溯既有窗口**：本需求只影响**新开**的窗口；已存在的无标题/默认模型窗口不做批量修补。

## 讨论与裁定记录（D-x）

| 编号 | 原话来源 | 裁定 | 影响 FR | 判据 |
|---|---|---|---|---|
| D-1 | 「pm插件打开另外一个窗口的功能没有给新窗口写title还有没有继承上一个模式和选择的llm模型」 | 开窗必须给新窗口写标题，并继承源窗口的模式与 LLM 模型；这是缺陷补齐，不是新功能 | FR-1, FR-2, FR-4, FR-5 | 判定标准 1；`tests/open-window-inherit.test.ts` 覆盖标题与模型两项 |
| D-2 | 澄清答复选择「Agent 预设（标准/PTC/极简/创造模式，即 agentPreset）」 | 「模式」的准确定义 = Agent 预设（`agentPreset`）；计划模式与权限/沙箱模式**不在**本次范围 | FR-3 | 判定标准 1 第 3 条（`create` 带 `agentPreset`） |
| D-3 | 澄清答复选择「沿用 GUI fork 口径「源标题 (1)」并支持显式 title 覆盖」 | 标题按 GUI 的 `increasedForkTitle` 口径递增；工具新增可选 `title` 覆盖 | FR-1 | 判定标准 1 第 1、2 条（`X`→`X (1)`、显式覆盖） |
| D-4 | 澄清答复选择「开窗算成功，响应如实回报 title/model/preset 三态 + 原因」 | 继承失败不改变开窗结果；三项状态与原因必须进回执（与既有 `delivery` 同款诚实降级） | FR-5 | 判定标准 1 第 5 条（画像/rename/selectModel 失败分支） |
| D-5 | 澄清答复选择「三个入口都覆盖：reqboard_open_window / reqboard_handoff / 看板迁移开窗」 | 三个开窗入口共用同一继承机制，机制只实现一处 | FR-6 | 判定标准 1 第 6 条；三入口各一条单测 |
| D-6 | 澄清答复选择「Agent 预设… (Recommended)」一处未涉、由实施发现的副作用 | 接受 `selectModel` 会把子会话模型写入全局默认（与人在新窗口选一次模型同效），本期不做规避 | FR-4 | `tests/open-window-inherit.test.ts` 断言"调了 selectModel"，不额外断言全局默认未变 |

## 非功能需求

- **附加调用上限**：开窗附加宿主调用 ≤ 3 次（`projections` 1 次 + `rename` ≤1 次 + `selectModel` ≤1 次），
  且全部串行在"会话已建成"之后——**不影响**开窗成功判定。
- **时延**：继承三件套不引入轮询与重试；总附加耗时目标 P95 < 500ms（本地宿主同进程调用，测量方法：探针打印耗时）。
- **兼容**：回执字段**只增不改**；`reqboard_open_window` 新入参可选，不传时行为与改造前一致（除新增继承步骤本身）。
  旧调用方（含看板 HTTP 路由的既有消费方）忽略新字段即可。
- **可观测**：每项继承结果进回执；失败原因保留原文错误消息，便于人复核。

## 验收标准（整体）

1. 有人在 GUI 里处于「创造模式 + 非默认模型」的窗口，标题是「登录重构」。
2. 该窗口调 `reqboard_open_window`（不传 `title`）→ 回执含 `window_key` 与 `inheritance` 三项状态、`degraded_note` 照旧。
3. 侧栏出现新会话，标题为「登录重构 (1)」，归属同一个项目分组。
4. 打开新会话：模式芯片显示创造模式；模型选择器显示与源窗口相同的模型（含推理档）。
5. `reqboard_handoff`（新建窗口路径）与看板迁移开窗各跑一次：迁移窗口标题为显式语义名，模式/模型同样继承。
6. 断网/服务缺失等异常路径：回执里 `inheritance.*` 标 `failed` 并给原因，**开窗仍然可用**，不出现"静默成功"。
7. 全流程无需人手工重设标题、模式或模型。

## 关键决策与取舍

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 标题口径 | 语义化命名（「<需求名> · 续作」） | 逐字沿用 GUI 的递增口径 + 显式 `title` 逃生口 | 与人在界面上点 fork 的结果一致，同一源不会出现两种命名风格（D-3） |
| 继承失败语义 | 任一失败即整条失败（不开窗） | 诚实降级：开窗成功 + 三项状态进回执 | 窗口本身有价值；失败多半是读数问题，不该让人拿不到窗口（D-4；与既有 `delivery` 同款） |
| 机制落点 | 三个入口各写一遍继承步骤 | 收敛到开窗端口/适配器一处 | 本仓"两份真相必然漂移"的既有教训（D-5） |
| 模型继承的副作用 | 绕开 `selectModel`（避免写全局默认） | 直接调 `selectModel`，接受全局默认被更新 | 与"人在新窗口手动选一次模型"完全同效；绕开就得新增宿主能力（超范围）（D-6） |
| 模式继承范围 | 连计划模式 / 权限模式一起继承 | 只继承 `agentPreset` | 计划模式随事件前缀走、权限模式属客户端设置，混进会话字段会造出第二份真相（D-2） |

## 技术方案与亮点

- **一次冷读拿三样**：`sessionController.projections({sessionId})` 已在宿主注册 `title` / `agentPreset` / `modelSelection`
  三个投影，无需 resume 源会话、无需新增数据源——这是"不打断源窗口"的关键。
- **标题口径只有一个出处**：递增规则照抄客户端 `increasedForkTitle`（匹配与 +1 行为逐字一致）；
  集成侧以断言锁死 `X` / `X (2)` / 全角 `（3）` 三种形态，防两处口径漂移。
- **与既有诚实降级同构**：`inheritance` 字段的纪律与 `delivery` 字段完全一致（成功不掩盖失败、失败不改成败、
  原因用原文），人读回执即可知道"这个窗口像不像源窗口"。
- **机制一处、三入口受益**：端口层新增能力，`openWindow` / `HandoffOwner` / HTTP 迁移路由都只是调用方，
  不会出现"改了一处忘了另一处"（本仓 PHASE 记录里同类事故的既有教训）。

## 依赖与约束

- **依赖（已核实存在，强依赖）**：宿主 `sessionController` 的
  `projections` / `rename` / `selectModel` / `create({agentPreset})` 四项能力（`packages/api/session-controller/src/index.ts`）。
- **依赖（弱）**：源会话必须有 `title` / `agentPreset` / `modelSelection` 投影值，否则对应项按 `skipped` 处理。
- **约束**：不改宿主、不改客户端；`sides = [backend]`，本需求无 UI 改动，**不交原型**。
- **约束**：不新增数据源（沿用既有 `sessionController` 注入通道，惰性解析不变）。
- **约束**：`degraded_note` 文案与「建会话 ≠ 打开窗口」的措辞纪律不得改动。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1、t3、t4、t-2e4376、t-2789e5、t-a65a55 |
| FR-2 | ✅ 已接收 | t1、t2、t-2e4376、t-a0e60b |
| FR-3 | ✅ 已接收 | t1、t2、t-2e4376、t-a0e60b |
| FR-4 | ✅ 已接收 | t1、t2、t-2e4376、t-a0e60b |
| FR-5 | ✅ 已接收 | t1、t3、t4、t6、t-2e4376、t-2789e5、t-a65a55、t-7fea40 |
| FR-6 | ✅ 已接收 | t3、t4、t6、t-2789e5、t-a65a55、t-7fea40 |
| FR-7 | ✅ 已接收 | t6、t5、t-6e1a6c、t-7fea40 |

> 无未接收条款（7 条全部有落点）。

<!-- reqboard:marks:end -->
