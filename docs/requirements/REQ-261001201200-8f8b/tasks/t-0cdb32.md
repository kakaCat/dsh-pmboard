# t-0cdb32 装配形状守卫与投递契约单测（修前必红转修后全绿）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
装配形状守卫与投递契约单测（修前必红转修后全绿）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
npx vitest run tests/dive-wake-wiring.test.ts tests/agent-deliverer.test.ts 全绿；修前实测同一命令 9 failed（报错全为 this.idFactory is not a function），该修前输出需作为证据留存。

## 实施方案（implementation）
新增 tests/dive-wake-wiring.test.ts：真实 createCaptureRuntime + 真实 createDiveRoundDriver + 假 agent registry，断言一次 requestDrive 后 inbox 恰 1 条 source.kind=dive 消息、messageId 与 message.id 同值、且写的是准入而非 disarm；迁移 tests/agent-deliverer.test.ts 的 deliver() 旧 API 到 createRoundMessage/deliverMessage 并保留四态断言；先记录修前必红证据再修。

## 上游产出摘要（dependsSummary）
- 对齐投递器装配契约（组合根三参 + 可注入 id 工厂）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T12:24:10.931Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

这一步做完，变化是：**这条断链从此有了防复发的手铐**——任何人再把投递器的装配改错，「一次驱动即起轮」的守卫测试立刻变红，而不是让所有需求静默停摆数日才被人发现；同时那 9 条按已删除旧 API 写的红测试全部转绿。

### 完成项

- 新增装配形状守卫（真实组合根 + 真实驱动器，4 个用例）
- 投递器单测迁移到新 API 并扩到 10 个用例
- 实测红绿翻转：修前 3 failed（this.idFactory is not a function）→ 修后 14 passed

### 改动文件

- `tests/dive-wake-wiring.test.ts`
- `tests/agent-deliverer.test.ts`

### 下一步

同批 t3（disarm 留痕）与 t4（误停摆恢复）接续。

---
