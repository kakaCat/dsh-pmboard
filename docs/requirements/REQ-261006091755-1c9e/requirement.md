---
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
sides: [backend]
---

# 拆分覆盖门补豁免：prototype_exempt 生效时跳过 UI 卡原型锚点维（REQ-261006091755-1c9e）

> 面向：产品、开发、测试、用户——**写给人看**。
> **人读三件套**：TL;DR + ASCII 流程图 + 功能点总览表。
> **排版纪律**：禁超过 4 行的连续段落；并列 ≥3 项用列表/表格；图一律 ASCII 字符画，**禁 mermaid**。
>
> 类型：feature ｜ 档位：**轻档**（一处早退 + 三条单测；无接口/数据契约变更） ｜ 立项：2026-10-06
> 工作区：`/Users/mac/Documents/ai/dsh/dsh-pmboard`
> 立项依据：承接 `REQ-261005213603-eaed` 的实测缺口（该需求已归档，缺口由人裁定「另立需求」）

## TL;DR <!-- serves: FR-1 -->

一句话：**「人已裁定本需求不要原型」时，拆分落库不该再要求前端卡写原型锚点**——豁免生效且该需求没有已登记原型产物，锚点维整维跳过。

- 现状矛盾：`prototype_exempt` 只在 brainstorming→design 的 **presence 门**生效；拆分覆盖门的 UI 卡锚点维没接它 ⇒ 无原型可锚却必须给 `prototypes/<name>.html#FR-N`。
- 实测后果（`REQ-261005213603-eaed` 拆分前探针）：同一需求同一张卡 `side=frontend` 被 `prototype_anchor_missing` 拒、`fullstack` 放行。
- 本需求只**解除这个真矛盾**：豁免但**真交了原型**时照旧逐卡要求锚点（交了就要合格）。

## 业务流程图 <!-- serves: FR-1 -->

```
需求声明 sides 含 frontend
        │
        ▼
brainstorming → design：presence 门 ── 读 prototype_exempt（理由非空 + requirement 已落章）
        │                                   │
        │ 豁免生效                          │ 未豁免
        ▼                                   ▼
  不要求交原型                          必须交原型（否则 prototype_missing）
        │
        ▼
拆分落库（覆盖门：FR 落点维 → UI 卡原型锚点维）
        │
        ├─ 本需求后：豁免生效 ∧ 无已登记原型产物 ──▶ 锚点维**整维跳过**
        ├─ 本需求后：豁免生效 ∧ 已登记原型产物 ────▶ 照旧逐卡要求锚点
        └─ 未豁免 ─────────────────────────────▶ 照旧逐卡要求锚点
```

## 产品定义 <!-- serves: FR-1 -->

**这是一条门禁语义的对齐修复**：让「人已确认的豁免」在流水线的**每一个**相关判定点都算数。

- 是什么：拆分覆盖门里「UI 卡必须有原型锚点」这一维，补上对 `prototype_exempt` 的消费（此前只有 presence 门消费）。
- 核心价值：豁免是**人的裁定**；裁定在 A 门生效、在 B 门失效，等于让人反复撞同一堵墙（本需求的直接成因）。
- 与现状的区别：今天唯一的出路是把端侧**谎报**成 `fullstack`（`REQ-261005213603-eaed` 就是这么绕的），污染 `side` 语义与下游提示词/统计。

## 用户与角色 <!-- serves: FR-1 -->

| 角色 | 什么场景用 | 痛点 |
|---|---|---|
| 需求发起人 / 裁决人 | 对某条 UI 需求裁定「零可视变化，豁免原型」 | 裁定了也在拆分时被拦，只能让 agent 谎报端侧或不落前端卡 |
| 实施 agent | 拿批准计划落卡 | `side=frontend` 被拒后不知道是该补原型还是该绕行（两条路都不对） |
| 后来实现者 | 读门禁代码 | 三处原型门只有一处消费豁免——语义不一致，容易继续踩 |
| 看板读者 | 看卡片端侧与 RTM 统计 | 绕行后的 `fullstack` 让「这卡到底改哪一侧」失真 |

