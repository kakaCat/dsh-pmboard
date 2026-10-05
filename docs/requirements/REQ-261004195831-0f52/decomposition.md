# 拆分计划（REQ-261004195831-0f52）

> **目标**：让看板需求详情页在「`/state` 只下发摘要」的新契约下重新可用——进入详情按需取全文
> （`GET /requirements/:id`）、三态显式呈现、缺字段不崩；服务端与台账零变更。
> **做法**：新增纯逻辑模块 `req-detail-store`（在途去重 + 按 version/revision 失效）与三态占位纯函数，
> 把 `board-mount` 的 `case 'req'` 从「读摘要」改为「读 store 条目分支渲染」，并给既有渲染补缺字段兜底。
> 本计划须**人批准**后才能落任务卡（reqboard_decompose）。

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| FR-x | requirement.md 功能点表 | 需求条款 |
| I-x | 本表（interfaces.md 契约条目，本次在计划内编号） | 接口/客户端契约 |
| P-x | frontend.md 落点（本次在计划内编号） | 前端模块/文件 |
| UC-x | use-cases.md 场景总览 | 用户场景 |
| TC-x | test-cases.md 用例 | 测试用例 |
| tN | 本文档任务表 | 计划 key |

**I/P 编号对照（本次范围）**：

| 编号 | 名称 | 出自 interfaces.md / frontend.md |
|---|---|---|
| I-1 | `GET /requirements/:id`（既有，只接线） | interfaces.md §服务端契约 |
| I-2 | `createReqDetailStore` / `ReqDetailStore.ensure·get·retry·reset` | interfaces.md §req-detail-store |
| I-3 | `buildDetailLoading` / `buildDetailMissing` / `buildDetailError` | interfaces.md §views/detail-states.ts |
| I-4 | `buildReqDetail` 入参兜底 + `renderComments` 放宽 | interfaces.md §既有渲染入口 |
| P-1 | `src/client/req-detail-store.ts`（新增） | frontend.md §目录与包结构 |
| P-2 | `src/client/views/detail-states.ts`（新增） | frontend.md §目录与包结构 |
| P-3 | `src/client/board-mount.ts`（改：case 'req' / retry 委派） | frontend.md §目录与包结构 |
| P-4 | `src/client/views/stage-detail.ts` + `src/client/render/dom-utils.ts` + `src/client/views/stage-panel.ts`（改：防御） | frontend.md §目录与包结构 |

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段（可选） |
|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 实现详情取数模块 req-detail-store 并落地 store 单测 | FR-1, FR-3 | I-2 + P-1 (`src/client/req-detail-store.ts`, `tests/req-detail-ondemand.test.ts`) | implement | frontend | — | S | `npx vitest run tests/req-detail-ondemand.test.ts -t req-detail-store` 全绿：首次 ensure 恰 1 次取数；同 tick 三次 ensure 仍只 1 次请求；version/revision 不变不重取、变则重取 | （skipIntegration：无接口联调） |
| t2 | （落库后回填） | 实现详情三态占位渲染（加载 / 未找到 / 失败） | FR-2 | I-3 + P-2 (`src/client/views/detail-states.ts`, `tests/req-detail-ondemand.test.ts`) | ui | frontend | t1 | S | `npx vitest run tests/req-detail-ondemand.test.ts -t detail-states` 全绿：missing 含「未找到」+ reqId + `data-detail-state="missing"`；error 含服务端 error 原文 + hint + `data-action="retry-detail"`；hint 缺省时不渲染 hint 块 | （skipIntegration） |
| t3 | （落库后回填） | 为详情与任务卡渲染补缺字段防御性降级 | FR-4 | I-4 + P-4 (`src/client/views/stage-detail.ts`, `src/client/render/dom-utils.ts`, `src/client/views/stage-panel.ts`, `tests/req-detail-ondemand.test.ts`) | implement | frontend | t1 | S | `npx vitest run tests/req-detail-ondemand.test.ts -t detail-defense` 全绿：摘要形状调 `buildReqDetail` 不抛异常且含「暂无评论」；`renderComments(undefined/null/[])` 三者输出逐字节相同 | （skipIntegration） |
| t4 | （落库后回填） | 把详情视图接到 req-detail-store（四态分支 + 去重 + 草稿/Tab 回填） | FR-1, FR-2, FR-3 | I-2 + I-3 + P-3 (`src/client/board-mount.ts`) | implement | frontend | t1, t2, t3 | M | 手工 M-1/M-2 通过（打开详情正常渲染、控制台无 TypeError；Network 中该需求恰 1 条 `requirements/<id>`、首屏 0 条）＋ `pnpm typecheck` 退出码 0 ＋ `pnpm build:client` 输出 `[verify-client] OK` | （skipIntegration） |
| t5 | （落库后回填） | 跑回归收口（新用例 + 类型检查 + 重建 bundle + 基线比对） | FR-5 | I-4 + P-1 (`tests/req-detail-ondemand.test.ts`, `docs/requirements/REQ-261004195831-0f52/evidence/verification.md`) | test | frontend | t1, t2, t3, t4 | S | `npx vitest run tests/req-detail-ondemand.test.ts tests/state-payload-client.test.ts` 全绿；`pnpm typecheck` 退出码 0；`pnpm build:client` 含 `[verify-client] OK`；`npx vitest run` 失败数 ≤ 106 | （按 test 阶段兜底） |

