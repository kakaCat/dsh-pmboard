# 开工基线（REQ-261004103330-005f）

> 为什么要有这份文件：验收要能证伪「本次改动没让事情变坏」。没有实测基线，
> 「失败数没有增加」就只是一句感觉。本文件在 **t1 开工时**实测并落盘，后续每张卡的自测都对照它。

## 实测时间与口径

| 项 | 命令 | 实测值 | 说明 |
|---|---|---|---|
| 类型检查 | `npx tsc --noEmit 2>&1 \| grep -c 'error TS'` | **146** | 均为存量错误；本次新增的 4 个文件与改动的 3 个共享文件（`ports.ts` / `limits.ts` / `envelope.ts`）**零新增**（逐文件 grep 确认为空） |
| 相关域用例 | `npx vitest run tests/reqboard tests/application tests/http` | **1 failed / 432 passed**（34 个文件） | 唯一失败见下 |
| 文件尺寸 | 单文件 ≤ 400 行（`MAX_FILE_LINES`） | 本次新文件最大 358 行 | `events.ts` 358 / `resolve-settings.ts` 302 / 测试 327 / `sqliteSchema.ts` 133 |

## 存量失败（**不是本次引入**，不得被算到本次头上）

| 用例 | 现象 | 判定依据 |
|---|---|---|
| `tests/application/repository.test.ts` → `RandomIdFactory：前缀与 6 位 hex 格式` | 断言 `REQ-[0-9a-f]{6}`，实际得到 `REQ-261004170300-6a37` | 需求 ID 已改时间戳式（仓库根有 `CHANGELOG-req-id-timestamp.md`），该用例未同步；本次改动不涉及 `RandomIdFactory` 与 ID 生成 |

## 本需求自己的验收命令（逐卡对照）

```
npx vitest run tests/reqboard/settings-file.test.ts      # t1（已建，25 用例全绿）
npx vitest run tests/reqboard/settings-init.test.ts      # t2 / t5
npx vitest run tests/reqboard/store-contract.test.ts     # t3 / t4
npx vitest run tests/reqboard/migration-gate.test.ts     # t5
npx vitest run tests/dive-round-state.test.ts            # t6
npx vitest run tests/reqboard/pending-confirm-consume.test.ts  # t7
npx vitest run tests/reqboard/settings-router.test.ts    # t8
npx vitest run tests/reqboard/sqlite-migrate.test.ts     # t9
npx vitest run tests/reqboard/settings-migrate-dispatch.test.ts # t10
npx vitest run tests/client                              # t11–t14
npx vitest run tests/reqboard/settings-e2e.test.ts       # t15
```

**通过判据（2026-10-04 修订：主判据改为「本卡碰过的文件零新增错误」）**：

- 上述命令退出码 0；
- **`tsc`：本卡碰过的文件零新增错误**（主判据）。全局计数只作参考——它是**移动靶**：同一时段实测到过 146 与 148 两个值，
  差异来自其它会话/并行卡在同一工作区的在途改动（已核：某卡碰过的 5 个文件对错误贡献为 0，而全局数在两次测量之间自己变了）。
  拿全局数当判据，会让后续卡替别人的在途改动背锅，也可能掩盖真正的新增。
- **`tests/reqboard tests/application tests/http`：失败数 ≤ 1**，且那 1 条必须仍是上表那条存量。
  实测当前值：**492 通过 / 1 失败**（该集合随本需求新增用例增长；失败项仍是 `tests/application/repository.test.ts` 的 ID 格式漂移）。

## 全量套件口径（t1 补测，2026-10-04）

`pnpm test`（全仓 394 个文件 / 4161 条用例）实测：

| 指标 | 实测值 |
|---|---|
| 失败文件 | 46 / 394 |
| 失败用例 | 96 / 4161 |
| 通过 | 4045 |
| 跳过 | 20 |

