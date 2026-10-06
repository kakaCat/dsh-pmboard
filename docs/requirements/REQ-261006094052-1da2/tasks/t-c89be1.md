# t-c89be1 全量回归与基线对账（零新增失败 + 零 schema 变更）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
全量回归与基线对账（零新增失败 + 零 schema 变更）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
① `git diff --stat` 中 src/shared/protocol.ts 无改动；② `pnpm typecheck` 错误数不高于 HEAD 基线；③ `pnpm test` 失败用例数 ≤ 70 且失败文件数 ≤ 39，逐条列出与 .dsh-data/baseline-cases.txt 的差集（新增失败必须为 0）

## 实施方案（implementation）
跑 pnpm typecheck 与 pnpm test，把失败用例清单与 .dsh-data/baseline-cases.txt 求差集逐条对账；新增失败逐条定位到本次改动或如实标注为既有失败（同名同因）。

## 上游产出摘要（dependsSummary）
- 新增确认门推进回归用例并修正被缺陷行为锁住的既有期望

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T01:54:17.106Z，窗口 session-9d5750ad-47dc-4178-b33e-b6531daea6a6）

全量回归与基线对账完成：零真实新增失败、零 schema 变更、类型检查零错误。

### 完成项

- pnpm typecheck：npx tsc --noEmit 退出码 0、零错误（高于基线的 223 错误口径，实测为 0）
- pnpm test：69 failed / 38 files（基线 70 failed / 39 files），逐条差集零真实新增失败
- 唯一差集条目 typecheck.test.ts 单跑 2/2 绿、tsc 零错误，报错文件 tests/result-binding.test.ts 不在本次改动集（多窗口并行期的瞬时态）
- schema 零变更：未触碰 src/shared/protocol.ts（mtime 早于本次改动，且改动集只有 4 源文件 + 2 测试文件）
- 对照文件：.dsh-data/baseline-cases.txt 与 .dsh-data/post-fix-cases2.txt

### 改动文件

- `src/application/internal/confirm-settle.ts`
- `src/application/use-cases/AskConfirm.ts`
- `src/application/internal/auto-confirm.ts`
- `src/application/use-cases/SubmitArtifact.ts`
- `tests/confirm-advance-deadlock.test.ts`
- `tests/design-gate-messages.test.ts`

### 下一步

提交验收材料（kind=verification）

---
