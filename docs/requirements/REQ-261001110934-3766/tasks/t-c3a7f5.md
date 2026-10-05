# t-c3a7f5 写只读工具 reqboard_kb 与检索用例（预算有闸）

> serves: FR-5（FR→任务 追溯标注；对应测试见 tests/test-evidence.md 的 covers 行）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
写只读工具 reqboard_kb 与检索用例（预算有闸）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/kb-tool-budget.test.ts 全绿：budgetChars=300 → truncated=true 且 items 仅含 title/oneLiner/pointer；budgetChars=1500 → 返回总字符 ≤1500；三选择器全空或 limit=999 → REQBOARD_INVALID_INPUT；既有 20 个工具 schema 快照不变。

## 实施方案（implementation）
src/application/use-cases/QueryKnowledge.ts + src/application/internal/knowledge-budget.ts（预算不足只回指针、不返回碎片正文）；src/tools/KnowledgeTool/{KnowledgeTool,prompt}.ts（schema 与 design/interfaces 一致，description 写死短文案以稳定缓存前缀）；src/tools/index.ts 注册第 21 个工具。只读，不加 assertNoPendingConfirm。

## 上游产出摘要（dependsSummary）
- 定 KnowledgePort 与文件实现（读写 docs/knowledge）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T04:52:03.565Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

少 token 认知的落脚点通了：Agent 按 id/关键词取一条结论，紧预算只给指针；全量符号与类名留在 TSV 里按需查，永不常驻上下文。

### 完成项

- 只读工具 reqboard_kb（预算有闸：指针保底、正文受预算）
- 机器索引按需检索（符号 / 类名 TSV 不进上下文）
- 组合根接线 + 第 21 个工具注册；既有 20 个 schema 未动
- 9 条用例 + 真实数据冒烟留档

### 改动文件

- `src/application/use-cases/QueryKnowledge.ts`
- `src/application/internal/knowledge-budget.ts`
- `src/tools/KnowledgeTool/KnowledgeTool.ts`
- `src/index.ts`

### 下一步

t7 归档即沉淀

---
