# t-ad88fb 弹框只问裁决：有结果就不逼人填

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
弹框只问裁决：有结果就不逼人填

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/verify-item-result.test.ts → 有 result 提问数 1 且零输入可记 passed；needsHuman 题干含理由

## 实施方案（implementation）
AcceptSheet：项有 result 时只抛一问（裁决），题干带 result 与来源；needsHuman 项题干写「需人工确认：<理由>」并保留两问。

## 上游产出摘要（dependsSummary）
- 定契约：验收项带 result 与人工确认标记

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T10:56:16.658Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

弹框卡完成：验收项若已带 agent 结果，弹框只问一次——人点通过即可，不用再抄命令输出；无法自动验证的项写明理由后才要求人填。

### 完成项

- 只问裁决
- 人工项带理由
- 零输入可通过

### 改动文件

- `src/domain/workflow/AcceptanceSheetSpec.ts`
- `src/application/use-cases/AcceptSheet.ts`
- `src/shared/protocol.ts`
- `tests/verify-item-result.test.ts`

### 下一步

t-404edc 兼容 / t-e35027 看板

---
