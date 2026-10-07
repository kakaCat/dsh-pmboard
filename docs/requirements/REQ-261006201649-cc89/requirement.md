---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7]
sides: [frontend, backend]
---

# 需求说明（REQ-261006201649-cc89 原型门与实现对照判据加固）

> 本文档面向：产品、开发、测试、用户——**写给人看，不是写给代码看**。
> 来源：用户反馈「页面实现与原型不一致」+ 另一窗口只读审计（委派底稿）。
> **本需求自己的原型必须先过它要立的那道门**（见 §界面与原型）——否则本需求就是它要禁的那件事。

## TL;DR <!-- serves: FR-1 -->

- **这是什么**：给三道原型门补上「原型**是不是空骨架**」与「实现**像不像原型**」两问。
  现在这两问**都没人问**——门只查存在 / 版本 / 锚点，所以一份从没改过的模板骨架
  也能拿全绿，然后前端照着自己的理解实现，人验收时才发现「跟原型不是一回事」。
- **为什么现在做**：这不是理论风险，是**已发生**的事故（且用户已亲口反馈）。全仓实测：
  15 条需求有原型目录，其中 **9 条的权威原型是 94.7%–97.2% 与模板逐字相似的空骨架**；
  这些骨架**当前 100% 通过锚点门**（本文档 §现状有反向演练实测记录）。
- **做完得到什么**：① 空骨架占权威位 → `prototype_placeholder` 当场拒；
  ② 只要有权威原型，验收单**必须**有「与原型对照」项，且对照记录要带实测值 + 截图 + 截图 sha256；
  ③ 对齐判据从「某条需求专属的靶子」升级为**新需求能直接套用的可参数化判据**。

## 业务流程图 <!-- serves: FR-1 -->

```
需求阶段：agent 落原型（骨架 → 填内容）
   |
   +-- reqboard_submit(kind=prototype) 登记
   |        |
   |        +-- 存在门  prototype_missing ......... 有没有交
   |        +-- 版本门  prototype_version_conflict . 权威是不是恰好一条
   |        +-- 锚点门  prototype_anchor_missing ... 锚点/几何量块在不在
   |        +-- 【新】非骨架判据 prototype_placeholder ... 内容是填过的，不是模板
   |
   +-- brainstorming → design → decomposing
            |
            +-- UI 卡必须写 prototypeRefs: prototypes/x.html#FR-N
            +-- 落库后前端卡实施
                     |
                     +-- 【新】对照项硬判据：只要有权威原型，验收单必有 prototype-compare 项
                              |
                              +-- 【新】每条几何量读数 = 实测值 + 截图路径 + 截图 sha256
                                       |
                                       +-- 对齐判据跑起来（可参数化，新需求直接套）
```

## 产品定义 <!-- serves: FR-1 -->

原型的**唯一用途**是「实现长什么样」的机器可核验载体。它必须能回答两个问题：
**（一）这份原型是设计结论，还是模板占位？** **（二）实现与它一致吗？**

现状（实测，见 §现状）是对两问都不作答：

- 问（一）无人问——三道门都不读原型**正文内容**，于是 9 条需求的权威原型是骨架，
  占位符「（功能点名）」「（界面草图区：布局结构 / 关键控件 / 占位图）」原样留着，
  门禁照样全绿，`brainstorming → design` 照样放行；
- 问（二）**被设计成可选**——对照项由「有没有产出可对照的东西」条件化组装，
  没登记原型就没有对照项，于是「没交原型」与「交了原型但不对照」在验收单上长得一样。

本需求的判定标准只有一条：**一道门绿了，必须能说明它真的量过什么东西。**
量不到的，宁可红并说清怎么补，也不能静默绿——这是本仓「失败要响亮」纪律在原型面的落点。

### 为什么「空骨架全绿」是**设计缺陷**而不是**agent 偷懒**

`docs/architecture/prototype-gate-and-decision-log.md:30` 早就记下过这个形态的警告：

> **门自己绿了**：产物自动发现（「落进需求目录即产物」）会把落盘骨架补登为 `kind=prototype`。
> 存在门若只按 `kind` 过滤，则**只落骨架、人一个字没填也会全绿**。

