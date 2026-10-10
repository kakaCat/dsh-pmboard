# 技术设计 · PM 双层 Goal 能力（REQ-261010200257-7e2d）

> 手工建档（pm 插件故障期）。serves: FR-1 … FR-7。
> 本文是**技术文档**：现状取证 → 目标架构 → 模块契约 → 迁移分期 → 决策记录。

## 1. 现状取证（为什么必须做）

### 1.1 dsh goal 内核有多小

goal 的本质状态：`objective` + `phase(active/paused/blocked/complete)`（回合计数收敛后不另存）。
goal-round-driver 的本质动作：`agent/status===idle` 一拍 → 判 phase → 继续/停。
**全部复杂度不在这个内核里。**

### 1.2 pm-round-driver 有多重（实测）

- `pm-round-driver/src/round-driver.ts`：**819 行**（曾因超 400 行尺寸门禁拆出 `wake-skip-trace.ts`）。
- 对 `pm-core/**` 的硬 import **12+ 处**（`round-driver.ts:6-28`）：

| import 来源 | 性质 | 反转处置 |
|---|---|---|
| `application/use-cases/queue-access.js` | **实现**（use-case） | 下沉为端口 |
| `application/internal/rearm.js` | **实现** | 下沉为端口 |
| `application/internal/interruption.js`（turnEndOutcome） | 纯函数 | 保留（契约层） |
| `application/internal/upstream-failure.js` | 纯函数 + 分类器 | 保留（契约层） |
| `application/internal/provider-latch.js` | type | 保留（type-only） |
| `application/internal/diag-log.js` | **实现** | 下沉为端口 |
| `domain/dive/transition.js` | 纯函数（状态规则单一来源） | 保留（契约层） |
| `domain/status/Predicates.js` | 纯函数 | 保留（契约层） |
| `application/ports.js`、`RequirementSummary.js`、`protocol-domain.js` | type | 保留（type-only） |
| `application/dive-core/round-state.js` | 纯数据契约 + 纯判定 | 保留（本就同族） |

> 结论先行：真正的"实现依赖"只有 4 处（queue-access / rearm / diag-log + 写路径的
> `store.mutate` 编排），其余是 type/纯函数——瘦身的准确说法是**把 4 处实现收编为端口**，
> 不是"砍掉 12 个 import"。这避免了"为反转而反转"的过度工程。

### 1.3 依赖方向为什么反了

分层（`docs/architecture/workspace-packages.md`）：L2 `pm-round-driver` 依赖 L0/L1 `pm-core`
是**层间合法**的；问题在**层内形态**——driver 直接调用了 pm-core 的 use-case 与 internal
实现（process 内具体编排），使自己变成"知道太多"的胖编排者。DIP 口径：driver 应只认识
自己定义的端口接口，pm-core 在组合根实现并注入（humanGate/chainBudget 已是此形态）。

## 2. 目标架构 <!-- ref: #fr-1 -->

> **包布局修订（2026-10-10 用户裁定）**：goal 内核**不放在 pm-core 里**，独立成包
> `pm-goal`（零依赖）+ `tool-pm-goal`（agent 工具面）；**core 引用 pm-goal**，依赖箭头只向内。
> 已随实施落地（见 §7 实施状态）。

```
┌─ pm-goal（独立包，零依赖；文件布局对着宿主 dsh-goal/src 对齐）──┐
│  types.ts      纯类型：GoalPhase / TaskGoal / StageGoal / DTO   │
│  domain.ts     事件与变更词汇：GoalEvent / GoalChange / actor    │
│  fold.ts       纯折叠与判据：emptyGoalState / applyGoalEvent     │
│                 goalAllowsRound / readyToClose / goalsProgressOf │
│  invariant.ts  四条不变量（终态/revision/原因/身份）             │
│  runtime.ts    TaskGoalId() / GOAL_CHANGE_VERSION / GoalError    │
│  client.ts     客户端命名空间纯再导出                            │
│  index.ts      服务本体：端口契约 + 读写收口 + markStageGoalDone  │
└──────────────────────▲─────────────────────────────────────────┘
                       │ 只被引用（core → pm-goal；driver → pm-goal）
┌──────────────────────┴─────────────────────────────────────────┐
│  pm-core（台账字段 goals[] / TaskRecord.goal + 同步投影）        │
│  pm-round-driver（index.ts 持 goalAllowsRound 作起轮前第五道闸；   │
│                  prompt.ts / invariant.ts 与宿主同名对齐）        │
│  tool-pm-goal（reqboard_goal 工具壳）                           │
└─────────────────────────────────────────────────────────────────┘
```

