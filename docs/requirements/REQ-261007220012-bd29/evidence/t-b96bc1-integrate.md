# S3 联调证据（t-b96bc1 · REQ-261007220012-bd29 FR-3）

日期：2026-10-07 · 阶段：联调（integrate）

## 请求样例 → 期望 → 实际

### A. status 的 run 节（原运行态查询入口）

| # | 请求 | 期望 | 实际 |
|---|------|------|------|
| A1 | `status({requirement_id:'REQ-x'})` + checkpoint(run-1, step 3) + JobsPort | `run.runId='run-1' / stepIndex=3 / currentSubtaskId='t-a' / jobStatus='running' / autoRun=true` | ✓ |
| A2 | 同上但无 JobsPort | `run.runId='run-1' / jobStatus='not_found' / autoRun=false`（不伪装运行中） | ✓ |
| A3 | 无 checkpoint | `run` 在场但 **无 `runId` 键**（不是 null）；`jobStatus='not_found'`；过自身 schema | ✓ |
| A4 | 显式点名不存在的需求 | 响亮抛 `REQBOARD_REQUIREMENT_NOT_FOUND`（守住既有错误码契约） | ✓ |
| A5 | 未绑定窗口且不传参 | `run` 键**整体省略**，status 其余小节照常 | ✓ |

### B. task_tree 单卡展开（原单卡查询入口）

| # | 请求 | 期望 | 实际 |
|---|------|------|------|
| B1 | `task_tree({task_id:'t-s1'})`（in_review + lastRun/lastReport） | `task.status='in_review' / progress=85 / task.run.* / task.report.* / task.workflow.*` | ✓ |
| B2 | 卡无 lastRun | `task.run` / `task.workflow` 缺键、不报错、progress=0 | ✓ |
| B3 | 卡不存在 | `success=false` + `task.status='not_found'` + error 含卡号、**不带码** | ✓ |
| B4 | `task_id` 与 `parent_id` 同传 | 错误消息含 `REQBOARD_INVALID_INPUT`，说明二者互斥 | ✓ |
| B5 | 父子结构模式（不传 task_id） | 与合并前逐字一致（parents/subtasks/note/contextPressure） | ✓ |

### C. 写→读闭环（真磁盘 queue.json）

`reqboard_task_report` 落盘 lastReport（并写 lastRun: stopReason='reported'）→ 单卡展开原样读回；
磁盘无任何卡文档时读数仍成立（数据源 = 队列，不是卡文档）。

## 命令与结果

```
$ npx vitest run tests/run-status-tool.test.ts tests/task-status-integration.test.ts \
      tests/task-status-ledger.test.ts tests/task-tree.test.ts tests/status-lossless.test.ts \
      tests/tools-status.test.ts tests/apply-wiring.test.ts
→ Test Files 7 passed (7) / Tests 全绿，exit 0
```

口径：registry 23 / 磁盘 23 / register 23；`status` 与 `task_tree` 的 timeoutMs 均为读档（15s）。
