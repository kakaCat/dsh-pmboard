# 数据模型（REQ-261006201649-cc89）

> refactor 数据层篇。**结论先行**：本需求不改任何实体形状、不改 schema、不改协议必填字段。
> 唯一的数据面改动是**两个加性可选键**（`prototypeMeta.geometry[].shot` / `shotSha256`），
> 以及**错误码枚举的两个新值**。

## 1. 是否改表 / 改 schema `serves: FR-4, FR-6`

| 问题 | 答案 | 依据 |
|---|---|---|
| 新增数据库表 / 列？ | **否** | 台账是 JSON 分片（`~/.dsh/reqboard/requirements/<REQ>/*.json`），无关系 schema |
| 改既有 JSON 字段的类型 / 必填性？ | **否** | `StageArtifact.prototypeMeta.geometry[]` 只**新增两个加性可选键** |
| 需要迁移脚本（回填 / 改写旧分片）？ | **否** | 旧分片缺键 = **未采集**（`unverified`），不做补写 |
| 需要改 `schemaVersion`？ | **否** | 加性可选键不构成 schema 变更 |
| 需要改协议必填字段？ | **否** | `VerificationItemSource` / `CompareInputs` 形状不变 |

## 2. 唯一的数据面改动：几何量证据两键 `serves: FR-4`

`StageArtifact.prototypeMeta.geometry[]` 的元素（`ProtoObservation`）既有六字段一字不动：

| 字段 | 类型 | 约束 | 变化 |
|---|---|---|---|
| `name` | `string` | 块内唯一 | 不变 |
| `value` | `number` | 有限数（实测值，不是阈值） | 不变 |
| `unit` | `'px' \| 'count' \| 'ratio'` | 闭值域 | 不变 |
| `at.width` | `number` | 正数 | 不变 |
| `at.state` | `'inflight' \| 'terminal'` | 闭值域 | 不变 |
| `source` | `'prototype' \| 'human'`（可选） | 缺省 `prototype` | 不变 |
| **`shot`** | `string`（可选） | **工作区相对**路径；绝对路径 / `..` / 伪路径 → `invalid` | **新增（加性）** |
| **`shotSha256`** | `string`（可选） | 64 位十六进制（大小写都收，比较时统一转小写） | **新增（加性）** |

**解析层与判定层分层**（刻意的）：

- `parsePrototypeMetadata` 只做**形态归一**（非字符串 → 记一条 `violations`；空串 → 视为未给）；
- **能不能复核**由 `observationEvidenceOf` 判定（文件在不在 / 摘要对不对）——
  那是需要 IO 的一问，故走注入端口 `PrototypeEvidencePort { shotExists, sha256Of }`。

## 3. 判定表（实现必须逐行对应） `serves: FR-4`

| `shot` | `shotSha256` | 文件存在 | 摘要匹配 | 结论 |
|---|---|---|---|---|
| 缺 | 缺 | — | — | `unverified`（**放行**，存量口径） |
| 有 | 缺 | — | — | `invalid`（缺 sha256） |
| 缺 | 有 | — | — | `invalid`（缺截图路径） |
| 有 | 有 | 否 | — | `invalid`（点名路径） |
| 有 | 有 | 是 | 否 | `invalid`（给期望与实际前 12 位） |
| 有 | 有 | 是 | 是 | `collected` |
| 有 | 有 | — | —（形态非法） | `invalid`（非 64 位十六进制） |
| 端口未装配 | — | — | — | `unverified`（不判，不把"读不到"当"错了"） |

## 4. 错误码枚举：两个新值 `serves: FR-6`

`GateFailure['code']` 联合（`src/application/internal/artifact-gates.ts`）新增两值：

| 码 | 触发条件 | `kind` | HTTP | 会话侧传输码 | 中文类别名 |
|---|---|---|---|---|---|
| `prototype_placeholder` | 权威原型命中占位标记**或**与模板行重合率 > 0.90 | `prototype` | 400 | `REQBOARD_PROTOTYPE_PLACEHOLDER` | 原型仍是空骨架 |
| `prototype_geometry_unverified` | 任一观测量 `observationEvidenceOf` 返回 `invalid` | `prototype` | 400 | `REQBOARD_PROTOTYPE_GEOMETRY_UNVERIFIED` | 几何量读数无法复核 |

**枚举是加性的**：既有三码（`prototype_missing` / `prototype_version_conflict` /
`prototype_anchor_missing`）语义与值一字未改。新码必须三处齐（联合 / HTTP 状态表 / 客户端类别名 + 传输码表）。

## 5. 台账零迁移 `serves: FR-4`

- 旧分片缺 `shot` / `shotSha256` → 读出 `undefined` → 判为 `unverified` → **放行**；
- **不补齐、不改写、无迁移脚本**（与 §9「兼容与迁移口径（零迁移）」同源）；
- 66 个既有分片、15 条有原型的历史需求：**一个字节都不动**。

## 6. 验收单侧的字段变化 `serves: FR-3`

`CompareInputs.prototypeCompare` 加**一个可选字段** `degradedNote?: string`（仅用于在项上如实标注
"权威路径取不到、本项路径取自台账"）。`ResultBinding` 的 ref 键（`prototype:<path>`）**一字未动**——
改的是**组装条件**，不是**绑定键**。

`AcceptanceSheetSpec` 的 `prototypeCompare` 入参同步加该可选字段，其余形状不变。
