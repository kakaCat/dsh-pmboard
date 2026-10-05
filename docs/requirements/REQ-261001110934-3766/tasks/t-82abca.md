# t-82abca 接归档闭环：归档提交强制沉淀条目与索引行

> serves: FR-2, FR-3（FR→任务 追溯标注；对应测试见 tests/test-evidence.md 的 covers 行）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
接归档闭环：归档提交强制沉淀条目与索引行

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/kb-archive-deposit.test.ts 全绿：归档后索引对应分节 +1 行且 entries/kb-NNNN.md 存在、front-matter 字段齐全；重复提交幂等（条目覆盖、索引行不重复）；index_entry 为空 → 既有拒绝且 docs/knowledge/ 零变化。

## 实施方案（implementation）
src/application/use-cases/DepositKnowledge.ts（分配 kb-NNNN、写条目、追加索引行、失败抛错不静默）+ src/application/internal/knowledge-id.ts（编号从索引最大值 +1）；在 SubmitArchive.ts 的归档记录写入后调用；index_entry 缺失沿用既有拒绝，不新增拒绝点。

## 上游产出摘要（dependsSummary）
- 定 KnowledgePort 与文件实现（读写 docs/knowledge）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T04:56:27.101Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

知识从此会自己长：走完一次归档，结论就变成一条可检索的条目；失败会响亮报错，不会出现「台账说归档了、知识层却是空的」。

### 完成项

- 归档即沉淀：条目 + 索引行自动生成（有 retro→pitfall）
- 幂等（同源复用 id）；空 index_entry 沿用既有拒绝且知识层零变化
- 先沉淀再写台账（失败响亮）；未装配知识层不阻断归档
- 7 条新用例 + 既有归档 12 条零回归

### 改动文件

- `src/application/use-cases/DepositKnowledge.ts`
- `src/application/use-cases/SubmitArchive.ts`
- `tests/kb-archive-deposit.test.ts`

### 下一步

t8 注入侧灰度

---
