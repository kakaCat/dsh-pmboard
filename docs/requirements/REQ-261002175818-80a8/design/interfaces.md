---
req: REQ-261002175818-80a8
doc: interfaces
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9
---

# 接口设计（REQ-261002175818-80a8）

> **TL;DR**：四处接口变更——**工具入参**（`tasks[].footprint`）、**工具出参**（`overCapacity` / `capacityNote`）、
> **端口**（`contextPressure`）、**领域纯函数**（`Footprint.ts`）。两处**硬约束**：
> 工具 schema 是 `additionalProperties:false`（入参与出参都必须声明），`shared → domain` 的纯函数调用是本仓既有方向。
> 唯一新错误码 `REQBOARD_BAD_FOOTPRINT` 是对 requirement.md FR-2 的**细化**（理由见文末偏差节）。

## 新增/修改的工具接口 `serves: FR-1, FR-4, FR-5`

### `reqboard_submit`（kind=plan）入参 `serves: FR-1, FR-2`

`tasks.items` 新增可选嵌套对象。**必须加进 schema**：该 items 是 `additionalProperties:false`
（`src/tools/SubmitTool/SubmitTool.ts:60`），未声明键在**绑定层就被拒**——这是 `requirement_refs` 踩过的同一条坑。

```typescript
// tasks.items.properties 新增
footprint: {
  type: 'object',
  additionalProperties: false,
  properties: {
    files:   { type: 'number', description: '要改/新建的文件数；不得小于 implementation 里点到的路径数' },
    anchors: { type: 'number', description: '验收锚点数（可执行断言条数）' },
    chars:   { type: 'number', description: '实施描述与目标改动量合计字符数' },
  },
}
// 注：本仓 schema 不用 required，必填性由用例侧 normalizeFootprint 校验（与既有字段同一惯例）
```

### `reqboard_submit`（kind=plan）出参 `serves: FR-4`

```typescript
{
  // …既有键不动（success / requirement_id / plan_status / orphan_clauses / task_count / tasks / auto_confirm / note）…
  /** 超容量卡清单；无 = 空数组（不是缺键，避免调用方判空分支两份写法） */
  overCapacity: OverCapacityItem[]
  /** 判据自述：这是我们的常量，不是运行时读数（FR-3） */
  capacityNote: CapacityNote
}
// tasks[] 每一项追加回显：footprint?: CardFootprint（未声明 = 缺键）
```

**`OverCapacityItem` / `CapacityNote` 字段定义见 [data-model.md](./data-model.md)**（本文不重复）。

**错误语义**（`reject(message, code)`，与既有门禁同一套；全部在 mutate 之前，拒绝零副作用）：

| 触发 | 码 | 消息必须含 |
|---|---|---|
| footprint 形状非法（缺字段 / 非正整数 / 未知键 / 超 `footprintValueMax`）；或 `files` 小于 implementation 点到的路径计数 | `REQBOARD_BAD_FOOTPRINT` | 卡 key、非法原因或**实际路径计数**、修复指引 |
| 超容量但计划文档缺标记（或标记批数与判定不符） | `plan_overcapacity_marker_missing` | `gaps` 逐卡列出 key 与**期望的 N** |
| 超容量本身 | **不报错** | `success:true` + `overCapacity` 非空 |

### `reqboard_task_tree` `serves: FR-8, FR-9`

**顶层新增**余量参考（**不是**每卡字段——余量是"窗口/当轮"的量，不是卡的属性）：

```typescript
{
  // …既有 parents[] 不动…
  /** 当轮上下文余量参考（FR-8）。不可得 = 缺键（不猜 0、不报错） */
  contextPressure?: {
    source: 'projection' | 'unavailable'
    contextWindow?: number
    projectedTokens?: number
    /** 剩余量 = contextWindow − projectedTokens；两者任一缺席则本字段缺席 */
    remainingTokens?: number
    /** 固定文案：「参考值，非门禁判据」——FR-8 要求与数值同一条展示内出现 */
    note: string
  }
}
```

**每卡新增**体量与声明状态（`nodeSchema` 与 `TaskTreeNodeView`、`nodeOf` **三处必须同改**，
漏第三处会被绑定层拒收）：

```typescript
// nodeSchema / TaskTreeNodeView 新增
footprint?: CardFootprint                 // 未声明 = 缺键
footprintState: 'declared' | 'undeclared' // 恒在场，派生字段（对应需求里的「未声明」回显）
```

## 新增的领域接口 `serves: FR-2, FR-3`

`src/domain/task/Footprint.ts`——**零 import 外层**（与 `src/domain/task/RequirementRefs.ts` 同规格，
`tests/layer-boundary.test.ts` 兜底）。同一份算法供协议层、用例层、弹框层**共用**，杜绝两份真相。

