# S2 研发证据（t-14c8be · REQ-261007220012-bd29 FR-2）

日期：2026-10-07 · 阶段：研发（dev）

## 改动清单

| 文件 | 动作 |
|------|------|
| `src/tools/AskConfirmTool/AskConfirmTool.ts` | 加可选 `ticket` 入参；`target` 由 required 改可选（取回执模式不需要）；execute 三分派：evidence → confirmArtifact / ticket → confirmReceipt / 否则 askConfirm |
| `src/tools/AskConfirmTool/prompt.ts` | 重写为「三条路径」单字面量：弹框（缺省阻塞）/ 取回执（ticket）/ 文字证据；不再出现被删工具名 |
| `src/tools/ConfirmReceiptTool/`（3 文件） | 删除（`git rm`） |
| `src/tools/index.ts` | 摘除再导出 + 头注 26→25 |
| `src/index.ts` | 摘除 import 与 register |
| `src/tools/registry.ts` | 摘除 ConfirmReceipt 条目；AskConfirm 的 responseSources 补 `ConfirmReceipt.ts`；头注 25 条 |
| `src/tools/render-summaries.ts` | 删 `confirmReceiptSummary`（取回执键是 askConfirmSummary 的子集，渲染单入口） |
| `src/domain/stage/StageActions.ts` | 删 `reqboard_confirm_receipt` 条目 |
| `src/application/use-cases/ConfirmReceipt.ts` | 三条错误消息的抬头改为 `reqboard_ask_confirm(ticket)`（用例逻辑零改动） |
| `src/application/internal/pending-confirm.ts` · `pending-guard.ts` · `support.ts` | 恢复路径文案：调 `reqboard_ask_confirm(ticket="…")` |
| `src/application/use-cases/AskConfirm.ts` · `SubmitArtifact.ts` · `internal/capture-section.ts` | 同上（中止回执 note / 已自动弹框的下一步指引 / 阶段注入文案） |
| `src/shared/protocol.ts` · `src/index.ts` | 注释口径同步 |
| `src/domain/prompt/fragments/decomposing/heavy.md` | 取回执指引改名；`scripts/inline-prompt-fragments.mjs` 重新生成 `generated/fragments.ts` |
| `README.md` · `package.json` | 删行 + 计数 26→25 |
| 测试 | `ask-confirm-prompt`（改口径）、`ask-confirm-pending`（`receiptToolOf` = ask_confirm）、`ask-confirm-blocking`/`confirm-pending-guard`/`pending-guard`/`status-pending-confirm`（消息断言）、`pending-guard-integration`（工具等价入口）、`tools-schema`（17 条）、`tools-dispatch`（三分派形状断言）、`prompt-baseline` 夹具重跑 |

**用例层零改动**：`ConfirmReceipt.ts` 只有错误消息字符串变化，判定逻辑未动。

## 验证

```
$ npx vitest run tests/tools-dispatch.test.ts tests/ask-confirm-pending.test.ts \
      tests/ask-confirm-blocking.test.ts tests/confirm-pending-guard.test.ts tests/output-contract.test.ts
→ Test Files 5 passed (5) / Tests 69 passed (69)

$ npx vitest run tests/ask-confirm-prompt.test.ts tests/pending-guard.test.ts \
      tests/pending-guard-integration.test.ts tests/status-pending-confirm.test.ts \
      tests/tools-schema.test.ts tests/readme-tool-face.test.ts tests/render-summaries.test.ts \
      tests/tools-render-coverage.test.ts tests/apply-wiring.test.ts tests/prompt-baseline.test.ts
→ 全绿
```

## 关键契约点

- 取回执调用形状：`reqboard_ask_confirm({ ticket })` —— 与旧 `reqboard_confirm_receipt({ ticket })` 逐字等价。
- 未知/过期 ticket 仍抛 `REQBOARD_UNKNOWN_TICKET`（用例未改）。
- 缺 `target` 的**发起确认**调用仍被用例拒绝（REQBOARD_INVALID_INPUT）——schema 放宽不放松语义。
