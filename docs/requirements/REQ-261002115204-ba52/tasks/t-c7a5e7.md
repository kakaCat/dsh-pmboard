# t-c7a5e7 实施片段加「汇报自检」并按 C-16/C-17 重生成校验

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
实施片段加「汇报自检」并按 C-16/C-17 重生成校验

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：doc
- 端侧：doc

## 得到什么结果
node scripts/inline-prompt-fragments.mjs 退出码 0 且 generated/ 有更新（128 fragments / 72702 bytes）；node scripts/check-prompt-fragments.mjs 退出码 0（片段与产物一致、heavy 与 vendor 原文逐字节一致）；grep -c 汇报自检 src/domain/prompt/generated/fragments.ts = 3（≥1）；反向：手工改一处生成产物 → check-prompt-fragments 必须非零退出（验完还原）；npx vitest run tests/prompt-tiers.test.ts 全绿（light 档 ≤2500 字符）。

## 实施方案（implementation）
改 src/domain/prompt/fragments/implementing/light/overrides.md（覆盖 4，一行精简条目）与 implementing/heavy/overrides.md（覆盖 8，完整版含理由）；不改受 C-17 保护的 heavy 正文与 vendor 原文。按 C-16 跑 node scripts/inline-prompt-fragments.mjs 重生成 src/domain/prompt/generated/fragments.ts，按 C-17 跑 node scripts/check-prompt-fragments.mjs 校验片段↔产物一致。约束：light 档受硬预算 2500 字符（tests/prompt-tiers.test.ts 守着），实测 2409 → 2472，未超限。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-02T03:57:37.429Z，窗口 session-06ef20c5-9734-4ee9-b9b2-348ed3a652a5）

这一步做完，模型在实施阶段动手写汇报之前就会先看到「别用半角引号、每条短句、太长拆多次」的自检提醒（轻档一句、重档带整轮报废的理由）；片段与生成产物一致性有校验兜底，谁单独改产物会被当场拦下。

### 完成项

- 两处片段源加「汇报自检」：light/overrides.md（覆盖 4）、heavy/overrides.md（覆盖 8）；受 C-17 保护的 heavy 正文与 vendor 原文未动
- C-16 重生成 exit 0（128 fragments / 72574 bytes）；C-17 校验 exit 0
- 反向演练：改一处生成产物 → C-17 非零退出（偏差偏移 68603）；还原后 exit 0
- 轻档预算：tests/prompt-tiers.test.ts → 40 passed（未超 2500 字符）
- 如实记录 1 处偏离：设计落点表列了 light.md 一行，实际只在 light/overrides.md 加（两处都加会超轻档预算）
- 子卡链：研发段（t-f71cd6）与复核段（t-f3878a）已完成并留完工记录

### 改动文件

- `src/domain/prompt/fragments/implementing/light/overrides.md`
- `src/domain/prompt/fragments/implementing/heavy/overrides.md`
- `src/domain/prompt/generated/fragments.ts`

### 下一步

t5：零变更核验 + 全量回归 + 回滚路径演练（兼容卡）。

---
