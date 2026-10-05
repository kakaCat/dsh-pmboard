---
req: REQ-261002175818-80a8
doc: data-model
serves: FR-1, FR-2, FR-3, FR-4, FR-7, FR-8, FR-9
---

# 数据模型设计（REQ-261002175818-80a8）

> **TL;DR**：新增一个**全链可缺省**的 `CardFootprint`（三个正整数量），挂在 `PlanTask` 与 `TaskRecord` 上；
> 新增三个**只读投影类型**（判定结果 / 超容量条目 / 余量参考）。**不 bump `REQBOARD_SCHEMA_VERSION`（维持 9）**——
> 「未声明」是正常态，不是错误，更不是 0。

## 新增/修改的数据结构 `serves: FR-1, FR-2`

### CardFootprint（新增） `serves: FR-1, FR-2`

卡片体量声明。三个量都是**可数的确定量**，不含主观打分——这是它能进机械门禁的前提。

```typescript
/** 卡片体量声明（REQ-261002175818-80a8 FR-1）：缺失 = 未声明（不冒充 0）。 */
export interface CardFootprint {
  /** 本次要改/新建的文件数（正整数；不得小于 implementation 里点到的路径数 → FR-2） */
  files: number
  /** 验收锚点数：可执行断言条数（正整数） */
  anchors: number
  /** 实施描述与目标改动量合计字符数（正整数，沿用本仓字符口径） */
  chars: number
}
```

**约束**：三字段全部必填（对象在场时）；值为**正整数**（`Number.isInteger(v) && v > 0`）。
未知键、缺字段、非整数、0 或负数 → 抛 `REQBOARD_BAD_FOOTPRINT`（FR-2）。
缺省（`undefined` / `null`）→ 返回 `undefined`，**不是错误**（与 `normalizeRequirementRefs` 的存量语义一致）。

### PlanTask.footprint（新增可选字段） `serves: FR-1, FR-7`

```typescript
export interface PlanTask {
  // …既有字段不动…
  /** 体量声明（FR-1）。缺失 = 未声明：不判定、不报错、不冒充 0。 */
  footprint?: CardFootprint
}
```

### TaskRecord.footprint（新增可选字段） `serves: FR-7`

```typescript
export interface TaskRecord {
  // …既有字段不动…
  /** 体量声明（FR-7）：与计划层逐字一致；旧台账无此字段 = 未声明。 */
  footprint?: CardFootprint
}
```

### 判定结果（新增，纯计算，不落库） `serves: FR-3`

```typescript
/** 体量判定结果：算出来的，不写台账（避免"算出来的量"与"声明的量"两处真相）。 */
export interface FootprintJudgement {
  /** 合成细节量：files×1 + anchors×0.5 + chars/2000（权重见 LIMITS，单一源） */
  detailUnits: number
  /** 当轮容量（来自 LIMITS 或插件配置覆盖） */
  capacity: number
  /** 是否超容量。true 只意味着"要标红"，不意味着"要拒绝"（FR-4 软门禁） */
  over: boolean
  /** 建议批数 = ceil(detailUnits / capacity)；仅 over 时给出且 ≥2，否则 undefined */
  suggestedBatches?: number
}
```

## 工具返回体新增字段 `serves: FR-4`

### OverCapacityItem（新增） `serves: FR-4`

```typescript
/** 一张超容量卡：给人看的是 key + 批数，给机器看的是可核算的数值。 */
export interface OverCapacityItem {
  /** 计划内引用键（如 t1），与批准文本里的 key 同一套 */
  key: string
  /** 卡片标题（批准人不必回查计划） */
  title: string
  /** 合成细节量（保留一位小数，供人核对） */
  detailUnits: number
  /** 当轮容量 */
  capacity: number
  /** 建议批数（≥2） */
  suggestedBatches: number
  /** 一句话修复指引（切分边界建议：按目录 / 按接口） */
  hint: string
}
```

### CapacityNote（新增） `serves: FR-3, FR-4`

```typescript
/** 判据自述：这是"我们的常量"，不是运行时读数——防止下一个人把余量参考当判据。 */
export interface CapacityNote {
  /** constant=内置常量；config=插件配置覆盖 */
  source: 'constant' | 'config'
  /** 本次生效的容量值 */
  value: number
  /** 是否经过真实数据标定。**本次恒为 false**（校准闭环另立需求） */
  calibrated: boolean
}
```

## 端口新增类型：余量参考 `serves: FR-8`

```typescript
/**
 * 当轮上下文压力参考（FR-8）。**只读展示，非门禁判据**——DSH token-meter 自述这三个字段
 * 刻意非原子（last-wins），且 "not a gating input"。不可得时 source='unavailable' 且**字段缺席**，
 * 不用 0 冒充（同 TokenSnapshot 的缺失语义）。
 */
export interface ContextPressureSnapshot {
  at: number
  contextWindow?: number
  pressureTokens?: number
  projectedTokens?: number
  source: 'projection' | 'unavailable'
}
```

