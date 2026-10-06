# t-9ab60f 给 PendingConfirmRegistry 加只读 findOpen·研发

> 需求：REQ-261006164732-6503 拆分阶段批准门重复弹框：自动弹框与 agent 显式弹框并存并覆写审批台账

## 在做什么
给 PendingConfirmRegistry 加只读 findOpen·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T09:18:32.752Z，窗口 session-d210345f-6bd2-4a05-be59-e859c70b86c5）

研发段完成：findOpen 落盘，14 例全绿（含 TTL 回归），改动仅 2 个文件。

### 完成项

- PendingConfirmRegistry 新增 findOpen（纯读、跨窗口同门、kind 缺省=plan 口径）
- 新增 tests/pending-confirm-registry-findopen.test.ts，9 例
- npx vitest run 两文件 → 14 passed（9 新增 + 5 TTL 回归）
- 本卡改动仅 2 文件：PendingConfirmRegistry.ts +31 行、新增用例文件；工作区另有他人未提交改动 279 文件，非本卡

### 改动文件

- `src/adapters/PendingConfirmRegistry.ts`
- `tests/pending-confirm-registry-findopen.test.ts`

### 下一步

复核段：独立复核纯读约束与跨窗口语义。

---
