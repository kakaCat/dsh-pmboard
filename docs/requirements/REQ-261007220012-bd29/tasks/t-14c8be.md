# t-14c8be confirm_receipt 并入 ask_confirm(ticket)（S2）·研发

> 需求：REQ-261007220012-bd29 reqboard 体检第三批工具面精简（27→21，S1~S6）

## 在做什么
confirm_receipt 并入 ask_confirm(ticket)（S2）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/ask-confirm-pending.test.ts tests/ask-confirm-blocking.test.ts tests/confirm-pending-guard.test.ts tests/output-contract.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T14:38:30.290Z，窗口 session-9a0e68f7-2e76-446e-86a3-1ad80d74fb8f）

S2 研发完成：confirm_receipt 并入 ask_confirm(ticket)，用例零改动、语义不变；定向 5 文件 69 例全绿。

### 完成项

- ask_confirm 工具壳：新增可选 ticket 入参 + 三分派（evidence→confirmArtifact / ticket→confirmReceipt / 否则→askConfirm）；target 由 required 改可选（取回执模式不需要，发起确认仍由用例按路径拒绝）
- 删除 src/tools/ConfirmReceiptTool/ 三文件；src/tools/index.ts、src/index.ts、registry.ts（AskConfirm responseSources 补 ConfirmReceipt.ts）、StageActions.ts 同步；registry/目录/register 四处口径 25
- 取回执语义零损失：ConfirmReceipt 用例判定逻辑未改，仅三条错误消息抬头改为 reqboard_ask_confirm(ticket)；未知 ticket 仍抛 REQBOARD_UNKNOWN_TICKET
- 全仓指路文案改口径（pending-confirm / pending-guard / AskConfirm / SubmitArtifact / capture-section / protocol 注释 / heavy.md 注入片段并重新生成 generated/fragments.ts）
- prompt 重写为三条路径单字面量：含「缺省阻塞」「主动放弃阻塞」「被中止」「全部写路径」，且不再出现被删工具名
- 渲染单入口：删 confirmReceiptSummary（取回执键是 askConfirmSummary 子集），避免为渲染新增输出键
- README 删行 + 计数 26→25；package.json 计数 26→25
- 测试同步 9 个文件：工具等价入口 receiptToolOf、三分派形状断言、消息断言收紧为「不含重新发起的指令」、FACTORIES 17 条、P1 基线夹具重跑

### 改动文件

- `docs/requirements/REQ-261007220012-bd29/evidence/t-14c8be-dev.md`
- `src/tools/AskConfirmTool/AskConfirmTool.ts`
- `src/tools/AskConfirmTool/prompt.ts`
- `src/tools/ConfirmReceiptTool/ConfirmReceiptTool.ts`
- `src/tools/ConfirmReceiptTool/index.ts`
- `src/tools/ConfirmReceiptTool/prompt.ts`
- `src/tools/index.ts`
- `src/index.ts`
- `src/tools/registry.ts`
- `src/tools/render-summaries.ts`
- `src/domain/stage/StageActions.ts`
- `src/application/use-cases/ConfirmReceipt.ts`
- `src/application/use-cases/AskConfirm.ts`
- `src/application/use-cases/SubmitArtifact.ts`
- `src/application/internal/pending-confirm.ts`
- `src/application/internal/pending-guard.ts`
- `src/application/internal/capture-section.ts`
- `src/shared/protocol.ts`
- `src/domain/prompt/fragments/decomposing/heavy.md`
- `src/domain/prompt/generated/fragments.ts`
- `README.md`
- `package.json`
- `tests/ask-confirm-prompt.test.ts`
- `tests/ask-confirm-pending.test.ts`
- `tests/ask-confirm-blocking.test.ts`
- `tests/confirm-pending-guard.test.ts`
- `tests/pending-guard.test.ts`
- `tests/pending-guard-integration.test.ts`
- `tests/status-pending-confirm.test.ts`
- `tests/tools-schema.test.ts`
- `tests/tools-dispatch.test.ts`
- `tests/fixtures/stage-prompts-baseline-p1.json`

### 下一步

联调子卡：核对接线与回执链路的端到端一致性。

---
