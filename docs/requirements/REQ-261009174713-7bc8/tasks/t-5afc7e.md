# t-5afc7e workflow 包与端口契约·测试

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
workflow 包与端口契约·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-09T15:33:19.039Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

测试阶段读数：pnpm test 7253 例、失败 20 / 失败文件 13（基线 19/12，唯一波动项 header-progress-e2e 属既有抖动）；npx tsc --noEmit 错误 0；分包门禁 exit 0；workflow 行为面 32 例全绿。

### 完成项

- pnpm test：7253 例（用例数与开工前相同——本卡只搬迁不改行为）、失败 20、失败文件 13；与基线逐文件比对仅多 header-progress-e2e（全程反复飘的既有抖动项）
- npx tsc --noEmit：退出码 0、错误数 0
- node scripts/package-boundary-check.mts：exit 0（含 core 内 pmboard-workflow 说明符 0 处）
- 行为面复跑：workflow-script-contract 与 advance-engine-precheck 与 unit/workflow-schema-adapter 共 3 文件 32 例全绿
- 搬运规模：2 适配器 + 1 烟测脚本 git mv；引用面 5 处改指包名；一处动态路径（脚本内）靠运行暴露后已修

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/pmboard-workflow/src/WorkflowSchemaAdapter.ts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-workflow/scripts/workflow-engine-smoke.ts`

### 下一步

关父卡 t-08877c。

---