## 常量新增（单一源，INV-2） `serves: FR-3`

`src/domain/limits.ts` 是「具名数值上限」的唯一去处（该文件自述：同一条上限只有一处定义）。
本需求不新建常量目录，**把容量与权重加进 `LIMITS`**：

```typescript
export const LIMITS = {
  // …既有条目不动…
  /**
   * 一轮的细节容量（合成单位 DU）——REQ-261002175818-80a8 FR-3。
   * 缺省 16：**这是待标定的假设值**（calibrated=false），标定闭环另立需求。
   */
  roundDetailUnits: 16,
  /** 合成权重：改一个文件 ≈ 1 DU（打开、读懂、改对）。 */
  detailWeightPerFile: 1,
  /** 合成权重：一条验收锚点 ≈ 0.5 DU（要跑、要看）。 */
  detailWeightPerAnchor: 0.5,
  /** 合成权重：每 2000 字符实施描述 ≈ 1 DU（要读完并保持）。 */
  detailCharsPerUnit: 2000,
  /** 卡片体量三量的单值上限（防手滑写 999999 把判定撑爆；超上限 = 形态非法）。 */
  footprintValueMax: 100_000,
} as const
```

## 错误码与门禁码新增 `serves: FR-2, FR-5`

| 码 | 位置 | 触发 | 与需求文档的关系 |
|---|---|---|---|
| `REQBOARD_BAD_FOOTPRINT` | `src/domain/task/Footprint.ts`（领域错误，跨包可读） | footprint 形状非法（缺字段/非正整数/未知键），或 `files` **小于** implementation 点到的路径计数 | **对 requirement.md FR-2 的细化**：需求写的是泛化的 `REQBOARD_INVALID_INPUT`，本设计改用专用码，理由见下 |
| `plan_overcapacity_marker_missing` | `GateFailure.code` 联合（`src/application/internal/artifact-gates.ts`） | 计划文档里超容量卡缺少「⚠️超容量(建议N批)」标记 | 需求 FR-5 的机器落点 |

**为什么 FR-2 用专用码而不是泛化的 `invalid_input`**：本仓对「计划任务表里某一项的值非法」已有先例——
`requirement_refs` 用的是 `REQBOARD_BAD_REQUIREMENT_REF`（`src/domain/task/RequirementRefs.ts:22`），
理由写在那个模块的模块注释里：**"哪张卡写错了什么"必须一眼可见，否则人只能猜**。
泛化的 `invalid_input` 会让「声明缩水」淹没在其他入参错误里，且无法被测试精确断言。

> ⚠️ **这是一条与已确认需求文档的字面偏差**（FR-2 / A2 里写的是 `REQBOARD_INVALID_INPUT`）。
> 意图未变（拒绝 + 给实际计数与修复指引）；本设计确认门即为此偏差的裁决点。

## 兼容性分析 `serves: FR-9`

| 变更项 | 旧版本行为 | 新版本行为 | 迁移方案 |
|---|---|---|---|
| `PlanTask.footprint` | 无该字段 | 可选；缺失 = 未声明 | **无迁移**：缺省不判定、不报错 |
| `TaskRecord.footprint` | 无该字段 | 可选；旧台账读出为 `undefined` | **无回填**：任务树回显「未声明」 |
| `REQBOARD_SCHEMA_VERSION` | 9 | **9（不变）** | 依据本仓先例：字段「全部可缺省：旧台账读出即旧行为，不 bump schemaVersion」 |
| `LIMITS` 新增常量 | 无 | 新增 5 条具名常量 | 纯新增，无消费方变动 |
| 工具返回体新增键 | 无 | `overCapacity` / `capacityNote` | **必须同步声明 output schema**：该 schema 是 `additionalProperties:false`，未声明键会被绑定层拒收（本仓已有三次踩坑记录）；`tests/output-contract.test.ts` 的静态扫描会兜底 |

## 回滚路径 `serves: FR-9`

停止读取 `footprint` 的判定路径即回到改造前行为：

1. 判定是**纯计算**、不落库任何"算出来的量"——回滚不涉及数据清理；
2. 台账里多出的 `footprint` 是可选 JSON 字段，旧版本读取容错、不阻塞；
3. 新增常量与错误码无副作用（不被引用即无行为）；
4. 输出 schema 的键**必须与新代码同批回滚**——先回滚返回体再回滚 schema 会产生 `invalid output`
   （绑定层拒收未声明键的反向情形），故回滚粒度是"整个提交"。
