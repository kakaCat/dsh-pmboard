# t-5b1be2 装配形状守卫与投递契约单测（修前必红转修后全绿）·复核

> 需求：REQ-261001201200-8f8b 修复节点确认后不唤醒 agent：AgentDeliverer 缺 idFactory 致 Dive 唤醒链断裂

## 在做什么
装配形状守卫与投递契约单测（修前必红转修后全绿）·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-01T12:24:10.270Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

复核段：守卫测的是装配而不是行为，且断言在修前后会翻转。

### 完成项

- 用例断言 inbox 恰 1 条 source.kind=dive 且需求仍 armed（修前会 throw + disarm）
- 迁移后的单测保留三态语义（在线/离线/无 followup/抛错/服务不可得/get 抛错）
- 未改动生产代码，只加测试

### 改动文件

- `tests/dive-wake-wiring.test.ts`
- `tests/agent-deliverer.test.ts`

---
