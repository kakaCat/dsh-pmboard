---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-7, FR-8
---

# 测试策略（放大探针 · 冲突 · 迁移回滚 · 零回归） serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-7, FR-8

> 判定标准 A1–A13 来自需求文档。**每条断言都必须能跑**：命令 + 看到什么算过。空话验收一律不接受。

## 断言到用例的映射 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-7, FR-8

| 断言 | 用例文件 | 量法 | 通过条件 |
|------|---------|------|---------|
| A1 写放大 | `tests/reqboard/store-amplification.test.ts` | 夹具库 100 条需求，注入 fs 写探针（记录每次 `writeFile`/`rename`/`appendFile` 的字节数），追加 1 条评论 | 落盘字节 < 全库 5%；**100 条与 1000 条夹具的落盘字节相等** |
| A2 读放大 | 同上 | 读探针统计 `getSummary(id)` / `listSummaries()` 的读入字节 | `getSummary` 读入 0 字节（走内存索引）；`listSummaries` 读入 0 字节；`get(id)` 不读其他需求的分片 |
| A3 分片布局 | `tests/reqboard/store-shards.test.ts` | 迁移夹具后列目录 | `meta.json` + `requirements/<REQ>/record.json` 在场；归档需求只在 `archive/` 下 |
| A4 热记录有界 | 同上 | 同一需求灌 500 条评论 + 长证据 + 300 条产物后测 `record.json` | 体积 ≤ **8KB**，且与评论/产物/验收条数**无关**（100 条与 500 条评论时体积相同） |
| A5 热冷分层 | `tests/reqboard/store-cold.test.ts` | 对含归档需求的夹具 | 归档不在 `listSummaries()` 默认结果、不进内存索引、写它抛 `REQBOARD_COLD_IMMUTABLE`；`get(id)` 仍能取回全文 |
| A6 乐观锁 | `tests/reqboard/store-conflict.test.ts` | 两个写者持同一 `expectedVersion` 先后 `mutateIf` | 第二个抛 `REQBOARD_CONFLICT`（含 `currentVersion`）；第一个写入未被覆盖 |
| A7 幂等 | 同上 | 同一写操作连调两次 | 第二次不写盘（`record.json` mtime 不变） |
| A8 工具面零回归 | `pnpm test` | 全量套件 | 失败数 ≤ 基线 **106**，新增用例全绿 |
| A9 载荷降量 | `tests/reqboard/state-payload.test.ts` | 夹具含 33 条归档，请求 `GET /` | 响应不含归档需求；字节数比现状低**一个数量级**；`cursor` 能取下一页 |
| A10 去扫描 | 同上 | 探针统计 `syncAllReqArtifacts` 调用 | `GET /` 触发 **0** 次；`POST /artifacts/scan` 触发 1 次 |
| A11 可回滚 | `tests/reqboard/rollback-v10.test.ts` | 迁移 → 回滚导出 → 用 **v9 读路径**装载 | 需求条数与 id 集合与迁移前**完全一致** |
| A12 迁移幂等 | `tests/reqboard/migrate-v10.test.ts` | 连跑两次 `--apply`；另注入中途失败 | 二次报 `already_v10` 且文件 mtime 不变；失败后 `meta.json` 未写、原单册未动、备份在场 |
| A13 类型与构建 | `pnpm typecheck` / `pnpm build` | 见「回归基线与命令」 | 类型错误 ≤ 基线 **223**；构建退出码 0 |

## 放大探针怎么造 serves: FR-2, FR-3

**核心手段：注入式 fs 探针**（不靠"看文件大小猜"，也不 mock 掉 fs）。

- 造一个 `ProbeFs`：包装 `node:fs/promises` 的 `writeFile` / `appendFile` / `rename` / `readFile`，累计路径与字节数，暴露 `writes()` / `reads()`。
- 适配器**只经端口拿 fs 能力**（`RequirementShardRepository` 的构造参数注入），因此探针可无侵入接入；这也顺带证明"IO 只有一处"。
- 夹具生成器：`makeFixture(n)` 生成 n 条需求的完整分片（含可配置的评论/产物条数），写入临时数据根。

**A1 的等价性判据怎么算成立**：夹具 100 条与 1000 条时，追加一条评论的落盘集合必须**都是**「`record.json` 整份（该条需求，体积与 n 无关）+ `comments.jsonl` 追加 1 行 + `meta.json` 整份」——所以字节数相等。若实现里出现"重写索引"或"遍历其他需求写盘"，这条立刻红。

**A4 的独立性判据**：同一需求分别灌 100 / 500 条评论，`record.json` 字节数必须**完全相同**（只有 `commentCount` 一个数字在变，位数差异允许 ±2 字节容差）。

## 冲突与并发用例 serves: FR-5

