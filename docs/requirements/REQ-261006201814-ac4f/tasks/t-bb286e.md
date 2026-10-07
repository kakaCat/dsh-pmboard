# t-bb286e 堵掉四处仍在写真实工作树的测试点位

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
堵掉四处仍在写真实工作树的测试点位

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
npx vitest run tests/unit/rtm-health.test.ts tests/capture-hook.test.ts tests/plan-footprint-propagation.test.ts tests/plan-footprint-tool-schema.test.ts 退出码 0；且跑完 git status --porcelain 中不出现 .test-rtm-health 前缀的未跟踪项。

## 实施方案（implementation）
修改四处一次性泄漏点位：tests/unit/rtm-health.test.ts 的 <cwd>/.test-rtm-health 改临时根；tests/capture-hook.test.ts 的 JsonQueueRepository 根由 process.cwd() 改临时根；tests/plan-footprint-propagation.test.ts 与 tests/plan-footprint-tool-schema.test.ts 的 rmSync 目标由仓库路径改为临时根内删除。

## 上游产出摘要（dependsSummary）
- 把测试进程关进沙箱：仓内写入由内核拒绝

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T04:51:38.375Z，窗口 session-ec318e7e-5a51-4037-96c2-d70aced8a3ff）

u3 完成：泄漏点位全修，沙箱上线带来的 7 条红清零，测试不再写真实工作树。

### 完成项

- u3 父卡收口：四处仍在写真实工作树的点位全部改走临时根
- 验收达标：四文件 53 用例在沙箱开启下全绿；git status 中 .test-rtm-health 命中 0
- 连锁效果：u1 沙箱引入的 7 条红清零，suite 回到干净状态
- 研发与复核两张子卡均 done

### 改动文件

- `tests/unit/rtm-health.test.ts`
- `tests/capture-hook.test.ts`
- `tests/plan-footprint-propagation.test.ts`
- `tests/plan-footprint-tool-schema.test.ts`

### 下一步

继续批次：u2（契约锚点）、u4（触发矩阵）、u6（基线分诊）可并行开工。

---
