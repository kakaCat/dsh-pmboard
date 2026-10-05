# REQ-261002105242-a3fb 拆分计划 · 让归档需求回到人的视野里（可回看、且不会再骗人点）

> **目标**：归档需求在看板上有一条稳定入口（底部折叠「已归档」条），点开后看到**与归档前同源**的只读详情
> （统计 + DAG + 任务表），列表视图的终态分组不再是死分支，服务端已移除端点的 client 残留一并清掉。
> **做法**：① 抽 `toCard` 单一构造点 → `toReqCards`（语义不变）+ `toTerminalCards`（archived ∪ canceled）；
> ② 新增 `renderArchivedBar`（复活既有 `.dsh-pm-archived-*` CSS，`<details>` 默认折叠）；
> ③ `buildBoard` 在泳道视图追加、`buildListView` 的 `finished` 改为 `done ∪ 终态`；
> ④ `renderActionBar` 对终态三态早退（只读）；⑤ 删 `api.archiveReq` / `case 'archive-req'` / `done` 分支按钮。
> 本计划须**人批准**后才落任务卡（`reqboard_decompose`）。范围仅 client 渲染层，**零持久化变更、零数据迁移**。

## 编号口径

| 编号 | 出自 | 指什么 |
|------|------|--------|
| FR-x | requirement.md 功能点 | 需求条款（本次 5 条） |
| I-x | design/interfaces.md 第 1…7 节（顺序一一对应，不另造号） | 接口/契约：投影 / 归档条 / 接线 / 只读操作条 / 移除的接口 / DOM 契约 / 错误语义 |
| D-x | design/data-model.md 第 1…5 节 | 数据模型：无持久化变更 / 派生投影 / 渲染模型 / 不变量 / 迁移回滚 |
| A-x | design/test-cases.md 用例表 | 判定标准与用例（A1-1 … A7，含修前必红项） |
| UC-x | design/use-cases.md | 用户场景（按需引用） |
| t-x | 本文档任务表 | 计划任务（落库后成为任务卡） |

## 改动盘点（对照设计文档逐份）

| 文件 | 增/改/删 | 改动内容 | 设计出处 | 覆盖条款 |
|------|---------|---------|---------|---------|
| `src/client/views/board.ts` | 改 | 抽私有 `toCard(state, req)` 为唯一构造点；`toReqCards` 改为经它派生（**签名与语义不变**）；新增 `toTerminalCards`（archived ∪ canceled，`updatedAt` 降序）；新增 `renderArchivedBar(cards, limit?)` + `ARCHIVED_CHIPS_MAX`；`buildBoard` 在泳道视图追加归档条；`buildListView` 的 `finished` 改为 `done ∪ toTerminalCards`、分组标题改「已完成 / 已归档」 | I-1, I-2, I-3；D-2, D-3；architecture「总体方案／模块改动地图」 | FR-1, FR-3, FR-5 |
| `src/client/styles/base.ts` | 改 | 归档条区段补 4 条规则：`.dsh-pm-archived-fold`、`.dsh-pm-archived-chips`、`.dsh-pm-archived-chip` 的 button reset（`border:0; cursor:pointer`）+ hover、`.dsh-pm-archived-count`；既有 `.dsh-pm-archived-bar/-label/-chip` 选择器**保持不动** | I-2, I-6 | FR-1 |
| `src/client/views/stage-detail.ts` | 改 | `renderActionBar` 对 `archived / canceled / done` 三态**早退返回 `''`**；删 `done + archive` 的 `archive-req` 渲染分支；更新函数头注释（不再是"四类按钮"里的归档） | I-4；D-4 | FR-2, FR-4 |
| `src/client/views/verification.ts` | 改 | `renderArchiveSection` 的 `done` 分支文案：删「请在详情头『本阶段操作』条点『归档』」指引，改为陈述事实（历史遗留 `done` 由窗口 agent 走 `reqboard_submit(kind=archive)` 补齐材料） | I-5 | FR-4 |
| `src/client/board-mount.ts` | 改 | 删 `case 'archive-req'` 事件分支 | I-5 | FR-4 |
| `src/client/api.ts` | 删（导出） | 删 `archiveReq()`（`POST /req/archive` 已由 REQ-9f4a44 移除；删前全仓调用方只有 `board-mount.ts` 一处） | I-5 | FR-4 |
| `tests/archived-entry.test.ts` | 新增 | A1-1 / A1-2 / A1-3 / A1-4 / A2 / A3 / A4 / A5 / A6 全套断言（纯字符串 + 模块面） | A-x（test-cases.md 用例表） | FR-1, FR-2, FR-3, FR-4, FR-5 |
| `tests/board-info-fixes.test.ts` | 改 | `:169` 用例从「已完成且材料已备 → 给 archive-req」翻转为「→ 无人工按钮」 | test-cases.md「需同步修订的既有用例」 | FR-4 |
| `tests/client-view.test.ts` | 改 | `:579` 的 `toContain('data-action="archive-req"')` 翻转为 `not.toContain`；`:585` 的 archived 断言保持 | 同上 | FR-4 |

