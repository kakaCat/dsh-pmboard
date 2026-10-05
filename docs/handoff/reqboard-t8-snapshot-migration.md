---
title: reqboard 单册读点迁移交接（t8 / t-912d82）
kind: handoff
req: REQ-261002161439-277d
task: t-912d82
updated: 第 403 回合（阶段①-a 第一片）
---

# 交接：reqboard 单册读点迁移（REQ-261002161439-277d / 任务卡 t-912d82）

> 本文件是**短入口**（2 页）。完整台账与逐轮记录见
> `docs/requirements/REQ-261002161439-277d/notes/t8-progress.md`（1 万行，其 START HERE 顶部有终态摘要）。
> **端口形状批（B12 第四批）已落地且复核通过** —— 详见
> `design/b12-bridge-removal.md` §十五（落地）与 §十六（独立复核）⇒ **不要再重放 §十 / §十四**。

## 一、现在在哪

| 判据 | 实测（第 403 回合核验） |
|------|--------------------------|
| `snapshot()` 在 `src` | **27**（注释 16 / **代码 11**；阶段①-a **已收尾**，剩余全是删桥本体/镜像态，见 §二十三） |
| `npx tsc --noEmit` | **173**（验收上限 223 ✓；还清 domain/template 的 13 条桩类型红，新增 0）——比集合前**先归一化行号**，否则必填端口改动的行移会被误读成回归 |
| `pnpm test` | **98 failed / 3350 passed**（= 基线；失败集与改前逐条相同，新增 0） |
| 验收 ①–⑤ | **②③④ 已过**；①⑤ 差 B12 剩余部分（**下一步是删桥**，不是继续搬读点） |

## 二、已落地各批（每批都过"三件套门"）

| 批次 | 结果 |
|------|------|
| `pending-guard` | 70 → 69（`livePendingConfirm` / `assertNoPendingConfirm` 改 async ✓） |
| `agent-handle` | 69 → 68（`ensureAgentHandle` 改 async ✓） |
| `verification-doc-writer` | 68 → **66**（给 `RouterCtx` 加可选 `requireStore` + `routes.ts` 条件透传 ✓） |
| `requirements.ts` 7 处 | 66 → **59**（`store.snapshot().requirements.find(...)` ⇒ `await ctx.requireStore?.get(id)` ✓） |
| `tasks.ts` 1 处 | 59 → **58**（存在性检查 ⇒ `(await ctx.requireStore?.get(id)) === undefined` ✓） |
| RTM 三处 | 58 → **55**（`{ requirements: (await ctx.requireStore?.listSummaries({ scope: 'all' }))?.items as never }` ✓） |
| `AdvanceChain:197` | 55 → **54**（顺带修好一条基线红 ✓） |
| 后续批次（第 398–402 回合） | 54 → **43**（A 类三处 QueryStageOverview/ExecuteTask/QueryStageDetail 等） |
| **端口形状批（B12 第四批）** | **43 → 41** ✓（`IsolateNodeContext` / `h2-compact` / `node-settlement` / `gate-wiring` + `index.ts` 两处装配 + 两个测试夹具；第 402 回合落地、第 403 回合独立复核，见设计文档 §十五/§十六） |

## 三、剩余 41 处的**迁移判据**（本会话提炼）

一处理点能否迁移，只看三件事：

1. 它读的是**记录/摘要字段**（可迁 ✓）还是**镜像独有状态**（不可 ✗）——
   例：`AdvanceState` 的 `lockAt`/`runId` 在 `src/shared/protocol.ts:963`，**不在** `RequirementRecord` 里 ✗。
2. 它要的字段在**摘要**里吗？—— `autoRun` **不在** `RequirementSummary` 里 ✗ ⇒ 列表类读点要么逐个 `get`，要么加 `listRecords`。
3. 函数是否 `async` / 调用者是否**同步回调**（决定要不要级联 ✗）。

## 四、剩余工作的三个入口（各自需一次决定）

1. **`listTriages`**（**人已批准** ✓）→ 解锁 **B8 第一批**（`boundary-guard` / `session-driver` / `pm-capture-root`）+ **`verdicts.ts` 两处草稿**（`:55`/`:198` 要 `snapshot.triages`）+ 可能更多。
   **唯一阻碍**：实现方在 `src/adapters/**`（`bridgeSupport.ts` / `LegacyRepoSyncBridge.ts`），该目录**正被别的窗口编辑**（`git diff --stat src/adapters/` 显示 8 files changed）⇒ 按归属约定**不能碰** ⇒ **等它空闲或与其协同**。
2. **`listRecords`**（接口扩展 ✗）→ 解锁列表/整册类站点 ⇒ **需裁决**。
3. **B12**（删桥）→ 清 `LegacyRepoSyncBridge` 7 处 + `ports.ts` 6 处 ⇒ **须先清完读点**。

另：`round-driver` 人已裁决**挂起**（同步 handler × 按需实时读 × async store 三者不可同真 ✗）。
`index.ts:349` 是 t8 阶段**人工裁定的例外**（注释在 `:343`）⇒ **不要改** ✗，删桥时重新裁定。

## 五、方法（本会话用多次翻车换来）

**三件套门**（缺一不可）：
1. **应用校验**——脚本执行成功 + 特征改动落盘 + 指标按预期变化（否则"改前=改后"会让两个门都假绿 ✗）；
2. **类型门**——`tsc` 与**当场 before 集合**做 `comm`（不可用总数，基线会漂移 ✗）；
3. **测试门**——全量失败集与基线做 `comm`，新增必须 0（**类型对 ≠ 行为对** ✗）。

**外加还原后三项核验**：关键行回到原状 / `tsc` 回到 before / `snapshot()` 回到 before（因为 `AUTO-REVERTED` 曾经是**假的** ✗）。

**其他易错点**：守卫只查 import 行（`/^import .*X/m`；查全段会被自己插入的文本骗过 ✗）；`s.split(a).join(b)` 顺序（数组才 `join` ✓）；改前**读目标行上方注释**（本仓注释常写既往裁决 ✗）。
