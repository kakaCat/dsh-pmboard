# REQ-261002110908-81d0 拆分计划 · 长文本入参写法约定（共享常量 + 工具描述 + 实施片段）

> **目标**：把「长中文入参别踩 JSON 转义坑」从"靠模型自觉"变成"工具描述与实施提示词自带的约束"——
> `reqboard_task_report` 及同类长文本工具的描述写明三条锚点（**每条短句** / **需引号用「」** / **文本过大拆多次调用**），
> 约定收敛到**一处共享常量**，并由**遍历用例**守住覆盖面。
> **做法**：① `src/tools/shared.ts` 新增 `LONG_TEXT_ARG_NOTE`（三锚点）与 `LONG_TEXT_FIELDS`（工具 × 字段清单）；
> ② 各工具 `description` 与长文本参数 `description` **引用**它（不复制）；
> ③ `implementing` 片段加一行「汇报自检」，按 C-16 重生成、C-17 校验；
> ④ 新增 `tests/arg-guidance.test.ts`（三锚点 + 遍历覆盖 + 两条反向证伪）。
>
> 本计划须**人批准**后才落任务卡（`reqboard_decompose`）。
> 范围仅本仓**文本引导**：**入参 schema / 返回体 / 错误码 / 落盘格式零变更、零持久化、零数据迁移**。
> 适配器侧"一处坏 JSON = 整轮失败"的**失败粒度**修复在边界外（另立需求），本计划不含。

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| FR-x | requirement.md 功能点 | 需求条款（本次 3 条） |
| I-x | design/interfaces.md **第 x 节**（顺序一一对应，不另造号） | I-1 报告描述契约 / I-2 覆盖清单 / I-3 共享常量 / I-4 片段契约（§5 HTTP 为"无变更"声明，不编号） |
| D-x | design/data-model.md **第 x 节** | D-1 零 schema 变更 / D-2 常量与清单 / D-3 入参契约 / D-4 迁移与兼容 |
| TC-x | design/test-cases.md 用例清单 | 测试用例（5 条，含 TC-3 / TC-4 两条反向证伪） |
| t-x | 本文档任务表 | 计划任务（落库后成为任务卡） |

## 改动盘点（对照设计文档逐份）

| 文件 | 增/改/删 | 改动内容 | 设计出处 | 覆盖条款 |
|---|---|---|---|---|
| `src/tools/shared.ts` | 改 | 新增 `LONG_TEXT_ARG_NOTE`（≤120 字，含三锚点）与 `LONG_TEXT_FIELDS`（工具 × 长文本字段只读清单）；既有 22 行内容不动 | I-3；D-2 | FR-2 |
| `src/tools/TaskReportTool/prompt.ts` | 改 | `TASK_REPORT_PROMPT` 追加分段指引与引号口径（**追加，不改既有语义句**） | I-1；D-3 | FR-1 |
| `src/tools/TaskReportTool/TaskReportTool.ts` | 改 | `summary` / `completed` / `next_step` 三个参数的 `description` 各追加约定短语；**字段名/类型/必填一律不动** | I-1；D-3 | FR-1 |
| `src/tools/{SubmitTool,AskConfirmTool,TaskMoveTool,CaptureTool,NoteInterruptionTool,AdoptTaskTool,RegenerateTool}/*.ts` | 改 | 各自长文本字段的 `description` 引用同一常量（只改描述文本） | I-2；D-3 | FR-2 |
| `src/domain/prompt/fragments/implementing/light.md`、`light/overrides.md`、`heavy/overrides.md` | 改 | 各加一行「汇报自检」（受 C-17 保护的 heavy 正文**不动**，只加覆盖层/轻档片段） | I-4 | FR-3 |
| `src/domain/prompt/generated/**` | 生成 | C-16 重生成产物（**禁止手改**，C-10） | I-4 | FR-3 |
| `tests/arg-guidance.test.ts` | 新增 | 断言助手 `assertNoteAnchors` + TC-1…TC-4（含两条反向） | I-3；TC-x | FR-1, FR-2 |

