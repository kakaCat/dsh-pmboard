# 架构设计（REQ-261006091755-1c9e）

> 每章标题行带 `serves: FR-x`。改动只有一处早退，本文档重点写清「为什么是这个条件、为什么不是别的条件」。
> 全部改动在 host 侧应用层（`src/application/internal/`），无接口/协议/存储变更。

## 目标与不变量 `serves: FR-1, FR-4`

**问题**：需求条款 FR-1——「人已裁定本需求不要原型」时，拆分落库仍要求 `side=frontend` 的卡写原型锚点，而该需求**没有原型可锚**。

**不变量（改完也必须成立）**：

1. **豁免的判定只有一处**：什么算「豁免生效」永远由 `prototypeExemptOf(req, frontmatter)` 回答（理由非空 ∧ `kind=requirement` 产物已落章），本改动不新增第二份。
2. **「有没有原型」的判定只有一处**：`registeredPrototypesOf(req)`（台账里显式登记的 `kind=prototype`）；不读磁盘目录、不看 `autoDiscovered` 的補登条目。
3. **未豁免的拒绝行为逐字不变**：同一 input 产出同一 `GateFailure`（码、gaps、文案）。
4. **不新增门 / 错误码 / 配置开关**：改的是既有判定里被漏消费的一处语义。

## 模块改动地图 `serves: FR-1`

```
reqboard_submit(kind=plan) / reqboard_decompose / 计划批准落库
        │
        ▼
assertClauseCoverageGate(docs, req, rawTasks)                 ← 唯一判定单点（三条入口共用）
        │
        ├─ 维① FR 落点：每条根编号有没有卡接收                 （本次不动）
        │
        └─ 维② UI 卡原型锚点：assertUiCardPrototypeAnchors(...)  ← 本次唯一改动点
                 │
                 ├─ sides 判定：feature/refactor ∧ sides 含 frontend ？（不动）
                 ├─ 【新增】豁免生效 ∧ 已登记原型产物 == 0 → return undefined（整维跳过）
                 ├─ 计划文档通道：读 decomposition.md 的「原型锚点」列（不动）
                 └─ 逐卡判定：prototypeAnchorGaps(...)            （不动）
```

**改动清单**：

| 模块/文件 | 类型 | 改动内容 | 原因（serves 哪条 FR） | 影响范围 |
|---|---|---|---|---|
| `src/application/internal/content-gate-wiring.ts` | 改 | `assertUiCardPrototypeAnchors` 内加一条前置早退（2 行 + 注释）；补 2 个 import | FR-1、FR-3 | 仅 UI 需求的锚点维；非 UI / 存量需求路径不受影响 |
| `src/application/internal/prototype-gates.ts` | 不改 | `prototypeExemptOf` 作为**读侧**被调用（它已导出） | FR-4 | 无 |
| `src/application/internal/prototype-registration.ts` | 不改 | `registeredPrototypesOf` 作为**读侧**被调用（已导出） | FR-4 | 无 |
| `tests/plan-prototype-anchor-gate.test.ts` | 改 | 加豁免×有无原型的四组断言 + 两条逆验证 | FR-1～FR-4 | 测试 |

无新增文件、无删除文件。

## 判定前置：早退条件与位置 `serves: FR-1, FR-3`

**位置**：`applies` 判定（`sides` 是否命中 UI 需求）**之后**、计划文档通道读取**之前**。
放在这儿的两个理由：① 非 UI 需求仍走最早的那条 `return undefined`（语义分层清晰）；
② 豁免时**连 `decomposition.md` 都不读**（省一次 IO，也避免"文档不在盘上"影响判断）。

**条件（逐字）**：

```
prototypeExemptOf(req, doc.frontmatter).active  &&  registeredPrototypesOf(req).length === 0
    → return undefined（锚点维整维跳过）
```

**为什么不是「豁免即跳过」**（D-2 裁定）：豁免的语义是「**不强制**交原型」，不是「交付物免检」。
真登记了原型时，卡指向权威原型是可满足的质量约束，不该一起放掉。

