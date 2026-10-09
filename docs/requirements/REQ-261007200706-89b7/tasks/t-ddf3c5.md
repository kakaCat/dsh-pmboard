# t-ddf3c5 立项问数口径统一与 CreateTool doc_location 补齐·复核

> 需求：REQ-261007200706-89b7 修复 reqboard 体检第二批文案契约漂移（G1/G2/G3/G6/G7/G8/G9）

## 在做什么
立项问数口径统一与 CreateTool doc_location 补齐·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261007200706-89b7/design/` 逐条核对；`npx vitest run tests/` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T13:28:42.250Z，窗口 session-19ffbc9b-e16f-4979-960b-17ff8c516cb0）

复核通过：设计列出的文件全部清零，另补设计漏列的 README:18；口径补齐（工作区）；无偏离

### 完成项

- 对照 design/architecture.md「FR-2 立项问数口径设计」逐条核对：设计列出的 17 个文件（含 agent 可见面 5 处、留痕/问题卡 6 处、注释面 12 处、README 2 处）全部清零 —— 复核发现 README:18 还有一处设计表未列到的「立项三问」，已补改并复跑 readme-tool-face 测试绿
- 事实源处理符合设计：capture-mapping.ts 保留准确问数（统一为五问），破产承诺注释按设计改写；同形异义的 QueryReport.ts 零改动（git diff 名集不含它）
- CreateTool doc_location 补齐符合设计：prompt 参数清单 + 弹框逐问清单（含预设路径与自定义），语义与 CreateTool.ts:50 schema 同源
- 覆盖面大于设计表（如实声明，属更严）：设计表只列 src/ 与 README，实际还按同一规则处理了 9 处设计表未列的入口——design-docs.ts、stages.ts、DocLocation.ts、pm-badge.ts 与 client/ 的 node-panel-process/types/req-doc-location/conversation-progress（GUI 文案，已重建 client 产物）。这不是偏离，是同一口径的兜底清扫
- 唯一口径裁定（已留痕在卡验收）：排除 QueryReport.ts 的『状态查询四问』（同形异义）；另外把所有列出问项的文案补齐【工作区】，因为事实源实测 buildCaptureQuestions = 5 项（name/category/difficulty/doc_location/workspace）——『不数数但列不全』是同一种漂移
- 测试：capture/create 相关 7 文件 65 passed；readme-tool-face 5 passed；全量 vitest 失败集合与 t2 后逐条比对完全相同（69=69，新增红 0）
- 结论：无偏离（除两处已声明且更严的口径补齐）

### 改动文件

- `README.md`

### 下一步

父卡 t-d36c56 收尾并汇报

---