**删除项汇总**：`api.archiveReq` 导出、`board-mount` 的 `archive-req` 事件分支、`renderActionBar` 的 `done` 归档按钮分支。
**不删**：`renderArchiveSection` 的归档信息展示、`renderVerifySection`、任何既有测试文件（改断言不删用例）。

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段 |
|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 定死终态投影与归档条渲染契约（纯函数 + 复活既有 CSS） | FR-1, FR-5 | I-1, I-2, I-6；D-2, D-3 + `src/client/views/board.ts`、`src/client/styles/base.ts`、`tests/archived-entry.test.ts` | ui | frontend | — | M | `npx vitest run tests/archived-entry.test.ts` 中 **A1-1**（含 `data-archived-bar` / `data-archived-count` / `<details` 段无 `open` 属性 / 每条 chip 带 `data-action="open-req"` + `data-req`）、**A1-3**（2 条 + `limit=1` ⇒ 「另有 1 条未显示」；`renderArchivedBar([])` ⇒ `''`）、**A1-4**（1 archived + 1 canceled ⇒ summary 同时含「已归档 1」「已取消 1」；canceled chip 带 `data-status="canceled"`）、**A6**（两投影互斥完备、`done` 仍在进行中投影、终态 `totalCount` = 真实任务数）**全绿**；同一命令下 **A1-2 / A2 / A4 仍失败**（证明接线与详情卡尚未做）；`npx vitest run tests/token-card.test.ts tests/client-view.test.ts` 全绿（`toReqCards` 语义未变） | dev, review |
| t2 | （落库后回填） | 接线看板两个视图：泳道挂归档条、列表终态分组复活 | FR-1, FR-3 | I-3；D-3 + `src/client/views/board.ts`、`tests/archived-entry.test.ts` | ui | frontend | t1 | M | `npx vitest run tests/archived-entry.test.ts` 中 **A1-2**（`data-archived-bar` 段**之前**的部分不含归档需求 id，该 id 在归档条段内出现）、**A2**（`buildReqDetail(archivedReq, [3 张任务])` 含 `dsh-pm-dag-panel`、3 个 `data-task` 行、统计「总任务 3」）、**A4**（`buildListView` 传 `done + archived + canceled` ⇒ 分组标题含「已完成 / 已归档」且归档/取消行可见）**翻绿**；`npx vitest run tests/client-view.test.ts` 全绿（「archived/canceled 不进泳道」的既有断言不倒退） | dev, review, test |
| t3 | （落库后回填） | 详情页终态只读：archived / canceled / done 恒不渲染操作条 | FR-2 | I-4；D-4 + `src/client/views/stage-detail.ts`、`tests/archived-entry.test.ts` | ui | frontend | — | S | `npx vitest run tests/archived-entry.test.ts` 中 **A3** 绿：`archived` / `canceled` / `done`（带归档材料）三种状态详情页均**不含** `move-req`、`plan-approve`、`plan-reject`、`verify-pass`、`verify-rework`、`archive-req`，且不含 `dsh-pm-action-bar`（**修前必红**：`canceled` + 未批准计划会渲染「批准计划」）；`npx vitest run tests/board-info-fixes.test.ts` 中「终态（archived）不渲染空操作条」保持绿 | dev, review |
| t4 | （落库后回填） | 清理僵尸归档入口 + 旧调用方收敛（**兼容卡**：无数据迁移） | FR-4 | I-5 + `src/client/api.ts`、`src/client/board-mount.ts`、`src/client/views/stage-detail.ts`、`src/client/views/verification.ts`、`tests/board-info-fixes.test.ts`、`tests/client-view.test.ts`、`tests/archived-entry.test.ts` | ui | frontend | t3 | M | `npx vitest run tests/archived-entry.test.ts tests/board-info-fixes.test.ts tests/client-view.test.ts` 全绿，其中 **A5**：`'archiveReq' in api === false`、`done`（带材料）详情整页无 `archive-req`、`renderArchiveSection(done)` 文案不含「点「归档」」；翻转后的既有用例（`board-info-fixes.test.ts:169`、`client-view.test.ts:579`）按新口径通过；`grep -rn "archiveReq\|archive-req" src` 输出为空 | dev, review, test |
| t5 | （落库后回填） | 全量回归 + 类型 + 客户端构建 + 浏览器人工核对 | FR-5 | A-x 全表 + `tests/archived-entry.test.ts` 等四文件 | test | frontend | t2, t3, t4 | S | `npx vitest run tests/archived-entry.test.ts tests/client-view.test.ts tests/board-info-fixes.test.ts tests/token-card.test.ts` **全绿**；`npx tsc --noEmit` 错误数 ≤ 基线 223 且本次改动文件零新增错误；`pnpm build:client` 输出含 `[verify-client] OK … CSS 分片完整`；浏览器按 test-cases.md 人工验证 5 步：展开归档条 → 点 `REQ-261001213924-1441` → 看到 DAG 与 39 行任务表、顶部无操作条、列表视图「已完成 / 已归档」组含归档行（截图/文字记录进验收材料） | verify |

