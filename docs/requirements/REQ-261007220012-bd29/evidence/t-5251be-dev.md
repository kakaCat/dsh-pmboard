# S3 研发证据（t-5251be · REQ-261007220012-bd29 FR-3）

日期：2026-10-07 · 阶段：研发（dev）

## 改动清单

| 文件 | 动作 |
|------|------|
| `src/application/query/QueryState.ts` | 新增 run 节编排（`runSectionOf`）：原运行态查询工具的定位/降级口径逐步搬入；`queryState` 收 `args`；返回体加 `run` 键 |
| `src/tools/StatusTool/StatusTool.ts` | 入参加可选 `requirement_id` / `run_id`；output.schema 加 `run` 对象（9 键）；description 写明承接 |
| `src/application/use-cases/TaskTree.ts` | 加单卡展开：`executeTaskTree` 重载 + `singleCardOf`（原单卡查询工具逻辑平移，含 TASK_STATUS_PROGRESS 映射）；新增 `SingleCardResult` 类型 |
| `src/tools/TaskTreeTool/TaskTreeTool.ts` | 入参加 `task_id`；schema 加 `task_id` + `task{task_id,status,progress,run,report,workflow}`；摘要单卡分支复用 `taskStatusSummary` |
| `src/tools/RunStatusTool/`、`src/tools/TaskStatusTool/`（4 文件） | 删除（`git rm -rf`，含工作树中另一需求的本地改动） |
| `src/tools/index.ts` / `src/index.ts` / `src/tools/registry.ts` | 摘除两工具导出/注册/条目；计数 25→23（头注同步） |
| `src/domain/stage/StageActions.ts` | 删两个工具名条目 |
| `src/tools/render-summaries.ts` | `taskStatusSummary` 保留并**被单卡分支复用**（不再是被删工具的私产） |
| 指路文案 | `AdvanceTool/prompt.ts` 改为「用 reqboard_status 的 run 节 / 用 reqboard_task_tree」；`TaskTreeTool/prompt.ts` 改口径；注释里的旧工具名全部改写（FR-3 grep 零命中） |
| `README.md` · `package.json` | 删两行 + 计数 25→23 |
| 测试 | `run-status-tool.test.ts`（改打 status 的 run 节，保留 null 事故 schema 闸门）、`task-status-ledger.test.ts` / `task-status-integration.test.ts`（改打 task_tree(task_id)，含 report 写 lastRun 的如实断言）、`error-code-matrix`（改打 status）、`timeout-routing-integration`（改打 status/task_tree）、`tools-schema`（15 条）、`tools-dispatch`（摘留债） |

## 关键口径

- **run 节**：能定位目标需求时恒出现；无 active run → `runId` 整键省略（不发 null，保留 2026-09-27 事故的修复形状）。
- **显式 vs 缺省**：显式传 `requirement_id`/`run_id` 时失败**响亮抛出**（保住
  `REQBOARD_REQUIREMENT_NOT_FOUND` 既有错误码契约）；走窗口绑定的缺省路径失败 → run 键省略，
  status 的其余小节照常可用。
- **单卡展开**：与 parent_id 互斥（互斥违约 → 错误消息带 REQBOARD_INVALID_INPUT 并说明）；
  错误分支保留旧判别位 `task.status = not_found` 且**不编错误码**（既有消费者契约）。

## 验证

```
$ npx vitest run tests/run-status-tool.test.ts tests/task-status-integration.test.ts \
      tests/task-status-ledger.test.ts tests/task-tree.test.ts tests/status-lossless.test.ts \
      tests/tools-status.test.ts tests/tools-schema.test.ts tests/output-contract.test.ts \
      tests/readme-tool-face.test.ts tests/tools-dispatch.test.ts tests/apply-wiring.test.ts \
      tests/timeout-routing-integration.test.ts
→ Test Files 12 passed (12) / Tests 129 passed (129)

$ npx tsc --noEmit -p tsconfig.json
→ error TS 计数 0
```

四处口径：registry 23 / 磁盘目录 23 / register 23 / README+package.json 23。
