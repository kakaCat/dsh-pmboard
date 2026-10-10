# t-d830ea 分层依赖方向门禁与自检·测试

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
分层依赖方向门禁与自检·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-09T10:52:58.836Z，窗口 session-5eb1ddb9-73cd-416a-96e8-99d4420cf11c）

复核：门禁可信（既查得出又不误报）

### 完成项

- 复核 6 例自检全绿：4/4 越界被拒、干净树与 kit 通路放行（防静默失效与误报）
- 复核 commit:check 真跑到门禁步（输出含门禁 OK 行，退出码 0）

### 改动文件

- `.worktrees/req-261009174713-7bc8/scripts/package-boundary-check.mts`
- `.worktrees/req-261009174713-7bc8/tests/package-boundary.test.ts`
- `.worktrees/req-261009174713-7bc8/scripts/commit-check.mts`
- `.worktrees/req-261009174713-7bc8/package.json`

### 下一步

回父卡：t3 待关

---
