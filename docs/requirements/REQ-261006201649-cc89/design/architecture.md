---
req_id: REQ-261006201649-cc89
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7
---

# 架构设计（REQ-261006201649-cc89 原型门与实现对照判据加固）

> refactor 档。纪律：**一次只改一类东西**（分批见末节「批次与批间验证」）；每批给**行为等价**的
> 验证设计；不夹带新功能、不修无关 bug（发现即另开需求）。
> 本设计**不含任务表 / DAG / 批次编号到卡**——那些是拆分阶段的产物（W7 边界）。

## 目标 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7`

一句话（可证伪）：**原型面的每一道门都能说出它量了什么**——
权威原型是填过的（不是模板骨架）、实现有对照项、每条几何量读数可复核（值 + 截图 + sha256）。

反例（改完仍出现即未达成）：一份与 `templates/brainstorming/prototype.html` 行重合率 > 90%
的骨架占据 `authoritative` 位置时，`brainstorming → design` 仍被放行。

## 现状链路与改动位置总览 `serves: FR-1, FR-2, FR-3, FR-4, FR-6`

```
                     ┌─ 现有（不动语义） ──────────────────────────┐
reqboard_submit      │ 存在门 checkPrototypePresenceGate           │
(kind=prototype) ───▶│ 版本门 checkPrototypeVersionGate            │
                     │ 锚点门 checkPrototypeAnchorsGate            │
                     └──────────────┬──────────────────────────────┘
                                    │  ▲ 本需求新增（FR-1/FR-2）
                                    ▼  │
                    prototypePlaceholderOf(html, template)   ← 纯函数、零 IO
                                    │
        ┌───────────────────────────┴────────────────────────────┐
        │ B1 锚点门内：权威那一份先判「非骨架」→ 再判锚点/几何量块 │
        │ B2 骨架落盘：判不了不落（收敛非前端落骨架路径）          │
        └────────────────────────────────────────────────────────┘

验收单组装（SubmitVerification::compareInputsOf）
  现状：有已登记 .html 原型 → 组装 prototype-compare（条件化）
  改后：INDEX 有唯一 authoritative → 必组装（FR-3，硬判据）

几何量读数（StageArtifact.prototypeMeta.geometry[]）
  现状：name/value/unit/at/source
  改后：+ shot / shotSha256（加性可选）；给了就要对（FR-4）

对齐判据（tests/prototype-parity.test.ts）
  现状：某条需求专属靶子（194 行手写断言）
  改后：一份配置 + 一套通用断言（FR-5）
```

## 依赖与调用方清单（refactor 必填） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7`

| 改动点 | 谁调用它 | 它调用谁 | 漏改验证 |
|---|---|---|---|
| `prototypePlaceholderOf`（新增纯函数，`prototype-gates.ts`） | 锚点门；测试 | 无（零 IO） | 纯函数冻参用例；`grep` 确认无第二处实现 |
| `checkPrototypeAnchorsGate` | `content-gate-wiring.ts:1066` 唯一调用点 | `parsePrototypeMetadata` / `parsePrototypeIndex` / `prototypePlaceholderOf` | `grep -rn "checkPrototypeAnchorsGate"` 仍只有一处调用 |
| `checkPrototypePresenceGate` | `content-gate-wiring.ts:1062` + `auto-confirm.ts:73` | `prototypePresenceGaps` / `registeredPrototypesOf` | `grep -rn "checkPrototypePresenceGate"` 两处 |
| `checkPrototypeVersionGate` | `content-gate-wiring.ts:1064` | `parsePrototypeIndex` | 调用点不变，行为逐字不变 |
| `landPrototypeSkeleton`（`prototype-skeleton.ts`） | 进入需求阶段的落盘入口 | `requiredStageArtifactKinds` / `PROTOTYPE_HTML_SKELETON` | `grep -rn "landPrototypeSkeleton"`；新增「判不了不落」用例 |
| `compareInputsOf` / `prototypeHtmlPathOf`（`SubmitVerification.ts`） | `submitVerification` 主流程 | `parsePrototypeIndex`（新增，用于取权威行）/ `prototypeExemptOf` | 验收用例：有权威原型 ⇒ 必有对照项；豁免 ⇒ 行为不变 |
| `parsePrototypeMetadata` / `observationsOf`（`prototype-gates.ts`） | 锚点门、`reqboard_submit(kind=prototype)` 登记回执 | 无 | 既有 `prototype-metadata-parse.test.ts` 全绿 + 新增两键用例 |
| `humanReason` 事实性判据（新增纯函数） | 验收材料提交（`SubmitVerification`） | 无 | 用例：态度词拒 / 含锚点放行 |
| `STATUS_BY_CODE`（`http/envelope.ts`） | `statusForCode` | 无 | 用例：两个新码 → 400（未登记码落 500，本需求必须登记） |
| `ERROR_CATEGORY`（`client/toolviews/shared.ts`） | 各 toolview row 的错误类别文案 | 无 | `pnpm build:client` 打印 `[verify-client] OK` |

