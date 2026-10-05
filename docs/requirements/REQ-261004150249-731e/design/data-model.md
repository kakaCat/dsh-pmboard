---
req_id: REQ-261004150249-731e
serves: FR-2, FR-3, FR-5
---

# 数据模型设计（REQ-261004150249-731e）

> 只动一个已存在的结构（`RequirementRecord.seats`）与一个新增配置块。
> **不新增台账字段**：`pendingHandoff` 这种"到了 fork 档但还没到阶段边界"的状态**不落库**（见下）。

## 席位模型（现状 + 本次不变式） `serves: FR-2`

`RequirementRecord.seats?: WindowSeat[]`，`WindowSeat = { windowKey, role, joinedAt, lastSeenAt? }`。

| 形态 | 读端口径（`seatsOf`，`application/internal/window.ts:37`） |
|---|---|
| `seats` 有值 | 原样（**权威**） |
| `seats` 缺省 + `sourceSessionId` 有值 | 折算为单 owner（`joinedAt = createdAt`） |
| 两者都缺 | 空数组（不伪造 owner） |

**本次新增的不变量（不改字段，只加约束）**：

| 编号 | 不变式 | 校验点 |
|---|---|---|
| INV-1 | 任一记录至少有 1 个 `role='owner'` 的席位 | `handoffOwner` 前置校验（拒绝产出空 owner） |
| INV-2 | `seats` 里的 owner `windowKey` **等于** `sourceSessionId` | `handoffOwner` 写入时同一次 mutate 内保证 |
| INV-3 | 交接前后 owner 恰好一个 | `handoffOwner` 内"新窗入席 + 旧窗降级"同事务 |

**为什么 INV-2 必须写死**：授权读 `seats`（`seatOf`），而会话标题栏流程图锚点读 `sourceSessionId`
（`http/routers/stages.ts:262-267`）。两套口径不一致时，会出现"能推进但流程图不显示"或反之——
这正是现状的病灶（看板改绑只改 `sourceSessionId`、不动 `seats`，回执 `rebound:true` 却是假成功）。

## 角色转移矩阵 `serves: FR-2, FR-5`

| 触发 | 新窗口 | 原窗口 | 说明 |
|---|---|---|---|
| `reqboard_handoff`（顶墙续作） | `owner` | `observer` | 默认，D-4 |
| 看板「改绑到本窗口」（人发起） | `owner` | `observer` | 与工具同一写入口径 |
| `reqboard_bind`（派活） | `worker` / `observer` | 不变 | 既有行为，**不动** |

**观察者退席规则**：原窗口降 `observer` 而非 `[]`——`BindSeat` 已确认"解绑永不带走 owner"，
降级保留可见性；若人明确要它退席，走既有 `reqboard_bind(remove)`。

## 分叉判据的数据来源 `serves: FR-3`

| 输入 | 来源 | 缺席语义 |
|---|---|---|
| `contextWindow` | `deps.session.contextPressure(wk)`（DSH token-meter 投影） | 缺席 |
| `pressureTokens` / `projectedTokens` | 同上 | 缺席 |
| `source` | 同上（`projection` / `unavailable`） | `unavailable` = 整条不可得 |

判定纯函数 `decideHandoff(pressure, cfg) → 'none' | 'warn' | 'fork' | 'critical' | 'unknown'`：

```
ratio = pressureTokens / contextWindow          （两者都在场才可算）
ratio ≥ critical(0.90) → 'critical'
ratio ≥ fork(0.85)     → 'fork'
ratio ≥ warn(0.75)     → 'warn'
否则                    → 'none'
任一字段缺席 / source≠projection → 'unknown'（不猜、不补 0、不自动交接）
```

**`pendingHandoff` 刻意不落库**：它 = "`fork` 档已到 + 当前阶段未收尾"，两个分量都能实时读到
（`decideHandoff` 的返回值 + `requirement.status`）。落库的判定会随读数变化立刻过期，
重演 `OverCapacityItem` 刻意不落库的同一条理由（`shared/protocol.ts:1971` 附近的自述）。

## 新增配置：`handoff` `serves: FR-3`

| 键 | 类型 | 缺省 | 约束 |
|---|---|---|---|
| `handoff.warn` | number | `0.75` | `0 < warn < fork` |
| `handoff.fork` | number | `0.85` | `warn < fork < critical` |
| `handoff.critical` | number | `0.90` | `fork < critical ≤ 1` |

解析单点 `plugin-config.handoffSettings(config)`，非法（非有限数 / 不满足不等式）→ **装配期抛错**，
与 `seatsMax`（`plugin-config.ts:243`）、`stageRouting` 同纪律；未配置 → 三档缺省，行为可预期。

## 回执契约 `serves: FR-4, FR-5`

`reqboard_handoff` 返回体的新增键（缺项整体省略，不发 `null`）：

| 键 | 类型 | 语义 |
|---|---|---|
| `from_window` | string | 原窗口（= 调用窗口） |
| `to_window` | string | 新窗口（= 新会话 id） |
| `old_role` | `observer` | 原窗口交接后的角色 |
| `new_role` | `owner` | 新窗口的角色 |
| `delivery` | `{ delivered, kind, reason? }` | 底稿投递结果；**未投递时不得省略该键** |
| `context_pressure` | `{ contextWindow?, pressureTokens?, projectedTokens?, source }` | 触发依据（原样透传，供人事后复盘） |

## 迁移与回滚 `serves: FR-2`

- **无迁移脚本**：存量记录不预写 `seats`（39+ 条；批量改写会毁掉回滚余地），只在**第一次交接**时物化。
- **回滚路径**：看板改绑回原窗口（`applyRebind` 幂等，目标相同则不写盘）。
- **兼容**：`seats` 物化后与折算语义等价——任何只读 `sourceSessionId` 的旧读侧（若有）在 INV-2 下仍读对。
