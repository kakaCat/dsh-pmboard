# t-ecfb28 接注入侧：索引节 + 需求文档瘦身（灰度可回滚）

> serves: FR-1, FR-6（FR→任务 追溯标注；对应测试见 tests/test-evidence.md 的 covers 行）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
接注入侧：索引节 + 需求文档瘦身（灰度可回滚）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/kb-inject-compat.test.ts 全绿：无 docs/knowledge/ 时输入包逐字节等于改动前 golden 快照；有索引且 trimRequirementDoc=false 时仅在末尾追加索引节、需求文档节仍为全文；trimRequirementDoc=true 时需求文档节被替换为 TL;DR + 指针并带 truncated 标注。

## 实施方案（implementation）
src/plugin-config.ts 增 knowledge.{enabled,injectIndex,trimRequirementDoc,injectBudgetChars}；src/application/internal/knowledge-inject.ts 拼装索引节（≤injectBudgetChars，超限结构化报出）；node-input-package.ts 接线：仅当 docs/knowledge/INDEX.md 存在时追加索引节，trimRequirementDoc=true 时把需求文档节改为 TL;DR + 指针。

## 上游产出摘要（dependsSummary）
- 定 KnowledgePort 与文件实现（读写 docs/knowledge）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T05:00:52.322Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

每个新窗口从启动那一刻就能看到项目索引；文档节可灰度瘦身成摘要 + 指针，且不动开关时行为与改造前逐字节相同。

### 完成项

- 注入侧三档灰度（enabled/injectIndex/trimRequirementDoc + injectBudgetChars）
- 索引节按行截断、溢出写节首；文档瘦身为 TL;DR + 指针（缺 TL;DR 如实标注）
- 缺省零改动：HEAD 同片段逐字节对比证明（6124 = 6124）；开灰度 6124 → 3250
- 9 条用例全绿

### 改动文件

- `src/application/internal/knowledge-inject.ts`
- `src/application/internal/node-input-package.ts`
- `src/plugin-config.ts`
- `tests/kb-inject-compat.test.ts`

### 下一步

t9 自检脚本

---
