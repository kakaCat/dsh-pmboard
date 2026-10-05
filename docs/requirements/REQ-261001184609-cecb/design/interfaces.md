---
req: REQ-261001184609-cecb
doc: interfaces
serves: FR-1, FR-2, FR-3
---

# 接口契约

## 提交验收材料：evidence 支持逐项绑定（serves: FR-1）

| 项 | 契约 |
|---|---|
| 语法 | evidence 数组项形如 `<itemId> :: <命令 + 实际输出摘要>` |
| 解析 | `::` 左侧与验收项 id（任务卡 id 或需求级项 id）精确匹配则绑定该项 result；无 `::` 或未匹配的按现有语义作为整单证据 |
| 写入 | `VerificationItem.result = <右侧文本>`（截断到 500 字符） |
| 不伪造 | 未绑定项 result 保持 undefined |

## 验收单弹框：只问裁决（serves: FR-2, FR-3）

| 情形 | 提问数 | 说明 |
|---|---|---|
| 有 result 且可自动验证 | 1（仅裁决） | 题干带 result 与来源；人可零输入 |
| 无 result 且可自动验证 | 2（裁决 + 结果） | 保留现状，留 60 秒内补跑通道 |
| 需人工确认（needsHuman） | 2 | 题干显式写“需人工确认：<理由>” |

## 裁决落库（serves: FR-2）

| 输入 | status |
|---|---|
| 通过 + 有 result（agent 或自填） | passed（opinion = result） |
| 通过 + 无 result | unverified（不冒充通过，沿用 b918 底线） |
| 退回 + 意见 | failed + 返工卡（沿用现状） |
