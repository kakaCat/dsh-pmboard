# 数据模型设计（REQ-261003215944-9e04）

> 每个二级章节必须带 `serves: FR-x` 标注。字段/类型/约束写死在这份文档里，拆分阶段据此定粒度。
> 台账落盘位置：`<dshHome>/reqboard/requirements/<REQ>/record.json`（`src/domain/requirement/ReqboardPaths.ts:31`）。

## 席位结构 WindowSeat `serves: FR-2`

**新增字段（可缺省，不 bump schemaVersion）**：

```ts
/** 需求席位（FR-2）：一条需求可以有多个窗口参与；owner 唯一。 */
export interface WindowSeat {
  /** 席位窗口（= root agent id = session id，见 SessionProbeAdapter.ts:79-85） */
  windowKey: string
  /** owner 唯一且不可被解绑；worker 可领卡干活；observer 只读 */
  role: 'owner' | 'worker' | 'observer'
  /** 入席时间（ISO 或 epoch ms，与既有 record 字段同形） */
  joinedAt: number // epoch ms，与 createdAt 同形（实现口径）
  /** 最近一次活动（展示用；**不参与授权**，避免"活跃度即权限"的隐式规则） */
  lastSeenAt?: number // epoch ms；展示用，不参与授权
}

// RequirementRecord 新增（全链可缺省）
seats?: WindowSeat[]
```

**约束**：

| 约束 | 规则 | 违反时的行为 |
|---|---|---|
| owner 唯一 | 任一时刻 `seats.filter(s => s.role === 'owner').length === 1` | `REQBOARD_INVALID_INPUT` |
| owner 不可解绑 | `remove:true` 命中 owner 席位 | `REQBOARD_INVALID_INPUT`（换绑走 `role` 转移） |
| 同窗幂等 | 同一 `windowKey` 重复加入 | 零写入返回，不产生重复项 |
| 上限 | `seats.length ≤ seats.max`（默认 8） | `REQBOARD_SEAT_LIMIT` |
| 跨需求 | 席位窗口必须属于**本窗口绑定**的需求 | `REQBOARD_NOT_BOUND_TO_WINDOW` |

## 席位读取与折算 `serves: FR-2, FR-3`

**权威读**：`seatsOf(record)`（`src/application/internal/window.ts` 升级点）。

```
seats 有值？ ── 是 ──▶ 原样返回
      │
      └── 否 ──▶ 折算 [{ windowKey: sourceSessionId, role: 'owner' }]
                     （sourceSessionId 缺失 → 空数组，不伪造 owner）
```

**为什么不落盘折算结果**：52 条存量若被批量改写，回滚就没有退路；折算放读端 → 删掉折算即回到现状（零迁移）。
**为什么保留 `sourceSessionId`**：它同时是存量记录的锚点与"需求来源窗口"的审计字段，
改名要动全仓读点；本次只**新增** `seats`，不动它。

## 授权判定的输入与输出 `serves: FR-3`

```ts
/** 一个席位能做什么（纯函数，零 IO）：输入是席位 + 动作，输出是允许/拒绝码。 */
export type SeatAction =
  | 'move-requirement'   // 推进需求阶段：owner only
  | 'confirm-gate'       // 人工门：owner only（且仍是人在弹框里作答）
  | 'submit-artifact'    // 提交阶段产物：owner + worker
  | 'claim-task'         // 领自己的卡：owner + worker
  | 'report-task'        // 汇报自己的卡：owner + worker
  | 'read'               // 只读：全部席位

export function canWrite(seat: WindowSeat, action: SeatAction): { ok: true } | { ok: false; code: string }
```

**复用既有范式**：`src/application/use-cases/ReportTask.ts:57-64` 的 `ownsTeamTask`（团队 Worker 早已按"身份 + 卡归属"授权，
不靠台账绑定）——本需求把这条生产验证过的做法推广为通用判定。

## Dive 状态与事件表 `serves: FR-9`

```ts
/** 可驱动/暂停的两套状态（既有，不改语义）：activation = 人的意图；driverHealth = 运行时健康。 */
// RequirementDive（src/shared/protocol.ts:1043-1094）已有：
//   activation: 'armed' | 'disarmed'      ← 只有人能改
//   phase: 'active' | 'idle' | 'paused'   ← 旧语义，读侧兼容
//   driverHealth?: { state: 'healthy' | 'paused'; since; attempts; reason? }
//   roundsInStage: number
```

**事件 → 写入表（这张表就是规格，`transitionDive` 只是它的实现）**：