当时的补救是「只认显式登记」（`autoDiscovered !== true`）——那修的是**登记口径**，
不是**内容口径**。骨架只要被显式登记一次（而 `prototype-skeleton.ts` 本来就为它准备好了
落盘路径与 INDEX 骨架），这道门就仍然是绿的。**本需求补的正是被漏掉的那一问。**

同一句话在本需求里还有第二层含义：`prototype-skeleton-template.ts` 里的示例区块用的是
**通用的 `id="FR-1"`**，而 INDEX 骨架给「服务条款」列填的也正是 **`FR-1`**——
于是任何「只声明了 FR-1」的需求，都能靠**模板自带的那个示例区块**通过锚点门。
**模板自己给自己发合格证**，这就是「只落骨架也全绿」的完整机制。

## 用户与角色 <!-- serves: FR-1 -->

| 角色 | 关心什么 | 本需求给他的东西 |
|---|---|---|
| 提需求的人 | 「我要的界面，最后做出来是不是那个样子」 | 空骨架不能再冒充设计；对照项必须出示截图与读数 |
| 实现的前端 agent | 「照什么实现才算对」 | 权威原型是**填过的**，且判据可参数化直接跑 |
| 验收的人 | 「我凭哪条证据判过」 | 对照记录带实测值 + 截图 + sha256，不再是一句「一致」 |
| 维护门禁的人 | 「别到处各判一套」 | 判据单点：只有 `prototype-gates.ts` 与一个纯函数 oracle |

## 功能点（需求条款） <!-- serves: FR-1 -->

### FR-1 空骨架/占位原型不得占权威位（`prototype_placeholder`）

**现状**：锚点门只读 `id="FR-N"` 与 `proto-geometry` 块，**不读内容是否被填过**。
一份与 `templates/brainstorming/prototype.html` 只差标题/req_id/日期的骨架，
在 INDEX 里标成 `authoritative` 之后，门禁**全绿**。

**要做的**：新增「非骨架」判据，命中即拒，错误码 `prototype_placeholder`。判据**两条独立命中**：

1. **占位标记命中**（任一条即命中）：正文含 `（功能点名）`、`（界面草图区`、`（分支：若…则…）`
   这类骨架原文占位符；
2. **相似度命中**：与 `templates/brainstorming/prototype.html` 的相似度 **> 90%** 即命中。

相似度口径**不发明新算法**：对「去占位符（`{{TITLE}}`/`{{REQ_ID}}`/`{{DATE}}` 归一）后的正文」
取**行集合重合率**（与模板逐行相同的行数 ÷ 本文总行数）。本仓实测样本给出的分布是
**双峰、无中间带**（见 §现状 的三档读数），> 90% 这条线落在峰谷里，不靠调参。

**边界（判据不许越界）**：

- **只判「权威那一份」**（INDEX「状态」列唯一 `authoritative` 行）；`superseded` 旧稿是历史证据，**不判**；
- **只判「像不像骨架」，不判「写得好不好」**——原型内容质量属人的评审，机器不评分；
- **不用实现反推原型**（project-manual:1247 机制备忘）：判据量的是「实现 == 设计契约」，
  **禁止**从 `src/client` 反推出一份原型来「补齐」。

### FR-2 存在门与锚点门认这份判据（拒绝不漏、放行不冤）

**现状**：`checkPrototypeAnchorsGate` 在权威原型文件存在时直接进正文解析，
骨架与真稿走同一条路；`checkPrototypeVersionGate` 也不认「骨架」这个状态。

**要做的**：

1. 权威原型命中 FR-1 判据 → **锚点门报 `prototype_placeholder`**（而不是 `prototype_anchor_missing`）：
   **禁止两种坏共用一个码**，否则人从码上看不出「是没填」还是「没写锚点」；
2. 早退纪律不变（同一处坏只报一次）：INDEX 缺失 / 缺列 / authoritative ≠ 1 条时，
   本判据返回 `undefined`，把那处坏留给版本门；
3. 「非前端需求也落 `detail.html` 骨架」这条路径**收敛**：骨架落盘只走
   `requiredStageArtifactKinds('brainstorming', category, sides)` 一处判据（既有单点，不新增第二套
   「什么算 UI 需求」）；判据读不到时**不落**（`not-ui`），不再按类型兜底硬塞一份前端骨架。

### FR-3 对照项由「可选」改「硬判据」

