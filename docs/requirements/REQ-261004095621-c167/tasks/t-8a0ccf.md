# t-8a0ccf 落知识层 pitfall 条目：DSH 席位静默退役判别法

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
落知识层 pitfall 条目：DSH 席位静默退役判别法

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：doc
- 端侧：doc

## 得到什么结果
跑 `pnpm kb:check` 退出码 0；跑 `reqboard_kb(query='席位退役')` 命中该条目且返回其指针；`git status` 显示仅新增 1 个条目文件 + INDEX 一行改动。

## 实施方案（implementation）
写 docs/knowledge/entries/kb-00XX.md（front-matter：id/kind/status/title/one_liner/applies_when/updated/req）+ INDEX.md 追加指针行；完成后跑 pnpm kb:check 验证生成物零漂移与索引合法。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T02:17:03.663Z，窗口 session-d649acde-c276-4061-88cd-a33f5142ef52）

知识层多了一条「坑」：以后谁再遇到「控件点一下就消失」，先按三步判是不是席位崩了、以及是不是装在机器上的客户端自己不一致，而不是先怀疑本仓插件。

### 完成项

- 新增条目 kb-0022（kind=pitfall，status=active，req=REQ-261004095621-c167）
- 写清结论：DSH 非 chain 席位渲染抛一次异常即被退役，席位渲染成空白且不报错
- 写清三步判别法：inspect 看 active/registrant → 控制台取 slot entry crashed 原文 → npm pack 与 app.asar 逐符号对标
- 写清证据与关键哈希（安装版缺 MenuGroup、发布版 rc.2 有 6 处）
- INDEX「坑」节追加一行指针，条目与索引一一对应
- 跑 pnpm kb:build 消除既有生成物漂移，再跑 pnpm kb:check：11 项检查全过、退出码 0
- 验证检索命中：reqboard_kb(query=席位退役) 返回 kb-0022 及其指针 entries/kb-0022.md

### 改动文件

- `docs/knowledge/entries/kb-0022.md`
- `docs/knowledge/INDEX.md`
- `docs/knowledge/code-map.md`
- `docs/knowledge/code-map.symbols.tsv`
- `docs/knowledge/design-tokens.md`
- `docs/knowledge/design-tokens.classes.tsv`

### 下一步

下一张卡：把报告里的取证步骤固化成一条可重放脚本（extract-asar.mjs），并回链报告 §3.1

---
