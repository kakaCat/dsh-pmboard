# t-a0e60b 适配器实现（读画像 / 写标题 / 写模型 / create 透传模式）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
适配器实现（读画像 / 写标题 / 写模型 / create 透传模式）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
`npx vitest run tests/open-window-inherit.test.ts -t "SessionWindowOpener"` 全绿（断言 projections 入参、空串按缺失、宿主抛错原文透出、selectModel 不带 reasoningEffort、create 请求体含与不含 agentPreset 两形态）；`npx vitest run tests/open-window-tool.test.ts tests/open-window-project-root.test.ts` 全绿。

## 实施方案（implementation）
`src/adapters/SessionWindowOpener.ts` 新增三个方法：readProfile(sessionId) 调 sessionController.projections 一次读全 title / agentPreset / modelSelection.next（空串与缺键按缺失；三项都缺返回空对象；服务不可用或宿主抛错即抛错）、rename(sessionId, title)、selectModel(sessionId, selection)（reasoningEffort 缺省时不带该键）；createRequestOf 透传 opts.agentPreset（与 workspaceId / cwd 的互斥规则逐字不变）；构造函数与「服务按调用时解析」风格不变。用例补在 `tests/open-window-inherit.test.ts`（假宿主服务断言调用入参与抛出原文）。

## 上游产出摘要（dependsSummary）
- 契约与继承模块（端口三方法 + 标题递增 + 落定编排）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T07:39:11.962Z，窗口 session-30c79856-639c-4483-aed3-a49d3fc99546）

这一步做完，插件真的会去读源窗口的画像、会写标题与模型了——而且读不到时会如实说读不到，不会假装源窗口本来就没有。

### 完成项

- 适配器三方法落地：readProfile 一次 projections 读全三样、rename、selectModel
- 读不到就抛（服务未装配 / 宿主抛错 / 会话不存在），读到但三项都缺返回空对象；绝不静默返回 undefined
- create 请求体透传 agentPreset，与落点字段正交（互斥规则只针对 workspaceId 与 cwd，逐字不变）
- reasoningEffort 缺省时不带该键；空串与纯空白一律按缺失
- 九条适配器级用例（假宿主服务）断言入参、抛出原文、两形态请求体；既有开窗与项目根套件全绿

### 改动文件

- `src/adapters/SessionWindowOpener.ts`
- `tests/open-window-inherit.test.ts`

### 下一步

本卡收口；实现细节见 design/backend.md §适配器实现口径。

---
