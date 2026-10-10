# t-d0e58c 测试随包迁移·测试

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
测试随包迁移·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-10T09:40:05.214Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

测试阶段读数：pnpm test 7268 例 / 失败 18（≤ 绿态基线 19，真·新增 0）；tsc、分层门禁、prompts:check 全部 exit 0。

### 完成项

- pnpm test：7268 用例 / 失败 18（绿态基线 19；真·新增 0）—— 附 /tmp/W7.json 原始报告
- npx tsc --noEmit：退出码 0
- node scripts/package-boundary-check.mts：退出码 0（19 包声明面/使用面）
- pnpm prompts:check：退出码 0（探针缺口 0）
- 搬迁规模：546 进包 / 79 留根（含 8 个既有包内测试）；vitest include 已含 packages/*/tests/**
- 残留（未在本卡修，已留案）：layer-boundary 扫描面自 t15 起空转（加强后报 4 处真实越界，需改源码）；baseline:check 在绿态即红（基线记录陈旧）

### 改动文件

- `.worktrees/req-261009174713-7bc8/vitest.config.ts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-core/tests/query-trunk.test.ts`

### 下一步

关父卡 t-7358fc。

---
