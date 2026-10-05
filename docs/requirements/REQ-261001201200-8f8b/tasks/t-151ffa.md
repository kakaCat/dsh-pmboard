# t-151ffa 装配形状守卫与投递契约单测（修前必红转修后全绿）·测试

> 需求：REQ-261001201200-8f8b 修复节点确认后不唤醒 agent：AgentDeliverer 缺 idFactory 致 Dive 唤醒链断裂

## 在做什么
装配形状守卫与投递契约单测（修前必红转修后全绿）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-01T12:24:10.644Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

测试段：修前必红、修后全绿，红绿翻转已实测。

### 完成项

- 修前（把组合根临时改回两参）：3 failed | 1 passed —— TypeError: this.idFactory is not a function
- 修后：tests/dive-wake-wiring.test.ts + tests/agent-deliverer.test.ts 共 14 passed
- 实验后已恢复三参（grep 确认三参行存在 1 处）

### 改动文件

- `tests/dive-wake-wiring.test.ts`
- `tests/agent-deliverer.test.ts`

---
