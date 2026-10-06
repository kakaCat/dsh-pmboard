# 数据模型设计（REQ-261005213603-eaed）

> 每个数据结构标注 `serves: FR-x`。本次**零持久化变更**：只补一个客户端读侧类型声明 + 一个内存值类型。

## 新增/修改的数据结构 `serves: FR-2`

### `RequirementRecord.advanceLockAt`（客户端读侧补声明） `serves: FR-1, FR-2`

**用途**：代表「该需求此刻有没有一个后台 run 在跑」——host 推进锁的持有时刻，投影到看板载荷后的扁平键。

**定义**（`src/client/types.ts`）：

```typescript
interface RequirementRecord {
  // …既有字段
  /**
   * host 推进锁持有时刻（ms，扁平键；不是 advance.lockAt）。
   * 缺省 = 没有 run 在跑（缺失 ≠ 0）。
   * 语义与刷新：run 认领时写入，run 在跑期间每 30s 心跳刷新，run 结束 finally 清除。
   */
  advanceLockAt?: number
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 | 约束 |
|---|---|---|---|---|
| `advanceLockAt` | `number` | 否 | 推进锁持有时刻（epoch ms） | 有限数；缺省 = 不在跑；读侧 `now - lock < 15min` 判新鲜 |

**索引设计**：无（不经数据库；仅内存对象上的一个标量）。

**关联关系**：

| 关联到 | 类型 | 外键 | 说明 |
|---|---|---|---|
| 台账 `RequirementRecord.advance.lockAt`（host 侧） | 1:1（投影） | 需求 id | host 投影时扁平化为 `advanceLockAt`；客户端只读 |

### `RunningMark`（判据 → 渲染的内存值类型） `serves: FR-1, FR-3`

**用途**：把「在跑」这个事实连同**成因**交给渲染层；不落盘、不进载荷。

**定义**（`src/client/session-running.ts`）：

```typescript
type RunningCause = 'session' | 'run'

interface RunningMark {
  readonly cause: RunningCause   // session = 绑定窗口在跑回合；run = 后台 run 持锁
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 | 约束 |
|---|---|---|---|---|
| `cause` | `'session' \| 'run'` | 是 | 成因，决定 `title`/`aria-label` | 受控枚举；**不得**新增 `unknown` 之类值 |

**索引设计**：无。**关联关系**：无（一次渲染内的传参对象；`undefined` 表示无指示，与空对象严格区分）。

## 摘要投影链（host → 客户端） `serves: FR-1, FR-2`

```
台账 SQLite/record.json
  └─ RequirementRecord.advance.lockAt : number|undefined      （host 写入：认领 / 30s 心跳 / finally 清除）
        │  summarize(record)                                    src/domain/requirement/RequirementSummary.ts:236
        ▼
  RequirementSummary.advanceLockAt?（有界标量，SUMMARY_KEYS 已列）
        │  GET /dashboard/api/reqboard/state  → data.requirements[i]
        ▼
  客户端 state.requirements[].advanceLockAt?                    src/client/types.ts（本次补声明）
        │  requirementRunInFlight(req, now)                     src/client/session-running.ts（本次新增）
        ▼
  RunningMark | undefined  ──▶ renderRunningDot(mark?)
```

**链上每一环的既有性**（本条链**没有本次新增的写侧**）：

| 环节 | 本次是否改动 | 出处 |
|---|---|---|
| 台账字段 `advance.lockAt` | 否（既有） | `src/shared/protocol.ts:1138` |
| 锁的写入 / 心跳 / 清除 | 否（既有） | `AdvanceChain.ts:790` / `:445` / `:689` |
| 摘要投影 `advanceLockAt` | 否（既有） | `RequirementSummary.ts:236`、`SUMMARY_KEYS` |
| HTTP 载荷 | 否（既有） | `src/http/routers/stages.ts`（`requirements: page.items`） |
| 客户端声明 | **是**（补 `advanceLockAt?: number`） | `src/client/types.ts` |
| 判据 / 渲染 | **是**（新增） | `src/client/session-running.ts`、`render/dom-utils.ts` |

**为什么不做「客户端另存一份运行态」**：留缓存副本就是第二份真相；判据必须每次渲染实时读载荷（与既有纪律一致）。

## 是否改表 / 迁移 / 回滚 `serves: FR-2, FR-5`

| 问题 | 结论 |
|---|---|
| 改 SQLite schema / `record.json` 结构？ | **否**。零新增字段、零迁移脚本 |
| 改 HTTP 协议 / 载荷形状？ | **否**。只**读**既有键（host 早就发；本次补客户端类型声明） |
| 需要数据回填？ | **否**。缺键 = 不在跑（旧数据零改写） |
| 需要灰度 / 开关？ | **否**。纯加法能力，最坏情况是「不亮圈」（与改动前一致） |
| 回滚路径 | 回退 `session-running.ts` / `dom-utils.ts` / `artifacts.ts` / `board.ts` / `types.ts` 五处改动即完全回滚；**无数据残留**（不写盘、不落库） |
| 旧客户端 + 新服务端 | 兼容：不读该键的客户端行为不变 |
| 新客户端 + 旧服务端 | 兼容：键缺失 → 不显示（FR-5 验收 1） |

## 关键决策与取舍 `serves: FR-1`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 数据来源 | 客户端另建「运行态」缓存 / host 新字段 | 只读既有摘要键 | 单一来源；host 已有心跳与 stale 语义 |
| 成因表达 | `running: boolean` + `cause: string` 两参数 | 单个 `RunningMark`（或 `undefined`） | 两参数可表达非法态；一个值类型把「有没有」与「为什么」绑在一起 |
| 成因枚举 | `'session' \| 'run' \| 'unknown'` | 只两个值 | 读数不可得的呈现是**没有指示**，不是「未知」 |
| 缺键语义 | 当作「未知」或补 0 | 当作「不在跑」 | 与「缺失 ≠ 0」同纪律；0 会被误判为 1970 年的锁 |

## 技术方案与亮点 `serves: FR-2`

- **零持久化的能力扩展**：一次判据升级没有引入任何新存储、迁移或协议字段——因为 host 早已把「有 run 在跑」的唯一凭据投影进摘要（可核验指向：`RequirementSummary.ts:236`、`AdvanceChain.ts:884`）。
- **值与判据同源**：`RunningMark` 只由 `requirementRunningMark` 产出，渲染层不做任何判定（避免"渲染层猜成因"的第二份真相）。
