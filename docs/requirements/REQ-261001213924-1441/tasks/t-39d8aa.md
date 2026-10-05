# t-39d8aa 加心跳兜底与唤醒链诊断

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
加心跳兜底与唤醒链诊断

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/dive-rearm.test.ts：tick() woken 含该需求；3 次失败 → health=paused 且 activation 不变。

## 实施方案（implementation）
新增 wake-reconciler.ts 并在组合根装配；早退分支加 captureDiag。

## 上游产出摘要（dependsSummary）
- 定死状态契约：人的意图与运行时健康分家

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-02T01:03:24.188Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

这一步做完，变化是：**「它不动了」不再是一句只能靠翻日志猜的话**——系统每分钟自检一次，只看那些"想跑却十分钟没动静"的需求，主动叫一次；连续三次叫不动，就在需求上留一条人看得懂的话（"连续 3 次唤醒都没叫动"）并把运行时状态标成"停下等人"，而「我要它自动跑」这个决定始终原样保留。同时心跳不会去推正常在跑的需求，也不会自己反复重试一个已暂停的需求。

### 完成项

- 心跳 tick()：只叫停滞需求，成功记 lastWakeAt、失败计数归零
- 连续 3 次失败 → health=paused(wake-undeliverable) + [dive-diag] comment，activation 不变
- 管理器 60s 心跳 + wakeTick() 手动入口；15 passed

### 改动文件

- `src/application/dive/wake-heartbeat.ts`
- `src/application/dive/ReqboardDiveManager.ts`
- `tests/dive-rearm.test.ts`

### 下一步

t6（turn/end 结局单一解析）；t7 需按已证实的原因重做端到端闸门（原"修前必红"的 scoped 前提未获宿主证据支持）。

---