**分层落点**（`scripts/package-boundary-check.mts`）：`pm-goal` = L1（allow 空）；
`pm-core` allow 加 `pm-goal`；L2 名单加 `tool-pm-goal`（allow `pm-common/pm-core/pm-goal`）。
依赖方向门禁实测通过（扫描 21 个包）。

**驱动权（FR-4）**：`agent/status===idle` 的订阅者全仓唯一 = pm-round-driver
（对齐 dsh-goal-round-driver 的「一个状态机 + 两路订阅」同形口径）。
goal 内核无订阅、无投递端口、无定时器。

## 3. 模块契约

### 3.1 pm-goal/src/types.ts <!-- ref: #fr-1 -->

```ts
export type GoalPhase = 'active' | 'paused' | 'blocked' | 'complete'

/** L2 任务目标（= dsh goal 的 pm 自实现；复制源：dsh goal 内核，2026-10-10）。 */
export interface TaskGoal {
  readonly id: string            // goal:<taskId>
  readonly taskId: string        // 挂载的任务卡
  readonly objective: string     // 人话陈述（= 卡片 acceptance 的陈述面，D-1）
  readonly phase: GoalPhase
  // 回合计数**不在 goal 里**（2026-10-10 收敛）：唯一权威 = `dive.roundsInStage`
  readonly blockedReason?: string
  readonly revision: number      // 乐观锁
}

/** L1 阶段目标（挂需求台账；每主阶段一条）。 */
export interface StageGoal {
  readonly stage: StageKey
  readonly statement: string
  readonly doneCriteria: readonly string[]
  readonly state: 'pending' | 'done'   // 达成位：agent 提议 + 人工门落章（D-4）
}
```

### 3.2 pm-goal/src/fold.ts（宿主 fold.ts 的对齐落点）

纯函数事件表：`create / pause / resume / block / complete`（**不含准入计数**——回合数唯一权威在
`dive.roundsInStage`，goal 不另存第二份）。非法迁移返回
`{ changed:false, reason }`，不抛异常（对齐 `domain/dive/transition.ts` 的非终态口径）。

### 3.3 RequirementFacts 投影增量（FR-2）

```ts
readonly goals?: { readonly total: number; readonly done: number }  // 有界计数；缺失≠0
```

statement / doneCriteria 正文**不进城**（与 description/comments 的既有口径一致：
同步缝只带有界标量）。

### 3.4 driver 新增端口（FR-4）

```ts
/** 当前在跑任务卡的 goal 相位；缺省 undefined = 未启用 goal 判据（行为逐字不变）。 */
goalPhaseFor?: (taskId: string) => GoalPhase | undefined
```

`drive()` 判定顺序（在四道前置之后追加第五道）：
`readyToDrive(latch→退避) → providerLatch → humanGate → chainBudget → goalPhase`。
goalPhase ∈ {complete, blocked, paused} → 不起轮 + `captureDiag` 有界留痕（不进台账评论，
对齐 wake-skip-trace 的 FR-4 口径）。

### 3.5 GoalStore 端口（pm-core/application/ports.ts 增量）

```ts
export interface GoalStore {
  get(taskId: string): Promise<TaskGoal | undefined>
  /** 幂等：同 revision 同值重写零写入；冲突返回 { conflict:true }。 */
  mutate(taskId: string, fn: (draft: TaskGoal | undefined) => GoalEvent): Promise<{ conflict?: boolean }>
}
```

