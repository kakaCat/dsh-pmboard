# t-3cf3f0 回归：五项断言与基线不劣化

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
回归：五项断言与基线不劣化

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
npx vitest run tests/verify-item-result.test.ts → 5/5 绿；pnpm test 失败数 ≤ 106；npx tsc --noEmit 错误数 ≤ 212

## 实施方案（implementation）
固化 A1–A5：result 落库、只问一问、无结果仍 unverified、needsHuman 文案、老写法不绑定；跑全量基线与类型检查。

## 上游产出摘要（dependsSummary）
- 兼容与迁移：旧单、旧调用方、回滚
- 看板接线：展示结果与需人工确认

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T10:59:53.401Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

回归卡完成：五项核心断言 + 回滚开关 + 契约同步锁全部固化；两条基线与本需求开工前一致（tsc 212 / pnpm test 106 失败），新增 10 条用例全绿。

### 完成项

- 10/10 用例
- 基线与开工前一致
- 契约同步有测试兜底

### 改动文件

- `tests/verify-item-result.test.ts`

### 下一步

提交验收材料

---
