# t-13a8ca 新增确认门推进回归用例并修正被缺陷行为锁住的既有期望

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
新增确认门推进回归用例并修正被缺陷行为锁住的既有期望

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
① `npx vitest run tests/confirm-advance-deadlock.test.ts tests/design-gate-messages.test.ts` 退出码 0；② design/test-cases.md「反向验证」表四条改坏各跑一次必红并打印改坏点，跑完逐字节还原；③ 新测试文件顶部有 serves 头

## 实施方案（implementation）
新建 tests/confirm-advance-deadlock.test.ts（顶部 serves: FR-1, FR-2, FR-3），按 design/test-cases.md 的 TC-1~TC-7 写（标本、断言逐条对应；状态断言一律读回台账）。改 tests/design-gate-messages.test.ts「全部落章且磁盘无新增」例：advanced 期望由 false 改为 true 并补状态前进断言，其余断言逐字保留。

## 上游产出摘要（dependsSummary）
- 早退分支兑现推进：已落章 + 闸门全过则真推进
- 自动确认窄口径预判（UI 缺原型不弹）并改两处调用点 await

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T01:53:33.698Z，窗口 session-9d5750ad-47dc-4178-b33e-b6531daea6a6）

回归用例落地：新增 10 例（含后门回归），并修正把缺陷行为锁成正确行为的那条既有期望。

### 完成项

- 新建 tests/confirm-advance-deadlock.test.ts（顶部 serves 头），含 TC-1..TC-7 与 TC-9 后门回归
- 状态断言一律读回台账（store.peek），不只看返回体
- 改 design-gate-messages TC-4 第 2 例：advanced 由 false 改为 true 并补状态前进断言，其余断言逐字保留
- 四条反向验证按 test-cases.md 原文措辞各跑一次必红，跑完逐字节还原（diff 与快照一致）
- 证据：npx vitest run 两个文件 16 例全绿

### 改动文件

- `tests/confirm-advance-deadlock.test.ts`
- `tests/design-gate-messages.test.ts`

### 下一步

t5 全量回归与基线对账已跑（69 失败，低于基线 70，零新增）

---
