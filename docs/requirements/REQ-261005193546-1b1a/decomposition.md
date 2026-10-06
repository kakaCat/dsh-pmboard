# 拆分计划（REQ-261005193546-1b1a 看板 DAG 不再展示已取消卡：让视图与统计都不再算上退出赛道的卡片）

> 目标：让**已取消卡**从全部界面投影与全部分母里彻底消失（DAG 层级 / 甘特 / 卡面计数 / 追溯 / 覆盖度门 / 详情计数），
> 同时**台账一条不删**、取消动作留下「谁 / 何时 / 为什么」，并把这些口径收敛成**一个单点判据**（FR-4）。
> 做法：**契约先行 → 依赖判定同源 → 数据留痕 → 入口/边界收敛 → 客户端与内部收编 → 防漂移网 → 用例矩阵 → 逆向演练**，13 张卡。
> 本计划须**人批准**后才能落任务卡（`reqboard_decompose`）。
> 契约源：`docs/requirements/REQ-261005193546-1b1a/requirement.md`（6 条 FR / 8 条 D-x / 9 条验收标准）
> 与 `docs/requirements/REQ-261005193546-1b1a/design/` **8 份全部**（architecture / interfaces / data-model / backend / frontend / migration / test-cases / use-cases）。
> 权威原型：`prototypes/dag-canceled-hidden.html`（`prototypes/INDEX.md` 里唯一一条 `authoritative`；两态并排：`#mock-after` 权威口径 / `#mock-before` 对照口径）。
> 机器可读同源文件：`docs/requirements/REQ-261005193546-1b1a/notes/plan-tasks.json`（本文件 §2/§3/§4 与它**逐字同源**，即 `reqboard_submit(kind=plan)` 的 `tasks` 入参）。
> 本阶段**不二次创作设计**：与设计不一致或设计未点名之处一律进 §6「需退回设计 / 需人拍板」，不在卡里私改口径。

## 改动盘点（对照 design/ 8 份逐份列）

### 1. architecture.md（消费点清单 / 不变量 / 防漂移 / 缺陷说明）

| 设计节 | 认领卡 |
|---|---|
| §需求文档改动位置表的更正对照（**拆分阶段以它为准，不得照需求文档那两行拆**） | 覆盖度入口 t4 · `QueryDag` 节点数组与层号 t6 · 客户端三处 t5/t8 · 依赖判定四处 t2 · 界面状态档位 t8 |
| §消费点清单 ① API 边界（`handleState` 双收敛） | t5 |
| §消费点清单 ② 服务端面板与统计（`QueryStageDetail` 基类 / `QueryDag` / `QueryDocs` / `QueryReport` / `QueryState`） | t6 |
| §消费点清单 ③ 追溯与门禁（RTM 两个公开入口：18 + 3 调用点） | t4 |
| §消费点清单 ④ 客户端消费面（甘特 / 画布 / 卡面 / 阶段详情分层 / 子卡链） | t8（改动面）· t11（读数断言） |
| §消费点清单 ⑤ 依赖判定四处（含 V-5 假就绪） | t2（判据同源）· t10（V-5 分档） |
| §依赖边语义（剔节点 + 剪边 + 出参剪边 + 就绪同源；`topoLevels` 内部剪边） | t1（单点）· t6（服务端出参）· t8（客户端剪边） |
| §不变量 INV-1~INV-5 与 INV-2 落地清单 a~d | t9（单点与源码级）· t11（等值）· t12（界面口径四条） |
| §防漂移设计（A 档硬禁 + B 档基线 + 新增即红 + 独立用例） | t9 |
| §安全与性能（读宽容 / 写严格 / V-5 耦合炸点） | t10 |
| §逆验证清单（14 条） | t13 |

### 2. interfaces.md（1 个契约总览表 + 8 个接口面）

| 接口面 | 内容 | 落卡 |
|---|---|---|
| 1 | 活卡判据单点 `isLiveTask` / `liveTasksOf` / `liveCountOf` | t1 |
| 2 | 依赖判定单点 `isDependencySatisfied` / `splitDependencyEdges` / `isReadyTask` | t1（定义）+ t2（四处接线） |
| 3 | 分层输入 `layerInputOf` | t1（定义）· **写路径改不改有冲突，见 §6-2**（本计划按 architecture 的 B 方案：落盘分层照旧、读路径现算） |
| 4 | 视图投影接线（DAG 层级 / DAG 面板 / `/state` / Docs / Report / State） | t5 · t6 |
| 5 | RTM 喂入入口收敛（两个公开入口、签名不变） | t4 |
| 6 | 取消留痕写侧 `markCanceled` + 4 个入口点 | t3 |
| 7 | 错误语义：**无新增**（`REQBOARD_*` / domain 错误码 / 门禁码 / V-x 都不新增） | t10（核对不改） |
| 8 | 反面断言：字面量基线 + 「新增即红」 | t9 |

### 3. data-model.md（字段 / 语义 / 兼容矩阵 / 不变量）

| 类别 | 清单 | 落卡 |
|---|---|---|
| `TaskRecord` 三加性可选字段（`canceledAt` / `canceledBy` / `cancelReason`） | 覆盖式（= 最近一次取消）、缺省 = 未采集、不 bump `REQBOARD_SCHEMA_VERSION`(9) / `QUEUE_VERSION`(1)、不进 `REQUIRED_TASK_FIELDS` | t3 |
| 取消三字段的写入规则（仅人写 `canceledBy`、trim 非空才写 `cancelReason`、批量取该批动作的人与原因、复活不清空） | — | t3 |
| §3 取消态与统计对照表第 1/2/4/5/6/7/8 行（本次要改的读数） | 视图行数 / 详情计数 / 甘特与画布 / 追溯 / 覆盖度分母 / 层号 / ready | t4 · t5 · t6 · t8 · t12 |
| §4 兼容矩阵（旧分片零异常 / 零写回 / 陈旧派生字段 / `save` 仍强校验 / 实测 62 份 0 例触发） | — | t10 |
| §5 INV-A~INV-G | 界面卡数 == 统计分母 / 取消卡只在审计可见 / 判据唯一 / 留痕同生 / 覆盖式 / 不阻塞 / 文档面板口径 / 无删除 | t9 · t11 · t12 |
| §7 示例与反例（`null` / 空串 / `kind:'agent'` / 读取补写 一律拦住） | — | t3（写侧断言）· t10（读侧不补写） |

### 4. backend.md（S-1~S-15 + 出口清单 + 风险）

| 服务/函数 | 落卡 | 服务/函数 | 落卡 |
|---|---|---|---|
| S-1 `isLiveTask`/`liveTasksOf`/`liveCountOf` | t1 | S-9 `handleState`（含计数与面板出口） | t5 |
| S-2 `isDependencySatisfied`/`splitDependencyEdges` | t1 | S-10 `queryDag`（+`liveLayers` 现算） | t6 |
| S-3 `isReadyTask`/`liveReadyTasks` | t1 | S-11 `syncRTMYamlWithSnapshot`（看板三条路由直调） | t4 |
| S-4 `layerInputOf`/`liveLayers` | t1 | S-12 `syncRTMYaml`（18 个调用点） | t4 |
| S-5 `computeReady`（写路径判据改调单点） | t2 | S-13 `markCanceled` | t3 |
| S-6 `readyTasks`（收敛为薄封装） | t2 | S-14 `transitionTask`（`to === 'canceled'` 调 S-13） | t3 |
| S-7 `readyTasksOf`（收敛为薄封装） | t2 | S-15 `coverageGateOf`（**不改**） | t12（断言 `total <= 0` 不执法） |
| S-8 V-5（判据改 `isDependencySatisfied`；分档） | t2（判据）· t10（分档） | 出口清单 15 行（`stages.ts` 摘要/会话面板/节点详情、`QueryDag`、`QueryStageDetail`、`QueryDocs`、`QueryReport`、`QueryState`、`sheet-tasks`、`verification-doc-writer`、`content-trace`、`backfill-task-refs`、`SubmitVerification` ×4、RTM 两入口） | t4 · t5 · t6 · t7 |

### 5. frontend.md（P-1 / P-2 / C-1~C-9）

| 编号 | 认领卡 |
|---|---|
| C-1 需求卡进度读数 · C-2 甘特摘要 · C-3 DAG 画布 · C-4 任务总览页 | t5（数据源收敛）· t8（`toCard` 独立漏点兜底）· t11（四展示面同数断言） |
| C-5 DAG 层级块（**真正的分层在客户端当场算**） | t6（基类剔卡 + 出参剪边）· t8（`topoLevels` 内部剪边）· t11（三处层号同台比对） |
| C-6 DAG Tab 图与摘要（含 `data-dag-statuses` 不含 `canceled` 档） | t6（层号现算）· t8（断言档位不含取消档） |
| C-7 追溯 / RTM 行 | t4（喂入收敛）· t12（**限新触发过 RTM 的需求**才断言数值） |
| C-8 台账 / 归档视图（**唯一故意不过滤的渲染块**，审计面） | t10 · t12（界面 0 条 **且** 台账 26 条一起断言） |
| C-9 打开卡文档（既有委派） | 复用不改 |
| §严格不可见（不给开关 / 不给计数交代 / 不弱化行 / 不补偿性交代） | t8（源码与文案断言）· t12（`data-doc-row` 恒等） |

### 6. test-cases.md（TC-1~TC-11 + 标本 S-1~S-9 + 逆验证表 + 7 条假红防线）

