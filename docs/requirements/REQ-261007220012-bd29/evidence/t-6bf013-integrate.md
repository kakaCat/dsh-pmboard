# S1 联调证据（t-6bf013 · REQ-261007220012-bd29 FR-1）

日期：2026-10-07 · 窗口 session-9a0e68f7 · 阶段：联调（integrate）

## 联调口径

删除 reqboard_task_execute 后，工具的「磁盘目录 / 登记面 / 宿主注册名 / README」四处口径
必须同步收敛到 26；任一处残留即装配或门禁变红。

## 机器读数（`grep` / `find`，2026-10-07 工作树）

| 读数 | 命令 | 期望 | 实际 |
|------|------|------|------|
| 登记面条数 | `grep -c "toolName: 'reqboard_" src/tools/registry.ts` | 26 | 26 |
| 登记面目录条目 | `grep -c "^    dir: '" src/tools/registry.ts` | 26 | 26 |
| 注册调用次数 | `grep -c 'toolsCtx.tools.register(' src/index.ts` | 26 | 26 |
| 磁盘工具目录数 | `find src/tools -maxdepth 1 -type d`（去根） | 26 | 26 |
| 登记面残留 | `grep -c TaskExecute src/tools/registry.ts` | 0 | 0 |
| 目录残留 | `[ -d src/tools/TaskExecuteTool ]` | 不存在 | 不存在 |

## 契约/装配回归（请求样例 → 期望 → 实际）

```
$ npx vitest run tests/apply-wiring.test.ts tests/registry-log.test.ts tests/output-contract.test.ts \
      tests/contract-shapes.test.ts tests/tools-dispatch.test.ts
→ Test Files 5 passed (5) / Tests 63 passed (63)，exit 0
```

- `apply-wiring`：`apply()` 后 `ctx.tools[]` 名单 == `TOOL_REGISTRY` 派生名单（I-2）——少注册或多注册即红。
- `registry-log`：装配日志 `agent tools registered (26)` 与登记面条数一致，名字不重不漏。
- `output-contract`：工厂响应字面量扫描逐条命中（I-3）；被删的 TaskExecute 不再有委托别名例外。
- `tools-dispatch`：磁盘目录集合 == 登记面 `dir` 集合（I-1），且留债表不含已消失目录。

## 定向验收（父卡验收命令）

```
$ npx vitest run tests/tools-dispatch.test.ts tests/apply-wiring.test.ts \
      tests/tools-render-coverage.test.ts tests/task-run-contract.test.ts
→ Test Files 4 passed (4) / Tests ~63 passed，exit 0
```

## 结论

四处口径 26/26/26/26 一致，装配与契约门禁全绿；无残留、无未同步面。
