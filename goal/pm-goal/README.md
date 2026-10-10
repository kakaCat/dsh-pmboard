# pm-goal

PM 双层 goal 能力的**最内层包**：零依赖、纯函数、被 core 引用（反向禁止）。

## 文件布局（对着宿主 `@deepseek-ai/dsh-goal/src/` 对齐）

| 本包 | 宿主对应 | 语义 |
|---|---|---|
| `src/types.ts` | `types.ts` | 纯类型（client-safe）：`GoalPhase` / `TaskGoal` / `StageGoal` / 请求回执 DTO |
| `src/domain.ts` | `domain.ts` | 事件与变更词汇：`GoalEvent`（create/pause/resume/block/complete）、`GoalChange`、actor |
| `src/fold.ts` | `fold.ts` | 纯折叠与判据：`emptyGoalState` / `applyGoalEvent` / `goalAllowsRound` / `readyToClose` / `goalsProgressOf` |
| `src/invariant.ts` | `invariant.ts` | 四条不变量（终态不可逆 / revision 恰好 +1 / block 必带原因 / 身份稳定） |
| `src/runtime.ts` | `runtime.ts` | 构造器与协议常量：`TaskGoalId()` / `GOAL_CHANGE_VERSION` / `GoalError` |
| `src/client.ts` | `client.ts` | 客户端命名空间纯再导出（`export type * from './types.js'`） |
| `src/index.ts` | `index.ts` | 服务本体：端口契约 + 读写收口（create/pause/resume/block/complete、`goalPhaseOf`、`markStageGoalDone`） |

## 与宿主 `dsh-goal` 的对齐（逐项）

| 宿主 | 本包 | 状态 |
|---|---|---|
| `GoalPhase` / `GoalRef` | 同名同值 | ✅ |
| `GoalBlockReason {code,message}` | 同名同构（结构化原因，非自由文本） | ✅ |
| `GoalSnapshot {objective, phase, blockedReason?, maxGoalRounds}` | `TaskGoal`（+ `taskId`） | ✅ |
| `GoalOperation = create\|edit\|pause\|resume\|block\|complete\|clear` | 同名同集 | ✅ |
| `edit`（改 objective / cap） | `applyGoalEvent({kind:'edit'})` + `editTaskGoal()` | ✅ |
| `clear` + tombstone | `GoalClear` + `clearTaskGoal()`（墓碑挂任务，`seenGoalIds` 拒同 id 复用） | ✅ |
| `foldGoal(events)` 严格解码 | `foldGoal(changes)`（版本不符/身份复用即抛） | ✅ |
| `seenGoalIds` | 折叠态 + `GoalTaskLike.goalCleared` 双处守 | ✅ |
| `GoalView {…, roundsStarted, activation}` | `goalViewOf()`（**派生只读**） | ✅ 派生 |
| `GoalMessageSource` | 同名（pm 版带 `taskId`） | ✅ |
| `GoalError` / `GOAL_CHANGE_VERSION` / `GoalId()` | `GoalError` / 同名 / `TaskGoalId()` | ✅ |
| `GoalActivation`（进程内许可） | `GoalView.activation` **派生自** `dive.activation`（core 是唯一真相） | ⚠️ 派生 |
| `roundsStarted`（goal 自记计数） | **派生自** `dive.roundsInStage`（2026-10-10 收敛裁定） | ⚠️ 派生 |
| `GoalError extends HarnessError` | `extends Error` | 差异（本仓不依赖 dsh-llm） |
| `GoalProjection` / session-projection 增强 | 台账字段（`TaskRecord.goal`/`goalCleared`） | 差异（pm 无 session-projection） |

**两处"派生只读"的理由**（不是偷懒）：照宿主各存一份 = **第二份回合计数** + **第二份"人的意图"**——
前者与你"计数收敛到一处"的裁定冲突，后者与 core `dive.activation` 的完整纪律（只有人能 arm、有全套测试）冲突。
形态对齐宿主，真相仍单一。

pm 相对宿主的两处**有意差异**：
1. 宿主"一会话一 goal"，pm 是"一卡一 goal（L2）+ 一阶段一达成位（L1）" ⇒ 多出 `StageGoal`；
2. 计数与许可走派生（见上表最后两行）。

## 依赖方向

```
pm-goal  ←  pm-core（台账字段 + 同步投影）
         ←  pm-round-driver（goalAllowsRound 作起轮前第五道闸）
         ←  tool-pm-goal（reqboard_goal 工具壳）
```

## 测试

```bash
npx vitest run pm-goal/tests
```

## 分组布局

本包与两个兄弟包同属 **`goal/`** 分组（对齐宿主 `packages/goal/{goal,goal-round-driver,tool-goal}`）：

```
goal/
├── pm-goal/                  # 内核（零依赖，core 引用它）
├── pm-goal-round-driver/     # 以 goal 为基础的回合驱动
└── tool-pm-goal/             # agent 工具面（含 wrapup）
```

包名保留 `pm-*` / `tool-pm-*` 前缀（与仓库其余包一致）；分组只影响目录与工作区 glob（`pnpm-workspace.yaml` 的 `goal/*`）。