| 用例 | 落卡 | 用例 | 落卡 |
|---|---|---|---|
| TC-1 已取消卡退出 DAG 层级（106 行 / 取消卡 0 条） | t8 | TC-7 留痕三字段 + 非人工不写 + 复活不清空 | t3 |
| TC-2 层号 == 删边重算（含客户端 `topoLevels`） | t11 | TC-8 旧数据读取不报错、不写盘 | t10 |
| TC-3 被取消前置挡住的活卡真的能开工（五处同源） | t11 | TC-9 界面 0 条 + 台账 26 条 | t12 |
| TC-4 四个展示面同一个数（+ S-2 对照差 26） | t11 | TC-10 文档面板不列取消卡产物 + 恒等式换活卡口径 | t12 |
| TC-5 覆盖度门两入口同分母 + 两种失败形态 | t12 | TC-11 严格不可见 + 可访问性 + 既有锚点不破 | t8 |
| TC-6 防漂移：新增手写即红（**独立新用例**） | t9 | 标本 S-1~S-9 与假红防线 1~7 | t3 · t8 · t9 · t10 · t11 · t12 |
| 逆验证表（11 行「怎么改坏 → 哪条红」） | t13（矩阵化） | 边界（brainstorming 不适用 / 读数未知不判 / 存量豁免 / 活卡 0 张 / 陈旧快照） | t4 · t10 · t12 |

### 7. use-cases.md（UC-1~UC-6 + 异常 A~F）

| UC / 异常 | 认领卡 |
|---|---|
| UC-1 交付负责人打开「DAG 层级」 | t6 · t8 · t11 |
| UC-2 甘特 / 卡面计数 / DAG 层级三处同数 | t5 · t8 · t11 |
| UC-3 活卡依赖已取消卡仍可开工（**真缺陷**） | t1 · t2 · t5 · t11 |
| UC-4 验收的人过覆盖度前置门（两段口径） | t4 · t12 |
| UC-5 人取消一张卡（人工门 + 批量语义 + 解锁下游） | t3 · t10 |
| UC-6 复盘的人从台账读「谁因什么取消了这 26 张」 | t3 · t10 · t12 |
| 异常 A 依赖缺口 | t2 · t8 · t11 |
| 异常 B 旧数据无三字段（**判据只看 status**，否则旧取消卡会复活） | t1（判据）· t10（读侧） |
| 异常 C 取消不能用来刷读数（分子分母同源） | t12（对照 C） |
| 异常 D 半成品：只改显示侧、漏改就绪 | t11（TC-3） |
| 异常 E 存量 `ready[]` 与新语义不符（读宽容 / 写严格 / 漏就绪降 warning） | t10 |
| 异常 F 存量需求追溯读数停在旧快照 | t12 · t13（限定语写进证据） |

### 8. migration.md（零迁移 / 回滚 / 兼容 / 风险 ①~⑦ / 上线顺序）

| 项 | 落卡 |
|---|---|
| §迁移步骤：**无迁移脚本**、无版本常量变更、历史文件不删不改 | t10 |
| §回滚路径：回滚 = 两行判据退回旧语义（`isLiveTask` 恒真 / `isDependencySatisfied` 只认 done），且 `computeReady` 与 V-5 **配对回退** | t2 · t10（配对关系写进卡内） |
| §风险 ① 某消费点漏改 → 两套分母 | t4（两入口）· t9（源码级断言）· t9 逆验证 |
| §风险 ② 分层变化影响既有断言（实测既有用例无取消卡标本） | t11（新增标本，不改旧期望值） |
| §风险 ③ 覆盖度门「放宽」疑虑（只剔 canceled，阈值不动） | t4 · t12 |
| §风险 ④ **V-5 与写路径隐性耦合 → 写被拒 / 读成空队列** | t2（判据同批）· t10（读宽容 + 分档） |
| §风险 ⑤ API 出口漏接 | t5（出口清单逐条接线） |
| §风险 ⑥ 留痕漏接「回退批量取消」（标本 26 张全部来自此路径） | t3（四个写入点） |
| §风险 ⑦ 三字段成败语义被误读（覆盖式 / 非人不写 / 复活保留） | t3 · t10 |
| §上线顺序与验证 步骤 1/2/3 + 逆向演练 + 全量回归 | t2 · t3 · t4 · t9 · t13 |

## §1 RTM 覆盖对照表（根编号 ↔ 接口/模块/用例/接收任务）

| 需求条款 | 接口（interfaces） | 页面/模块（frontend/backend） | 测试用例（test-cases） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 已取消卡退出 DAG 层级、且不阻塞活卡依赖 | I-1, I-2, I-4（§2 / §3.2 / §4.1） | S-1, S-2, S-3, S-4, S-9, S-10, C-5, C-6 | TC-1, TC-2, TC-3, TC-4, TC-11 | t1, t2, t5, t6, t8, t11, t13 | ✅ |
| FR-2 一个口径贯穿全部统计 | I-4, I-5（§4.2 投影禁止项 / §5 RTM 两入口） | S-9, S-10, S-11, S-12, S-15, C-1, C-2, C-3, C-4 | TC-4, TC-5 | t4, t5, t6, t7, t8, t11, t12, t13 | ✅ |
| FR-3 取消动作留下「谁 / 何时 / 为什么」 | I-6（§6 `markCanceled`） | S-13, S-14, C-8 | TC-7, TC-8 | t3, t10 | ✅ |
| FR-4 「活卡」判据收敛为单点 | I-1, I-2, I-5, I-8（§8 基线与新增即红） | S-1, S-2, S-3, S-6, S-7, S-11, S-12 | TC-6（+ TC-2/3/4 的复用前置） | t1, t2, t4, t7, t9, t13 | ✅ |
| FR-5 界面不出现、台账不消失 | I-4, I-7（§4.2 / §7 错误语义） | S-9, S-10, C-5, C-6, C-7, C-8 | TC-1, TC-9, TC-10, TC-11 | t5, t6, t7, t8, t10, t12, t13 | ✅ |
| FR-6 兼容与不追溯（零迁移、旧数据零异常、不写回） | I-3, I-7（§3.3 读侧重算 / §7） | S-8（V-5）, `QueueRepository.load`/`save`, C-6 | TC-8 | t3, t10, t12 | ✅ |
| **合计** | 8 个接口面全部认领（I-7 如实记为「无新增错误码」） | 后端 S-1~S-15 全部有卡（S-15 如实记为「不改，只断言不执法」）+ 前端 C-1~C-9（C-9 复用不改） | 11 个 TC 全部有卡 | 13 任务 | **6/6 条款有主** |

- 每行「接口 / 页面模块 / 用例」三格均非空，无「—」豁免行（本需求无纯文档条款）。
- 反向核对：architecture 的消费点清单 ①~⑤、interfaces 的 I-1~I-8、data-model 的 INV-A~INV-G、backend 的 S-1~S-15 与 15 行出口清单、frontend 的 P-1/P-2 与 C-1~C-9、test-cases 的 TC-1~TC-11 与 7 条假红防线、use-cases 的 UC-1~UC-6 与异常 A~F、migration 的风险 ①~⑦ —— 均在 §改动盘点 逐节认领，无遗漏、无「本轮不做」。

