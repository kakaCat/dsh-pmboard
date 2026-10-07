# t-ef6a16 弹框侧接线（题干形态提示 + 回执分派）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
弹框侧接线（题干形态提示 + 回执分派）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/accept-result-question-wording.test.ts 退出码 0；断言题干同时含命令 / 路径 / 计数三类形态词，且 anchor_missing 回执含锚点补法

## 实施方案（implementation）
在 src/application/use-cases/AcceptSheet.ts：第 2 问题干追加 ACCEPT_RESULT_FORM_HINT；回执 note 改为 unverifiedSummaryOf + unverifiedAdviceOf 拼装，删掉写死的「点了通过却没结果」句。在 tests/accept-result-question-wording.test.ts 追加题干与回执断言。

## 上游产出摘要（dependsSummary）
- 裁决侧写降级原因并在人工自填无锚点时拒绝
- 新建回执文案单点 VerdictNotices

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T09:01:53.680Z，窗口 session-38ae86c9-f5e0-4468-b77d-d9426842eebe）

弹框侧接线完成：题干写明形态要求，回执按真实原因分派补法；并记下弹框通道原因缺席这一已知差异。

### 完成项

- 第 2 问题干追加单点形态常量，含命令/路径/计数与样例
- 未复核回执改为 summary + advice，按真实原因分派补法
- reason 取值：单一原因才传，混合或老数据走中性措辞
- 回执键集未变；既有 91 条断言零改动
- 本窗口复跑 4 文件 87 passed、typecheck 退出码 0
- 记入文档的新发现：弹框通道留空点通过路径不落 unverifiedReason

### 改动文件

- `src/application/use-cases/AcceptSheet.ts`
- `tests/accept-result-question-wording.test.ts`
- `docs/requirements/REQ-261007160829-1991/requirement.md`

### 下一步

接 t7（HTTP 接线，进行中）与 t8（契约钉死）。

---
