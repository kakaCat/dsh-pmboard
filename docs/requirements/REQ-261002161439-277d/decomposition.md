# REQ-261002161439-277d 拆分计划 · reqboard 数据层：台账分片 + 读放大治理 + 存储端口化

## TL;DR

现在全部运行时状态装在一份 **2.66MB 单册 JSON**（`~/.dsh/dsh-reqboard.json`，35 条需求、33 条已归档）里：每次变更 `structuredClone` 全册再整份覆盖写（`revision` 已 2524，累计重写约 **6.7GB**），每次读深克隆 + 深冻整册（同步 `snapshot()`，**95 处**调用点），看板 `GET /state` 每次整包吐给客户端**且每请求先扫一遍全部需求目录**。

本次把它换成：**聚合根=需求的异步端口** + **按需求分片落盘**（热记录 + append-only 日志 + 外置大对象）+ **归档冷存** + **乐观锁**，看板载荷改成摘要 + 分页 + 详情按需。

三件事**不做**：不实现数据库适配器（只把接口与关系型映射定死）、不改业务规则与状态机、不改任务存储。

改动落在 **11 张卡**：地基（t1–t3）→ 存储实现（t4–t5）→ 迁移与回滚脚本（t6–t7）→ **原子切换运行时**（t8）→ 客户端载荷（t9）→ 文档同步（t10）→ 端到端收口（t11）。

## 改动盘点（对照设计文档逐份）

