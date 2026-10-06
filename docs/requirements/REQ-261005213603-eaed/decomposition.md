# 拆分计划（REQ-261005213603-eaed）

> 目标一句话：**把看板运行圈的判据从「绑定窗口在跑回合」扩成「∪ 新鲜推进锁」，让后台跑子卡链的 run 也点亮圆圈**——
> 做法：client 侧新增一个纯判据函数 + 一个值类型，接进既有渲染单点；host / 台账 / 协议零改动。
> 本计划须**人批准**后才能落任务卡（`reqboard_decompose`）。

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| FR-x | requirement.md 功能点表 | 需求条款（FR-1～FR-6） |
| D-x | requirement.md「讨论与裁定记录（D-x）」 | 需求阶段裁定（本计划用到 D-1～D-4） |
| I-x | design/interfaces.md | 接口 / 函数契约（I-1～I-7） |
| T-x | design/data-model.md | 数据结构（T-1 `advanceLockAt` 补声明、T-2 `RunningMark`） |
| C-x | design/frontend.md | 页面 / 组件（C-1 泳道卡运行圈、C-2 列表行运行圈、C-3 既有自动链 pill） |
| UC-x | design/use-cases.md | 用户场景（UC-1～UC-6） |
| TC-x | design/test-cases.md | 测试用例（TC-1～TC-25） |
| t-x | 本文档任务表 | 任务 |

## §1 代码层面变更盘点（对照需求 + 设计一套）

**新增**（无新文件；新增的是**函数与类型**）：

- `src/client/session-running.ts`：`RunningCause` / `RunningMark` / `RequirementRunShape` / `requirementRunInFlight` / `requirementRunningMark` / `requirementBusy`（设计 I-1～I-3、T-2）。
- 客户端类型：`RequirementRecord.advanceLockAt?: number`（设计 T-1）。

**修改**（精确到函数）：

| 文件 | 函数/位置 | 改动 |
|---|---|---|
| `src/client/session-running.ts` | 模块导出 | 追加新导出；`requirementRunning` / `runningSessionIds` / `relevantSessionIds` / `sameRunningSet` / `runningAmong` / `subscribeSessionRunning` **一字不改** |
| `src/client/render/dom-utils.ts` | `renderRunningDot` | 入参 `running: boolean` → `mark?: RunningMark`；按 `cause` 出两种 `title`/`aria-label`；DOM/class 不变 |
| `src/client/views/artifacts.ts` | `renderReqCard` | 第 4 参 `running = false` → `mark?: RunningMark` |
| `src/client/views/board.ts` | 泳道卡映射（L126）、`renderListCard`（L330/L365） | 两处改调 `requirementRunningMark(req, isRunning, now)`；列表行 `_now` → `now`（真正使用） |
| `src/client/types.ts` | `RequirementRecord` | 补 `advanceLockAt?: number` |

**删除**：无（不删任何符号、不删路径、不回退既有判据）。

**不改**：host 侧（HTTP / 台账 / 工具 / 摘要投影）、样式分片 `src/client/styles/board.ts`、`board-mount.ts` 的订阅与门控。

