# t-cad1d0 新增解锁回归用例（UC-1..5 + 反向证伪，修前必红）·研发

> 需求：REQ-261002140814-1a5d 修复 reqboard_clear_pause 成功解锁却返回「value is not lossless JSON」报错

## 在做什么
新增解锁回归用例（UC-1..5 + 反向证伪，修前必红）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T06:19:16.459Z，窗口 session-496379d5-446c-4a51-9710-2fe1ce0eb676）

研发段完成：7 条用例把这次修复钉死，退回旧实现必红。

### 完成项

- 新增 tests/clear-pause-lossless.test.ts（7 条：UC-1..5 + 2 条反向证伪）
- 覆盖回执无损、缺值省略键、并发消失不说假成功、两个拒绝码零写入、留痕可见
- 退修实证：还原旧实现后 4 failed / 3 passed，恢复后 7 passed
- 文件头 20 行内含 serves: FR-1, FR-2, FR-3 声明

### 改动文件

- `tests/clear-pause-lossless.test.ts`

### 下一步

复核段：核对断言口径与状态码是否与设计一致

---
