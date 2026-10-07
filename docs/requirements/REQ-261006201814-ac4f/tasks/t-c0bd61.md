# t-c0bd61 红基线分诊：反向子集单列 + 逐条红因 + 只减不增

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
红基线分诊：反向子集单列 + 逐条红因 + 只减不增

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
npx vitest run tests/baseline-triage.test.ts 退出码 0；且 npx tsx tests/drill/triage-baseline.mts 输出差集为空、退出码 0；反向演练：往 docs/reviews/test-baseline.failures.txt 追加一条假失败后重跑该用例必须红（还原后必须绿）。

## 实施方案（implementation）
新增 docs/reviews/test-baseline.reverse.txt：从现行 docs/reviews/test-baseline.failures.txt 的 68 条里挑出反向/异常路径子集，逐行「文件 :: 用例全名」，与 failures.txt 逐字同格式。
新增 docs/reviews/test-baseline.other.txt：其余条目，同格式。
新增 docs/reviews/test-baseline.reverse.notes.md：front-matter 记 reverse_count 与 other_count，正文表逐条给「红因类别 / 红线内可达性 / 证据」，红因类别用受控枚举（src-debt / assertion-shape / fixture-drift / order-dependent / unknown）。
新增 tests/baseline-triage.test.ts：断言 reverse 与 other 的并集等于 failures（双向）、两集合互斥、notes 的用例列等于 reverse.txt、表头计数等于两文件实际行数、红因类别命中枚举、两集合计数与 unknown 条数只减不增。
新增 tests/drill/triage-baseline.mts：输出差集报告（新增/消失各几条并点名），只报告不落盘。
验证：npx vitest run tests/baseline-triage.test.ts 全绿；npx tsx tests/drill/triage-baseline.mts 报告差集为空。

## 上游产出摘要（dependsSummary）
- 冻结错误码口径：扫描器 + 清单 + 漂移守卫

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
