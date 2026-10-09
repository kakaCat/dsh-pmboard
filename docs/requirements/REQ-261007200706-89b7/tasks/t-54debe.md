# t-54debe submit prompt 六类 prototype 支与 plan/archive 细则下沉·复核

> 需求：REQ-261007200706-89b7 修复 reqboard 体检第二批文案契约漂移（G1/G2/G3/G6/G7/G8/G9）

## 在做什么
submit prompt 六类 prototype 支与 plan/archive 细则下沉·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261007200706-89b7/design/` 逐条核对；`npx vitest run tests/` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T13:36:11.783Z，窗口 session-19ffbc9b-e16f-4979-960b-17ff8c516cb0）

复核通过：下沉清单逐条有回执之家、预算 1289≤1300、门禁零改动；声明两处与设计表述的差异

### 完成项

- 逐条对照 design/architecture.md「FR-3 submit 描述瘦身与细则下沉设计」：① description 目标形态（开头不数类数、每 kind 一句话）✔；② prototype 支在场 ✔；③ 预算 ≤1300 实测 1289 ✔；④ 新增预算断言用例 ✔
- 下沉清单逐条核对（原 description 的每一条规则都能在回执里找到全文）：requirement_refs 唯一覆盖通道 → content-gate-wiring.ts requirement_uncovered（含『文档覆盖表不再是门禁依据』纠偏）；dep_reasons → plan-deps-check.ts 的 dependency_warnings（提示语自带写法）；计划文档任务表覆盖 tasks[].key → SubmitArtifact.ts 任务表门禁（含『批准所见』）；「验收」「工作量」列 → plan-doc-table.ts plan_doc_warnings；stages/template/skipIntegration(+Reason) → tasks[] schema 参数描述；archive 必填文档与合法去向 → protocol.assertArchiveMaterials（含分类限定与 rule.note）
- 与设计表述的差异（如实声明，均属『落点更准』而非丢规则）：设计把 plan 细则指向 artifact-gates.ts、archive 细则指向 SubmitArchive.ts；实际落点分别是判定单点 content-gate-wiring.ts / plan-deps-check.ts / plan-doc-table.ts 与 protocol.assertArchiveMaterials —— 规则全文都在，且更靠近产生拒绝码的那一行
- 超出设计表的一处（已按同一纪律 + 标准修订留痕）：requirement 的『文档硬性要求』块也下沉。理由是预算硬约束（保留原文时实测下限 1732 > 1300）且该块同属细则、回执之家完整（sidesDeclarationGap / docSectionGateFailure 的 message 比原文更详细）
- prototype 支文案略去『并提示迁移』半句——该信息仍在 schema path 参数描述里（同样 agent 可见，改一处不影响信息量）；作为披露列出，不算偏离
- 门禁代码零改动：本卡只改 src/tools/SubmitTool/{prompt,SubmitTool}.ts + 新增测试，全部拒绝码与判定逻辑天然逐字未变（满足『code 不变』）
- 证据：tests/submit-prompt-budget.test.ts 5 passed；全量 vitest 新增红 0（settings-init / canceled-legacy-read 为并行抖动，单跑通过）；typecheck / prompts:check exit 0
- 结论：无偏离（除已声明的落点差异与 requirement 块下沉）

### 下一步

父卡 t-ee9299 收尾并汇报

---
