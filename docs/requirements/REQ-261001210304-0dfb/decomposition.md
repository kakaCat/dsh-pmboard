# REQ-261001210304-0dfb 拆分计划 · 让刷新只换数据、不打断读图

> **目标**：会话节点面板（与需求详情页同一挂载入口）每一次刷新后，用户调的方向 / 关键路径 / 只看主线 / 钉住 /
> 页签 / 滚动位置全部保持；数据照常更新。
> **做法**：① 新增 client 内存记忆表（键 = `canvasId::需求id`）；② `mountDagCanvas` 按记忆回填 + 同步工具条 + 恢复滚动；
> ③ 把每轮都变的时间戳移出注入字符串（稳定钩子 + DOM 补丁），使数据未变时 `__html` 逐字节相同。
> 本计划须**人批准**后才落任务卡（`reqboard_decompose`）。

## 编号口径

| 编号 | 出自 | 指什么 |
|------|------|--------|
| FR-x | requirement.md 功能点 | 需求条款（本次 5 条） |
| I-1…I-5 | design/interfaces.md 第 1…5 节（**顺序一一对应，不另造号**） | 接口：挂载签名 / tryMount 透传 / 记忆表 API / 补丁 API / DOM 钩子契约 |
| A-x | design/test-cases.md 用例表 | 判定标准与用例（A1-1 … A7，含修前必红项） |
| t-x | 本文档任务表 | 计划任务（落库后成为任务卡） |
| UC-x | design/use-cases.md | 用户场景（按需引用） |

## 改动盘点（对照设计文档逐份）

| 文件 | 增/改 | 改动内容 | 设计出处 | 覆盖条款 |
|------|-------|---------|---------|---------|
| `src/client/dag/view-state.ts` | 新增 | 记忆表：`DagViewSnapshot` + `read/write/clear/clearByPrefix/size/_reset`；容量 16 FIFO；纯函数零 DOM | data-model.md 全篇、interfaces.md §2（I-3） | FR-1, FR-2, FR-4 |
| `src/client/views/dag-view.ts` | 改 | `mountDagCanvas` 增第 4 参 `opts?: { stateKey?: string }`：按记忆构造 initial、挂载后同步工具条 `is-on`、`paint` 后恢复 `wrap` 滚动、disposer 先写回快照再释放 | interfaces.md §1（I-1）、architecture.md「总体方案」 | FR-1, FR-2, FR-4 |
| `src/client/dag-mount.ts` | 改 | `tryMountDagCanvas` 透传 `opts`（rAF 包装与存在性检查不变） | interfaces.md §1（I-2） | FR-1, FR-2 |
| `src/client/panel-freshness.ts` | 改 | `freshnessSpan()` 改为**稳定占位**（不含时间戳）；新增 `hydrateFreshness(root, f)` 补文本/`is-stale`/`title`/`data-*` | interfaces.md §3（I-4）、§4（I-5） | FR-3 |
| `src/client/node-panel.ts` | 改 | 相对时间改稳定钩子 `relSlot(at)`（`<span data-dsh-pm-rel="<ms>">`）；新增 `hydrateRelTimes(root, now)`；`renderNodePanel` 增可选 `now`（测试可注入） | interfaces.md §3（I-4） | FR-3 |
| `src/client/panel-hydrate.ts` | 新增 | 面板补丁总入口 `hydrateNodePanel(root, { freshness, tab, now })`：新鲜度 + 相对时间 + 页签恢复 | interfaces.md §3（I-4） | FR-2, FR-3 |
| `src/client/conversation-progress.ts` | 改 | 挂载传 `stateKey = PANEL_DAG_CANVAS_ID + '::' + reqId`；注入 HTML 后调 `hydrateNodePanel`；页签点击写记忆；`reqId` 变化清上一键 | interfaces.md §1/§3、data-model.md「生命周期」 | FR-1, FR-2, FR-3, FR-4 |
| `src/client/board-mount.ts` | 改 | 需求详情挂载处传 `{ stateKey: 'dag-canvas::' + req.id }`（复用同一机制，一行） | interfaces.md §1 | FR-4 |
| `tests/dag-view-state.test.ts` | 新增 | 记忆表语义（A1-1/A5）+ 二次挂载回填与工具条同步（A1-2/A1-3，**修前必红**） | test-cases.md 用例表 | FR-1, FR-2, FR-4, FR-5 |
| `tests/panel-hydrate.test.ts` | 新增 | 补丁函数：新鲜度 / 相对时间 / 页签在不换元素前提下被填对（A3-1…A3-3） | test-cases.md 用例表 | FR-2, FR-3, FR-5 |
| `tests/panel-freshness-render.test.ts` | 改 | 断言从「字符串含数据时间」改为「含稳定占位且**不含**时间戳」+ 两轮 `__html` 逐字节相同（A2-1/A2-2，**修前必红**） | interfaces.md §5、test-cases.md | FR-3, FR-5 |
| `docs/requirements/REQ-261001210304-0dfb/evidence/probe-dag-reset.mts` | 改 | 期望值翻转为「保活」（A 段不再回初始态、B 段两轮相同） | requirement.md 证据节 | FR-5 |