```typescript
/** 领域错误码（跨包可读：消息末尾也附一份，纯文本通道能识别） */
export const FOOTPRINT_ERROR = 'REQBOARD_BAD_FOOTPRINT'
export class FootprintError extends Error { readonly code: string }

/** 单值非法原因（undefined = 合法）。给"逐个点名"用，不抛错。 */
export function footprintInvalidReason(raw: unknown): string | undefined

/**
 * 规整体量声明：undefined / null ⇒ undefined（**未声明是正常态，不是错误**，对齐存量语义）；
 * 形状非法 ⇒ 抛 FootprintError。
 */
export function normalizeFootprint(raw: unknown, where?: string): CardFootprint | undefined

/** 声明下限：implementation 正文里 (src|tests|docs|scripts)/… 的去重路径计数（纯正则，无 IO）。 */
export function declaredFilesFloorFrom(implementation: string | undefined): number

/** 声明不得小于证据（FR-2）：违反 ⇒ 抛 FootprintError；未声明 ⇒ 直接返回（不判定）。 */
export function assertFootprintFloor(
  fp: CardFootprint | undefined,
  implementation: string | undefined,
  where?: string,
): void

/** 判定（纯计算，不落库）：detailUnits / capacity / over / suggestedBatches。 */
export function judgeFootprint(fp: CardFootprint, capacity: number): FootprintJudgement

/** 建议批数 = ceil(detailUnits / capacity)，下界 2（仅供 over 时使用）。 */
export function suggestedBatchesOf(detailUnits: number, capacity: number): number

/** 批准弹框/评论用的超容量摘要；**无超容量卡时返回 ''**（保证既有文本逐字节不变）。 */
export function overCapacitySummary(
  tasks: readonly { key: string; title?: string; footprint?: CardFootprint }[],
  capacity: number,
): string
```

**调用点**（本仓既有方向：`shared` 可依赖 `domain` 纯函数，`normalizePlanTasks` 已这样用 `RequirementRefs`）：

```typescript
// src/shared/protocol.ts normalizePlanTasks 的白名单搬运处
const fp = normalizeFootprint(raw.footprint, where)
assertFootprintFloor(fp, raw.implementation, where)
out.push({ /* …既有键… */, ...(fp === undefined ? {} : { footprint: fp }) })
```

## 新增的端口接口 `serves: FR-8`

```typescript
// src/application/ports.ts  SessionProbe 新增（照 tokenTotals 的口径：不可得 → unavailable，不抛错、不阻断）
/**
 * 当轮上下文压力参考（FR-8）。**只读展示，非门禁判据**——DSH token-meter 自述这三个字段
 * 刻意非原子（last-wins）且 "not a billing or gating input"。禁止用旧值/记忆值冒充（同 R-013）。
 */
contextPressure(windowKey: string): ContextPressureSnapshot
```

```typescript
// src/adapters/SessionProbeAdapter.ts：实现照抄 tokenTotals 的 try/catch 三级降级
// agents.get(id).session → projections.stateOf(session, 'contextPressure') → readContextPressure(state)
// 纯解析 readContextPressure：缺任一字段 → 该字段缺席（不猜 0），整体形状不符 → source='unavailable'
```

**装配零改动**：`src/index.ts:421-427` 已把 `sessionProjections` 惰性 getter 注入适配器，新方法直接复用。
**唯一会被编译拦下的替身**：`tests/application/harness.ts` 的 `class FakeSession implements SessionProbe`
（其余 ~11 处测试用真适配器，自动获得新方法）。

## 配置项接口 `serves: FR-3, FR-5`

```typescript
// src/plugin-config.ts PluginConfig 新增
capacity?: {
  /** 一轮细节容量（DU）。缺省 16；非有限正数 → 回落常量（capacityNote.source='constant'） */
  roundDetailUnits?: number
  /**
   * 标记门禁强度（FR-5 的灰度/回退开关）。缺省 'enforce'。
   * 'warn' = 不拒绝提交，但**仍在返回体里响亮给出 gaps**（不静默——本仓反对"门禁静默失效"）。
   * 存在的理由：一旦标记校验误伤，人不必改代码即可回退；这也是"改造前行为"的一键回去路径。
   */
  markerGate?: 'enforce' | 'warn'
}

/** 解析容量（照 panelSettings 的写法）：返回生效值与来源，供 capacityNote 回显。 */
export function resolveRoundCapacity(config?: PluginConfig): { value: number; source: 'constant' | 'config' }
```

## HTTP 接口变更 `serves: FR-6`

### `POST /req/plan/approve` `serves: FR-6`

