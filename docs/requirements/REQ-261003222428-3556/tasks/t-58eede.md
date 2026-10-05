# t-58eede 批内写集分组真并行·测试

> 需求：REQ-261003222428-3556 实施链可靠性硬化：锁心跳 + 批内真并行 + depends_on 落库丢失 + 死代码清偿 + 缺口 N-1~N-3

## 在做什么
批内写集分组真并行·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-03T16:03:39.111Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

测试段完成：t2 判据全绿（并行四用例+既有零回归）；全量 99 failed 中 +1 归属他窗 55f2 在制的 StageKind 扩段（证据在案），与本卡无关

### 完成项

- 父卡验收命令：npx vitest run tests/advance-parallel.test.ts tests/advance-chain.test.ts → 全绿（4+11 用例）
- 全量 pnpm test：99 failed / 3519 passed——比说明书基线 98 多 1，新增失败已归属：tests/card-types.integration.test.ts（期望 16 色、实际 20 StageKind）
- 归属证据：src/domain/task/SubtaskTemplate.ts 与 src/domain/card-types.ts 在 23:57 被并行窗口修改（注释明写 REQ-261003203909-55f2 FR-1/FR-2 补 e2e/manual/capture/release 段），测试文件 23:55 同步在改——他窗在制，本卡 diff 与该面零交集
- npx tsc --noEmit：归属本卡文件错误 = 0
- 测试段结论：本卡判据全绿；+1 外部红在案，t8 全量回归时复查他窗是否收稳

### 改动文件

- `docs/requirements/REQ-261003222428-3556/tasks/t-58eede.md`

### 下一步

t2 父卡收尾；随后 t4 死代码清偿（依赖 t2）或并行推进 t3/t5/t6/t7

---