## 功能点（需求条款） <!-- serves: FR-1 -->

### 功能点清单

| 编号 | 功能（一句话概述） | 优先级 |
|------|------------------|--------|
| FR-1 | 实施 agent 看到：豁免生效且无已登记原型时，前端卡不再被要求原型锚点（锚点维整维跳过） | P0 |
| FR-2 | 裁决人看到：豁免**未**生效时照旧被拒（不误放行、不静默降级） | P0 |
| FR-3 | 裁决人看到：豁免了但**真交了原型**时，卡片仍须指权威原型（质量约束不松） | P0 |
| FR-4 | 维护者看到：豁免判定与 presence 门**同源单点**，且有三条单测 + 既有用例回归 | P0 |

### 功能点详细说明

### FR-1: 豁免生效且无已登记原型 → 锚点维整维跳过

**功能描述**：实施 agent 看到：豁免生效且无已登记原型时，前端卡不再被要求原型锚点。

**详细说明**：
- **使用场景**：某需求 `sides` 含 frontend，但人已确认 `prototype_exempt`（理由非空 + requirement 产物已落章），且目录里没有任何**已登记**的 prototype 产物；此时落拆分计划。
- **操作流程**：
  1. 计划提交/落库触发覆盖门；
  2. 覆盖门先跑 FR 落点维（不受影响）；
  3. 进入 UI 卡原型锚点维前先判：豁免生效 ∧ 已登记原型产物 == 0 → 直接 `undefined`（放行）。
- **预期结果**：
  - `side=frontend` 的卡不再被要求锚点，也不产生「缺原型锚点」gap；
  - 其它维（FR 落点、裁定门、设计文档集）判定一字不变。
- **边界条件**：
  - 「已登记」= 产物簿里的 `kind=prototype`（`registeredPrototypesOf`），**不是**目录里有没有 html 文件；
  - 目录里躺着未登记的骨架（capture 自动生成的那种）不算数 → 仍走跳过分支。

**验收标准**：
1. `npx vitest run tests/plan-prototype-anchor-gate.test.ts` 中新增断言：豁免已落章 + 无已登记原型 + 一张 `side=frontend` 无锚点卡 → 门返回 `undefined`。
2. 同场景用真实需求回放：`reqboard_submit(kind=plan)` 不再报 `prototype_anchor_missing`。

### FR-2: 豁免未生效 → 照旧被拒

**功能描述**：裁决人看到：豁免未生效时照旧被拒。

**详细说明**：
- **使用场景**：`prototype_exempt` 理由为空，或理由写了但 requirement 产物**尚未落章**（agent 不能自己豁免自己）。
- **操作流程**：锚点维照旧运行 → 缺锚点即 `prototype_anchor_missing`，理由与文案一字不变。
- **预期结果**：拒绝码、gaps 文案、恢复指引与今天完全一致（既有用例零改动）。
- **边界条件**：`prototype_exempt` 键**不存在**同样按未豁免处理。

**验收标准**：
1. 单测：理由为空 → 仍拒；理由非空但 requirement 产物未确认 → 仍拒。
2. `npx vitest run tests/plan-prototype-anchor-gate.test.ts tests/move-gate-paths.test.ts` 全绿（既有拒绝路径不回归）。

### FR-3: 豁免但已登记原型 → 照旧要求锚点

**功能描述**：裁决人看到：豁免了但真交了原型时，卡片仍须指权威原型。

**详细说明**：
- **使用场景**：豁免生效（人当时认为不需要原型），但后续确实登记了 `kind=prototype` 产物（例如顺手补了对照稿）。
- **操作流程**：跳过分支的前置条件「已登记原型 == 0」不成立 → 锚点维照旧运行。
- **预期结果**：
  - 有权威原型 + 卡缺锚点 → 仍拒（`prototype_anchor_missing`）；
  - 卡锚点指向非权威/形态不合法 → 仍按既有判据拒。
