# S5 证据（t-10e826 / t-214c00 / t-c14abb / t-92324a · REQ-261007220012-bd29 FR-5）

日期：2026-10-07 · 阶段：研发 → 联调 → 复核 → 测试（消命名债，一次改动四阶段同源证据）

## 研发（t-10e826）

`git mv` 改名 + 符号对齐：

| 动作 | 结果 |
|------|------|
| `git mv src/tools/AdvanceTool src/tools/TaskRunTool` | 目录改名 |
| `git mv .../AdvanceTool.ts .../TaskRunTool.ts` | 工厂文件名对齐 |
| `defineAdvanceTool` → `defineTaskRunTool` | registry 扫描键随动（output-contract） |
| `ADVANCE_PROMPT` → `TASK_RUN_PROMPT` | prompt 常量对齐 |
| registry 条目 `key: 'TaskRun'` / dir / factoryFile | 与工具名 reqboard_task_run 对齐 |
| `src/index.ts` / `src/tools/index.ts` | import / register / 再导出同步 |
| 测试 6 文件 | 引用同步（task-run-contract / timeout-routing / tools-schema / concurrency-matrix / error-code-matrix / task-read-root-sync 注释） |

**工具名 `reqboard_task_run` 未变**（对外契约零变化）。

## 联调（t-214c00）

```
registry key=TaskRun · dir=TaskRunTool · factoryFile=tools/TaskRunTool/TaskRunTool.ts
四处口径：registry 21 / 磁盘目录 21 / register 21 / README+package.json 21
```

## 复核（t-c14abb）

| # | 设计条目 | 结论 |
|---|----------|------|
| P-1 | `git mv` 目录改名 | 无偏离 |
| P-2 | registry key/factoryFile/dir 同步 | 无偏离 |
| P-3 | index.ts import 与 register 同步 | 无偏离 |
| P-4 | 工具名不变 | 无偏离 |
| P-5 | 目录集合 == 登记面（I-1）、注册名集合 == 登记面（I-2） | 无偏离（tools-dispatch / apply-wiring 绿） |

偏离登记：**无**。

## 测试（t-92324a）

```
$ ls src/tools/TaskRunTool            → 存在
$ ls src/tools/AdvanceTool            → 不存在
$ grep -rn "AdvanceTool\|defineAdvanceTool\|ADVANCE_PROMPT" src tests → 零命中（注释口径已同步）
$ npx vitest run tests/tools-dispatch.test.ts tests/output-contract.test.ts \
      tests/apply-wiring.test.ts tests/task-run-contract.test.ts
→ Test Files 4 passed (4) / Tests 53 passed (53)
$ npx tsc --noEmit -p tsconfig.json   → error TS 计数 0
```

全量回归：失败文件 ∩ 本卡触碰测试 = 空集（详见本轮 `pnpm test` 汇总）。

## 补记：错误码清单随动（t-92324a 测试阶段发现并修复）

改名的连带面：`tests/fixtures/error-code-inventory.json` 里 6 条大写码的 `site.file`
指向旧路径 `src/tools/AdvanceTool/AdvanceTool.ts`，`error-code-inventory.test.ts` 的
「产生点守卫」当场变红。按该门禁自己给出的修复法刷新：

```
$ npx tsx tests/drill/refresh-error-code-inventory.mts
→ 大写码 133（零覆盖 5）· 小写码 28 · 排除 5；6 条 site.file 指向 TaskRunTool
$ npx vitest run tests/error-code-inventory.test.ts tests/error-code-matrix.test.ts tests/error-code-exempt.test.ts
→ 3 files / 36 tests 全绿
```