## §2 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 原型锚点（UI 卡必填） | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段（可选） |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 定义判据契约与客户端类型声明 | FR-1, FR-2 | I-1, I-2, I-3, T-1, T-2 + `src/client/session-running.ts`、`src/client/types.ts` | — | D-2 | implement | fullstack | — | M | ① `npx vitest run tests/client-session-running.test.ts` 真值表全绿（TC-1～TC-10：缺键 / 非有限值 / 恰好 15min / 未来时间 / 成因优先级 / `requirementBusy` 与 mark 恒一致）；② `pnpm typecheck` 退出码 0；③ 源码级断言：`grep -n "advanceLockStaleMs" src/client/session-running.ts` 命中且文件内**无**第二处 stale 字面量 | dev,review |
| t2 | （落库后回填） | 把新判据接进渲染单点与两处视图 | FR-1, FR-3, FR-4 | I-4, I-5, I-7, C-1, C-2 + `src/client/render/dom-utils.ts`、`src/client/views/artifacts.ts`、`src/client/views/board.ts` | — | D-1, D-3 | ui | fullstack | t1 | M | ① `npx vitest run tests/client-view.test.ts` 全绿：锁新鲜出圈（TC-11）、双成因只一个圈且报会话（TC-12）、过期不出（TC-13）、省略参数逐字节一致（TC-14）、A/B 需求不串（TC-15）、列表位置契约（TC-16/TC-17）、样式分片仍在（TC-18）；② `pnpm build:client` 输出 `[verify-client] OK`；③ `pnpm typecheck` 退出码 0 | dev,review |
| t3 | （落库后回填） | 补判据真值表与实时增隐测试 | FR-1, FR-2, FR-3, FR-4, FR-5 | TC-1～TC-22 + `tests/client-session-running.test.ts`、`tests/client-view.test.ts`、`tests/board-attach.test.ts` | — | D-2, D-3 | test | fullstack | t1, t2 | M | ① 上述三个用例文件全绿且新增用例覆盖 TC-1～TC-22 每条断言；② `npx vitest run tests/client-session-running.test.ts tests/client-view.test.ts tests/board-attach.test.ts` 退出码 0；③ `pnpm test` 全量失败集合**不新增**（与改动前基线比对） | dev,review,test |
| t4 | （落库后回填） | 在旧红线处标注取代关系 | FR-6 | I-6（读侧契约的文档面）+ `docs/architecture/client-running-indicator.md`、`docs/requirements/REQ-261004210128-283d/design/data-model.md`、`docs/requirements/REQ-261004210128-283d/design/architecture.md` | — | D-2 | doc | doc | — | S | ① `grep -n "REQ-261005213603-eaed" docs/architecture/client-running-indicator.md docs/requirements/REQ-261004210128-283d/design/data-model.md` 两处均命中（TC-23/TC-24）；② `grep -n "executions\[\].outcome" docs/architecture/client-running-indicator.md` 仍命中（TC-25，执行记录判据未被解禁）；③ 283d 的历史验收结论与 D-x 表零改动（`git diff` 只含新增标注行） | dev,review |
| t5 | （落库后回填） | 核验兼容、回滚与交付基线 | FR-2, FR-4, FR-5 | I-6 + `src/client/session-running.ts`、`src/client/views/board.ts` | — | D-2 | test | fullstack | t2 | S | ① 兼容核验：把 `/state` 载荷里 `advanceLockAt` 整键去掉后跑 `npx vitest run tests/client-view.test.ts`，`buildBoard(state, 1)` 输出与改动前逐字节一致（旧服务端路径）；② 回滚演练：临时回退上述两文件的改动后 `pnpm build:client` 仍 `[verify-client] OK`，确认无数据残留（本次不落盘、不改 schema）；③ 交付基线：`pnpm typecheck` 退出码 0、`pnpm build:client` 退出码 0、`pnpm test` 失败集合不新增 | dev,review |

**子卡段说明**：t1/t4/t5 无接口可联调，落库时 `skipIntegration: true`（不落联调段）；t2/t3 按 phase 默认（test 相位自带测试段）。

**工作量口径**：S = 半天内，M = 1～2 天。无 L 卡，无需再拆。

**体量声明（files/anchors/chars → DU = files + anchors/2 + chars/2000，容量 16 DU）**：

| key | files | anchors | chars | DU | 判定 |
|---|---|---|---|---|---|
| t1 | 5 | 10 | 2600 | 5 + 5 + 1.3 = **11.3** | ≤16 ✓ |
| t2 | 5 | 8 | 2800 | 5 + 4 + 1.4 = **10.4** | ≤16 ✓ |
| t3 | 4 | 14 | 3200 | 4 + 7 + 1.6 = **12.6** | ≤16 ✓ |
| t4 | 5 | 3 | 1600 | 5 + 1.5 + 0.8 = **7.3** | ≤16 ✓ |
| t5 | 3 | 6 | 2000 | 3 + 3 + 1.0 = **7.0** | ≤16 ✓ |

（files = implementation 里点到的去重路径数 + 余量；门禁只堵"少报"，故只允许 ≥ 实际值。）

无超容量卡（`⚠️超容量` 标记不需要）。

