# t-9aa82b 早退分支兑现推进：已落章 + 闸门全过则真推进

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
早退分支兑现推进：已落章 + 闸门全过则真推进

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
`npx vitest run tests/confirm-advance-deadlock.test.ts` 中 TC-1~TC-4 全绿；TC-1 必须读回台账（store.get(id).status === 'design'）而非只看返回体；TC-2 断言 gate_failure.code === 'decision_log_missing' 且 status 仍为 brainstorming

## 实施方案（implementation）
改 src/application/use-cases/AskConfirm.ts 的 alreadyConfirmed 早退分支：闸门全过后若 advanceTo !== undefined && advance !== false 则调 applyConfirmedAdvance；advanced === true 时再调 applyDiveTransition(..., 'confirm-advance', {kind:'human',sessionId:windowKey}, {stageChanged:true, status:from})（自 ../dive/applyDiveTransition.js 引入）。返回体补 advanced:true / from / to，note 前缀保留「已确认，未重复弹框（FR-9/FR-11）」并追加「；已自动推进：<from> → <to>」。两处闸门失败返回体（gate_failure + 「未推进」文案 + 「仍有 N 份未登记」）一字不动。

## 上游产出摘要（dependsSummary）
- 抽出推进单点 applyConfirmedAdvance 并让首次确认路径复用

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T01:51:39.078Z，窗口 session-9d5750ad-47dc-4178-b33e-b6531daea6a6）

早退分支兑现推进：已落章 + 闸门全过 ⇒ 真的推进并返回 advanced/from/to，且不绕过设计完整性门。

### 完成项

- 早退分支闸门全过时调用 applyConfirmedAdvance，返回 advanced:true + from/to
- 推进成功后再调 applyDiveTransition（confirm-advance），与首次确认同源
- 闸门失败两处返回体保持原样（gate_failure + 未推进文案 + 仍有 N 份未登记）
- 补门：设计完整性门的适用条件改为与主路径同一份（kind=design 或 G2）——否则 kind=requirement 在 design 阶段重发确认会绕过 G2
- 证据：tests/confirm-advance-deadlock.test.ts 10 例全绿（含 TC-9 后门回归）；design-gate-messages 6 例全绿

### 改动文件

- `src/application/use-cases/AskConfirm.ts`
- `tests/confirm-advance-deadlock.test.ts`
- `tests/design-gate-messages.test.ts`

### 下一步

t3 自动确认窄口径预判；t4 回归用例已同批落地

---
