# 架构（REQ-261007193530-3133）

> 视角：四处边界 bug 修复在分层架构中的落点、收敛点纪律与不变量。
> 与 `bugfix-design.md` 互补：那份写「怎么修」，本份写「修在架构的哪一层、为什么必须在那里」。

## 分层落点 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 修复 | 层 | 收敛点 | 该层职责依据 |
|------|----|--------|-------------|
| FR-1 H1 | application（use-case） | `AskConfirm` 弹框否定回执构造 | 回执形状由用例决定；工具层 schema 只校验，不修补 |
| FR-2 H2-role | application/internal + http | `transitionTask`（唯一任务状态迁移点） | 角色判定必须是**单源**：工具面与 HTTP 面共用 `roleOfTask` |
| FR-3 M2 | domain | `assertReqTransition`（需求转移闸门） | 人工门是领域规则，不是路由/工具层的判断 |
| FR-4 M6 | domain | `doneThrottleRemainingMs`（读数计算） | 读数契约（[0, throttleMs]）属领域计算 |

## 收敛点纪律（本批的共同不变式） <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

- **一处判定、多处消费**：状态合法性只有一张表（`REQ_TRANSITIONS` / `taskTransitionsFor(role)`），
  角色判定只有一份实现（`roleOfTask`）。本批修 FR-2 的方式是**补上漏接的调用方**，
  而不是在路由里复制第二份判定。
- **失败零副作用**：`transitionTask` / `assertReqTransition` 抛错时字段零改动（本批回归用例显式断言
  `status`/`version`/`statusHistory` 不变）。
- **降级形状必须能通过自己的 schema**（FR-1 的架构教训）：可选键缺席，而不是值为 `undefined`。

## 不变量 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

1. 子卡（有 `parentId`）只走 `todo → in_progress → done`（+ 失败回退/取消）；中段三态对子卡无出边。
2. 需求 `canceled → draft` 只能由人发起；合法边仍在（`canReqTransition` 不变）。
3. 节流读数恒 ∈ [0, throttleMs]。
4. 弹框否定回执恒为无损 JSON（无 `undefined` 值）。

## 未覆盖面（架构上刻意不动） <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

- HTTP 面的 actor 鉴权模型（H2 另一半）：本地进程 `curl` 仍可伪造 `actor:'human'`；
  这需要一次独立的小型设计，不在本批。
- 跨进程写锁（H3）：需先裁决部署拓扑（单进程假设是否成立）。
