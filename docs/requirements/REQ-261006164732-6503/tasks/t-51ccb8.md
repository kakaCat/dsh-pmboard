# t-51ccb8 指南三处与回执 note 去机制化并重生成产物

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
指南三处与回执 note 去机制化并重生成产物

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
① node scripts/check-prompt-fragments.mjs 退出码 0（片段与产物一致）；② 文案断言：triggered=true 的 note 不含「下一步：调 `reqboard_ask_confirm`」；③ 三处指南不再出现无条件「提交后调 reqboard_ask_confirm」；④ npx vitest run tests/stage-prompts.test.ts 全绿。

## 实施方案（implementation）
① 改 src/application/internal/capture-section.ts 的设计/拆分两处指南为条件式：「若回执已说明有门在等 → 不要重复发起确认；否则发起一次」。② 改三份片段 src/domain/prompt/fragments/decomposing/light.md、src/domain/prompt/fragments/decomposing/heavy.md、src/domain/prompt/fragments/brainstorming/heavy/overrides.md 同样条件式。③ 跑 node scripts/inline-prompt-fragments.mjs 重生成 src/domain/prompt/generated/fragments.ts。④ 改 src/application/use-cases/SubmitArtifact.ts 的回执 note 分支：triggered=true 时写「已有一道门在等（ticket=…）：取回执或看板作答，不要再发起确认」，不再指向 ask_confirm。⑤ 同步 tests/fixtures/stage-prompts-baseline.json 基线。

## 上游产出摘要（dependsSummary）
- auto-confirm 改走 requestGate（自动弹不再重复建门）
- AskConfirm 改走 requestGate 且陈旧票清理分门

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T10:01:27.591Z，窗口 session-d210345f-6bd2-4a05-be59-e859c70b86c5）

t8 完成：机制与文案不再双写——指南只教「读门状态 + 取回执」，不再教「去弹框」。

### 完成项

- 三处指南 + 两处回执 note + 验收门基础文案改为条件式；提交机制已经弹过的框，文案不再叫 agent 再弹一次
- 重生成提示词产物（C-16）并通过 C-17 一致性校验
- 新增 3 例生成物级断言（旧的无条件指令不得再出现）
- 52 例全绿、node scripts/check-prompt-fragments.mjs 退出码 0、tsc 0 错
- 研发 t-5322b6 / 复核 t-1ffa51 均完成（复核：无偏离；design 与 prototype 两处不自动弹的指引未被误改）

### 改动文件

- `src/application/internal/capture-section.ts`
- `src/domain/prompt/fragments/decomposing/light.md`
- `src/domain/prompt/fragments/decomposing/heavy.md`
- `src/domain/prompt/fragments/brainstorming/heavy/overrides.md`
- `src/domain/prompt/generated/fragments.ts`
- `src/application/use-cases/SubmitArtifact.ts`
- `src/application/use-cases/SubmitVerification.ts`
- `tests/prompt-conditional-gate.test.ts`

### 下一步

下一步 t9：pending-guard 的 recovery / 拒绝文案删掉「重新发起覆盖旧记录」。

---