**删除项汇总**：无（本需求只增改文本与一个用例文件）。
**改前必红**：`tests/arg-guidance.test.ts` 在 t1 开工前不存在 → `npx vitest run tests/arg-guidance.test.ts` 报"无测试文件"；t1 落地后 TC-1 绿、TC-2 仍应红（尚未接入），以此证明用例真的在守覆盖。

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段 |
|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 定死长文本入参约定契约：共享常量 + 覆盖清单 + 断言助手 | FR-2 | I-3；D-2 + `src/tools/shared.ts`、`tests/arg-guidance.test.ts` | implement | backend | — | S | `npx vitest run tests/arg-guidance.test.ts -t 约定常量` 全绿：`LONG_TEXT_ARG_NOTE` **同时**含三锚点（短句字数上限 /「」代引号 / 拆多次调用）且长度 ≤120 字；`LONG_TEXT_FIELDS` 为只读且登记 ≥7 个工具；**反向**：`assertNoteAnchors('随便一段没有约定的文本')` 返回**非空**缺失列表（证明断言非恒真）。改前必红（文件不存在） | dev, review |
| t2 | （落库后回填） | 汇报工具描述落三锚点（`reqboard_task_report`） | FR-1 | I-1；D-3 + `src/tools/TaskReportTool/prompt.ts`、`src/tools/TaskReportTool/TaskReportTool.ts` | implement | backend | t1 | S | `npx vitest run tests/arg-guidance.test.ts -t 报告` 绿：`TASK_REPORT_PROMPT` 与 `summary`/`completed`/`next_step` 的 `description` 均命中锚点；`node -e` 断言三字段的 `type`/`required` 与基线一致（零行为变更）；`npx vitest run tests/task-report.test.ts` **保持全绿**（既有行为未变） | dev, review |
| t3 | （落库后回填） | 同类长文本工具接入同一约定 + 遍历覆盖用例 | FR-2 | I-2；D-3 + `src/tools/{SubmitTool,AskConfirmTool,TaskMoveTool,CaptureTool,NoteInterruptionTool,AdoptTaskTool,RegenerateTool}/*.ts`、`tests/arg-guidance.test.ts` | implement | backend | t1, t2 | S | `npx vitest run tests/arg-guidance.test.ts -t 覆盖` 全绿：遍历 `LONG_TEXT_FIELDS` × `define*Tool({} as never).parameters.properties[field].description`，**每个**字段命中锚点，失败时输出缺失名单；**反向**：临时删除任一字段的约定短语 → 该用例必须**红**；`npx tsc --noEmit` 无新增错误 | dev, review, test |
| t4 | （落库后回填） | 实施片段加「汇报自检」并按 C-16/C-17 重生成校验 | FR-3 | I-4 + `src/domain/prompt/fragments/implementing/{light.md,light/overrides.md,heavy/overrides.md}`、`src/domain/prompt/generated/**` | doc | doc | — | S | `node scripts/inline-prompt-fragments.mjs` 退出码 0 且 `generated/` 有更新；`node scripts/check-prompt-fragments.mjs` 退出码 0（片段与产物一致、heavy 与 vendor 原文仍一致）；`grep -c "汇报自检" src/domain/prompt/generated/*` ≥1；**反向**：手工改一处生成产物 → `check-prompt-fragments` 必须非零退出（验完还原） | dev, review |
| t5 | （落库后回填） | 零变更核验 + 全量回归 + 回滚路径演练（**兼容卡**） | FR-1, FR-2, FR-3 | I-1, I-2, I-3, I-4；D-1, D-3, D-4 + `tests/arg-guidance.test.ts`、全仓 | test | backend | t2, t3, t4 | M | `npx vitest run tests/arg-guidance.test.ts` **全绿（含 TC-1…TC-4 与反向项）**；`npx vitest run` 失败数与开工前记录的基线**持平**（基线数写进本卡完工记录，C-14）；`npx tsc --noEmit` 无**新增**错误（C-15）；零变更快照断言：`reqboard_task_report` 的参数字段名集合与必填集合、以及返回体 schema 与基线列表一致（D-3 表逐项比对）；回滚演练：还原三处文本 → C-16 重生成 → `npx vitest run tests/arg-guidance.test.ts` 复现"红"（证明回滚路径可用） | （按 test 阶段兜底） |

