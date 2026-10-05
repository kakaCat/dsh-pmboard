# 兼容口径与回滚说明（REQ-261001203710-0fbf · t6）

> 面向：验收人 / 后续维护者 / 出事时要退回来的人。
> 结论先行：**无数据迁移**（实测 0 条错根）；3 条老记录按兜底口径处理；回滚是**逐文件反向编辑**，**不要 `git checkout`**（工作区另有大量在途改动）。

## 一、老记录口径（实测，不是推测）

对 `~/.dsh/dsh-reqboard.json` 全量审计（审计时台账共 **40 条**需求）：

| 检查 | 条数 | 处置 |
|---|---|---|
| `workspaceRoot` 正确、且该根下确有 `docs/requirements/<id>/` | **36** | 无需处理 |
| **错根（目录实际在别的项目里）** | **0** | **无需数据修复** |
| **无 `workspaceRoot`** | **3** | 见下 |
| 声明根下无目录 | 1（`REQ-260930094139-2d65`，疑似从未落盘） | 不处理（不猜测它属于谁） |

无根的三条（逐字取自台账）：

```
REQ-260929184406-2084
REQ-260929195829-6e02
REQ-260929210741-30ae   ← 讽刺的是，本需求要修的「需求级根」正是它引入的
```

**这三条的兜底口径**：处理它们的操作按「调用方当前的工作区根」执行，且在结果里**标注 `attributed: false`**（见 `projectRootOf` 的返回体）。

- 为什么不是「跳过」：跳了它们就再也没人管得住；
- 为什么不是「静默当成本项目」：那正是把一个项目的东西算到另一个项目头上——本需求要根治的病；
- 所以取「**照做，但如实说这是兜底、不是它自己声明的**」。

**不做的**：不回填 `workspaceRoot`。回填需要判断每条到底属于谁，而台账里没有可靠依据——**猜出来的根比空着更危险**。

## 二、旧调用方口径

| 接口 | 变更 | 兼容处置 |
|---|---|---|
| `syncAllReqArtifacts(store, cwd)` | 返回值 `number` → `{ scanned, skipped }` | 生产唯一调用点 `stages.ts` 只 `await … .catch(()=>{})` 并丢弃返回值 → 对形状变更透明（类型检查已确认零错误）；**测试消费者** `tests/sync-artifacts.test.ts` 的断言已同步更新到新契约 |
| `capture` 回执 | 新增 `used_project_root` 字段 | 已在工具 `output.schema` 登记（本仓输出契约门要求）；前进方向不返回该键时**整体省略**，不发 `null` |
| 拆分评论 | 追加一行 `[项目根] 本次写入根=<abs>` | 评论是追加语义，老评论不受影响；核验不到根时不编造该行 |
| 需求链路 | **无新增字段、无台账格式变更、`schemaVersion` 不动** | 不需迁移、不需灰度 |

## 三、回滚说明（逐文件反向编辑）

**⚠️ 不要 `git checkout` / `git restore`**：本仓库工作区里同时有**多个窗口在途**的改动（回退机制、验收单、看板等），`checkout` 会把别人的活一起抹掉（我实测过工作区有大量 `M`/`??` 文件）。

按下列清单**逐文件反向编辑**即可（每条都对应本需求的一次真实改动）：

| 文件 | 反向做法 |
|---|---|
| `src/application/internal/support.ts` | 删 `projectRootOf` / `partitionByProject` / `sameProjectRoot` / `normalizeProjectRoot` / `isAbsoluteRoot` / `ensureWritableProjectRoot` / `assertWritableRequirementProject` 与两个契约常量 |
| `src/adapters/ArtifactSync.ts` | `syncAllReqArtifacts` 恢复「全部 id × 同一 cwd」与返回 `number` |
| `src/application/internal/plan-landing.ts` | 删入口的守卫调用与 `[项目根]` 评论行 |
| `src/application/internal/rtm-yaml.ts` | 删 `syncRTMYaml` 内的守卫调用 |
| `src/application/use-cases/queue-access.ts` | 删 `mutateQueue` / `createManyQueue` |
| `AcceptSheet / AdoptTask / AmendTaskRefs / ExecuteTask / MoveTask / RegenerateChain / SubtaskTeamRun / Decompose / MoveRequirement` | 把 `mutateQueue(deps, X, …)` / `createManyQueue(deps, X, …)` 改回 `store.mutate(X, …)` / `store.createMany(X, …)` |
| `ReportTask / AmendTaskAcceptance / AdvanceChain / verification-doc-writer / SubmitVerification / SyncRequirementMarks` | 删写前的守卫调用与对应 import |
| `CaptureRequirement.ts` / `CreateRequirement.ts` | 把「优先取实际在用工作区」的三行回落逻辑改回 `?? process.cwd()` |
| `src/tools/CaptureTool/CaptureTool.ts` | 删 `used_project_root` 字段声明 |
| `tests/project-scope.test.ts` / `tests/sync-artifacts.test.ts` | 删除/还原（`tests/project-scope.test.ts` 是本需求新增，可直接删） |

**回滚后的期望值**（本机实测，注意基线在动）：

```
npx tsc --noEmit -p tsconfig.json   → 144 条错误（回滚后会回到「无我新增」的口径）
npx vitest run                      → 97 failed / 3638 passed / 3755 tests
```

**风险**：回滚会让「产物写进别的项目」的原症状**立刻复发**（守卫没了），且 `queue.json`/RTM 会重新跟着共享根的当前值走。故回滚只应在「守卫本身造成不可接受的误拒」时才做——目前**没有观察到任何误拒**（9 条新增守卫接入后全量失败数逐字未变）。

## 四、产物与生效

- 本需求的全部改动已**进产物**：`dist/index.mjs` 内含 `REQBOARD_PROJECT_ROOT_MISMATCH`(×2) / `ensureWritableProjectRoot`(×9) / `mutateQueue`(×12) / `createManyQueue`(×3)。
- 但**运行中的宿主仍需重启**才会加载该产物（进程内是旧代码）。
- 构建命令与期望：`pnpm build` → 退出码 0，且 `dist/`（host）与 `lib/client.js`（client）都有新产物、`[verify-client] OK`。
