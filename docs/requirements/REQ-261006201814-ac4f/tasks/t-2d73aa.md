# t-2d73aa 反向演练脚本：改坏 → 判据必红 → 逐字节还原

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
反向演练脚本：改坏 → 判据必红 → 逐字节还原

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
npx tsx tests/drill/reverse-drill-error-codes.mts 退出码 0（五条演练全部如预期变红且已逐字节还原）；且跑完 git status --porcelain 中不出现演练目标文件的改动；范围自检验证：把某条 target 改成不存在的路径后重跑必须退出码 1。

## 实施方案（implementation）
新增 tests/drill/reverse-drill-error-codes.mts：按 design/interfaces.md 的 Drill 数据契约实现五条演练（码矩阵断码断言 / 豁免棘轮 / 清单守卫 / hermetic 根 / 基线分诊）；纪律照抄 scripts/reverse-drill-matrix.mts——文件级备份 + sha256 校验恢复、禁用按路径检出还原、改坏期间检测到并发写入则放弃还原并响亮报错、跑前做目标存在性范围自检；支持 --json 与 --keep。
验证：npx tsx tests/drill/reverse-drill-error-codes.mts 退出码 0，且跑完后 git status 里不残留演练改动。

## 上游产出摘要（dependsSummary）
- 不可触发码的豁免白名单与棘轮守卫
- 红基线分诊：反向子集单列 + 逐条红因 + 只减不增

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
