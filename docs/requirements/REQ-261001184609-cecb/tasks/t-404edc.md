# t-404edc 兼容与迁移：旧单、旧调用方、回滚

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
兼容与迁移：旧单、旧调用方、回滚

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/verify-item-result.test.ts → 旧单/旧写法两种兼容路径各一条用例通过

## 实施方案（implementation）
旧验收单无 result → 行为与今天一致（人填）；旧 evidence 无 :: → 不绑定；提供关闭解析的开关即回到旧行为。

## 上游产出摘要（dependsSummary）
- 定契约：验收项带 result 与人工确认标记

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T10:57:23.877Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

兼容卡完成：老验收单/老证据写法的行为与今天完全一致；agent 回填不会冲掉人工复核过的结果；出问题一行配置即回旧口径。

### 完成项

- 三条兼容承诺 + 回滚开关
- 9 条用例绿

### 改动文件

- `src/domain/workflow/AcceptanceSheetSpec.ts`
- `src/application/use-cases/SubmitVerification.ts`
- `tests/verify-item-result.test.ts`

### 下一步

t-e35027 看板

---
