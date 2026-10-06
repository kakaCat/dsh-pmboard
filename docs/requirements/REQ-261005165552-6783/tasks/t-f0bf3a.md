# t-f0bf3a 反例回归：三组外来原文含占位符时文本字面保真且不抛

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
反例回归：三组外来原文含占位符时文本字面保真且不抛

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
① npx vitest run tests/capture-literal-section.test.ts 退出码 0；② 文件内含三组反例与证伪半（同文本在 interpolate: true 下必抛 malformed prompt variable reference）；③ pnpm typecheck 退出码 0。

## 实施方案（implementation）
新增 tests/capture-literal-section.test.ts（文件头 20 行内带 serves: FR-2）。内置与宿主 renderPrompt 同语义的判据 hostLikeRender：interpolate === false 时原样返回文本；否则扫描完整双花括号变量组，名字不匹配 /^[a-z][a-z0-9_]*$/ 抛 malformed prompt variable reference，名字合法但未注册抛 unknown prompt variable。三组反例：① boundSectionTextFrom 的在制任务 acceptance/description 含占位符；② capturePromptForMessage 的用户消息节选含占位符；③ boundSectionTextFrom 的需求标题含占位符。每组跑两态：开关 true 必抛（证伪半）、开关 false 返回原文本（保真半）且文本逐字含该占位符。

## 上游产出摘要（dependsSummary）
- 在捕获段注册处声明字面量（interpolate 置 false）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T09:08:49.226Z，窗口 session-e0d71427-d591-4f79-ba30-8dcf9ecf8dc4）

这一段做完，什么变了：三类外来原文（任务字段、用户消息、需求标题）里的花括号占位符从此有回归防线——旧语义必炸与新语义保真两侧都被钉住。

### 完成项

- 新增 tests/capture-literal-section.test.ts（6 条用例全绿，含三组反例与两态判据）
- 判据常数与宿主逐字一致，复核段已对照装机产物确认
- 全量套件红数与基线完全相等：37 文件 / 68 用例（改动前后同数）
- 净增通过 8 条（新文件 6 + 接线 2），新增失败 0
- 三段子卡（研发 / 复核 / 测试）全部完成并留汇报

### 改动文件

- `tests/capture-literal-section.test.ts`

### 下一步

下一张卡：重建产物 + 命令级证据（t-bcaf4d）

---