**这 96 条与本次改动无关——用符号级证据证明，而不是靠"看起来不像"**：

1. 46 个失败文件里，**引用本次新增符号的为 0 个**（逐个 grep：`resolveRunSettings` / `SettingsStore` / `SystemRecordStore` / `SETTINGS_STORE_ERROR` / `staleSqliteReason` / `emptySystemRecord` / `appendEvent` / `sqliteSchema` / `SQLITE_SCHEMA_VERSION` / `stageMaxRoundsMin`）。
2. 失败文件里只有 `tests/ask-confirm.test.ts` 依赖本次改过的 `envelope`/`limits`；查其断言——它挂在提示词文案（`ask_user_question` 相关），**全文不验 HTTP 状态码**，与映射表重构无关。
3. 失败主题集中在其它窗口的在途工作（ask-confirm 文案、decompose 工具、capture 提示词、design 门禁、create 文档位置）。

**⚠️ 如实声明**：全量套件的**改动前基线没有测过**（开工时只测了相关三目录），因此这里不能声称"≤ 基线"。
能证明的更强命题是：**失败集合与本次改动无交集**（第 1、2 条）。后续卡的判据统一为：
`pnpm test` 的失败集合**不得包含引用本需求新增符号的用例**，且失败数 ≤ 96。


---

# 收口实测（t15，2026-10-04）

## 一、端到端：三条真链条（`tests/reqboard/settings-e2e.test.ts`，3 用例全绿）

| # | 链条 | 断言要点 |
|---|---|---|
| E2E-1 | 设置文件 → 快照 → 真驱动当拍停手 | `implementing=5` 时 `roundsInStage=5` **本拍停手**：未起轮、状态 `paused`、原因 `round-limit:implementing`、人的意图仍 `armed`、留痕含**「上限=5」而非「上限=1000」**、评论含「达上限 5 回合」；把上限放宽到 10 后**照常起轮** |
| E2E-2 | 真迁移脚本 → 真库 → 设置指向 → 重启装配 | 库内 `id` 集合与分片**逐条相等**；设置文件写入 `storage.backend=sqlite`；重启前路由如实报「目标 sqlite / 生效 json / 待重启」；重启后 `assembleStorage` 选中的是库且**从库里读回同样 3 条** |
| E2E-3 | 选了 sqlite 但没迁移就重启 | 装配 `ok:false`、码 `REQBOARD_REQUIRES_SQLITE_MIGRATION`、指引含 `migrate-ledger-to-sqlite.ts`；同一失败经 HTTP 信封 → **503**，响应**没有 `data`**（不返回空册） |

## 二、⚠️ 端到端**抓出并修掉**一个真缺陷（E2E-3 是它的第一条证据）

**现象**：设置文件里写 `storage.backend=sqlite`，**重启也不生效**——装配永远按 json 起。

**根因**：`FileSettingsStore` 构造期**刻意不读盘**（只算"没有文件"的默认值），而 `assembleStorage` 是**同步**的
（`apply()` 不是 async），它在构造后**立刻**读 `snapshot()` 决定后端——那份快照还没等到随后的异步 `refresh()`。
于是"切库后重启生效"这句承诺当场落空；同理，**启动那一刻的阶段上限也读不到设置文件里的值**。

**为什么前面每张卡的测试都没抓到**：t2 测的是适配器自身的读盘（会 `await refresh()`）；
t5 测的是 `preflightLedger({backend:'sqlite'})`——**后端是直接传进去的**，从没走过"从设置文件里读出来后端"这一步。
每张卡都绿，接起来是断的。**这正是端到端测试存在的理由。**

**修法**（`FileSettingsStore`）：构造期改为**同步读一次盘**（`readParsedSync`）灌初值；
读失败一律按"无文件"处理**而不抛**（构造期抛错会拿"设置文件写坏"惩罚所有人，告警交给随后的 `refresh()`）。
修后 E2E-2/E2E-3 由红转绿。

