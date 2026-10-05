# t-efcbe6 实现详情取数模块 req-detail-store 并落地 store 单测·测试

> 需求：REQ-261004195831-0f52 修复看板需求详情页打不开（/state 改摘要后详情未按需取全文）

## 在做什么
实现详情取数模块 req-detail-store 并落地 store 单测·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-04T12:29:55.434Z，窗口 session-c7b8471e-ba16-48ff-ab19-61f88fa69a7e）

测试段收口：新增 35 例全绿，全量失败数从基线 106 降到 98（顺带修好一个同根因的既有失败），类型检查错误数 149 低于基线 153，客户端 bundle 重建通过且新符号已在产物里；10 个变异全部被判红，说明用例真的在看住这条修复。

### 完成项

- npx vitest run tests/req-detail-ondemand.test.ts → 35 passed（新增用例全绿）
- npx vitest run tests/state-payload-client.test.ts → 2 passed（首屏 0 次详情请求契约未倒退）
- npx vitest run tests/board-attach.test.ts → 9 passed（由本 bug 同根因的 1 failed 转为全绿）
- npx vitest run（全量）→ Test Files 47 failed | 376 passed | 3 skipped；Tests 98 failed | 4489 passed → 失败数 98 ≤ 基线 106
- npx tsc --noEmit → 149 个错误（本需求改动前同状态为 153）→ 不高于基线；本需求涉及文件 0 错误
- pnpm build:client → [verify-client] OK bundle=421051 bytes；构建戳 1adec318f8d0
- 变异测试 10 个（改坏→跑→还原，均 sha 校验）→ 全部被判红
- 唯一残留失败为 tests/size-budget.test.ts（既有失败：清单里全是本需求未触碰的历史超限文件；本次新增文件 315/73 行，board-mount 在白名单内）

### 改动文件

- `docs/requirements/REQ-261004195831-0f52/evidence/verification.md`

### 下一步

交棒验收：reqboard_submit(kind=verification)（需求已可进 accepting）

---
