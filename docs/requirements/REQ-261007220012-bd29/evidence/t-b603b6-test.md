# S1 测试证据（t-b603b6 · REQ-261007220012-bd29 FR-1）

日期：2026-10-07 · 阶段：测试（test）

## 判据① 活引用零命中

```
$ grep -rl "reqboard_task_execute\|TaskExecuteTool\|defineTaskExecuteTool" src tests README.md \
    | grep -v '^tests/fixtures/'
（无输出）
```

唯一残留：`tests/fixtures/read-sites-v8-ledger.json` 1 处 —— 带 `__provenance`
（source=agent-dh/.dsh-data/dsh-reqboard.json / schemaVersion=8 / revision=5788 / extractedAt）的
**历史台账快照夹具**，属冻结点豁免（复核 D-3），改动它会伪造历史数据。

## 判据② 定向 4 文件全绿

```
$ npx vitest run tests/tools-dispatch.test.ts tests/apply-wiring.test.ts \
      tests/tools-render-coverage.test.ts tests/task-run-contract.test.ts
→ Test Files 4 passed (4) / Tests 20 passed (20)，exit 0
```

## 判据③ 全量回归与基线对照

```
$ pnpm test
→ Test Files 38 failed | 551 passed | 3 skipped (592)
  Tests     68 failed | 6951 passed | 22 skipped (7041)，exit 1
```

**基线对照**：失败文件 ∩ 本卡触碰的测试文件（tools-dispatch / apply-wiring /
tools-render-coverage / task-run-contract / tools-schema / readme-tool-face /
render-summaries / timeout-routing）= **空集**。
失败样本均为其它在飞需求/环境问题：`isolate-node-context`（模块未构建）、
`zero-arg-binding`（dsh-ptc-runtime-node patch 未装）、`design-registration`（REQ-..0eb5 在飞设计）、
`layer-boundary`（batch-1/2 在飞改动）、`size-budget` 等。
本卡唯一引入的红（readme-tool-face 计数派生校验）已在研发阶段随计数同步修复，现为绿。

## 类型检查

```
$ npx tsc --noEmit -p tsconfig.json
（error TS 计数 = 0）
```

## 结论

FR-1 三条判据全部达成：活引用零命中（除冻结夹具）、定向 4 文件 20 例全绿、
全量回归失败集与本卡零交集、类型检查 0 错误。
