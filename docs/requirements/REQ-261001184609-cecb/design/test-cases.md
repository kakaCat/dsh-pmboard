---
req: REQ-261001184609-cecb
doc: test-cases
serves: FR-1, FR-2, FR-3
---

# 测试用例

| id | 断言 | 落点 | 期望 |
|---|---|---|---|
| A1 | evidence 带 `<id> :: <结果>` → 该项 result 落库 | 新增 tests/verify-item-result.test.ts | result = 右侧文本，resultSource='agent' |
| A2 | 有 result 的项，弹框只问一问 | 同上 | 提问数 = 1；人零输入可记 passed |
| A3 | 无 result 的项 → 仍两问，留空记 unverified | 同上 | status = unverified |
| A4 | needsHuman 项 → 题干含“需人工确认”与理由 | 同上 | 文案含 humanReason |
| A5 | 无 `::` 的 evidence → 行为与今天一致 | 同上 | 不绑定任何项，回归不破 |
