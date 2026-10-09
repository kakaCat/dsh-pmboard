# t-5acdf4 LONG_TEXT_ARG_NOTE 拆分与十处引用点归位

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
LONG_TEXT_ARG_NOTE 拆分与十处引用点归位

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
1) `grep "拆成多次调用" src/tools` 命中行全部归属保留表（TaskReportTool/AskConfirmTool question/SubmitTool summary）；2) 内联整句复制（未走常量）零命中；3) handoff/task_move/note_interruption/adopt/regenerate/capture 的对应字段 description 不含「拆成多次调用」但保留写法指引；4) `pnpm test` 无新增红

## 实施方案（implementation）
改 src/tools/shared.ts：拆 LONG_TEXT_STYLE_NOTE（写法指引）与 LONG_TEXT_SPLIT_NOTE（；文本过大拆成多次调用），LONG_TEXT_ARG_NOTE = 两者拼接。按设计处置表改 10 处引用点：TaskReportTool.ts、AskConfirmTool/AskConfirmTool.ts:31、SubmitTool/SubmitTool.ts:51 保留全句；CaptureTool/CaptureTool.ts:46、HandoffTool.ts:48、TaskMoveTool/TaskMoveTool.ts:111、NoteInterruptionTool.ts:24、AdoptTaskTool/TaskAdoptTool.ts:50、RegenerateTool/index.ts:47 撤 SPLIT 留 STYLE；8 处内联整句复制全部改回常量拼接

## 上游产出摘要（dependsSummary）
- agent 可见字符串 REQ/FR 历史叙事清零

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T13:44:55.744Z，窗口 session-19ffbc9b-e16f-4979-960b-17ff8c516cb0）

t6 完成：长文本注记按幂等/一次性分两级，危险指引从 6 个一次性工具撤下并加反向锁；四条判据全过

### 完成项

- LONG_TEXT 约定两级化：STYLE（写法指引）+ SPLIT（仅幂等/追加语义成立）+ ARG（拼接兼容）
- 登记表分两张并补洞：幂等表 5 字段（task_report×3 / submit.summary / ask_confirm.question）、一次性表 6 字段（task_move / capture / note_interruption / task_adopt / task_regenerate / **handoff**）；两表不重叠
- 10 处引用点按语义归位，8 处内联整句复制归零（唯一来源恢复）
- 机械反向锁：arg-guidance TC-2b 断言一次性字段不含「拆成多次调用」——危险指引再长回来即红；13 passed
- 运行时 audit 逐字段打印口径（幂等全有 SPLIT / 一次性全无 SPLIT，写法锚点两侧齐备）
- 回归：全量 vitest 新增红 0；typecheck exit 0
- 子卡链：研发 t-de8c5f done + 复核 t-7a8806 done

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

t7（ask_confirm 拦截清单 + budget CAS 描述）

---
