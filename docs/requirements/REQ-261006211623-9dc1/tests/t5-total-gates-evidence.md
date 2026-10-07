# T5 链尾总门证据（REQ-261006211623-9dc1）

covers: t-079d43, t-e59f7c

> 任务卡 `t-079d43`（复跑三条总门并把复核材料与实现对齐）的交付物。覆盖全部 FR-1…FR-8 · 2026-10-06

## 1. 三条总门 + 演练矩阵

```
$ pnpm templates:check                     → exit 0（模板 25 份 OK 25；需求模板 6 类双向一致；文档自检缺口 0）
$ pnpm prompts:verify                      → exit 0（generated/fragments.ts 与片段逐字节一致）
$ npx tsx scripts/req-doc-validate.mts --req REQ-261006211623-9dc1
                                            → 缺口 0、exit 0（判据 9 项：实判 6 / 读数未知 3）
$ npx tsx scripts/reverse-drill-matrix.mts --group hard
                                            → exit 0 · 8/8 ✅（每处改坏真变红、每处还原过 sha256 核对）
$ pnpm build                               → exit 0（dist/index.mjs + lib/client.js 均重建；[verify-client] OK）
$ grep -c requirement_sides_invalid dist/index.mjs          → 1
$ grep -c "clause_criteria_warnings\|DOC_QUALITY_RULES_SINCE" dist/index.mjs → 5
```

## 2. 全量回归集合差（含归因）

```
$ npx vitest run --reporter=json  +  docs/reviews/test-baseline.failures.txt 做集合差
失败 69 · 基线 68 · 新增 9（client-view 3 / error-code-inventory 2 / live-tasks-single-source 2 /
artifact-openable 1 / typecheck 1）——全部落在同工作树并发窗口在制面；本需求引入 0 条
$ npx tsc --noEmit -p tsconfig.json → 错误 1 条（tests/query-docs-roots.test.ts，并发窗口在制）；本需求文件 0 条
```

**严格口径未满足**（69 > 68、tsc 1 > 0）如实报出，不记成通过。

## 3. 宿主生效性（可复验，但会话内不可自证）

`pnpm build` 产物已含本批全部新码（上面两条 grep）；但**运行中的插件是本次会话启动时加载的那版**，
故 `skip_integration_reason` / `dep_reasons` 在会话里进不了 `tasks[]`、新门也尚未在会话里拦人。
宿主重载插件后即生效——这条**在会话内部无法自证**，只能给出可复验命令（上面的 grep + `dist` mtime 对比源码 mtime）。

## 4. 独立评审与已处置项

`docs/requirements/REQ-261006211623-9dc1/reviews/independent-review.md`（结论：有条件通过）的 C1–C6
与连带风险 R2/R3/R4/R7 的逐条处置见 `docs/reviews/doc-quality-gates-2026-10-06.md` §2.4。
其中 **C6（FR-7 零交集判据对 `src/` 落点空转）未修、交人裁定**：扩 `PATH_RE` 会同时改变文件冲突门行为，
属批准计划之外的范围变更。