**现状**：验收单的 `prototype-compare` 项按**产出条件化**组装
（`SubmitVerification.ts::compareInputsOf`：有已登记 `.html` 原型才组装该项）。
于是「压根没交原型」与「交了但没人对照」在验收单上**长得一样**——都只是少一项。
实测：15 条有原型目录的需求里，**有对照项的 4 条**。

**要做的**：

1. **只要有权威原型（`prototypes/INDEX.md` 恰一条 `authoritative`），验收单必须生成
   `prototype-compare` 项**——不再以「有没有登记产物」为条件；
2. 缺项时提交验收材料被拒，错误码沿用既有 `verification_prototype_compare_missing`
   （**不新造码**：同一件事不能有两个码）；
3. 豁免语义**一字不动**：`prototype_exempt` 理由非空且 requirement 产物已落章 → 仍按豁免说明行处理、
   **不阻塞**（`docs/architecture/prototype-gate-and-decision-log.md` §4 的口径）；
4. 存量不追溯：`createdAt < prototypeRulesSince`（缺省 `2026-10-06`）的需求一律不判，
   与既有三门口径**同一个常量源**。

### FR-4 对照记录绑机器读数（实测值 + 截图路径 + 截图 sha256）

**现状**：`prototypeMeta.geometry` 的观测量只有
`name / value / unit / at{width,state} / source`——**读数无法复核**：
截的是哪一屏、什么时候截的、是不是这次交付的那张图，全凭提交者自述。
验收单的 `needsHuman` 项也**不校验是否有事实文本**（`humanReason` 填「视觉不一致」也算填了）。

**要做的**：

1. 每条几何量观测量**新增两个加性可选键**：`shot`（截图路径，工作区相对）与
   `shotSha256`（该文件内容的 sha256，64 位小写十六进制）；
2. **判定口径**：`shot` 与 `shotSha256` 都缺 → 视为「未采集」，**放行但记 `unverified`**；
   **给了任一项就两项都要对**——路径必须真实存在、sha256 必须等于文件实测摘要；
   对不上 → `prototype_geometry_unverified` 拒；
3. `needsHuman` 项：`humanReason` 必须是**事实性文本**（含可核对锚点：路径 / 截图名 / 命令 /
   界面位置之一），纯态度词（「不好看」「不一致」这类）→ 拒并点名该项；
4. **零迁移**：新键加性可选，旧分片缺键 = 未采集，**不补齐、不改写、无迁移脚本**
   （与 §9「兼容与迁移口径」同源）。

### FR-5 对齐判据可参数化，新需求直接套用

**现状**：`tests/prototype-parity.test.ts` 是为 **REQ-261004103330-005f 一张需求**手写的靶子
（文件头自述：「四张前端卡的测试只断言了文案与行为，没有一条断言视觉结构——于是每张卡都绿，
界面却不是原型那个样子」）。新需求**无法复用**它，只能再手写一份，或者干脆不写。

**要做的**：

1. 抽出**通用判据**：给定「权威原型 HTML + 实现渲染入口」，逐条断言
   **① class 契约**（原型里的 `dsh-pm-*` 类在实现里必须命中）、
   **② `data-*` 契约**（原型声明的属性名与取值的实现一致）、
   **③ DOM 顺序**（原型声明的关键节点相对顺序）；
2. **可参数化**：三组契约由**被检需求自己的配置**给出（哪个渲染函数、哪个容器、断哪些契约），
   通用判据读配置执行；每条断言失败时必须点名**原型路径 + 锚点 + 期望/实际**；
3. 既有那份需求专属文件**不删**：改写为「该需求配置 + 通用判据」的调用方，
   断言强度只增不减（原来断的每一条都得还在）。

### FR-6 根因与判据单点（可追溯）

**现状**：这道判据的知识散在 4 处（门、骨架落盘、验收组装、测试），没有一处能回答
「原型面一共量了哪几问」。

**要做的**：新增判据落在**既有单点**上，不新开第二套真相：

| 面 | 单点 | 本需求的改动 |
|---|---|---|
| 三门 | `src/application/internal/prototype-gates.ts` | 加「非骨架」判据（纯函数 oracle + 门组装） |
| 骨架落盘 | `src/application/internal/prototype-skeleton.ts` | 收敛非前端落骨架路径（判不了不落） |
| 判据数据 | `src/application/internal/prototype-skeleton-template.ts` | 骨架正文仍是唯一数据源，oracle 与它同源比对 |
| 验收组装 | `src/application/use-cases/SubmitVerification.ts` | 对照项条件化 → 硬判据 |
| 错误信封 | `src/http/envelope.ts` + `src/client/toolviews/shared.ts` | 两个新码登记（HTTP 400 + 中文类别名） |

