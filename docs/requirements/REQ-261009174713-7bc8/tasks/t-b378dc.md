# t-b378dc 五类基线 diff 与宿主 smoke 验收·复核

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
五类基线 diff 与宿主 smoke 验收·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261009174713-7bc8/design/` 逐条核对；`npx vitest run tests/` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-10T09:54:06.930Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

复核结论：无实质偏离。五类 diff 与 smoke 独立复跑一致；哈希判据既非空转又路径无关；唯一偏离是 dist 加载改用源码入口，属开发布局的既有局限。

（更正上一条 summary 里的笔误：宿主 name 为 dsh-pmboard。）

### 完成项

- 独立复跑五类 diff：dist 导出 8 · 工具 19 · 类型 6 · 资产 212 · 用例 7268（≥ 基线 7197）——四项相等、一项单调增
- 独立复跑哈希：与 re-baseline 后基线 19/19 一致；再做**路径无关性**独立探针（把 factoryFile/responseSources 换成假路径）19/19 不变 ⇒ 判据不空转且跨布局稳定
- 独立复跑 smoke：工具名 19 个与基线逐字一致；命令面 applyCommandSurface 是函数、inject 是惰性 []（与设计“惰性注入”一致）；宿主 apply 是函数、name=dsh-pmboard
- 口径核对：失败集 ⊆ 基线清单（按 basename 归一，超出项无）；用例数 ≥ 基线（7268 ≥ 7197）
- 偏离项（如实）：dist 加载 smoke 走源码入口而非 dist/index.mjs——原因是本开发布局下 dist 的 externals 保留 .js 说明符、工作区包仅有 src/*.ts（布局级限制，与 t16 烟测同源），非本次改动引入

### 改动文件

- `.worktrees/req-261009174713-7bc8/scripts/refactor-baseline.mts`
- `.worktrees/req-261009174713-7bc8/.dsh-data/refactor-baseline/tool-registry.json`

### 下一步

交测试子卡。

---
