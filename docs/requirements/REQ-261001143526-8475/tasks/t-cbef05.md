# t-cbef05 提示词接入：floor 总纲 + 三阶段各一句

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
提示词接入：floor 总纲 + 三阶段各一句

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
node scripts/inline-prompt-fragments.mjs && node scripts/check-prompt-fragments.mjs → 退出码 0；npx vitest run tests/kb-prompt-wiring.test.ts tests/prompt-gates.test.ts → 全绿（三阶段合成文本各含 reqboard_kb）

## 实施方案（implementation）
fragments/common/iron-rules.md 加 3 句总纲（开工前 reqboard_kb(kind='standard') 查规范 / 改完按条目自证 / 收尾沉淀新规范并跑 kb:check）；fragments/{brainstorming,design,implementing}/{light,heavy}.md 各加 1 句阶段专属；新增 tests/kb-prompt-wiring.test.ts 断言三阶段合成文本各含 reqboard_kb；改完重跑 inline-prompt-fragments.mjs。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-01T07:06:48.587Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

三个关键节点会主动提醒 agent：先查规范、改完自证、收尾沉淀——且没有挤破轻档预算。

### 完成项

- 三阶段各加一句 ≤60 字符指引（light + heavy 覆盖），floor 保持与 HEAD 一致
- tests/kb-prompt-wiring.test.ts（9 条）+ prompt-gates 全绿
- 设计偏离记录：原计划在 floor 加总纲，因 light 档 2500 字符上限改为阶段携带

### 改动文件

- `src/domain/prompt/fragments/brainstorming/light.md`
- `src/domain/prompt/fragments/design/light.md`
- `src/domain/prompt/fragments/implementing/light.md`
- `tests/kb-prompt-wiring.test.ts`

### 下一步

t6 兼容回归

---
