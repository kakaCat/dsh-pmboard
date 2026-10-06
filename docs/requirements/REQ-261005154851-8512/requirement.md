---
req_id: REQ-261005154851-8512
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5]
sides: [backend]
---

# 难度声明接进取词：expert/advanced 需求不该只拿到轻档纪律

> 面向：产品、开发、测试——**写给人看**。
> 人读三件套：TL;DR + ASCII 流程图 + 功能点总览表。
> 排版纪律：禁超过 4 行的连续段落；并列 ≥3 项用列表/表格；图一律 ASCII 字符画，**禁 mermaid**。

## TL;DR

- **是什么**：立项时选的「提示词难度」（simple/standard/advanced/expert）过去**只存不用**——
  每轮系统提示词装配时没把它带给取词入口，于是 expert 需求照样拿轻档纪律。
- **为什么现在做**：本仓已有 `difficulty-mapping`（四档 → 轻/重）与 `heavierDifficulty`（取重不取轻），
  闸门注入路径（h3）也早就传了；**唯独每轮系统提示词这条路没接线**——轻档 = 仪式精简，
  等于该走的清单与闸门提示没发出去。
- **得到什么**：选 expert 的需求在**每条注入路径**上都拿到重档纪律，且「为什么取这一档」写进注入留痕可核查。

## 一句话目标 + 可证伪判定标准

**目标**：难度声明在**所有**取词入口生效，与文本推断**取重不取轻**；依据进留痕。

**判定标准（跑什么、看到什么算完成）**：

1. `npx vitest run tests/injection-difficulty.test.ts`（新增）全绿，覆盖：
   - `expert` → 重档、`advanced` → 重档、`standard` → 轻档、`simple` → 轻档；
   - 无声明 + 文本推断不出 → 与改造前逐字相同（轻档，不因本次改动而变重）；
   - 声明轻、文本推断重 → **取重**（heavy）；
   - `factsOf` 带 / 不带 `promptDifficulty` 两形态（后者不得凭空造键）；
   - 三处注入入口（系统提示词 / dive 采集半 / 节点输入包）对同一条需求取到**同一档**。
2. `npx tsx scripts/injection-difficulty-probe.mts` 退出码 **0**：对同一段需求文本各跑一次
   「带声明 expert」与「不带声明」，打印 `routeKey` / `fragmentIds` / `difficultyReasons`，
   断言前者含 `brainstorming/heavy` 分片、后者与改造前一致。
3. 实机（人可复核）：本窗口挂一条 expert 需求，下一轮注入留痕（看板注入记录）里
   `fragmentIds` 含 `brainstorming/heavy*`，且 `difficultyReasons` 出现
   「声明难度 expert → 取词档 heavy」这类依据句；`light` 分片不再出现。
4. 回归：`npx vitest run tests/difficulty-mapping.test.ts tests/decision-gates.test.ts tests/content-gates.test.ts`
   全绿；`npx tsc --noEmit` 退出码 0。

## 档位依据（重档）

- **新决策点 ≥2**：无声明时是否保持现状、dive 采集半（只留痕不投递）要不要一起接、
  节点输入包那条路的 `difficulty` 来源是否统一到同一映射。
- **动数据契约**：`RequirementFacts` 与 `factsOf` 要新增 `promptDifficulty` 投影（同步缝字段只增不改）。
- **跨模块一致**：domain 取词（`resolveStagePrompt`）+ domain 投影（`RequirementSummary`）+
  application 两处注入组装 + tools/看板留痕，四处口径必须一致。
- **不可反向降级**：一旦发现要改闸门路径语义或要改四档枚举，即升级为跨需求改造，不在本需求内消化。

## 业务流程图

