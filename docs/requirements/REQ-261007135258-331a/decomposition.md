# 拆分计划（REQ-261007135258-331a · 确认通道接线收敛）

## TL;DR

把「推进 + 收尾」收敛成单点：`applyConfirmedAdvance` 扩可选入参并调用新增的 `finishConfirmAdvance`
（清停手位 + 复位运行时健康）；看板与文字证据两条通道删掉内联推进；看板推进与「窗口在线」解耦；
门禁 `how` 指路改指 `reqboard_ask_confirm`；补四通道对拍用例。

## 目标与做法

**目标**：让"人确认一次 = 落章 + 推进 + 清停手位 + 复位健康"成为**结构上的性质**，
四条通道（弹框 / Dive 门框 / 文字证据 / 看板）行为一致，且新增通道时漏接会被用例立刻抓到。

**做法**：① 先立单点（收尾抽 `finishConfirmAdvance` 并接进 `applyConfirmedAdvance`）；
② 再把两条"各自内联"的通道改成调单点；③ 顺手把门禁指路改到 agent 可执行的命令；
④ 用一条逐通道对拍用例把"一致面"锁死，最后全量回归。

**顺序理由**：单点先立（t1），两条通道的改造才有可调用的目标（t2 / t3）；
对拍用例必须等通道都收敛完（t5）；t4 与主链无文件交集，可并行。

## 任务总览

| 计划 key | 任务 | 阶段 | 端侧 | 依赖 | 验收 | 工作量 |
|---|---|---|---|---|---|---|
| t1 | 抽统一收尾 `finishConfirmAdvance` 并接进推进单点 | implement | backend | — | `npx vitest run tests/confirm-advance-finish.test.ts` 全绿；用例断言停手位清后 `driverHealth.state === 'healthy'` 且 `reason` 不以 `awaiting-confirm:` 开头；注入抛错替身时函数不抛且状态已推进 | 0.5 天 |
| t2 | 看板确认推进改走单点 + 与「窗口在线」解耦 | implement | backend | t1 | `npx vitest run tests/artifact-confirm-board.test.ts` 全绿；窗口离线用例 `advanced === true && delivered === false`；`grep -n "transitionRequirement(" src/http/routers/requirements.ts` 确认分支无命中 | 0.5 天 |
| t3 | 文字证据确认推进改走单点 | implement | backend | t1 | `npx vitest run tests/confirm-evidence.test.ts tests/confirm-settle-preconditions.test.ts` 全绿；`grep -n "transitionRequirement(" src/application/use-cases/ConfirmArtifact.ts` 0 命中 | 0.5 天 |
| t4 | 门禁 `how` 指路改指 `reqboard_ask_confirm` | implement | backend | — | `npx vitest run tests/decision-gates.test.ts tests/stage-gate-timeline.test.ts` 全绿；两条 `grep -rn "reqboard_move(requirement_id"` 空输出；断言 `how` 含 `reqboard_ask_confirm` | 0.2 天 |
| t5 | 四通道对拍用例 + 「确认后无需人干预即起轮」回归锁 | test | backend | t2, t3 | `npx vitest run tests/confirm-channel-parity.test.ts` 全绿；逆验证：注释任一通道的收尾调用后该用例失败（留证据） | 0.5 天 |
| t6 | 全量回归 + 静态断言收尾 | test | backend | t4, t5 | `pnpm test` 退出码 0 且用例数不下降；`pnpm typecheck` 退出码 0；两条静态 grep 空输出 | 0.3 天 |

## 卡片明细

### t1 · 抽统一收尾并接进推进单点（FR-3）

**改哪些文件**：

- 新增 `src/application/internal/confirm-advance-finish.ts`：导出 `finishConfirmAdvance`，
  内部顺序固定 —— ① `exitAwaitingConfirm`（带可选 ref，清 `awaiting-confirm:*`，成功后 `onCleared → notifyDrivable`）；
  ② `applyDiveTransition('confirm-advance', …)`（复位健康位 / 跨阶段归零）；③ 后置读，产出
  `{ stopPositionCleared, clearedNow, healthReset, stageChanged }`。两步各自 try/catch，**永不抛**。
- 改 `src/application/internal/confirm-settle.ts`：`applyConfirmedAdvance` 增可选 `reason` / `sourceLabel` / `clearStopPosition`，
  推进成功后调 `finishConfirmAdvance`，返回体带 `finish`（未推进时省略该键）。
- 新增 `tests/confirm-advance-finish.test.ts`。

