# t-0ee5d2 产物催办按 kind 聚合+成组确认（N-3）·研发

> 需求：REQ-261003222428-3556 实施链可靠性硬化：锁心跳 + 批内真并行 + depends_on 落库丢失 + 死代码清偿 + 缺口 N-1~N-3

## 在做什么
产物催办按 kind 聚合+成组确认（N-3）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-03T16:50:29.463Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

t7 研发段完成：N-3 闭环——高频产物催办按 kind 聚合成一条、一次确认成组落章、回执如实列出落章清单；人从「点 39 次」变「点 1 次」

### 完成项

- 成组规则收敛为单一事实源：GROUP_CONFIRM_KINDS = design + task_detail + task_output；artifactsToConfirm 三条确认通道（弹框/文字证据/看板一键）同源生效
- 催办聚合：aggregateUnconfirmedLabels——成组 kind 合并为一条「kind×N（成组确认一次清）」，接进 node-input-package 的 openQuestions（agent 注入面不再被 39 条刷屏）
- 落章清单：confirmArtifact 回执新增 stamped（成组盖了几份如实列出）；AskConfirmTool schema 已先声明
- 新增 tests/artifact-group-confirm.test.ts 4 用例：聚合 5→1/单份不成组/5 份一次全 confirmed+stamped/design 成组与首份语义零回归
- 回归：artifact-gates + pending-confirm-ttl + tools-schema 共 83 用例全绿；tsc 归属零错

### 改动文件

- `src/application/internal/artifact-gates.ts`
- `src/application/internal/node-input-package.ts`
- `src/application/use-cases/ConfirmArtifact.ts`
- `src/tools/AskConfirmTool/AskConfirmTool.ts`
- `tests/artifact-group-confirm.test.ts`
- `docs/requirements/REQ-261003222428-3556/tasks/t-0ee5d2.md`

### 下一步

联调段（t-94661d）：三条确认通道与看板路由的成组一致性

---