```
立项弹框（人选 expert）
    │
    ▼
台账 promptDifficulty = 'expert'          ← 一直都有，只是没人读
    │
    ├─ 闸门注入（H3）          读它 ✔   （h3-inject 早已传 declaredDifficulty）
    ├─ 每轮系统提示词          不读 ✘   ← 病灶：capture-section 只传文本，回落默认 light
    ├─ dive 采集半（只留痕）    不读 ✘
    └─ 节点输入包（交接用）      由调用方映射（HandoffOwner 传了；另一处待核）
             │
             ▼
      resolveStagePrompt：声明档 ↔ 文本推断档，**取重不取轻**
             │
             ▼
      重档纪律进注入 + difficultyReasons 进留痕（可核查"凭什么取这一档"）
```

## 产品定义

**难度声明**是需求立项时人对「这件事该有多少仪式」的一次显式表达。它必须**在每条注入路径上都算数**，
否则同一个选择在闸门里生效、在日常每轮提示词里失效——人看到的纪律强度就成了掷骰子。

- **核心价值**：把"我选了 expert"从一句表态变成**可核查的注入事实**（分片 id + 依据句）。
- **与现状的区别**：现在只有闸门路径读它；改后三条注入路径同口径，且无声明时的行为**逐字不变**。

**三要素检查清单**：

- [x] 说清楚"是什么"：把已存在的难度声明接进取词入口。
- [x] 说清楚"核心价值"：纪律强度与人的选择一致，且可核查。
- [x] 说清楚"与现状的区别"：从"只存不用（仅闸门读）"到"三条路径同口径 + 留痕有依据"。

## 用户与角色

| 角色 | 什么场景用 | 痛点（现状） |
|---|---|---|
| 用户 / PM | 立项时按事情分量选 advanced/expert | 选了 expert，日常每轮收到的仍是轻档清单，等于白选 |
| Agent（被注入方） | 按系统提示词里的清单干活 | 该走的复核/闸门提示没给，交付质量随提示词强弱漂移 |
| 开发 / 测试 | 排查「为什么这个窗口纪律这么松」 | 只能靠读代码猜；注入留痕里没有"凭什么取这一档" |
| 看板读者 | 核对某条需求的注入记录 | 只看到注入了什么，看不到为什么是这一档 |

## 功能点（需求条款）

### 功能点清单

| 编号 | 功能（一句话概述） | 优先级 |
|------|------------------|--------|
| FR-1 | 数据契约补齐：`RequirementFacts` / `factsOf` 带上 `promptDifficulty`（缺省即不带该键） | P0 |
| FR-2 | 系统提示词注入路径带声明难度，与文本推断**取重不取轻** | P0 |
| FR-3 | 口径统一：dive 采集半与节点输入包路径同样按声明难度取词 | P0 |
| FR-4 | 留痕：取词依据（声明档 / 推断档 / 冲突取重）进注入记录 `difficultyReasons` | P0 |
| FR-5 | 可证伪回归：单测 + 探针 + 实机留痕三件套 | P0 |

### 详细说明

**FR-1: 数据契约补齐（`RequirementFacts` / `factsOf`）**

- 现状：`promptDifficulty` 在 `SUMMARY_KEYS`（摘要层有）但**不在** `RequirementFacts`（系统提示词缝的窄投影），
  `factsOf` 也没投影它 ⇒ 注入组装处**根本拿不到**这个值（不只是漏传）。
- 输出：`RequirementFacts.promptDifficulty?: PromptDifficulty`（可选；缺省即**键不出现**，不补默认值）。
- 兼容：只增字段；老记录无该键 → 取词回落现状（文本推断 / 默认轻档）。

**验收标准**：

1. `factsOf({...promptDifficulty:'expert'})` → 结果含 `promptDifficulty: 'expert'`；
   记录无该键 → 结果**不含**该键（不是 `undefined` 占位）。
2. 既有断言「摘要键集」的用例不破（该字段本就在 `SUMMARY_KEYS` 里）。

**FR-2: 系统提示词注入路径带上声明难度**

