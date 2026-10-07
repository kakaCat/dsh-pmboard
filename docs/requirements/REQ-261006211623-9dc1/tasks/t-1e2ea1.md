# t-1e2ea1 复跑需求面三条判据并留反向演练证据·测试

> 需求：REQ-261006211623-9dc1 需求/设计/拆分三面文档判据门禁加固

## 在做什么
复跑需求面三条判据并留反向演练证据·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-06T14:06:34.096Z，窗口 session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2）

测试段完成：全量读数与归属留痕，严格口径未满足项已响亮报出（非本需求引入）

### 完成项

- npx vitest run --reporter=json 全量：失败 71 条 · 基线 68 条 · 新增 11 · 不再失败 8；落在本批新增测试上的失败 0 条
- npx tsc --noEmit -p tsconfig.json：错误 3 条 · 基线 0 条；3 条全在并发窗口在制的测试文件（query-docs-roots、report-degrade 两处），本批改动文件 0 错
- 新增 11 条失败的归属：client-view 3、error-code-inventory 2、live-tasks-single-source 2、artifact-openable 1、canceled-legacy-read 1、reqboard/settings-init 1、typecheck 1——均为并发窗口在制面，与本需求无交集
- 严格口径未满足如实报出：失败 71 > 基线 68、tsc 3 > 基线 0，不是本需求引入但不得记成通过；链尾卡 t5 在并发改动落地后重跑同一判据
- 全量读数与归属已追加进证据文件 §5

### 改动文件

- `docs/requirements/REQ-261006211623-9dc1/tests/t1-requirement-side-evidence.md`

### 下一步

父卡 t-fe268e 汇总收尾；随后推进 t2–t4 与链尾 t5

---