落盘载体：任务卡文档的 frontmatter（`docs/requirements/<REQ>/tasks/<task_id>.md`）——
复用任务卡既有持久化通道，**不新增存储介质**（避免第二份真相的物理形态）。

### 3.6 阶段完成 → 下一节点唤醒（FR-8）

**不新造弹框机制**——复用既有三件套，StageGoal done 只当触发源：

```
transitionGoal(done) 落章（人工门，D-4）
  → requirementMoved（既有 store 订阅桥，pm/src/index.ts:1036 notifyDrivable）
  → 下一 idle 拍 gate-prompt 门状态投影：新阶段门该开 → 主动弹框
  → 在途：awaiting-confirm 停手位（dialogInFlight 拦同拍起轮 + driverHealth 留痕）
  → 作答：pending-confirm settle → 落章推进 → 唤醒窗口续跑
```

改动面收敛为**一处**：`gate-prompt` 的门状态投影需认得"StageGoal done"作为门的通过
条件之一（与产物确认章的关系由 D-1/D-4 裁定）。三条纪律：① goal 内核零依赖，弹框
不进 `domain/goal/`；② 弹框只请人点头（actor=human，人工门强度不变）；③ 终段弹
收口确认门（`readyToClose()=true` 时无"下一节点"）。

## 4. 迁移分期（每期回归零新增为门禁）

| 期 | 内容 | 验收 |
|---|---|---|
| P1 | FR-1 goal 内核 + 单测（含边界反向演练） | `tests/goal-kernel.test.ts` 全绿；零依赖 grep 断言 |
| P2 | FR-5 瘦身：4 处实现 import 收编为端口 | round-driver.ts ≤ 门禁行数；`tests/dive-round-driver.test.ts` 等回归全绿 |
| P3 | FR-4 goalPhase 判据接入 drive() | humanGate.open + goal.active ⇒ 不起轮用例 |
| P4 | FR-2/FR-3 StageGoal 落台账 + TaskGoal 挂卡 + readyToClose | 收口判据用例；投影有界性用例 |

分期理由：P1/P2 纯内部可独立交付；P3 起改变运行行为，必须在瘦身之后
（否则新判据会跟着旧依赖一起缠进去）。

## 5. 决策记录