**错误码登记**（新码必须三处齐：判据、HTTP 状态、人读文案）：

| 新码 | HTTP | 中文类别名 |
|---|---|---|
| `prototype_placeholder` | 400 | 原型仍是空骨架 |
| `prototype_geometry_unverified` | 400 | 几何量读数无法复核 |

### FR-7 反向演练与既有测试零回归

**要做的**：本条是**验收方式本身**，不由人眼判：

1. **反向演练（必红）**：把一份**骨架原型**放回 `authoritative` 位置 → 门必须报
   `prototype_placeholder` 并点名该路径；**还原真稿 → 放行**（正反两向都要跑，只跑一向等于没跑）；
2. **反向演练（对照项）**：临时删掉对照项的生成分支 → 必须有测试**变红**
   （改不红 = 这条判据没有在量任何东西）；
3. `npx vitest run tests/prototype-*.test.ts tests/plan-prototype-anchor-gate.test.ts` 全绿；
4. 存量需求（`createdAt` 早于原型规则生效日）**不追溯**：门与验收单对它们的行为与改动前逐字一致。

## 目标结构 <!-- serves: FR-1 -->

改完之后，原型面**只有一套判据、一处数据源**：

| 层 | 目标形态 |
|---|---|
| 判据数据 | `prototype-skeleton-template.ts` 的骨架正文是**唯一**比对基线；模板改一个字，判据自动同源 |
| 纯函数 | `prototypePlaceholderOf(html, template)` 零 IO、零依赖，返回命中与否 + 命中了哪条（占位符 / 相似度 + 读数） |
| 存在门 | 是否**显式登记**原型（既有口径不变），外加「判不了不落骨架」 |
| 版本门 | 权威是否恰好一条（不变）；骨架判定不作为它的职责 |
| 锚点门 | 权威那**一份**：先判非骨架（新），再判锚点与几何量块（既有） |
| 验收组装 | 只要有权威原型 → `prototype-compare` 项**必出**；豁免口径一字不动 |
| 读数 | 几何量每条 = 实测值 + `shot` + `shotSha256`（加性键；缺两键记 `unverified`） |
| 对齐判据 | 一份配置（渲染入口 + 容器 + 三组契约）+ 一套通用断言，新需求直接套 |
| 错误信封 | 两个新码：`prototype_placeholder` / `prototype_geometry_unverified`（HTTP 400 + 中文类别名三处齐） |

## 行为不变式 <!-- serves: FR-2 -->

交付后以下必须逐条成立（验收逐条对照；任一条不成立即返工）：

1. **三道门的既有语义不变**：`prototype_missing`（有没有交）、
   `prototype_version_conflict`（权威是不是恰好一条）、`prototype_anchor_missing`
   （锚点/几何量块在不在）各自管什么，一字不改；新问题只给新码。
2. **早退纪律不变**：同一处坏只报一次——INDEX 缺失 / 缺列 / authoritative ≠ 1 条时，
   非骨架判据返回 `undefined`，留给版本门。
3. **豁免语义不变**：`prototype_exempt` 理由非空 **且** requirement 产物已落章 = 生效；
   生效后不阻塞，agent 不能自豁免自己。
4. **登记口径不变**：只认显式登记（`autoDiscovered !== true`）；自动发现 ≠ 已交。
5. **存量零回归**：`createdAt < prototypeRulesSince` 的需求，门读数、验收单、状态行为
   与改动前**逐字一致**。
6. **台账零迁移**：`shot` / `shotSha256` 是加性可选键；旧分片缺键读作「未采集」，
   不补齐、不改写、无迁移脚本。
7. **D-x 门不变**：裁定落账的节名、五列、编号链判据不动（本需求只登记判据，不改它）。
8. **前端渲染不变**：本次 client 改动只**新增两行**错误码中文名映射，不改既有映射、不改渲染结构。

## 失败与并发路径 <!-- serves: FR-4 -->

