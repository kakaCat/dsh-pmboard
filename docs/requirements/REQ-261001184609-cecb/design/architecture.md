---
req: REQ-261001184609-cecb
doc: architecture
serves: FR-1, FR-2, FR-3
---

# 架构：把“跑验证”和“做裁决”拆成两段

    agent 提交验收材料
      │ evidence: ["t-abc :: npx vitest run x → 6 passed"]
      ▼
    解析并绑定 ──► VerificationItem.result / resultSource='agent'
      │
      ▼
    验收单（人打开看板/弹框）
      │ 有 result → 只问裁决（人零输入）
      │ 无 result → 保留两问
      │ needsHuman → 显式标注理由
      ▼
    裁决落库 → passed / failed / unverified

## 改动面（serves: FR-1, FR-2）

| 层 | 文件 | 改动 |
|---|---|---|
| domain | AcceptanceSheetSpec | SheetItemLike 增 result/resultSource/needsHuman/humanReason |
| application | VerifySubmit | 解析 evidence 的 `::` 绑定，写入 items |
| application | AcceptSheet | 有 result 的项只问一问；题干带 result 与来源 |
| client | 看板验收面板 | 展示 result 与“需人工确认”标记 |

## 不变量（serves: FR-2）

1. 人工裁决不可省：任何路径都不自动置 passed。
2. 无 result 时选通过仍记 unverified。
3. result 只增不改：人被覆盖会丢证据，故 agent 结果可被人的裁决意见**并列**记录，不覆盖。
