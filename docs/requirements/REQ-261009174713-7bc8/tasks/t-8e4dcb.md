# t-8e4dcb 回合驱动包（dive 劈两半的驱动面）·测试

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
回合驱动包（dive 劈两半的驱动面）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-09T14:36:00.400Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

测试阶段读数：pnpm test 7253 例、失败 19 / 失败文件 13 —— 与开工前逐项一致（新增失败 0）；npx tsc --noEmit 错误 0；分层门禁 exit 0。

### 完成项

- pnpm test：624 文件 / 7253 例，失败 19、失败文件 13；与 t11 收官读数完全相同（逐文件比对新增 0）
- npx tsc --noEmit：退出码 0、错误数 0
- node scripts/package-boundary-check.mts：exit 0（含修掉 core 漏声明 pmboard-type-kit 后的复跑）
- 搬迁规模：9 文件 git mv；引用方 23 文件；判据（路径字符串/夹具）改写 4 文件
- 抖动说明：本轮无新增飘项（上一轮飘的 header-progress-e2e 本轮未出现）

### 改动文件

- `.worktrees/req-261009174713-7bc8/tests/injection-difficulty.test.ts`
- `.worktrees/req-261009174713-7bc8/tests/live-tasks-single-source.test.ts`

### 下一步

关父卡 t-155955。

---
