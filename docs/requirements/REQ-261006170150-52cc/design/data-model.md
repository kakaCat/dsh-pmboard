---
serves: FR-1, FR-2, FR-3, FR-4
---

# 数据模型与迁移（REQ-261006170150-52cc）

> 结论先行：**零 DDL、零 schema 变更、零数据回填、零迁移脚本**。本需求只改「内存登记的生命周期」与两处写入顺序。

## 结论：不动任何持久化结构 `serves: FR-3`

| 对象 | 变化 |
|---|---|
| `RequirementRecord` / `RequirementDive` / `RequirementDriverHealth` | **字段零增删**（`driverHealth.state/reason/since/attempts` 语义不变） |
| 分片布局（`~/.dsh/reqboard/requirements/<REQ>/*.json(l)`） | 无 |
| `schemaVersion` / 迁移门（`migrationGate`） | 无 |
| `docs/requirements/<REQ>/queue.json`（任务队列） | 无 |
| 既有数据回填/清洗 | **无**：历史 `awaiting-confirm:*` 停手位靠心跳对账自然恢复，不改写任何历史文件 |

## 台账字段的读写语义 `serves: FR-1, FR-3`

| 字段 | 谁写 | 取值与含义 | 本次变化 |
|---|---|---|---|
| `dive.driverHealth` | `awaiting-confirm.enter`（等弹框）、`round-driver.disarm`（运行时故障）、`applyDiveTransition`（复位）、`exitAwaitingConfirm`（清位）、心跳对账 | `{state:'paused', reason:'awaiting-confirm:<ref>'}` = **停手等人**；`healthy` = 可驱动。`isDrivableRequirement` 唯一读它 | **写入时机**变化：确认收敛点从「推进之后清」改为「推进之前清」（FR-1）；清位成功时**额外回调一次驱动请求**（FR-2） |
| `dive.lastWakeAt` | 心跳成功唤醒后 | 心跳"停滞判定"基准（`isStalledWake`） | 无变化 |
| `dive.roundsInStage` | 准入时（`persistAdmission`）、阶段推进时归零 | 本阶段已准入回合数 | 无变化 |
| `req.version` | 每次成功写入 +1（CAS 令牌） | 回合预留的 revision 校验基准；**推进后旧回合会被 pre-step 拒绝** | 无变化（这正是「清位推迟到 settle 末尾」的理由之一） |
| `req.status` | 确认推进 | 阶段事实 | 无变化（推进逻辑一字不动） |

**写入顺序契约（FR-1 的可核验形态）**：一次确认的写入序列必须是
`清位（driverHealth → healthy）` → `落章` → `推进（status 变）` → `confirm-advance 复位`。
判据：在夹具 store 上记录每次 `mutate` 后的 `{driverHealthReason, status}`，断言存在相邻两步
「前者已非 `awaiting-confirm:*`、后者 `status` 已变」。

## 内存登记的生命周期与分档 TTL `serves: FR-3`

`PendingConfirmRegistry` 内 `inFlight`（ref → 记录）是**内存态**，不落盘、不迁移；进程重启即空表（既有语义）。

| 形态 | 判据字段 | 产生点 | 过期阈值 | 过期后 |
|---|---|---|---|---|
| 挂起型 | `suspend = true` | 超宽限挂起的确认票（后台续跑等作答） | `ttlMs`（缺省 30 分钟，= 票 TTL，语义不变） | 视为"无人等待" |
| 阻塞型 | `suspend = false` | 人在工具调用里等的弹框（含 Dive 门框） | `blockingTtlMs`（缺省 60 分钟 = `LIMITS.timeoutInteractiveMs`） | 视为"无人等待" |

**过期 = 惰性删除**：`inFlightFor` / `list` 读到 `now - since > ttl` 的记录即从表里摘掉并**返回 false / 不回该条**。
不引入定时器（与本仓"不在模块里藏定时器"的纪律一致；清理只发生在已有读点上）。

**为什么必须分档（反面代价）**：阻塞型弹框的最长真实等待是宿主交互工具超时（60 分钟），
而缺省宽限是 59 分钟。若统一套 30 分钟票 TTL，一个"人正在看框"的需求会在第 30 分钟被判过期 ⇒
心跳对账清位并起轮 ⇒ **框还在屏幕上、agent 已经跑起来**（这正是 `enterAwaitingConfirm` 存在要防的形态）。

**过期如何被观测**：不新增日志字段。恢复动作走**既有** `exitAwaitingConfirm(reason='expired')`，
它在台账留一条 `[Dive 恢复] 等待结束（出口=expired…）` 评论；心跳回执的 `resumed[]` 里点名该需求。

## 迁移与兼容 `serves: FR-3`

| 存量形态 | 处置 | 判据 |
|---|---|---|
| 台账停在 `awaiting-confirm:*` 且内存无对应登记（插件重启过） | **无需迁移**：下一趟心跳（≤60s）即由既有对账清位；清位回调顺手请求驱动 | 造一条该形态记录 → 跑一趟心跳 → 停手位非 awaiting 且 `resumed` 含它 |
| 台账停在 `awaiting-confirm:*` 且内存**仍有**登记（人一直没答） | 等到该形态的 TTL 到期，对账才清（这是正确语义：确实有人在被问） | 未过期时跑心跳 → 停手位保持、`resumed` 不含它 |
| 未登记产物的存量需求（`artifacts` 空） | 判据不适用（各门按存量早退），本需求零影响 | `req-doc-validate` 的 6 项"读数未知"照旧 |
| 缺省装配（未注入新端口） | 行为与改造前**逐字一致** | 既有测试全绿（见 `test-cases.md` 回归面） |

## 回滚路径 `serves: FR-1, FR-2, FR-3`

| 层 | 回滚动作 | 数据残留 |
|---|---|---|
| 代码 | 撤掉三处注入（`notifyDrivable` / `dialogRef` 传播 / `onCleared`）即回到旧时序 | 无（无新增字段） |
| 在途 TTL | 撤 `blockingTtlMs` 的过期判定即回到"永久在途"旧语义 | 无（内存态） |
| 数据 | **无需回滚脚本**：本次未改任何持久化结构、未回填、未改写历史记录 | — |

**与「不可逆改动」的划界**：本需求唯一"不可逆"的是**清位时机**（一旦发出就无法回到"推进后才清"）——
但它不改数据形状，回滚只需代码回退；台账上多出的 `[Dive 恢复]` 评论属正常留痕，不需要清理。
