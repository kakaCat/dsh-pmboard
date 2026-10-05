---
req: REQ-261001184609-cecb
doc: data-model
serves: FR-1, FR-3
---

# 数据契约

## VerificationItem 增量字段（serves: FR-1, FR-3）

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| result | string | 否 | — | agent 或人给出的实际结果（命令 + 输出摘要） |
| resultSource | 'agent' \| 'human' | 否 | — | 结果来源（台账可分辨谁填的） |
| needsHuman | boolean | 否 | false | 无法自动验证，必须人看 |
| humanReason | string | 否 | — | 为什么必须人看（如“界面视觉”“线下流程”） |

## 兼容与迁移（serves: FR-1）

| 情形 | 处理 |
|---|---|
| 旧验收单（无 result 字段） | 读为 undefined，行为与今天一致（人需填写） |
| 旧弹框调用方 | 解析器对无 `::` 的 evidence 保持原语义 |
| 回滚 | 字段全部可选；关闭解析即回到旧行为 |
