# t-d5a14d 达上限不再锁死：人一动就能继续

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
达上限不再锁死：人一动就能继续

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/dive-round-driver.test.ts tests/dive-rearm.test.ts：达上限后 activation 不变、reason 含 round-limit；recoverHealth 后可驱动。

## 实施方案（implementation）
改 round-driver 的 terminalBlock/disarm 写 driverHealth；rearm 升级为 recoverHealth；看板继续走它。

## 上游产出摘要（dependsSummary）
- 定死状态契约：人的意图与运行时健康分家

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-02T00:57:40.980Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

这一步做完，变化是：**"跑满一轮就永久锁死"没有了**——达到阶段回合上限、或运行时出一次错，现在都只是"暂停，等人"，人点一次「继续」或确认推进就接着跑；而且这些故障再也不会偷偷把「我要它自动跑」这个决定改掉。顺带修掉一个更隐蔽的：以前**每次插件重启都会把所有需求打成手动模式**（teardown 里改的 activation），现在重启不再动它。

### 完成项

- 运行时故障只写 driverHealth，activation 永不被改写
- 达上限 = 停下等人（recoverHealth 即可恢复），comment 给出恢复路径
- teardown 不再改写任何状态
- 31 passed；6 条旧断言按新契约修正

### 改动文件

- `src/application/dive/round-driver.ts`
- `src/application/internal/rearm.ts`
- `tests/dive-round-driver.test.ts`
- `tests/dive-rearm.test.ts`

### 下一步

t4：把 agent 事件订阅搬到 agent.ctx（作用域修复）。

---
