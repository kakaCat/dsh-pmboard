# t-de8c5f LONG_TEXT_ARG_NOTE 拆分与十处引用点归位·研发

> 需求：REQ-261007200706-89b7 修复 reqboard 体检第二批文案契约漂移（G1/G2/G3/G6/G7/G8/G9）

## 在做什么
LONG_TEXT_ARG_NOTE 拆分与十处引用点归位·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T13:44:37.922Z，窗口 session-19ffbc9b-e16f-4979-960b-17ff8c516cb0）

研发子卡完成：常量两级化 + 两表分级（含 handoff 纳入）+ 8 处内联复制归位；运行时 audit 与反向锁测试双证

### 完成项

- 常量两级化（shared.ts）：LONG_TEXT_STYLE_NOTE（写法指引）+ LONG_TEXT_SPLIT_NOTE（；文本过大拆成多次调用）+ LONG_TEXT_ARG_NOTE = 两者拼接（保留兼容），注释写清为什么两级
- 登记表分两张（取代原单一清单）：LONG_TEXT_FIELDS = 幂等/追加语义（task_report ×3、submit.summary、ask_confirm.question）；新增 LONG_TEXT_STYLE_ONLY_FIELDS = 一次性副作用（task_move.reason、capture.summary、note_interruption.reason、task_adopt.reason、task_regenerate.reason、**handoff.reason**——handoff 原先只引用常量、不在任何清单里，本卡顺手纳入）；ALL_LONG_TEXT_FIELDS 为并集
- 10 处引用点按语义归位：内联整句复制 8 处全部改为常量拼接（grep 内联整句残留 = 0），handoff 从 ARG 改为 STYLE
- 运行时取证（tsx 打表，按真实 description 而非源码 grep）：幂等 5 字段全有 SPLIT + 写法两锚点；一次性 6 字段全无 SPLIT + 写法两锚点在场
- 测试升级为机械反向锁：tests/arg-guidance.test.ts 新增 TC-2b——对每个一次性字段断言（a）写法两锚点在场（b）**不含**「拆成多次调用」；并加『两表不重叠』『反向非恒真』判据。13 passed
- 判据口径修订（如实声明）：原卡判据 1/2 写的是『grep 源码命中行归属』——常量化之后源码里只剩一处定义，grep 不再能判『哪个字段挂了危险指引』；改为按**运行时 description** 判定（更强：字段级、可反向证伪），判据 3/4 不变
- 回归：全量 vitest 新增红 0（68 = 基线 68）；typecheck exit 0

### 改动文件

- `src/tools/shared.ts`
- `src/tools/TaskReportTool/TaskReportTool.ts`
- `src/tools/AskConfirmTool/AskConfirmTool.ts`
- `src/tools/SubmitTool/SubmitTool.ts`
- `src/tools/CaptureTool/CaptureTool.ts`
- `src/tools/HandoffTool/HandoffTool.ts`
- `src/tools/TaskMoveTool/TaskMoveTool.ts`
- `src/tools/NoteInterruptionTool/NoteInterruptionTool.ts`
- `src/tools/AdoptTaskTool/TaskAdoptTool.ts`
- `src/tools/RegenerateTool/index.ts`
- `tests/arg-guidance.test.ts`

### 下一步

复核子卡：核对分级处置表逐点一致

---
