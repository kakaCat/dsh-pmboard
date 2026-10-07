---
requirement_refs: [FR-2, FR-4, FR-5, FR-6]
---

# 数据模型（REQ-261007125552-32cb）

## 变更总览 `serves: FR-4, FR-5, FR-6`

**无台账迁移**：不改任何已落库记录的字段语义；新增键全部为可选，旧记录缺省语义不变。改动集中在三处：PlanTask 一个可选字段、LIMITS 两个常量、提交/落库返回体一个字段。

## PlanTask 新增字段 `serves: FR-4`

```typescript
// src/shared/protocol.ts · PlanTask
/** 粒度豁免理由（REQ-261007125552-32cb FR-4）：一卡多接口确属合理时必填理由；
 *  非空才生效；snake 为主、camel（granularityExempt）兼容——与 skipIntegrationReason 同模式。 */
granularity_exempt?: string
```

| 属性 | 取值 |
|---|---|
| 类型 | `string`，trim 后 ≤300 字符（`normalizeText` 同款截断） |
| 缺省 | `undefined` = 未豁免（不冒充空串） |
| 透传 | `normalizePlanTasks` 白名单搬运 + 去空（≤300 截断）；门禁从**提交入参 rawTasks**（含落库前 `plan.tasks`）读取，**不透传进 PlanTaskDraft / TaskRecord** |
| 落库 | 不进 TaskRecord 新列——豁免语义只在提交/落库判定那一刻生效；理由进返回体 `granularity_warnings` 留痕（避免台账 schema 变更） |

**为什么不落库**：豁免是「提交时人/agent 的声明」，落库后卡的执行不再依赖它；落库反而引入「事后改豁免」的语义问题。留痕走提交回执 + 需求评论（现有留痕通道）。

## LIMITS 新增常量 `serves: FR-4, FR-5`

```typescript
// src/domain/limits.ts · LIMITS
/** 单卡接口声明数上限（FR-4）：>1 即粗卡信号。为什么是 1：一接口一卡是本需求的粒度目标本身。 */
maxInterfacesPerCard: 1,
/** 单卡文件面软上限（FR-5）：超过进 granularity_warnings（不拒）。
 *  ⚠️ 5 是待标定的假设值（与 roundDetailUnits=16 同口径，返回体如实标注）。 */
footprintFilesSoftMax: 5,
```

## 返回体新增字段 `serves: FR-2, FR-5`

```typescript
// reqboard_submit(kind=plan) / reqboard_decompose 返回体
granularity_warnings?: string[]  // 软门点名：files 超阈值 / UI 卡多锚点 / 对照表降级原因 / 豁免生效理由
```

- 仅在非空时给键（未采集不冒充空数组，与 prototypeRefs 透传同款纪律）；
- 硬门（FR-2 缺对照 / FR-4 多接口无豁免）走 `reject`，不进本字段。

## 对照表与清单表的文档结构 `serves: FR-2`

契约明细（表头判据、行语义）见 [interfaces.md](interfaces.md) §文档格式契约一/三。本节省略表样，只记解析口径：

- 解析复用 `parseDocument().tables`（content-gates.ts 既有词法），不新写表格解析器；
- 左列条目 id 的提取复用 `collectIds`（IF-N 形态）+ 组件名纯文本兜底；
- 右列 key 的提取复用 `planKeysIn`（计划键的唯一词法——plan-doc-table.ts 同款复用理由）。

## 生效口径与存量兼容 `serves: FR-6`

| 门 | 生效口径 | 存量表现 |
|---|---|---|
| FR-1 清单节门 | `docQualityRulesApply(req.createdAt)`（2026-10-06 12:00 UTC 后立项） | 老需求 design 提交不判清单节 |
| FR-2 对照表门 | 同上 + 设计无清单节时降级 warn | 旧形态计划（无对照表）可落库、带提示 |
| FR-4 接口数门 | 同上 | 老需求提交计划不判接口数 |
| FR-5 软门 | 全量（不拒，无锁死风险） | 只多一条警告，行为不变 |

`docQualityRulesApply` 判定读数不可得（无 createdAt）时不判——与 rtm-health / sidesGateFailure 同口径。

## 配置项 `serves: FR-5`

不新增插件配置。阈值只读 `LIMITS`（单一源）；门禁强度不做 per-requirement 开关（与「豁免一律显式声明理由」的纪律一致：要例外就写在卡上，不写进配置里藏起来）。
