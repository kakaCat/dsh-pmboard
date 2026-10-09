# t-084edc AdvanceTool 目录改名 TaskRunTool（S5）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
AdvanceTool 目录改名 TaskRunTool（S5）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
① `ls src/tools/TaskRunTool` 存在且 `ls src/tools/AdvanceTool` 不存在；② registry 条目 key=TaskRun、dir=TaskRunTool；③ `pnpm vitest run tests/tools-dispatch.test.ts tests/output-contract.test.ts tests/apply-wiring.test.ts tests/task-run-contract.test.ts` 全绿；④ `pnpm test` 全绿。

## 实施方案（implementation）
`git mv src/tools/AdvanceTool src/tools/TaskRunTool`；工厂 defineAdvanceTool → defineTaskRunTool（文件内导出与 index.ts/prompt.ts 引用同步）；registry.ts 条目 key/dir/factoryFile 改 TaskRun；src/index.ts import 与 register 同步；全仓 grep 残余 AdvanceTool 引用清零（测试文件含 task-run-contract.test.ts）。工具名 reqboard_task_run 不变。

## 上游产出摘要（dependsSummary）
- 修缮簇合一 reqboard_task_amend（S4）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T14:58:51.731Z，窗口 session-9a0e68f7-2e76-446e-86a3-1ad80d74fb8f）

S5 父卡完成：命名债消除，工具面 21（数量不变）。

### 完成项

- FR-5 交付：AdvanceTool → TaskRunTool 目录/工厂/常量全链路改名，工具名 reqboard_task_run 与超时档位不变
- 4 张子卡全 done，证据落盘 evidence/t-084edc-s5.md（合并证据 + 错误码清单随动补记）
- 连带面：error-code-inventory 夹具 6 条 site.file 刷新；错误码三件套 36 例全绿
- 四处口径 21/21/21/21；tsc 0 错误

### 改动文件

- `docs/requirements/REQ-261007220012-bd29/evidence/t-084edc-s5.md`
- `tests/fixtures/error-code-inventory.json`

### 下一步

开 S6：handoff/open_window 公共 schema 常量单源化。

---