| 情形 | 期望行为 | 判据 |
|---|---|---|
| 权威原型读不出（文件在、读失败） | 报既有 `prototype_anchor_missing` 并点名路径，**不静默放行** | 用例：读抛错 → 门有码 |
| 模板基线读不出（比对无基准） | **判不了不判**：非骨架判据返回 `undefined` 放行（不发明结论、不假红） | 用例：模板缺失 → 门不报 `prototype_placeholder` |
| 骨架正文为空文件 | 相似度判据的分母保护：空文件 → 行重合率按 0 处理，命中靠**占位标记**兜底 | 用例：空 HTML → 不因除零抛错 |
| 几何量给了 `shot` 但文件不存在 | `prototype_geometry_unverified` 拒，点名该观测量名与路径 | 用例：坏路径 → 拒 |
| 几何量 sha256 与实际不符 | 同上拒（**读的是文件实测摘要**，不信任自述） | 用例：改一个字节 → 拒 |
| 两键都缺 | 放行，读数记 `unverified`（存量口径） | 用例：旧原型 → 门放行且读数标 unverified |
| 同一需求多份权威原型 | 版本门先拒（authoritative ≠ 1）；非骨架判据**不抢答** | 用例：两份 authoritative → 码是 `prototype_version_conflict` |
| 并发：两个窗口同时改同一需求的原型 | 判据是**读时判定**、无写副作用，天然无锁竞争；台账写入仍走既有单点 | 设计口径，无新增并发面 |

## 兼容性判断（refactor 必填） <!-- serves: FR-4 -->

- FR-1 / FR-2（非骨架判据）**：纯**新增**判据。存量需求由
  `createdAt < prototypeRulesSince`（`2026-10-06`）整段豁免——**已归档的 9 条骨架需求
  不会被追溯拒绝、不回填、不重开**。新需求才受约束。**这是本次最大的兼容承诺。**
- FR-3（对照项硬判据）**：只影响**新增/在跑**需求的验收材料提交；已归档需求的
  验收单是历史快照，**不重算**。`prototype_exempt` 生效者行为完全不变。
- FR-4（`shot` / `shotSha256`）**：**加性可选键**，旧分片缺键 = 未采集 → 不判不健康。
  `prototypeMeta` 的既有键（anchors / geometry 六字段）一个不动，旧读法继续能读。
- FR-5（参数化对齐判据）**：既有 `tests/prototype-parity.test.ts` 的断言**只增不减**；
  它是测试文件，不进产物、不影响运行期。
- FR-6（两个新码）**：错误码是**新增枚举值**。旧客户端不认新码时的降级：面板显示码原文
  （既有 fallback 行为），不崩、不静默。HTTP 状态与既有原型门同档（400）。
- **协议面**：`VerificationItemSource` 的 `prototype-compare` 形状不变，
  不新增 source kind；`StageArtifact.prototypeMeta` 只加两个可选键。**无破坏性变更。**

## 回归面（refactor 必填） <!-- serves: FR-7 -->

| 面 | 风险 | 对冲 |
|---|---|---|
| 三道原型门 | 新增判据挤在锚点门里，可能改变既有码 | `tests/prototype-gates.test.ts` + `plan-prototype-anchor-gate.test.ts` 既有用例**一字不改**必须仍绿 |
| 骨架落盘 | 收敛「判不了不落」可能连该落的也不落 | `tests/prototype-skeleton.test.ts` + 新增「非 UI 不落 / 判不了不落 / 已存在不覆盖」三例 |
| 验收组装 | 对照项转硬判据可能追溯存量 | `tests/submit-prototype*.test.ts` + 新增「存量需求验收单与改动前逐字一致」用例 |
| 几何量解析 | 加键可能弄坏既有六字段解析 | 既有 `prototype-metadata-parse.test.ts` 全绿 + 新增 shot/sha 三例 |
| 前端渲染 | 新增错误码映射 | `pnpm build:client` 必须打印 `[verify-client] OK`；既有映射断言不动 |
| 台账读写 | 加键可能触发格式门 | 加性可选键；`pnpm build` + 台账既不迁移也不重写 |

## 界面与原型（sides 含 frontend） <!-- serves: FR-2 -->

> **本需求自己的原型必须先过它要立的那道门。** 这是本需求的自洽性要求：
> 一个靠空骨架就能全绿的需求，没有资格去禁空骨架。