**删除项**：无（不删任何既有文件/导出；`renderDag` 等既有未接线函数保持原样）。

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段 |
|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 建立 DAG 视图状态记忆表（契约先行） | FR-1, FR-4 | I-3 + `src/client/dag/view-state.ts` | implement | frontend | — | S | `npx vitest run tests/dag-view-state.test.ts` 中 A1-1/A5 用例全绿：合并写、拷贝隔离、非法滚动值按 0、容量 16 FIFO 淘汰、`clearByPrefix`、`np-dag-canvas::REQ-A` 写横向+只看主线后读 `np-dag-canvas::REQ-B` 为 `undefined` | dev, review |
| t2 | （落库后回填） | 挂载接缝按记忆回填并同步工具条与滚动 | FR-1, FR-2, FR-4 | I-1, I-2 + `src/client/views/dag-view.ts`、`src/client/dag-mount.ts` | implement | frontend | t1 | M | `npx vitest run tests/dag-view-state.test.ts` 中 A1-2/A1-3 绿（二次挂载后 `state()` 仍为 `horizontal/true/true/'t-b'`；`[data-dag-dir="horizontal"]` 带 `is-on`、`vertical` 不带；`wrap.scrollTop` 恢复为记忆值），且 `npx vitest run tests/dag-view.test.ts` 全绿（不传 opts 行为逐字节不变） | dev, review, test |
| t3 | （落库后回填） | 面板易变字段出注入字符串（稳定钩子 + 补丁） | FR-2, FR-3, FR-5 | I-4, I-5 + `src/client/panel-freshness.ts`、`src/client/node-panel.ts`、`src/client/panel-hydrate.ts` | implement | frontend | — | M | `npx vitest run tests/panel-freshness-render.test.ts tests/panel-hydrate.test.ts` 绿：两轮（仅 `fetchedAt` 差 5s）`renderNodePanel` 输出**逐字节相同**且不含 `数据时间`/`data-fetched-at=<值>`；`hydrateFreshness` 填对文本与属性、超阈值带 `is-stale`、元素未被替换；`hydrateRelTimes` 固定 `now` 下产出「刚刚/5 分钟前/日期」；`hydrateNodePanel({tab:'list'})` 后泳道 pane 无 `hidden` | dev, review, test |
| t4 | （落库后回填） | 会话面板与需求详情接线（key 作用域 + 清理） | FR-1, FR-2, FR-4 | I-1, I-3 + `src/client/conversation-progress.ts`、`src/client/board-mount.ts` | implement | frontend | t2, t3 | S | `npx vitest run tests/panel-refresh-wiring.test.ts tests/client-view.test.ts tests/node-panel.test.ts` 全绿；静态断言：两处挂载分别传 `{ stateKey: PANEL_DAG_CANVAS_ID + '::' + reqId }` 与 `{ stateKey: 'dag-canvas::' + req.id }`；页签点击写入记忆、`reqId` 变化清上一需求键（grep 可复核） | dev, review |
| t5 | （落库后回填） | 探针翻转 + 全量回归与构建验证 | FR-5 | A-x（test-cases.md 全表）+ `docs/requirements/REQ-261001210304-0dfb/evidence/probe-dag-reset.mts` | test | frontend | t2, t3, t4 | S | `npx tsx docs/requirements/REQ-261001210304-0dfb/evidence/probe-dag-reset.mts` 输出 A 段状态保持 `horizontal/true/true/t-b`、B 段两轮 `__html` 相同；`npx vitest run tests/dag-view-state.test.ts tests/panel-hydrate.test.ts tests/panel-freshness-render.test.ts tests/dag-view.test.ts tests/node-panel.test.ts` 全绿；`npx tsc --noEmit -p tsconfig.json` 本次文件零新增错误；`pnpm build:client` 通过 | verify |

