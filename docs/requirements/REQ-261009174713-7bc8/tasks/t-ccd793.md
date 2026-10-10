# t-ccd793 client 包与构建入口·测试

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
client 包与构建入口·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-10T01:20:40.648Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

测试阶段读数：pnpm test 7268 例、失败 19 = 基准（新增失败 0，message-hygiene 自愈一条）；npx tsc --noEmit 错误 0；分层门禁 exit 0；verify-client 与 pnpm build 均 exit 0。

### 完成项

- pnpm test：7268 例、失败 19、失败文件 12 —— 与基准**同量且新增失败 0**；基线红 message-hygiene 自基线 2 例降为 1 例（自愈一条）
- npx tsc --noEmit：退出码 0、错误数 0
- node scripts/package-boundary-check.mts：exit 0
- 本卡验收一：node scripts/verify-client-build.mjs exit 0（OK bundle=764536，关键符号齐全、样式归属章在场、CSS 分片完整）
- 本卡验收二：pnpm build exit 0，产出 lib/client.js（764536 字节）与 dist/index.mjs
- 本卡验收三（口径）：npx vitest run packages/pmboard-client/tests 待 t20 测试随包迁移，此刻该目录为空——已在研发/复核两段如实登记
- 搬迁规模：140 文件；说明符 344 处；字符串 70 文件（含 tests/fixtures 引用型夹具）；tsdown entry / core 转出 / 知识层双根三处配套

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/pmboard-client/src/index.ts`
- `.worktrees/req-261009174713-7bc8/scripts/verify-client-build.mjs`

### 下一步

关父卡 t-ad43c3。

---
