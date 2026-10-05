# t-d4d79d 回合投递先问「有人在等吗」

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
回合投递先问「有人在等吗」

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/dialog-inflight-stop.test.ts -t "TC-1" 绿：在途时 deliverMessage 调用次数 = 0、createRoundMessage = 0，driverHealth.state !== 'paused'，roundsInStage 不变。

## 实施方案（implementation）
改 src/application/dive/round-driver.ts：DiveRoundPorts 新增可选 dialogInFlight?(requirementId)；drive() 在 checkpoint() 之后、createRoundMessage 之前判定一次，命中即 return（不 disarm、不写健康位、不计数）；未注入时行为与改动前逐字一致。组合根 src/index.ts 注入该实现。

## 上游产出摘要（dependsSummary）
- 落地「在途弹框登记 + 停手位」契约

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-02T06:33:34.386Z，窗口 session-0dc94a2a-9c00-455b-ac58-f96624a21da2）

这一步做完：人在看弹框的时候，Dive 不会再往会话里塞新一轮——屏幕上的框与 agent 的动作第一次真正对齐。

### 完成项

- 回合投递准入新增「有人在等吗」判定（在 checkpoint 之后、构造回合之前）
- 停手不写健康位、不 disarm、不计数
- 组合根注入判据，未装配时行为不变
- TC-1 用例覆盖并全绿

### 改动文件

- `src/application/dive/round-driver.ts`
- `src/index.ts`
- `tests/dialog-inflight-stop.test.ts`

### 下一步

t3：实施链派卡同样接判据

---
