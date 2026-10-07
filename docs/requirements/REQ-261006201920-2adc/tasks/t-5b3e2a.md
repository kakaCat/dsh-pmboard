# t-5b3e2a 领域裁决判据：返工过检 + 结果锚点 + 人工项事实 + 处置模板·研发

> 需求：REQ-261006201920-2adc 让验收不再形式合规：堵住占位符验收与空事实裁决

## 在做什么
领域裁决判据：返工过检 + 结果锚点 + 人工项事实 + 处置模板·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T12:58:52.425Z，窗口 session-e3d59f51-cb6c-463b-9a13-9ddf9325067a）

研发段交付：验收单裁决的四条新判据落在一个既有单一事实源里，目标命令 55 例全绿，RV-3/RV-5 红绿两次留档。

### 完成项

- reworkSpecFor 三级取值：判据原文 → 来源卡标准 → 合成标准，每级都过 checkAcceptance + checkHowToVerify
- ReworkTaskSpec 增 acceptanceSource 与四类继承字段（requirementRefs/prototypeRefs/decisionRefs/footprint）
- 新增 RESULT_ANCHOR（含截图/日志等证据介质）与 HUMAN_FACT；新增 DISPOSITION_TEMPLATE 两义与三个谓词函数
- applyVerdicts 三类项分开判：普通项无锚点记 unverified、人工项无事实即拒、系统项处置未命中模板即拒
- dispositionMissingItems 语义收紧并接入 isFullyDecided 与 sheetGateStatus（处置无效即不放行归档）
- 新增三个用例文件共 25 例；更新两处旧夹具口径（acceptance-sheet 4 处、verdicts-and-rework 5 处）
- 目标命令全绿：5 files / 55 tests passed，exit 0
- git diff --stat：AcceptanceSheetSpec.ts +206-24 行；两个既有测试文件夹具口径更新；三个新文件未跟踪
- 反向演练 RV-3：关掉锚点分支 ⇒ 2 failed exit 1；还原 sha256 逐字节相同、复跑 9 passed
- 反向演练 RV-5：处置退回非空即可 ⇒ 2 failed exit 1；还原 sha256 逐字节相同、复跑 26 passed
- 改动面类型检查零错误（全仓当前也是 0 条）

### 改动文件

- `src/domain/workflow/AcceptanceSheetSpec.ts`
- `tests/rework-gate.test.ts`
- `tests/verdict-result-anchor.test.ts`
- `tests/system-item-disposition.test.ts`
- `tests/domain/acceptance-sheet.test.ts`
- `tests/verdicts-and-rework.test.ts`
- `docs/requirements/REQ-261006201920-2adc/evidence/rv3-anchor-branch-off.txt`
- `docs/requirements/REQ-261006201920-2adc/evidence/rv3-restored-green.txt`
- `docs/requirements/REQ-261006201920-2adc/evidence/rv5-disposition-template-off.txt`
- `docs/requirements/REQ-261006201920-2adc/evidence/rv5-restored-green.txt`

### 下一步

进入 t3 联调段：核对域层导出签名与 design/interfaces.md 逐条一致

---
