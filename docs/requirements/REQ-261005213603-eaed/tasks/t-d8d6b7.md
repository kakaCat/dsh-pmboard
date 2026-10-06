# t-d8d6b7 在旧红线处标注取代关系

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
在旧红线处标注取代关系

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：doc
- 端侧：doc

## 得到什么结果
① grep -n "REQ-261005213603-eaed" docs/architecture/client-running-indicator.md docs/requirements/REQ-261004210128-283d/design/data-model.md 两处均命中（TC-23/TC-24）。② grep -n "executions\[\].outcome" docs/architecture/client-running-indicator.md 仍命中（TC-25：执行记录判据未被解禁）。③ git diff --stat 显示改动仅新增标注行（283d 两份文档的既有结论段落零改动）。

## 实施方案（implementation）
改 docs/architecture/client-running-indicator.md：判据节与红线节各加一条取代标注（advanceLockAt 已由 REQ-261005213603-eaed 取代为正式判据，附判据表达式与阈值出处 src/domain/limits.ts 的 advanceLockStaleMs；executions[].outcome === 'running' 仍禁用）。改 docs/requirements/REQ-261004210128-283d/design/data-model.md 与 docs/requirements/REQ-261004210128-283d/design/architecture.md：同样就地加标注，不修改该需求的验收结论、D-x 表与历史正文。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T15:36:24.976Z，窗口 session-dd10c7bd-90d5-4256-8036-cbe2c0a49733）

t4 完成：旧红线标注取代关系且不删历史，子卡链两段全绿

### 完成项

- 三处旧红线就地加取代标注：架构篇、283d data-model、283d architecture
- 历史原文逐字保留（三处 diff 均为纯新增：10/0、4/0、4/0）
- executions 判据的禁用表述仍在（TC-25 命中），未被解禁
- FR-6 两条 grep 断言均命中（架构篇 3 处、data-model 2 处）
- 子卡链两段（研发 → 复核）全部走完；复核段还抓出并闭环了一处自身偏离
- 副产物：模块头注「不伪造」段同步更新，让代码注释与判据不再互相矛盾

### 改动文件

- `docs/architecture/client-running-indicator.md`
- `docs/requirements/REQ-261004210128-283d/design/architecture.md`
- `docs/requirements/REQ-261004210128-283d/design/data-model.md`

### 下一步

t5：兼容、回滚与交付基线三项核验

---
