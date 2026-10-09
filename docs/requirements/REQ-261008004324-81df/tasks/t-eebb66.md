# t-eebb66 重生成知识层并更新两条基线断言

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
重生成知识层并更新两条基线断言

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx tsx scripts/kb-build.mts --write && pnpm kb:check → 退出码 0（改前 4 处漂移）；npx vitest run tests/kb-generate.test.ts tests/kb-invalidation.test.ts tests/kb-operations.test.ts → 三文件全绿；git diff --stat 只含 docs/knowledge/* 与两个 kb 用例文件。

## 实施方案（implementation）
按 design/fix-design.md「BUG-8」：前置确认无他窗正在改 src/ 结构；跑 npx tsx scripts/kb-build.mts --write 重生成 docs/knowledge 的四份生成物 → pnpm kb:check 期望 exit 0；再把 tests/kb-invalidation.test.ts:119-121 的「全部不可判定」改为结构判据 + 集合差（分母 ≥ 60，不可判定集合与基线一致）；tests/kb-operations.test.ts:73 长度 12 改 14 并点名 report-style-snapshot / report-style-ownership 两条新入口。若 kb-generate 重生成后 diverged 仍非空 ⇒ 属抽取口径真分歧，在卡内点名并转另案。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T17:18:03.358Z，窗口 session-f7cb40a8-a3e9-4949-b879-361611987838）

知识层基线断言跟进：三文件 35 passed；kb:check 退出码 0 因三条既有门不可达，已如实报出。

### 完成项

- 父卡收尾汇报：四段子卡（复现/修复/复核/回归）全部完成
- 结果：三个 kb 用例文件 35 passed（改前 2 failed | 33 passed）；本需求关心的「零漂移」段为绿
- 实际收口 = 两条基线断言（不可判定集合改结构判据 + 集合差；白名单 12→14 并点名两条新入口）
- 别处先修好 = 4 处生成物漂移由他窗 01:05:11 重生成修掉，本卡 --write 幂等空转、不领功
- 未达成的卡面判据：pnpm kb:check 真退出码 1，卡在 K1/K3/K14 三条改前即红且在本卡授权外的门（本卡一字未动），留裁决

### 改动文件

- `tests/kb-invalidation.test.ts`
- `tests/kb-operations.test.ts`

---
