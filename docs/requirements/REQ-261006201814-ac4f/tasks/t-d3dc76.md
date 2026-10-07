# t-d3dc76 迁移与兼容回归：既有用例零语义变更 + 改前改后读数

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
迁移与兼容回归：既有用例零语义变更 + 改前改后读数

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：doc

## 得到什么结果
npx vitest run tests/compat-req-261006201814.test.ts 退出码 0；pnpm baseline:check 退出码 0（失败集合差为空）；docs/reviews/REQ-261006201814-ac4f-readings.md 在场且含改前改后两组读数与工作树指纹；git diff --name-only 中 src 前缀命中数为 0。

## 实施方案（implementation）
新增 tests/compat-req-261006201814.test.ts：断言兼容三条——① src 零改动（只读 git 命令统计 src 前缀命中数为 0）；② 既有测试文件的 expect 删除数为 0、it 标题改写数为 0；③ docs/reviews/test-baseline.failures.txt 条目数不增加。
产出改前/改后读数（反向断言数、反向占比、零覆盖码数、假阴性率）并附同刻工作树指纹，写进 docs/reviews/REQ-261006201814-ac4f-readings.md。
D-7 处置：给出 REQ-000001 与 REQ-000002 两个方案的结论与影响面（是否删目录 / 改合成 id），本卡只出结论不改目录。
验证：npx vitest run tests/compat-req-261006201814.test.ts 全绿；pnpm baseline:check 退出码 0。

## 上游产出摘要（dependsSummary）
- hermetic 进程内写入守卫 + 一次性泄漏点位修复
- 反向演练脚本：改坏 → 判据必红 → 逐字节还原
- 41 处 success=false 升级为断码（上半：工具回执类）
- 41 处 success=false 升级为断码（下半：弹框/状态/降级类）
- 并发矩阵：同需求并行动作的拒绝与不串档
- 空输入矩阵：空串/缺字段/空集合的拒绝语义

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
