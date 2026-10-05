---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-8
---

# 后端（分片适配器 · 索引 · 同步缝 · 迁移脚本 · 装配） serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-8

> 实现口径。IO 只允许出现在 `src/repositories/**`；`application` 与 `domain` 照旧零 IO。

## 分片仓储的写实现 serves: FR-2, FR-3

`RequirementShardRepository`（新）是分片目录 IO 的**唯一入口**，职责与 `QueueRepository` 对齐（那个文件已经用同一套纪律跑通过 v9→queue.json 的迁移）：

1. **原子写**：复用 `persistAtomic`（temp → fsync → rename），从 `JsonLedgerRepository` 迁到 `src/repositories/atomicWrite.ts`，全仓唯一实现（**不造第二套**——原子性只在断电时暴露，两套必然漂移）。
2. **追加写**：`appendFile` + `fsync`；追加前先按 `record` 里的计数**截断未提交尾巴**（I-2）。
3. **校先于写**：结构校验不通过 → 抛 `REQBOARD_VALIDATION_FAILED`，**一个字节都不落盘**。
4. **坏文件隔离**：解析失败才改名 `<file>.corrupt-<ts>` + 告警；校验失败不隔离（那是"内容不合规"，改名会毁掉还能手工修的数据）。

**提交顺序（唯一正确的顺序）**：

```
1. 先落"不可回退的追加"：comments.jsonl / history.jsonl 尾部行
2. 再落"整份外置对象"：artifacts.json / plan.json / verification.json / archive.json（有变化才写）
3. 最后落提交点：record.json（version +1、计数 +1）   ← rename 原子
4. 全局序：meta.json（revision +1）                  ← 单标量文件，rename 原子
```

崩在 1–3 之间：`record.json` 仍是旧提交点 ⇒ 用 I-2 截断规则读，数据一致。崩在 3–4 之间：`revision` 少 1，只影响 SSE 版本号（下一次写入补上），不影响数据。

## Dirty-field dispatch serves: FR-2, FR-3

变更器改的是**装配后的完整需求**，提交时按差异分派（见 `interfaces.md` §RequirementDraft）。实现要点：

- 装配 draft：读 `record.json` + 两个日志 + 有变化的四个外置文件（**不全量读**：外置对象按需读，只有变更器实际访问才装配——用 getter 惰性装配，避免"改个标题也读 190KB"）。
- 差异判定：数组用「长度 + 前缀逐元素引用/内容比较」；前缀被改写 → 整份重写 + 告警（`comments` / `statusHistory` / `advance.history` 的只追加纪律，见 `interfaces.md`）。
- 无变化 → `MutationOutcome.changed === false` ⇒ 不写盘（**A7 幂等判据 = 文件 mtime 不变**，沿用 `QueueTaskStore` 同款判据）。

## 内存索引与重建 serves: FR-1, FR-4

- 结构：`Map<id, RequirementSummary>`（热侧）+ `Set<id>`（冷侧 id 集合，只存目录名）。
- **懒建**：首次 `listSummaries` / `getSummary` 未命中时扫 `requirements/*/record.json` 建索引（沿用 `QueueTaskStore.buildIndexFromDisk` 先例：不在进程启动时无条件预读）。未命中负结果**不缓存**（下次访问重试）。
- 增量维护：写路径成功后更新该条摘要；`create` 插入；归档搬运时从热 Map 移到冷 Set。
- 冷侧不预读内容：`scope:'archived'` 时只列目录名（必要时再读 `record.json` 取摘要）。
- **索引不落盘** ⇒ 不存在"索引与分片不一致"（崩溃后重建即收敛）。这是对 FR-2 的收敛，理由见 `architecture.md`。

## 缓存与失效 serves: FR-1

| 缓存 | 内容 | 失效 |
|------|------|------|
| 摘要索引 | 热侧摘要 Map | 写路径增量更新；损坏隔离时剔除该条 |
| 记录缓存 | **不缓存**完整记录（写路径强制重读，读路径每次组装） | — |
| 冷侧 id 集合 | 目录名 | 归档动作后更新 |

**刻意不缓存完整记录**：现状"信任缓存 = 用旧快照覆盖别人刚写的内容"是静默丢数据的成因（`QueueTaskStore` 头部已把这条教训写死）。装配是 O(单需求)，不值得为省这点读去冒丢数据的风险。

## 同步口的处置（三处硬骨头） serves: FR-1

`snapshot()` 是同步的，去掉它必须给"同步读取者"一个明确出路。**结论：开一个被标注为非权威的同步投影，其余全部异步。**

| 站点 | 现状 | 处置 |
|------|------|------|
| `gate-wiring.ts:172` 系统提示词段组装 | `section({ text: (ctx) => string })` 是**同步回调**，每回合执行 | 用 `peekSummaries(): readonly RequirementSummary[]`（同步、读内存索引）。只决定"注入哪段引导文字"，**不参与任何门禁与写判定** |
| `dive/session-driver.ts:75,250` + `boundary-guard.ts:51` | 注入 `snapshot: () => ReqboardLedger` | `shouldCaptureWindow` / `openRequirementsFor` / `draftRequirementsFor` 的入参类型从 `LedgerView` 改为 `readonly RequirementSummary[]`（它们只用 `status` / `sourceSessionId`）；提示词侧传 `peekSummaries()` |
| `boundary-guard.guardToolCall` | 由工具事件处理器调用（**异步上下文**） | 改为 `await store.listSummaries({scope:'active'})` 的**权威**读（纪律注入不该基于可能过期的投影） |
| `pm-capture-root.ts:151` 窗口活动回调 | `onBoundWindowActivity?: (windowKey, text) => void`，返回值被忽略（`session-driver.ts:269`） | 签名不变，内部改为"立即返回 + 异步继续"（`void (async () => {…})()`），错误走告警通道，不吞 |
| `h2-compact.ts:61` `persistArtifacts` 默认值 | `(): number => deps.repo.snapshot().revision` | 该缝的类型本就允许 `Promise<number>`；**删除同步默认值**，改为组合根显式注入 `async () => (await store.head()).revision`（漏注入则编译不过） |

