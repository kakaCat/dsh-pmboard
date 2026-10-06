# t5 真机对账与全量门禁回归（REQ-261005143615-5ab1）

- 结论：四条验收锚点全部满足（① file-missing 25 → **0**；② 逐条比对 **0 分歧**；③ 真丢失的需求仍如实缺失；④ 读根全不可用 → 全部未判定）。
- 对账口径：**真实台账**（`~/.dsh/reqboard`，json 分片后端）+ **真实磁盘**，走与 HTTP 路由同一条判定代码
  （`ShardedRequirementStore` → `queryDocs`），候选根按 `panels.ts` 的同一口径构造
  （需求声明根 → 附加根 → cwd，去空去重 + 只留存在的根）。
- 为什么不用 curl 打运行中的 GUI：GUI 里的插件是**启动时载入的旧模块**，不重启不会带上本次改动；
  用一次性脚本跑同一段判定，比"打旧包"更能说明改动是否真的修好了。

## ① 不带任何会话：`REQ-261005123641-3982`（归档后那条）

```
$ npx tsx t5-reconcile.mts
① REQ-261005123641-3982（不带会话）
   候选根： ["/Users/mac/Documents/ai/dsh/dsh-pmboard"]
   台账形态： 25 份文档
   state 分布： {"confirmed":9,"pending":16}
   file-missing 计数 = 0
```

- 改前（旧代码、无会话）：`{"file-missing":25}` —— 整列谎报缺失。
- 改后：**file-missing = 0**，状态与落章事实一致。

## ② 候选根含会话根：state 与磁盘逐条比对

```
② 同一需求（候选根含会话根）
   带 absPath 的行 = 25 / 25 · state 与磁盘比对分歧 = 0
```

- 25/25 行都拿到绝对路径；`state` 与 `os.path.exists(absPath)` 逐条一致（**0 分歧**）。

## ③ 回归：文件真丢了的需求不许被"未判定"掩盖

```
③ REQ-260930094139-2d65（文件真丢了）
   候选根： ["/Users/mac/Documents/ai/dsh/dsh-pmboard"]
   state 分布： {"file-missing":37}
```

- 37 份登记文档全部 `file-missing`（该需求目录在盘上确实不存在）——诚实缺失语义原样保留。

## ④ 一个可用根都没有：全部未判定

```
④ 同一需求，强制候选根为空
   state 分布： {"unknown":25}
   带 absPath 的行 = 0
```

- 25 行全部 `unknown`，且**没有任何** `absPath`（不给必然错的路径）。

## ⑤ 门禁

```
$ pnpm build
✔ Build complete
[verify-client] OK  bundle=591550 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
$ grep -c docRootsOf dist/index.mjs   → 7
$ grep -c docsAt dist/index.mjs       → 6
$ npx tsc --noEmit                    → 0 error（退出码 0）
$ npx vitest run tests/query-docs-*.test.ts tests/docs-panel*.test.ts
  → 4 files / 26 + 41 passed
```

- C-11（发版前构建 host + client）：退出码 0，`dist/index.mjs` 已含新符号（`docRootsOf` 7 处 / `docsAt` 6 处）。
- C-12（改客户端必须重建 bundle）：`[verify-client] OK`。
- C-15（类型检查）：0 错误（HEAD worktree `660973e` 基线同为 0）。
- C-14（全量测试与基线比对）：见下方"全量测试"一节（本次运行结果原样粘贴）。

## 附：全量测试（C-14：与基线比对）

```
$ pnpm test            # 本树（含本需求改动 + 同期其它窗口在飞改动）
 Test Files  37 failed | 437 passed | 3 skipped (477)
      Tests  68 failed | 5375 passed | 22 skipped (5465)

$ npx vitest run      # 基线：HEAD worktree（/private/tmp/req-baseline @ 660973e）
 Test Files  42 failed | 382 passed | 3 skipped (427)
      Tests  80 failed | 4541 passed | 20 skipped (4641)
```

**失败集合逐文件比对**（`comm` 两侧 FAIL 列表）：

```
now=37 base=42
=== 只在现在失败（潜在新增）:
 FAIL  tests/apply-wiring.test.ts
 FAIL  tests/move-rollback.test.ts
=== 只在基线失败（本次修好/消失）:
 FAIL  tests/ask-confirm.test.ts / design-completeness-gate.test.ts / design-gate-messages.test.ts
 FAIL  tests/e2e-design-handoff.test.ts / panel-build-frame.test.ts / panel-build-stamp.test.ts / typecheck.test.ts
```

两处"只在现在失败"的根因**都不是本需求改的模块**（本需求只动 QueryDocs / contracts / protocol /
panels 路由 / docs 面板 / 样式分片）：

- `apply-wiring`：断言注册的工具个数（收到 26、期望 25）——同期窗口新增了一个工具，本需求不加工具；
- `move-rollback` TC-7：报 `design_doc_incomplete`（design → decomposing 的设计文档集核验）——属同期窗口在改的门禁链。

即：**本次改动没有引入新增失败**（68 ≤ 基线 80，且失败集合的交集之外两处均有他因）。

