# 测试证据（REQ-261003204143-3219）

> 全部命令在工作区根 `/Users/mac/Documents/ai/dsh/dsh-pmboard` 执行，时点 2026-10-03。

## 0. 任务覆盖对照

| 任务 | 覆盖证据节 | covers |
|---|---|---|
| t-597b7c 复现卡（父） | §3 反向演练① | covers: t-597b7c |
| t-edb079 取数调研 | §3 摘除态红/绿输出 | covers: t-edb079 |
| t-6bf6ca 分析 | §3 + 结论见卡文档 | covers: t-6bf6ca |
| t-f054d1 复核 | §1 复跑绿 | covers: t-f054d1 |
| t-52f295 修复卡（父） | §1 §2 §4 | covers: t-52f295 |
| t-c4be54 复现 | §4 反向演练②红/绿 | covers: t-c4be54 |
| t-d26141 修复 | §1 契约用例 3 绿 + §4 tsc 锚点 | covers: t-d26141 |
| t-8fb70b 复核 | §2 三文件 64 绿 | covers: t-8fb70b |
| t-a71498 回归 | §5 全量 pnpm test | covers: t-a71498 |
| t-993fe5 回归测试卡（父） | §2 §5 §6 | covers: t-993fe5 |
| t-ffa854 研发 | §2 四文件 95 绿 | covers: t-ffa854 |
| t-577017 复核 | §2 §4 复核记录 | covers: t-577017 |
| t-6de87b 测试 | §5 pnpm test + §4 tsc | covers: t-6de87b |

## 1. 契约用例（主判据）

```
$ npx vitest run tests/capture-output-contract.test.ts
 ✓ tests/capture-output-contract.test.ts (3 tests)
 Test Files  1 passed (1)   Tests  3 passed (3)
```

## 2. 四文件回归（t3 修订口径，经人批准）

```
$ npx vitest run tests/capture-output-contract.test.ts tests/capture-tool.test.ts \
    tests/tools-schema.test.ts tests/capture-hook.test.ts
 Test Files  4 passed (4)   Tests  95 passed (95)
```

## 3. 反向演练①（摘 schema 声明 → 红 → 恢复 → 绿）

摘除 `answers.properties.workspace` 后：

```
 × 成功路径 … + "\"value.answers.workspace\" is not a declared property (additionalProperties: false)"
 × 取消路径 … + 同上
 Test Files  1 failed (1)   Tests  2 failed (2)
```

恢复后：`Tests 2 passed (2)`。违例文案与 2026-10-03 20:44 生产实测逐字一致。

## 4. 反向演练②（摘 CAPTURE_ANSWER_KEYS 一键 → tsc + 用例双红 → 恢复 → 绿）

```
src/application/internal/capture-mapping.ts(262,7): error TS2353: … 'workspace' does not exist …
src/tools/CaptureTool/CaptureTool.ts(31,3):  error TS2353: … 'workspace' does not exist …
 × 3 用例红（含「键集与 CAPTURE_ANSWER_KEYS 漂移」点名）
```

恢复后：3 passed；`npx tsc --noEmit` 归属本需求三文件错误 = 0。

## 5. 全量回归（无新增失败）

```
$ pnpm test
 Test Files  48 failed | 287 passed | 3 skipped (338)
 Tests  98 failed | 3419 passed | 20 skipped (3537)
```

失败用例数 98 = 说明书登记基线（49 文件 / 98 用例，REQ-261002115204-ba52）。
失败文件清单中本需求三文件（capture-output-contract / capture-tool / tools-schema）均不在列。

## 6. 外部红的归属证据

- `tests/capture.test.ts` 红断言要求文案含「不许沉默」；`grep -rn "不许沉默" src/` 零命中——
  该硬化语被并行窗口的 capture-section.ts 重写删除（其 diff 涉及该文件 115 行改动）。
- 本需求 diff 不触碰 capture-section.ts / capture.test.ts / 任何 prompt 文本。