**`peekSummaries` 的契约（必须写进端口注释）**：返回本地索引投影，**可能略旧**；只允许用于提示词/引导组装等"过期不致命"的场景；**任何门禁、写判定、人工门、验收都必须用 await 的权威读**。DB 适配器实现它时返回本地缓存投影（可以是空数组 = 退化为不注入引导，不影响正确性）。

## 95 处读点的改造顺序 serves: FR-1

1. 先改端口与适配器（`ports.ts` + 新仓储/Store），让 `snapshot()` **编译消失**——此后所有报错点就是待改清单（编译器当清单用，不靠人工巡检）。
2. 按 `interfaces.md` 的分类逐类改：`.find` → `getSummary`/`get`；整册实参 → 纯函数改签名 + `listSummaries`；`.revision` → `head`。
3. `tests/application/harness.ts` 的 `InMemoryRepo` 同步改造（唯一替身）。
4. 41 处测试构造点（`new JsonLedgerRepository({file})`）换成统一测试工厂 `makeTestStore()`。

**已知代价**：`JsonLedgerRepository` 被 **90 个文件**引用（72 个只当类型用、41 处 `new`）。这是本次最大的机械工作量，必须先做（否则后面每改一处都要兼容两种读法）。

## 迁移与回滚脚本实现 serves: FR-8

`scripts/migrate-ledger-v10.ts`（新增，不改既有 `migrate-ledger.ts`）：

| 环节 | 实现口径 |
|------|---------|
| 读源 | 单册 `JSON.parse(readFile)`；**迁移门**：`schemaVersion === 10` ⇒ `already_v10`；无 `tasks` 且 `schemaVersion < 10` ⇒ 正常迁移；带**非空** `tasks` ⇒ 拒绝（先跑 v9 脚本，沿用既有判据） |
| 备份 | `copyFileSync(file, file + '.backup-' + now)`，失败即中止 |
| 落分片 | 逐需求：建目录 → 日志（按原数组顺序赋 `seq`）→ 外置对象（**不存在则不建文件**）→ `record.json`；`status ∈ {archived,done}` 落 `archive/` |
| 提交点 | **最后**写 `meta.json`（`schemaVersion`、`revision`、`migrations.push({from:9,to:10,at,by})`） |
| 幂等 | 已 v10 ⇒ 不重写任何文件（mtime 不变） |
| 服务探测 | `<ledgerDir>/state/server.pid` 存活 ⇒ `--apply` 拒绝（`--force` 跳过） |
| 报告 | `--json` 输出：逐需求文件数、字节数、跳过的需求与原因 |
| 隔离 | 无法装配的需求（缺 id / id 与目录不符）→ 跳过 + 计入报告 + **绝不静默丢**（对齐 v9 脚本的 orphan 隔离哲学） |

`scripts/rollback-ledger-v10.ts`（新增）：读分片 → 组装 v9 单册结构（`requirements[].comments` 等回到内联）→ `persistAtomic` 写目标文件 → `--verify` 模式做双向比对（条数、id 集合、逐需求内容等价）。

## 装配与接线 serves: FR-1, FR-6

- `src/index.ts`：`new ReqboardStore({file: dshHomePath(config, LEDGER_FILE)})` → `new ShardedRequirementStore({ root: dshHomePath(config, 'reqboard'), fs, now, onWarn })`。
- `LEDGER_FILE = 'dsh-reqboard.json'` **保留**：语义降级为"legacy 导出文件名"，供迁移门与脚本使用。
- 组合根显式注入 `h2-compact` 的 `persistArtifacts`（去掉同步默认值）。
- 迁移门：单册在场而 `reqboard/meta.json` 缺席 ⇒ 启动即抛 `REQBOARD_REQUIRES_MIGRATION`（**绝不静默起空台账**）。

## 关系型适配器落地要求（下一需求） serves: FR-6

1. 实现同一个 `RequirementStore`；**表结构与并发映射见 `data-model.md`**。
2. 契约测试（`tests/reqboard/store-contract.test.ts`）必须三个实现全绿：分片 JSON、内存替身、SQL。
3. 迁移路径：v10 分片 → DB 由脚本导入（方向与本次相反，脚本另立）；回滚路径：DB → v10 分片导出。
4. `peekSummaries` 的 DB 实现返回本地缓存投影（可为空数组）。
5. **不需要**改动任何用例、工具、路由或客户端——这是 FR-6 的验收口径。

## 观测与告警 serves: FR-2, FR-3

| 事件 | 通道 | 内容 |
|------|------|------|
| 分片损坏隔离 | `onWarn` | 路径、改名目标、丢弃原因 |
| 只追加纪律违反（前缀改写） | `onWarn` | 需求 id、字段、走整份重写的字节数 |
| 写放大异常（单次落盘超阈值） | `onWarn` | 需求 id、落盘字节、涉及文件——**这是 A1 在真实数据上的哨兵**（测试用夹具，线上用这条告警） |
| 冲突 | `onWarn` | 需求 id、期望版本、当前版本（判断是否真有多写者） |
| `sweep` 部分失败 | `onWarn` | 已 touched 计数、失败的 id 与原因 |
| 迁移 | stdout + `--json` | 逐需求文件数、字节数、跳过清单 |
