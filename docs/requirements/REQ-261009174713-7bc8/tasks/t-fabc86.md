# t-fabc86 类型层契约 pmboard-type-kit·测试

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
类型层契约 pmboard-type-kit·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-09T11:37:22.217Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

测试阶段读数：pnpm test 7221 例（较 t5 后 +10，即本卡新增用例）、失败 18 与失败文件 12 均与开工前一致；npx tsc --noEmit 错误 0。

### 完成项

- 本卡验收命令：npx vitest run packages/pmboard-type-kit/tests → 10/10 全绿
- pnpm test：616 文件 / 7221 例，失败 18、失败文件 12（与 t5 后逐文件一致，新增失败 0）
- 用例数对账：7211 → 7221，+10 恰为本卡 tests/type-kit.test.ts 的 10 例
- npx tsc --noEmit -p tsconfig.json：退出码 0、错误数 0
- 受扫描器影响的既有门禁复跑：错误码清单与棘轮与矩阵、live-tasks、公共包纯度全绿
- 既有红一处（size-budget 的 tools/SubmitTool 509 行）与本卡无关，开工前就在

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/pmboard-type-kit/tests/type-kit.test.ts`

### 下一步

关父卡 t-3b14a7；下一张按计划是 t-3ea341（六个类型包规格落位），届时按 RF-25 规格表逐项从现网出处填充。

---
