# t-cc3cee 驱动放弃本拍的有界留痕（[WAKE-SKIP]）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
驱动放弃本拍的有界留痕（[WAKE-SKIP]）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
① npx vitest run tests/wake-skip-trace.test.ts 全绿：同因连续 5 拍该窗口恰 1 条、跨冷却窗再 1 条、异因互不影响；② npx vitest run tests/dive-human-gate-stop.test.ts tests/chain-budget.test.ts 全绿（停机判据零变化）

## 实施方案（implementation）
改 src/application/dive/round-driver.ts：新增 noteGiveUp(requirementId, reason) —— captureDiag('[WAKE-SKIP] reason=… req=… status=…') + 同 (需求,原因) 60s 冷却；在弹框在途 / 不可驱动 / 人工门三处放弃点调用（不写台账评论）。新建 tests/wake-skip-trace.test.ts（TC-10）。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T09:58:32.959Z，窗口 session-426ba81b-c952-4c52-8535-7e872ec0c69c）

驱动三处放弃点有了可查且有界的痕迹：同因 60 秒冷却的 [WAKE-SKIP] 只进诊断面，「确认后为什么没起轮」从此读得出来。

### 完成项

- 新建 src/application/dive/wake-skip-trace.ts：留痕器（注入时钟与落痕通道，L1 可穷举）
- 留痕行文 = [WAKE-SKIP] reason=… req=… status=…；reason 为受控闭集三值
- round-driver.ts 三处放弃点接线：不可驱动、弹框在途、人工门开着
- 有界口径：同 (需求,原因) 60 秒冷却；异因、异需求互不影响；边界用严格小于
- 只进诊断面（captureDiag），不写台账评论（防刷屏）
- acceptance ①：npx vitest run tests/wake-skip-trace.test.ts → 8/8 绿，退出码 0
- acceptance ②：dive-human-gate-stop 7/7 + chain-budget 15/15 → 22/22 绿（停机判据零变化）
- 全量：失败 67 ≤ 基线 68；tsc 0 条；层边界清单无新增条目
- 子卡链 4 张全 done（研发 / 联调 / 复核 / 测试）

### 改动文件

- `src/application/dive/wake-skip-trace.ts`
- `src/application/dive/round-driver.ts`
- `tests/wake-skip-trace.test.ts`

### 下一步

t-9bbb25（组合根与心跳装配：清位即驱动、过期即恢复）；t-0c7769 待 confirm-settle.ts 稳定后再动

---
