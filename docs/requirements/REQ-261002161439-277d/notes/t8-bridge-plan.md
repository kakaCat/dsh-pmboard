---
req: REQ-261002161439-277d
kind: notes
title: t8 方案变更——一次性原子切换改为「临时桥 + 分批搬迁」
---

# t8 方案变更：临时桥 + 分批搬迁（替代卡上原文的「一次性原子切换」）

> 卡 `t-912d82` 原文写的是**一次性原子切换 + 不做兼容壳**。本文件是**方案变更申请**，
> 待人工批准后才动代码。批准口径：`reqboard_ask_confirm(target=plan)`。

## 1. 为什么要改（三条实测依据，非推测）

1. **规模**：本卡要动的是 97 处 `snapshot()` 读点（A–G 七类）+ 98 处 `.mutate(` 写点
   + 41 处测试构造点，横跨约 100 个文件（`JsonLedgerRepository` 在 src 下被 15 个文件引用）。
2. **上一窗口实测结论**（台账断点原文，`interruption.reason`）：
   「上下文预算耗尽，t8 未执行代码改动……一旦开始仓库在改完前不可编译，无法安全分片。
   本回合只交付了机械生成的切换清单……代码零改动、树保持常绿。」——上一个窗口**零产出**。
3. **原方案的两个硬约束互相矛盾**：① 「从开始到结束不可编译」⇒ 无法编译即无法验证，
   每改一步都是盲改；② 本仓会因为**上下文压缩**把工作切成多回合，而每一次交棒都要求
   「交棒后新窗口可续跑」——不可编译的树**无法交棒**（新窗口连"改到哪了"都验不出来）。

结论：**"可分批"不是可选优化，而是本卡能被完成的必要条件。**

## 2. 桥的形态（旧端口形状 · 架在新 Store 上）

新增 `src/adapters/LegacyRepoSyncBridge.ts`（**≤400 行**，超了按职责拆两个文件，不加白名单）：

| 旧端口成员 | 桥的实现 |
|-----------|---------|
| `snapshot(): LedgerView`（**同步**） | 由**内存镜像**提供。镜像是"整册视图"的最后一处存在——它的唯一职责是让尚未搬走的读点继续拿到同步视图 |
| `read<T>(fn)` | 直接对镜像执行（语义不变） |
| `mutate(reason, fn)`（**整册**） | 镜像克隆 → 跑 `fn` → 与镜像 diff → 逐条变化调 `store.mutate(id, …)`／新增调 `store.create(…)` → 用返回的 `MutateResult` **同步回填镜像** → 返回旧形 `LedgerMutateResult` |
| `replaceAll(reason, next)` | 转 `store.replaceAll` + 重灌镜像 |

镜像生命周期（**三条纪律，缺一条就会退化成"静默空台账"**）：

1. **启动期显式就绪**：`await bridge.ready()`（`listSummaries({scope:'all'})` + 逐条 `get`）在组合根
   装配时完成，**不在首个请求里懒建**——懒建会让早到的同步 `snapshot()` 拿到空册。
2. **未就绪即抛**：`ready()` 之前调 `snapshot()` **抛错**（响亮），不返回空册。
   这是 `JsonLedgerRepository.load` 头部那条教训的同款：空册是"600 条任务消失"的形态。
3. **写后同步回填 + 订阅兜底**：写路径用返回体同步回填（保证 read-your-writes）；
   `store.subscribe()` 作为外部变更的兜底刷新。

**桥是临时物**：它的存在期限 = 从 B0 到 B12，B12 必须删净（验收①/⑤ 的 grep 就是这条的机器判据）。

## 3. 分批（每批 = 一个模块或一类读点；每批结束树必须绿）

**每批结束的门**（与卡上「执行纪律」一致）：
`npx tsc --noEmit` 错误数 ≤ **187** 且 `pnpm test` 失败数 ≤ **99**（基线见 §4），
并把进度追加进 `notes/t8-progress.md`（改了哪些文件 / 哪些类已完成 / 下一批是什么）。

