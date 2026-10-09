# S2 复核证据（t-5ad80b · REQ-261007220012-bd29 FR-2）

日期：2026-10-07 · 阶段：复核（review）· 依据：`design/architecture.md` §接口契约：ask_confirm + ticket 取回执模式

## 逐条核对（设计 → 实现）

| # | 设计条目 | 结论 | 依据 |
|---|----------|------|------|
| P-1 | 入参加可选 `ticket` | 无偏离 | `parameters.properties.ticket` 已声明（工具面）；调用形状 `ask_confirm({ticket})` |
| P-2 | 分派顺序 evidence → ticket → 弹框 | 无偏离 | execute 三行式；`tests/tools-dispatch.test.ts` 静态钉住两段分派形状 |
| P-3 | 返回体零新增键（ConfirmReceipt 键是子集） | 无偏离 | 返回体实测键全部落在既有 schema；无新声明键 |
| P-4 | 删除 `src/tools/ConfirmReceiptTool/` 与注册/清单同步 | 无偏离 | 目录已删；registry/目录/register 三处 = 25 |
| P-5 | ConfirmReceipt 用例原样复用 | 无偏离 | 用例仅错误消息字符串改名，判定逻辑未动（diff 可见） |
| P-6 | 未知/过期 ticket 仍 `REQBOARD_UNKNOWN_TICKET` | 无偏离 | TC-8 / 跨窗口 / 过期基准三例复跑绿 |
| P-7 | 指路文案不再指向旧工具（FR-2 grep 零命中） | 无偏离 | `src/` 内 `reqboard_confirm_receipt` 零命中（含注入片段与恢复路径文案） |

## 偏离登记（不阻断）

- **D-1（必要放宽）**：`target` 由 `required: true` 改为可选。
  理由：绑定层按 schema 强制 required，而取回执模式只传 ticket（设计明写「语义与今 ConfirmReceiptTool 一致」）——
  不放宽则 `ask_confirm({ticket})` 在绑定层就被 `ToolArgsError: missing property target` 拒，FR-2 不可达。
  语义未放松：发起确认路径的 `target` 仍由 `AskConfirm` / `ConfirmArtifact` 用例校验并拒绝
  （`REQBOARD_INVALID_INPUT`），复核时以「缺 target 的弹框调用仍被拒」为准。
- **D-2（渲染简化）**：设计写「取回执模式走 confirmReceiptSummary（按分派路径选择）」，
  实现改为**单渲染入口** `askConfirmSummary` 并删除 `confirmReceiptSummary`。
  理由：render 只拿得到返回值，而设计同时要求「返回体零新增键」——没有可判路径的判别键，
  「按路径切换图标」无法实现；取回执的全部键（confirmed/advanced/from/to/user_choice/user_feedback）
  都是 askConfirmSummary 已覆盖的键，渲染信息不丢失。**设计意图（渲染不丢信息）达成，实现方式收敛为一条。**
- **D-3（历史断言收紧）**：`pending-guard.test.ts` / `confirm-pending-guard.test.ts` 原断言
  「恢复路径文案不含 `reqboard_ask_confirm`」，其意图是**禁止引导重新发起确认**（双框事故第三条文案源）。
  取件口并入后该字符串必然出现，断言收紧为「不含 `重新发起 reqboard_ask_confirm`」——意图保留、措辞随合并更新。
- **D-4（夹具重跑）**：`tests/fixtures/stage-prompts-baseline-p1.json` 按既有流程
  `node scripts/dump-stage-prompts.mjs` 重跑更新（注入片段 heavy.md 的取回执指路改名所致）。
  该文件头注写明「文本按设计演进时显式重跑，diff 即变更留痕」，属流程内动作。

## 复核复跑

```
$ npx vitest run tests/tools-dispatch.test.ts tests/ask-confirm-pending.test.ts \
      tests/ask-confirm-blocking.test.ts tests/confirm-pending-guard.test.ts tests/output-contract.test.ts \
      tests/ask-confirm-prompt.test.ts tests/pending-guard.test.ts tests/pending-guard-integration.test.ts \
      tests/status-pending-confirm.test.ts tests/tools-schema.test.ts tests/readme-tool-face.test.ts \
      tests/prompt-baseline.test.ts tests/render-summaries.test.ts
→ 全绿
```

## 结论

**无阻断性偏离**；D-1~D-4 均为可复核的有意取舍，其中 D-1 是 FR-2 可达的必要条件、D-2 已如实收敛并保留设计意图。
