# t-bdc766 死代码清偿（删四文件三测试）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
死代码清偿（删四文件三测试）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
grep -rn 「StartSubtaskChain|backgroundRunner|CheckpointManager|scheduleBatches」 src/ 输出零命中；npx tsc --noEmit 本需求文件零新错；pnpm test 失败数 ≤ 基线 98

## 实施方案（implementation）
① grep 确认四符号生产零引用；② 删除四源文件+tests/unit/{start-subtask-chain,background-runner,batch-scheduler}.test.ts；③ 删 tests/auto-chain-approval.test.ts 里的死代码登记注释（已清偿）；④ 全量回归

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-03T16:10:42.264Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

t4 完成：两代链实现并存终结——旧代三文件及测试删除（约 600 行），写集逻辑活在现役 advance-parallel，全量回归与基线逐文件一致

### 完成项

- 删除约 600 行死代码：StartSubtaskChain/background-runner/batch-scheduler + 三专属测试；checkpoint-manager 因 run_status 活引用按逃逸条款保留并登记
- 零引用判据：四符号 src/ 全仓零命中；tsc 归属零错
- 全量回归：98 failed 与基线逐文件一致（diff exit 0），零新增
- 注释清偿：auto-chain-approval 的死代码登记更新为已删除并注明移植去向

### 改动文件

- `tests/auto-chain-approval.test.ts`
- `docs/requirements/REQ-261003222428-3556/tasks/t-bdc766.md`

### 下一步

剩余四卡：t3 依赖防线+指纹、t5 wake 活性、t6 绑定留痕、t7 催办聚合（互相独立）

---