- [ ] **B0 桥落地 + 装配 + 迁移门**
      新增 `LegacyRepoSyncBridge.ts`；`UseCaseDeps` 增 `store`（**先可选**，避免 41 处测试一次性报错）；
      `src/index.ts` 装配 `ShardedRequirementStore` + 桥 + 在启动路径调一次
      `assertLedgerMigrated`（**验收④**）；`LEDGER_FILE` 降级为 legacy 导出常量；
      `tests/application/harness.ts` 的 `makeHarness` 同时给出 `store` 与 `repo`（桥）；
      新增 `makeTestStore()` 工厂。
      **本批不动任何调用点** ⇒ runtime 行为不变、测试应仍全绿。
- [ ] **B1 纯函数入参窄化（类 E 的前置）**：`openRequirementsFor` / `shouldCaptureWindow` /
      `draftRequirementsFor` 入参由 `LedgerView` 改为 `readonly RequirementSummary[]`
      （它们只用 `status` / `sourceSessionId`），并改其调用方。
- [ ] **B2 类 D（`.revision`，3 处）** → `(await store.head()).revision`。
- [ ] **B3 类 C（`.some`，1 处）+ 类 B（`.filter`，2 处）** → `getSummary(id) !== undefined` / `listSummaries(filter)`。
- [ ] **B4 类 A（`.find`，28 处）**，按模块分 4 子批：
      **B4a** `http/routers/**`（7 处）｜**B4b** `application/use-cases/**`（12 处）
      ｜**B4c** `application/internal/**`（6 处）｜**B4d** `application/dive/**` + `index.ts` + `tools/**`（3 处）。
- [ ] **B5 类 E（整册作为实参，16 处）** → 纯函数改收 `readonly RequirementSummary[]`，调用方 `await listSummaries`。
- [ ] **B6 类 F（整册赋给局部变量，6 处）**。
- [ ] **B7 类 G（其余 45 处，含定义处）**：`ports.ts` 删除 `ReqboardRepository` /
      `LedgerView` / `MutableLedger` / `LedgerChange` / `LedgerMutateResult`；
      结构化端口类型 `{ snapshot(): LedgerView }`（`window.ts` / `rtm-yaml.ts` /
      `boundary-guard.ts` / `verification-doc-writer.ts`）换成窄接口 `RequirementReader`。
- [ ] **B8 三处同步缝**（照 `design/backend.md` §同步口的处置）：
      `gate-wiring.ts` 提示词段 → `peekSummaries()`；`dive/session-driver.ts` +
      `boundary-guard.ts` → 纯函数收摘要、`guardToolCall` 改 await 权威读；
      `pm-capture-root.ts` 的 `onBoundWindowActivity` 内部异步化（签名不变、错误走告警不吞）；
      `h2-compact.ts` **删除同步默认值**，改组合根显式注入 `persistArtifacts`。
- [ ] **B9 client 侧 3 处读点**（`src/client/panel-refresh.ts`）——
      改 `src/client/**` ⇒ **必须 `pnpm build:client` 重建产物并过 `[verify-client]`**（C-12）。
- [ ] **B10 写点 98 处 `.mutate(` 搬迁**，按模块分批（整册 `mutate(reason, fn)` → 逐需求
      `store.mutate(id, draft => …)`；落盘分派与只追加纪律由新写侧保证）。
- [ ] **B11 41 处测试构造点**（`new JsonLedgerRepository`）→ 统一 `makeTestStore()`；
      `InMemoryRepo` 退场，`InMemoryRequirementStore implements RequirementStore` 成为唯一替身。
- [ ] **B12 删桥**：删 `LegacyRepoSyncBridge.ts` + `JsonLedgerRepository.ts` +
      `deps.repo`（109 处 `deps.repo.` 归零）；跑全部验收①–⑤。

**尺寸门禁**：本卡**新建/改写**的文件 ≤400 行（超了拆）。既有的超 400 行文件
（`shared/protocol.ts` 1939、`application/ports.ts` 978 等）是**存量**，不在本卡拆分范围——
本卡对它们只做"删旧端口"这类净减少改动。**不加白名单。**

**消息卫生**：新写的用户可见文案一律走 `src/domain/text/fmt.ts` 的 `fmt`，不用中文单引号串拼接。

## 4. 开工基线（本窗口 2026-10-02 实测，存 `/tmp/t8-base-tsc.txt`、`/tmp/t8-base-test.txt`）

