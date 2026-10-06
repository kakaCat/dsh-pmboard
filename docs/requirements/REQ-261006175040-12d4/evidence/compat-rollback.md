# 兼容与回滚收口（REQ-261006175040-12d4 · t10 / FR-6、FR-7 · D-6）

交付前把三件事做成可复核读数：**旧服务端形态的降级**、**回滚怎么做与做完看什么**、**构建/类型/基线现状**。
本文件只放读数与命令，结论一句话写在每节末尾。

## 1. 演练①：旧服务端形态（摘要不带读数）⇒ 页面降级，不说谎

取**改动前**真实抓下的 `/state` 载荷（`/tmp/pmstate-before.json`，60 条需求、0 条含 `gates` ——
正是旧服务端的形状），把三个读数键删掉后喂**真实渲染器**（`buildBoard`，非 mock）：

```
需求数 = 60
整页：✗ 出现次数 = 0 · 产物 0/6 = 0 · 门 0/4 = 0
目标需求单卡：chips 行 = 0 · 派生行 = 0 · 确认按钮 = 0
目标需求单卡仍有标题 = true
```

⇒ 旧服务端 + 新客户端：门相关块整块不渲染，**既不显示红 ✗，也不显示旧口径 `产物 0/6`**，
卡片其余部分照常（不是白卡）。这就是 FR-6 要的降级形态。

## 2. 演练②：回滚方向的**危险侧**（只回滚客户端）

反方向不是"更安全"，而是**旧谎报复活**：新服务端（摘要带 `gates`）+ 旧客户端（就地读 `req.artifacts`）
= 四门恒红 + `产物 0/6` + 按钮永不出现（本次缺陷原形）。
证据：`evidence/inverse-verification.md` 的「逆验证 ①」——把读侧改回 `req.artifacts`，跨缝用例 4/4 全红。

⇒ **回滚必须两侧同时做**（服务端摘要 + 客户端渲染 + 重建 bundle），单侧回滚两种方向都有代价：
只回客户端 = 谎报复活；只回服务端 = 页面降级（不可怕，但门读数消失）。

## 3. 回滚步骤（照此执行，判据可跑）

```bash
# ① 回滚源码（本次改动共 12 个文件，按目录分组回滚）
git checkout -- \
  src/domain/artifact/GateReadings.ts src/domain/requirement/RequirementSummary.ts src/shared/board-summary.ts \
  src/repositories/ShardedRequirementStore.ts src/repositories/ShardedRequirementWriter.ts \
  src/repositories/SqliteRequirementStore.ts src/repositories/RequirementShardRepository.ts \
  src/client/render/gate-view.ts src/client/views/artifacts.ts src/client/views/verification.ts \
  src/client/views/board.ts src/client/types.ts
# （新增文件用 git clean 或手动删；测试与脚本同理回滚）
# ② 重建客户端 bundle —— 少了这一步，页面还是新代码
pnpm build:client
# ③ 判据：bundle 校验通过 + 全量基线失败集合回到基线
pnpm baseline:check
```

**台账零改动**：本次不写任何业务数据、不动 schema、无迁移脚本，故回滚不需要数据修复
（判据：`~/.dsh/reqboard/requirements/*/{record,artifacts,plan,verification,archive}.json`
在本需求实施前后应逐字节不变——本次只读它们）。

## 4. 构建 / 类型 / 基线读数（收口时刻）

| 判据 | 命令 | 读数 | 结论 |
|---|---|---|---|
| 客户端 bundle | `pnpm build:client` | `[verify-client] OK  bundle=712353 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整` | ✅ |
| 类型检查 | `pnpm typecheck` | 仅剩 1 条**外部**错：`src/client/views/panels/verify.ts(36,41) TS2307` 引 vendor 相对深度（属 REQ-261006130057-7a43 在飞改动，本窗口不越界改） | ⚠️ 外部 |
| 全量基线 | `pnpm baseline:check` | 见 §5 | ⚠️ 见 §5 |

## 5. 基线：本次引入的失败已清零，其余逐条归属外部

跑了**两轮**基线（第二轮在修完下述回归之后）：

- 第一轮（t1 的测试子卡时）：新增 6 条失败，全落在别的窗口在飞的文件里；
- 第二轮（本卡收口时）：新增失败清单里**已经不含**本需求涉及的任何测试文件
  （`gate-readings` / `domain-summary` / `card-face` / `card-face-summary-shape` /
  `state-no-bigfield-read` / `store-contract` / `state-payload-client` / `stage-panel` 全部不在清单上）。

期间**抓到并修掉一条真属本次的回归**（这正是 C-14 基线门禁的价值）：

| 失败用例 | 归属 | 处置 |
|---|---|---|
| `tests/stage-panel.test.ts` → `renderConfirmButton：kind=design 成组确认文案` | **本次**：t6 把卡面改成读 `gates` 后，该用例仍用全量记录夹具（读 `req.artifacts`）——旧契约 | **已按新契约重写**（夹具改摘要形状），`tests/stage-panel.test.ts` 61 passed；第二轮基线已不含它 |

第二轮基线里**剩余的新增失败全部指向其他需求在飞的改动**（本窗口不越界改，交由人处置）：

| 失败用例 | 指向 |
|---|---|
| `tests/report-tabs.test.ts`（2 条：验收面板占位 / 三态取数） | REQ-261006130057-7a43 的验收面板在飞 |
| `tests/typecheck.test.ts`（1 条：tsc 0 错） | 同上的 vendor 相对路径错 |
| `tests/tools-dispatch.test.ts`（1 条：ask_confirm evidence 路径分派） | 另一窗口的工具面改造 |
| `tests/kb-generate.test.ts`（1 条：code map 抽口径） | 知识层生成物漂移 |
| `tests/live-tasks-single-source.test.ts`（2 条：手写判定 baseline 双向断言） | `views/report-head.ts` 的在飞改动 |
| `tests/prompt-tiers.test.ts`（1 条：decomposing light/heavy 分化） | 提示词片段在飞改动 |
| `tests/reqboard/settings-init.test.ts`（1 条，标注「顺序相关？单独跑 17 passed」） | 套件内污染，非本次 |

**一句话结论**：本次引入的失败为 **0**（唯一一条已修好并复跑全绿）；剩余红全部指向其他需求在飞的改动。

## 6. 本卡验收标准的逐条交代（**含不达标项**）

| 验收项 | 结果 | 说明 |
|---|---|---|
| ① 旧服务端形态下降级不说谎 | ✅ | 见 §1（真实 60 条载荷、0 处 ✗ / 产物 0/6 / 门 0/4） |
| ② `pnpm build:client` → `[verify-client] OK` | ✅ | 见 §4 |
| ③ `pnpm typecheck` 退出码 0 **且** `pnpm baseline:check` 差集为空 | ❌ **未达标（外部原因）** | typecheck 剩 1 条外部错（vendor 路径）；基线差集非空但**新增失败里没有本次涉及的测试文件**（§5）。按纪律**不掩饰、不 refresh 基线**（refresh = 承认现状，会把别人的红也吞掉） |
| ④ 回滚演练证据入本文件 | ✅ | 见 §1 / §2 / §3（含"只回滚客户端 = 旧谎报复活"的危险侧） |
