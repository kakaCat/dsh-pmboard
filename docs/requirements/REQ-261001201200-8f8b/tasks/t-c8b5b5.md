# t-c8b5b5 对齐投递器装配契约（组合根三参 + 可注入 id 工厂）·测试

> 需求：REQ-261001201200-8f8b 修复节点确认后不唤醒 agent：AgentDeliverer 缺 idFactory 致 Dive 唤醒链断裂

## 在做什么
对齐投递器装配契约（组合根三参 + 可注入 id 工厂）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-01T12:23:16.794Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

测试段：四条断言全过，作为本卡的可复核证据。

### 完成项

- A 显式注入 → 非空 messageId
- B 缺省回落 → 非空 messageId
- C 非法 idFactory → 构造期 TypeError
- D 离线投递 → delivered=false 不抛

### 改动文件

- `src/wiring/pm-capture-root.ts`
- `src/adapters/AgentDeliverer.ts`
- `src/index.ts`

---