- 权威原型：`prototypes/gate-feedback.html`（`prototypes/INDEX.md` 标唯一 authoritative）。
  它画的是**原型门拒人时人看到什么**：错误码 + 中文类别名 + 缺口清单 + 补法指引，
  四种门各一格（`prototype_missing` / `prototype_version_conflict` / `prototype_anchor_missing`
  / **新增的 `prototype_placeholder`**），并给出**被拒时该看到什么**的可核验结构。
- 锚点与 geometry 观测块写在原型里；几何量按 FR-4 **带实测值 + 截图路径 + 截图 sha256**——
  本需求是 FR-4 判据的**第一个狗粮用户**。
- 与实现的对照关系：`src/client/toolviews/shared.ts` 的 `ERROR_CATEGORY` 映射表是
  「码 → 中文类别名」的**实现侧契约**，原型里的四格文案与它逐字对齐。

## 边界（不做什么） <!-- serves: FR-1 -->

- **不碰验收标准排版**：验收单的项排版、字段顺序、既有项文案不动。
- **不碰归档校验**：归档清单 / 合并去向 / 说明书更新点的判据一行不改。
- **不碰测试基线**：`vitest` 配置、既有测试的通过基线不动；只**新增**断言与用例。
- **不改三道门的既有错误码语义**：`prototype_missing` / `prototype_version_conflict` /
  `prototype_anchor_missing` 各自负责什么，一字不改（新问题给新码）。
- **不用实现反推原型**（project-manual:1247）：判据量「实现 == 设计契约」。
  从 `src/client` 生成一份原型来「对齐」是**被禁止**的路径。
- **不追溯存量需求**：已归档的 9 条骨架原型需求**不回填、不重开、不判不健康**。
  它们的价值是**证据**（证明这道门此前形同虚设），不是**待办**。
- **不给原型内容评分**：机器只判「是不是空骨架」，不判「画得好不好」。

## 讨论与裁定记录（D-x） <!-- serves: FR-1 -->

| 编号 | 原话来源 | 裁定 | 影响 FR | 判据 |
|---|---|---|---|---|
| D-1 | 用户（本窗口直接人工回合）：「不立项我怎么处理？是什么原因不立项」 | 前两次 `reqboard_capture` 未成立不是故障：台账规定立项需**直接人工回合**，而本窗口首段是另一窗口投递的委派底稿（`source.kind !== 'user'`），代码级拒绝 `REQBOARD_DIRECT_HUMAN_REQUIRED`。改用 `reqboard_create` 手工路径落账 | FR-6 | 台账 `createdBy` 与本次人工消息同窗口；`SessionProbeAdapter.requireDirectHuman` 判据未改 |
| D-2 | 用户（另一窗口只读审计，委派转达）：「页面实现与原型不一致」 | 认定为**已发生事故**（非理论风险），根因在门：三道门都不读原型正文、对照项被设计成可选 | FR-1, FR-2, FR-3 | §现状的 9 条实测读数 + 反向演练记录 |
| D-3 | 本窗口（判据设计取舍） | 「非骨架」用**占位标记 + 与模板行重合率 >90%**两条独立判据，**不用文件哈希**：骨架一旦人工改过一个字哈希就变，判据会假绿 | FR-1 | 实测三档读数（94.7%–97.2% 骨架 / 0.02–0.13 真稿 / 0.20 半成品）呈双峰，90% 落在峰谷 |
| D-4 | 本窗口（判据设计取舍） | 几何量读数**绑截图 sha256**，缺项记 `unverified` 而非一律拒：存量原型没有截图，一律拒＝追溯存量（违反 §9 零迁移口径） | FR-4 | 缺两键 → 放行记 `unverified`；给了一键 → 两键都要对 |
| D-5 | 本窗口（自洽性取舍） | 本需求**自交原型**（`sides` 声明含 frontend）：它要立「非骨架」门，就不能自己靠骨架全绿 | FR-2 | 本需求原型过 FR-1 判据（行重合率与占位标记双绿） |

## 非功能需求 <!-- serves: FR-1 -->

- **判据可单测**：非骨架判据是**纯函数**（输入 HTML 文本 + 模板文本，输出是否命中），
  零 IO、零第三方 HTML 解析库依赖——门禁要 IO 不可单测，纯函数可逆验证（人为改坏必红）。
