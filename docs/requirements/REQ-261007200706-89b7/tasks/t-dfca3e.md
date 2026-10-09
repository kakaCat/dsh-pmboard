# t-dfca3e 立项问数口径统一与 CreateTool doc_location 补齐·研发

> 需求：REQ-261007200706-89b7 修复 reqboard 体检第二批文案契约漂移（G1/G2/G3/G6/G7/G8/G9）

## 在做什么
立项问数口径统一与 CreateTool doc_location 补齐·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T13:28:11.413Z，窗口 session-19ffbc9b-e16f-4979-960b-17ff8c516cb0）

研发子卡完成：25 个源文件 + README + 测试文案的问数口径统一（事实源唯一），CreateTool 补 doc_location；全量回归零新增红

### 完成项

- 批1（agent 可见面）：CaptureTool/prompt.ts、CreateTool/prompt.ts、CaptureTool/CaptureTool.ts、CreateTool/CreateTool.ts、capture-section.ts、QueryState.ts、GateCatalog.ts、GateSpec.ts、support.ts（含台账留痕模板）、CreateRequirement.ts、CaptureRequirement.ts、doc/客户端可见文案（node-panel-process/types/req-doc-location/conversation-progress/pm-badge/DocLocation）全部改为不数问数
- 批2（注释面 + README）：index.ts、protocol.ts、pm-capture-root.ts、advance-draft.ts、volatile-notice.ts、design-docs.ts、difficulty-mapping.ts、stages.ts 注释 + README:12 口径对齐
- 事实源归一：capture-mapping.ts 内部口径统一为「五问」，并撤掉已破产的『与三处注入文案同一份口径』承诺，改写为『问数只由 CAPTURE_QUESTION_IDS 记账，文案一律不数问数』（附 FR-2 出处）
- CreateTool/prompt.ts 补 doc_location：弹框逐问清单补【需求文档位置】（含预设路径与自定义相对目录），手工路径参数清单补 doc_location 与回落语义（与 CreateTool.ts:50 schema 同源）；顺带把「三值」改为「取值」
- 枚举补全（防『不数数但列不全』）：所有列出问项的文案补齐【工作区】（实测 buildCaptureQuestions = 5 项：name/category/difficulty/doc_location/workspace）
- 验收判据 1：grep 三问/四问/五问（排除同形异义的 QueryReport.ts）仅命中 capture-mapping.ts ✔；判据 2：同形异义排除理由已在卡上留痕 ✔；判据 3：doc_location 在 CreateTool/prompt.ts:15 命中且语义同源 ✔；判据 4：capture/create 相关 7 个测试文件 65 passed / 2 failed，其中 capture.test.ts『不许沉默』经 stash 对照确认为既有红（非本卡引入），create-delegated-owner 措辞断言已同步后转绿 ✔
- 回归：全量 vitest 失败集合与 t2 后逐条比对 = 完全相同（69=69，新增红 0）；pnpm typecheck exit 0；pnpm prompts:check exit 0（探针扩面后文案仍无死路径）；pnpm build:client OK（GUI 文案改动已重建）

### 改动文件

- `src/application/internal/capture-mapping.ts`
- `src/application/internal/capture-section.ts`
- `src/application/internal/support.ts`
- `src/application/internal/advance-draft.ts`
- `src/application/internal/volatile-notice.ts`
- `src/application/internal/design-docs.ts`
- `src/application/query/QueryState.ts`
- `src/application/use-cases/CreateRequirement.ts`
- `src/application/use-cases/CaptureRequirement.ts`
- `src/tools/CaptureTool/prompt.ts`
- `src/tools/CaptureTool/CaptureTool.ts`
- `src/tools/CreateTool/prompt.ts`
- `src/tools/CreateTool/CreateTool.ts`
- `src/shared/protocol.ts`
- `src/wiring/pm-capture-root.ts`
- `src/http/routers/stages.ts`
- `src/index.ts`
- `src/domain/gate/GateSpec.ts`
- `src/domain/gate/GateCatalog.ts`
- `src/domain/prompt/difficulty-mapping.ts`
- `src/domain/requirement/DocLocation.ts`
- `src/domain/text/pm-badge.ts`
- `src/client/node-panel-process.ts`
- `src/client/types.ts`
- `src/client/req-doc-location.ts`
- `src/client/conversation-progress.ts`
- `README.md`
- `tests/capture-tool.test.ts`
- `tests/create-delegated-owner.test.ts`
- `tests/pm-question-badge.test.ts`
- `tests/session-progress.test.ts`
- `tests/capture.test.ts`

### 下一步

复核子卡：对照 design/architecture.md FR-2 设计节逐条核对改动面

---