| 判据 | 实测基线 | 卡上阈值 | 每批门 |
|------|---------|---------|--------|
| `npx tsc --noEmit` 错误数 | **187** | ≤223 | ≤187 |
| `pnpm test` 失败数 | **99**（3298 passed / 20 skipped / 326 文件，49 失败文件） | ≤106 | ≤99 |
| `grep -rn "snapshot()" src --include=*.ts` | **97**（client 侧 0） | 无输出 | 单调下降 |
| `grep -rn "JsonLedgerRepository\|ReqboardRepository" src` | **58** | 无输出 | 单调下降 |
| `grep -rn "\.mutate(" src` | **98** | — | — |
| `grep -rn "new JsonLedgerRepository" src tests` | **41** | — | — |

> 卡上写的基线是 187/106，本窗口实测 **187/99**——按**更严的 99** 判「无新增失败」。

## 5. 必须一并告知的操作后果（切换后宿主起不来，除非先迁移）

`src/index.ts` 一旦按设计装配（分片 Store + 迁移门），**活体宿主的数据根仍是 v9 单册**
（`~/.dsh/dsh-reqboard.json`，实测 `schemaVersion: 9`、`~/.dsh/reqboard/` 不存在）⇒
启动即抛 `REQBOARD_REQUIRES_MIGRATION`，13 个 `reqboard_*` 工具与看板路由全部不注册。
这正是**验收④要的行为**（绝不静默起空台账），但它是**真实副作用**：

- 切换落地后若要继续用活体宿主，必须先跑
  `node --import tsx/esm scripts/migrate-ledger-v10.ts --file ~/.dsh/dsh-reqboard.json --apply`；
- 再 `pnpm build` 重建 `dist/`（活体宿主跑的是 `dist/index.mjs`，不是 `src/`）并重载插件；
- t8 完成后、跑迁移之前，**不要**重载 pmboard 插件。

## 7. 修订记录（2026-10-02 · 收编交棒窗口的只读复核）

> 复核来源：`notes/t8-plan-review.md`（`session-8c9338a3-…` 出具）。逐条核验与限定见
> `notes/t8-progress.md` §8。**批准的前提是"临时桥分批"这一路线，下列修订不改变路线。**

- [ ] **删除 B9**：client 那 3 处是**同名本地函数**，已于 17:52 改名并重建产物；
      实测 `grep -rn 'deps.repo|.snapshot(|RequirementReader' src/client` **为空** ⇒ 无活可干。
- [ ] **B7 改为"使用现有的 `RequirementReader`"**：它已存在（`ports.ts:290`，
      `RequirementStore extends RequirementReader`），不是新建。
- [ ] **两处路径更正**：`src/gate-wiring.ts`（**无** `wiring/`）、
      `src/application/gate/handlers/h2-compact.ts`（**不在** `internal/`）。
- [ ] **B11 必须处理第二份测试替身**：`tests/queue/v9-harness.ts` 自带 `InMemoryRepo`
      （不只是 `tests/application/harness.ts`）。
- [ ] **B0b 必须一并修 `known-defects.md` §7.2**：`ShardedRequirementStore.ts:263` 的
      `notify` 把订阅帧 `revision` 写成占位 `0`——B0 正是接 `subscribe()` 的那一批，别让它活到切换结束。
- [ ] **B1 的措辞更正**：复核称那三个纯函数"只读 `.id/.sourceSessionId/.status`"——**与代码不符**，
      `window.ts:17,31,48` 还读 `ledger.triages`。按已裁定的 triage 口径（承认移除该锚点路径），
      窄化仍可行，但 B1 必须**显式删除**那两处 triage 分支并注明，不能只改类型。

## 6. 批准判据（**2026-10-02 已获人工批准**，故已勾选）

- [x] 接受「临时桥」这一中间形态，且**最终必须删净**（B12 + 验收①/⑤ 双 grep 兜底）；
- [x] 接受分批顺序 B0→B12，以及「每批结束 tsc ≤187 且 test ≤99」的每批门；
- [x] 接受 §5 的操作后果（切换后需先迁移 + 重建 dist 才能恢复活体宿主）。
- [x] 追加裁定（同日）：triage 锚点路径**承认移除**（不改契约）——见 `t8-progress.md` §6.3；
      以及启动就绪处理与测试夹具两条设计选择——见 `t8-progress.md` §7 决定 A / 决定 B。
