# t-b9df55 粒度门禁与 RTM 回归测试·研发

> 需求：REQ-261007125552-32cb 拆分粒度细化：接口级/组件级任务卡 + 设计先行

## 在做什么
粒度门禁与 RTM 回归测试·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/plan-granularity.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T06:10:16.222Z，窗口 session-f7f16017-9ae4-4879-956c-13ff76316613）

t6 研发段完成：TC-9 双侧（RTM 一对多 + 落库 refs 在位）落地，既有门禁回归 46/46 绿，粒度测试全文件 47/47 绿。

### 完成项

- TC-9 RTM 侧：decompose-rtm-integration +一对多用例（3 接口卡同接 FR-1，covers_frs 一对三、覆盖率 100%、未接收清单空）4/4 绿
- TC-9 落库侧：plan-granularity +完整落库用例（新门禁放行、tasks_created=3、卡上 requirementRefs 逐卡=['FR-1']）
- 既有门禁测试回归：clause-coverage-gate / plan-overcapacity-notice / plan-doc-table / decompose-rtm-integration 46/46 绿
- plan-granularity.test.ts 全文件 47/47 绿
- tsc：2 个错误，其中 1 个为开工前基线（query-docs-roots），另 1 个（confirm-channel-parity 'fingerprint'）为并发窗口在制改动（mtime 14:04，本窗口未触碰，git diff 显示 confirm-settle.ts 同期 +84 行）；本需求文件零类型错误

### 改动文件

- `tests/decompose-rtm-integration.test.ts`
- `tests/plan-granularity.test.ts`

### 下一步

复核段：对照 test-cases.md 逐条核对 TC 覆盖

---
