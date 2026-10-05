---
req_id: REQ-261004065652-5c1c
serves: FR-1, FR-2, FR-3, FR-4, FR-9, FR-11
---

# 数据模型设计（REQ-261004065652-5c1c）

> 结论先行：**零迁移**。没有新增持久化结构、没有 schema 版本变更。
> 改动只有三处：① 一个**内存**结构扩字段；② 一个同步投影增三枚标量；
> ③ 一个既有字段的**值域**扩充（字段与类型都不动）。

## 新增/修改的数据结构 `serves: FR-3, FR-4, FR-11`

### DriverState 扩展（内存态，不落盘） `serves: FR-2, FR-3, FR-6`

**用途**：Dive 回合驱动器每 agent 一份的运行态。本次新增两个字段，
承载"**不等 I/O 的当拍判定**"——这正是本次事故里缺的那一环。

**定义**：
```typescript
/** 失败退避账（内存）：同一病因分开计数。 */
interface DriverFailure {
  reasonClass: string   // 复用 classifyTurnEnd 的 reasonClass，如 'error:AUTH'
  count: number         // 连续同因失败次数（原因类别变化即归零）
  nextAt: number        // 不早于该时刻才允许再起轮（毫秒时间戳）
}

/** 内存闭锁（内存）：存在即不起轮；清锁必须显式。 */
interface DriverLatch {
  reasonClass: string   // 'error:AUTH' / 'aborted:user' / 'budget-exceeded' / ...
  reason: string        // 人话原因（写台账用；≤200 字符）
  at: number            // 置锁时刻
}

interface DriverState {
  // …既有字段不动（agent / attempt / competingQueued / needsCheckpoint / requested / run / stopping）
  failure?: DriverFailure
  latch?: DriverLatch
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 | 约束 |
|---|---|---|---|---|
| `failure.reasonClass` | string | 是 | 病因类别 | 值域同 `classifyTurnEnd().reasonClass` |
| `failure.count` | number | 是 | 连续同因次数 | ≥1；类别变化归零 |
| `failure.nextAt` | number | 是 | 退避截止时刻 | 单调不减；由注入 `now()` 判定 |
| `latch.reasonClass` | string | 是 | 闭锁病因类别 | 同上 |
| `latch.reason` | string | 是 | 人话原因 | 写台账前截断到 200 字符 |
| `latch.at` | number | 是 | 置锁时刻 | 用于"闩过期"判定 |

**为什么不落盘**：落盘会让它退化成"第二个台账"，重新依赖 I/O 与一致性；
本字段的全部价值就是**与 I/O 无关**。跨重启的语义由台账 `driverHealth` 承担（重启后按 paused 读）。

### RequirementFacts 增 `tokenUsage` 投影 `serves: FR-4, FR-11`

**用途**：预算闸（FR-11）要在**同步缝**里读各需求的累计 token；今天 `peekFacts()` 不含它。

**定义**：
```typescript
interface RequirementFacts {
  // …既有字段不动
  tokenUsage?: {                    // 缺省 = 该需求从未跑过（不伪造成 0）
    uncachedInputTokens: number
    outputTokens: number
    cacheReadTokens: number
  }
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 | 约束 |
|---|---|---|---|---|
| `tokenUsage.uncachedInputTokens` | number | 是 | 台账 `tokenUsage.totals` 的非缓存输入 | ≥0 |
| `tokenUsage.outputTokens` | number | 是 | 输出 | ≥0 |
| `tokenUsage.cacheReadTokens` | number | 是 | 缓存读（预算闸主指标） | ≥0 |

**投影纪律**：只投影三枚标量，**不**把 `tokenUsage.byStage`（按阶段的对象）拉进同步口——
同 `advance` 只投影 `pausedReason` 的既有口径（同步口的载荷必须有界）。

### `dive.pausedReason` 值域扩充（字段不变） `serves: FR-1, FR-2, FR-9, FR-11`

**用途**：让人一眼看出"为什么停"以及"谁能恢复"。

| 新增值 | 谁写 | 含义 | 恢复路径 |
|---|---|---|---|
| `upstream-auth` | 驱动 | 上游鉴权/额度错误（不可重试） | 人（清全局闩） |
| `agent-error-loop` | 驱动 | 连续同因失败达阈值（熔断） | 人 / `requirement-moved` |
| `budget-exceeded` | 驱动 | 超 WIP 或 token 预算 | 自动（名额释放后自然恢复） |
| `engine-unreachable` | 实施链 | 子卡引擎不可达（环境前提） | 人（改口径或修环境） |
| `aborted:user` | 驱动 | 人主动中止 | 人 |
| `terminal-reconciled` | 启动对账 | 终态需求被归一 | 不恢复（终态） |

**兼容性**：`pausedReason` 是既有 `string` 字段，**只扩值域**——旧记录照常读、
旧的 `startsWith('round-limit')` 判据不受影响；渲染侧未知值回落原词（既有口径）。

## 新增/修改的持久化结构 `serves: FR-9`

**无。** 本次**不新增**任何落盘结构、不 bump `REQBOARD_SCHEMA_VERSION`。

- FR-9 的启动对账只**改写既有** `dive.activation` 并追加一条既有形状的 comment；
- 迁移留痕复用 `comments`（`createdBy.kind='system'` + `terminal-reconciled` 文案），不新增字段；
- 若将来需要"是否已对账过"的判据，用 `dive.activation==='disarmed'` 自身即可（幂等成立），
  不引入 `terminalReconciledAt`（避免为一次性迁移留永久字段）。

## 迁移与兼容 `serves: FR-4, FR-9, FR-11`

| 面 | 旧数据怎么办 | 能否回滚 |
|---|---|---|
| 台账 `dive` / `advance` | 零改写；`pausedReason` 只扩值域 | — |
| `RequirementFacts` 新字段 | 缺省 `undefined` → 预算闸按"该需求无消耗"处理（方向安全：不误挡） | 回滚 = 去掉投影 |
| `factsCache` 刷新 | 纯内存行为，进程重启即回到现状 | 回滚 = revert 写法 |
| FR-7 缺省宽限 | 行为变更（阻塞 → 10 分钟），无数据面影响 | 回滚 = `confirmDefaultGraceMs: 0` |
| FR-9 启动对账 | **会改写**存量终态需求的 `activation`（armed → disarmed） | 反向脚本：按 migration comment 的证据重写 armed（留痕在案） |

**回滚证据**：FR-9 是全需求**唯一**会改写存量数据的一步，故必须①在 comment 里写清
`from → to`；②提供 `scripts/rollback-terminal-reconcile.ts` 的反向路径（读评论还原），
并在验收证据里贴出"对账前后 + 回滚后"三段台账快照。
