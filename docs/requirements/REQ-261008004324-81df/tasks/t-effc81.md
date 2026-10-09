# t-effc81 跟进投递面与告警写入断言

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
跟进投递面与告警写入断言

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/handoff.test.ts tests/adapters/failure-alert.test.ts tests/canceled-legacy-read.test.ts → 失败数由 2/2/1 降为 0/0/0，且第三个文件连跑 3 次均绿（消 await 抖动）。

## 实施方案（implementation）
按 design/fix-design.md「BUG-5」后三行：tests/handoff.test.ts:251 与 :333 之前把上游 t1 走完 todo→in_progress→done（done 前补一次带 files_changed 的 task_report）；tests/adapters/failure-alert.test.ts 删 delivered 断言（:48-50）、:53-76 改断两次 wire.log（原始正文 + 含窗口信息的调试行）；tests/canceled-legacy-read.test.ts:315-318 把 await expect(async fn).not.toThrow() 改成 try/catch + 真 await（现写法不 await 内部 promise，是抖动的根因）。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T17:17:32.328Z，窗口 session-f7cb40a8-a3e9-4949-b879-361611987838）

投递面与告警写入断言跟进：三文件 5 条红转全绿。

### 完成项

- 父卡收尾汇报：四段子卡（复现/修复/复核/回归）全部完成
- 结果：三文件 29 passed（handoff / failure-alert / canceled-legacy-read），验收读数 0/0/0 达标
- 改动只在三个测试文件：上游完工走完五态、告警改断两次 logged、await 漏洞补上
- 留痕：canceled-legacy-read 另有一条与本卡无关的既有抖动（FR-6 零写回对照在飞写入的 queue.json），本卡点名条目已连跑 8 次稳定绿

### 改动文件

- `tests/handoff.test.ts`
- `tests/adapters/failure-alert.test.ts`
- `tests/canceled-legacy-read.test.ts`

---
