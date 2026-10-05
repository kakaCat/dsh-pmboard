# t-3fcaa5 写索引/架构/规范/术语首版内容并通过冷启动问答·研发

> 需求：REQ-261001110934-3766 代码知识库能力调研：降 token + 快速理解项目

## 在做什么
写索引/架构/规范/术语首版内容并通过冷启动问答·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx tsx scripts/kb-probe.mts → 退出码 0（K1 索引 ≤8000 字符/200 行、K3 四页 ≤200 行、K8 10 条规范全挂可跑校验）

## 汇报 1（2026-10-01T05:05:45.196Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

新窗口现在真的能「读一份索引就知道项目长什么样」：9 题问答包 + 读入成本对比 9.7×；规范不是口号，每条都挂着能跑的命令。

### 完成项

- docs/knowledge/{INDEX,architecture,conventions,glossary}.md 首版内容：架构页（分层图 + 依赖方向 + 扩展点）、规范页（C-01…C-10，每条挂真实可跑校验）、术语页（24 条）、索引（一句话摘要 + 8 分节 + 生成区）
- scripts/kb-coldstart-probe.mts：固定 9 题问答包 + 两组读入字符数对比（4199 vs 40545 ≈ 9.7×）
- 索引规模：57 行 / 1784 字符（上限 200 行 / 8000 字符）；四份页面均 ≤200 行
- 自检九项全过（含 K8「10 条规范全挂真实可跑校验」）

### 改动文件

- `docs/knowledge/INDEX.md`
- `docs/knowledge/architecture.md`
- `docs/knowledge/conventions.md`
- `docs/knowledge/glossary.md`
- `scripts/kb-coldstart-probe.mts`
- `docs/requirements/REQ-261001110934-3766/evidence/t10-coldstart.txt`

### 下一步

复核：内容准确性与预算

---
