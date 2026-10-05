# t-79d3db 接归档闭环：归档提交强制沉淀条目与索引行·研发

> 需求：REQ-261001110934-3766 代码知识库能力调研：降 token + 快速理解项目

## 在做什么
接归档闭环：归档提交强制沉淀条目与索引行·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/kb-archive-deposit.test.ts → 7 passed；且 src/application/use-cases/SubmitArchive.ts 含 depositArchiveKnowledge 调用（grep -c 该名 ≥1）

## 汇报 1（2026-10-01T04:53:11.354Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

归档不再是「材料放进目录就完了」——提交那一刻结论就变成一条可检索的知识条目，而且失败会响亮报错，不会出现台账说归档了、知识层却没有。

### 完成项

- DepositKnowledge 用例：分配 kb-NNNN、写条目、按归档材料推断 kind（有 retro→pitfall）
- SubmitArchive 接线：**先沉淀再写台账**（写失败即抛错，不留半截状态）；未装配知识层不阻断归档
- 归档评论合并写入「知识层：已沉淀 kb-N」或「未沉淀（原因）」

### 改动文件

- `src/application/use-cases/DepositKnowledge.ts`
- `src/application/use-cases/SubmitArchive.ts`

### 下一步

联调：真实归档路径 + 既有归档用例回归

---
