# t-da9b73 需求级项标题单点（FR-4）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
需求级项标题单点（FR-4）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/sheet-items-format.test.ts tests/domain/verification-doc.test.ts tests/verification-sheet.test.ts tests/accept-sheet-tool.test.ts 全绿；grep -rn "'需求级验收'" src 只在 src/domain/workflow/AcceptanceSheetSpec.ts 命中；渲染断言：含 E2E 缺口 + 锚点失效两张需求级项时各行标题不相同。

## 实施方案（implementation）
AcceptanceSheetSpec 新增 requirementItemTitle(criterion, gapKind) 单点（含 ANCHOR_GAP_PREFIX / UNVERIFIABLE_PREFIX 两个前缀常量：consistency 按前缀分「锚点失效 / 三方一致性」，无 gapKind 的「不可照着验」按前缀识别）；三处硬编码 '需求级验收' 全部替换（SubmitVerification.ts / verification-doc-writer.ts / AcceptSheet.ts）；tests/sheet-items-format.test.ts 覆盖 TC-4.1~4.3。

## 上游产出摘要（dependsSummary）
- 系统项编号连续化（FR-3）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-09-30T12:35:49.874Z，窗口 session-3643cb19-3ef8-4687-9636-586f8826d1a9）

验收单里「哪一行在说什么」不再靠猜：不同缺口类型各有可区分标题，三处显示用同一口径。

### 完成项

- 需求级项标题收敛为单点 requirementItemTitle（按 gapKind + criterion 前缀区分七种），三处消费点共用
- 用例：tests/sheet-items-format.test.ts + tests/domain/verification-doc.test.ts 合计 17/17；整链用例通过
- 发现并修正一处设计缺口：「不可照着验」项原本也会与普通需求级项同名，已纳入区分（TC-4.2 暴露）
- 子卡链 4 段（研发→联调→复核→测试）全部完成并逐段留证

### 改动文件

- `src/domain/workflow/AcceptanceSheetSpec.ts`
- `src/application/internal/verification-doc-writer.ts`
- `src/application/use-cases/AcceptSheet.ts`
- `tests/sheet-items-format.test.ts`

### 下一步

关闭 t4，进入 t5（端到端回归 + 生产链路自证）。

---