**五处接线点不变**（`content-gate-wiring.ts` §6 纪律）：`MoveRequirement` / `confirm-settle` /
`AskConfirm` / `handleReqMove` / `handleArtifactConfirm`——本需求**不新增接线点**，
只改「唯一 async 入口」内部的判据实现。

## 判据单点与数据流 `serves: FR-1, FR-6`

**一处数据源**：`PROTOTYPE_HTML_SKELETON`（`prototype-skeleton-template.ts`）既是落盘骨架正文，
也是**比对基线**。两者同源的理由：模板改一个字，判据自动跟着改——
若另存一份「指纹」常量，改模板不改指纹必然漂移（本仓「两份真相」教训）。

**一处判据**：`prototypePlaceholderOf(html, template)` 是唯一实现；门、测试、回执都调它。

```
PROTOTYPE_HTML_SKELETON ──┬──▶ 落盘（prototype-skeleton.ts）──▶ docs/.../prototypes/<name>.html
                          └──▶ 比对基线 ──▶ prototypePlaceholderOf(权威原型正文, 基线)
                                                     │
                                                     └──▶ 命中 ⇒ GateFailure{prototype_placeholder}
```

**模板基线不可得时的行为**（关键口径）：返回 `undefined`（**不判**）。
理由：判不了就放行是既有口径（「读数未知不判」，`stage-gate-timeline` §7 同源）——
绝不因为"我没拿到基线"就假红一条需求。

## 三道原型门的整合与短路顺序 `serves: FR-1, FR-2`

短路顺序**保持现状**（先说"没有原型"，再说"哪一版算数"，再说"原型哪里不合格"）：

| 顺序 | 门 | 判据 | 本次改动 |
|---|---|---|---|
| ① | 存在门 `prototype_missing` | 有没有**显式登记**的原型 / 有效豁免 | 无（登记口径不动） |
| ② | 版本门 `prototype_version_conflict` | INDEX 恰好一条 authoritative / 文档不引用 superseded | 无 |
| ③ | 锚点门 | 权威那一份：**非骨架** → `id="FR-N"` 覆盖 → geometry 块恰一块 → 无阈值字段 | **新增第一问**（FR-1） |

**「非骨架」放在锚点门内的理由**：它是"权威那一份合格吗"的第一问，与锚点、geometry 同属
「这份原型的内容合不合格」；另开第四道门会让"同一份文件的不合格"分散到两个码上，
违反「同一处坏只报一次」。

**为什么不并进版本门**：版本门管的是"**哪一版**算数"（`authoritative` 恰一条），
与非骨架判据的输入（权威那份的**正文内容**）完全不同——合并会让版本门在
「INDEX 缺列」时也去读 HTML，把两种坏的排查路径缠在一起。

## 错误码注册与信封 `serves: FR-1, FR-4, FR-6`

两个新码**三处齐**（缺一处即落 500，看板会把"流程问题"显示成"服务器坏了"）：

| 位置 | 文件 | 内容 |
|---|---|---|
| 判据 | `prototype-gates.ts` | `prototype_placeholder` / `prototype_geometry_unverified` 的 `GateFailure` |
| HTTP | `http/envelope.ts::STATUS_BY_CODE` | 两码 → `400`（**必须显式登记**，无前缀兜底） |
| 人读 | `client/toolviews/shared.ts::ERROR_CATEGORY` | 「原型仍是空骨架」/「几何量读数无法复核」 |
| 会话侧传输码 | `use-cases/MoveRequirement.ts` 的映射表 | `REQBOARD_PROTOTYPE_PLACEHOLDER` / `REQBOARD_PROTOTYPE_GEOMETRY_UNVERIFIED`（与既有三门同构，**成对登记**） |

信封走既有 `envelope({lead, what, why, how})`（`gate-feedback.ts`）——三要素缺一不可，
`how` 必须命中 `GATE_HOW_ANCHOR`（`reqboard_*` / `templates/` / `design_exempt` /
`prototype_exempt` / `decision_`）。新码的 `how` 给可执行锚点：
`reqboard_submit(kind=prototype)` + `templates/brainstorming/prototype.html`。

## 骨架落盘的收敛 `serves: FR-2`

**现状**：`landPrototypeSkeleton` 已经是「判不了不落」的形态（`sides` 三源：
显式入参 → `requirement.md` front-matter → `CATEGORY_DEFAULT_SIDES`；不命中
`requiredStageArtifactKinds` 就 `reason='not-ui'`）。

**本需求的收敛点**（两处，都是"堵住非前端需求也落前端骨架"）：

1. **`CATEGORY_DEFAULT_SIDES` 的兜底收窄**：现状只有 `feature: ['frontend','backend']`。
   本次**不改它的值**（改了会让新 feature 需求拿不到骨架，是行为回归），
   而是明确一条纪律并在用例里锁死：**兜底只对 `feature` 生效，其余分类一律不落**；
   新增 `refactor` 不落（现行为已如此，用例补上防止将来被"顺手加一行"）。
