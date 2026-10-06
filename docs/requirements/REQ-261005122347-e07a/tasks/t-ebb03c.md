# t-ebb03c brainstorming 注入「原型工作原则」节

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
brainstorming 注入「原型工作原则」节

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
① node scripts/check-prompt-fragments.mjs 退出码 0；② npx vitest run tests/skills-injection.test.ts tests/prompt-baseline.test.ts tests/prompt-cost.test.ts 全绿；③ 注入含 必须派 subagent、SKILL.md、search.py、--design-system、prototype/、reqboard_ 禁用声明，且不含 ${CLAUDE_PLUGIN_ROOT}；④ 把 budget 人为压到极小 → 该节被裁而人工门/红旗段仍在（证明非 floor，反向演练）；⑤ brainstorming(heavy) charCount ≤ 24000 且 overBudget 为空。

## 实施方案（implementation）
把设计 interfaces §2 的逐字稿追加到 src/domain/prompt/fragments/brainstorming/feature.md 末尾（不改 heavy/light/overrides 与 vendor 镜像）；跑 node scripts/inline-prompt-fragments.mjs 重生成产物；跑 node scripts/dump-stage-prompts.mjs 更新 P1 基线；新增 tests/skills-injection.test.ts。

## 上游产出摘要（dependsSummary）
- 收录 7 个 skill 资产并固化版本指纹

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T05:05:44.107Z，窗口 session-6caf9382-cd78-46cf-a397-d723c7103292）

这张卡整体做完，做界面类需求时会自动收到一条硬指引：原型必须派子代理去做，子代理自己按两条绝对路径去读规范、去检索，主 agent 不背全文也不背数据。这一节能随预算被裁掉，而且只加重档，轻档一点没变胖。

### 完成项

- 四段子卡全部完成：研发 → 联调 → 复核 → 测试，逐段有汇报与证据
- 需求分析节点现在会收到一小节原型工作原则：何时做原型、必须派子代理、两个入口路径、命令模板、红线与产物落点
- 这一节可裁（非 floor）：预算压到贴地即被裁掉，而人工门与铁律仍在（反向演练在案）
- 落点经人裁定改到重档专属的可裁槽，不侵占轻档；轻档 2500 上限照旧守住
- 重档注入 19081 字符 ≤ 24000，无超预算标记
- 偏离 5 已登记；不触碰路由算法与受控枚举，既有片段未动
- 自测：注入 10 用例与提示词 327 用例全绿；tsc 新增 0

### 改动文件

- `src/domain/prompt/fragments/brainstorming/heavy-extra.md`
- `scripts/inline-prompt-fragments.mjs`
- `src/domain/prompt/generated/fragments.ts`
- `tests/fixtures/stage-prompts-baseline-p1.json`
- `tests/skills-injection.test.ts`
- `docs/requirements/REQ-261005122347-e07a/notes/nonfloor-drill.md`

### 下一步

进入 t-36dca3 回归收尾（知识层条目 + 全量门禁）

---
