# t-88d6db 并发矩阵：同需求并行动作的拒绝与不串档

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
并发矩阵：同需求并行动作的拒绝与不串档

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
npx vitest run tests/concurrency-matrix.test.ts 连续三次退出码均为 0；且每格都断言了错误码与「台账 revision 只增一次」两条锚点（人为去掉其中一条锚点，演练必须红）。

## 实施方案（implementation）
新增 tests/concurrency-matrix.test.ts：复用 tests/helpers/ledger-probe.ts，覆盖并发相关拒绝路径（并行父卡上限、同需求重复拆分、单飞锁冲突、done 批量关闭节流），每格断言三件套并在并发竞态下断言「只有一个成功、其余带码被拒」，末尾计数断言覆盖格数。
验证：npx vitest run tests/concurrency-matrix.test.ts 全绿，且连跑三次结果稳定（无顺序相关）。

## 上游产出摘要（dependsSummary）
- 越权矩阵：角色 × 动作 × 三件套断言

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
