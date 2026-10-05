# t-dd205a 回合计数改「本阶段」：阶段推进就归零

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
回合计数改「本阶段」：阶段推进就归零

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/dive-round-driver.test.ts：跨阶段后 roundsInStage===0；同阶段不归零。

## 实施方案（implementation）
改 token-usage.ts 的 transitionRequirement：from !== to 时 roundsInStage=0、attempts=0。

## 上游产出摘要（dependsSummary）
- 定死状态契约：人的意图与运行时健康分家

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-02T00:55:39.205Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

这一步做完，变化是：**「这个阶段干了几轮」不再把上一个阶段的轮次也算进来**——以前计数是全生命周期累加、却拿它去比每个阶段的各自上限，结果在只允许 1 轮的阶段（比如刚立项）跑完一次就"达上限"被锁死；现在阶段一换就重新计数，上限只在它自己的阶段里起作用。

### 完成项

- 跨阶段转换归零 roundsInStage 与连续失败计数
- 同阶段累计保持不动
- 存量（无 dive）不抛错；20 passed

### 改动文件

- `src/application/internal/token-usage.ts`
- `tests/dive-round-driver.test.ts`

### 下一步

t3：把"达上限"从终态锁死改成停下等人可恢复。

---
