---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7
---

# 后端实现口径：改哪里、按什么顺序、怎么退回来 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7

> 只写实现口径，不写任务清单。IO 仍只允许出现在 `src/repositories/**` 与 `scripts/**`。

## 改动文件清单 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-7

| 文件 | 改动 | 对应 |
|---|---|---|
| `src/domain/task/RequirementRefs.ts` | 🆕 `REF_ID_RE` / `refInvalidReason` / `normalizeRequirementRefs`（零 IO） | FR-2 |
| `src/application/internal/plan-refs.ts` | 🆕 `refsForLanding` / `unrefedKeys`（唯一组装点） | FR-1, FR-2, FR-3 |
| `src/application/internal/plan-landing.ts` | 返回 `unrefed` / `sources`；RTM 入参改真实记录 | FR-1, FR-7 |
| `src/application/internal/approved-plan-landing.ts` | 🆕 两条人工入口共用的落库层 | FR-1, FR-6 |
| `src/application/internal/confirm-settle.ts` | 删掉自建 refs 与卡级硬拒（净减行数）；改调 `landApprovedPlan` | FR-1, FR-6 |
| `src/application/use-cases/Decompose.ts` | 改调 `refsForLanding` + 同门禁 | FR-1, FR-3 |
| `src/application/use-cases/AmendTaskRefs.ts` | 🆕 补写用例（工具与看板共用） | FR-4 |
| `src/tools/TaskRefsTool/` + `src/tools/index.ts` | 🆕 `reqboard_task_refs` | FR-4 |
| `src/tools/SubmitTool/SubmitTool.ts` | 入参 `tasks.items` 补 `requirement_refs` | FR-2 |
| `src/shared/protocol.ts` | `PlanTask.requirement_refs?` + `normalizePlanTasks` 保留校验 | FR-2 |
| `src/http/routers/requirements.ts` | `req/plan/approve` 落库 + 推进 | FR-1 |
| `src/http/routers/tasks.ts` | `task/update` 接受 `requirementRefs`+`reason` | FR-4 |
| `scripts/backfill-task-refs.ts` | 🆕 `--dry-run` / `--apply` / `--check` / `--restore` | FR-5 |

## 搬迁步骤（先搬后改，保证可回退） serves: FR-1, FR-6

1. **搬**：把 `confirm-settle.ts:288-307` 的 refs 组装与卡级判定、`Decompose.ts:176-188` 的组装，整段搬进 `plan-refs.ts`（行为保持：先只做等价搬迁，用例不变绿/红）。
2. **合**：`refsForLanding` 内做"显式 → 文档"的补齐，删掉两条入口各自的组装。
3. **降**：`planRefsMissing` 从"硬拒"改为 `unrefedKeys` 警告；`confirm-settle` 的抛错分支删除。
4. **共**：抽出 `landApprovedPlan`，`confirm-settle` 与看板路由都改调它（入口只决定是否推进）。
5. **开**：入参 schema + `PlanTask` + `normalizePlanTasks` 三处同时打开 refs 通道（缺一处就还是丢）。
6. **补**：`AmendTaskRefs` 用例 + 工具 + 路由字段。
7. **回填**：脚本落地，先 dry-run 出报告再 apply。

每步都保持"既有用例基线不倒退"；`pnpm test` 失败数 ≤106、`pnpm typecheck` ≤223（C-14/C-15）。

## 落库实现细节 serves: FR-1, FR-7

- **幂等**：沿用 `createMany` 的按 id 去重 + 入口侧"已有未取消任务 ⇒ 跳过"双重保护；重复调用**不写盘**（队列文件 mtime 不变）。
- **顺序**：先 `TaskStore.createMany` 写任务，再 `repo.mutate` 写需求侧（rollup/评论/产物登记）——沿用既有契约，不反序。
- **RTM 同步**：落库后调 `syncRTMYaml`（serves ← `requirementRefs`）；返回体 `task_coverage` 用**同一批真实记录**计算（修正 `plan-landing.ts:318` 的投影类型误用）。
- **警告可见性**：`unrefed` 非空时写一条需求评论（含卡 key 列表与"文档覆盖表未写该 key"提示），并在返回体 `warning` 复述。
- **门禁唯一**：只剩 `assertClauseCoverageGate`（FR 覆盖，硬）；三条入口都调，不接受"某入口不调"。

## 补写入口实现 serves: FR-4

- 单一用例 `amendTaskRefs`：校验 → `TaskStore.mutate`（只改 `requirementRefs`，值同则返回 undefined 不写盘）→ 同步 RTM → `repo.mutate` 写评论留痕。
- 工具壳与 HTTP 路由都只做协议转换（`tools/` 与 `http/` 内不出现状态字面量）。
- 权限口径：卡必须属于**本窗口绑定的进行中需求**；归档/取消的卡拒绝。
- 幂等判据：返回值 `changed:false` + `queue.json` mtime 不变。

## 回填器实现 serves: FR-5

- 只经 `TaskStore`（列表/`mutate`）与 `docs` 读端口；不直接读写队列文件。
- 每个需求：读其 `decomposition.md` 覆盖表 → 计划 key 映射到任务（复用"key ↔ 卡"的既有对照：`decomposition.md` §2 或 `sources` 同源解析），逐卡计算目标 refs。
- 只写**空 refs 且文档表有来源**的卡；已有非空 refs 一律不动（进 `skipped` 并说明）。
- 归档需求只统计不写（`skipped` 理由 = 归档只读）。
- 报告同时是回滚凭据：`--restore <report.json>` 按 `before` 逐卡还原。
- 子卡（`parentId` 非空）不单独写（随父卡语义），进 `skipped`。

## 回滚路径 serves: FR-5, FR-6

1. **代码回滚**：两个新字段均可选，旧代码忽略 ⇒ 直接回退版本即可，无需数据迁移。
2. **数据回滚**：`scripts/backfill-task-refs.ts --restore <report.json>` 把本次回填的卡 refs 还原成 `before`。
3. **门禁回滚**：若"卡级警告"策略需要退回硬拒，只需在 `plan-refs.ts` 一处把 `unrefedKeys` 接回拒绝分支（单点可逆）。
