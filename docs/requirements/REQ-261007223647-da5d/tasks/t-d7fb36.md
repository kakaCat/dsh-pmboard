# t-d7fb36 立项弹框四问内容定稿·复核

> 需求：REQ-261007223647-da5d P1：弹框与确认门体验优化

## 在做什么
立项弹框四问内容定稿·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261007223647-da5d/design/` 逐条核对；`npx vitest run tests/capture-tool.test.ts` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T15:57:49.567Z，窗口 session-3a744c5e-7560-408e-8db1-5f27fecc8150）

复核完成：卡内四条验收判据逐条对照通过；同时如实记录两处遗留（链模板默认展开联调子卡、工作区存量失败）。

### 完成项

- 对照卡内验收逐条自查：首项 label 以（推荐）结尾且等于 titleOptions[0] ✓、✖️ 居末 ✓、问项总数 4 ✓、题干含理由行 ✓
- 复核发现并记录：计划期未给本卡声明 skipIntegration，链模板默认展开联调子卡（已按无接口面如实收尾）
- 遗留提示（不属本卡）：仓库工作区存在他人未提交改动，全量套件有 68 项存量失败，与本卡契约面无交集

### 改动文件

- `tests/capture-tool.test.ts`
- `tests/pm-question-badge.test.ts`
- `tests/capture-output-contract.test.ts`

### 下一步

测试子卡：跑 capture 契约测试并留证据

---
