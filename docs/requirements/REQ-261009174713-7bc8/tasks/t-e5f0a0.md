# t-e5f0a0 protocol 与 board-summary 拆半·测试

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
protocol 与 board-summary 拆半·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-09T11:28:32.871Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

测试阶段读数：pnpm test 7211 例、失败 18（拆半前 18、t2 基线 19），失败文件 12 个逐文件与拆半前一致；npx tsc --noEmit 错误 0。

### 完成项

- pnpm test：615 文件 / 7211 例，失败 18、通过 7147、跳过 27
- 与拆半前同类读数逐文件比对：失败文件集合完全相同（12 个），新增 0、消失 0
- 与 t2 基线对比：失败用例 19→18、失败文件 13→12，均不超基线
- npx tsc --noEmit -p tsconfig.json：退出码 0、错误数 0（与基线持平）
- 判据复跑：common 内 core 说明符 0、纯庋 3/3、分层门禁 exit 0、导出面 223 名双向等价
- 本次拆半顺手清掉一条过期白名单（shared/protocol.ts 由 1114 行降为 13 行 barrel）

### 改动文件

- `.worktrees/req-261009174713-7bc8/tests/fixtures/error-code-inventory.json`
- `.worktrees/req-261009174713-7bc8/tests/live-tasks-single-source.test.ts`
- `.worktrees/req-261009174713-7bc8/tests/size-budget.test.ts`

### 下一步

关父卡 t-60bd0d；按依赖序下一步是 t-906317（core 包落位与 import 重写），届时必须把 core 内 16 条临时逃逸边收口成包内相对。

---
