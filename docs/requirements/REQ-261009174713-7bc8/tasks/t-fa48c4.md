# t-fa48c4 protocol 与 board-summary 拆半·研发

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
protocol 与 board-summary 拆半·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-09T11:28:13.427Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

拆半落地：protocol.ts 3340 行拆为纯帧半（common 1678 行）与域关联半（core 1862 行），board-summary 整份进 core；旧路径留薄 barrel，498 个 import 点一行未改。

### 完成项

- 新增 packages/pmboard-common/src/protocol.ts（纯帧半）：只 import 本包相对路径，无任何兄弟包说明符
- 新增 packages/pmboard-core/src/protocol-domain.ts（域关联半）：export * 再导出纯帧半，定义只有一处
- 新增 packages/pmboard-core/src/board-summary-domain.ts；board-summary 每条声明都依赖域规则，故无 common 半
- 旧路径 src/shared/protocol.ts 与 board-summary.ts 降为薄 barrel，498 个调用点零改动
- 共用抛出助手 bad 收敛到 pmboard-common/errors.ts 的 domainError 单点（两半各留一个薄别名，不复制实现）
- 跟着代码走的判据同步：live-tasks 收编点表与清单、accept-verdict 镜像断言、legacy-compat 的 TaskRecord 定位、错误码清单重生成
- 尺寸门禁按它自己的规矩清理过期条目：shared/protocol.ts 由 1114 行降为 13 行，白名单条目删除

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/pmboard-common/src/protocol.ts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-core/src/protocol-domain.ts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-core/src/board-summary-domain.ts`
- `.worktrees/req-261009174713-7bc8/src/shared/protocol.ts`
- `.worktrees/req-261009174713-7bc8/src/shared/board-summary.ts`
- `.worktrees/req-261009174713-7bc8/tests/live-tasks-single-source.test.ts`
- `.worktrees/req-261009174713-7bc8/tests/accept-verdict-reason-contract.test.ts`
- `.worktrees/req-261009174713-7bc8/tests/legacy-compat-6749.test.ts`
- `.worktrees/req-261009174713-7bc8/tests/size-budget.test.ts`
- `.worktrees/req-261009174713-7bc8/tests/fixtures/error-code-inventory.json`

### 下一步

交复核子卡 t-fadea9。注：卡面写的「vitest 全绿」按本仓 C-14 口径执行为「失败集不新增」——t1 基线记录的既有失败（含 layer-boundary、compat-regression）本轮未触碰。

---