- `capture-section`（每轮系统提示词装配）调 `resolveStagePrompt` 时传
  `declaredDifficulty: difficultyFromDeclaredPrompt(facts.promptDifficulty)`。
- 取词语义照既有 `resolveStagePrompt`：显式 `difficulty` > 声明与推断**取重不取轻** > 二者其一 > 默认。
- 边界：`promptDifficulty` 缺省 / 非法值 → 不传（回落现状，逐字不变）。

**验收标准**：

1. 需求 `promptDifficulty='expert'` 且文本推断不出档 → 取词结果 `routeKey` 为 `brainstorming/heavy/*`（改造前是 `light`）。
2. 需求 `promptDifficulty='simple'` 但文本推断为 heavy → **取 heavy**（取重不取轻，与本仓既有语义一致）。
3. 需求无 `promptDifficulty` → 取词结果与改造前**逐字相同**（同一条文本、同一套分片 id）。

**FR-3: 其余注入路径口径统一**

- dive 采集半（`session-driver`）：目前只传 `stage` + `category`（无需求画面）⇒ 一律默认轻档。
  修法：用同一份需求画面（facts）带上声明难度；该处**只留痕不投递**，故影响面是留痕与信号一致性。
- 节点输入包（`buildNodeInputPackage`）：`difficulty` 由调用方给。要求两条调用方
  （交接生成输入包 / 节点隔离）**统一经 `difficultyFromDeclaredPrompt`**，不得把四档原值当两档用。
- 边界：三处都不新增取词算法——只调用既有 `resolveStagePrompt`（INV-1 唯一入口）。

**验收标准**：

1. 同一条 expert 需求，三处入口取到的 `routeKey` 档位**一致**（heavy）。
2. 任一处传了四档原值（如 `'expert'`）而非映射后的两档 → 单测当场红（类型或断言拦住）。

**FR-4: 取词依据进留痕**

- `resolveStagePrompt` 已有 `difficultyReasons`；注入记录（injection-log）已支持该字段。
- 要求：声明档与推断档**不一致**时，reasons 里同时给出两者与最终取值（取重不取轻）；
  三者一致时至少给一条「声明难度 X → 取词档 Y」。
- 边界：不新增留痕通道，不改留痕 schema 的既有字段。

**验收标准**：

1. 注入记录里 `difficultyReasons` 非空且含声明档与最终取词档；
2. 声明与推断冲突时 reasons 含「冲突」「取重」语义句（可被 grep 断言）。

**FR-5: 可证伪回归**

- 新增 `tests/injection-difficulty.test.ts`（四档映射 + 三入口一致 + 无声明逐字不变 + 冲突取重）。
- 新增 `scripts/injection-difficulty-probe.mts`（同一文本两种声明跑对比，打印 routeKey / fragmentIds / reasons）。
- 实机：本窗口挂 expert 需求，下一轮注入留痕出现 heavy 分片与依据句。

**验收标准**：

1. 单测文件全绿；探针退出码 0；
2. 实机留痕截图或文字记录（含 fragmentIds 与 difficultyReasons）进 `evidence/`。

## 边界（不做什么）

- **不改四档枚举与映射表**：`simple/standard→light`、`advanced/expert→heavy` 照旧（`difficulty-mapping.ts` 不动语义）。
- **不改闸门注入路径**：`h3-inject` 本就正确，不重写、不"顺手统一"。
- **不追溯历史注入**：已经注入过轻档的回合不补发提示词；本需求只影响**之后的**每轮装配。
- **不新增/改写分片文案**：只改"取哪一档"，不动轻/重档文案本身的字句。

## 讨论与裁定记录（D-x）

