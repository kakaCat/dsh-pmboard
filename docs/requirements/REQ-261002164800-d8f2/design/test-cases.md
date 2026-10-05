---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7
---

# 测试用例：先红后绿、逐条挂 FR serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7

> 每个新测试文件**头部 20 行内**写 `serves: FR-x`（本仓约定，便于覆盖率读数）；
> 用例名点明"修前必红"的那条断言。

## 测试策略 serves: FR-1, FR-6

- 层：单测（domain 纯函数）+ 用例级（application，用 `tests/application/harness.ts` 的内存替身）+ 脚本级（回填器，用夹具工作区）。
- 不做真弹框 E2E：确认通道的端到端已在既有用例覆盖；本次对**落库编排**做等价用例级验证（`landApprovedPlan` 直接被两条入口调用）。
- 判据统一：修前必红（用例描述里写明"修前红在哪一行行为"），修后绿。

## 用例清单 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-7

| 用例 | 覆盖 | 场景 | 期望 |
|---|---|---|---|
| `parity: 批准路径不再因无落点卡整批失败` | FR-1, FR-6 | 夹具计划 11 张卡，其中 1 张无 FR；走 `landApprovedPlan(source='confirm')` | 落库 11 张；`unrefed=['t7']`；**不抛** `REQBOARD_PLAN_REFS_MISSING`（修前：0 张 + 抛错） |
| `parity: 三条入口落出的卡集合一致` | FR-1 | 同一计划分别走 `confirm` / `board` / `decompose` | 三次卡集合、refs、依赖相同；第 2/3 次 `alreadyLanded>0` 且不造新卡 |
| `parity: 看板批准也落库并推进` | FR-1 | `POST req/plan/approve` | 落库 n 张 + 状态到 implementing（修前：0 张、状态不变） |
| `channel: 计划任务表的 refs 能传到卡上` | FR-2 | `tasks=[{key:'t1',requirement_refs:['FR-1','FR-2']}]` 提交计划 → 落库 | 卡 `requirementRefs=['FR-1','FR-2']`（修前：入参被 schema 拒 / 协议层丢） |
| `channel: 非法 ref 在提交计划时被拒` | FR-2 | `requirement_refs=['FR-99x','X-1','']` | 抛 `REQBOARD_BAD_REQUIREMENT_REF`，点名片与非法值 |
| `fallback: 文档覆盖表在两路都生效` | FR-3 | 计划表无显式 refs，文档表写 `FR-1 ↔ t2` | `confirm` 与 `decompose` 落出的卡 refs 都是 `['FR-1']`；`sources['t2']='doc'`（修前：decompose 路径为空） |
| `fallback: 两处都无来源 → 落库 + 点名` | FR-3, FR-6 | 无显式、文档表无该 key | 落库成功；`unrefed` 含该 key；需求评论出现一条警告 |
| `repair: 补写入口改 refs 并同步 RTM` | FR-4 | `reqboard_task_refs(t-xxx, ['FR-2'], reason)` | 卡 refs 变更；`rtm-implementing/<id>.yml` 的 `serves` 同步；留痕 1 条 |
| `repair: 幂等与拒绝` | FR-4 | 同值重复调用；传非法值；跨需求卡 | 同值 `changed:false` 且文件 mtime 不变；非法抛 `REQBOARD_BAD_REQUIREMENT_REF`；跨需求抛 `REQBOARD_TASK_NOT_BOUND` |
| `backfill: dry-run 不写盘、apply 幂等` | FR-5 | 夹具工作区跑 `--dry-run` / `--apply` / `--apply`(二次) / `--check` | dry-run 零变更；apply 后 `--check` 输出 `empty_with_doc_coverage: 0`；二次 apply `applied:0` |
| `backfill: restore 可还原` | FR-5 | `--restore <report>` | 卡 refs 回到回填前值（= 报告里的 `before`） |
| `rtm: 返回体读数取自真实记录` | FR-7 | 落库后核对返回体 | `task_coverage[i].covers_frs` 非空且等于卡 refs（修前：恒空） |

## 红绿判据 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-7

- **修前必红**：每条用例在 HEAD 上先跑一次，记录失败断言行（进交付证据）。
- **修后必绿**：只允许"本次新增用例全绿"；既有用例失败数不得高于基线。
- 现场复演作为验收锚点：用 277d 形状的夹具（1 张无 FR 卡）重演批准路径，必须 11 张卡落库。

## 可跑命令 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-7

| 目的 | 命令 | 期望 |
|---|---|---|
| 新增用例 | `npx vitest run tests/reqboard/plan-landing-parity.test.ts tests/reqboard/plan-refs-channel.test.ts tests/reqboard/task-refs-repair.test.ts tests/reqboard/backfill-task-refs.test.ts` | 全绿 |
| 回填 | `pnpm tsx scripts/backfill-task-refs.ts --dry-run` → `--apply` → `--check` | `--check` 输出 `empty_with_doc_coverage: 0` |
| 全量回归（C-14） | `pnpm test` | 失败数 ≤ 基线 106，且无新增失败 |
| 类型（C-15） | `pnpm typecheck` | 错误数 ≤ 基线 223，改动文件零错误 |
| 构建（C-11） | `pnpm build` | 退出码 0 |

## 取数单点的静态断言 serves: FR-1, FR-3

- `grep -rn "refsByKey" src`：只允许 `plan-refs.ts`（构造）与 `plan-landing.ts`（消费）。
- `grep -rn "planRefsFromDoc" src`：只允许 `plan-refs.ts` 一处调用（修前：`confirm-settle.ts` 一处，`Decompose` 零处）。
- `wc -l src/application/internal/confirm-settle.ts`：≤400（修前 439）。