- **不引入新依赖**：相似度用词元/行集合重合率，不引 diff 库、不引 HTML parser。
- **门禁耗时**：新增判据只读**一份**文件（权威原型），不扫目录、不递归。
- **失败文案可执行**：两个新码的信封 `how` 必须含可执行锚点（改哪个文件、跑什么命令复核）。

## 关键决策与取舍

- **为什么新码而不是复用 `prototype_anchor_missing`**：两种坏的补法**不同**
  （一个要「填内容」，一个要「补锚点」）。共用一个码，人就只能靠读 gaps 猜，而码本身
  （面板、信封、类别名映射都读它）会失去信息量。
- **为什么相似度阈值取 90%**：实测骨架档 94.7%–97.2%、真稿档 0.02–0.13，中间只有一份
  20% 的半成品（它有自定义样式但与骨架无重合行）。90% 落在**峰谷**里，
  且**占位标记**是第二条独立命中的判据——两条都过不了的东西，不可能「碰巧像骨架」。
- **为什么 `unverified` 不算红**：本仓纪律是「失败要响亮」，但**追溯存量等于制造假红**。
  取舍是：**新写的**读数必须可复核（给键就要对），**历史的**读数如实标未采集。
- **为什么本需求要自交原型**：判据的狗粮测试。一个自己都靠骨架过关的需求，
  拿不出「这道门真的能拦人」的证据。

## 技术方案与亮点

- **骨架即判据的数据源**：模板正文（`prototype-skeleton-template.ts`）与比对基线**同源**——
  模板改一个字，判据自动跟着改，不存在「两份真相漂移」。
- **加性可选、零迁移**：`shot` / `shotSha256` 是加性键；台账 66 个分片、40 条需求记录
  **一行不改**，判据对旧数据读作「未采集」。
- **可参数化的对齐判据**：把「某条需求的手写靶子」变成「一份配置 + 一套通用断言」，
  新需求套用成本从「再写 194 行」降到「填三个字段」。

## 依赖与约束 <!-- serves: FR-1 -->

- **依赖既有单点**（不得复制）：`parsePrototypeMetadata` / `parsePrototypeIndex` /
  `prototypeExemptOf` / `registeredPrototypesOf` / `requiredStageArtifactKinds` /
  `contentGatesForMove` 五处接线。
- **约束**：改 client 源码必须 `pnpm build:client` 且打印 `[verify-client] OK`；
  改 src 必须 `pnpm build`。
- **约束**：`prototypeRulesSince`（缺省 `2026-10-06`）是存量分界线，新判据**必须**复用它，
  不得另立日期。
- **约束**：错误码三处齐（判据 / `http/envelope.ts` HTTP 状态 / `toolviews/shared.ts` 中文名）。

## 验收标准（整体） <!-- serves: FR-7 -->

1. 反向演练 A（必红→必绿）：骨架占 `authoritative` → `prototype_placeholder` 点名该路径；
   还原真稿 → 三门全过。
2. 反向演练 B（对照项）：删掉对照项生成分支 → 有测试变红；恢复 → 全绿。
3. `npx vitest run tests/prototype-*.test.ts tests/plan-prototype-anchor-gate.test.ts` 全绿。
4. `pnpm build` 与 `pnpm build:client` 均通过（后者打印 `[verify-client] OK`）。
5. 存量需求零回归：9 条骨架原型需求的现有行为（状态、验收单、门读数）与改动前逐一一致。
6. 本需求自己的原型过 FR-1 判据（自洽性）。

## 现状（已实测，供复核） <!-- serves: FR-6 -->

> 以下每条都可用括号里的命令独立复核。**读数与委派底稿不同处已标注**——
> 底稿是只读审计的二手转述，本表以本仓磁盘与台账的实测为准。

### 一、9 条需求的权威原型是空骨架，且当前 100% 通过锚点门

复核命令：用「去占位符后与 `templates/brainstorming/prototype.html` 的词元 Dice 相似度」逐份比对。