**为什么不用「权威原型路径取不到」当条件**：那把「INDEX 坏了 / 权威条数 ≠ 1」读成「没有原型」，
成为一条**静默放行面**（本仓明确最忌的形态）。本条件只依赖**登记事实**（产物簿），不依赖任何解析结果。

## 数据流与判定顺序 `serves: FR-1, FR-4`

| 环节 | 读什么 | 缺省语义 |
|---|---|---|
| UI 需求判定 | `requirement.md` 的 front-matter `sides` | 不含 frontend → 整维不适用（直接放行） |
| 豁免判定 | 同一份 front-matter 的 `prototype_exempt` + `req.artifacts` 里 `kind=requirement` 的 `confirmedAt` | 键缺失 / 理由空 / 未落章 → **未豁免** |
| 有没有原型 | `req.artifacts` 里 `kind=prototype` ∧ `autoDiscovered !== true` | 0 条 → 无原型可锚 |
| 逐卡判定 | 任务对象 `prototypeRefs` ∪ 计划文档「原型锚点」列 | 双源都空 → 该卡缺锚点 |

**零新增 IO**：前两步读的都已在内存（`doc` 已解析、`req` 已装配）；第四步在跳过时不发生。

## 事务与幂等 `serves: FR-1`

- 本判定是**纯读判定**，不写台账；跳过与拒绝都不产生副作用（既有语义）。
- 幂等：同一 `(req, plan, tasks)` 多次调用结论一致（无时间/随机数参与）。
- 三条入口（`SubmitArtifact` 的 kind=plan 预检 / `Decompose` / `approved-plan-landing`）共用同一函数 ⇒ 一次改动三处生效，不存在"只修一条路"。

## 兼容性与回滚 `serves: FR-1, FR-2`

| 问题 | 结论 |
|---|---|
| 旧数据 / 存量需求（`artifacts` 为空） | 走既有 earliest return（`isLegacy`）放行，行为不变 |
| 未豁免需求 | 早退条件第一项为假 → 判定与今天逐字节一致（FN 码、gaps、文案） |
| 豁免但已交原型 | 早退条件第二项为假 → 判定与今天一致（仍要求锚点） |
| 改表 / schema / 迁移 | **否**（不碰任何存储） |
| 回滚路径 | 删掉那 2 行 + 2 个 import 即完全回滚；无数据残留、无需回填 |
| 灰度 / 开关 | **不需要**（能力是"少拦一种自相矛盾"，最坏情况退回今天） |

## 边界（架构层面不做什么） `serves: FR-1`

- 不改 `checkPrototypePresenceGate`（已正确消费豁免，是样板）。
- 不改 `checkPrototypeVersionGate` / `checkPrototypeAnchorsGate`：它们只在**真交了原型**时才可能红（交了就要合格），本次不扩范围。
- 不改 `prototypeAnchorGaps` 的逐卡判据、错误码、文案（既有用例逐字断言）。
- 不新增 front-matter 键、不新增产物 kind、不新增配置。

## 风险与对策 `serves: FR-1, FR-2`

| 风险 | 触发条件 | 影响 | 对策 |
|---|---|---|---|
| 误放行（本该拒的放了） | 条件写宽（如豁免即跳过、或拿解析失败当"无原型"） | 无原型需求的卡不再被要求锚点 —— 但这正是本次要的；**有原型时**误放行才是缺陷 | 条件第二项只认登记事实；TC-6 锁死"豁免+有原型仍拒" |
| 误拒（本该放的拒了） | 条件写严（如要求 INDEX 存在） | 矛盾仍在，白改 | TC-1 直接断言 `undefined` |
| 判据漂移 | 后来者手写豁免判据 | 两处口径分叉 | 源码锚点断言：锚点维内只出现 `prototypeExemptOf(` |
| 未落章即豁免 | agent 自己给自己豁免 | 门禁形同虚设 | 复用 `prototypeExemptOf` 的既有条件（须 `confirmedAt` 已写），TC-4 锁死 |
