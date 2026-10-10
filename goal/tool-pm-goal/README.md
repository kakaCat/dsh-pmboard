# tool-pm-goal

PM 双层 goal 能力的 **agent 工具面**。工具**设计对齐宿主 `@deepseek-ai/dsh-tool-goal`**
（三工具：读 / 建 / 改，各有独立描述）；**提示词保留本插件既有写法**
（`prompt.ts` 三段式：什么时候用 / 驱动含义 / 不做什么）。**不设 `wrapup.ts`**（用户裁定）。

## 文件

| 文件 | 宿主对应 | 语义 |
|---|---|---|
| `src/index.ts` | `index.ts` | **六个**工具工厂：L2 `task_goal_*` 三件 + L1 `stage_goal_*` 三件 |
| `src/authority.ts` | `authority.ts` | 执行期授权：`resume` 与 `stage_done` = 真人专属（对齐 `arm-explicit` 纪律与 D-4）；其余 agent 可发起 |
| `src/prompt.ts` | —（本插件自有） | 三段式描述文案（保留既有写法） |
| `src/wrapup.ts` | `wrapup.ts` | **收尾指令**：`update` 把目标判成 `complete`/`block` 后注入——只在**自主回合**（人直接操作不注入） |
| `src/registry.ts` | —（本仓纪律） | 单一手写登记面：注册名/工厂名由门禁交叉校验 |

## 工具（两层各三工具）

**L2 任务目标**（挂任务卡；"创建"= **任务目标的创建**）：

| 工具 | 语义 |
|---|---|
| `reqboard_task_goal_get` | 只读：这张卡的 goal 相位/陈述/阻塞原因 |
| `reqboard_task_goal_create` | 开工建目标；objective 缺省取卡片 `acceptance`（D-1） |
| `reqboard_task_goal_update` | 相位迁移：`pause` / `resume`（真人专属）/ `block`（原因必填）/ `complete`；`complete`/`block` 落库后**自主回合注入收尾指令**（`exec.deferContext`，对齐宿主 tool-goal） |

**L1 阶段目标**（挂需求；每主阶段一条达成位）：

| 工具 | 语义 |
|---|---|
| `reqboard_stage_goal_get` | 读阶段目标表 + "是否具备收口条件" |
| `reqboard_stage_goal_create` | 登记/替换阶段目标表（stage + statement + done_criteria；同 stage 不重复；stage 必须是合法阶段键） |
| `reqboard_stage_goal_done` | 达成位落章（**真人专属**，D-4：agent 提议、人落章）；全达成 ⇒ `ready_to_close` |

### 阶段序列（L1）**从项目创建开始**

```
draft（创建/立项）→ brainstorming → design → decomposing → implementing → accepting → archived（归档）
```

- 阶段表按这个顺序覆盖要跟踪的阶段；**未登记 = 不跟踪**（不臆造）
- **"项目完成" = 所有阶段目标都达成**（全 done ⇒ `ready_to_close`）
- 阶段键校验用 core 的权威集合 `ALL_STAGE_KEYS`（含 draft/archived；**不含** legacy `done`/`canceled`）

不做：不写 L1 达成位（人工门落章专属）、不代替 `reqboard_task_move`、不记回合数
（唯一权威 = `dive.roundsInStage`）。

## 分层

```
pm-goal（内核）→ pm-core（台账/投影）→ tool-pm-goal（本包）
```

## 测试

```bash
npx vitest run tool-pm-goal/tests
```
