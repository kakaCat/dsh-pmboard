---
serves: FR-1, FR-2
---

# 接口设计 · REQ-261001203710-0fbf <!-- serves: FR-1, FR-2 -->

> 一句话：新增两个**纯函数**作为分区与解析的唯一口径；已有函数只改语义（逐记录解析），不改端口形状。

## TL;DR <!-- serves: FR-1 -->

对外工具入参与返回体**基本不变**（只**新增**一个可观测字段 `usedProjectRoot`）；变化集中在两处内部接缝：**分区**（记录集按项目过滤）与**解析**（路径按记录自己的项目）。

## 新增内部接口（唯一口径） <!-- serves: FR-1 -->

```
projectRootOf(record: { workspaceRoot?: string }, fallback: string): { root: string; attributed: boolean }
```
- `record.workspaceRoot` 非空 → `{ root: 它, attributed: true }`。
- 空/缺失 → `{ root: fallback, attributed: false }`——**调用方必须把 `attributed:false` 标注出去**（评论/返回体），不得静默当成当前项目。
- 纯函数、零 IO、不读 `process.cwd()`（与既有 `resolveWorkspaceRoot` 同风格）。

```
partitionByProject<T extends { workspaceRoot?: string }>(
  records: readonly T[], projectRoot: string, fallback: string,
): { mine: T[]; others: T[]; unattributed: T[] }
```
- `mine` = 属于本次项目；`others` = 属于别的项目（**跳过并计数**）；`unattributed` = 无项目字段（按 `fallback` 处理并标注）。
- 纯函数：调用方决定「跳过并回报」还是「拒绝」。

## 语义变更（不改形参形状） <!-- serves: FR-2 -->

| 函数 | 变更 |
|---|---|
| `syncAllReqArtifacts(store, cwd)` | 不再 `snapshot.requirements.map(r => r.id)` 全量遍历；改为逐记录 `projectRootOf(r, cwd)` → 只扫属于该根（或未归属按 cwd）的记录。**返回值**扩展为 `{ scanned: number; skipped: number }`（旧调用点忽略额外字段即可，保持向后兼容） |
| `landPlanTasks(deps, …)` | 落盘前：`const { root } = projectRootOf(req, deps.docs.workspaceRoot())`；若 `root !== req.workspaceRoot` → 抛 `REQBOARD_PROJECT_ROOT_MISMATCH`（文案给两个绝对路径） |
| 立项建档（capture / create） | 同上校验；返回体新增 `usedProjectRoot` |
| RTM 写入 | 按 `projectRootOf` 解析，不再依赖共享根指针的当前值 |
| kb 检索读 | 按**当前项目根**解析；文件不存在时区分两种病因（见下） |

## 错误语义 <!-- serves: FR-2 -->

| 码 | 触发 | 文案要点（必须给可执行信息） |
|---|---|---|
| `REQBOARD_PROJECT_ROOT_MISMATCH` | 解析出的根 ≠ 记录声明的 `workspaceRoot`，且操作会写入 | 同时打印「记录声明的根」与「实际会写的根」两个绝对路径 + 修复建议（检查该需求 `workspaceRoot` 或调用上下文） |
| 知识层两种病因（沿用统一信封，不新增枚举） | ① 本项目确实没生成索引；② 空间错配导致读不到 | ① 报「本项目知识层未生成」+ 解析出的项目根 + `npx tsx scripts/kb-build.mts --write`；② 报「项目根与索引位置不一致」+ 两个路径。**禁止**再统一报「未初始化」 |

**兼容性**：`syncAllReqArtifacts` 的返回体由 `number` 变为对象——需同步其唯一调用点（`src/http/routers/stages.ts`）；对 `.catch(() => {})` 的容错语义不变（扫描失败仍不阻断看板）。

## 可观测性契约（新增） <!-- serves: FR-2 -->

- 立项 / 落库成功返回体新增 `usedProjectRoot`（绝对路径，字符串）。
- 落库评论追加一行：`[项目根] 本次写入根=<abs>`（人能在台账里看到"东西写哪了"）。
- 未归属记录被处理时，返回体/评论标注 `attributed: false` + 「该记录无 workspaceRoot，按 <fallback> 处理」。

## 数据契约 <!-- serves: FR-1 -->

- **不新增字段**：分区键用既有 `RequirementRecord.workspaceRoot`；不改台账文件格式与 `schemaVersion`。
- **不新增端口**：不引入「每项目一个仓储」；`DocRepository` / `QueueRepository` 形状不变。
- **兼容**：无 `workspaceRoot` 的老记录（本机 3 条）按 `fallback` 处理 + 标注，行为对使用者可见但与修复前不同（修复前是静默当成当前项目）。

## 验收口径（引规范条目） <!-- serves: FR-2 -->

| 规范条目 | 本设计如何满足 |
|---|---|
| C-08 验收标准必须可执行 | 本需求每条 FR 的验收都挂 `npx vitest run tests/project-scope.test.ts` 与断言内容 |
| C-14 提交前必须跑测试并与基线比对 | 实施时先在当前 HEAD 实测基线再比对。**注**：规范页记录的基线（106 failed / 2807 passed）已陈旧，实测为 97 failed / 2880 passed；本需求按实测基线比对，并把该漂移如实记入验收材料 |
| C-15 改了源码必须跑类型检查 | 规范页记录 223 个错误同样陈旧，实测 192；按实测基线比对，改动文件零新增错误 |