## §2 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 原型锚点（UI 卡必填） | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段（可选） |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | —（落库回填） | 定义活卡判据与依赖判定单点（9 个纯函数落既有 Predicates.ts） | FR-1, FR-4 | I-1/I-2/I-3/I-4（§2、§3.2）· `src/domain/status/Predicates.ts` | — | D-6, D-8 | implement | backend | — | 7.95 DU | 9 函数逐条断言；`isLiveTask` 仅 `canceled` 为假、`liveLayers` 与删边重算相等 | 默认（按 phase） |
| t2 | —（落库回填） | 依赖判定四处收敛到单点，且 V-5 判据同批同源 | FR-1, FR-4 | S-5/S-6/S-7/S-8（§3.1、§3.3）· `topology.ts` / `protocol.ts` / `queue-access.ts` / `validateQueue.ts` | — | D-6, D-8 | implement | backend | t1 | 10.55 DU | 三处就绪逐字相等且都含 `t-l`；新语义载荷 `passed === true`、`save` 不抛 | 默认（按 phase） |
| t3 | —（落库回填） | 加 `TaskRecord` 三加性可选字段与 `markCanceled`，接四个取消写入点 | FR-3, FR-6 | I-6（§6）· `shared/protocol.ts` / `task-transition.ts` / `rollback-tasks.ts` / `stale-rework.ts` / `rollback-cleanup.ts` | — | D-1, D-5 | implement | backend | t1, t2 | 12.15 DU | 三字段与 `statusHistory` 同源同刻；非人不写 `canceledBy`；复活不清空 | 默认（按 phase） |
| t4 | —（落库回填） | 两个 RTM 公开入口各自收敛为活卡（覆盖度分母剔卡） | FR-2, FR-4 | I-5（§5）· S-11/S-12 · `rtm-yaml.ts` | — | D-4, D-6 | implement | backend | t1 | 6.25 DU | 两入口 `coverage.total === 106` 且逐字段相等；全取消不执法 | 默认（按 phase） |
| t5 | —（落库回填） | API 边界收敛：`/state` 的 tasks / ready / 计数全部按活卡下发 | FR-1, FR-2, FR-5 | I-4（§4.1 落点 3）· S-9 · `http/routers/stages.ts` | — | D-4, D-7 | implement | backend | t1, t2 | 6.45 DU | 出参取消卡 0 条、`ready ⊆ 活卡`、摘要分母同源；陈旧 `ready[]` 不影响 | 默认（按 phase） |
| t6 | —（落库回填） | 服务端投影收敛：基类一次收敛 + DAG 层号现算 + 文档/报告/状态收编 | FR-1, FR-2, FR-5 | I-4（§4.1 落点 1/2/4/5/6）· S-10 · `QueryStageDetail` / `QueryDag` / `QueryDocs` / `QueryReport` / `QueryState` | — | D-3, D-4, D-7 | implement | backend | t1, t2 | 13.25 DU | 基类出口 106 且取消卡 0；`layer === liveLayers`；文档面板恒等式换活卡口径 | 默认（按 phase） |
| t7 | —（落库回填） | 服务端内部与用例面收编手写活卡 filter（只换判据来源） | FR-2, FR-4, FR-5 | §出口清单（`sheet-tasks` / `content-trace` / `verification-doc-writer` / `backfill-task-refs` / `SubmitVerification` / `RollupSpec`） | — | D-4, D-6 | implement | backend | t1 | 11.85 DU | 四处投影取消卡 0 条；探针与落盘同分母（都 106） | 默认（按 phase） |
| t8 | —（落库回填） | 客户端展示面：卡面计数兜底 + 分层剪边落进 `topoLevels` + 本地 `live` 收编 | FR-1, FR-2, FR-5 | I-4（§4.1 落点 7）· C-1/C-2/C-3/C-5 · `client/views/board.ts` / `client/stage-panel.ts` / `client/node-panel.ts` / `client/render/subtask-view.ts` | `prototypes/dag-canceled-hidden.html#FR-1`<br>`…/#FR-2`<br>`…/#FR-5` | D-2, D-3, D-7, D-8 | ui | frontend | t3, t5, t6 | 12.20 DU | `canceledRowsShown === 0`、`liveCardCount === 106`、`canceledLedgerRows === 26`；`t-l` 层号 0（去掉剪边必红） | 默认（按 phase） |
| t9 | —（落库回填） | 字面量基线清单与「新增即红」独立用例（不挂进 layer-boundary） | FR-4 | I-8（§8）· `tests/live-tasks-single-source.test.ts` + 基线清单文件 | — | D-6 | test | backend | t1, t2, t3, t4, t5, t6, t7, t8 | 7.50 DU | 基线外新增命中 `=== 0`；收编点体内零手写比较；三条逆验证各必红 | 默认（按 phase） |
| t10 | —（落库回填） | 迁移与兼容：零迁移核对 + 旧分片读取 + 读侧宽容 + V-5 分档 | FR-3, FR-5, FR-6 | I-3/I-7（§3.3、§7）· `QueueTypes.ts` / `validateQueue.ts` / `QueueRepository.ts` | — | D-1, D-5 | implement | backend | t1, t2, t3 | 9.55 DU | 旧分片读得出（非 `[]`）、零写回（mtime+sha256 逐份不变）、漏就绪 warning / 假就绪 issue | 默认（按 phase） |
| t11 | —（落库回填） | 用例矩阵（一）：视图与依赖面 TC-2 / TC-3 / TC-4 | FR-1, FR-2 | TC-2/3/4 · 三个新用例文件 | — | D-2, D-4, D-8 | test | fullstack | t1, t2, t6, t8 | 8.40 DU | 三处层号逐卡相等；五处就绪含 `t-l`；四展示面同数 106、对照差 26 | 默认（按 phase） |
| t12 | —（落库回填） | 用例矩阵（二）：统计与审计面 TC-5 / TC-9 / TC-10 | FR-2, FR-5, FR-6 | TC-5/9/10 · 三个新用例文件 | — | D-1, D-4, D-7 | test | fullstack | t4, t6, t9, t10 | 8.35 DU | 两入口同分母；两种失败形态分列；界面 0 条与台账 26 条同时断言 | 默认（按 phase） |
| t13 | —（落库回填） | 逆验证矩阵（14 条改坏必红）与端到端证据清单 | FR-1, FR-2, FR-4, FR-5 | §逆验证清单 · `scripts/reverse-drill-matrix.mts` + 新用例 + 证据文档 | — | D-6, D-7 | test | fullstack | t9, t11, t12 | 8.05 DU | `--group canceled` 退出码 0 且逐条必红；条目数 `=== 14`；禁用 `git checkout` 还原 | 默认（按 phase） |

- 13 张卡，**无一张超容量**（容量 16 DU，最大 t6 = 13.25 DU），故计划行**不含** `⚠️超容量(建议N批)` 标记。
- 依赖只有前向引用（`depends_on` 只引更早的 key），无环、无悬空、无自依赖。
- 子卡段一律走默认模板（按 phase / 需求分类兜底）：本计划不显式指定 `stages` / `template`；t9/t11/t12/t13 按 `test` 的默认段展开。
- 「任务 id」列为空占位：任务卡尚未落库（`reqboard_decompose` 后由既有机制回填），本阶段不编造 id。

## §3 体量声明（footprint）

| key | 标题 | phase | side | depends_on | footprint（files/anchors/chars → DU） | requirement_refs |
|---|---|---|---|---|---|---|
| t1 | 定义活卡判据与依赖判定单点（9 个纯函数落既有 Predicates.ts） | implement | backend | — | 2 / 9 / 2900 → 7.95 | FR-1, FR-4 |
| t2 | 依赖判定四处收敛到单点，且 V-5 判据同批同源 | implement | backend | t1 | 5 / 8 / 3100 → 10.55 | FR-1, FR-4 |
| t3 | 加 `TaskRecord` 三加性可选字段与 `markCanceled`，接四个取消写入点 | implement | backend | t1, t2 | 6 / 9 / 3300 → 12.15 | FR-3, FR-6 |
| t4 | 两个 RTM 公开入口各自收敛为活卡（覆盖度分母剔卡） | implement | backend | t1 | 2 / 6 / 2500 → 6.25 | FR-2, FR-4 |
| t5 | API 边界收敛：`/state` 的 tasks / ready / 计数全部按活卡下发 | implement | backend | t1, t2 | 2 / 6 / 2900 → 6.45 | FR-1, FR-2, FR-5 |
| t6 | 服务端投影收敛：基类一次收敛 + DAG 层号现算 + 文档/报告/状态收编 | implement | backend | t1, t2 | 7 / 9 / 3500 → 13.25 | FR-1, FR-2, FR-5 |
| t7 | 服务端内部与用例面收编手写活卡 filter（只换判据来源） | implement | backend | t1 | 7 / 7 / 2700 → 11.85 | FR-2, FR-4, FR-5 |
| t8 | 客户端展示面：卡面计数兜底 + 分层剪边落进 `topoLevels` + 本地 `live` 收编 | ui | frontend | t3, t5, t6 | 5 / 11 / 3400 → 12.20 | FR-1, FR-2, FR-5 |
| t9 | 字面量基线清单与「新增即红」独立用例（不挂进 layer-boundary） | test | backend | t1, t2, t3, t4, t5, t6, t7, t8 | 2 / 8 / 3000 → 7.50 | FR-4 |
| t10 | 迁移与兼容：零迁移核对 + 旧分片读取 + 读侧宽容 + V-5 分档 | implement | backend | t1, t2, t3 | 4 / 8 / 3100 → 9.55 | FR-3, FR-5, FR-6 |
| t11 | 用例矩阵（一）：视图与依赖面 TC-2 / TC-3 / TC-4 | test | fullstack | t1, t2, t6, t8 | 3 / 8 / 2800 → 8.40 | FR-1, FR-2 |
| t12 | 用例矩阵（二）：统计与审计面 TC-5 / TC-9 / TC-10 | test | fullstack | t4, t6, t9, t10 | 3 / 8 / 2700 → 8.35 | FR-2, FR-5, FR-6 |
| t13 | 逆验证矩阵（14 条改坏必红）与端到端证据清单 | test | fullstack | t9, t11, t12 | 3 / 7 / 3100 → 8.05 | FR-1, FR-2, FR-4, FR-5 |
| **合计** | 13 张卡 · 最大单卡 t6 = 13.25 DU · **0 张超容量** | — | — | — | **总 122.50 DU** | 6/6 条款有主 |

## §4 逐卡 implementation 与 acceptance

### t1 定义活卡判据与依赖判定单点（9 个纯函数落既有 Predicates.ts）

**implementation**：落点：`src/domain/status/Predicates.ts`（**既有模块内**、紧邻 `isCanceled` 追加，**不新建模块**；domain 不许 import shared，故入参一律结构化 `{ status: string }`（模块头既有 `HasStatus`）+ 泛型保类型）。追加九个导出纯函数：① `isLiveTask<T extends HasStatus>(task: T): boolean`——复用既有 `isCanceled`（`!isCanceled(task)`），**本文件外全仓不得再写 status 与 canceled 的字面量比较**；② `liveTasksOf<T extends HasStatus>(tasks: readonly T[]): T[]`（返回新数组、顺序=输入顺序、不改入参、元素按引用返回）；③ `liveCountOf(tasks: readonly HasStatus[]): number`（= `liveTasksOf(tasks).length`，堵「过滤用一套、分母另抄一套」）；④ `isDependencySatisfied(dep: HasStatus | undefined): boolean`（`undefined`（悬空）| `done` | `canceled` = 满足；口径逐字等于 application 层 `readyTasksOf` 今天的判定，收编见 t2 ③）；⑤ `splitDependencyEdges<T extends HasStatus & { dependsOn?: readonly string[] }>(task, byId): { satisfied: string[]; pending: string[]; dangling: string[] }`（**唯一约束桶 = pending**；悬空单独成桶留给 V-3 报告，不静默算 satisfied；不改入参、顺序=dependsOn 原顺序）；⑥ `isReadyTask<T extends HasStatus & { id: string; dependsOn?: readonly string[] }>(task, byId): boolean`（自身 `todo` 且 `pending` 桶为空）；⑦ `layerInputOf<T extends HasStatus & { id: string; dependsOn?: readonly string[] }>(tasks): T[]`（活卡集合，且每条 `dependsOn` 只保留指向活卡的边 ⇒ 等价「删掉指向取消卡的边」）；⑧ `liveLayers<T ...>(tasks): ReadonlyMap<string, number>`（在 `layerInputOf` 的输入上算最长路径，只含活卡）；⑨ `liveReadyTasks<T ...>(tasks): string[]`（内部 `byId` 建在**活卡集合**上 ⇒ 指向取消卡的依赖表现为缺席=已满足；返回 id、顺序=输入顺序）。签名以 `design/interfaces.md` §3.2 为唯一一套（`liveReadyTasks` 返回 `string[]`、`layerInputOf` 返回 `T[]`），`design/architecture.md` / `design/frontend.md` 里的两个变体名与变体签名作废。新增 `tests/live-tasks-predicates.test.ts`：7 个 `TaskStatus` 逐一取值只 `canceled` 为假、`isDependencySatisfied` 四态、三桶分类、`isReadyTask` 真值表、`liveLayers` 与「删边重算」等值、`liveCountOf` 与 `liveTasksOf` 同源、入参不被修改。验证：`pnpm typecheck` + `npx vitest run tests/live-tasks-predicates.test.ts`。依据 design/interfaces.md §2/§3.2 与 architecture.md §接口变更。