| 编号 | 原话来源 | 裁定 | 影响 FR | 判据 |
|---|---|---|---|---|
| D-1 | 「验收后立项」 | 难度注入缺陷不作为上一条需求的一部分，**另立项**处理；上一条需求先走完验收归档 | FR-1, FR-2, FR-3, FR-4, FR-5 | 本条需求独立存在于台账（`REQ-261005154851-8512`），上一条已 archived |
| D-2 | 立项弹框作答「声明难度在系统提示词注入路径没接线：expert/advanced 需求被注入轻档纪律」（需求名称） | 立项范围 = **把声明难度接进取词**，不是"重写难度体系" | FR-1, FR-2, FR-3, FR-4, FR-5 | 判定标准 1~4；边界四条 |
| D-3 | 立项弹框作答 `feature` | 按 feature 类型走（接口/契约/迁移兼容/可跑验收四件） | FR-1, FR-2, FR-3, FR-4, FR-5 | 本文件 §功能点 + §边界 |
| D-4 | 立项弹框作答 `expert` | 本需求自身按重档做：契约先行 + 三入口一致 + 留痕 + 回归三件套 | FR-1, FR-2, FR-3, FR-4, FR-5 | 判定标准 1~4 全跑一遍 |

## 非功能需求

- **兼容**：无声明 / 非法声明时取词结果与改造前**逐字相同**（同文本 → 同 `fragmentIds`）；
  同步缝字段只增不改，老记录读为缺省。
- **可观测**：取词依据进注入记录，人可在看板核对「这一档凭什么」。
- **性能**：不新增 I/O；`factsOf` 多投影一个短字符串。

## 验收标准（整体）

1. 一条 `expert` 需求：四条注入/取词入口（闸门 / 系统提示词 / dive 采集半 / 节点输入包）取到同一档（重档）。
2. 一条 `simple` 需求 + 文本推断为重 → 取重档（取重不轻）。
3. 一条无声明的存量需求 → 注入分片与改造前逐字相同。
4. 注入留痕里能看到「声明档 → 取词档」的依据。
5. `npx tsc --noEmit` 0 错误；新增用例全绿；既有难度相关套件零新增失败。

## 关键决策与取舍

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 无声明时的行为 | 一律提到重档（"宁多给"） | 保持现状（推断 / 默认轻档） | 存量需求大量无声明，一律改重会让纪律与事实脱钩；取重不取轻只用于"声明与推断冲突"这一既有语义 |
| dive 采集半要不要接 | 不接（它不投递） | 接 | 它的留痕会被当证据读；留痕与系统提示词不一致会让人误判（"明明注入了重档"） |
| 依据写在哪 | 新开一个字段 | 复用既有 `difficultyReasons` | 留痕 schema 已支持该字段，不新增通道（INV-6 既有口径） |

## 技术方案与亮点

- **不新增算法**：唯一取词入口 `resolveStagePrompt` + 既有 `difficultyFromDeclaredPrompt` / `heavierDifficulty`，
  本需求只是把**已有的两段接上**（这正是本仓 `difficulty-mapping.ts` 当初留下的那条纪律）。
- **契约先行**：先补 `RequirementFacts.promptDifficulty`，三处接线才有同一份取值来源——
  避免"各处自己从台账捞"的第二份真相。
- **可核查**：依据句进留痕，验收不再靠读代码确认档位。

## 依赖与约束

- **依赖（强）**：`src/domain/prompt` 的取词入口与难度映射（既有）、`injection-log` 的 `difficultyReasons`（既有）。
- **约束**：不新增注入通道；不改分片库文案；`sides=[backend]`（无 UI 改动，不交原型）。
- **约束**：`RequirementFacts` 属同步缝窄投影，只增字段且必须可选（缺省即不带键）。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1、t4、t-455df9、t-b230c5 |
| FR-2 | ✅ 已接收 | t4、t2、t-d7efd0、t-b230c5 |
| FR-3 | ✅ 已接收 | t2、t-d7efd0 |
| FR-4 | ✅ 已接收 | t2、t-d7efd0 |
| FR-5 | ✅ 已接收 | t3、t-59ba97 |

> 无未接收条款（5 条全部有落点）。

<!-- reqboard:marks:end -->
