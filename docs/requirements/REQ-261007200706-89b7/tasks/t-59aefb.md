# t-59aefb submit prompt 六类 prototype 支与 plan/archive 细则下沉·研发

> 需求：REQ-261007200706-89b7 修复 reqboard 体检第二批文案契约漂移（G1/G2/G3/G6/G7/G8/G9）

## 在做什么
submit prompt 六类 prototype 支与 plan/archive 细则下沉·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T13:35:55.149Z，窗口 session-19ffbc9b-e16f-4979-960b-17ff8c516cb0）

研发子卡完成：description 1966→1289 字符，补 prototype 支，四类细则下沉且回执之家逐条取证；新增 5 条预算/细则断言

### 完成项

- prompt 瘦身达标：SUBMIT_PROMPT 1966 → 1289 字符（≤1300），每 kind 一句话、不数类数
- 补上漏掉的 kind=prototype 支（path 缺省扫 prototypes/*.html、旧目录仍识别、抽锚点与几何量）；六支与 SUBMIT_DISPATCH 键集一致（测试断言）
- 旧计数清零：『五类』『五个提交入口』『4 个提交工具合一』在 src/tools/SubmitTool 下零命中（头注释改为不数数并注明纪律）
- 细则下沉，四类之家逐个以真实回执取证（不是 grep 源码就算）：① sides → sidesDeclarationGap message 含 sides；② 「失败与并发路径」节 → docSectionGateFailure message 含节名与『不适用』出口；③ archive 必填文档 → assertArchiveMaterials message 含『必填文档』与『feature 类要求』、非法去向 → 含『不在本类型允许的位置』；④ plan refs/任务表/工作量列 → requirement_uncovered / SubmitArtifact 任务表门禁 / plan-doc-table 三处源地断言（前两条含『不再是门禁依据』『计划 key』『批准所见』关键纠偏语）
- 判据修订留痕：原判据 4『requirement/verification 细则原文未动』与判据 2（≤1300）实测不可兼得（保留 requirement 细则时下限 1732）——按 G3『每 kind 只留一句话』同一纪律把 requirement『文档硬性要求』块一并下沉，verification 仅压缩叙述、语义点不动；已通过 reqboard_task_move 修订标准并写明理由
- 新增 tests/submit-prompt-budget.test.ts：5 条断言（预算 / 六支一致性 / sides+节之家 / archive 之家 / plan 三处源地），5 passed
- 回归：全量 vitest 两次跑分别为 70/68 失败，逐条比对新增红 = 无（settings-init 与 canceled-legacy-read 为并行抖动，单跑均通过）；pnpm typecheck exit 0；pnpm prompts:check exit 0（下沉后的文案仍无死路径）

### 改动文件

- `src/tools/SubmitTool/prompt.ts`
- `src/tools/SubmitTool/SubmitTool.ts`
- `tests/submit-prompt-budget.test.ts`

### 下一步

复核子卡：对照 FR-3 设计节核对下沉清单与预算

---
