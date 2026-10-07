# t-a1b3e5 文字证据确认推进改走单点

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
文字证据确认推进改走单点

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/confirm-evidence.test.ts tests/confirm-settle-preconditions.test.ts 全绿；grep -n "transitionRequirement(" src/application/use-cases/ConfirmArtifact.ts 零命中（exit 0）；advance:false 用例断言 advanced === false

## 实施方案（implementation）
src/application/use-cases/ConfirmArtifact.ts：推进块（现 218-273）删除内联 transitionRequirement，改调 applyConfirmedAdvance（保留 a.advance !== false 语义与内容门/G2 前置）；删除本处 applyDiveTransition 调用（收尾已含）。回执键逐字不变。tests/confirm-evidence.test.ts 与 tests/confirm-settle-preconditions.test.ts 补断言（advance:false 不推进、停手位被清）。

## 上游产出摘要（dependsSummary）
- 抽统一收尾 finishConfirmAdvance 并接进推进单点

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T06:18:16.357Z，窗口 session-a5a69ca9-dbe0-4cc8-bdc4-3e1f959df5a1）

文字证据确认的推进收敛到单点，并补上此前缺失的停手位清位断言；本卡 acceptance 全绿。

### 完成项

- ConfirmArtifact 推进块改调唯一实现 applyConfirmedAdvance（256）
- 本路径内联 transitionRequirement 与重复 applyDiveTransition 删除
- 新增 FR-3 断言：证据确认推进后 awaiting-confirm 停手位被清、留「等待结束」痕（逆验证有效）
- confirm-evidence 9 例 + confirm-settle-preconditions 6 例全绿；grep transitionRequirement( ConfirmArtifact 零命中；tsc 0 错误

### 改动文件

- `src/application/use-cases/ConfirmArtifact.ts`
- `tests/confirm-evidence.test.ts`

### 下一步

需求后续卡 t-3bb415、t-391a5b

---
