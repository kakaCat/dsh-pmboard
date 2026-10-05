# t-c6c6ae 写索引/架构/规范/术语首版内容并通过冷启动问答

> serves: FR-1, FR-2, FR-4, FR-6, FR-8, FR-9（FR→任务 追溯标注；对应测试见 tests/test-evidence.md 的 covers 行）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
写索引/架构/规范/术语首版内容并通过冷启动问答

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：doc
- 端侧：doc

## 得到什么结果
npx tsx scripts/kb-probe.mts 退出码 0（索引 ≤8000 字符且 ≤200 行、四份页面 ≤200 行、规范 100% 挂存在且可跑的校验）；npx tsx scripts/kb-coldstart-probe.mts 输出问答包评分 ≥4/5（A3）并打印两组读入字符数对比。

## 实施方案（implementation）
docs/knowledge/{INDEX,architecture,conventions,glossary}.md：架构页含四层图与依赖方向与扩展点；规范页每条为「一句话 + 校验：命令」（层边界、单文件 ≤400 行、客户端构建纪律、样式归属、注入预算 floor、失败要响亮、产物闸门）；索引含 8 个固定分节与生成区；另写 scripts/kb-coldstart-probe.mts 准备 9 题问答包。

## 上游产出摘要（dependsSummary）
- 写生成器 kb-build（代码地图 + 设计令牌 + 漂移门禁）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史

## 实施现状（开工前必读 · 本窗口 2026-10-01 补充）

- **内容已落地**：`docs/knowledge/{INDEX,architecture,conventions,glossary}.md`（架构页：分层/依赖方向/扩展点；规范页：C-01…C-10 每条挂真实可跑校验；术语页 24 条）。
- **本卡只做「按卡验收 + 补缺口 + 汇报」，不要重写**；验收不过再修。
- 已实测：`npx tsx scripts/kb-probe.mts` 九项全过（索引 601 字符/44 行；四页均 ≤200 行；K8「10 条规范全部挂真实可跑校验」）。
- **待补**：卡里要求的 `scripts/kb-coldstart-probe.mts`（9 题冷启动问答包）**尚未写**——这是本卡剩余工作。
## 汇报 1（2026-10-01T05:07:55.019Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

项目认知的入口建成：一份索引 + 三页人读知识，读入量比「翻 README 加架构文档加源码」少约 9.7 倍。

### 完成项

- 索引 + 架构页 + 规范页（10 条挂可跑校验）+ 术语页落盘
- 冷启动问答包（9 题）与读入成本对比（4199 vs 40545 字符 ≈ 9.7×）
- 自检九项全过；页面与索引均在预算内

### 改动文件

- `docs/knowledge/INDEX.md`
- `docs/knowledge/architecture.md`
- `docs/knowledge/conventions.md`
- `docs/knowledge/glossary.md`
- `scripts/kb-coldstart-probe.mts`

### 下一步

t11 历史回填与回归

---
