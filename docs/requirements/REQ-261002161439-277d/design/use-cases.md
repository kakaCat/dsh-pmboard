---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8
---

# 用例（交互路径 · 启动对账 · 迁移回滚 · 接库切换） serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8

> 每条用例写清：谁触发、走哪条路径、异常怎么响。执行者应能据此判断"改这里会不会碰坏别的用例"。

## UC-1 立项落库 serves: FR-2

**触发**：用户在立项弹框作答 → `reqboard_capture` 创建需求。
**路径**：`create(input, actor)` → 建 `requirements/<REQ>/` 目录 → 原子写 `record.json`（`version=1`、`commentCount=0`）→ 追加首条评论到 `comments.jsonl` → `meta.json.revision + 1` → 广播 `requirement-created`（带摘要）。
**结果**：需求立即在看板 `draft` 泳道可见（走 SSE 的摘要增量，不需要整册重读）。
**异常**：id 已存在 → `REQBOARD_ALREADY_EXISTS`（不覆盖）；目录创建失败 → `REQBOARD_IO_FAILED`（不留半成品目录：先写临时目录再 rename 到位）。

## UC-2 追加评论（最高频写） serves: FR-3

**触发**：任何工具提交/推进/确认后追加一条留痕评论（现状 1959 条评论、单需求最多 144 条）。
**路径**：`appendComment(id, comment)` 或经 `mutate` 的变更器 push → 适配器按 I-2 先追加日志行（`seq = commentCount`）→ 再原子写 `record.json`（`commentCount + 1`、`version + 1`）→ `meta.json.revision + 1`。
**结果**：落盘约 5KB + 1 行；**与库容、与历史评论条数无关**（A1/A4）。
**异常**：崩在两步之间 → 日志多一行未提交；读侧按 `commentCount` 截断忽略，下次追加复用该 `seq`。

## UC-3 阶段推进与人工门 serves: FR-5

**触发**：agent 调 `reqboard_move`，或人在看板点确认/推进。
**路径（会话路径）**：用例先 `getSummary(id)` 拿 `version` 与当前阶段 → 领域规则判定（五道人工门**原样不动**）→ `mutateIf(id, version, fn)` 改 `status`、push `statusHistory`、追加评论。
**路径（看板路径）**：请求体带 `expectedVersion` → `mutateIf`；不带 → `mutate`（旧客户端兼容）。
**结果**：`version + 1`，`history.jsonl` 追加 1 行，`record.json` 原子替换；SSE 广播 `requirement-moved`。
**异常**：版本不匹配 → `REQBOARD_CONFLICT`（回 `currentVersion`）。**用例必须重读后重试或如实报冲突，不得静默重试到成功**（静默重试会把"两人同时推进"变成"后者覆盖前者"）。
**不变量**：人工门拒绝 agent 的规则、状态机合法边判定全部在 `domain/`，本次**一行不改**。

## UC-4 看板首屏 serves: FR-7

**触发**：人打开看板（或 SSE 事件/定时轮询触发刷新）。
**路径**：`GET /` → 读内存索引（首个请求时懒建：扫 `requirements/*/record.json`）→ 返回热侧摘要 + 任务（`taskStore.listAll()`）+ `ready` + `tokenTotals` + 游标。
**结果**：载荷 ≈ 摘要条数 × 156B（现状 2.66MB 全量含 33 条归档）；**不再触发产物扫描**（A10）。
**异常**：某需求分片损坏 → 该条从索引剔除 + 告警，看板其余正常（沿用"坏条目丢弃"哲学，不整页 500）。

## UC-5 打开归档需求详情（冷读） serves: FR-4

**触发**：人点开归档需求（深链 `?req=<id>`，或归档页跳转）。
**路径**：`GET /requirements/:id` → 热侧未命中 → 回落 `archive/<REQ>/` 装配全文 → 返回。
**结果**：详情完整可读（**能力必须保住**，否则归档数据就成了打不开的死数据）。
**异常**：冷热两侧都无 → 404 + `REQBOARD_NOT_FOUND`；冷侧分片损坏 → `REQBOARD_CORRUPT_SHARD`（隔离 + 告警）。
**边界**：冷侧**只读**——任何写操作 `REQBOARD_COLD_IMMUTABLE`。

## UC-6 启动对账（唯一跨需求写） serves: FR-1

**触发**：宿主启动后的对账扫描（现状两处：`src/index.ts:188` 的 pickup 接手 + 任务汇总推进、`migrate-dive-state.ts:104` 的 Dive 状态一次性迁移）。
**路径**：`listSummaries({scope:'active'})` 取 id 集合 → `sweep(reason, fn)` 一次覆盖这批需求（JSON：串行队列内逐条落盘；DB：单事务）。
**结果**：与现状**语义等价**（全表对账、逐条判定、无变更则不写盘）。
**异常**：单条写失败 → 记录该条并继续（与现状"一次 mutate 全表"的差异点，见下）。
**与现状的差异（必须知道）**：现状是"一次 `mutate` 覆盖全表"（全有或全无）；本设计改为"逐条提交"。差异理由：聚合根变成需求后，跨需求的强原子性没有业务价值（各需求互不依赖），而 DB 世界里逐条提交可以利用行锁并发。**副作用**：中途失败会留下"部分已对账"的状态——这是可接受的（对账是幂等的，下次启动继续），但必须在日志里报出 touched 计数。

## UC-7 迁移与回滚 serves: FR-8

**触发**：人执行迁移脚本（升级插件后按提示操作）。
**路径**：`--dry-run`（看变更）→ `--apply`（备份单册 → 逐需求落分片 → **最后**写 `meta.json`）→ 起服务（`meta.json.schemaVersion=10` 通过门禁）。
**结果**：`requirements/` 与 `archive/` 就位；单册保留为导出格式。
**异常**：`--apply` 中途失败 → `meta.json` 未写 ⇒ 再跑一次从头重放（幂等）；服务在跑 → 拒绝执行（防内存态覆盖磁盘）。
**回滚**：`rollback-ledger-v10 --apply` 导回单册 → 用旧版读路径装载（A11）。

## UC-8 冲突处置 serves: FR-5

**触发**：`mutateIf` 返回 `REQBOARD_CONFLICT`。
**路径**：调用方重新 `getSummary(id)` → 用新 `version` 重放变更 → 若业务前提已变（如阶段已被别人推进），**如实报错给用户**，不硬写。
**结果**：不会出现"两人同时推进、后者静默覆盖前者"。
**观测**：冲突次数进日志（`onWarn` 通道），便于判断是否真有多写者。

## UC-9 接库切换（下一需求，本次只保证可行） serves: FR-6

**触发**：实现 DB 适配器的那个需求。
**路径**：新增一个 `implements RequirementStore` 的 `SqlRequirementStore` → 组合根换一行装配 → 同一份契约测试跑通 → 数据经 `migrate` 脚本导入。
**结果**：**调用方一行不改**（这是 FR-6 的全部意义）。
**本次必须为它准备好的三件事**：① 端口全异步、无整册语义；② `data-model.md` 的关系型映射表与并发映射；③ 契约测试可复用（第三个实现直接接入）。