- 一个任务只干一件事，标题动词开头；**无 L 工作量**（最大 M）。
- **契约先行**：t1 是契约卡（常量 + 清单 + 断言助手），t2/t3 都 `depends_on` 它；t3 另依赖 t2，因为遍历用例要求**报告工具也已接入**，否则用例在 t3 收尾时仍会红（依赖只声明真实耦合，不为形式造边）。
- **兼容卡**：t5 显式承接「旧调用方/旧参数写法零变更 + schema 快照 + 回滚路径」——见下节"无数据迁移"的结论与依据。
- **子卡段**：全部为文本改动，**无接口可联调**，t1/t2/t3 显式写 `stages` 且 `skipIntegration`（不落联调段）；t4/t5 按阶段兜底（doc → 研发+复核；test → 研发+复核+测试）。

## 覆盖对照

| 需求条款 | 接口（interfaces） | 文件（模块） | 测试用例（test-cases） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 汇报工具入参写清"怎么写" | I-1（1） | `TaskReportTool/prompt.ts`, `TaskReportTool.ts`（2） | TC-1, TC-3（2） | t2, t5 | ✅ 2 卡 |
| FR-2 约定共享并覆盖同类长文本工具 | I-2, I-3（2） | `shared.ts` + 7 个工具文件（8） | TC-2, TC-4（2） | t1, t3, t5 | ✅ 3 卡 |
| FR-3 实施阶段汇报纪律（含片段重生成） | I-4（1） | `implementing/*` + `generated/*`（2） | TC-5（1） | t4, t5 | ✅ 2 卡 |
| **合计** | 4 节接口 | 12 个文件 | 5 条用例 | 5 张任务卡 | **3/3 条款有主** |

> 反向核对：设计文档里的编号都有人认领（I-1…I-4 全在表中；§5 HTTP 为"无变更"声明不编号，D-1…D-4 分别落在 t5 与 t1）。

## 迁移与兼容（显式结论：**无数据迁移**）

| 项 | 结论 | 依据 |
|----|------|------|
| 存量数据迁移 / 回填 | **不需要** | 本需求零持久化变更（D-1）：`queue.json`、台账、RTM 一律不动；历史汇报文本原样保留（含当年那种带裸引号的旧文本） |
| 旧调用方 / 旧参数写法 | **不变** | 只改 `description` 文本：入参 schema、必填性、长度上限、错误码、落盘格式全部零变更（D-3 表逐项比对） |
| 灰度开关 | **不需要** | 插件重新构建即生效（C-11 `pnpm build`）；风险由 TC-1…TC-5 与既有用例承担 |
| 回滚路径 | 纯文本回滚 | 还原三处文本 → `node scripts/inline-prompt-fragments.mjs` 重生成 → 复跑用例；**无残留状态、无需数据还原**（t5 演练验证） |
| 客户端 bundle | **不需要重建** | 本需求不碰 `src/client/**`（C-12 不触发） |

## 明确不做（与 requirement.md 的边界一致）

1. 不改 DSH 核心适配器（`deepseek-harness/…/llm-deepseek/src/translate.ts`）——"整轮失败粒度"另立需求；
2. 不改任何工具的入参 schema、拒绝码、错误文案结构与落盘格式；
3. 不做"自动修复模型输出"（不加二次 LLM 改写、不在客户端正则洗文本）；
4. 不对超长入参做**硬拒**（会增加拒绝路径，违反零行为变更）；
5. 不新增知识层条目（归档阶段按 feature 规则申报 `manual_updates` 时再沉淀）。

## 修订记录

| 日期 | 修改内容 | 修改人 |
|---|---|---|
| 2026-10-02 | 初稿（5 张卡：契约 / 报告描述 / 同类接入 / 片段纪律 / 零变更核验） | session-be1bdc3d |
| 2026-10-02 | **批准后自动落库失败，据根因修正覆盖对照表**：原「接收任务」格写成 `t5（2）`（带计数），被门禁的 plan key 正则（仅认 `^[A-Za-z][A-Za-z0-9_-]{0,39}$`）整格滤掉，导致系统报「计划卡缺少需求条款引用（t5）」并**不推进**。改法：接收任务格只写裸计划键（`t2, t5`），计数移入「完整性」列。改后自检：t1→FR-2、t2→FR-1、t3→FR-2、t4→FR-3、t5→FR-1,FR-2,FR-3，**5/5 有引用**。任务表（key/依赖/验收标准）**一字未改**，本次修正不改变已批准的任务内容 | session-be1bdc3d |
