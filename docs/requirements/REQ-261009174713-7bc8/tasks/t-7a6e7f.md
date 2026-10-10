# t-7a6e7f 六类型规格快照测试·测试

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
六类型规格快照测试·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-09T11:44:04.067Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

测试阶段读数：pnpm test 7250 例（较 t8 后 +5，即本卡用例）、失败 18 与失败文件 12 与开工前一致；npx tsc --noEmit 错误 0；自检实测红绿往返各一次。

### 完成项

- 本卡验收一：npx vitest run tests/type-spec-snapshot.test.ts → 5/5 全绿
- 本卡验收二（实测）：给 feature 注入一节 rootSectionsDelta → 用例红并点名 feature.requiredSections；重跑生成器还原 → 复绿
- pnpm test：623 文件 / 7250 例，失败 18、失败文件 12——与 t8 后逐文件一致，新增失败 0
- 用例增量对账：7245 → 7250，+5 与新增用例数精确相等
- npx tsc --noEmit -p tsconfig.json：退出码 0、错误数 0
- 复核附加证据：fixture 与 t1 基线逐字节相同；五个被比对字段逐个注入漂移都变红（覆盖无盲区）

### 改动文件

- `.worktrees/req-261009174713-7bc8/tests/type-spec-snapshot.test.ts`
- `.worktrees/req-261009174713-7bc8/tests/fixtures/type-spec-baseline.json`

### 下一步

关父卡 t-960cb2；下一张按计划是 t-cfd8ae（core 类型逻辑单点化）——但它的卡面落点指向 packages/pmboard-core，实际依赖 t12（core 落位），这是个计划口径问题，开卡时要先定序。

---
