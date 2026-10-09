# t-b96bc1 run_status 并入 status、task_status 并入 task_tree（S3）·联调

> 需求：REQ-261007220012-bd29 reqboard 体检第三批工具面精简（27→21，S1~S6）

## 在做什么
run_status 并入 status、task_status 并入 task_tree（S3）·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/run-status-tool.test.ts tests/task-status-integration.test.ts tests/task-status-ledger.test.ts tests/task-tree.test.ts` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-07T14:48:23.770Z，窗口 session-9a0e68f7-2e76-446e-86a3-1ad80d74fb8f）

S3 联调通过：run 节 5 例 + 单卡展开 5 例端到端一致，含互斥与省略路径。

### 完成项

- run 节端到端 5 例：A1 checkpoint+JobsPort / A2 无 JobsPort 如实 not_found / A3 无 checkpoint 时 runId 整键省略且过自身 schema / A4 显式点名不存在需求响亮抛 REQBOARD_REQUIREMENT_NOT_FOUND / A5 未绑定且不传参时 run 键整体省略
- 单卡展开端到端 5 例：B1 in_review 全字段 / B2 无 lastRun 时 run+workflow 缺键 / B3 卡不存在 task.status=not_found 且不编码 / B4 task_id 与 parent_id 互斥报 REQBOARD_INVALID_INPUT（本卡新增测试）/ B5 父子结构模式与合并前逐字一致
- 写→读闭环：report 落盘 lastReport（并写 lastRun stopReason=reported）→ 单卡展开原样读回；磁盘无卡文档时读数仍成立
- 新增 2 条互斥/省略用例并复跑：run-status-tool + task-status-ledger 11 例全绿
- 联调证据落盘 docs/requirements/REQ-261007220012-bd29/evidence/t-b96bc1-integrate.md

### 改动文件

- `docs/requirements/REQ-261007220012-bd29/evidence/t-b96bc1-integrate.md`
- `tests/run-status-tool.test.ts`
- `tests/task-status-ledger.test.ts`

### 下一步

复核子卡：对照设计 §接口契约（status+run 节 / task_tree+task_id）逐条核对。

---
