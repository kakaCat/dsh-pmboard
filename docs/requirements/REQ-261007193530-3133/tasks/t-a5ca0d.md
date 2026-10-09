# t-a5ca0d 修复 throttleRemainingMs 读数 clamp 到 [0, throttleMs]（FR-4）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
修复 throttleRemainingMs 读数 clamp 到 [0, throttleMs]（FR-4）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
grep -n -A2 "throttleMs - (now" src/domain/workflow/DoneEvidenceSpec.ts 可见 Math.min/Math.max clamp；pnpm vitest run tests/done-throttle-guidance.test.ts 通过：未来时间戳读数 ≤ 60000、正常历史读数不变

## 实施方案（implementation）
src/domain/workflow/DoneEvidenceSpec.ts doneThrottleRemainingMs：`const left = throttleMs - (now - h.at)` 改为 `const left = Math.max(0, Math.min(throttleMs, throttleMs - (now - h.at)))`。tests/done-throttle-guidance.test.ts 新增用例：h.at = now + 30000 → 返回 ≤ 60000（= throttleMs）；h.at = now - 10000 → 返回 ≈ 50000（行为不变）

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T12:00:29.921Z，窗口 session-38e57340-14d5-41ff-9f88-98f0f69b0191）

FR-4 交付：节流读数恒在 [0, 60s]，时钟漂移不再给出不可能值

### 完成项

- M6 修复：doneThrottleRemainingMs 单条读数 clamp [0, throttleMs]
- 回归：tests/done-throttle-guidance.test.ts 新增 3 条，9 条全绿
- 反证：回退 clamp 该用例即红；正常历史读数不变

### 改动文件

- `src/domain/workflow/DoneEvidenceSpec.ts`
- `tests/done-throttle-guidance.test.ts`

### 下一步

无（待链尾总验收卡收口）

---
