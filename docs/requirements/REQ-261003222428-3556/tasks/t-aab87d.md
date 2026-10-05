# t-aab87d 推进锁续租心跳·测试

> 需求：REQ-261003222428-3556 实施链可靠性硬化：锁心跳 + 批内真并行 + depends_on 落库丢失 + 死代码清偿 + 缺口 N-1~N-3

## 在做什么
推进锁续租心跳·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-03T15:45:08.098Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

测试段完成：t1 终态判据全部成立——假时钟三用例绿、全量 98=基线零新增、tsc 归属零错

### 完成项

- 父卡验收命令：npx vitest run tests/advance-lock-heartbeat.test.ts → 3/3 全绿（假时钟三用例）
- 全量 pnpm test：98 failed / 3506 passed——失败数与说明书基线 98 一致，本卡零新增失败（新增 3 用例在绿侧）
- npx tsc --noEmit：归属本卡两文件（AdvanceChain.ts / advance-lock-heartbeat.test.ts）错误 = 0
- 测试段结论：两项「≤ 基线」判据成立

### 改动文件

- `docs/requirements/REQ-261003222428-3556/tasks/t-aab87d.md`

### 下一步

t1 父卡收尾；随后 t2 批内真并行（依赖 t1，同文件异类）

---
