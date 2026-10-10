# t-60bd0d protocol 与 board-summary 拆半

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
protocol 与 board-summary 拆半

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
grep -rn "pmboard-core" packages/pmboard-common/src | wc -l == 0；pnpm typecheck 0 error；pnpm test 用例数 ≥ 基线

## 实施方案（implementation）
shared/protocol.ts 拆成 common 的 protocol.ts（纯帧/纯视图）与 core 的 protocol-domain.ts（引用 RequirementStatus/TaskStatus/ArtifactSpec 等）；board-summary.ts 同法；改全部引用方 import。

## 上游产出摘要（dependsSummary）
- 公共包 pmboard-common 落位

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-09T11:28:38.824Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

父卡 t-60bd0d（protocol 与 board-summary 拆半）收官：3340 行协议拆成纯帧半与域关联半，旧路径降为 barrel，导出面 223 名逐名等价，498 个调用点零改动。

### 完成项

- 纯帧半落 packages/pmboard-common/src/protocol.ts（1683 行）：只 import 本包相对路径，无兄弟包说明符
- 域关联半落 packages/pmboard-core/src/protocol-domain.ts（1872 行）：export * 再导出纯帧半，定义只有一处
- board-summary 整份进 core（每行声明都依赖域规则，硬拆会扩大公共面），旧路径留 barrel
- 导出面等价：before 223 名 / after 223 名，双向差集为空
- 判据全过：common 内 core 说明符 0、纯度 3/3、分层门禁 exit 0、typecheck 0
- 测试读数：失败 18 ≤ 拆半前 18 与 t2 基线 19，失败文件集合逐文件一致
- 共用抛出助手收敛到 errors.domainError 单点；过期尺寸白名单条目按门禁规矩清理

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/pmboard-common/src/protocol.ts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-core/src/protocol-domain.ts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-core/src/board-summary-domain.ts`
- `.worktrees/req-261009174713-7bc8/src/shared/protocol.ts`
- `.worktrees/req-261009174713-7bc8/src/shared/board-summary.ts`

### 下一步

父卡可关；下一张按依赖序为 t-906317（core 包落位），t-4238a0（资产四包化）可并行。

---
