# S3 测试证据（t-7bb731 · REQ-261007220012-bd29 FR-3）

日期：2026-10-07 · 阶段：测试（test）

## 判据逐条

| # | 判据 | 结果 | 读数 |
|---|------|------|------|
| ① | status 返回体含 run 节（无 active run 时 runId 整键省略不发 null） | 通过 | run-status-tool.test.ts A1~A5；A3 断言 `'runId' in run === false` |
| ② | task_tree(task_id) 返回单卡 task 节；task_id 与 parent_id 同传报 REQBOARD_INVALID_INPUT | 通过 | task-status-ledger B1~B4（B4 为本次新增互斥用例） |
| ③ | `grep -rn "reqboard_run_status\|reqboard_task_status\|RunStatusTool\|TaskStatusTool" src` 零命中 | 通过 | 命中数 = 0 |
| ④ | 指定四文件全绿 | 通过 | run-status-tool + task-status-integration + task-status-ledger + task-tree → 4 files / 20 tests passed |
| ⑤ | 全量 `pnpm test` 失败数 ≤ 基线 | 通过 | 38 failed files / 68 failed tests / 6943 passed；**失败文件 ∩ 本卡触碰测试 = 空集** |

## 全量基线对照（S2 → S3）

```
$ pnpm test
→ Test Files 38 failed | 551 passed | 3 skipped (592)
  Tests     68 failed | 6943 passed | 22 skipped (7033)，exit 1
```

- 相对 S2 收口：**修好** `compat-regression`（并发窗口写目录所致）、`task-status-integration`（本卡重指向后转绿）；
- **新增红 1 个**：`tests/canceled-legacy-read.test.ts` —— 与本卡零文件交集，隔离复跑三次
  2 失败 / 1 通过（告警文案断言受 mtime 缓存/时序影响），判定为**既存 flaky**，非本卡引入。

## 类型检查

```
$ npx tsc --noEmit -p tsconfig.json
（error TS 计数 = 0）
```

## 结论

FR-3 五条判据全部达成：查询面 4→2 落地、旧工具名零残留、降级形状（runId 省略）保留、
互斥与错误判别位与旧契约一致；定向与全量均无本卡引入的红。
