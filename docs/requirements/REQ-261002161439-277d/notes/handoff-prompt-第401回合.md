# 投递新窗口的提示词（复制下面整段）

---
继续执行需求 REQ-261002161439-277d（任务卡 t-912d82）的 B12「端口形状批」。

**仓库**：/Users/mac/Documents/ai/dsh/dsh-pmboard
**任务来源**：开工时先 `reqboard_task_move(task_id='t-912d82', to='in_progress')` 取任务卡全文，照卡执行。
**当前状态（上一窗口实测，可直接复核）**：
  `grep -rn 'snapshot()' src --include=*.ts | wc -l`  => **43**
  `npx tsc --noEmit | grep -c 'error TS'`            => **186**（基线，勿超）
  `pnpm test`                                        => **98 failed / 3350 passed**（基线；**新增必须 0**）

## 只做一件事：按设计文档 §14.4 执行（零未知）

**设计文档（必读，含全部坐标与前四次实测记录）**：
  `docs/requirements/REQ-261002161439-277d/design/b12-bridge-removal.md`
  重点看 **§十（12 步清单）** 与 **§十四（最终坐标与写法）**；历史陷阱见 §十一~§十三。
**逐轮台账（背景）**：`docs/requirements/REQ-261002161439-277d/notes/t8-progress.md`
**短入口**：`docs/handoff/reqboard-t8-snapshot-migration.md`

### 执行清单（逐字照做；src 侧已被前四次独立复现验证）

1) **重放 §十 第 1–9 步**：改 4 个 src 文件
   - `src/application/use-cases/IsolateNodeContext.ts`：`IsolateNodeContextDeps` 加 `store: RequirementStore`；
     `pickRequirement` 改 async、形参换成 store、内部改 `await store.get(explicitId)` 与
     `await openRequirementsForVia(store, windowKey)`；调用处 `await pickRequirement(deps.store, …)`
   - `src/application/gate/handlers/h2-compact.ts`：`H2CompactDeps` 加 `store: RequirementStore`；
     `persistArtifacts` 改**必填**、删掉 `?? ((): number => deps.repo.snapshot().revision)` 这段同步默认值；
     构造 `IsolateNodeContextDeps` 时补 `store: deps.store`
   - `src/application/internal/node-settlement.ts`：构造处补 `store: deps.store as RequirementStore`
   - `src/gate-wiring.ts`：两个 deps 接口各加 `requirementStore: RequirementStore`；
     `createH2CompactHandler({ store: deps.requirementStore, persistArtifacts: async () => (await deps.requirementStore.head()).revision, … })`
   => 到此 `snapshot()` 应为 **41** ✓（前四次都到这里）

2) `src/index.ts`：**两处简写对象字面量**各插一行 `requirementStore: sharded,`
   - `:446`  `disposers, store, pendingCapture, injectionLog, logger, plugin: name, address,`   ← CaptureGuidanceDeps
   - `:415`  `store, docs, clock, now, isolationTrace, injectionLog, deliverer, logger, plugin: name,` ← GateChainDeps
   - **不要**动 `:173 / :375 / :458` 那三处 `store: sharded,`（它们是 LegacyRepoSyncBridgeOptions / DiveRoundPorts / UseCaseDeps ✗）
   - 插行注意顺序：**先插行号大的（446），再插小的（415）**，否则行号会漂移

3) `tests/h2-compact.test.ts`：**11 处** `createH2CompactHandler({ … })` **逐处**补
   `store: h.deps.store!,`（**用非空断言**；不要 `as never` —— 那会变成 `store: never` 而报错）
   与 `persistArtifacts: () => 0,`（对象形态不止一种，正则只补到 1/11 处）

4) `tests/isolate-node-context.test.ts`：deps 形态是
   `{ repo: h.repo, docs: h.docs, clock: h.clock, taskStore: h.taskStore, isolation: iso }`
   （多行调用）=> 补 `store: h.deps.store!`

5) 双门收尾 => 预期 `snapshot()` **41**、`tsc` **186**、全量 = 基线、新增 0

## 纪律（本仓铁律 + 前一窗口血泪，务必遵守）

- **改前先备份**：每个要改的文件 `cp` 到 `/tmp`；写文件**先把整串算好再 `open('w')`**
  （前一窗口曾因参数求值顺序把 `ports.ts` 截断成 0 字节）。
- **三件套门**：① 应用校验（脚本真跑了 + 特征改动落盘 + 指标按预期变）② `tsc` 与**当场 before 集合**做 `comm`
  （**不要**用总数，基线会漂移）③ 全量失败集与基线做 `comm`，**新增必须 0**。
- **还原后三项核验**：关键行回原状、`tsc` 回 before、`snapshot()` 回 before（`AUTO-REVERTED` 曾经是假的）。
- **绝不把红树留给下一次**：本批若某步不收敛 => **整批还原**（保留 43/186/基线），并把发现写进设计文档下一节。
- **锚点要用整段签名**：单行锚点常撞 2 处，脚本会中止（零写入，安全但白跑）。
- **禁止**：`git add -A`、动 `src/client/**`、跑 `pnpm build` 或迁移脚本（宿主数据根未迁移）、改 `index.ts:349` 的
  人工裁定例外（注释在 `:343`）。
- 收工前：`reqboard_task_report(task_id='t-912d82', …)` 写完工记录，再 `reqboard_task_move(task_id='t-912d82', to='done')`。

## 这批做完之后的去向

- 剩余读点只剩：**桥/端口声明 ~18 处**（B12 删桥时清）、**需人裁决的门禁格 ~8 处**（`boundary-guard`/`gate-wiring`/
  `shared`/`round-driver`，其中 `boundary-guard` 已证"同步+权威+用返回值"三条同时成立 => 结构性不可迁，见 §333）、
  `AdvanceChain` 锁耦合 3 处、`index.ts` 3 处、若干**注释**（验收 ① 的 grep 会把注释也算进去，删桥时一并清）。
- 另有**同仓别的窗口在改 `src/adapters/**`**（本会话已获授权可动，但请先 `git diff --stat src/adapters/` 确认状态）。