- **边界条件**：INDEX 缺失/权威条数 ≠ 1 时，行为与今天一致（锚点维降级为只判形态），**不引入**「解析失败静默跳过」的新面。

**验收标准**：
1. 单测：豁免已落章 + 已登记 1 份原型（INDEX 权威一条）+ `side=frontend` 无锚点卡 → 仍拒，且 gap 点名该卡。
2. 同场景把卡的 `prototypeRefs` 补成权威路径 → `undefined`（放行）。

### FR-4: 判据同源 + 单测与回归

**功能描述**：维护者看到：豁免判定与 presence 门同源单点，且有三条单测 + 既有用例回归。

**详细说明**：
- **使用场景**：任何一次改门禁的人。
- **操作流程**：
  1. 只调既有 `prototypeExemptOf(req, frontmatter)` 取豁免，不另写「什么算豁免」；
  2. 「有没有已登记原型」只调既有 `registeredPrototypesOf(req)`；
  3. 三条单测覆盖 FR-1/FR-2/FR-3 的四种组合（豁免×有无原型）。
- **预期结果**：全仓只有一处判「豁免是否生效」、一处判「有没有原型产物」。
- **边界条件**：不改任何既有导出签名；不新增配置开关。

**验收标准**：
1. 源码级断言：锚点维里出现 `prototypeExemptOf(` 与 `registeredPrototypesOf(`，且没有第二处手写豁免判据（如自己读 front-matter 字符串）。
2. `npx vitest run tests/plan-prototype-anchor-gate.test.ts tests/move-gate-paths.test.ts tests/prototype-gates.test.ts tests/category-doc-sets.test.ts` 全绿。
3. `pnpm typecheck` 退出码 0。

**功能点关系图**：
```
FR-4（判据同源 + 用例）
  ├─ FR-1（豁免 + 无原型 → 跳过）
  ├─ FR-2（未生效 → 照旧拒）
  └─ FR-3（豁免 + 有原型 → 照旧要求）
```

## 边界（不做什么） <!-- serves: FR-1 -->

- 不改**版本门**与**原型锚点门**（`checkPrototypeVersionGate` / `checkPrototypeAnchorsGate`）：它们只在**真交了原型**时才可能红（交了就要合格），本次不扩范围、不动它们。
- 不改 **presence 门**（已正确消费豁免，是三处里的正确样板）。
- 不新增「豁免申请 / 撤销」入口：豁免的**语义与生效条件一字不变**，只补消费点。
- 不重写模板与提示词注入（原型骨架仍由既有通路生成）。
- **不修改已归档的 `REQ-261005213603-eaed` 历史文档**：它的 `fullstack` 绕行声明是当时的真实记录；本需求说的「回收」只指**未来同类需求不必再绕行**。

## 讨论与裁定记录（D-x） <!-- serves: FR-1 -->

| 编号 | 原话来源 | 裁定 | 影响 FR | 判据 |
|---|---|---|---|---|
| D-1 | 弹框选择「先绕行（fullstack）+ 缺口另立需求 (Recommended)」 | 该缺口另立需求修门（本需求即其承接），不在原需求内扩范围 | FR-1, FR-4 | 本需求立项 `REQ-261006091755-1c9e`；FR-1 验收标准 1 |
| D-2 | 弹框选择「只解除真矛盾：豁免 + 未交原型 → 跳过 (Recommended)」 | 跳过条件 = 豁免生效 **∧** 该需求无已登记原型产物；豁免但已交原型 → 照旧逐卡要求锚点 | FR-1, FR-3 | FR-1 验收标准 1、FR-3 验收标准 1、FR-2 验收标准 1 |

## 非功能需求 <!-- serves: FR-1 -->

