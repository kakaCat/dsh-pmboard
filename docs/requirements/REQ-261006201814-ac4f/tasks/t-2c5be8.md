# t-2c5be8 把靠中文文案兜底的断言换成断错误码（下半）·研发

> 需求：REQ-261006201814-ac4f 测试反向与异常覆盖补强（错误码矩阵 / 红基线分诊 / hermetic 夹具）

## 在做什么
把靠中文文案兜底的断言换成断错误码（下半）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/ask-confirm-blocking.test.ts tests/task-status-ledger.test.ts tests/task-move-role.test.ts tests/t9-usecase-queue-refactor.test.ts tests/reqboard/task-read-root-sync.test.ts tests/reqboard/settings-e2e.test.ts tests/reqboard/degraded-startup.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T07:30:05.686Z，窗口 session-13fffcba-1baf-45ca-92dc-3cd382ee51c8）

下半批断码升级：24 处站点升级（20 处精确断码 + 4 处无码契约钉死），18 文件站点数不变

### 完成项

- 新增 tests/helpers/code-assert.ts：expectCode 断言回执携带期望码（失败消息同时给期望码与实际码 + 回执原文）、expectNoCode 断言契约上中性无码、errorCodeOf 只读读数；认四种码位形状
- 24 处升级（20 处断码 + 4 处无码契约），覆盖 18 个文件，每处加 FR-6 注释标明升级原因
- 4 处无码站点已核实 src 确无码位（AskConfirm 的 interruptedBody / degradedAnswer、CaptureRequirement 的 notCreated、TaskStatusTool 的任务不存在分支），用 expectNoCode 把契约钉成事实，而不是写凑数断言
- 助手首轮有小写猜测缺陷（把散文里的 nope 当码），子代理已在卡内修掉：判据只看码位 + .error 里的内嵌大写码
- 既有用例零语义变更：18 文件 success=false 站点数逐文件不变（合计 24）；14 个 tracked 文件的含删 hunk 数为 0
- 本窗独立复核：18 文件复跑 17 passed / 1 failed，唯一那条红是既有基线（已登记 failures.txt:27 与 reverse.txt:12），非本卡引入
- npx tsc --noEmit 全仓 0 错误；npx vitest run tests/error-code-inventory.test.ts 11 通过（所钉码的覆盖态零漂移）

### 改动文件

- `tests/helpers/code-assert.ts`
- `tests/artifact-confirm-board.test.ts`
- `tests/ask-confirm-blocking.test.ts`
- `tests/doc-root-session.test.ts`
- `tests/done-throttle-guidance.test.ts`
- `tests/gate-aware-questions.test.ts`
- `tests/http-envelope-status.test.ts`
- `tests/isolation-router.test.ts`
- `tests/kb-route.test.ts`
- `tests/project-identity.e2e.test.ts`
- `tests/report-routes.test.ts`
- `tests/reqboard/degraded-startup.test.ts`
- `tests/reqboard/settings-e2e.test.ts`
- `tests/reqboard/task-read-root-sync.test.ts`
- `tests/subtask-budget.test.ts`
- `tests/t9-usecase-queue-refactor.test.ts`
- `tests/task-move-batch.test.ts`
- `tests/task-move-role.test.ts`
- `tests/task-status-ledger.test.ts`

### 下一步

复核子卡核对 20 处断码与 4 处无码契约是否都站得住

---