## §3 覆盖对照

| 需求条款 | 接口（interfaces） | 页面/模块（frontend/data-model） | 测试用例（test-cases） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 | I-1, I-2, I-3, I-7 | C-1, C-2 | TC-1, TC-7, TC-8, TC-15, TC-19 | t1, t2, t3 | ✅ |
| FR-2 | I-1, I-6 | T-1 | TC-2, TC-3, TC-4, TC-5, TC-6, TC-10, TC-13 | t1, t3, t5 | ✅ |
| FR-3 | I-4, I-5 | C-1, C-2 | TC-11, TC-12, TC-16, TC-17, TC-18 | t2, t3 | ✅ |
| FR-4 | I-7 | C-1, C-2 | TC-19, TC-20, TC-21, TC-22 | t2, t3, t5 | ✅ |
| FR-5 | I-6 | T-1 | TC-3, TC-9, TC-14, TC-15, TC-21 | t1, t3, t5 | ✅ |
| FR-6 | —（纯文档条款：只改文档标注，无运行时接口） | —（纯文档条款：不新增页面/组件） | TC-23, TC-24, TC-25 | t4, t5 | ✅ |
| **合计** | 7 接口 | 3 组件 + 2 数据结构 | 25 用例 | 5 任务 | 6/6 条款有主 |

**场景对照（UC-x → 任务）**：UC-1 → t2, t3；UC-2 → t3, t5；UC-3 → t2, t3；UC-4 → t1, t3；UC-5 → t1, t3；UC-6 → t4。

**裁定对照（D-x → 任务）**：D-1 → t2；D-2 → t1, t3, t4, t5；D-3 → t2, t3；D-4 → 全卡（本需求不交原型，见下附注）。

## §4 附注一：为什么代码卡的「端侧」写 fullstack（**如实披露**）

本需求**零可视变化**（human 裁定 D-4：复用既有运行圈，DOM/class/样式/位置一字不动，无可视稿可画），
但 `requirement.md` 的 `sides` 含 `frontend`，于是拆分覆盖门的**UI 卡原型锚点维**
（`src/application/internal/content-gate-wiring.ts` 的 `assertUiCardPrototypeAnchors`）
会要求每张 `side === 'frontend'` 的卡给出 `prototypes/<name>.html#FR-N`——**而本需求无原型可锚**。

实测（拆分前探针，同一需求文档 + 同一张卡）：

```
side=frontend  -> prototype_anchor_missing（被拒）
side=fullstack -> PASS
side=backend   -> PASS
side=doc       -> PASS
```

该门**没有消费 `prototype_exempt`**（豁免只在 brainstorming→design 的三个原型门生效），
即「豁免成立」与「前端卡必带锚点」互相矛盾。

**本计划的处置（经人裁定，2026-10-05）**：代码卡声明 `fullstack`（文档卡声明 `doc`）以如实绕开该缺口，
**不修改**本需求已确认的需求/设计产物；缺口另立需求修门（见 §5）。

**影响范围如实声明**：`side` 影响 ①该锚点维、②子卡提示词的端侧提示、③RTM 统计。本次改动全部落在
`src/client/**`（前端包），声明 `fullstack` 在「后端也改了」这一点上是不精确的——这是为绕开门禁缺口
付出的代价，记录在此以便后续需求修门后回收。

## §5 附注二：缺口另立需求（本需求不做）

待另立需求的内容（不属本需求范围）：让 `prototype_exempt` 生效的需求**整维跳过** UI 卡原型锚点判据
（`assertUiCardPrototypeAnchors` 早退），并补单测：豁免未落章 → 仍拒；豁免已落章 → 放行。
本需求交付后另开一条需求承接（届时本需求可回收 §4 的 `fullstack` 声明）。

## §6 边界校验

- 每张卡可独立验收：t1～t5 的 acceptance 都写明「跑什么命令 / 看到什么」，新窗口零会话历史即可开工。
- 本计划不二次创作设计：所有卡都按 `design/*.md` 已确认的口径写；与设计矛盾时退回设计改计划。
- 不超范围：无 host / 台账 / 协议 / 样式分片改动；FR-6 只加文档标注。