**acceptance**：`pnpm typecheck` 退出码 0；`npx vitest run tests/live-tasks-predicates.test.ts` 全绿且含断言：遍历 `TASK_STATUS_ORDER` 时 `isLiveTask` 仅对 `'canceled'` 返回 false；`isDependencySatisfied` 对 `undefined`/`done`/`canceled` 返回 true、对 `todo`/`in_progress` 返回 false；`splitDependencyEdges` 把（悬空 / done / canceled / todo）四类依赖分别落 `dangling`/`satisfied`/`satisfied`/`pending`；`isReadyTask({status:'todo',dependsOn:['y']}, byId(y=canceled)) === true` 而同形 `{status:'in_progress'}` 为 false；`liveLayers` 对「x 的唯一前置 y 已取消」标本给出 `get('x') === 0`；`liveCountOf(t) === liveTasksOf(t).length`；调用后入参数组长度不变（不改入参）。逆验证：把 `isLiveTask` 临时改为 `return true` → 本用例必红。

### t2 依赖判定四处收敛到单点，且 V-5 判据同批同源（防写路径被自己拒掉）

**implementation**：① `src/domain/queue/topology.ts` 的 `computeReady`：删掉 `deps.every(dep => byId.get(dep)?.status === 'done')` 手写式，改走 `isReadyTask` / `isDependencySatisfied`（从 `../status/Predicates.js` import）；**悬空依赖策略保持「未满足」（保守不放行）**，即沿用本函数既有 byId 覆盖全量任务的语义，不得顺手放宽；同文件 `computeLayers` **判据一字不改**（落盘 `layers` 照旧按全量节点算，登记为历史派生值）。② `src/shared/protocol.ts` 的 `readyTasks(tasks, requirementId)`：删除 `doneIds` 手写式，收敛为 `liveReadyTasks` 的薄封装（仍是只让 `status === 'todo'` 的活卡进 ready、**输出顺序=输入顺序**，保住既有 R-3/D8 口径；`shared` 允许 import `domain`，层门禁核对过）。③ `src/application/use-cases/queue-access.ts` 的 `readyTasksOf`：行为逐字不变，改为复用 `isReadyTask`（语义单点），保留「悬空依赖按已满足（`undefined` → 满足）」这条既有口径。④ `src/domain/queue/validateQueue.ts` 的 **V-5 假就绪**判据：`unmet` 由 `byId.get(dep)?.status !== 'done'` 改为 `!isDependencySatisfied(byId.get(dep))`——**必须与 ① 同批**，否则落盘前的强校验会把新语义刚算出的 `ready[]` 判成「假就绪」→ 抛 `QUEUE_VALIDATION_FAILED`、一个字节都不落盘。本卡**不动 V-5 的级别**（此刻假就绪与漏就绪同为一个级别，分级由 t10 承接），也**不动 V-4**（V-4 对取消卡不豁免）。新增 `tests/live-tasks-ready-single-source.test.ts`：同一标本（`t-l`（todo）的唯一前置 `t-c` 已取消）跑三处判定断言逐字相等且都含 `t-l`，并对新语义载荷跑一次写盘校验。验证：`npx vitest run tests/live-tasks-ready-single-source.test.ts`。依据 design/architecture.md §缺陷 1 与 interfaces.md §3.1/§3.2。

**acceptance**：`npx vitest run tests/live-tasks-ready-single-source.test.ts tests/queue/topology.test.ts tests/queue/validateQueue.test.ts tests/queue-types-integration.test.ts` 全绿；断言：`readyTasksOf(t)`、`readyTasks(t,'REQ-…')`、`computeReady(queue.tasks)` 三个集合逐字相等且都含 `t-l`；新语义载荷 `validateQueueFile(...).passed === true` 且 `issues` 里无 `rule === 'V-5'` 的「假就绪」条目；`await repo.save(reqId, 新语义队列)` 不抛 `QUEUE_VALIDATION_FAILED`，落盘文件 `ready[]` 含 `t-l`；`computeLayers` 的输出与改动前逐字相同（落盘分层判据未动）。逆验证：删掉 `isDependencySatisfied` 的 `canceled` 分支且不恢复 → 上述三条必红。`pnpm typecheck` 退出码 0。

### t3 加 TaskRecord 三个加性可选字段与 markCanceled 写入口，并接四个取消写入点

**implementation**：① 改 `src/shared/protocol.ts`：`TaskRecord` 增三个**加性可选**字段 `canceledAt?: number`、`canceledBy?: { kind: 'human'; sessionId?: string }`、`cancelReason?: string`（注释写明：语义=**最近一次取消**（覆盖式）、缺省=**未采集**、不 bump `REQBOARD_SCHEMA_VERSION`（9）与 `QUEUE_VERSION`（1）、**不加进** `REQUIRED_TASK_FIELDS`）；在既有 `recordStatus` 旁新增**唯一写入口** `markCanceled(task: TaskRecord, opts: { at: number; by: ActorRef; reason?: string }): void`——就地写：`task.canceledAt = opts.at`；仅当 `opts.by.kind === 'human'` 才写 `task.canceledBy = { kind: 'human', ...(sessionId !== undefined ? { sessionId } : {}) }`（真非人工路径**整字段不写** + `console.warn`，不写 `kind:'system'` 之类替身值）；`opts.reason` 的 `trim()` 非空才写 `cancelReason`（不设硬上限）；**不做 IO、不返回新对象、不落盘**。② `src/application/internal/task-transition.ts` 的 `transitionTask`：`to === 'canceled'` 时在 `task.status = to` 同一处调 `markCanceled(task, { at: opts.at, by: opts.actor, reason: opts.reason })`（同对象、同一次写事务；`assertTaskTransition` 失败路径不改任何字段）。③ 三个批量直写点同款接线（都在 `copy.status = 'canceled'` 的相邻行）：`src/application/internal/rollback-tasks.ts` 的 `planRollbackTasks`、`src/application/internal/stale-rework.ts` 的 `cancelStaleReworkCards`、`src/application/internal/rollback-cleanup.ts` 的 `planRollbackCleanup`——`at` 取该批动作的 `now`（同批同一值）、`by` 取**触发该批动作的人**、`reason` 取**该批动作的原因**（如「回退重拆」，不是逐卡理由）。**复活（`canceled → todo`）不清空三字段**（本卡不加任何清空逻辑）；`HUMAN_ONLY_TASK_TRANSITIONS` 与 `assertTaskTransition` 一字不改。④ 新增 `tests/canceled-task-trail.test.ts`：写侧四条形态（人工取消 / 非人工不写 / 空白 reason 不写 / 复活不清空）+ 与 `statusHistory` 同源同刻 + 批量取消整批有值。验证：`npx vitest run tests/canceled-task-trail.test.ts`。依据 design/data-model.md §1/§7 与 backend.md §取消留痕写侧。

**acceptance**：`npx vitest run tests/canceled-task-trail.test.ts tests/task-transition-guard.test.ts tests/rollback-tasks.test.ts tests/rollback-cleanup.test.ts` 全绿；断言：人取消一张卡后 `canceledAt` 为有限数字且 `=== statusHistory` 最近一条 `→canceled` 事件的 `at`、`canceledBy.kind === 'human'`、无会话时 `'sessionId' in canceledBy === false`、`cancelReason` 等于传入原文；真非人工路径取消后 `'canceledBy' in task === false`（且不出现 `kind === 'agent'`）；`reason === '   '` 时不写 `cancelReason`；超长原文逐字写入不被截断；复活后再取消时三字段等于**最新一次**取值；回退一次需求产生的每张取消卡 `canceledAt`/`cancelReason` 都有值；`pnpm typecheck` 退出码 0。

### t4 两个 RTM 公开入口各自收敛为活卡（覆盖度分母剔卡）

**implementation**：改 `src/application/internal/rtm-yaml.ts`：`syncRTMYaml` 与 `syncRTMYamlWithSnapshot` **两个公开入口各自函数体顶部第一行**加 `const live = liveTasksOf(tasks)`，其后函数体内**只允许使用 `live`**、不得再引用入参 `tasks`（纯函数、幂等）；函数签名与返回体不变、不新增参数、**不改 18 + 3 个调用点**（看板三条路由直调 `syncRTMYamlWithSnapshot`，绕过前者 ⇒ 两个入口都要接，缺一条就漏三条路径）；`coverageGateOf` **一字不改**（`total <= 0 → undefined` 的不执法边界保留）；`ledgerReaderOf(snapshot, live)` 下游不变。新增 `tests/rtm-yaml-live-tasks.test.ts`：同一标本（132 = 106 + 26）分别走两个入口，断言 `coverage.total === 106`、`covered === 106`、`rate === 100`、`uncovered.length === 0`、`passed === true` 且两入口读数**逐字段相等**；对照改前口径断言 `total === 132`、`rate === 80`（压线通过但 `uncovered.length === 26`，门禁仍点名 26 张）；全取消标本（`total === 0`）断言门**不执法**（`coverageGateOf` 返回 `undefined`）；源码级断言用函数名切区间，两个入口函数体内都含 `liveTasksOf(`。验证：`npx vitest run tests/rtm-yaml-live-tasks.test.ts`。依据 design/interfaces.md §5 与 backend.md §两个 RTM 公开入口。

