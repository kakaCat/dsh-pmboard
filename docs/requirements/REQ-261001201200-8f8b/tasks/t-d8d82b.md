# t-d8d82b 误停摆恢复（判别器 + 恢复入口 + 两个调用点）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
误停摆恢复（判别器 + 恢复入口 + 两个调用点）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/dive-round-state.test.ts tests/dive-rearm.test.ts 全绿；真值表 5 行逐行通过（disarmed+active 为真，armed+active / disarmed+idle / 任意+paused / undefined 为假）；集成用例断言 onRequirementMoved 后台账 activation=armed 且 inbox 收到 dive 消息；负例断言 disarmed/idle 与 paused 零写入且不新增恢复 comment。

## 实施方案（implementation）
新增 src/application/dive/round-state.ts 的 isRecoverableDisarm（activation=disarmed 且 phase=active）；新增 src/application/internal/rearm.ts 的 rearmIfRecoverable（条件写回 armed + lastActiveAt + version+1 + 恢复 comment，返回是否真恢复，幂等）；改 round-driver.onRequirementMoved 先恢复再 requestDrive；改 src/http/routers/requirements.ts 的 autorun(on=true) 调同一入口，返回体形状不变。

## 上游产出摘要（dependsSummary）
- 对齐投递器装配契约（组合根三参 + 可注入 id 工厂）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T12:28:17.874Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

这一步做完，变化是：**已经停摆的需求能被叫醒了**——此前 disarm 是终态，一次投递抖动就让该需求终身停在手动模式，除了重开需求没有任何办法；现在只要它有下一次推进会话动作（人确认、看板推进、派生推进）或人在看板点「继续」，就会自动重新武装并起轮。人的主动暂停（clear_pause）与终态暂停仍然不被越权覆盖。

### 完成项

- isRecoverableDisarm 判别器 + rearmIfRecoverable 唯一恢复入口
- 两个调用点：round driver 的 requirement-moved、看板 autorun(on=true)
- 顺带修复并守卫「同一症状第二处断点」：src/index.ts 的 diveRoundPorts 缺 delivery
- npx vitest run tests/dive-round-state.test.ts tests/dive-rearm.test.ts → 23 passed

### 改动文件

- `src/application/dive/round-state.ts`
- `src/application/internal/rearm.ts`
- `src/application/dive/round-driver.ts`
- `src/http/routers/requirements.ts`
- `src/index.ts`
- `tests/dive-round-state.test.ts`
- `tests/dive-rearm.test.ts`
- `tests/dive-wake-wiring.test.ts`

### 下一步

t5：迁移兼容与端到端验证（回归基线比对 + 真机 E2E 取证）。

---
