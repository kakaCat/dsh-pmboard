# t-9c3f8a 定 KnowledgePort 与文件实现（读写 docs/knowledge）

> serves: FR-2（FR→任务 追溯标注；对应测试见 tests/test-evidence.md 的 covers 行）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
定 KnowledgePort 与文件实现（读写 docs/knowledge）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果

npx vitest run tests/kb-repository.test.ts 全绿：readEntry('kb-conventions-c-01') 只返回该节、readEntry('kb-0001') 返回整文件；appendEntry 连续两次后索引行数与内容不变；文件缺失返回 undefined 而不抛异常。

## 实施方案（implementation）
src/application/ports.ts 追加 KnowledgePort（indexExists/readIndex/readEntries/readEntry/appendEntry/listArtifacts）；src/adapters/KnowledgeRepository.ts 实现，全部经 DocRepository 端口，不直接使用 node:fs；appendEntry 幂等（同 id 覆盖条目、索引行原位替换）。

## 上游产出摘要（dependsSummary）
- 定知识层领域模型与索引语法（纯函数单点）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T04:25:11.642Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

知识层的读写层完成：能按 id 取条目或页面小节、能幂等追加条目并同步索引行，而且不碰 fs——归档沉淀与工具检索接上它就行。

### 完成项

- KnowledgePort + KnowledgeRepository 落盘（读写 docs/knowledge，全部经 DocRepository）
- readEntry 两式：kb-NNNN 整文件 / kb-<页面>-<锚点> 取该小节（含标题行）
- appendEntry 幂等（同源 req+kind 复用 id），分节落位与生成区边界正确
- 响亮失败：map 类拒绝、索引缺失给修复指引
- 11 条用例全绿；证据 evidence/t2-t3-build-test-output.txt

### 改动文件

- `src/application/ports.ts`
- `src/adapters/KnowledgeRepository.ts`
- `src/domain/knowledge/types.ts`
- `src/domain/knowledge/slug.ts`
- `tests/kb-repository.test.ts`

### 下一步

t3 生成器卡链（代码已落地，待按卡验收）

---