- 一个任务只干一件事；标题动词开头；**不接受 L 工作量**（本计划最大 M）。
- 契约卡（t1）先行，实现/接线卡（t2/t4）`depends_on` 它；注入层（t3）与契约无耦合，可并行。

## 覆盖对照

| 需求条款 | 接口（interfaces） | 页面/模块（frontend） | 测试用例（test-cases） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 状态记忆与回填 | I-1, I-3（2） | `src/client/dag/view-state.ts`, `src/client/views/dag-view.ts`（2） | A1-1, A1-2, A1-3（3） | t1, t2, t4 | ✅ 3 卡 |
| FR-2 页签与滚动保活 | I-1, I-4（2） | `src/client/views/dag-view.ts`, `src/client/panel-hydrate.ts`（2） | A3-3, A4（2） | t2, t3, t4 | ✅ 3 卡 |
| FR-3 HTML 刷新稳定性 | I-4, I-5（2） | `src/client/panel-freshness.ts`, `src/client/node-panel.ts`（2） | A2-1, A2-2, A3-1, A3-2（4） | t3 | ✅ 1 卡 |
| FR-4 记忆作用域与清理 | I-3（1） | `src/client/dag/view-state.ts`, `src/client/conversation-progress.ts`, `src/client/board-mount.ts`（3） | A5（1） | t1, t4 | ✅ 2 卡 |
| FR-5 守卫测试与回归 | —（无新接口，纯验证） | `tests/dag-view-state.test.ts`, `tests/panel-hydrate.test.ts`, `tests/panel-freshness-render.test.ts`（3） | A1-1…A7（全表） | t3, t5 | ✅ 2 卡 |
| **合计** | 5 接口 | 5 模块/文件组 | 11 用例 | 5 任务 | **5/5 条款有主** |

> FR-5 的接口格写「—」的理由：该条款只要求守卫测试与回归全绿，**不新增任何运行时接口**（属需求边界内明确写明的一条）。
>
> 「接收任务」列**只写裸计划键**（`t1, t2`）——门禁从该列提取计划键做「FR ↔ 任务」覆盖判定，
> 键后带括号计数（形如 `t3（1）`）会被判为非法键，导致该条款被误报「未被接收」（本次提交实测踩过一次）。

## 不做（与 requirement.md「边界」逐条对齐）

1. 不改 `src/client/dag/*` 的渲染/布局/关键路径算法（只读复用）。
2. 不改刷新策略与数据通道（5s 兜底轮询、SSE 加速、新鲜度三块可见性口径不动）。
3. 不做跨页面重载持久化（不写 localStorage / 台账 / 服务端；F5 回初始态可接受）。

## 风险与回滚

| 风险 | 处置 |
|------|------|
| React 对 `__html` 相同即不重建 DOM 的行为假设不成立 | A2 用例钉字符串稳定性；若浏览器实测仍重建，FR-1/FR-2 的恢复路径仍保证 A1/A3/A4 通过（降级为"每轮恢复一次"，不丢用户选择） |
| 恢复滚动被浏览器夹取 | 记为已知次优；A4 手测判定；`ResizeObserver` 下一帧会按新宽度重排 |
| 记忆表条目增长 | 容量 16 + FIFO；`reqId` 变化清上一键；`_resetDagViewState` 供测试 |
| 回滚 | 纯 client 改动，回滚 = 还原 3 个改动文件 + 删除 2 个新增模块，无数据副作用（记忆仅内存） |