- 兼容：`prototype_exempt` 缺省 = 未豁免 → 行为与今天逐字节一致（同一 input 同一 Failure）。
- 性能：只多两次内存/文档读取（front-matter 已解析、产物簿在 req 上），无新增 IO 请求。
- 可测：豁免判定与「有没有原型产物」都是既有纯函数/单点，门函数本身可用假 docs + 假 req 直测（既有 `tests/plan-prototype-anchor-gate.test.ts` 已是这个形态）。

## 验收标准（整体） <!-- serves: FR-1 -->

1. `npx vitest run tests/plan-prototype-anchor-gate.test.ts tests/move-gate-paths.test.ts tests/prototype-gates.test.ts` → 全绿，且含四种组合（豁免生效×有无原型 / 未豁免）的逐条断言。
2. `pnpm typecheck` → 退出码 0；`pnpm build`（host+client）→ 退出码 0（规范 C-11）。
3. **真实回放**（可证伪）：对一条 `sides` 含 frontend、`prototype_exempt` 已落章、无已登记原型产物的需求走 `reqboard_submit(kind=plan)` → **不再**报 `prototype_anchor_missing`；同一需求把 `prototype_exempt` 去掉后重跑 → **仍报**。
4. `pnpm test` 全量失败集合不新增（规范 C-14，基线取改动前同一命令输出）。

## 关键决策与取舍

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 跳过条件 | 豁免生效即整维跳过 | 豁免 **∧ 无已登记原型**才跳过 | D-2：真交了原型时锚点是可满足的质量约束，不该一起放掉 |
| 判据来源 | 自己读 front-matter 判豁免 | 调 `prototypeExemptOf` | 本仓「判据单点」纪律：什么算豁免只能有一处 |
| 范围 | 三处原型门一起接豁免 | 只接拆分覆盖门的锚点维 | 版本门/锚点门只在真交原型时才可能红，不属同一矛盾；避免一次改三处判定面 |
| 历史文档 | 回收（改写）已归档需求的 `fullstack` 声明 | 不改历史，只在机制备忘里记录 | 归档文档是当时的真实记录，改写即篡史 |

## 技术方案与亮点

- **一处早退**：`assertUiCardPrototypeAnchors` 在进入逐卡判定前加一条前置（豁免生效 ∧ `registeredPrototypesOf(req).length === 0` → `return undefined`），其余分支一字不动。
- **零新增概念**：不新增门、不新增错误码、不新增配置；改的是「既有豁免语义没被消费完」这一处遗漏。
- **与常规做法的差异**：没有把「豁免」做成第三个开关位，而是复用既有判定函数——本仓「同一件事只有一个答案」的既有纪律（可核验指向：`tests/plan-prototype-anchor-gate.test.ts` 的四组合断言）。

## 依赖与约束 <!-- serves: FR-1 -->

- 依赖（强）：`prototypeExemptOf(req, frontmatter)`（`src/application/internal/prototype-gates.ts`）与 `registeredPrototypesOf(req)`（`src/application/internal/prototype-registration.ts`）语义不变。
- 依赖（强）：拆分覆盖门保持唯一判定单点 `assertClauseCoverageGate`（三条入口共用：`Decompose` / `approved-plan-landing` / `SubmitArtifact` 的 kind=plan）。
- 约束：`sides: [backend]`（本次改的是 host 侧门禁代码，无界面改动 ⇒ 不触发原型必交门）。
- 约束：不动既有导出签名与错误码文案（既有用例逐字断言）。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1、t2、t-6ec9b7、t-78f631 |
| FR-2 | ✅ 已接收 | t1、t2、t3、t-78f631、t-63d541 |
| FR-3 | ✅ 已接收 | t1、t2、t-6ec9b7、t-78f631 |
| FR-4 | ✅ 已接收 | t2、t3、t-78f631、t-63d541 |

> 无未接收条款（4 条全部有落点）。

<!-- reqboard:marks:end -->