- 一个任务只干一件事，标题动词开头。
- 工作量口径：S = 半天内 / M = 1~2 天。
- 无 L 级任务；无卡跨层（取数模块 / 占位渲染 / 防御 / 接线 / 回归各归各卡）。
- **t4 的 `depends_on` 含 t1/t2/t3**：契约定死（t1/t2）与渲染兜底（t3）先落地，接线卡才动 `board-mount`。

## 覆盖对照

| 需求条款 | 接口（interfaces） | 页面/模块（frontend） | 测试用例（test-cases） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 | I-1, I-2（2） | P-1, P-3（2） | TC-2, TC-3（2） | t1, t4（2） | ✅ |
| FR-2 | I-3（1） | P-2, P-3（2） | TC-5, TC-6, TC-7（3） | t2, t4（2） | ✅ |
| FR-3 | I-2（1） | P-1, P-3（2） | TC-3, TC-4, TC-7（3） | t1, t4（2） | ✅ |
| FR-4 | I-4（1） | P-4（1） | TC-1, TC-8（2） | t3（1） | ✅ |
| FR-5 | I-4（1） | P-1（1） | TC-1…TC-8 + 命令节（8） | t5（1） | ✅ |
| **合计** | 4 项契约（I-1…I-4） | 4 个落点（P-1…P-4） | 8 条用例（TC-1…TC-8） | 5 张卡（t1…t5） | 5/5 条款有主 |

**反向核查**：interfaces.md 的 4 项契约（I-1…I-4）与 frontend.md 的 4 个落点（P-1…P-4）全部在本表被认领，
无超范围设计；use-cases.md 的 UC-1…UC-4 分别由 M-1…M-5 手工验收与 TC-1…TC-8 覆盖
（UC-1→TC-1/TC-2/TC-5、UC-2→TC-3/TC-4、UC-3→TC-5、UC-4→TC-6/TC-7）。

## 体量声明（footprint 与 DU）

`detailUnits = files×1 + anchors×0.5 + chars/2000`，容量 16 DU（`src/domain/limits.ts`）。

| 计划 key | files | anchors | chars | detailUnits | 是否超容量 |
|---|---|---|---|---|---|
| t1 | 2 | 4 | 1500 | 2 + 2.0 + 0.75 = **4.75** | 否 |
| t2 | 2 | 3 | 1200 | 2 + 1.5 + 0.60 = **4.10** | 否 |
| t3 | 4 | 3 | 1100 | 4 + 1.5 + 0.55 = **6.05** | 否 |
| t4 | 1 | 4 | 1700 | 1 + 2.0 + 0.85 = **3.85** | 否 |
| t5 | 2 | 5 | 900 | 2 + 2.5 + 0.45 = **4.95** | 否 |

- 无卡超容量，故无「⚠️超容量」标记。
- `files` 均 ≥ implementation 中点到的工作区路径数（逐卡自查：t1=2/2、t2=2/2、t3=4/4、t4=1/1、t5=2/2）。

## 覆盖完整性规则自检

1. **每行三格不空**：FR-1…FR-5 的接口 / 页面模块 / 用例三格均有编号，无空格。
2. **反向核查**：设计文档与用例表里的编号在本表全部有人认领（见上方反向核查段）。
3. **每个 FR 有人接**：FR-1→t1/t4、FR-2→t2/t4、FR-3→t1/t4、FR-4→t3、FR-5→t5；5/5 覆盖，无孤儿条款。