| 需求 | 权威原型 | 相似度 | 占位符 | INDEX 标 authoritative |
|---|---|---|---|---|
| REQ-261006091755-1c9e | `prototypes/detail.html` | 0.963 | 有 | 是 |
| REQ-261006094052-1da2 | `prototypes/detail.html` | 0.969 | 有 | 是 |
| REQ-261006115829-dafb | `prototypes/detail.html` | 0.972 | 有 | 是 |
| REQ-261006123819-3af3 | `prototypes/detail.html` | 0.951 | 有 | 是 |
| REQ-261006164732-6503 | `prototypes/detail.html` | 0.951 | 有 | 是 |
| REQ-261006170150-52cc | `prototypes/detail.html` | 0.965 | 有 | 是 |
| REQ-261006201508-5cb6 | `prototypes/detail.html` | 0.972 | 有 | 是 |
| REQ-261006201814-ac4f | `prototypes/detail.html` | 0.959 | 有 | 是 |
| REQ-261006201841-944d | `prototypes/detail.html` | 0.947 | 有 | 是 |

第 10 份高相似骨架（REQ-261006092213-4f5b 的 `detail.html`，0.972）**不计入**：
它的权威原型是 `verification-result.html`（该骨架未被标 authoritative）——**这正是判据该有的精度**：
只判权威那一份，不误伤 superseded 旧稿。

**反向演练（现状基线，已实跑）**：以 REQ-261006164732-6503 的真实三份文件
（`requirement.md` + `prototypes/INDEX.md` + `prototypes/detail.html`）喂给
`checkPrototypeAnchorsGate`，结果为

```
GATE RESULT = PASS(放行)
```

即：**一份没人填过一个字的骨架，当前是绿灯**。这就是本需求要堵的那个洞。

### 二、对照证据确实稀缺（实测台账，与底稿口径有差异）

底稿说「10 条有原型的需求里只有 3 条存在实现对照证据」。本仓实测（读
`~/.dsh/reqboard/requirements/*/` 的 66 个分片 + 工作区原型目录）：

| 读数 | 实测值 | 复核方式 |
|---|---|---|
| 有 `prototypes/*.html` 的需求 | **15** | `ls docs/requirements/REQ-*/prototypes/*.html` |
| 台账里登记了 `kind=prototype` 产物的需求 | **5** | 读分片的 `artifacts.json` |
| 验收单含 `prototype-compare` 项的需求 | **4** | 读分片的 `verification.json` 的 `sheet.items[].source.kind` |
| 计划任务里写了 `prototypeRefs` 的需求 | **4** | 读分片的 `plan.json` 的 `tasks[].prototypeRefs` |

**差异说明**：底稿按「实现对照证据」计数得 3/10，本表按「登记产物 / 对照项 / 卡锚点」三个
机器读数分别计数得 5 / 4 / 4。两者口径不同（底稿含人工读的对照文档，本表只认机器字段），
**不冲突，但本表更保守**：即便按最宽口径，**15 条有原型的需求里只有 4 条在验收单上真的对照过**。

### 三、两处真实偏离（均已核实原文）

1. **`REQ-261006092213-4f5b`：属性名实现与原型不一致。**
   原型（`prototypes/verification-result.html` :189/:208/:242）用 `data-result-source`，
   实现（`src/client/stage-panel.ts:531`）用 `data-result-src`。
   该需求**自己记录了这条差异**（`evidence/prototype-conformance.md:18-19`）：
   「以**设计判据**为准……原型未同步」。**记录在案，但没有人改**——这正是「对照是软要求」的代价：
   记了也没人管，因为没有任何机器判据要求两边一致。
2. **`REQ-261006175040-12d4`：正向样本（证明「做得到」）。**
   权威原型 `prototypes/card-gates.html` 的 54 个 class **全都能在 `src/client` 命中**
   （`dsh-pm-artifact-chip` / `dsh-pm-card-progress` / `dsh-pm-confirm-artifact` 等），
   DOM 顺序与 `src/client/views/artifacts.ts:128-148` 一致。
   **它同时有对照项与 3 张卡写了 `prototypeRefs`**——这条需求是唯一「三门 + 对照」都齐的样本，
   也就是本需求要把它**从特例变成默认**。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1、t2、t-d10419、t-213142 |
| FR-2 | ✅ 已接收 | t2、t-213142、t-c014e0 |
| FR-3 | ✅ 已接收 | t3、t-da2ad7 |
| FR-4 | ✅ 已接收 | t2、t-213142 |
| FR-5 | ✅ 已接收 | t4、t-271dda |
| FR-6 | ✅ 已接收 | t5、t-ba91c2 |
| FR-7 | ✅ 已接收 | t6、t-c014e0 |

> 无未接收条款（7 条全部有落点）。

<!-- reqboard:marks:end -->
