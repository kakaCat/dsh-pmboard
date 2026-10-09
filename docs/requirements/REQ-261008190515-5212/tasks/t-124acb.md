# t-124acb 把实施阶段的 heavy 主档改写成本仓自写完整档

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
把实施阶段的 heavy 主档改写成本仓自写完整档

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
① `node -e` 取 `resolveStagePrompt({stage:'implementing',difficulty:'heavy'}).text.length` 读数 < 8000（改前 23852）；② 注入文本同时包含 `The Task Loop`、`Common Rationalizations`、`reqboard_task_move`、`reqboard_task_report` 四个关键词；③ `diff -q src/domain/prompt/fragments/implementing/heavy.md src/domain/prompt/vendor/superpowers/executing-plans/SKILL.md` 有差异（不再是镜像）；④ `npx vitest run tests/stage-prompts.test.ts` 全绿

## 实施方案（implementation）
整篇重写 `src/domain/prompt/fragments/implementing/heavy.md`（20,405 字符 → ≤5,500 字符），按设计架构篇「自写档章节骨架」的 9 节落笔：开篇关系说明 / 本仓实施模式 / 开工取卡 / The Task Loop / 子代理派发与复核 / 完工汇报 / 遇门弹框 / Common Rationalizations / 交棒。保留英文纪律骨架节名（`The Task Loop`、`Common Rationalizations`）；正文只写本仓工具面（取卡 reqboard_task_move、汇报 reqboard_task_report、遇门 reqboard_ask_confirm、交棒 reqboard_submit(kind=verification)）；子卡链与请求预算只引用 `docs/architecture/subtask-stage-template.md` 与 `docs/architecture/subtask-request-budget.md`，不复述机制。落笔前先核这两个文档路径存在。

## 上游产出摘要（dependsSummary）
- 让 implementing 退出 vendor 镜像表

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-08T11:24:06.950Z，窗口 session-f893089d-5bac-45af-a1e7-f6363711848f）

父卡收口：实施阶段 heavy 主档已由上游镜像换成本仓自写完整档，注入体量压回预算内

### 完成项

- 四个节全在场，注入 23852 → 6293 字符（预算余量回到 17707）
- 自写档只写本仓工具面与流程；上游产物路径 0 残留
- vendor 原文 20405 字节逐字节留档未动
- 生成物已重跑；P1 基线引用旧文本，t6 重刷后复绿

### 改动文件

- `src/domain/prompt/fragments/implementing/heavy.md`
- `src/domain/prompt/generated/fragments.ts`

### 下一步

继续 ready 卡：t-089b64（ATTRIBUTION）、t-ed16b0（项目说明书）、t-83bb63（断言与探针）

---
## 汇报 2（2026-10-08T11:25:33.019Z，窗口 session-f893089d-5bac-45af-a1e7-f6363711848f）

补记（t3 期间暴露）：链声明行需与 STAGE_CHAIN 逐字一致，已就地修正并复跑全绿

### 完成项

- 问题：prompt-tiers 的链声明物化断言要求 heavy 含与 STAGE_CHAIN 逐字一致的交棒行，原由 overrides 覆盖 6 提供、收编后消失
- 修正：heavy.md 末行去掉反引号，改为与 chain.ts 第 59 行逐字一致
- 复跑：prompt-tiers + stage-prompts 共 75 passed；node scripts/check-prompt-fragments.mjs 退出码 0
- 教训：收编 overrides 前必须先确认哪些断言依赖被收编条目（本次靠测试红灯暴露，未静默放过）

### 改动文件

- `src/domain/prompt/fragments/implementing/heavy.md`

### 下一步

t3 收尾后由 t6 重刷 P1 基线

---