**响应体形状不变**（刻意不加无人消费的字段——避免"声明了没人用"的契约漂移）。
看板批准路径上**唯一能被人看见的文本载体是台账评论**，故变更落在评论：

```
在既有评论后追加一句（仅当存在超容量卡时）：
「；超容量 2 张：t3(建议8批)、t7(建议3批)——详见计划文档标记」
```

### 弹框文本（`reqboard_ask_confirm` target=plan）`serves: FR-6`

`src/application/use-cases/AskConfirm.ts` 的 `popupQuestion` 构造处（plan 分支）**追加**系统生成的清单。
那里已能拿到 `targetReq.plan.tasks`，**调用方无需改一行**：

```typescript
// 现状：plan 分支已有系统后缀（批准后将自动拆分…）
// 变更：在后缀里插入 overCapacitySummary(targetReq.plan.tasks, capacity)
// 无超容量卡 → 摘要为 '' → popupQuestion 逐字节等于改造前（既有测试不受影响）
```

**压缩纪律**：`LIMITS.popupQuestionMax = 220` 字符，摘要必须可压缩——
1 张卡写全（`t3（113 DU / 容量 16，建议 8 批）`），多张卡只写 `t3(建议8批)、t7(建议3批)…` 并指向返回体。

## 新增/变更的错误码 `serves: FR-2, FR-5`

| 码 | 层级 | 落点 | 客户端分类表 |
|---|---|---|---|
| `REQBOARD_BAD_FOOTPRINT` | 领域错误（大写下划线，同 `REQBOARD_BAD_REQUIREMENT_REF`） | `src/domain/task/Footprint.ts` | 建议在 `src/client/toolviews/shared.ts:149-159` 加一条人读标签 |
| `plan_overcapacity_marker_missing` | 门禁码（小写下划线，同 `design_orphan`） | `GateFailure.code` 联合（`src/application/internal/artifact-gates.ts`） | 同上 |

**不加**到 `src/domain/errors.ts` 的 `REQBOARD_ERROR_CODES`（那是 HTTP 错误码表；本需求两个码分别属领域错误与门禁码，
与 `REQBOARD_INVALID_INPUT` 同属工具层内联码那一层）。

## 迁移与兼容设计 `serves: FR-9`

### 数据回填与开关 `serves: FR-9`

| 项 | 结论 |
|---|---|
| 数据回填 | **无**。`footprint` 全链可缺省；旧计划/旧台账读出即旧行为（`REQBOARD_SCHEMA_VERSION` 维持 9） |
| 灰度开关 | `capacity.markerGate`（缺省 `'enforce'`；`'warn'` 只降级拒绝、不降级披露）+ `capacity.roundDetailUnits`（调大即减少标记面） |
| 触发面 | FR-5 的标记门禁**只对"已声明 footprint 且判定超容量"的卡**生效 → 旧计划（无声明）与轻量计划**永不触发**，无存量破窗 |

### 回滚路径 `serves: FR-9`

回滚粒度 = **整个提交**，四步顺序不可拆：

1. 停止读取 `footprint` 判定路径 → 回到改造前行为（判定纯计算、不落库，**无需数据清理**）；
2. 台账里多出的 `footprint` 是可选 JSON 字段，旧版本容错；
3. 返回体新键与 output schema **同批回滚**——只回滚一侧会产生 `invalid output`（绑定层拒收未声明键的反向情形）；
4. 片段与生成物**同批回滚**（`fragments/**.md` + `node scripts/inline-prompt-fragments.mjs` 的产物），
   否则 `tests/prompt-gates.test.ts` 门禁 6（源/产物同步）会红。

## 与 requirement.md 的字面偏差 `serves: FR-2`

| 项 | requirement.md（已确认） | 本设计 | 理由 |
|---|---|---|---|
| FR-2 的拒绝码 | `REQBOARD_INVALID_INPUT` | `REQBOARD_BAD_FOOTPRINT` | 本仓对「计划任务表里某一项的值非法」已有先例：`requirement_refs` 用 `REQBOARD_BAD_REQUIREMENT_REF`；泛化码会让「声明缩水」淹没在其他入参错误里，且**无法被测试精确断言**。意图未变：拒绝 + 给出实际计数与修复指引 |
| FR-8 在任务树上的落点 | 「任务树里显示当轮余量参考」（未指定层级） | **顶层字段**（非每卡字段） | 余量是窗口/当轮的量，不是卡的属性；放每卡会产生 20 份同一个数字 |

> 这两条偏差不改变任何已确认的意图与验收断言（A1–A7 全部保持可判），故不重提需求文档；
> 若人认为需回改需求文档，本设计确认门即是裁决点。
