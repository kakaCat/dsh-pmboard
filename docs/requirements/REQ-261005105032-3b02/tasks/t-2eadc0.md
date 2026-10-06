# t-2eadc0 验收单加 prototype-compare/decision-compare 两支并同步三处 taskId 分支·研发

> 需求：REQ-261005105032-3b02 UI 需求必须在需求阶段交付原型产物并让原型可判定（门禁 + 唯一权威版本 + 锚点追溯）

## 在做什么
验收单加 prototype-compare/decision-compare 两支并同步三处 taskId 分支·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T05:55:09.545Z，窗口 session-5632659d-bfcb-4fc2-9b1a-94f3557f6daf）

研发段：验收单第一次会主动要求「与原型对照截图」和「与裁定逐条对照」——验收不再靠印象，而是逐项对照。

### 完成项

- 验收项来源增两支：原型对照与裁定对照，判据逐字对齐设计
- 组装规则：UI 需求且已登记原型才出原型对照项；有裁定条目才出裁定对照项，并带条目编号
- 已豁免原型的需求不强制该项，改渲染一行豁免说明且不阻塞提交
- 缺原型对照项即拒，内部码与传输码齐备，错误消息带可执行锚点
- 三处来源分支同步：弹框表头、两处追溯集成都改走单点映射，删掉会退化成未知编号的兜底
- 面板核验行加来源属性，列结构与行数不变
- 按实测补第 4 个消费点（超出卡面清单，不改则类型检查非 0）
- 13 条新用例全绿、邻域 11 文件 148 例全绿、typecheck 0、客户端构建通过

### 改动文件

- `src/domain/workflow/AcceptanceSheetSpec.ts`
- `src/application/use-cases/SubmitVerification.ts`
- `src/application/internal/accept-sheet-rtm-integration.ts`
- `src/application/internal/status-rtm-integration.ts`
- `src/application/use-cases/AcceptSheet.ts`
- `src/client/views/panels/docs.ts`
- `src/client/stage-panel.ts`
- `tests/accept-sheet-rtm-integration.test.ts`
- `tests/accept-sheet-tool.test.ts`
- `tests/acceptance-criteria.test.ts`

### 下一步

联调段：核验四处消费点喂新来源都不退化（表头无 undefined、追溯无未知编号）。

---