| 用例 | 步骤 | 期望 |
|------|------|------|
| CAS 命中 | `getSummary(id)` 取 `version=v` → `mutateIf(id, v, fn)` | 成功，返回 `version === v+1` |
| CAS 冲突 | 取 `v` → 另一写者 `mutate` 成功 → 本写者 `mutateIf(id, v, fn)` | `REQBOARD_CONFLICT`，`currentVersion === v+1`，**磁盘内容仍是前者的** |
| 无变更不写盘 | `mutate(id, () => undefined)` | 不写盘、不 bump `revision`、不广播 |
| `version` 由适配器自增 | 变更器**不**碰 `version`，只改 `title` | 落盘后 `version === 旧值 + 1`（现状"45/90 处手工自增"的缺陷由此修掉） |
| 只追加纪律 | 变更器删掉一条已有评论 | 走整份重写降级 + 告警（不静默） |
| 冷侧写拒绝 | 对归档需求 `mutate` | `REQBOARD_COLD_IMMUTABLE`，磁盘未动 |

## 迁移与回滚用例 serves: FR-8

| 用例 | 步骤 | 期望 |
|------|------|------|
| dry-run 零副作用 | `--dry-run` | 报告变更计数；数据根目录 mtime 与新文件数均为 0 变化 |
| 全量等价 | `--apply` 后逐需求比对 | 每条需求装配回来的 `RequirementRecord` 与单册里的**去重后内容等价**（评论顺序、产物顺序、验收单版本号逐项一致） |
| `migrations` 留痕 | `--apply` 后读 `meta.json` | `migrations` 含 `{from:9,to:10}`；**再写一次数据后仍在**（v9 曾因 load 丢 `migrations` 出过事故） |
| 幂等 | 连跑两次 `--apply` | 第二次报 `already_v10`，所有文件 mtime 不变 |
| 中途失败 | 在第 k 条需求注入写失败 | 原单册未被触碰；`meta.json` 未写；备份在场；重跑 `--apply` 可成功 |
| 服务在跑拒执行 | 伪造 `state/server.pid` 存活 | `--apply` 拒绝并给出提示；`--force` 可跳过 |
| 回滚等价 | 迁移 → `rollback-ledger-v10 --apply` → v9 读路径装载 | 条数与 id 集合完全一致；用旧版 `JsonLedgerRepository` 的 v9 分支可载入（A11） |
| 迁移门 | 数据根只有 v9 单册时启动 | 抛 `REQBOARD_REQUIRES_MIGRATION`，**不**起空台账 |

## 热冷分层用例 serves: FR-4

- 状态边界：`status` 从 `done` → `archived` 后目录搬到 `archive/`；反向（归档回滚）由人工操作，测试只断言"冷侧不可写"。
- 深链可用：`GET /requirements/<已归档 id>` 返回 200 + 全文（**这条是本次必须保住的能力**——现状 33/35 条归档需求全靠整包热传才打得开）。
- 索引不含冷侧：`listSummaries()` 返回条数 == 热侧需求数；`listSummaries({scope:'archived'})` 显式请求才返回冷侧（只读目录名，不读内容）。

## 客户端载荷用例 serves: FR-7

- 载荷形状：`GET /` 的 `requirements[]` 元素**不含** `comments` / `artifacts` / `verification` / `plan` / `archive`（用类型与运行时双断言）。
- 降量：夹具 35 条（33 归档）时，响应字节 < 现状的 1/10；把夹具加到 200 条归档，响应字节**不随归档条数增长**。
- 详情按需：`GET /requirements/:id` 返回全字段；客户端的详情视图只在需要时调它（用客户端测试断言"首屏渲染不触发详情请求"）。
- 分页：`limit=1` 时返回 1 条 + `nextCursor`；`cursor` 取完最后一页返回 `nextCursor === undefined`；越界 cursor 不抛错（返回空页）。
- SSE 不变：`/events` 仍发 `{revision, kind}` 命名帧 + 无名帧；既有断言不变。

## 测试替身 serves: FR-1

`tests/application/harness.ts` 的 `InMemoryRepo` 是**唯一**端口替身（现状已实现 `ReqboardRepository`）。本次改为 `implements RequirementStore`：

- 内存实现必须与分片实现**对同一套契约测试通过**（同一份 `store-contract.test.ts` 同时跑两个实现）——这是"端口真的可替换"的唯一硬证据，也是下一需求 DB 适配器的入场券（它将成为第三个实现）。
- 契约测试覆盖：全部错误码、幂等、CAS、只追加纪律、冷侧只读、摘要字段完整性。

## 回归基线与命令 serves: FR-1, FR-8

| 时机 | 命令 | 期望 |
|------|------|------|
| 改动后 | `pnpm typecheck` | 类型错误 ≤ 基线 **223** |
| 提交前 | `pnpm test` | 失败数 ≤ 基线 **106**，新增用例全绿 |
| 发版前 | `pnpm build` | 退出码 0，`dist/` 与 `lib/client.js` 均有新产物 |
| 改了客户端 | `pnpm build:client` | `[verify-client] OK …` |
| 改了知识层 | `pnpm kb:check` | 退出码 0 |

基线口径与 `docs/knowledge/conventions.md` 的 C-11/C-12/C-13/C-14/C-15 一致；新增失败即本次引入，不接受"顺手也红了几个"。
