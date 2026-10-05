# t-2c9ba9 一条真端到端断言当门禁（修前必红）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
一条真端到端断言当门禁（修前必红）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
npx vitest run tests/dive-wake-e2e.test.ts 全绿；修前必红且留证。

## 实施方案（implementation）
新增 tests/dive-wake-e2e.test.ts：真实组合根投递器 + 真 round driver。

## 上游产出摘要（dependsSummary）
- 回合计数改「本阶段」：阶段推进就归零
- 达上限不再锁死：人一动就能继续
- 把 agent 事件订阅搬到 agent 作用域上
- 加心跳兜底与唤醒链诊断

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-02T01:10:18.431Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

这一步做完，变化是：**「能不能跑」这件事第一次有了端到端的自动判据**——一条需求从"该跑"到"真的跑起来"，到"撞上限停下来等人"，到"人点继续又跑起来"，再到"重启之后人的意图没被动过"，五步串成一份会报警的测试。以后任何一处把它弄坏（投递器没接、上限不可恢复、重启改状态、计数不归零），CI 立刻红，不用再靠翻日志猜。

### 完成项

- 端到端闸门 5 条（覆盖你裁定的四类已证实故障）
- 顺带修掉：达上限后恢复没还额度（人点继续又立刻撞上限）
- 45 passed（e2e 5 + rearm 17 + driver 23）

### 改动文件

- `tests/dive-wake-e2e.test.ts`
- `src/application/dive/round-driver.ts`
- `src/application/internal/rearm.ts`

### 下一步

t8：存量台账迁移（老记录无 driverHealth，需按 phase 推导并归一）。

---
