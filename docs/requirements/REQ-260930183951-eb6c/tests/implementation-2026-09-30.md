# 实施留证 · REQ-260930183951-eb6c（t0~t4）

> **TL;DR**：四个 FR 全部落地并验证——`parentId` 投影复原（FR-1）、锚点存在性守卫（FR-2）、
> 系统项编号连续（FR-3）、需求级项标题单点（FR-4）；新增 17 条用例全绿，全量回归**零新增失败**。
> 本窗口的 `reqboard_*` 工具仍缺失，故**拆分计划尚未正式提交/批准**，`tsdown` 构建**刻意未跑**（见 §5）。

## 1. 改动清单（文件 → 改动）

| 文件 | 改动 | FR |
|---|---|---|
| `src/application/internal/sheet-tasks.ts`（新增） | 投影单点 `toSheetTasks`：剔 `canceled`、**保留 `parentId`**（空串归一为缺省） | FR-1 |
| `src/application/use-cases/SubmitVerification.ts` | 内联投影 → `toSheetTasks(targetTasks)`；新增 `collectMissingAnchors` 探针并透传 `anchorGaps`；需求级项标题改用 `requirementItemTitle` | FR-1/2/4 |
| `src/application/internal/content-gate-wiring.ts` | 新增 `collectMissingAnchors`（`workspacePathCandidates` → `tests/*.{test,spec}.*` → `docs.exists`） | FR-2 |
| `src/domain/workflow/AcceptanceSheetSpec.ts` | 新增 `SheetBuildInput.anchorGaps` + 锚点失效项；**编号改连续**（drafts 组装后一次性分配）；新增 `requirementItemTitle` 单点与两个前缀常量 | FR-2/3/4 |
| `src/application/internal/verification-doc-writer.ts` | 回填标题改用 `requirementItemTitle`（与提交时同源） | FR-4 |
| `src/application/use-cases/AcceptSheet.ts` | 弹框 header 改用 `requirementItemTitle` | FR-4 |
| `src/application/internal/auto-confirm.ts`、`src/domain/workflow/ReadabilityHints.ts`、`src/domain/stage/StageActions.ts`、`src/application/dive/boundary-guard.ts` | **前置修复（t0）**：从 `dist` 构建源码段逐字复原（详见 `repair-2026-09-30.md`） | t0 |

**编号契约（FR-3）**：`id = v<version>-<n>`，`n ∈ [1, items.length]` 连续无空洞；
顺序锁定为 任务项 → 需求级 → 孤儿 → 不可照着验 → E2E → 三方一致性 → 锚点失效 → 追溯断链。

**标题契约（FR-4）**：`requirementItemTitle(criterion, gapKind)` 单点，三处调用方共用；
`consistency` 内部再按 criterion 前缀分「锚点失效 / 三方一致性」，无 `gapKind` 的「不可照着验」按前缀识别。
复核：`grep -rn "'需求级验收'" src` 现只命中 `AcceptanceSheetSpec.ts`（单点本身）。

**锚点护栏（FR-2）**：工作区**没有 `tests/` 目录**时整段跳过（与 e2e「读数未知不追加」同口径）——
裸夹具工作区里"所有锚点都缺失"是噪声，不是结论。

## 2. 新增用例（3 个文件，17 条，全绿）

| 文件 | 用例 |
|---|---|
| `tests/sheet-projection.test.ts` | TC-1.1 投影必须带 `parentId`（删掉即变红）／TC-1.2 空串归一／TC-1.3 `canceled` 剔除 + 顺序／TC-1.4 投影产物过 domain 过滤只剩父卡 |
| `tests/sheet-anchor-gaps.test.ts` | TC-2.1 存在不报／TC-2.2 缺失点名"卡 → 路径"／TC-2.3 多条只出一条项／TC-2.4 pending+`consistency`+requirement 来源／TC-2.5 非测试文件不触发／TC-2.6 `canceled` 不征集／TC-2.7 无 `tests/` 目录整段跳过 |
| `tests/sheet-items-format.test.ts` | TC-3.1 全系统项编号连续／TC-3.2 只触发 E2E 不跳号（2d65 事故形态回归）／TC-3.3 返工续版连续／TC-3.4 无系统项与旧口径逐字一致；TC-4.1 标题表驱动六组合／TC-4.2 渲染不再同名／TC-4.3 普通需求级项不受影响 |

## 3. 回归与指标（命令可复核）

| 检查 | 命令 | 结果 |
|---|---|---|
| 新增用例 | `npx vitest run tests/sheet-projection.test.ts tests/sheet-anchor-gaps.test.ts tests/sheet-items-format.test.ts` | **17 passed (17)** |
| 同层回归 | `npx vitest run tests/verification-sheet.test.ts tests/accept-verdicts-snapshot.test.ts tests/domain/acceptance-sheet.test.ts tests/domain/verification-doc.test.ts tests/e2e-coverage.test.ts tests/consistency.test.ts tests/design-serves-gate.test.ts tests/accept-sheet-tool.test.ts tests/verdicts-and-rework.test.ts` | 全绿 |
| 全量 | `npx vitest run` | **103 failed / 2624 passed / 20 skipped（2747）**；失败数与施工前基线**同为 103**（零新增），passed 2607 → 2624（+17 = 本轮新用例） |
| 类型 | `npx tsc --noEmit \| grep -c "error TS"` | 220（施工前）→ 213（t0 修复后）→ **212**（t1~t4 落地后） |

## 4. 与设计的偏差（如实声明）

| 设计文档写的 | 实际做法 | 原因 |
|---|---|---|
| 用例"增补进既有 `tests/verification-sheet.test.ts` / `acceptance-sheet.test.ts` / `verification-doc.test.ts`" | 改为**三个新文件** | 工作区正被其它会话并发覆写，改既有文件冲突面大；新文件隔离更好，且既有文件保持"未被我改动" |
| `requirementItemTitle` 只按 `gapKind` 分派 | 追加"无 `gapKind` 的不可照着验项按前缀识别" | 否则普通需求级项与不可照着验项仍同名，FR-4「不重名」不成立（TC-4.2 暴露） |

## 5. 仍未完成（未做，且说明原因）

| 项 | 状态 | 原因 |
|---|---|---|
| `reqboard_submit(kind=plan)` + 人工批准 | **未做** | 本窗口 `reqboard_*` 工具族仍缺失（对外表现：`unknown tool`） |
| `npx tsdown -c tsdown.config.mjs`（t5 的构建验收） | **刻意未跑** | 构建会覆写运行中的 `dist/index.mjs`（宿主正加载它）；在工作区隔离完成前跑构建有把插件跑挂的风险——留给 t5、且在用户就绪后执行 |
| 生产链路自证（重交 2d65 验收单看新口径） | **未做** | 同上：需要"重建生效 + 宿主重载" |
| 3 个消失的测试文件（`opinion-required` / `rtm-lifecycle` / `workspace-root`） | **不可恢复** | untracked + dist 不含测试 + 镜像不存在；只能重写 |
| `tests/message-hygiene.test.ts` 棘轮红 | **非本轮引入** | 基线 application 140 / http 21 / client 98，当前 215 / 25 / 120；差额（+75/+4/+22）来自 18:54:52 那次并发批量覆写，不是本轮改动（本轮把 application 从 216 降到 215） |
