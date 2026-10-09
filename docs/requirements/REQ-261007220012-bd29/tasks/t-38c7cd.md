# t-38c7cd confirm_receipt 并入 ask_confirm(ticket)（S2）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
confirm_receipt 并入 ask_confirm(ticket)（S2）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
① ask_confirm schema 含可选 `ticket` 入参；② `grep -rn "reqboard_confirm_receipt\|ConfirmReceiptTool\|defineConfirmReceiptTool" src` 零命中；③ ask_confirm(ticket=未知值) 仍抛 REQBOARD_UNKNOWN_TICKET；④ `pnpm vitest run tests/ask-confirm-pending.test.ts tests/ask-confirm-blocking.test.ts tests/confirm-pending-guard.test.ts tests/output-contract.test.ts` 全绿；⑤ `pnpm test` 全绿。

## 实施方案（implementation）
AskConfirmTool.ts 加可选 ticket 入参与三分派（evidence→confirmArtifact / ticket→confirmReceipt / 否则→askConfirm，ConfirmReceipt 用例一行不改）；AskConfirmTool/prompt.ts 改写双段（弹框路径/取回执模式）并写明承接 confirm_receipt；render-summaries.ts 保留 confirmReceiptSummary 供取回执模式渲染；删除 src/tools/ConfirmReceiptTool/ 目录；同步 src/index.ts、src/tools/registry.ts、src/domain/stage/StageActions.ts、README.md；tests/ask-confirm-pending.test.ts、tests/ask-confirm-blocking.test.ts、tests/confirm-pending-guard.test.ts、tests/pending-guard.test.ts、tests/pending-guard-integration.test.ts、tests/status-pending-confirm.test.ts 中原打 reqboard_confirm_receipt 的用例改打 ask_confirm(ticket)。

## 上游产出摘要（dependsSummary）
- 物理删除 reqboard_task_execute（S1）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T14:39:34.109Z，窗口 session-9a0e68f7-2e76-446e-86a3-1ad80d74fb8f）

S2 父卡完成：confirm_receipt 并入 ask_confirm(ticket)，用例零改动、语义零损失，工具面 26→25。

### 完成项

- FR-2 交付：confirm_receipt 并入 ask_confirm(ticket)，工具面 26→25；四个子卡（研发/联调/复核/测试）全 done，证据落盘 evidence/
- 用例层零改动（ConfirmReceipt 判定逻辑未动）；未知/过期 ticket 仍抛 REQBOARD_UNKNOWN_TICKET
- 全仓指路文案改口径，src 内旧工具名零命中；README/package.json 计数同步 25
- 判据：定向四文件 65 例、S2 全量触碰面 13 文件全绿；tsc 0 错误

### 改动文件

- `docs/requirements/REQ-261007220012-bd29/evidence/t-14c8be-dev.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-2d1abf-integrate.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-5ad80b-review.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-b65d24-test.md`

### 下一步

开 S3：run_status 并入 status（run 节）、task_status 并入 task_tree（task_id 单卡模式）。

---
