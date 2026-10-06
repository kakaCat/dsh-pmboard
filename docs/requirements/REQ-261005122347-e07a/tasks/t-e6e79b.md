# t-e6e79b brainstorming 注入「原型工作原则」节·研发

> 需求：REQ-261005122347-e07a 需求分析阶段：收录 UI 提示词（MIT）并按引用交付原型 subagent

## 在做什么
brainstorming 注入「原型工作原则」节·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T05:00:48.265Z，窗口 session-6caf9382-cd78-46cf-a397-d723c7103292）

这一步做完，需求分析节点在做界面类需求时会收到一小节硬指引：要做原型就派子代理去做，子代理拿两条绝对路径自己去读规范、自己检索，主 agent 不背全文也不背数据。这一节可以随预算被裁掉，而且只加在重档上，不占轻档的地方。

### 完成项

- 新增「可裁难度档追加节」槽：<阶段>/<难度>-extra.md，只被同难度的路由壳挂上
- 落点改判（经人裁定）：原计划落在类型档会撞破 light 的 2500 字符上限，改落 heavy 专属槽
- 原型工作原则节落到 heavy-extra.md：五要素齐（何时做/必须派子代理/两个入口路径/检索命令模板/红线与产物落点）
- 该节 691 字符（≤1200 上限）；不侵占 light（light 仍 ≤2500）
- 重生成注入产物与 P1 基线快照，一致性门禁 exit 0
- 新增 10 条用例：五要素、无占位符、字符上限、**可裁反向演练**、只进 heavy、不是孤岛
- 自测：npx vitest run tests/skills-injection.test.ts → 10 passed
- 自测：11 份提示词相关用例文件 327 passed（含 light 上限与路由壳不变量）

### 改动文件

- `src/domain/prompt/fragments/brainstorming/heavy-extra.md`
- `scripts/inline-prompt-fragments.mjs`
- `src/domain/prompt/generated/fragments.ts`
- `tests/fixtures/stage-prompts-baseline-p1.json`
- `tests/skills-injection.test.ts`
- `docs/requirements/REQ-261005122347-e07a/notes/nonfloor-drill.md`

### 下一步

联调：与投放工具配合，确认注入里的命令模板能在真实投放根上跑通

---
