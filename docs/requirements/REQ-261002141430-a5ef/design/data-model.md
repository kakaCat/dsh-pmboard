---
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
---

# 数据模型设计（REQ-261002141430-a5ef）

> 结论先行：**本需求不新增任何持久字段**。停手位复用既有 `dive.driverHealth`（只是多一个 reason 前缀），
> 在途弹框登记是**内存态**（与既有挂起确认注册表同生共死）。

## 内存：在途弹框登记表 `serves: FR-1, FR-3`

**结构**（扩在既有 `PendingConfirmRegistry` 内，新增一张按窗口/需求可查的表）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `ref` | `string` | 是 | 在途引用：挂起路径用既有 ticket（`pc-…`），其余用 `dlg-<n>` 形式的本地引用 |
| `windowKey` | `string` | 是 | 归属窗口（准入判定按需求查，不看窗口） |
| `requirementId` | `string` | 是 | 归属需求（`dialogInFlightFor` 的过滤键） |
| `kind` | `'confirm' \| 'gate'` | 是 | 来源：确认门（ask_confirm）/ Dive 人工门框 |
| `suspend` | `boolean` | 是 | `true` = 超宽限已挂起（有 ticket 可凭据取回执） |
| `since` | `number` | 是 | 登记时刻（诊断与最长等待提示用） |

**语义与生命周期**：

- `enter(ref)` 在**弹框投递前**同步执行；`exit(ref)` 在**作答/取消/降级/过期**任一出口同步执行；
- `exit` **幂等**：未知 ref / 重复 exit 一律零动作、不抛（与既有 `settle` 口径一致）；
- `dialogInFlightFor(requirementId)` = 该需求是否存在任何未 `exit` 的登记（同步、纯内存读）；
- **与既有 `pendingForWindow` 的关系**：后者是"我能取回执吗"（凭据视图，滤过期与台账落章）；
  前者是"自动链该不该停"（等待视图，管拦截）。两者共表但**不同谓词**，不得互相替代。

## 台账：停手位与留痕 `serves: FR-2, FR-3`

**写入（enter 时，异步，失败不阻断弹框但必须响亮）**：

| 位置 | 值 | 说明 |
|---|---|---|
| `dive.driverHealth` | `{ state: 'paused', reason: 'awaiting-confirm:<ref>', since, attempts: 既有值 }` | 让 `isDrivableRequirement` 为假 → 停投回合 |
| `req.comments[]` | 一条系统评论：在等谁、等什么、怎么恢复 | 看板可见（不改渲染） |
| `dive.activation` | **不动** | 人不意图由人改写（REQ-261001213924-1441 FR-5） |
| `req.autoRun` | **不动** | 停手不改自动链开关；实施链停因走准入判定 |

**清除（exit 时）**：`driverHealth` 回 `{state:'healthy', since: now, attempts: 0}`，并追加一条
恢复评论（写清出口：作答 / 看板确认 / 取消 / 过期），`version += 1`。

**常量单点**：`AWAITING_CONFIRM_PREFIX = 'awaiting-confirm:'`（新模块 `internal/awaiting-confirm.ts` 导出；
判定、清理、对账三处共用，杜绝对字面量各写一份）。

## 为什么不新增持久字段 `serves: FR-2, FR-4`

| 备选 | 否决理由 |
|---|---|
| 新增 `dive.awaitingConfirm?: {ref, since}` | 与 `driverHealth` 表达同一件事（"停下等人"），两份真相必然漂移；且 `isDrivableRequirement` 已经只看 `driverHealth` |
| 新增 `autoRun=false` 表示停手 | `autoRun` 是人的开关，混写会引出"恢复回哪个值"的难题（本需求边界明令不改它） |
| 把在途登记也落盘 | 弹框本身是会话级、进程级的短时态；落盘会在崩溃后留下"永远等不到人"的停手位（静默停摆风险） |

## 兼容与迁移 `serves: FR-4`

| 场景 | 行为 |
|---|---|
| 旧台账（无 `awaiting-confirm:` 前缀） | 读侧零变化；不触发本需求任何分支 |
| 进程重启（在途表丢失） | 心跳对账：`reason` 命中前缀且无在途 → 清除停手位 + 留痕（"登记已随重启丢失，按无人等待处理"） |
| 需求被归档/取消 | `isOpenRequirement` 已把它们排除在驱动与对账之外；残留停手位无副作用 |
| 回滚 | 无需数据迁移：清掉三处准入判定后，残留 `paused` 由既有 `recoverHealth`（看板「继续」）或下次阶段切换清除 |