**顺带修掉的两处交付级类型说谎（都是本次实测发现的）**：

| 位置 | 问题 | 修法 |
|---|---|---|
| `src/client/settings/types.ts` | `StorageActionTicket.expiresAt` 声明为 `string`，**服务端回的是 `number`（毫秒时间戳）** | 改为 `number` 并注明理由（前端若当 ISO 字符串处理会当场炸） |
| `tests/settings-dialog.test.ts` / `tests/settings-storage.test.ts` | t12/t13 把宿主动作集从 4 个扩到 13 个、票据类型加了 `action`，**测试夹具没跟上**（运行时绿、类型报错） | 补 `hostActions()` 工厂与票据字段；两文件恢复零错误 |

## 三、反向演练实测（三条，逐条"红 → 恢复 → 绿"）

> 纪律：只做**手工精确编辑 + 手工恢复**，未使用 `git checkout/stash/restore`（工作区压着其它窗口数百个未提交改动）。
> 每条演练前后各跑一次目标用例；恢复后复核 `grep` 无残留标记。

| 演练 | 临时改什么 | 实测结果 | 恢复后 |
|---|---|---|---|
| **A** 迁移失败不伤源数据 | `migrate-ledger-to-sqlite.ts` 的 `cleanupStaging()` 首行插 `return`（禁清理分支） | **红**：`注入校验不过 → …暂存库已清` 失败，`expected [ …(3) ] to deeply equal []`——残留恰为**暂存库 + wal + shm 三个文件** | 11/11 全绿 |
| **B** 设置来源优先级 | `resolve-settings.ts` 把 `config` 提到 `settings` 之前 | **红 2 条**：`设置文件 > 插件配置 > …`（值变 700 而非 800）、`非法值作废并沿链下探` | 27/27 全绿 |
| **C** 票据的否定作答 | `PendingConfirmRegistry.consume` 注释掉 `confirmed !== true → denied` | **红 2 条**（两条 `denied` 用例）；**同时路由层 34 条仍全绿**——证明两道防线**各自独立**，删一道另一道仍挡得住 | 10/10 全绿 |

演练 C 的副产品是本次最有说服力的一条证据：**两道防线不是重复劳动**，而是"删掉任一道，对应层的用例必红、另一层照常工作"。

## 四、收口数字

| 指标 | 基线 | 收口实测 | 判定 |
|---|---|---|---|
| 类型检查（全局） | 146 | **146** | ✅ 持平（本需求文件**零错误**，逐文件 grep 为空） |
| `tests/reqboard tests/application tests/http` | 1 失败 / 492 通过 | **1 失败 / 564 通过** | ✅ 失败数持平，唯一失败仍是存量 ID 格式漂移 |
| 全量套件 | 46 文件 / 96 用例失败 | **47 文件 / 97 用例失败** | ⚠️ **多 1，已定位且与本需求无关**（见下） |

**多出来的那 1 条，符号级归因**：`tests/project-scope.test.ts > 每个工作区相对写盘点都在受保护列表…`，
报的违规点是 `application/use-cases/EnsureKnowledgeLayer.ts:169`。证据：
① 该文件在 `git status` 里是 **`??` 未跟踪**（另一个窗口**正在新建**）；
② 本需求文档全文 **0 次**提到 `EnsureKnowledgeLayer`；
③ 本需求四张表（设置 / 存储 / 上限 / 客户端）与"知识层"无任何交集。
即：**仓库级静态扫描被别的窗口的新文件触发**，不是本需求让事情变坏。

另：此前实测到的 4 个 `tests/dive-*.test.ts` 类型错误与本需求**无关**（逐文件 grep：它们**零引用**本需求符号）；
`src/index.ts` 那 1 条 `ctx.emit` 重载错误在 **HEAD 版同处已存在**（`git show HEAD:src/index.ts` 第 158 行即有该调用），属存量。
