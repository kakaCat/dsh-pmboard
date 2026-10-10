# t-ac160a 公共包 pmboard-common 落位·测试

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
公共包 pmboard-common 落位·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-09T11:14:27.007Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

测试阶段读数：pnpm test 7211 例、失败 18（开工前可比基线 19，失败数未超基线且无新增失败文件）；npx tsc --noEmit 错误数 0（= 基线）。

### 完成项

- pnpm test（照卡命令原样跑）：615 文件 / 7211 例，失败 18、通过 7147、跳过 27；耗时 67.4 秒
- 对比开工前可比基线（.dsh-data/refactor-baseline/vitest-report-after-t2.json）：失败 19→18、失败文件 13→12
- 失败集逐文件比对：新增失败 0；另有一例基线红（reqboard/settings-init）本卡内转绿
- npx tsc --noEmit -p tsconfig.json：退出码 0、错误数 0，与基线持平
- 本卡验收命令复跑：tests/common-package-purity.test.ts 3/3 绿
- 门禁链复跑：node scripts/package-boundary-check.mts 退出码 0（19 包声明面与使用面）
- 提示词链复跑：inline-prompt-fragments 129 片段 64671 字节、check 一致、prompt-path-probe 缺口 0
- 留存失败 12 文件全部为环境性或既有红（layer-boundary 在 main 上单独跑也红，compat-regression 需脏 docs 分片）

### 改动文件

- `.worktrees/req-261009174713-7bc8/tests/common-package-purity.test.ts`
- `.worktrees/req-261009174713-7bc8/scripts/package-boundary-check.mts`
- `.worktrees/req-261009174713-7bc8/scripts/prompt-path-probe.mts`

### 下一步

关父卡 t-d62702；随后按依赖序开工 t-60bd0d（protocol 与 board-summary 拆半 + client/types.ts 下沉）。

---
