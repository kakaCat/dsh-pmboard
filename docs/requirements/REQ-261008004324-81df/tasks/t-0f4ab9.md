# t-0f4ab9 跟进回执字段与状态推进读数

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
跟进回执字段与状态推进读数

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/auto-chain-approval.test.ts tests/confirm-settle-plan-persist.test.ts tests/plan-mode.test.ts tests/t17-queue-e2e.test.ts → 失败数由 1/1/1/1 降为 0/0/0/0。

## 实施方案（implementation）
按 design/fix-design.md「BUG-4」前四行：tests/auto-chain-approval.test.ts:85-89 在 seed() 加延迟 jobs 夹具（start 捕获 spec 不跑）或删该段保留 :92 并改过时的文件头注释；tests/confirm-settle-plan-persist.test.ts:48-55 给 h.deps.jobs 打桩（available/start/get）；tests/plan-mode.test.ts:302 删该断言（需求态改读 (await store.get(REQ_ID))!.status）；tests/t17-queue-e2e.test.ts 的 REQ_DOC 补 '## 讨论与裁定记录（D-x）' 节与真空态写法「本节无裁定」。每条改动旁注明「有意改名 / 有意前移」的定性句。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T17:13:48.959Z，窗口 session-f7cb40a8-a3e9-4949-b879-361611987838）

回执字段与状态推进读数跟进：四文件 4 条红转 0/0/0/0。

### 完成项

- 父卡收尾汇报：四段子卡（复现/修复/复核/回归）全部完成
- 结果：四文件 24 passed（auto-chain 6 / confirm-settle 2 / plan-mode 15 / t17 1），验收读数 0/0/0/0 达标
- 改动只在四个测试文件：延迟 jobs 夹具、回执读数改权威源、t17 夹具面补齐
- 如实留痕扩面：t17 补 D-x 节后串出的 4 处被掩盖夹具缺口，同文件同性质、逐处有注释锚点，本窗口已裁定接受

### 改动文件

- `tests/auto-chain-approval.test.ts`
- `tests/confirm-settle-plan-persist.test.ts`
- `tests/plan-mode.test.ts`
- `tests/t17-queue-e2e.test.ts`

---
