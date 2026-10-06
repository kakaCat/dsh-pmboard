# 数据模型设计（REQ-261006091755-1c9e）

> 每节标注 `serves: FR-x`。本次**零新增数据结构、零 schema 变更**——只**读**既有两类字段。
> 本文档的价值在于把「读哪些字段、缺省怎么解释」写死，避免实现时自造口径。

## 新增/修改的数据结构 `serves: FR-4`

**无新增、无修改。** 本次改动消费的全部是既有字段：

| 字段 | 所在 | 类型 | 本次怎么用 | 缺省语义 |
|---|---|---|---|---|
| `prototype_exempt` | `requirement.md` front-matter | `string` | 交给 `prototypeExemptOf` 判豁免理由是否非空 | 缺失 / 空串 → **未豁免** |
| `artifacts[].kind` | 台账 `RequirementRecord` | `'requirement' \| 'prototype' \| …` | 分辨「需求产物」与「原型产物」 | 缺失即该条不参与 |
| `artifacts[].confirmedAt` | 同上 | `number?` | `kind=requirement` 条目**有值**才算豁免生效（人已确认需求文档） | 缺省 → 未落章 → 豁免不生效 |
| `artifacts[].autoDiscovered` | 同上 | `boolean?` | `kind=prototype` 且**非** `true` 才算「已登记」 | 缺省（非 true）→ 视为已登记 |

**为什么逐字写清这四行**：本需求的整个判定就建立在这四条的**缺省语义**上——
缺省值搞错一个，门要么误放行要么误拒，而两种错都不会报错（只会静默改变判定）。

## 读侧判定组合表 `serves: FR-1, FR-2, FR-3`

| `prototype_exempt` | requirement 产物 `confirmedAt` | 已登记 prototype 条数 | 锚点维行为 |
|---|---|---|---|
| 缺失 / 空 | — | 任意 | 照旧运行（未豁免） |
| 有理由 | 无值 | 任意 | 照旧运行（**未落章 = 不能自己豁免自己**） |
| 有理由 | 有值 | `0` | **整维跳过**（本需求的目标行为） |
| 有理由 | 有值 | `≥1` | 照旧运行（交了就要合格，FR-3） |

## 是否改表 / 迁移 / 回滚 `serves: FR-1`

| 问题 | 结论 |
|---|---|
| 改 SQLite schema / `record.json` 结构？ | **否**。零新增字段、零迁移脚本 |
| 改 HTTP 协议 / 载荷形状？ | **否**（新分支只返回 `undefined`，不产生新载荷） |
| 需要数据回填？ | **否**。已有豁免需求（如 `REQ-261005213603-eaed`）无需任何补偿写 |
| 需要灰度 / 开关？ | **否**。行为变化只作用于「豁免生效 ∧ 无原型产物」这一类需求，最坏情况退回今天 |
| 回滚路径 | 删除 2 行前置 + 2 个 import 即完全回滚；**无残留**（纯读判定，不写盘） |
| 存量豁免需求的行为 | 从「被拒」变为「放行」——这正是需求要的；其历史文档不追改（见 `requirement.md` 边界） |

## 与既有纪律的一致性 `serves: FR-4`

- **缺失 ≠ 0**：`artifacts` 为空、`prototype_exempt` 缺失、`confirmedAt` 缺省都按各自语义解释，不补默认值、不写回台账。
- **判据单点**：豁免只由 `prototypeExemptOf` 回答、有没有原型只由 `registeredPrototypesOf` 回答；本设计**不新增**任何字段级判定。
- **不读磁盘判事实**：目录里有没有 html 不参与判定（磁盘是"可能被人改"的现场，产物簿才是登记事实）。

## 关键决策与取舍 `serves: FR-1`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 「有没有原型」的取数 | 看 `prototypes/` 目录里有没有 html | 看 `registeredPrototypesOf(req)` | 目录可能只有没人填的骨架（自动发现会補登成 `autoDiscovered`）——那不算"交了" |
| 豁免生效的取数 | 自己读 front-matter 字符串 | `prototypeExemptOf`（含落章条件） | 判据单点；且"未落章"这一条是防止 agent 自己豁免自己 |
| INDEX 解析结果 | `authoritativePrototypePath(...) === undefined` 当"无原型" | 完全不参与 | 解析失败 ≠ 没有原型；否则新增一条静默放行面 |

## 技术方案与亮点 `serves: FR-1`

- **零存储改动的能力修正**：整个修复不改一个字段、不写一次盘，只把已有判定的**缺省语义**接对了一处（可核验指向：`tests/plan-prototype-anchor-gate.test.ts` 的四组合断言）。
