# 评审报告：reqboard 体检第一批边界 bug（REQ-261007193530-3133）

> 评审方式：本窗口自评审（无第二人）。纪律：每条结论附可复核命令/读数；不利证据如实列出。

## 评审范围 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

对照 requirement.md 四条 FR、design/ 五份设计文档（bugfix-design + architecture + data-model + interfaces + test-cases）
与拆分计划 decomposition.md 的 5 张卡，逐条核对交付。

## 逐条结论 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| FR | 现场 | 修复 | 反证 | 结论 |
|----|------|------|------|------|
| FR-1 | `AskConfirm.ts:452` | 条件展开 | 回退即红（1 failed） | 通过 |
| FR-2 | `routers/tasks.ts:137` + `task-transition.ts:33` | 传 role + 单源助手 | 移除传参即红（3 failed） | 通过 |
| FR-3 | `RequirementStatus.ts:130` | 集合加键 | 删键即红 | 通过 |
| FR-4 | `DoneEvidenceSpec.ts:81` | 行内 clamp | 回退即红（1 failed） | 通过 |

## 证据复核 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

- `npx vitest run`（四组文件）→ 4 files passed / 36 tests passed。
- `npx tsc --noEmit -p tsconfig.json` → exit 0，error TS 0 条。
- `git status --porcelain -- src tests` → 9 个文件，与 `design/bugfix-design.md`「文件结构」表逐条一致，无表外改动。

## 不利证据与遗留项 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

1. **全量 `pnpm test` 未绿**：69 failed / 6942 passed（39 文件）。`pnpm baseline:check` 报「新增失败 10 条」，
   但抽验（撤掉本批全部改动后在 HEAD 复跑）显示同样失败 ⇒ 非本批引入，属基线文件陈旧。
   **处置建议**：由对应负责人跑 `npx tsx scripts/test-baseline.mts --refresh` 落账（不在本批范围）。
2. **FR-2 只堵新增入口**：已卡进非法态的存量子卡不做数据迁移（需求文档「边界」节已声明）。
3. **HTTP 面仍无鉴权**：本地进程可伪造 `actor:'human'` 绕过人工门（H2 另一半）；需独立立项。
4. **`MoveTask.roleOf` 未改为委托 `roleOfTask`**：两份同口径实现暂时并存（设计里标为「允许项非必须项」）。
   若后续再出现口径漂移，应优先合并为单源。

## 评审结论 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

四条 FR 的实现、回归与反证齐备，接口/数据模型/架构口径与设计一致；遗留项均已在文档与验收材料中如实标注，不阻塞验收。
