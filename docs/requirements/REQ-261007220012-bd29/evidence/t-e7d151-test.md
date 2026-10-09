# S4 测试证据（t-e7d151 · REQ-261007220012-bd29 FR-4）

日期：2026-10-07 · 阶段：测试（test）

## 判据逐条

| # | 判据 | 结果 | 读数 |
|---|------|------|------|
| ① | reqboard_task_amend 已注册，op=refs/adopt/chain 各一条等价原工具行为测试通过 | 通过 | task-amend-tool（壳层 6 例）+ adopt-task（10 例 op=adopt）+ regenerate-chain + backfill-task-refs（op=refs/chain 走用例）全绿 |
| ② | op 必填参数缺失报 REQBOARD_INVALID_INPUT 且点名该 op 必填集 | 通过 | refs 缺 requirement_refs/reason、adopt 缺 parent_id、chain dry_run:false 缺 task_id/reason 三例断言消息含必填键名 |
| ③ | `grep -rn "reqboard_task_refs\|reqboard_task_adopt\|reqboard_task_regenerate\|TaskRefsTool\|AdoptTaskTool\|RegenerateTool" src` 零命中 | 通过 | 命中数 = 0 |
| ④ | 指定三文件全绿 | 通过 | adopt-task + regenerate-chain + backfill-task-refs 全绿 |
| ⑤ | 全量 `pnpm test` 失败数 ≤ 基线 | 通过 | 38 failed files / 68 failed tests / 6948 passed；**失败文件 ∩ 本卡触碰测试 = 空集** |

## 全量基线对照（S3 → S4）

```
$ pnpm test
→ Test Files 38 failed | 552 passed | 3 skipped (593)
  Tests     68 failed | 6948 passed | 22 skipped (7038)，exit 1
```

- **修好**：`canceled-legacy-read`（S3 时被判既存 flaky，本轮自愈）；
- **新增红 1 个**：`tests/reqboard/settings-init.test.ts`（临时目录路径断言），
  隔离复跑 17 例全通过 ⇒ 与 `canceled-legacy-read` 同类的既存 flaky，
  与本卡零文件交集，非本卡引入。

## 类型检查

```
$ npx tsc --noEmit -p tsconfig.json
（error TS 计数 = 0）
```

## 结论

FR-4 五条判据全部达成：修缮簇单入口可用、三 op 行为等价、必填集点名可读、
工具面 **21 终值达成**（registry / 磁盘 / register / README / package.json 五处一致）。
