---
serves: FR-1, FR-2, FR-3, FR-4
---

# REQ-261004154937-2ca3 设计 · 接口与数据契约

## 端口：`SessionProbe.tokenTotals` 语义扩展（serves: FR-1, FR-3）

```ts
// src/application/ports.ts（既有端口，签名不变、语义扩大）
tokenTotals(windowKey: string): TokenSnapshot
// 改前：该窗口会话的累计用量
// 改后：该窗口会话 + 其全部后代子代理会话的累计用量之和
```

**为什么保持签名不变**：调用方（`token-usage.ts` 的写时快照、`AdvanceChain`、`MoveTask`、`ConfirmArtifact` 等十余处）不需要知道自己拿到了血缘聚合——语义在同一口子后面演进，是**唯一读取口**这条纪律的红利。

**新增端口方法（供查询血缘，可选使用）**：

```ts
/** 该窗口会话的后代子代理会话（按 parentSession 传递闭包；不含自身）。缺失服务 → undefined。 */
descendantSessions(windowKey: string): readonly SessionLineageEntry[] | undefined

interface SessionLineageEntry {
  readonly sessionId: string
  readonly depth: number          // delegationDepth：1 = 直接子代理
  readonly parentSessionId: string
}
```

## 数据契约：`TokenSnapshot` 扩展（serves: FR-1, FR-2, FR-3）

```ts
interface TokenSnapshot {
  sessionId?: string
  seq?: number
  at: number
  totals: TokenBuckets
  source: 'projection' | 'unavailable'

  // ── 本需求新增（全部可选：旧快照没有它们，消费方必须容忍缺席） ──
  /** 口径：'self' = 只算了本窗口会话（旧行为/降级）；'self+descendants' = 本次聚合 */ 
  scope?: 'self' | 'self+descendants'
  /** 参与本次合计的成员及其水位（顺序无关；用于逐成员差值） */ 
  members?: ReadonlyArray<{ sessionId: string; depth: number; seq?: number; totals: TokenBuckets }>
  /** 取不到用量而**未参与合计**的成员 id（缺失 ≠ 0：它们不进 totals，只进这里） */ 
  degradedMembers?: readonly string[]
  /** 降级原因（服务缺失 / 冷读超限 / 旧快照无 members） */ 
  degradedReason?: 'descendants-unavailable' | 'cold-read-budget' | 'legacy-snapshot'
}
```

**约束**：
- `members` **不含**降级成员；`totals === Σ members[].totals`（含自身那条，`depth: 0`）——这条恒等式要有单测；
- 成员顺序不保证稳定（不同枚举顺序不得影响差值）⇒ 差值按 `sessionId` 索引，不按下标；
- `seq` 用于判「同一成员两次读数是否可比」；缺失时按「不可比」处理（该成员不参与差值并标 degraded）。

## 差值函数契约：`deltaSnapshots`（serves: FR-2）

```ts
/** 相邻两次快照的消耗差值（纯函数；规则见 architecture.md「归属规则」表）。 */
function deltaSnapshots(start: TokenSnapshot, end: TokenSnapshot): TokenBuckets
```

| 输入情形 | 输出 |
|---|---|
| 两侧都有 `members` | 逐成员按表计算（同名相减 / 新成员全额 / 消失记 0） |
| 任一侧缺 `members`（旧快照） | 退化为 `subBuckets(end.totals, start.totals)`，调用方按 `degradedReason='legacy-snapshot'` 呈现 |
| 任一侧 `source='unavailable'` | 返回空桶（既有语义：缺失不猜） |

**与既有 `subBuckets` 的关系**：`subBuckets` 保留（逐桶相减 + 负值截断），但**不再作为跨快照差值的主路径**；它仍在「同一快照内四桶合并」等场景使用。

## 服务接入契约（serves: FR-1）

**必须走声明式注入**（沿用本仓既有模式，见 `src/index.ts` 的 `sessionProjections` / `agentTeams` 处）：

```ts
;(ctx as unknown as { inject?: (svc: string[], cb: (c: any) => void) => void }).inject?.(
  ['sessionPersistence', 'sessionProjectionCache'],
  (c) => { persistenceSvc = c?.sessionPersistence; projectionCacheSvc = c?.sessionProjectionCache }
)
```

**红线**：绝不直接读 `ctx.sessionPersistence` 属性——未声明 `inject` 的属性访问会抛（本仓踩过，注释里写着）。服务缺失时端口方法返回 `undefined`，由适配器降级为「只算本窗口会话 + `degradedReason='descendants-unavailable'`」。

## 错误与降级语义（serves: FR-3）

| 情形 | `source` | `scope` | `degradedReason` | 数字行为 |
|---|---|---|---|---|
| 全部成员取到 | `projection` | `self+descendants` | 无 | 真实总量 |
| 部分后代取不到 | `projection` | `self+descendants` | `cold-read-budget` | 只含可得成员（**不补 0**） |
| 两个服务都不可得 | `projection` | `self` | `descendants-unavailable` | 与今天逐字相同 |
| 本窗口会话投影都拿不到 | `unavailable` | 缺席 | 缺席 | 空桶（既有语义） |
| 旧快照参与差值 | 不变 | 不变 | `legacy-snapshot`（差值侧标注） | 总数相减 |

## 展示层契约（serves: FR-4）

- 详情页 Token tab 与卡面徽章的 `title` 文案加「含子代理」；口径不完整时加「（含 N 个未取到的子会话）」。
- 起链预算闸的读数**不变**：在 Token tab 的口径说明里写明「展示含子代理 / 预算闸不含」。
- 历史分界：Token tab 注明「本口径上线前的历史数字不含子代理」。
