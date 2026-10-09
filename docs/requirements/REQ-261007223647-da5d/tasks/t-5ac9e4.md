# t-5ac9e4 弹框与工具文案口径归零

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
弹框与工具文案口径归零

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
`grep -rn "三问\|四问" src/tools src/application` 命中 0；submit prompt 含 prototype 类；`pnpm vitest run` output-contract 族测试退出码 0。

## 实施方案（implementation）
CaptureTool/CreateTool prompt、capture-section.ts、volatile-notice.ts 的问数口径对齐 4 问事实源；submit prompt「五类」补 prototype；推荐标记统一为 label 后缀（推荐）（清除 description 里的 Recommended 等写法）。

## 上游产出摘要（dependsSummary）
- 立项弹框四问内容定稿

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T16:19:24.697Z，窗口 session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5）

这张卡做完，凡是被注入给 agent 的立项口径只剩一个版本：四问、算力档位说人话、文件落点看得见，描述里的伪推荐标记绝迹。

### 完成项

- agent 侧的立项弹框说明收敛成一套口径：4 问（名称 / 类型 / 算力档位 / 文件落点），六处不一致的写法（三问/四问/五问混杂、文档位置+工作区分列）全部归零
- 难度问项按 D-6 改述为「算力档位」，并写明它决定投入多少 LLM 算力（不再是四个裸词）
- 推荐标记回到宿主真正认的那一种：选项 label 后缀；description 里的 (Recommended) 式伪标记清除
- submit 提示词的 prototype 类在场（audit 清单里「五类漏 prototype」闭合）
- 证据：grep 「三问|四问」8 处命中全部与事实源一致；grep -c prototype SubmitTool/prompt.ts = 4；output-contract 族 39 例全绿；npx tsc --noEmit 0 错；diff = 8 文件 +144/-56

### 改动文件

- `src/tools/CaptureTool/prompt.ts`
- `src/tools/CreateTool/prompt.ts`
- `src/tools/CreateTool/CreateTool.ts`
- `src/application/internal/capture-section.ts`
- `src/application/internal/volatile-notice.ts`
- `src/application/query/QueryState.ts`
- `src/index.ts`
- `tests/capture.test.ts`

### 下一步

下一张 ready 卡：t-a429de 文档位置红字徽章（用 t12 的根来源读数）；或先做 t-1ca419 票行组件（依赖 t6 已就绪）

---
