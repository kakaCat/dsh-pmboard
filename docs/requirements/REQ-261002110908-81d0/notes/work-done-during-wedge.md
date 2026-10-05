# 楔形期间完成的工作 → 卡片映射（REQ-261002110908-81d0）

> 背景：台账处于 **implementing / 0 张卡** 的死锁态（见 [incident-autorun-deadlock.md](incident-autorun-deadlock.md)），
> `reqboard_task_move` / `reqboard_task_report` 均无卡可依。为不空转，按**已批准两次的计划内容**（[decomposition.md](../decomposition.md) 任务表）
> 把 5 张卡的改动做完并自证；**台账未动**，解锁后按本文件回填卡状态与完工记录。
> 记录时间：2026-10-02 11:2x ｜ 窗口：session-be1bdc3d

## 一、卡片 → 产出 → 证据

| 卡 | 产出（文件） | 证据（命令 + 结果） |
|---|---|---|
| **t1** 契约卡 | `src/tools/shared.ts`（新增 `LONG_TEXT_ARG_NOTE` 42 字 + `LONG_TEXT_FIELDS` 15 条 / 8 工具）；`tests/arg-guidance.test.ts`（新增，含 `assertNoteAnchors`） | 改前必红：`npx vitest run tests/arg-guidance.test.ts` → `No test files found, exiting with code 1`；改后 `npx vitest run tests/arg-guidance.test.ts` → **10 passed** |
| **t2** 报告工具 | `src/tools/TaskReportTool/prompt.ts`、`TaskReportTool.ts`（summary / completed / next_step 三处说明 + 工具描述） | `npx vitest run tests/arg-guidance.test.ts tests/task-report.test.ts` 全绿；TC-5 零变更断言：参数字段集合 = `{task_id,summary,completed,files_changed,next_step}`、required = `{task_id,summary}`、返回体 7 键不变 |
| **t3** 同类工具 | `SubmitTool` / `AskConfirmTool` / `TaskMoveTool` / `CaptureTool` / `NoteInterruptionTool` / `TaskAdoptTool` / `RegenerateTool` 共 7 个工具的长文本字段说明 | TC-2 遍历用例：清单 15 条「工具.字段」**零缺项**；TC-4 反向：未接约定的文本必被判缺 |
| **t4** 片段纪律 | `implementing/light/overrides.md`（覆盖 4）、`implementing/heavy/overrides.md`（覆盖 8）、`src/domain/prompt/generated/fragments.ts`（C-16 重生成） | `node scripts/inline-prompt-fragments.mjs` exit 0（128 fragments / 72702 bytes）；`node scripts/check-prompt-fragments.mjs` exit 0（片段↔产物一致、heavy.md↔vendor 逐字节一致）；`grep -c 汇报自检 generated/fragments.ts` = 3 |
| **t5** 零变更+回归 | `tests/arg-guidance.test.ts`（TC-5 零变更用例）、`tests/fixtures/stage-prompts-baseline-p1.json`（P1 基线按脚本刷新） | 回滚演练：破坏锚点 → **4 failed**，还原 → **10 passed**；全量 `npx vitest run` → 失败集合与基线**逐一对齐（49 文件 / 98 用例）**，通过数 2991 → 3001（+本次 10 条）；`npx tsc --noEmit` **197 = 197**；`pnpm build` exit 0 + `[verify-client] OK`；**构建产物已含本次文本**：`dist/index.mjs` 命中 `拆成多次调用` ×3、`汇报自检` ×2（构建时间 11:27）→ 重启宿主即生效 |

## 二、与卡片的偏差（如实记录，1 处）

**t4 的 `light.md` 那一行没有加**：`implementing` 轻档受**硬预算 2500 字符**（`tests/prompt-tiers.test.ts` 守着）。
第一版两处都加，实测 **2775** 超限 → 收敛为：只在 `light/overrides.md` 留一行精简条目（`light` 档 2409 → 2472），
`heavy/overrides.md` 保留完整版（含"整轮报废"的理由）。纪律在轻档与重档**都仍然到位**，只是轻档少了一句理由。

**P1 基线快照刷新**属仓库既有规程（`scripts/dump-stage-prompts.mjs`；测试注释明示"文本按设计演进时显式重跑"），
本次变更键只有两个、正是本次改的两处：
`implementing/light 2409 → 2472`、`implementing/heavy 4832 → 5070`。

## 三、解锁后要做的三件事

1. `reqboard_decompose(tasks=[5 张])` 落库 → 5 张卡入账；
2. 逐卡 `reqboard_task_move(in_progress → done)` + `reqboard_task_report`（把上表证据写进各卡完工记录）；
3. `pnpm build` 已跑过；**新窗口**里验证一次真实生效（工具描述注入 + 片段注入）。

## 四、没做的事（边界外，与 requirement.md 一致）

- 未动 DSH 适配器（`deepseek-harness/…/llm-deepseek/src/translate.ts`）——"整轮失败粒度"另立需求；
- 未改任何工具入参 schema / 拒绝码 / 落盘格式（TC-5 就是这条的守卫）；
- 未改知识层（`pnpm kb:check` 未触发，归档阶段按 feature 规则申报 `manual_updates`）。