| 事件 | activation | phase | driverHealth | roundsInStage | 留痕 `createdBy` | 触发者 |
|---|---|---|---|---|---|---|
| `arm` | `armed` | `active` | 初始化 `healthy`, attempts 0 | `0` | `system` | 立项 |
| `disarm-manual` | `disarmed` | `idle` | 不动 | 不动 | `agent`（带 sessionId） | 人按 `reqboard_clear_pause` |
| `disarm-rollback` | `disarmed` | 不动 | 不动 | 不动 | **按调用方**（人经看板 = `human`；agent 经 `reqboard_move` = `agent`） | 需求回退（`rollback.ts:72`，第 8 处写入点） |
| `pause-runtime` | **不动** | 不动 | `paused`（带 reason/attempts） | 不动 | `system` | 驱动失败/投递失败/检查点失败 |
| `recover-auto` | **不动** | 不动 | `healthy`, attempts 0 | `reason` 以 `round-limit` 开头才 `0` | `system` | 自动恢复（`requirement-moved` / 心跳） |
| `arm-explicit` | `armed` | `active` | `healthy`, attempts 0 | `reason` 以 `round-limit` 开头才 `0` | **`human`** | 人按看板「继续」 |
| `advance-stage` | 不动 | 不动 | attempts `0` | `0` | 按调用方 | 阶段推进（from≠to） |
| `confirm-advance` | **不动（红线）** | 不动 | 同阶段暂停 → `healthy`；否则不动 | 仅"因达上限而暂停"时 `0` | 按调用方 | 推进弹框落章推进后 |

**读这张表的两种方式**：

- "同一事件在不同状态下非法" → 返回 `changed:false` 零写入（幂等写在纯函数里）；
- **任何运行时故障都只许写 `driverHealth`，绝不把 `activation` 改成 `disarmed`**
  （`src/shared/protocol.ts:1056` 的 FR-5 纪律原文）——表里 `pause-runtime`/`recover-auto`/`confirm-advance` 三行的 activation 列写的是"不动"。
- **一处窄例外（照代码保真）**：`recover-auto` 在 `activation='disarmed'` 且 `phase='active'` 时会把 activation 置回 `armed`
  ——这是 REQ-261003215944-9e04 之前的 REQ（8f8b FR-4）就定下的既有行为，为的是"人手停之后驱动还能被同一条链唤醒"。
  即表里那一行的"不动"是简写：**以 `transitionDive` 的纯函数实现为准**，本表是规格摘要而非穷举。

## transitionDive 契约 `serves: FR-9, FR-10`

```ts
export type DiveEvent =
  | 'arm' | 'disarm-manual' | 'disarm-rollback' | 'pause-runtime' | 'recover-auto'
  | 'arm-explicit' | 'advance-stage' | 'confirm-advance'

export interface DiveTransitionInput {
  event: DiveEvent
  now: number
  /** pause-runtime 必填；其余忽略 */
  reason?: string
  /** 调用方身份，用于留痕与审计 */
  actor: { kind: 'human' | 'agent' | 'system'; sessionId?: string }
}

export interface DiveTransitionResult {
  /** false = 该事件在当前状态下不产生任何变更（调用方必须零写入） */
  changed: boolean
  /** 变更后的 `dive`（changed=false 时与输入同值） */
  next: RequirementDive
  /** changed=true 时给出的留痕（application 层负责追加到 comments） */
  comment?: { body: string; createdBy: { kind: string; sessionId?: string } }
}

/** 纯函数：零 I/O、零 import 外层（遵守 C-01 层边界）。 */
export function transitionDive(prev: RequirementDive, input: DiveTransitionInput): DiveTransitionResult
```

**application 层唯一写盘入口**：

```ts
export async function applyDiveTransition(
  deps: { store: RequirementStore; now: () => number; ids: IdFactory; dialogInFlight?: (reqId: string) => boolean },
  requirementId: string,
  event: DiveEvent,
  actor: { kind: 'human' | 'agent' | 'system'; sessionId?: string },
): Promise<{ changed: boolean; code?: string }>
```

三条纪律（照抄既有 `rearm.ts:13` 的写法，因为它们已被现场验证过）：

1. **幂等**：条件判定在纯函数里，不在 `mutate` 回调里各写一份；
2. **永不抛**：调用点在事件/请求路径上（包括 `turn/end` 钩子），抛错会炸宿主；
3. **弹框在途守卫**：`dialogInFlight(reqId) === true` 时 `confirm-advance`/`recover-auto` 一律零写入
   （沿用 `rearm.ts:64` 的语义：否则会出现"框还在屏幕上、链已经跑起来"）。

## 空缺值语义（不许冒充 0） `serves: FR-9, FR-2`

