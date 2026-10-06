# 接口设计（REQ-261006091755-1c9e）

> 每节标注 `serves: FR-x`。本次**无对外接口变更**（无 HTTP / 工具 / 事件 / 导出签名变更）；
> 变的是**一条私有判定函数的前置条件**，以及它新增的两个**读侧**依赖。

## 改动点：`assertUiCardPrototypeAnchors` 的前置条件 `serves: FR-1, FR-3`

**位置**：`src/application/internal/content-gate-wiring.ts`（模块私有函数，不导出）。

**改动前（语义）**：

```typescript
async function assertUiCardPrototypeAnchors(
  docs: DocsReader, req: RequirementRecord, doc: ParsedDoc,
  rawTasks: readonly unknown[], decompositionPath: string,
): Promise<GateFailure | undefined> {
  const sides = designDocPolicyFrom(doc.frontmatter).sides
  const applies = conditionalStageArtifactsFor(req.category, sides).some(c => c.kind === 'prototype')
  if (!applies) return undefined
  // …读计划文档通道 → 逐卡判定 → 缺锚点即 prototype_anchor_missing
}
```

**改动后（新增 2 行，插在 `applies` 之后）**：

```typescript
  if (!applies) return undefined

  // 豁免生效 ∧ 无已登记原型产物 → 无「可锚」对象：整维跳过（REQ-261006091755-1c9e FR-1/FR-3）。
  // 判据全部复用既有单点，不另写「什么算豁免 / 有没有原型」。
  if (prototypeExemptOf(req, doc.frontmatter).active && registeredPrototypesOf(req).length === 0) return undefined

  // …其余分支一字不动
```

**新增 import（同文件，均为既有导出）**：

```typescript
import { prototypeExemptOf, /* 既有其它门 */ } from './prototype-gates.js'
import { registeredPrototypesOf } from './prototype-registration.js'
```

**契约**：

| 项 | 值 |
|---|---|
| 入参 | 不变（`docs` / `req` / `doc` / `rawTasks` / `decompositionPath`） |
| 返回 | `undefined`（放行）或既有 `GateFailure{code:'prototype_anchor_missing'}` |
| 新分支的返回 | `undefined`（**不新增码**；跳过不是错误） |
| 异常 | 不抛（`prototypeExemptOf` / `registeredPrototypesOf` 都是纯读，无 IO、无异常面） |

## 读侧依赖 1：`prototypeExemptOf` `serves: FR-2, FR-4`

**契约**（既有导出，签名与语义一字不改）：

```typescript
export function prototypeExemptOf(
  req: RequirementRecord,
  frontmatter: Readonly<Record<string, string>>,
): { active: boolean; reason: string }
```

| 输入 | 返回 |
|---|---|
| `frontmatter['prototype_exempt']` 缺失 / trim 后为空 | `{ active: false, reason: '' }` |
| 理由非空，但 `req.artifacts` 里没有 `kind=requirement` 且 `confirmedAt !== undefined` 的条目 | `{ active: false, reason: <理由> }`（**未落章 = 不生效**） |
| 理由非空 ∧ requirement 产物已落章 | `{ active: true, reason: <理由> }` |

**为什么必须调它而不是自己读 front-matter**：它是全仓判「豁免是否生效」的唯一实现（presence 门也调它）。
自己读字符串会立刻产生两种口径（agent 能不能自己豁免自己这类问题会重新出现）。

## 读侧依赖 2：`registeredPrototypesOf` `serves: FR-1, FR-4`

**契约**（既有导出）：

```typescript
export function registeredPrototypesOf(req: RequirementRecord): StageArtifact[]
```

- 取 `req.artifacts` 里 `kind === 'prototype'` **且** `autoDiscovered !== true` 的条目；
- **未登记的落盘文件不算**（自动发现補登的条目 `autoDiscovered === true` 被排除）——这是本仓既有口径（"登记才算数，落盘未登记不算"）；
- 缺省：`artifacts` 为空 / 无 prototype 条目 → `[]`。

**用返回值的长度判「有没有原型」，不用磁盘、不用 INDEX 解析**：解析结果会引入静默放行面（见 `architecture.md` §判定前置）。

## 判定结果对照（与今天逐项对齐） `serves: FR-1, FR-2, FR-3`

| 场景（需求侧） | 卡侧 | 改动前 | 改动后 |
|---|---|---|---|
| 非 UI 需求（sides 不含 frontend） | 任意 | 放行 | 放行（不变） |
| 存量需求（`artifacts` 空） | 任意 | 放行 | 放行（不变） |
| UI 需求 + **未豁免** | 卡无锚点 | 拒 `prototype_anchor_missing` | 拒（**逐字不变**） |
| UI 需求 + **未豁免** | 卡有权威锚点 | 放行 | 放行（不变） |
| UI 需求 + **豁免生效** + 无已登记原型 | 卡无锚点 | 拒（**本次要修的矛盾**） | **放行** |
| UI 需求 + **豁免生效** + 有已登记原型 | 卡无锚点 | 拒 | 拒（FR-3，不变） |
| UI 需求 + **豁免理由空 / 未落章** | 卡无锚点 | 拒 | 拒（FR-2，不变） |

## 不改动的接口清单（红线） `serves: FR-1, FR-2`

| 接口 | 为什么不改 |
|---|---|
| `assertClauseCoverageGate` 的签名与返回 | 三条入口共用，签名一改三处联动；本次只改内部前置 |
| `checkPrototypePresenceGate` | 已正确消费豁免 |
| `checkPrototypeVersionGate` / `checkPrototypeAnchorsGate` | 只在真交了原型时才可能红，本次不扩范围 |
| `prototypeAnchorGaps` / `uiCardAnchorClaims` | 逐卡判据与双源通道不变（复用） |
| 错误码与 `envelope` 文案 | 既有用例逐字断言；跳过路径不产生新文案 |
| 模板 / 提示词 / 工具 schema | 不在本需求范围（无新入参） |

## 错误语义总表 `serves: FR-2`

| 情形 | 码 | 备注 |
|---|---|---|
| UI 需求 + 未豁免 + 缺锚点 | `prototype_anchor_missing`（不变） | gaps 逐卡点名 + 补写位置（既有文案） |
| UI 需求 + 豁免生效 + 无已登记原型 | **无码（放行）** | 本需求新增的唯一行为变化 |
| 读不到 requirement.md / front-matter 畸形 | 由更早的门处理（本次不新增） | 本函数只在 `doc` 已被调用方解析后运行 |