**验收命令与读数**：见总览表；另断言 `finish.stopPositionCleared` 是**后置条件**（早已清过也为 true），
`clearedNow` 才是"这次真的清了"。

**依赖理由**：无（起点卡）。

### t2 · 看板确认推进改走单点 + 解耦窗口在线（FR-1、FR-4）

**改哪些文件**：

- `src/http/routers/requirements.ts`：确认即推进分支删除内联 `transitionRequirement` 与自写评论，
  改调 `applyConfirmedAdvance({ …, reason:'看板确认即推进', sourceLabel:'board' })`；
  把 `onlineAgent(windowKey)` 判定从"流程前置"改为只决定 `delivered` 与 `note`（推进照常）。
- `tests/artifact-confirm-board.test.ts`：补"窗口离线 ⇒ `advanced:true, delivered:false`"用例。

**验收命令与读数**：见总览表。

**依赖理由**：本卡按 t1 定下的可选入参与返回体改看板分支；两卡文件无交集，
但"单点签名"是本卡的时序前提（先有签名才有调用点）。

### t3 · 文字证据确认推进改走单点（FR-2）

**改哪些文件**：

- `src/application/use-cases/ConfirmArtifact.ts`：推进块（现 218-273）改调 `applyConfirmedAdvance`；
  保留 `advance !== false` 语义与内容门前置；删除本处 `applyDiveTransition` 调用（收尾已含）。
- `tests/confirm-evidence.test.ts` / `tests/confirm-settle-preconditions.test.ts`：补断言。

**依赖理由**：同 t2 —— 按 t1 的单点签名改造；文件无交集，签名是时序前提。

### t4 · 门禁指路改指可执行入口（FR-5）

**改哪些文件**：

- `src/application/internal/decision-gates.ts`（182 / 195）、`src/application/internal/stage-gate-timeline.ts`（359）：
  `how` 改为「补齐后重新调 `reqboard_ask_confirm(target=artifact, kind=<kind>)`——产物已落章 ⇒ 走已确认分支，闸门全过即自动推进」。
- `tests/decision-gates.test.ts` / `tests/stage-gate-timeline.test.ts`：断言 `how` 含 `reqboard_ask_confirm` 且不含 `reqboard_move(requirement_id`。

**无接口可联调**：纯文案常量与断言改动，无运行时接口面。

### t5 · 四通道对拍用例与回归锁（FR-6）

**改哪些文件**：

- 新增 `tests/confirm-channel-parity.test.ts`：表驱动四条通道，同一台账初始态断言
  `{ advanced, status, driverHealth.state, awaitingExit }` 四元组逐项相等；失败信息含通道名与缺失项。
- 复用 `tests/dive-confirm-advance.test.ts` 的起轮口径，补看板入口的"无需人发消息即起轮"用例。

**逆验证（必须做一次并留证据）**：临时注释任一通道的收尾调用 → 该用例必须失败；恢复后转绿。

**无接口可联调**：测试专用卡。

### t6 · 全量回归与静态断言收尾（FR-6）

**做法**：跑 `pnpm test`、`pnpm typecheck`，执行两条静态 grep，把输出摘要写入实施记录与验收材料。

**依赖理由**：t4、t5 的产物是本次回归的输入（文案断言与对拍用例必须先落地，全量回归才有意义）；
文件无交集。

## 覆盖对照（FR → 计划 key）

| 需求条款 | 接收任务 |
|---|---|
| FR-1 | t2 |
| FR-2 | t3 |
| FR-3 | t1 |
| FR-4 | t2 |
| FR-5 | t4 |
| FR-6 | t5, t6 |

## 风险与回滚

| 风险 | 触发条件 | 应对 |
|---|---|---|
| 收尾顺序错（先复位健康位再清位） | `applyDiveTransition` 被"弹框在途"守卫拦下 → 零写入 | 顺序固定为「先 exitAwaitingConfirm，后 applyDiveTransition」，由 t1 用例断言 |
| 看板语义变更影响既有消费者 | 前端只读 `note` 与 `gate_failure`，不读 `advanced` 语义 | 变更在设计 interfaces.md §I-3 已登记；看板 UI 不在改动面 |
| 对拍用例误锁"回执形状也一致" | 用例断言扩大 | 只锁四件事（推进结果 / 状态 / 健康位 / 停手位），回执形状刻意允许不同 |

**回滚**：纯代码回滚（`git revert`），无 schema 变更、无数据迁移；已清成 healthy 的停手位保持 healthy（常态）。