2. **落盘前的第二问**：骨架写完后，**不得**因为"文件在磁盘上"就认为原型已交——
   这条由既有「登记才算数」口径保证（`prototype-registration.ts`），本次加**回归用例**锁死
   （防止将来有人把 `autoDiscovered` 判据放宽回去）。

## 对齐判据的分层（FR-5） `serves: FR-5`

```
domain（纯函数、零 IO）
  prototypeParityViolations(prototypeHtml, implHtml, contracts) → string[]
    contracts: { classes: string[], dataAttrs: string[], order: string[] }
    返回：逐条人读缺口（每条含：契约名 + 期望 + 实际 + 原型锚点）

被检需求的配置（位于 tests/，不在 src/）
  { prototype: 'docs/requirements/<REQ>/prototypes/<name>.html',
    render: () => string,            // 调实现侧渲染入口，产出 HTML 字符串
    container: (html) => string,     // 只取被测容器（避免跨屏串味）
    contracts: {…} }
```

**为什么配置放 tests/ 而不是 src/**：判据要跑「实现 vs 原型」，配置里必然 import
`src/client` 的渲染函数——那是**测试**的职责。放进 `src/` 会让生产构建带上
「读原型文件」的路径依赖，从而违反 project-manual:1247 的纪律
（**不得由实现反向生成原型**：判据只允许"读原型、量实现"，不允许"读实现、产出原型"）。

**三条契约的口径**：

| 契约 | 判据 | 为什么必须有 |
|---|---|---|
| `classes` | 原型里的每个 `dsh-pm-*` 类名必须在实现 HTML 中命中 | 类名是视觉结构的唯一稳定锚（文案会变、类名是契约） |
| `dataAttrs` | 原型声明的 `data-*` 属性名与取值域必须在实现中一致 | **本条由实测事故逼出**：`data-result-source`（原型）vs `data-result-src`（实现） |
| `order` | 原型声明的关键节点相对顺序与实现一致 | 「旗标在结果行之前/之后」这类差异只有顺序能抓 |

## 错误与降级路径 `serves: FR-2, FR-4`

| 情形 | 行为 | 依据 |
|---|---|---|
| 模板基线读不出 | `prototypePlaceholderOf` 返回 `undefined` → 门放行 | 「读数未知不判」 |
| 权威原型读不出 | 报既有 `prototype_anchor_missing` 并点名路径 | 不静默放行 |
| 权威原型为空文件 | 行重合率分母保护为 0，占位标记兜底 | 不因除零抛错 |
| `shot` 给了但文件不在 | `prototype_geometry_unverified` 拒，点名观测量名 + 路径 | FR-4 |
| `shotSha256` 与实际不符 | 同上拒（比的是**文件实测摘要**，不信任自述） | FR-4 |
| 两键都缺 | 放行，读数标 `unverified` | 存量零迁移 |
| 存量需求（`createdAt < DOC_QUALITY_RULES_SINCE`） | 新判据**整段不判** | §9 存量不追溯 |

## 批次与批间验证（一次只改一类东西） `serves: FR-1, FR-3, FR-4, FR-5, FR-6`

四批，**批间可独立验证**（每批跑完都能单独判定"这批对不对"，不需要等后面批次）：

| 批 | 一类改动 | 批内验证 | 批间独立验证 |
|---|---|---|---|
| A | 判据纯函数 + 锚点门接线（FR-1/FR-2） | 纯函数冻参用例 + 反向演练 A | `tests/prototype-*.test.ts` 全绿；既有三门用例一字不改 |
| B | 验收对照项硬判据（FR-3） | 反向演练 B（删分支必红） | `tests/submit-prototype*.test.ts` 全绿；存量验收单逐字一致 |
| C | 几何量读数两键 + needsHuman 事实性（FR-4） | 解析用例（缺两键/给一键/坏 sha） | 既有 `prototype-metadata-parse.test.ts` 全绿 |
| D | 对齐判据参数化（FR-5） | 既有 `tests/prototype-parity.test.ts` 断言只增不减 | 该文件全绿且断言条数 ≥ 改动前 |

**批间顺序约束**：A 必须在 B 之前（B 的对照项依赖"权威原型是合格的"这一前提，
否则会给一条骨架需求强制生成对照项，人只能对着骨架打勾）。
C、D 与 A、B 无依赖，可与 A 并行。

## 边界（不做什么） `serves: FR-1`

- **不碰**验收标准排版、归档校验、测试基线、五道人工门、三道门的既有码语义。
- **不做**原型内容质量评分（机器只判"是不是空骨架"）。
- **不做**存量回填：已归档的 9 条骨架/弱对照需求不重开、不回填、不判不健康。
- **不做**「从实现反推原型」的任何能力（project-manual:1247 机制备忘）。
