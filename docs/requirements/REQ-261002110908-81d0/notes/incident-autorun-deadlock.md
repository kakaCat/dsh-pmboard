# 事故取证：批准拆分计划后「落库 0 张卡 → implementing 死锁」

> 记录人：session-be1bdc3d ｜ 记录时间：2026-10-02 11:21（Asia/Shanghai）
> 适用需求：REQ-261002110908-81d0 ｜ 状态：**未解除**（等人工裁决恢复路线）
> 用途：本需求验收/归档材料；另可作为「自动开跑失败后恢复通道全被堵」独立 bug 需求的原始证据。

## 一、结论（一句话）

批准拆分计划时的自动落库**按 0 张卡执行**并照常推进：需求进入 `implementing`，但台账里**一张任务卡都没有**；
而事后四条恢复路径（重新提交计划 / 退回拆分 / 手动拆分 / 解锁 Dive）**全部被代码级门禁挡住**，形成死锁。

## 二、时间线（台账留痕，可复核）

| 时刻 | 事件 | 结果 |
|---|---|---|
| 11:14:37 | 第一次提交计划（**带 5 张任务表**）并获批准 | 自动落库失败：`计划卡缺少需求条款引用（t5）` → 不推进 |
| 11:16:37 | 修正计划文档覆盖对照表后**重交**（**漏传 tasks**） | `[计划] 提交拆分计划（0 个任务，待人工批准）` → `plan.tasks` 被清空 |
| 11:16:48 | 该版本获批准 | `[拆分] 按已批准的拆分计划落库 0 个任务`；`[自动开跑] 自动拆分 0 张卡并落库 → 自动进入实施（autoRun=true）` |
| 11:17–11:19 | 尝试补交带任务表的计划 | `REQBOARD_BAD_STATUS`（计划只能在 decomposing 提交） |
| 11:19 | 尝试退回拆分态 | `missing_artifact`（implementing 须先有 task_detail 产物） |
| 11:19 | 尝试手动拆分 / 解锁 | `REQBOARD_DIVE_ARMED` / `REQBOARD_NO_BOUND_REQ` |
| 11:20:52 | 写入断点（reqboard_note_interruption） | 已留痕，pendingAction=reqboard_task_run |

## 三、根因（两层，必须分开认账）

**第一层（操作，已认账）**：重交计划时只传了 `path/summary/change_note`，**漏传 `tasks`**。
该入口在未传 tasks 时把计划任务表**清空**（不是保留旧值），随后批准按 0 张卡落库。
→ 说明：这个"漏传即清空"的语义对本 agent 极不友好——入口返回体已提示 `task_count: 0`，但发生在弹框触发之后，来不及拦。

**第二层（产品缺陷，独立于操作）**：所谓"恢复通道"在这个形态下**一条都走不通**：

| 路径 | 门禁/缺陷 | 代码位置 |
|---|---|---|
| `reqboard_submit(kind=plan)` | 计划仅允许在 `decomposing` 提交 | 计划提交用例的状态检查 |
| `reqboard_move(→decomposing)` | implementing 缺 `task_detail` 产物 → `missing_artifact`（没有卡就永远产不出该产物，**闭环堵死**） | 产物门禁 |
| `reqboard_decompose` | Dive armed 时禁止手动拆分 | [Decompose.ts:49](/Users/mac/Documents/ai/dsh/dsh-pmboard/src/application/use-cases/Decompose.ts#L49) |
| `reqboard_clear_pause`（唯一解锁口） | ① 取 `context.session?.id` —— `ToolRunContext` 上**没有 `session` 属性**（基线 tsc 报 TS2339），故恒为 'unknown'、**该工具从未工作过**；② 参数被声明为**嵌套 `schema`**，`requirement_id` 传不进去 | [ClearPauseTool.ts:18](/Users/mac/Documents/ai/dsh/dsh-pmboard/src/tools/ClearPauseTool/ClearPauseTool.ts#L18)、[ClearPause.ts:42](/Users/mac/Documents/ai/dsh/dsh-pmboard/src/application/use-cases/ClearPause.ts#L42) |
| 看板「拆分」恢复入口 | 走同一个 `executeDecompose` → 同样吃 Dive 门；且**不传 tasks**，`plan.tasks=0` 时还会 `REQBOARD_TASKS_REQUIRED` | [requirements.ts:444](/Users/mac/Documents/ai/dsh/dsh-pmboard/src/http/routers/requirements.ts#L444) |

**为什么不能靠改文件绕**：台账由 `JsonLedgerRepository` **一次性载入内存**（`loaded` 标志；`snapshot()` 只克隆内存副本），
宿主运行期间直改 `~/.dsh/dsh-reqboard.json` 不生效，且会被下一次写入覆盖。

## 四、当前硬事实（复核命令）

| 事实 | 复核方式 | 实测值 |
|---|---|---|
| 需求阶段 | `reqboard_status()` | `implementing` |
| 任务卡数 | `reqboard_task_tree()` | `parents: []`（0） |
| 计划任务表 | 台账 `plan.tasks` | 0 条 |
| 队列文件 | `ls docs/requirements/REQ-261002110908-81d0/queue.json` | 不存在 |
| Dive 状态 | 台账 `dive` | `activation=armed`、`phase=active` |
| 停摆留痕 | 台账 `advance.pausedReason` | `auto_decompose_failed: …缺少需求条款引用（t5）…` |

## 五、恢复路线（三条，均需人工裁决；都需重启一次宿主）

| 选项 | 动作 | 代价 |
|---|---|---|
| **A（推荐）** | 修 `clear_pause` 两处接线（窗口身份走 `deps.session.windowKey`；参数去掉嵌套 `schema`）→ `pnpm build` → 重启 DSH → `clear_pause` 解锁 → `reqboard_decompose(tasks=5 张)` 落库 | 计划外改 2 处代码；一次宿主重启 |
| **B** | 停止宿主期间，把台账该需求 `dive.activation` 改为 `disarmed` → 启动 → `reqboard_decompose(tasks=5 张)` 落库 | 数据手术（改台账本体）；一次宿主重启 |
| **C** | 本需求冻结在 implementing/0 卡，先把死锁单独立 bug 需求修掉，再回来恢复 | 本需求暂停 |

**五张卡的内容并不依赖上面任一条**：它们写在已确认的 [decomposition.md](../decomposition.md) 任务表里（key/依赖/验收标准齐全），解锁后可直接按表落库。

## 六、给后续的提醒（防重犯）

1. `reqboard_submit(kind=plan)` **必须带 tasks**——不传不等于"沿用上次"，等于"清空任务表"；
   返回体的 `task_count` 要当场核对（本次事故里它是唯一警报，但出现在弹框触发之后）。
2. 计划文档的「接收任务」格只能写**裸计划键**（`t2, t5`）；写成 `t2（2）` 会被 plan key 正则整格滤掉 → `REQBOARD_PLAN_REFS_MISSING`。
3. 自动开跑失败后**不要指望看板「拆分」按钮能救**——在 Dive armed 的需求上它同样被拒。