**acceptance**：`npx vitest run tests/rtm-yaml-live-tasks.test.ts` 全绿；断言：两个入口对同一标本给出的 `coverage` 逐字段相等且 `total === 106`、`rate === 100`、`passed === true`、`uncovered.length === 0`；对照标本（不做活卡过滤）`total === 132`、`rate === 80`、`uncovered.length === 26`；全取消标本 `coverageGateOf('accepting', probe) === undefined`（不执法，不是 0 分也不是通过）；按函数名切区间扫描 `src/application/internal/rtm-yaml.ts`，`syncRTMYaml` 与 `syncRTMYamlWithSnapshot` 两个函数体内 `liveTasksOf(` 命中数各 ≥ 1。逆验证：只给 `syncRTMYaml` 接线而撤掉 `syncRTMYamlWithSnapshot` 的 → 本用例必红。`pnpm typecheck` 退出码 0。

### t5 API 边界收敛：/state 的 tasks / ready / 计数全部按活卡下发

**implementation**：改 `src/http/routers/stages.ts`（**出口清单逐条接线，客户端不再各写过滤**）：① `handleState`：`const live = liveTasksOf(await taskStore.listAll())`，`tasks: live.map(t => ({ ...t }))`（不再下发取消卡）；`ready` 改由 `isReadyTask` / `liveReadyTasks` 派生（**现算、不读落盘 `ready[]`**，保留既有「输出顺序=任务数组顺序」的 R-3/D8 口径与既有注释）；② 同文件需求摘要计数（`tasksTotal` / `percentage` 处）：`tasksTotal = liveCountOf(tasks)`、`percentage` 用同一活卡分母（`done`/`active` 走既有 helper，不新造计量粒度）；③ 同文件会话流程面板：`progress.total` / `byStatus` / `tasks` 全部按活卡算，`byStatus.canceled` 恒 0 且**不新增**「另有 N 张」字段或文案（D-7）；④ 同文件节点详情/总览装配处：传入活卡集合。改 `tests/state-payload-client.test.ts`：补含取消卡标本的断言（出参 tasks / ready / tasksTotal / percentage 四处）。验证命令见 acceptance。依据 design/interfaces.md §4.1 落点 3 与 backend.md §出口清单。

**acceptance**：`npx vitest run tests/state-payload-client.test.ts tests/read-sites-equivalence.test.ts` 全绿；断言：`GET /state` 出参 `tasks` 里 `status === 'canceled'` 条数 `=== 0` 且活卡数 `=== liveCountOf(台账)`；`ready[reqId]` ⊆ 活卡且包含「唯一前置已取消」的 `todo` 卡；需求摘要 `tasksTotal === 活卡数` 且 `percentage === Math.round(done/活卡数*100)`；把队列文件的 `ready[]` 手工改成陈旧值后 `/state` 的 `ready` 仍给出正确现算集合（不读落盘值）；无取消卡夹具下 `/state` 响应体逐字节不变（`tests/read-sites-equivalence.test.ts` 零回归）。逆验证：`handleState` 去掉 `tasks` 收敛只留 `ready`（或反过来）→ 本用例必红。`pnpm typecheck` 退出码 0。

### t6 服务端投影收敛：阶段详情基类一次收敛 + DAG 层号现算 + 文档/报告/状态面收编

**implementation**：① `src/application/query/QueryStageDetail.ts`：在基类 `StageDetailAssembler.assemble()` 里、调 `this.buildBody(...)` **之前**，把传给 body 的 `ledger.tasks` 换成 `liveTasksOf(...)`——**一次收敛覆盖 8 个 body**（拆分/实施两处因此同时正确），**不逐 body 各写一遍**（本次病根正是「某处漏了」，逐 body 补等于把病根留在原地）；`toStageTaskRef` / `toStageTaskExecution` 出参的 `dependsOn` 写**剪边后**的边（`splitDependencyEdges` 的 `satisfied ∪ pending`），否则下层会重新拿到指向取消卡的边、长出幽灵层。② `src/application/query/QueryDag.ts`：`queryDag` 里 `const live = liveTasksOf(tasks)`，`buildDagNodes` / `buildDagSteps` / `buildCriticalPath` 三处同源喂 `live`；节点 `layer` 改由 `liveLayers(live)` **现算**，不再转发落盘 `layer`（落盘值登记为历史派生值，INV-5 ③）；`buildCriticalPath` 里 `const alive = tasks.filter(...)` 的手写式**删掉**（复用单点，其「显式剪边」语义保留）。③ `src/application/query/QueryDocs.ts`：实施门处的手写 filter 收编为 `liveTasksOf`；文档面板按 A3——`req.artifacts` 先剔掉「路径以 `/tasks/<task_id>.md` 结尾且该 `task_id` 属已取消卡」的产物，`documents` 与 `discovered` **两侧同源同改**（**不补偿性**塞进 `discovered`），文件头恒等式改写为活卡口径（`documents` 台账来源行数 + Σ `discovered[].count` == `artifacts.length − 取消卡名下产物条数`）。④ `src/application/query/QueryReport.ts` 的 `progressOf` 与 `src/application/query/QueryState.ts` 的两处手写 filter 收编为 `liveTasksOf` + `liveCountOf`（数值不变，只换判据来源）。改 `tests/stage-detail.test.ts`，新增 `tests/canceled-projection-single-source.test.ts`（含 DAG 层号与文档面板恒等式两条）。验证：`npx vitest run tests/stage-detail.test.ts tests/canceled-projection-single-source.test.ts`。依据 design/architecture.md §消费点清单 ②/③ 与 interfaces.md §4.1。

**acceptance**：`npx vitest run tests/stage-detail.test.ts tests/canceled-projection-single-source.test.ts` 全绿；断言：对 132 = 106 + 26 标本 `assembleStageDetail(...).body.tasks.length === 106` 且其中取消卡条数 `=== 0`（拆分、实施两个 body 各断言一次，并另断言基类出口对任一 stage 都不含取消卡）；`queryDag` 节点数组长度 `=== 106` 且每张活卡 `layer === liveLayers(台账).get(id)`（与「删掉指向取消卡的边后重算」相等，`t-l` 层号 `=== 0` 不是 1）；`QueryDocs` 恒等式 `documents 台账来源行数 + Σ discovered[].count === artifacts.length − 取消卡名下产物条数` 成立，且取消卡名下 `task_detail` 产物在 `documents` 与 `discovered` 两侧都 `=== 0`；`progressOf` 与状态投影两处读数里取消卡条数 `=== 0`。逆验证：把基类 `assemble()` 的 `liveTasksOf` 改回手写 filter → 本用例必红；`buildDagNodes` 退回全量 → 层号与卡数断言必红。`pnpm typecheck` 退出码 0。

### t7 服务端内部与用例面收编手写活卡 filter（只换判据来源，不改行为）

**implementation**：把下面每一处**手写活卡 filter** 替换为单点调用（**只换判据来源，不改行为、不改计量粒度**）：`src/application/internal/sheet-tasks.ts`（验收单投影）、`src/application/internal/content-trace.ts`（追溯投影）、`src/application/internal/verification-doc-writer.ts`（验收文档渲染）、`src/application/internal/backfill-task-refs.ts`（回填引用）、`src/application/use-cases/SubmitVerification.ts`（四处：探针、跳过守卫、ledger 取数、落盘取数——落盘那处正是「文件写 106」的由来，探针与落盘必须同分母）、`src/domain/workflow/RollupSpec.ts` 的 `activeTasksOf`（domain→domain import 合法）。**不收编**语义不同的守卫/写侧点（`advance-select.ts` / `Decompose.ts` / `AdvanceChain.ts` / `rollback-tasks.ts` 等）：它们属基线，且「已取消就跳过」的 `continue` 守卫要保持行为逐字不变。新增 `tests/canceled-internal-collect.test.ts`：对同一标本断言各收编点输出都不含取消卡，且 `SubmitVerification` 的探针与落盘**同分母**（106）。验证命令见 acceptance。依据 design/backend.md §断言域文件清单与 §出口清单。

**acceptance**：`npx vitest run tests/canceled-internal-collect.test.ts tests/sheet-projection.test.ts tests/rollup.test.ts tests/marks-surfaces.test.ts tests/reqboard/backfill-task-refs.test.ts` 全绿；断言：验收单投影、追溯投影、验收文档渲染、回填引用四处输出里 `status === 'canceled'` 条数 `=== 0`；`SubmitVerification` 的探针读数与落盘读数分母**逐字相等**（都 `=== 106`，不再出现探针 132 / 落盘 106）；`activeTasksOf`、验收文档、追溯三处在活卡 0 张标本上空集不抛错。逆验证：把落盘那一处的复用改回手写 filter（且顺手只改这一处）→ 同分母断言必红。`pnpm typecheck` 退出码 0。

### t8 客户端展示面：卡面计数兜底 + 分层剪边落进 topoLevels + 本地 live 收编

**implementation**：① `src/client/views/board.ts` 的 `toCard`：`totalCount` / `doneCount` 改走 `liveTasksOf` / `liveCountOf`（**独立漏点**：只要该函数拿到未过滤数组，读数就会退回 132 ⇒ **不假设「上游 /state 好了这里就自动好」**）；同文件「在途」计数里手写的 `t.status !== 'canceled'` 换成 `isLiveTask(t)`（去掉任务级字面量）。② `src/client/stage-panel.ts` 的 `topoLevels`：**剪边必须落进函数内部**——对不在 `byId` 里的前置边**直接丢弃**，不再当 `lv = 0` 计入 `1 + max(...)`（现实现会造幽灵前置、让活卡凭空多一层）；实现走 `layerInputOf` / `splitDependencyEdges`，层号按活卡压实、不留「第 N 层 · 0 张」空层。③ `src/client/node-panel.ts` 同款 `topoLevels` 照同一口径剪边（会话框节点面板与看板阶段详情两块必须一致），但**不加第二份 filter**（上游基类已剔卡）。④ `src/client/render/subtask-view.ts` 的本地 `live` 辅助删掉，改调 `liveTasksOf`。⑤ **不改** `timeline.ts` / `board-mount.ts` / `panels/dag.ts` 的算法（吃已过滤载荷）；`data-dag-statuses` 因此天然不含 `canceled` 档，**不许**在这里补第二份判定。新增 `tests/canceled-hidden-view.test.ts`（TC-1 + TC-11 + 原型对照判据）。验证：`npx vitest run tests/canceled-hidden-view.test.ts` + `pnpm verify:client`。依据 design/frontend.md §四个取数边界 ①/② 与 §严格不可见。