| 编号 | 裁定 | 理由 |
|---|---|---|
| C-1 | 两层 goal：L1 阶段目标 + L2 任务目标 | 用户裁定（2026-10-10 讨论） |
| C-2 | 复制 dsh goal 内核自实现，不 import 宿主包 | 层边界门禁禁 @deepseek-ai/* 运行时 import；round-driver 自实现先例 |
| C-3 | goal 只当状态源，驱动权唯一归 pm-round-driver | 双 driver 抢同一 idle 拍是硬冲突（双倍投递/互相打架） |
| C-4 | 依赖反转：driver 只依赖端口 + 纯契约 | driver 不简练的根源 = 反向依赖 12+ 实现模块 |
| AD-1 | 瘦身的准确范围 = 4 处实现 import，非 12 处全砍 | type/纯函数 import 本就合法（§1.2 表） |
| D-1/D-2/D-4 | 待人裁（倾向见 requirement.md） | 影响 FR-2/FR-3 的落点细节 |

## 6. 已知边界（如实声明）

### 6.1 实施状态（2026-10-10）

| 期 | 状态 | 证据 |
|---|---|---|
| P1 goal 内核 | ✅ 完成 | `pm-goal/src/{types,transition,predicates}.ts`；`pm-goal/tests/goal-kernel.test.ts` 21 例绿（含零依赖边界 + 依赖只向内两条静态断言） |
| P2 driver 瘦身 | ✅ 完成 | round-driver 三处实现 import 消失（queue-access / rearm / diag-log → 本地等价 + `diag`/`rearm` 端口）；`pm-round-driver/tests/round-driver-imports.test.ts` 4 例绿；`pm/src/index.ts` 组合根接线 |
| P3 goal 判据接入 | ✅ 完成 | `goalPhaseFor` 端口 + `drive()` 第五道闸；`tests/round-driver-goal-gate.test.ts` 8 例绿（含"停手不改人的意图/不写健康位"与"可自己回来"） |
| P4 台账/投影/读写/接线 | ✅ 完成 | `RequirementRecord.goals[]` + `TaskRecord.goal` + `RequirementFacts.goals{total,done}`；`pm-goal/tests/goal-store.test.ts` 9 例绿；`pm/src/index.ts` 接线 `goalPhaseFor` |
| tool-pm-goal 工具面 | ✅ 落包（**未接线**） | `tool-pm-goal/tests/goal-tool.test.ts` 11 例绿；注册进 apply() 待下一步（`tool-pm/tests/apply-wiring.test.ts` 的注册名单奇偶校验要一并扩成多包登记面） |
| FR-8 弹框联动 | ⏳ 待做 | 见 §3.6；改动面 = `gate-prompt` 门投影认得 StageGoal done |
| 卡生命周期钩子 | ⏳ 待做 | 建/完成/暂停 goal 目前由 `reqboard_goal` 工具显式做；自动钩子要动 `MoveTask.ts`（"一次调用一次 mutate"打点契约） |

### 6.2 实施中修正的落点（与初稿的差异，如实声明）

1. **store 落点**：初稿 §3.5 说"任务卡文档 frontmatter"，实施改为**任务队列字段**
   （`TaskRecord.goal`）——同为既有介质、少一次文档 I/O，且与"台账唯一真相"一致。
2. **判据签名**：初稿 §3.4 写同步 `goalPhaseFor(taskId)`，实施为
   **`(requirementId) => GoalPhase | undefined | Promise<...>`**（异步）——理由：
   "当前在跑哪张卡"的解析要读任务队列，同步缝里现读会逼出第三份缓存；
   与 `humanGate` 的既有异步形态一致。
3. **回合计数收敛（2026-10-10 用户裁定）**：初稿给 `TaskGoal` 备了 `rounds/maxRounds` +
   `admit-round` 事件，实施后确认这是**没人驱动的第二份计数**——driver 的
   `dive.roundsInStage` 才是唯一权威（与熔断/退避/上限/心跳对账同源，久经生产）。
   已删除：`TaskGoal.rounds/maxRounds`、`admit-round` 事件、`admitGoalRound`、
   `goalRoundLimitHit`、工具的 `admit_round` 动作。goal 只答相位，不计数。
4. **错误码副本**：`pm-goal` 不 import core，故 `store.ts` 内以字面量
   `REQBOARD_NOT_FOUND` 镜像端口契约（唯一一份副本，注释声明需两侧同改）。

### 6.3 其他边界

- **反转有界**：driver 每拍必须读 PM 状态投影，"绝对零依赖"不可能也不必要；
  目标是"不依赖实现模块"（白名单见 `round-driver-imports.test.ts`）。
- **尺寸门禁未达**：round-driver.ts 现 844 行（初稿判定标准 2 的 ≤400 行未达成）——
  依赖反转已做，拆分是独立一步（本仓既有做法：把可测规则搬小模块）。
- **全仓存量红**：全量回归 64 failed / 7114 passed，**全部为十九包重构遗留**
  （根 `src/` 消失 → ENOENT 等），失败清单里零处涉及 pm-goal / tool-pm-goal；
  `tsc --noEmit` 错误数 4（与开工前逐字相同）。
- **粒度匹配**：dsh goal 一会话一个 vs pm 一需求多卡——实施链串行投递使其天然成立
  （当前 goal = 当前在跑卡的 goal），但**并发实施链**若未来引入，此假设需重审。
- **手工建档**：本 REQ 未入台账，RTM/queue.json 均缺；插件恢复后需补登记。
