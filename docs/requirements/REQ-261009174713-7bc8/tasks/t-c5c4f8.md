# t-c5c4f8 资产四包化与发布完整性·测试

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
资产四包化与发布完整性·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-10T02:07:11.943Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

测试阶段读数：pnpm test 7268 例、失败 20（= 基准 19 + 既有 flapper header-progress-e2e）；npx tsc --noEmit 错误 0；分层门禁 exit 0；prompts:check 缺口 0。

### 完成项

- pnpm test：7268 例、失败 20、失败文件 13 —— 与基线同量（唯一差异是反复飘的 header-progress-e2e，历轮在它与 settings-init 之间交替）
- npx tsc --noEmit：退出码 0、错误数 0
- node scripts/package-boundary-check.mts：exit 0
- pnpm prompts:check：exit 0（探针缺口 0）——搬迁后片段里的路径仍全部可达
- 搬迁规模：302 个资产文件（templates 38 · skills 146 · eval-suite 118）；扫描 51 个代码类文件 + 1 个片段 .md；运行期 2 根 + 发布清单 1 处
- 卡面验收对照：资产清单 212 = 基线 · pnpm pack 产物含 189 条资产条目 · 内容与 HEAD 逐字节一致（302/0/0）

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/pmboard-skills/skills`
- `.worktrees/req-261009174713-7bc8/scripts/prompt-path-probe.mts`
- `.worktrees/req-261009174713-7bc8/tests/helpers/asset-root.ts`

### 下一步

关父卡 t-4238a0。

---