**acceptance**：`npx vitest run tests/canceled-hidden-view.test.ts tests/card-layer.test.ts tests/dag-panel.test.ts tests/client-subtask-view.test.ts` 全绿；断言：对 132 = 106 + 26 标本渲染后 `canceledRowsShown === 0`（chip / bar / trace / node 四类选择器的 `[data-status="canceled"]` 命中数均为 0）且 `liveCardCount === 106`、`dagRowsShown === 106`（`.dsh-pm-sn-dag-task` 条数 `=== 106`）；把**未过滤**数组直接喂 `toCard` 时 `totalCount === liveCountOf(tasks) === 106`（不靠上游）；`topoLevels` 对「活卡 x 唯一前置 y 已取消」给出 `get(0)` 含 x 且 x 层号 `=== 0`（**不是 1**）——删掉剪边即必红；`data-dag-statuses` 取值里不含 `canceled`；可见文本与 `title` / `aria-label` / `data-*` 里 `已取消` / `canceled` 命中 `=== 0`；源码 `includeCanceled` / `showCanceled` 命中 `=== 0`；**原型对照（可失败）**：权威原型 `prototypes/dag-canceled-hidden.html#FR-1` 声明的观测量 `canceledRowsShown = 0`、`liveCardCount = 106` 与 `#FR-5` 的 `canceledLedgerRows = 26`，必须与本用例从渲染文本数与台账数出的同名观测量逐字相等（界面 0 条 **且** 台账 26 条一起断言）；`#FR-2` 的 `ganttBarsShown = 106`、`traceRowsShown = 106` 与甘特/追溯渲染条数相等。`pnpm verify:client` 与 `pnpm typecheck` 退出码 0。

### t9 字面量基线清单与「新增即红」独立用例（不挂进 layer-boundary）

**implementation**：① 新增基线清单 `tests/fixtures/canceled-literal-baseline.json`：形状 `{ "collected": [{file, line}], "baseline": [{file, line, reason}] }`，采集口径 = 全仓（**排除 `tests/`**）命中 `/status\s*(?:!==|===)\s*['\"]canceled['\"]/` 的行；`baseline` = **实施后**实测命中集合**减去**收编点出现过的行（收编点原行原文存进 `collected` ⇒ 「把收编点改回手写」必然落进「新增」分支）；每条 `baseline` 必须带 `reason`，取值 ∈ {req-status, write-side-guard, status-label, definition-site}（缺理由即用例红；需求级 `req.status` 比较属 req-status，不得顺手替换）。② 新增**独立**用例 `tests/live-tasks-single-source.test.ts`（**不挂进既有 `layer-boundary` 用例**——它当前本就红，挂进去等于把新网埋在已知失败里）：a) 全仓命中集合 ⊆ `baseline`（新增即红）；b) 对**收编点清单**逐个断言「该符号体内零手写比较 + 含单点调用」——清单 = 清单文件里的 `collected` 去重后的 (file, symbol)，符号名取自 `design/interfaces.md` §4.1/§8 与 `design/backend.md` §断言域文件清单；c) 范围自检（防假绿）：清单每个文件必须读到内容、且该文件 `status` 字样命中数 > 0（路径写错即红）；d) 两个 RTM 入口函数体都含 `liveTasksOf(`、V-5 体内含 `isDependencySatisfied(`；e) `liveCountOf(t) === liveTasksOf(t).length`。验证：`npx vitest run tests/live-tasks-single-source.test.ts`。依据 design/interfaces.md §8 与 architecture.md §防漂移设计。

**acceptance**：`npx vitest run tests/live-tasks-single-source.test.ts` 全绿；断言：全仓命中集合里**基线之外的新增条目 `=== 0`**（不要求全仓零手写）；`collected` 里每个 (file, symbol) 体零手写比较且含单点调用；每个清单文件被读到且 `status` 命中数 > 0（范围自检）；两个 RTM 入口函数体都含 `liveTasksOf(`。逆验证三条各必红：① 在 `src/application/query/QueryStageDetail.ts` 的 `assemble()` 里插一行 `t.status !== 'canceled'`；② 在 `src/shared/protocol.ts` 的 `readyTasks` 里插一行 `doneIds.has(dep)`；③ 从清单文件删掉一条 `baseline` 条目。`npx vitest run tests/layer-boundary.test.ts` **不作本卡门禁**（其基线本就红，如实记录）。`pnpm typecheck` 退出码 0。

### t10 迁移与兼容：零迁移核对 + 旧分片读取 + 读侧宽容 + V-5 分档

**implementation**：① `src/domain/queue/QueueTypes.ts`：`ValidationIssue` 增**加性可选** `level?: 'issue' | 'warning'`（**缺省 = issue**，旧形状与旧读方逐字兼容）；`ValidationResult.passed` 的语义改为「无 issue 级条目」，并让 `hasIssue` 只认 issue 级（warning 不算不通过）——这是设计「漏就绪降为 warning」的落地前提。② `src/domain/queue/validateQueue.ts` 的 V-5 **分档**：**漏就绪**（调 `computeReady` 的那半）标记为 `level: 'warning'`（可自愈的陈旧派生值），**假就绪**（ready 里的卡依赖未了结 / 自身非 todo）**仍是 issue**（真写坏）；`rule` 标识仍是 `'V-5'`（**不新增 V-x**）；V-4 不动、对取消卡不豁免。③ `src/repositories/QueueRepository.ts` 的 `load`：校验失败**不再** `return undefined`——降级为 `onWarn` 一条 warning + **继续返回队列**（JSON 解析失败的既有隔离路径不动）；返回对象的派生字段按当前判据**内存重算**（`ready` 用 `liveReadyTasks`、活卡 `layer`/`layers` 用 `liveLayers`/`layerInputOf`），**重算结果只用于本次返回对象与校验输入，一个字节都不写盘**；`save` 保持强校验 fail-closed（假就绪照旧抛 `QUEUE_VALIDATION_FAILED`）。④ 零迁移核对：**不新建任何 `migrate-*` 脚本、不回填三字段、不改写历史分片与 RTM 快照**；`REQBOARD_SCHEMA_VERSION`（9）与 `QUEUE_VERSION`（1）一字不动。新增 `tests/canceled-legacy-read.test.ts`（旧分片读取 + 零写回 + 读宽容 + 两档上报）。验证命令见 acceptance。依据 design/migration.md §兼容期行为与 §风险 ④。

**acceptance**：`npx vitest run tests/canceled-legacy-read.test.ts tests/queue/QueueTaskStore.test.ts tests/t12-queue-readonly-ordering.test.ts` 全绿；断言：旧分片标本（`todo` 卡依赖已取消卡 + 落盘 `ready[]` 为旧口径 + 三字段全缺）`load` 返回**非 undefined**、`listByRequirement` 返回真实卡数（**不是 `[]`、不是 0 张**）、读取路径给出 ≥ 1 条 warning；同一标本 `save` **不抛** `QUEUE_VALIDATION_FAILED`；「漏就绪」标本 `validateQueueFile(...).passed === true` 且该条 `level === 'warning'`，「假就绪」标本 `passed === false` 且 `level` 缺省为 issue、`save` 抛错；读取路径返回的 `ready` 含该 `todo` 卡且来自内存重算（不读落盘 `ready[]`）；旧分片读取前后全量需求目录 `mtimeMs` 与 sha256 **逐份不变**（零写回）；`git status --porcelain docs/requirements | wc -l === 0`；仓库不新增 `migrate-*` 脚本文件。`pnpm typecheck` 退出码 0。

### t11 用例矩阵（一）：视图与依赖面 TC-2 / TC-3 / TC-4

**implementation**：新增三个用例文件（标本 S-1 = 132 张 = 106 活卡 + 26 已取消，其中活卡 `t-l`（`todo`）的唯一前置 `t-c` 已取消；S-2 = 同标本但不过滤，只用于证明差值）：① `tests/canceled-layer-parity.test.ts`（TC-2）——三处层号同台比对：服务端 `liveLayers`、把指向取消卡的边删掉后**手工重算**、以及客户端真正算层的 `topoLevels`；逐卡相等，`t-l` 层号 `=== 0`（不是 1），层号按活卡压实无「第 N 层 · 0 张」空层，`t-l` 仍在活卡集合里（不成孤岛）。② `tests/canceled-ready-unlock.test.ts`（TC-3）——`readyTasks`（shared）/ `computeReady`（写路径）/ `readyTasksOf`（application）/ `isReadyTask`（单点）/ `/state` 的 `ready[reqId]` 五处都含 `t-l` 且前四个集合两两相等，容器内 `[data-status="canceled"]` 条数 `=== 0`（证明「真的能开工」，不是复述「不掉层」）。③ `tests/canceled-four-faces.test.ts`（TC-4）——四个展示面同数：DAG 层级行数、`toCard` 的 `doneCount`/`totalCount`、`.dsh-pm-gantt-bar` 条数、`.dsh-pm-trace-node[data-type="task"]` 条数，四数全等于 `liveCountOf(S-1)`；对照 S-2 同一组读数差 `=== 26`。追溯那一面**只对「上线后新触发过 RTM」的标本断言数值**，存量标本只断言「不出现取消卡行」。验证：`npx vitest run tests/canceled-layer-parity.test.ts tests/canceled-ready-unlock.test.ts tests/canceled-four-faces.test.ts`。依据 design/test-cases.md TC-2/TC-3/TC-4 与 §边界与假红防线。

