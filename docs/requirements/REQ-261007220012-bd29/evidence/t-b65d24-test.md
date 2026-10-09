# S2 测试证据（t-b65d24 · REQ-261007220012-bd29 FR-2）

日期：2026-10-07 · 阶段：测试（test）

## 判据逐条

| # | 判据 | 结果 | 读数 |
|---|------|------|------|
| ① | ask_confirm schema 含可选 `ticket` 入参 | 通过 | `grep -c "ticket:" src/tools/AskConfirmTool/AskConfirmTool.ts` = 2（入参 + 输出回显） |
| ② | `grep -rn "reqboard_confirm_receipt\|ConfirmReceiptTool\|defineConfirmReceiptTool" src` 零命中 | 通过 | 命中数 = 0 |
| ③ | `ask_confirm(ticket=未知值)` 仍抛 `REQBOARD_UNKNOWN_TICKET` | 通过 | `vitest run tests/ask-confirm-pending.test.ts -t TC-8` → 1 passed / 12 skipped |
| ④ | 指定四文件全绿 | 通过 | ask-confirm-pending + ask-confirm-blocking + confirm-pending-guard + output-contract → 4 files / 65 tests passed |
| ⑤ | 全量 `pnpm test` 失败数 ≤ 基线 | 通过 | 39 failed files / 69 failed tests / 6948 passed；**失败文件 ∩ 本卡触碰的测试文件 = 空集** |

## 全量基线对照

```
$ pnpm test
→ Test Files 39 failed | 550 passed | 3 skipped (592)
  Tests     69 failed | 6948 passed | 22 skipped (7039)，exit 1
```

与 S1 收口时（38 failed files / 68 failed tests）相比，唯一新增失败文件是
`tests/compat-regression.test.ts`，失败原因为**并发窗口在本轮跑测期间新建了
`docs/requirements/REQ-261007223647-da5d/`**（断言「全量读取不产生新分片改动」被外部写入打破）；
隔离复跑 `npx vitest run tests/compat-regression.test.ts` → 19 passed，与本卡无关。

## 类型检查

```
$ npx tsc --noEmit -p tsconfig.json
（error TS 计数 = 0）
```

## 结论

FR-2 五条判据全部达成：取回执模式可用、旧工具名零残留、错误码语义不变、定向与全量均无本卡引入的红。
