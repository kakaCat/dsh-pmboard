# t-b5f41f 兼容口径回归 + 工具 schema 文案

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
兼容口径回归 + 工具 schema 文案

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/tool-schema-board-link.test.ts → 全绿：三处描述含「并定位」且不含「可在会话中点击跳转」；三处 board_link 值仍为 '/dashboard#pmboard?req=' + id 形态（逐字断言）。（可证伪：改任一处产出值 → 用例必红）

## 实施方案（implementation）
改 src/tools/StatusTool/StatusTool.ts:202、src/tools/CaptureTool/CaptureTool.ts:80、src/tools/CreateTool/CreateTool.ts:71 的 board_link.description 为「项目看板链接（点击后在应用内打开看板并定位该需求）」；board_link 的产出字符串在 src/application/query/QueryState.ts:189、src/application/use-cases/CreateRequirement.ts:82、src/application/use-cases/CaptureRequirement.ts:291 一字不改。新增 tests/tool-schema-board-link.test.ts 锁文案与产出字符串；同时核对兼容口径（无 req、尾斜杠、未知 query 键）在计划文档与接口文档一致。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T03:55:26.758Z，窗口 session-168fa441-ba3a-45f8-9240-cfa416e2a4ec）

这张卡做完：回执里那句链接说明不再骗人——旧文案说「可在会话中点击跳转」（点下去 404），现在如实说「点击后在应用内打开看板并定位该需求」，而链接字符串本身一字未动。

### 完成项

- 研发段 t-a55776：三处 board_link 描述改到现状口径（点击后在应用内打开看板并定位该需求），产出值一字未改；新增 8 条契约护栏用例
- 复核段 t-40fa7a：第四个独立子代理只读复核——文案与契约逐字一致、产出值未动、用例可证伪（4 组变异翻红）、无越界；采纳 type 断言补强
- 测试段 t-57b5fe：全量 97 failed（与基线一致，新增失败 0）、tsc 144 与基线一致、本卡文件零 error
- 两条对外生效条件已转 t5：dist/index.mjs 重建后必须含新文案；E2E-1 真机点击通过后该文案才算兑现
- 反向演练 2 组按预期变红且文件逐字节还原

### 改动文件

- `src/tools/StatusTool/StatusTool.ts`
- `src/tools/CaptureTool/CaptureTool.ts`
- `src/tools/CreateTool/CreateTool.ts`
- `tests/tool-schema-board-link.test.ts`

### 下一步

t5（构建 + 端到端联调 + 全量回归）是该需求的最后一张卡，其验收包含 dist 重建取证与真机四步。

---