**acceptance**：`npx vitest run tests/canceled-layer-parity.test.ts tests/canceled-ready-unlock.test.ts tests/canceled-four-faces.test.ts` 全绿；断言：三处层号逐卡相等且 `t-l` 层号 `=== 0`；四处就绪输出都含 `t-l` 且两两相等、`/state` 的 `ready[reqId]` 含 `t-l`；四展示面读数全部 `=== 106` 且 `=== liveCountOf(S-1)`、`doneCount === 100`、比率 `=== 0.94`；对照 S-2 四数 `=== 132`、比率 `=== 0.76`、与 S-1 的差值 `=== 26`（`=== 台账取消卡数`）。三条判据各自可失败：逆验证分别去掉 `topoLevels` 剪边 / 把任一就绪判据改回 `=== 'done'` / 只改 `/state` 而把 `toCard` 留旧口径 → 对应文件必红。`pnpm typecheck` 退出码 0。

### t12 用例矩阵（二）：统计与审计面 TC-5 / TC-9 / TC-10（覆盖度两入口、台账不消失、文档面板）

**implementation**：新增三个用例文件（标本一律走**临时工作区**，不写生产需求目录）：① `tests/canceled-coverage-gate.test.ts`（TC-5）——两个 RTM 入口同得分母 106、`rate === 100`、`passed === true` 且逐字段相等；对照 A（标注齐全的改前口径）`total === 132`、`rate === 80` 压线通过但 `uncovered.length === 26`（门禁仍点名 26 张）；对照 B（`covers` 标注为 0，上一条需求真实发生的那次失败）`rate === 0` → `passed === false` + `REQBOARD_TESTING_COVERAGE_GATE`；对照 C 再取消 5 张 → `rate < 80` 被拒；活卡 0 张标本 → 门**不执法**（`undefined`）。② `tests/canceled-audit-holds.test.ts`（TC-9）——全部界面投影里取消卡条数 `=== 0`，**同时**台账 `status === 'canceled'` 记录数 `=== 26` 不变、磁盘卡文档 26 份内容哈希不变、归档材料可引用 `canceled_count: 26`（界面 0 条与台账 26 条必须一起断言，只断言前者时把台账删掉也能过）。③ `tests/canceled-docs-panel.test.ts`（TC-10）——`documents` 与 `discovered` 两侧都不含取消卡的 `task_detail` 产物（不补偿性塞进 `discovered`）、恒等式按活卡口径成立、`data-doc-row` 条数 `=== documents.length`、磁盘 26 份卡文档仍在。验证：`npx vitest run tests/canceled-coverage-gate.test.ts tests/canceled-audit-holds.test.ts tests/canceled-docs-panel.test.ts`。依据 design/test-cases.md TC-5/TC-9/TC-10 与 backend.md §覆盖度分母口径（两段历史别混成一条）。

**acceptance**：`npx vitest run tests/canceled-coverage-gate.test.ts tests/canceled-audit-holds.test.ts tests/canceled-docs-panel.test.ts` 全绿；断言：两个入口读数逐字段相等且 `total === 106`、`rate === 100`；对照 A `rate === 80` 且 `uncovered.length === 26`、对照 B `rate === 0` 且 `passed === false`（两种失败形态**分列**、不混成一条）、对照 C `rate < 80` 被拒、活卡 0 张 `coverageGateOf(...) === undefined`；界面投影取消卡条数 `=== 0` 与台账 26 条**同时**成立；`documents.length + Σ discovered[].count === artifacts.length − 取消卡名下产物条数` 且 `data-doc-row` 条数 `=== documents.length`；跑完 `git status --porcelain docs/requirements` 为空（用例未写生产目录）。`pnpm typecheck` 退出码 0。

### t13 逆验证矩阵（14 条改坏必红）与端到端证据清单

**implementation**：① 扩 `scripts/reverse-drill-matrix.mts` 加 `canceled` 组，按 `design/architecture.md` §逆验证清单逐条落地 14 条「真改坏 → 真跑判据 → 必红 → 逐字节还原 + sha256 复核」：基类 `assemble()` 收敛改回手写 filter、`QueryStageDetail` 两个 body 各自手写、`buildDagNodes` 退回全量、`handleState` 去掉 `tasks`/`ready` 收敛、`readyTasks` 退回只认 `done`、`computeReady` 退回只认 `done`、V-5 退回只认 `done`、V-5「漏就绪」从 warning 退回 issue、读取路径校验失败退回 `return undefined`、`topoLevels` 去掉剪边、`board-mount` 去掉过滤、`isLiveTask` 改成看三字段而非 `status`、界面重新引入 `canceled` 档位、读取落盘 `ready[]`。沿用既有 `copy`/`file` 两种改坏方式与**并发写入检测**：备份 + sha256 恢复，**禁用 `git checkout --` 还原**（2026-10-04 事故教训）；加范围自检（target 文件不存在即退出 1，防假绿）。② 新增 `tests/canceled-reverse-drill-coverage.test.ts`：断言 `canceled` 组条目数 `=== 14`、每条都有 target 文件与判据命令、脚本内 `git checkout` 命中 `=== 0`。③ 落 `docs/requirements/REQ-261005193546-1b1a/notes/e2e-evidence.md`：命令 + 原始输出摘要 + 判据文件路径，供验收材料直接引用；并写明两条限定语——追溯读数按活卡**只对新触发过 RTM 的需求**成立（存量快照接受陈旧、不回填）；落盘 `layer` 与 `liveLayers` 允许不一致（**刻意差异**，落盘值仅历史派生值）。验证：`npx tsx scripts/reverse-drill-matrix.mts --group canceled`。依据 design/architecture.md §逆验证清单与 migration.md §上线顺序 步骤 3。

**acceptance**：`npx tsx scripts/reverse-drill-matrix.mts --group canceled` 退出码 0 且逐条打印「改坏点 → 判据 → 红 → 已还原（sha256 一致）」；人为把 `canceled` 组任一条的 target 改成不存在的路径 → 脚本退出码 1（范围自检）；`npx tsx scripts/reverse-drill-matrix.mts --group canceled --json` 输出可 `JSON.parse` 且含 14 条；`npx vitest run tests/canceled-reverse-drill-coverage.test.ts` 全绿且断言条目数 `=== 14`；`grep -c 'git checkout' scripts/reverse-drill-matrix.mts` 命中 `=== 0`；`docs/requirements/REQ-261005193546-1b1a/notes/e2e-evidence.md` 存在且含限定语关键词「新触发过 RTM」与「刻意差异」；首轮跑完后工作区 `git status --porcelain src/` 为空（逐字节还原）。`pnpm typecheck` 退出码 0。

## §5 判定口径

- **容量口径（单一源）**：`detailUnits = files×1 + anchors×0.5 + chars/2000`，权重与容量取自 `src/domain/limits.ts`（`detailWeightPerFile=1`、`detailWeightPerAnchor=0.5`、`detailCharsPerUnit=2000`、`roundDetailUnits=16`）——**本计划不另抄一套**；判定函数 `judgeFootprint` 用**未取整原值**比较，`detailUnitsOf` 只做展示取整。**每张卡 ≤ 16 DU**。
- **声明下限**：`files` 不得小于 `implementation` 里点到的**去重路径数**（`declaredFilesFloorFrom` / `assertFootprintFloor`；路径前缀只认 `src|tests|docs|scripts`；`design/**`、`prototypes/**`、散文里的符号名不计入）。允许留余量，**不允许缩水**（缩水是唯一能骗过容量门禁的方向）。执行者若在实施中新增/移除落点，须同步改 `files`。
- **超容量**：本计划 **0 张超容量**，故计划行不出现 `⚠️超容量(建议N批)`；`suggestedBatchesOf = max(2, ceil(DU/16))` 仅在超容量时使用。
- **依赖口径**：`depends_on` 只允许引用**本计划内更早**的 key（禁前向引用、禁自依赖、禁悬空）；13 卡构成 DAG，无环。t2 依赖 t1（判据先于接线）；t3 依赖 t1/t2（`shared/protocol.ts` 与 t2 同文件，串行避免同文件并发改）；t6/t7 依赖 t1/t2；t8 依赖 t3/t5/t6；t9 全收编面完成后采集基线；t10 依赖 t1/t2/t3（V-5 判据同源之后才分档）。
- **契约先行**：t1（判据单点）→ t2（依赖判定收敛 + V-5 同源）→ t4（RTM 两入口）/ t3（数据与写侧）→ t5/t6/t7（边界与投影接线）→ t8（客户端）→ t9（防漂移网）→ t10（兼容）→ t11/t12（用例矩阵）→ t13（逆向演练）。**卡不跨层**：domain 契约（t1）· domain/queue + shared 判定（t2）· shared/application 写侧（t3）· application 入口（t4）· http 边界（t5）· application 投影（t6/t7）· client（t8）· 测试与脚本（t9/t11/t12/t13）。
- **验收可跑**：每卡 `acceptance` 都给出命令（`pnpm typecheck` / `npx vitest run <文件>` / `npx tsx scripts/<脚本>`）与期望结果（断言名、退出码、必含字符串），无「相关模块通过」类空话；关键判据一律配「人为改坏 → 必红」的逆验证。
- **覆盖完整性**：FR-1~FR-6 每条至少被一张卡的 `requirement_refs` 接收（见 §1），无「本轮不做」；D-1~D-8 每条至少被一张卡的 `decisionRefs` 接收；反向核对见 §1 末两行。
- **零会话历史可开工**：每卡 `implementation` 写清改哪些文件/函数、步骤、验证方式；不只依赖本计划外的口头上下文。
- **本阶段不二次创作设计**：与设计矛盾或设计未点名之处不在卡内私改，统一进 §6。

