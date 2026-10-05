# 独立复核（REQ-261002141430-a5ef）

> 复核对象：本需求 7 张卡的全部代码改动与证据。
> 复核方式：**不看汇报结论，直接读代码 + 跑命令**（对照已确认的 `design/` 五份文档逐条核对）。

## 一、逐条契约核对（对照 design/interfaces.md）

| 契约 | 实现 | 结论 |
|---|---|---|
| `AWAITING_CONFIRM_PREFIX = 'awaiting-confirm:'` 单点定义 | 只定义在 `src/application/internal/awaiting-confirm.ts`；判定/清理/对账三处均 import | ✅ `grep -rn "awaiting-confirm:" src` 只命中该文件 |
| `enterAwaitingConfirm` 先同步登记、再异步落库，永不 reject | 先 `dialogs.enter`（同步）、再 `await repo.mutate`，全程 try/catch + 告警 | ✅ |
| `exitAwaitingConfirm` 幂等、ref 可选、永不 reject | 未知 ref / 已健康 → 零动作；`ref` 缺省 = 清该需求任意 `awaiting-confirm:*` | ✅ TC-9 覆盖 |
| `dialogInFlightFor` 纯同步内存读 | 无 await / 无 IO；判据抛错按「无在途」放行 | ✅ TC-7 用真实端口压同一拍 |
| `DiveRoundPorts.dialogInFlight?` 可选，缺省行为不变 | `drive()` 内 `ports.dialogInFlight?.(...)` | ✅ TC-4 第三条断言 |
| `AdvanceStop` 新增 `awaiting-confirm` | 判定位于 `autoRun` 判定**之后**、单飞锁内 | ✅ TC-2 断言 autoRun 与 noopStreak 均未变 |
| `RearmDeps.dialogInFlight?` 在途即零写入 | 在 `isRecoverableRequirement` 之后、`mutate` 之前直接 `return false` | ✅ TC-5 断言 comment 数不变 |
| `WakeTickResult.resumed` 新桶 + 对账趟先于唤醒趟 | `reconcileAwaitingStops` 在 `tick()` 首段调用 | ✅ TC-6 两条断言（恢复 / 在途时不恢复） |

## 二、四条不变量核对

| 不变量 | 证据 |
|---|---|
| INV-1 非门禁不停 | TC-4 三条断言：无在途→起轮 1 次、实施链照常推进、未装配判据时行为不变 |
| INV-2 停手必可恢复 | 四条出口各有代码路径：作答/取消（AskConfirm 两条等待路径）、看板确认（confirm-settle 收敛点）、过期（心跳对账） |
| INV-3 不改人的意图 | 全仓 `grep -n "activation =" src/application/internal/awaiting-confirm.ts src/application/dive/wake-heartbeat.ts` 无写入；`req.autoRun` 只在读侧出现 |
| INV-4 降级不登记 | gate-prompt 的 `available()` 假分支先返回、AskConfirm 的 `fallback=board` 分支不进入等待块之前已 return |

## 三、复核中发现并处置的问题（不隐瞒）

1. **我一度误判"改动引入 3 条失败"**：`tests/auto-chain-approval.test.ts`、`tests/concurrency-limits.test.ts`、`tests/confirm-settle-plan-persist.test.ts`。
   追查结论：这是**脏工作树里既有的失败**（`confirm-settle.ts` 上有他人未提交的 FR-7 引用校验改动），
   与本次无关。取证方式：只移除本次新增的 `exitAwaitingConfirm` 调用后复跑，同样失败。
   → 也因此改用「把新逻辑临时置空」取精确基线，而不是 `git stash` 整份文件（后者会连带回退他人未提交的改动，得出假基线）。这条教训建议进知识层。

2. **顺手删了一处死变量**：`src/application/dive/gate-prompt.ts` 的 `fallback` 常量随 `deliver` 路径废弃后已无人读取
   （`tsc` 报 TS6133）。该文件正是本次 FR-5 的改动面，删掉它使本卡验收命令（过滤无输出）可达。
   不属于"顺手改别人模块"，已在完工记录里注明。

3. **端到端缺口**：真弹框的人工端到端未执行。已在验收材料里如实登记为待补复核，未用"应无问题"收尾。

## 四、复核结论

- 契约与实现一致，**无偏离**；四条不变量均有用例或代码锚点支撑。
- 已知缺口 1 条（人工端到端），已在验收材料显式列出，供验收人决定是否接受。
