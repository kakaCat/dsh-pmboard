# t-76faba depends_on 端到端复现+构建指纹·测试

> 需求：REQ-261003222428-3556 实施链可靠性硬化：锁心跳 + 批内真并行 + depends_on 落库丢失 + 死代码清偿 + 缺口 N-1~N-3

## 在做什么
depends_on 端到端复现+构建指纹·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-03T16:19:26.192Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

测试段完成：t3 判据全绿——成链用例/一致性警告/构建指纹三件套落地，全量 98=基线零新增

### 完成项

- 父卡验收命令：npx vitest run tests/plan-depends-e2e.test.ts → 4/4 绿；tests/tools-schema.test.ts → 绿
- 全量 pnpm test：98 failed / 3503 passed = 基线（48 文件），本卡零新增失败（4 新用例在绿侧）
- npx tsc --noEmit：归属本卡文件（plan-deps-check/build-stamp/QueryState/StatusTool/SubmitArtifact/e2e 测试）零错；index.ts:225 他窗事件桥不归本卡
- 测试段结论：判据全部成立

### 改动文件

- `docs/requirements/REQ-261003222428-3556/tasks/t-76faba.md`

### 下一步

t3 父卡收尾；随后 t5 wake 活性（N-1）

---