| 字段 | 缺失时读作 | 禁止 |
|---|---|---|
| `dive` | 该需求未启用自动续跑（**不是** disarmed） | 不许把缺失当 `disarmed` 写回 |
| `dive.roundsInStage` | `0`（既有语义，唯一允许的折算） | 不许把缺失当"已跑满" |
| `dive.driverHealth` | 回落 `phase` 读侧兼容（`round-state.ts:195`） | 不许据此改写 `activation` |
| `seats` | 折算单 owner（见上） | 不许把缺失当"无权限" |
| `seats[i].lastSeenAt` | 不展示 | 不许据此判授权 |

## 文档读根解析契约 `serves: FR-11`

```ts
/** 一次文档判定的完整输入（单一权威源，预检与打开共用）。 */
export interface DocRootResolution {
  /** 会话工作区（发起阅读的会话 header.cwd），第一优先 */
  sessionRoot?: string
  /** 需求级工作区（record.workspaceRoot），仅当路径含需求段时作为第二跳 */
  requirementRoot?: string
  /** 实际用的根 */
  root?: string
  /** 都取不到时：按相对路径交给 DSH，并给出诊断（不许拼必然不存在的绝对路径） */
  degraded?: { reason: string }
}
```

**取值顺序**（改前只有最后一项，且取值对象错）：

| 顺序 | 来源 | 适用 | 现状 |
|---|---|---|---|
| 1 | 会话 header cwd（`sessionWorkspaceRoot`） | **所有**工作区相对路径 | ✘ 缺失 |
| 2 | 需求级 `record.workspaceRoot` | 路径含 `REQ-…` 段时（`artifacts.ts:114-126` 已有） | ✔ 保留为第二跳 |
| 3 | `process.cwd()` | **仅**作为最后兜底且必须标注 `legacy-cwd` | ✔ 现状（要降级） |

## 版本与迁移 `serves: FR-2, FR-9, FR-11`

| 项 | 决定 | 理由 |
|---|---|---|
| `REQBOARD_SCHEMA_VERSION` | **维持 9**（`src/shared/protocol.ts:1384`） | 新增字段全部可缺省；不冒充 0、不批量迁移、不报错 |
| 存量 52 条需求（15 热 + 37 归档） | **零改写** | `seats` 由读端折算；`dive` 由事件表读，不批量重写 |
| 迁移模块 | `src/application/internal/migrate-dive-state.ts` 保持独立（FR-9 的唯一豁免） | 它只跑一次、且处理的是旧形态归零，不该被运行时事件表覆盖 |
| 回滚 | 三处均可单点回滚 | `seats` 折算可删；`docs.rootSource='legacy-cwd'` 即恢复旧读根；`transitionDive` 可逐调用点退回直写 |

## 兼容矩阵 `serves: FR-2, FR-3, FR-11`

| 变更项 | 旧版本行为 | 新版本行为 | 迁移方案 |
|---|---|---|---|
| `seats` 缺失 | 不存在该字段 | 折算为单 owner（`sourceSessionId`） | 无（不落盘） |
| `sourceSessionId` | 唯一绑定锚点 | 保留为 owner 锚点 | 无（字段语义不变） |
| 16 处 `bound[0]` | 取绑定列表第一条 | 按席位取（owner 优先） | 代码级，逐处替换 |
| `REQBOARD_WINDOW_BOUND` | 一律拒绝 | 返回两个分支之一（`second`/`handoff`） | 旧调用方不传 `onWindowBound` 时走缺省分支 |
| `dive` 直写点 | 七处各写一份 | 全部经 `applyDiveTransition` | 代码级；读侧语义逐字不变 |
| 文档读根 | 插件宿主 cwd | 会话根（需求根作第二跳） | 配置开关 `docs.rootSource` 可回滚 |
| `state.workspaceRoot` | 插件宿主 cwd | 会话工作区；**旧字段保留**并新增 `sessionWorkspaceRoot` | 老客户端仍可读旧字段（降级为旧的错误行为，不炸） |

## 不变量（可写成断言） `serves: FR-2, FR-9, FR-11`

1. `seats` 有值时，owner 恰好一个，且其 `windowKey === sourceSessionId`（折算与落盘两态一致）。
2. `transitionDive` 对任意 `(prev, event)` 都是纯函数：同输入同输出，不读写外部状态。
3. 任何事件都**不会**把 `activation` 从 `disarmed` 改成 `armed`，除 `arm-explicit`。
4. `changed === false` 时，调用方对台账**零写入**（字节级不变）。
5. 文档判定的根与会话一致：`state.sessionWorkspaceRoot === sessionHeader.cwd`。
