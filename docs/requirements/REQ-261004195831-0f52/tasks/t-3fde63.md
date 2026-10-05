# t-3fde63 实现详情取数模块 req-detail-store 并落地 store 单测·研发

> 需求：REQ-261004195831-0f52 修复看板需求详情页打不开（/state 改摘要后详情未按需取全文）

## 在做什么
实现详情取数模块 req-detail-store 并落地 store 单测·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-04T12:06:06.536Z，窗口 session-c7b8471e-ba16-48ff-ab19-61f88fa69a7e）

研发段完成：详情取数模块与它的 9 条单测已落盘并实测通过，改动只落在两个新文件里，未触碰既有模块。

### 完成项

- 新增 src/client/req-detail-store.ts（232 行）：四态条目 + ensure/get/retry/reset
- 新增 tests/req-detail-ondemand.test.ts（222 行，store 分组 9 条）
- npx vitest run tests/req-detail-ondemand.test.ts -t req-detail-store → 1 file passed / 9 tests passed
- git status --short：两个文件均为新增（?? src/client/req-detail-store.ts、?? tests/req-detail-ondemand.test.ts）
- git diff --stat 对新增文件不适用（未跟踪），改用行数：232 + 222 = 454 行

### 改动文件

- `src/client/req-detail-store.ts`
- `tests/req-detail-ondemand.test.ts`

### 下一步

复核段（t-79aecb）：对取数模块做独立复核

---
