# S3 复核证据（t-38f407 · REQ-261007220012-bd29 FR-3）

日期：2026-10-07 · 阶段：复核（review）· 依据：`design/architecture.md` §接口契约：status + run 节 / task_tree + task_id

## 逐条核对（设计 → 实现）

| # | 设计条目 | 结论 | 依据 |
|---|----------|------|------|
| P-1 | status 入参加可选 `requirement_id` / `run_id`（与原运行态查询工具同义同缺省） | 无偏离 | 两键已声明；A1/A4 用例覆盖 |
| P-2 | 返回体加 `run` 节，含 runId/stepIndex/currentSubtaskId/nextReady/jobStatus/pauseReason/autoRun | 无偏离 | 键全部在场（按条件），A1/A2/A3 覆盖 |
| P-3 | 无 active run 时 `runId` 整键省略（不发 null）、不声明 M1 死字段 | 无偏离 | A3 断言 `'runId' in run === false`；schema 无 status/reason |
| P-4 | 能确定目标需求时恒出现；无法定位时整键省略 | 无偏离 | A5（未绑定+不传参 → `'run' in out === false`） |
| P-5 | 原工具三段守卫（未绑定报错 / run_id 反查 / TaskStore 未装配显式失败） | 无偏离 | run_id 反查实现于 runSectionOf；TaskStore 缺失在显式路径抛码；绑定缺省路径省略键 |
| P-6 | task_tree 加 `task_id`，与 `parent_id` 互斥 | 无偏离 | B4（新增用例：错误消息含 REQBOARD_INVALID_INPUT + 互斥） |
| P-7 | 单卡模式返回体挂在 `task` 键下、与旧返回体逐字同形 | 无偏离 | B1/B2/B3；`task.task_id/status/progress/run/report/workflow` |
| P-8 | 错误形状沿用旧口径（TaskStore 未装配 / 卡不存在） | 无偏离 | B3 断言 `task.status='not_found'` + `expectNoCode`（不编码） |
| P-9 | 用例层零改动（queryRunStatus / TaskStatus 映射点不动） | 无偏离 | `queryRunStatus` 未改；`domain/task/TaskStatus.ts` 仅注释改词 |
| P-10 | 删两目录 + registry/index/StageActions/README/package.json 同步 | 无偏离 | 四处口径 23/23/23/23；旧工具名 src 零命中 |

## 偏离登记（不阻断）

- **D-1（新增键，如实登记）**：`run` 节里多了一个 `requirement_id`（设计表未列）。
  理由：`status` 可能同时绑着多条需求，`run` 节必须自述「这是哪条需求的运行态」，
  否则调用方无法把读数与 `open_requirements` 对齐；键名沿用既有 snake_case 风格。
- **D-2（显式/缺省两分）**：设计只写「未绑定报错文案」，未区分显式点名与绑定缺省。
  实现：显式传 `requirement_id`/`run_id` 时失败**抛出**（保住 `REQBOARD_REQUIREMENT_NOT_FOUND`
  既有错误码契约，`tests/error-code-matrix.test.ts` 就靠这条）；绑定缺省路径失败则省略 `run` 键——
  否则一次查询失败会把 status 的绑定自查能力整体拖崩。
- **D-3（单卡模式不做绑定校验）**：与合并前的单卡查询入口一致（它也不校验窗口绑定），
  故未新增绑定门；父子结构模式仍严格按窗口绑定校验（行为不变）。
- **D-4（测试夹具重指向）**：`task-status-integration` 的 TC-I1 期望里补了
  `run: {ok:true, stopReason:'reported'}` 与 workflow 的 `at` 断言——因为报告工具
  （`ReportTask.ts:156-158`，本批未改）本身就会写 `lastRun`，旧断言「无 run」在合并后的
  读取路径上已不成立；这是**如实反映既有行为**，不是放宽判据。
- **D-5（无关第三方红）**：`tests/canceled-legacy-read.test.ts` 的告警文案断言在三次隔离复跑中
  1 次通过、2 次失败（时序/mtime 缓存相关），与本卡零文件交集，判为既存 flaky。

## 复核复跑

```
$ npx vitest run tests/run-status-tool.test.ts tests/task-status-integration.test.ts \
      tests/task-status-ledger.test.ts tests/task-tree.test.ts tests/status-lossless.test.ts \
      tests/tools-status.test.ts tests/tools-schema.test.ts tests/output-contract.test.ts \
      tests/tools-dispatch.test.ts tests/apply-wiring.test.ts tests/timeout-routing-integration.test.ts \
      tests/readme-tool-face.test.ts
→ 12 files / 全绿
```

## 结论

**无阻断性偏离**；D-1~D-5 均为可复核的有意取舍或如实登记（含一处既存 flaky 的隔离判定）。
