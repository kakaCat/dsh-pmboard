# REQ-261001210304-0dfb 测试用例 · 判据怎么跑、跑出什么算过 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

> 本文件是 `requirement.md` 判定标准 A1–A7 的落地映射。两条**修前必红**用例（A1/A2）是本需求的回归锚点：
> 它们的失败就是缺陷，通过就是修复。

## 测试策略与分层 `serves: FR-5`

| 层 | 覆盖什么 | 写法 | 为什么这样选 |
|----|---------|------|-------------|
| 单元（纯函数） | 记忆表语义（读/写/合并/容量/隔离）、补丁函数的输出 | Node 环境直接 import，无 DOM（或极简 DOM 桩） | 与 `panel-refresh.test.ts` 同款纪律：调度/状态类逻辑不依赖浏览器 |
| 挂载集成（DOM 桩） | `mountDagCanvas` 二次挂载是否回填；工具条 `is-on`；滚动恢复 | 复用 `tests/dag-view.test.ts` 的 `withFakeDom/mountStub` 桩 | 这是真实缺陷发生的位置，必须有机械守卫 |
| 字符串不变量 | 两轮渲染（仅时间戳不同）`__html` 逐字节相同 | 直接比对 `renderNodePanel` 输出 | 把"DOM 为什么被重建"变成可断言的字符串性质 |
| 人工浏览器验证（E2E 读数的替代） | 真实刷新节奏下的滚动/页签表现 | 手测步骤 + 截图 | 自动化 E2E 成本高于收益；`requirement.md` 未设 E2E 测试策略表，此项在验收材料里显式登记为人工替代 |

## 用例表（含实际文件） `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

| 用例 | 层级 | 断言 | 跑法（命令） | 期望（括号内为修前） | 实际文件 |
|------|------|------|-------------|---------------------|----------|
| A1-1 记忆表语义 | 单元 | `write→read` 合并语义、拷贝隔离、非法滚动值按 0、容量 16 FIFO 淘汰、前缀清理 | `npx vitest run tests/dag-view-state.test.ts` | 全绿（修前文件不存在 → 必红） | `tests/dag-view-state.test.ts` |
| A1-2 二次挂载回填 | 挂载集成 | 同一 canvas 连续两次 `mountDagCanvas({stateKey})`，中间 `patch({dir:'horizontal',crit:true,focus:true,pinned:'t-b'})` | 同上 | 第二次 `viewer.state()` = `horizontal/true/true/'t-b'`（**修前**：`vertical/false/false/null`，见 `evidence/probe-dag-reset.mts` A 段） | `tests/dag-view-state.test.ts` |
| A1-3 工具条同步 | 挂载集成 | 回填后 `[data-dag-dir="horizontal"]` 带 `is-on`、`[data-dag-dir="vertical"]` 不带；两个开关按钮同步 | 同上 | 断言通过（修前：模板恒 `vertical` 为 `is-on`） | `tests/dag-view-state.test.ts` |
| A2-1 字符串稳定性 | 字符串不变量 | 两次 `renderNodePanel`（仅 `freshness.fetchedAt` 差 5s）输出**逐字节相同**；输出**不含** `数据时间`/`data-fetched-at=<值>` | `npx vitest run tests/panel-freshness-render.test.ts` | 相同且不含（**修前必红**：差异点在 `data-fetched-at`，见探针 B 段） | `tests/panel-freshness-render.test.ts` |
| A2-2 承载 DAG 片段稳定 | 字符串不变量 | 抽取 `dsh-pm-dag-panel` 段比对两轮字节一致 | 同上 | 一致（修前必红） | `tests/panel-freshness-render.test.ts` |
| A3-1 新鲜度补丁 | 单元（DOM 桩） | `hydrateFreshness(root, f)` 后：文本 = `数据时间 HH:MM:SS`、`data-fetched-at` 正确、超阈值时带 `is-stale`、**元素未被替换** | `npx vitest run tests/panel-hydrate.test.ts` | 全绿 | `tests/panel-hydrate.test.ts` |
| A3-2 相对时间补丁 | 单元（DOM 桩） | 注入固定 `now`：`[data-dsh-pm-rel]` 文本分别为「刚刚 / 5 分钟前 / 日期」 | 同上 | 全绿 | `tests/panel-hydrate.test.ts` |
| A3-3 页签恢复 | 单元（DOM 桩） | `hydrateNodePanel(root, {tab:'list'})` 后 `[data-view="list"]` 带 `is-active`、泳道 pane 无 `hidden`、DAG pane 有 `hidden` | 同上 | 全绿（修前：页签态无恢复入口） | `tests/panel-hydrate.test.ts` |
| A5 键隔离 | 单元 | `np-dag-canvas::REQ-A` 写横向 + 只看主线 → 读 `np-dag-canvas::REQ-B` | `npx vitest run tests/dag-view-state.test.ts` | B 为 `undefined`（= 初始态） | `tests/dag-view-state.test.ts` |
| A6 既有回归 | 回归 | 挂载/释放/事件委托（无 `opts` 路径）语义不变 | `npx vitest run tests/dag-view.test.ts tests/node-panel.test.ts tests/panel-freshness-render.test.ts tests/panel-refresh.test.ts` | 全绿（缺省 = 现状行为的兼容承诺） | `tests/dag-view.test.ts`、`tests/node-panel.test.ts`、`tests/panel-freshness-render.test.ts`、`tests/panel-refresh.test.ts` |
| A7 类型与构建 | 静态 | 本次改动文件无新增 `tsc` 错误；client 构建通过 | `npx tsc --noEmit -p tsconfig.json` ／ `pnpm build:client` | 本次文件零新增错误；`verify-client-build` 绿 | — |

## 修前必红清单（实施的第一步就是把它们跑红） `serves: FR-5`

1. `tests/dag-view-state.test.ts`（A1-2）：`mountDagCanvas` 二次挂载后状态**必须**回初始态 → 用例应失败。
2. `tests/panel-freshness-render.test.ts`（A2-1/A2-2）：两轮 `__html` 必然不同 → 用例应失败。
3. `evidence/probe-dag-reset.mts` 为独立复现探针（已实跑，见 `requirement.md` 证据节）；修复后其 A 段
   应能翻转成"保活"，实施完成时同步更新该探针的期望值并在验收材料里贴新输出。

## 人工验证（浏览器，A4） `serves: FR-2, FR-3`

| 步骤 | 观察点 | 通过条件 |
|------|--------|---------|
| 1. 打开会话 → 点右上角流程图「实施」节点展开面板 | 出现 DAG | 正常渲染 |
| 2. 点「横向」、开「关键路径」、单击某卡钉住、把面板滚到中段 | — | 视图按操作变化 |
| 3. **不动鼠标**等 ≥2 个轮询周期（≥12 秒），再触发一次任务事件（若手边有） | 方向/开关/钉住/滚动位置 | 全部不变（修前：回纵向 + 滚动回顶） |
| 4. 点「泳道」页签，重复第 3 步 | 页签与内容 | 仍停在泳道（修前：跳回 DAG） |
| 5. 切换到另一个绑定需求再打开同一节点 | 视图状态 | 初始态，不继承上一个需求 |

> 判定口径与 `requirement.md` 的 A4/A5 一致；第 3 步的 ≥2 个轮询周期对应缺省 `refreshMs = 5000`。
