# t-4d15ad 端到端回归 + 生产链路自证·研发

> 需求：REQ-260930183951-eb6c 修复验收单自证失败：parentId 投影 + 验收锚点校准 + 系统项编号连续

## 在做什么
端到端回归 + 生产链路自证·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx tsdown -c tsdown.config.mjs 2>&1 | tail -1 含 "Build complete"；npx vitest run 2>&1 | grep "Tests " 失败数 ≤ 103（零新增，实测 103）；npx vitest run tests/sheet-selfproof.test.ts → 1 passed

## 汇报 1（2026-09-30T12:37:19.357Z，窗口 session-3643cb19-3ef8-4687-9636-586f8826d1a9）

三件事做完了：构建通过、全量回归零新增失败、整链自证用例通过；同时如实标注了一处限制——运行中的宿主还没加载这次的新构建，所以「生产链路自证」不能算完成，需要重启一次宿主补上。

### 完成项

- 构建：npx tsdown -c tsdown.config.mjs → Build complete in 1203ms；新 dist/index.mjs = 1,102,507B（旧备份 1,097,736B，确认为新产物）；构建前先备份 dist，中途修复了 AcceptSheet.ts:160 的语法损坏（并发覆写遗留）后重跑成功
- 全量回归：npx vitest run → Test Files 49 failed / 213 passed；Tests 103 failed / 2628 passed / 20 skipped（失败数与施工前基线同为 103，零新增；passed 2607→2628）
- 生产链路自证：改用可复现的整链用例 tests/sheet-selfproof.test.ts（真实 use case + 临时工作区，一次断言 FR-1~FR-4），1 passed
- 如实声明（按本卡验收标准）：宿主于 19:19 加载的是 18:43 的构建，本轮改动（19:21 之后）尚未被宿主加载 → 生产链路自证受限，不得声称通过；补做方式：验收前再重启一次宿主，让新构建生效

### 改动文件

- `tests/sheet-selfproof.test.ts`
- `src/application/use-cases/AcceptSheet.ts`
- `docs/requirements/REQ-260930183951-eb6c/tests/implementation-2026-09-30.md`

### 下一步

复核段：核对自证口径与验收标准的「如实声明」要求一致。

---