**自测证据（用仓库真实函数逐卡计算，已跑并留档）**：临时探针 `scripts/tmp-plan-footprint-probe.mts`（**跑完已删除**）import `detailUnitsOf` / `judgeFootprint` / `suggestedBatchesOf` / `declaredFilesFloorFrom` / `assertFootprintFloor`（`src/domain/task/Footprint.ts`）、`checkAcceptance`（`src/domain/task/Acceptability.ts`）、`normalizePlanTasks`（`src/shared/protocol.ts`）与 `LIMITS`（`src/domain/limits.ts`），逐卡输出 DU 表并断言：每卡 ≤ 16 DU、`files ≥ 去重路径数`、`acceptance` 过可证伪校验、FR-1~FR-6 全覆盖、`depends_on` 无前向引用，最后把整份任务表喂**仓库真实归一函数 `normalizePlanTasks`**（即 `reqboard_submit(kind=plan)` 的落库入口）。结果：**13 卡全部 OK，最大单卡 13.25 DU（t6），总 DU 122.50，`normalizePlanTasks` 通过 13/13 张卡，`ALL CHECKS PASS`**（首轮 t1/t5/t7/t9/t10 触发 `REQBOARD_BAD_FOOTPRINT` —— `files` 小于 implementation 里点到的路径数，已按实测口径修正后全绿）。

## §6 需退回设计 / 需人拍板

1. **`markCanceled` 的落点冲突**：`design/interfaces.md` §6.2 写落 `application/internal/task-transition.ts`（与 `transitionTask` 同址），而 `design/backend.md` §判据与写侧的命名契约 + `design/migration.md` §出处纪律写落 `src/shared/protocol.ts`（既有 `recordStatus` 旁，且明确「代码落点一律以后端篇为唯一出处」）。本计划按 **backend.md** 落 `shared/protocol.ts`（t3）；请设计复核，避免两处各写一份。
2. **落盘 `layer` / `layers` 的口径冲突**：`design/interfaces.md` §3.3 说写路径分层输入改 `layerInputOf(file.tasks)`（`layers[]` 只含活卡），而 `design/architecture.md`（INV-5 边界 + 「B 方案」采纳行）/`design/backend.md`/`design/migration.md` 三处都说 `computeLayers` 判据**不改**、落盘照旧按全量算（守零写回，登记为刻意差异）。本计划按**后三份**：`normalizeQueueFile` 与落盘 `layer` **不改**，`QueryDag` 节点层号改由 `liveLayers` **现算**（t6）。若设计坚持前者，会产生「读一次写回一次存量队列文件」的形态，与 FR-6 零写回直接冲突。
3. **`liveReadyTasks` / `layerInputOf` 的签名冲突**：`design/interfaces.md` §3.2 给 `liveReadyTasks(tasks): string[]` 与 `layerInputOf(tasks): T[]`；`design/architecture.md` §接口变更给 `liveReadyTasks(tasks, byId): T[]`；`design/frontend.md` 给 `layerInputOf(tasks): ReadonlyMap<string, string[]>`。本计划以 **interfaces.md 为唯一一套**（t1），另两个变体请设计作废（否则 t1 无法定稿、t2/t5/t6 的接线形状也会跟着漂）。
4. **V-5「漏就绪降为 warning」需要扩一个既有类型**：今天 `ValidationIssue` 没有级别字段、`ValidationResult.passed === (issues.length === 0)`，所以「降 warning 且 `passed === true`」必须扩类型。本计划 t10 加**加性可选** `level?: 'issue' | 'warning'`（缺省 = issue）并让 `passed` / `hasIssue` 只认 issue 级；`rule` 仍是 `'V-5'`（不新增 V-x，`tests/queue-types.test.ts` 的「规则恰为 V-1~V-6」断言不受影响）。设计未点名这个类型改动，请确认（或指定另一种承载方式）。
5. **「A 档硬禁 + B 档基线」的可判定口径需定死**：`board.ts` / `stages.ts` / `protocol.ts` 等文件里同时存在**需求级** `req.status` 比较与**任务级**活卡比较（如 `board.ts` 的 `r.status !== 'canceled'` 与 `t.status !== 'canceled'`）。若按「文件级零命中」判，会把合规的需求级比较一起判红；若按「全仓零手写」判，会得到一个永远红或永远被跳过的假用例。本计划 t9 落成两段：**(a) 收编点清单（file + symbol）体内零命中 + 含单点调用**；**(b) 全仓命中集合 ⊆ 实施后基线（收编点原行只存进 `collected`、不进 `baseline` ⇒ 改回手写必红）**，并为每条基线标 reason（req-status / write-side-guard / status-label / definition-site）。请设计确认这就是验收 B6 与 TC-6 的可执行化口径。
6. **阶段详情过滤落点**（`interfaces.md` §10 #1 待人拍板）：逐 body 补 vs 基类 `assemble()` 一次收敛。本计划取**基类一次收敛**（t6），理由与设计建议一致（一处覆盖 8 个 body，未来新增 body 天然继承）。请在确认门一并裁定。
7. **两处「待人拍板」的默认值**：`cancelReason` 长度上限（设计建议 ≤500 软约束）与 `canceledBy.kind` 是否放宽为 `ActorKind`。本计划按「trim 非空才写、**不设硬上限**」与「仅 `'human'`、非人路径整字段不写」落地（与 requirement「不做」第 4 条一致）；若要软上限/放宽类型，请在批准前说明，t3 按新口径改。
8. **两条已知边界按「接受 + 限定语」落地**（`interfaces.md` §10 #4/#5）：活卡 0 张时覆盖度门**不执法**（沿用 `total <= 0` 既有边界）；存量需求永不触发 RTM 时追溯读数**接受陈旧快照**、不回填不重写。t12/t13 已按此写断言与限定语；若要求一次性重扫存量 RTM，属超范围，需另立需求。

> 除上述 8 条外，本计划与 8 份设计**无矛盾**；设计已点名的裁定（含两条后续裁定：队列校验三段式、批量取消 `canceledBy` 取触发者）在 t2/t3/t8/t10 逐条落地，无「待定（需补设计）」残留。

## 7. 对已确认设计的更正与裁定记录（拆分窗口裁定，执行以本节为准）

设计文档（8 份）已经人确认，但拆分阶段按**仓库真源**核出 5 处**跨文档冲突或未定口径**。为免执行者照错处落地，逐条裁定如下（**这是对设计的更正，不是私自改设计**；偏差会在验收材料里如实申报）：

| # | 冲突/未定处 | 涉及文档 | 裁定（执行以此为准） | 依据 |
|---|---|---|---|---|
| 1 | `markCanceled` 的落点 | `interfaces.md` §6.2（`application/internal/task-transition.ts`）vs `backend.md`（`shared/protocol.ts` 的 `recordStatus` 旁） | **落 `src/shared/protocol.ts`（`recordStatus` 旁）** | `recordStatus` 在 protocol 内；若 `markCanceled` 落在 application，`protocol` 就要 import application ⇒ **反向分层违规**。t3 按此实现 |
| 2 | 落盘 `layer` / `layers` 是否按活卡重算 | `interfaces.md` §3.3（写路径分层输入改 `layerInputOf`，只含活卡）vs `architecture.md`（INV-5 边界 + 「B 方案」）/`backend.md`/`migration.md`（`computeLayers` 判据不改、落盘照旧） | **写路径不改、落盘照旧**；`QueryDag` 的节点层号改由 `liveLayers` **现算** | 读一次写回一次存量队列与 FR-6「零写回」直接冲突；t6 按此实现 |
| 3 | 两处函数签名不一致 | `interfaces.md` §3.2（`liveReadyTasks(tasks): string[]`）vs `architecture.md`（`(tasks, byId): T[]`）；`layerInputOf` 在 `frontend.md` 与 `interfaces.md` 亦不同 | **以 `interfaces.md` 为唯一一套**（契约篇优先）；另两份文档里的变体名与变体签名**作废** | 契约必须单点；t1 按 `interfaces.md` 落 |
| 4 | 「漏就绪降 warning」需要校验结果分级 | 设计未点名（`ValidationIssue` 当前无级别字段、`passed = issues.length === 0`） | **扩既有类型**：`ValidationIssue` 加**加性可选** `level?: 'issue' \| 'warning'`（**缺省 = issue**，既有行为不变、零迁移）；`passed` / `hasIssue` **只认 issue 级**；`rule` 仍为 `'V-5'`（**不新增 V-x**） | 分级是为了区分「可自愈的陈旧派生值」与「真问题」；t10 按此实现 |
| 5 | 「A 档硬禁」的可判定口径 | `frontend.md` / `test-cases.md` TC-6 只写了「新增即红」 | **两段式**：① **收编点（file + symbol）体内零命中且必须调用单点**；② **全仓命中集合 ⊆ 实施后基线**，且**收编点原有的手写行只进 `collected`、不进 `baseline`**（⇒ 改回手写**必红**），每条基线**带 reason** | 文件级零命中会误杀合规的**需求级** `req.status` 比较；全仓零命中则永远红；t9 按此实现，即验收 B6 / TC-6 的可执行化 |

**未定项的默认值（同批裁定）**：阶段详情过滤落点 = **基类 `assemble()` 一次收敛**（不逐 body）；`cancelReason` **trim 后非空才写、不设硬上限**；`canceledBy.kind` **仅 `'human'`**（真非人工路径整字段不写）；活卡 0 张时覆盖度门**不执法**；存量需求永不触发 RTM 的追溯读数**接受陈旧、不回填**。

**口径提醒（给执行者）**：设计文档里的 `file:line` 只作参考（本工作区有并发方在改 `src/**`，行号会漂移）；**落点以函数名 / 符号名为准**。