- 一个任务只干一件事；标题动词开头；**不接受 L 工作量**（本计划最大 M）。
- **契约先行**：t1 是看板侧契约卡（投影签名 + 归档条 DOM 契约 + CSS 钩子），实现/接线卡 t2 `depends_on` 它。
  t3 只读操作条的契约是**三行早退**（interfaces.md §4 已定死），不引入新数据结构、与 t1 无共享代码，故不设依赖——
  依赖只在真有代码耦合处声明，不为了形式好看而造边。
- **兼容卡**：t4 承接「旧调用方（`archiveReq` / `archive-req`）收敛 + legacy `done` 提示改口径」；
  数据侧无迁移（见下节）。

## 覆盖对照

| 需求条款 | 接口（interfaces） | 模块/文件（frontend） | 测试用例（test-cases） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 恢复看板「已归档」区 | I-1, I-2, I-3, I-6（4） | `views/board.ts`, `styles/base.ts`（2） | A1-1, A1-2, A1-3, A1-4, A2（5） | t1, t2 | ✅ 2 卡 |
| FR-2 归档需求详情只读可回看 | I-4, I-6, I-7（3） | `views/stage-detail.ts`（1） | A2, A3（2） | t3 | ✅ 1 卡 |
| FR-3 列表视图终态分组修复 | I-1, I-3（2） | `views/board.ts`（1） | A4（1） | t2 | ✅ 1 卡 |
| FR-4 清理僵尸归档入口 | I-5（1） | `api.ts`, `board-mount.ts`, `views/verification.ts`（3） | A5（1） | t4 | ✅ 1 卡 |
| FR-5 回归保护（归档不吞任务） | I-1, I-7（2） | `tests/archived-entry.test.ts`（1） | A6, A7（2） | t1, t5 | ✅ 2 卡 |
| **合计** | 7 节接口 | 6 个文件 | 9 条用例 | 5 张任务卡 | **5/5 条款有主** |

## 迁移与兼容（显式结论：**无数据迁移**）

| 项 | 结论 | 依据 |
|----|------|------|
| 存量数据迁移 / 回填 | **不需要** | 本需求零持久化变更（data-model.md §1）：`queue.json` 与台账都不动；21 条已归档需求改完即出现在归档条 |
| 数据回滚 | **不需要** | 回滚 = `git revert` client 改动 + `pnpm build:client`（C-12）；无任何落盘状态需要还原 |
| 旧调用方收敛 | t4 承接 | `api.archiveReq` 唯一调用方在 `board-mount.ts`；删前 grep、删后类型检查兜底 |
| 旧数据（legacy `done`） | t4 改文案，**不新增状态机边** | `done` 是死态（`RequirementStatus.ts:67` `done: []`），归档正路仍是 `accepting → archived`（自动） |
| 旧服务端 / 旧 bundle | 无兼容矩阵 | 归档条只依赖 `status`/`title`/`updatedAt`/任务计数；部署整包替换，无新旧混跑窗口 |
| 灰度开关 | 不需要 | 纯渲染层，风险由 A1–A7 断言 + 浏览器人工核对承担 |

## 明确不做（与 requirement.md 边界一致）

1. 独立「归档」页签 / 第三个视图、归档条分页/搜索/按分类过滤；
2. 归档快照落盘或任何形式的任务副本（会造出第二份真相）；
3. `canceled → archived` 的人工 UI 入口（既有缺口，非本需求引入）；
4. 会话节点面板默认节点行为（归档节点仍显示归档材料；点「实施」节点照样能看 DAG）；
5. 复活 `POST /req/archive` 或为 `done` 新开人工出口。
