# t-7fea40 兼容卡与实机复核（旧调用方 / 旧替身 / 界面三处取证）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
兼容卡与实机复核（旧调用方 / 旧替身 / 界面三处取证）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
`npx vitest run tests/open-window-inherit.test.ts -t "兼容"` 全绿（旧替身三项 failed、既有回执键逐字不变）；打开 GUI 侧栏看到新会话标题为「登录重构 (1)」，打开该会话看到模式芯片为创造模式、模型选择器为源窗口同一模型，三处观察记录落 `docs/requirements/REQ-261005151245-54ae/evidence/live-check.md`。

## 实施方案（implementation）
在 `tests/open-window-inherit.test.ts` 加「兼容」分组：旧测试替身（只有 fork 与 create）三项 failed 且开窗成功、既有回执键（success / window_key / parent_session_id / mode / degraded_note / delivery）逐字不变、degraded_note 含「请在侧栏打开」且不含「已打开」；实机复核：在 GUI 源窗口（创造模式 + 非默认模型 + 标题「登录重构」）调 reqboard_open_window，看侧栏标题、打开新窗口看模式芯片与模型选择器，三处观察连同回执三态写进 `docs/requirements/REQ-261005151245-54ae/evidence/live-check.md`。

## 上游产出摘要（dependsSummary）
- 探针与机器自检（回归 + 构建 + 知识层生成物 + 尺寸门禁）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T07:43:42.555Z，窗口 session-30c79856-639c-4483-aed3-a49d3fc99546）

这一步做完，兼容面有机器证据兜底；人只要按核对单看三处，就能给这次交付盖章。

### 完成项

- 兼容三条用例全绿：旧替身三项 failed 不崩溃、既有回执键逐字不变、degraded_note 措辞不动
- 实机核对单就绪（evidence/live-check.md）：侧栏标题 / 模式芯片 / 模型选择器三处 + 记录栏 + 定位顺序
- 如实披露：实机三处观察**尚未由人执行**（agent 拿不到 GUI），已作为验收单项交人工；执行前置是 pnpm build 后重启插件

### 改动文件

- `tests/open-window-inherit.test.ts`
- `docs/requirements/REQ-261005151245-54ae/evidence/live-check.md`

---