| 设计文档 | 落点文件 | 改动 | 接收任务 |
|---|---|---|---|
| design/architecture.md | src/domain/requirement/ReqboardPaths.ts 等 3 个新文件 | 数据根/分片/日志路径单一事实源、摘要投影、日志编解码（纯函数） | t1 |
| design/data-model.md | 同上 | 摘要字段集、日志行形状、计数截断规则 | t1、t5 |
| design/interfaces.md | src/application/ports.ts | 新增 RequirementStore 端口与支撑类型、错误码（与旧端口并存） | t2 |
| design/interfaces.md | src/repositories/atomicWrite.ts、RequirementShardRepository.ts | 原子写搬迁（全仓唯一）+ 分片目录 IO 唯一入口 | t3 |
| design/backend.md | src/repositories/ShardedRequirementStore.ts | 读侧：懒建内存索引、摘要投影、冷读回落 | t4 |
| design/backend.md | src/repositories/ShardedRequirementStore.ts | 写侧：CAS、dirty-field dispatch、日志追加与截断、提交顺序 | t5 |
| design/backend.md | scripts/migrate-ledger-v10.ts | v9 单册 → v10 分片（四模式 + 备份 + 幂等 + meta.json 最后写） | t6 |
| design/architecture.md | scripts/rollback-ledger-v10.ts | v10 分片 → legacy v9 单册导出 | t7 |
| design/interfaces.md | src/application/ports.ts、src/adapters/JsonLedgerRepository.ts（删）、application/**、tools/**、http/**、wiring/**、src/index.ts、tests/application/harness.ts | 端口切换：95 处读点 + 三处同步缝 + 测试替身与 41 处构造点 | t8 |
| design/frontend.md | src/http/routers/stages.ts、requirements.ts、src/client/** | 摘要 + 分页 + 详情端点 + 扫描移出 + 客户端重建 | t9 |
| design/test-cases.md | docs/knowledge/architecture.md | 知识层数据层描述同步 | t10 |
| design/test-cases.md | tests/reqboard/*、全量回归 | 契约三实现、放大探针、回归基线与构建 | t11 |

## 覆盖对照表

| 需求条款 | 条款内容 | 接收任务 |
|---|---|---|
| FR-1 | 存储端口收敛为领域语汇且全异步 | t2、t3、t4、t8 |
| FR-2 | 写路径按分片落盘，消除整册重写 | t3、t5 |
| FR-3 | 只增长大字段外置为 append-only | t1、t5 |
| FR-4 | 归档需求热冷分层 | t4、t5 |
| FR-5 | 乐观锁与结构化冲突错误 | t2、t5、t8 |
| FR-6 | 数据库就绪（端口不泄漏存储细节 + 关系型映射） | t2、t4、t5、t11 |
| FR-7 | 客户端载荷增量 + 分页 + 去掉每请求全目录扫描 | t9、t11 |
| FR-8 | 可回滚（legacy v9 一键导出 + 迁移幂等） | t6、t7 |

## 任务表

| 顺序 | key | 业务标题 | 类型 | 依赖 | 验收要点 |
|---|---|---|---|---|---|
| 1 | t1 | 把数据放哪、长什么样定成纯函数：路径、摘要、日志行 | implement / backend | — | 3 个新 domain 模块单测全绿；零 I/O；typecheck 不高于基线 223 |
| 2 | t2 | 先定契约：需求存储端口与错误码（与旧端口并存） | implement / backend | t1 | 端口方法逐条对照 design/interfaces.md；内存替身跑通契约测试 |
| 3 | t3 | 一处原子写、一处分片 IO：仓储与原子写搬迁 | implement / backend | t1 | 分片仓储单测全绿；全仓 persistAtomic 只有一处实现 |
| 4 | t4 | 读得动：内存索引、摘要投影、归档冷读 | implement / backend | t2、t3 | 分片实现与内存替身跑同一份契约；读探针显示摘要读入 0 字节 |
| 5 | t5 | 写得准：乐观锁、差异分派落盘、日志追加与截断 | implement / backend | t4 | A1 写放大 100 条与 1000 条落盘字节相等；A4 热记录 ≤8KB 且与评论条数无关；A6 CAS 冲突不覆盖 |
| 6 | t6 | 数据搬家：v9 单册迁到 v10 分片（可试跑、可幂等） | implement / backend | t5 | 迁移测试全绿；dry-run 零文件变化；二次 apply 报 already_v10 且 mtime 不变 |
| 7 | t7 | 退路先修好：v10 分片导回 legacy v9 单册 | implement / backend | t6 | A11 导出后 v9 reader 装载成功，条数与 id 集合完全一致 |
| 8 | t8 | 一次性把运行时切过去：删单册实现、改 95 处读点与三处同步缝 | implement / backend | t5、t7 | 全仓 src 无 snapshot()；typecheck ≤223；pnpm test 失败 ≤106；只有 v9 单册时启动抛 REQBOARD_REQUIRES_MIGRATION |
| 9 | t9 | 看板载荷瘦身：摘要 + 分页 + 详情按需 + 扫描移出 | implement / fullstack | t8 | A9 载荷下降 ≥10× 且不随归档条数增长；A10 GET / 触发扫描 0 次；build:client 报 verify OK |
| 10 | t10 | 文档与知识层同步：数据层描述不再指向单册 | doc / backend | t8 | pnpm kb:check 退出码 0；docs/ 下不再引用 JsonLedgerRepository |
| 11 | t11 | 收口：三实现契约、放大探针、回归基线与构建 | test / fullstack | t8、t9、t7 | pnpm test ≤106 失败且无新增；typecheck ≤223；pnpm build 退出码 0；A1/A4/A9 在 ≥200 条夹具下成立 |

## 批次与依赖（为什么这样切）

**批 1 地基（t1–t3）**：只**新增**文件，不动既有代码 ⇒ 每一步结束仓库都编译通过、测试不退化。路径与日志编解码放在 `domain/`（纯函数）先立，是因为它们被后面所有卡复用。

**批 2 存储实现（t4–t5）**：先读侧后写侧。读侧做完，分片实现就能与内存替身跑同一份契约测试（"端口真的可替换"的唯一硬证据，也是下一需求 DB 适配器的入场券）；写侧做完，A1/A4/A6 三条关键断言才可测。

**批 3 脚本就位（t6–t7）**：迁移与回滚脚本在**切换前**写好。理由：t8 会打开 `REQBOARD_REQUIRES_MIGRATION` 门（只有 v9 单册时拒绝启动），没有迁移脚本就没有升级路径；没有回滚脚本就没有退路。

**批 4 原子切换（t8）**：**这是唯一的大卡，且不可再拆**。端口形状一改，`snapshot()` 的 95 处调用点、三处同步上下文、`tests/application/harness.ts` 的测试替身、41 处测试构造点会在同一刻全部编译失败——按消费者拆成多张卡，每张卡结束时仓库都处于不可编译状态，反而无法独立验收。因此它作为一张卡，验收口径是"编译与测试恢复基线"。t8 刻意排在脚本之后、客户端之前。

**批 5 收尾（t9–t11）**：载荷（t9）、文档（t10）互不依赖；收口（t11）在最后，负责把散在 t5/t9 的断言在**真实规模夹具**（≥200 条需求）上再验一次，并跑全量回归与构建。

## 迁移与兼容（单列说明）

- **数据迁移**：`migrate-ledger-v10`（t6）——dry-run 缺省、写前备份、`meta.json` **最后写**（提交点）、已 v10 幂等不重写、`state/server.pid` 存活时拒绝 `--apply`。带非空 `tasks` 的旧单册拒绝并指向既有 v9 脚本。
- **回滚**：`rollback-ledger-v10`（t7）——导出的单册 `schemaVersion: 9`、大字段重新内联，旧版读路径可装载同一批需求（A11）。
- **旧调用方**：`ReqboardRepository` / `JsonLedgerRepository` **删除**（t8），不留兼容壳——兼容壳会让 95 个读点永远改不完，且同步口无法映射到远端库。
- **工具对外契约**：20+ 个 `reqboard_*` 工具的输入/输出/错误码**一字不变**（t8 验收含 `pnpm test` 不新增失败）。
- **客户端**：与 host 同仓，t9 一起重建 `lib/client.js`，不出现"新 host 配旧 client"的中间态。
- **看板写端点**：可选 `expectedVersion`——带了走 CAS，不带保持旧行为（旧客户端仍可用）。

## 下一步

implementing —— 本计划经人批准后自动落库任务卡并进入实施。
