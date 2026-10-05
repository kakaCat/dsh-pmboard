---
serves: FR-1, FR-2, FR-3
---

# REQ-261004154937-2ca3 设计 · 数据模型（成员集合与差值语义）

## 快照的形状变化（serves: FR-1）

| 字段 | 改前 | 改后 | 必填 | 兼容 |
|---|---|---|---|---|
| `totals` | 本窗口会话四桶 | **Σ 可得成员四桶** | 是 | 字段名与类型不变；**语义变大** |
| `sessionId` / `seq` / `at` / `source` | 既有 | 不变 | 既有规则 | 不变 |
| `scope` | — | `'self' \| 'self+descendants'` | 否（缺席 = 旧行为） | 新字段，旧消费方忽略 |
| `members[]` | — | 逐成员 `{sessionId, depth, seq?, totals}` | 否 | 新字段；**含 `depth:0` 的自身** |
| `degradedMembers[]` | — | 未参与合计的成员 id | 否 | 新字段；**不进 totals**（缺失 ≠ 0） |
| `degradedReason` | — | 枚举：`descendants-unavailable` / `cold-read-budget` / `legacy-snapshot` | 否 | 新字段 |

**恒等式（要有单测）**：`totals === Σ members[].totals`；`degradedMembers ∩ members = ∅`。

## 成员集合的构造（serves: FR-1）

```
M = { self } ∪ closure(parentSession)
closure(sid) = { e | e.parentSession ∈ ({sid} ∪ closure(sid)) }   // 传递，含多层
depth(e) = e.delegationDepth ?? (父 depth + 1)                     // header 缺失时按父推
```

- 数据源：`sessionPersistence.list()` 的 `header`（`id` / `parentSession` / `origin` / `delegationDepth` / `createdAt`）；
- 只收 `parentSession` 链上的会话；`origin` 不是判据（一个 fork 出来的窗口也带 `parentSession`，但它不是子代理——**判据是 `delegationDepth ≥ 1` 或 `origin === 'subagent'`**，二者取或，避免把 fork 窗口算成子代理）；
- 集合按 `sessionId` 去重；顺序无关。

## 差值语义（唯一实现，纯函数）（serves: FR-2）

| 成员相对关系 | 贡献 | 边界示例 |
|---|---|---|
| `m ∈ M1 ∩ M2` 且两侧 `seq` 都可比 | `t2[m] − t1[m]` | 常规 |
| `m ∈ M2 \ M1` | `t2[m]` | 子代理在阶段中途新建 ⇒ 全额归本阶段 |
| `m ∈ M1 \ M2` | `0` | 消失成员的最后一段增量**不可归属**（如实留白） |
| `m` 任一侧 `seq` 缺失或不可比 | `0` + 该次差值标 degraded | 陈旧/残缺读数不参与相减 |
| 任一侧缺 `members` | 退化：`subBuckets(end.totals, start.totals)` + `legacy-snapshot` | 旧快照 |

**为什么逐成员而不是总数相减**（数学上的差别，值得写下来）：
`Σ_{M2} t2 − Σ_{M1} t1 = Σ_{M1∩M2}(t2−t1) + Σ_{new} t2 − Σ_{gone} t1`
——最后一项会把总数**拉低**，而 `subBuckets` 的逐桶截断又会把它变成 0。逐成员算把每一项都变成可解释的规则。

## 水位与可比性（serves: FR-2）

- 每个成员的 `seq` 来自 `cachedSnapshot().asOfSeq`（缓存行水位）或 live 投影的日志序号；
- **可比性判据**：同一成员两次读数都有 `seq` 且 `seq` 单调不减 → 可比；否则该成员本次不参与；
- 缓存可能陈旧（`asOfSeq` 落后于日志末条），但**不会错**（缓存自述 "possibly stale but never wrong"）——所以在两次快照之间若缓存没刷新，该成员的增量会在下一次刷新时**一次性体现**，这与「新成员全额计入」是同一种归集行为，已在 architecture 的已知偏差里写明。

## 缺失语义（serves: FR-3）

| 情形 | 数据侧 | 展示侧 |
|---|---|---|
| 某后代缓存未命中且冷读超限 | 进 `degradedMembers`，**不进 totals** | 数字只含可得成员；徽章 title 注明「含 N 个未取到的子会话」 |
| 两个 DSH 服务都不可得 | `scope='self'`、`degradedReason='descendants-unavailable'` | 数字 = 今天的行为（逐字相同），口径说明标「未聚合」 |
| 本窗口会话投影不可得 | `source='unavailable'`、空桶 | 既有「无快照」语义（不补 0） |

## 迁移与回滚（serves: FR-1, FR-3）

- **不回填**：已落台账的历史快照不动（保持旧口径）；由 FR-4 的时间分界文案交代。
- **读取兼容**：新字段全可选 ⇒ 旧读法（只读 `totals`）不受影响；新读法遇到旧快照走 `legacy-snapshot` 退化。
- **回滚**：`tokenTotals` 改回「只读本窗口会话」即可；新增字段留着不写也不影响任何消费方。
- **无 schema 变更**：快照是写进台账的 JSON 字段，但新增键是可选的，故不需要版本升级或数据迁移脚本。
