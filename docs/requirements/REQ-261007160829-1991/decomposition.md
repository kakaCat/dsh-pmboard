---
requirement_id: REQ-261007160829-1991
---

# 拆分计划（REQ-261007160829-1991）

## 目标与做法

把「无锚点结果被静默降级」这条病根拆成**判据单点 + 三个落点**的实施单元：提交侧拦（不让不合格结果进单）、裁决侧记（降级写原因）、人工侧拒（自填无锚点当场拒绝），外加一处文案单点供两条通道共用。

工作量口径：S（≤1 文件 + ≤1 用例文件）/ M（2–3 文件）/ L（>3 文件，需再拆）。本计划全部为 S/M，无 L。

## 任务表

| 计划 key | 标题 | 实施要点（文件） | 验收 | 工作量 | 依赖 |
|---|---|---|---|---|---|
| t1 | 落「未复核原因」字段与降级判定单点 | 在 `src/shared/protocol.ts` 的 `VerificationItem` 与 `src/domain/workflow/AcceptanceSheetSpec.ts` 的 `SheetItemLike` 成对新增可选字段 `unverifiedReason`；抽出纯函数 `judgePassedVerdict({item, opinion})` 返回 `{status, reason?}`（S-1 的六条判定顺序逐条实现）；在 `tests/verdict-downgrade-reason.test.ts` 钉死四类输入 | `npx vitest run tests/verdict-downgrade-reason.test.ts` 退出码 0；断言四类输入各自得到 `passed` / `unverified(blank_pass)` / `unverified(anchor_missing)` | S | — |
| t2 | 裁决侧写降级原因并在人工自填无锚点时拒绝 | 在 `src/domain/workflow/AcceptanceSheetSpec.ts` 的 `applyVerdicts` 接 `judgePassedVerdict`：降级同写原因、`passed`/`failed` 清空；新增 `isHumanAuthored` 并在人工自填无锚点时抛 `REQBOARD_VERDICT_ANCHOR_MISSING`；`tests/verdict-human-anchor-reject.test.ts` 覆盖拒绝与零输入不误伤 | `npx vitest run tests/verdict-human-anchor-reject.test.ts` 退出码 0；拒绝时台账 `version` 不变 | M | t1 |
| t3 | 提交侧锚点体检入桶 | 在 `src/domain/workflow/ResultBinding.ts` 的 `ResultMatchReport` 增 `unanchored` 桶，`matchStructuredResults` 按 S-3 条件入桶（人工项 / 系统项排除）；判据只调用既有的 `hasResultAnchor`，不另写正则 | `npx vitest run tests/result-anchor-submit.test.ts` 退出码 0；断言普通项无锚点入桶、人工项与系统项不入桶 | S | — |
| t4 | 提交侧锚点拒绝分支与错误码 | 在 `src/application/use-cases/SubmitVerification.ts` 的 `bindStructuredResults` 增分支（位置：漏项之后），拒绝码 `REQBOARD_RESULT_UNANCHORED`，四段式回执含可照抄样例；补齐 `tests/result-anchor-submit.test.ts` 的端到端拒绝与补锚点后成功 | `npx vitest run tests/result-anchor-submit.test.ts` 退出码 0；拒绝时验收单零改动 | M | t3 |
| t5 | 新建回执文案单点 VerdictNotices | 新建 `src/domain/workflow/VerdictNotices.ts`：`ACCEPT_RESULT_FORM_HINT`、`unverifiedSummaryOf(items)`、`unverifiedAdviceOf(reason)`（纯字符串、零 IO）；在 `tests/accept-result-question-wording.test.ts` 钉死取值与缺省措辞 | `npx vitest run tests/accept-result-question-wording.test.ts` 退出码 0；`unverifiedSummaryOf` 输出形如 `1 项未复核（无锚点 1、未写结果 0）` | S | — |
| t6 | 弹框侧接线（题干形态提示 + 回执分派） | 在 `src/application/use-cases/AcceptSheet.ts`：第 2 问题干追加 `ACCEPT_RESULT_FORM_HINT`；回执 `note` 改为 `unverifiedSummaryOf` + `unverifiedAdviceOf`；同一用例文件补题干与回执断言 | `npx vitest run tests/accept-result-question-wording.test.ts` 退出码 0；题干含「命令 / 路径 / 计数」 | S | t2, t5 |
| t7 | HTTP 回执按真实原因分派 | 在 `src/http/routers/verdicts.ts` 的 `POST /api/verdicts` 回执改用同一对文案函数（不再写死「未复核 N 项」）；同一用例文件补源码级断言 | `npx vitest run tests/accept-result-question-wording.test.ts` 退出码 0；HTTP 回执含原因分类 | S | t5, t6 |
| t8 | 契约与文案单点的机械钉死 | 新增 `tests/accept-verdict-reason-contract.test.ts`：两处字段镜像同名同值域、字段可选（不在必填清单）；在 `tests/accept-result-question-wording.test.ts` 增源码级断言（两处调用同一函数、出现写死的「未复核」句即红） | `npx vitest run tests/accept-verdict-reason-contract.test.ts tests/accept-result-question-wording.test.ts` 退出码 0 | S | t1, t5, t6 |

## 接口对照表

| 接口 | 形态 | 接收卡 key |
|---|---|---|
| I-1 | 域纯函数（判定落点与原因） | t1 |
| I-2 | 域纯函数（人工自填判定） | t2 |
| I-3 | 既有纯函数（复用，不改词表） | t1, t3 |
| I-4 | 域函数（改行为：写原因 + 拒绝） | t1, t2 |
| I-5 | 域纯函数（体检加桶） | t3 |
| I-6 | 用例函数（加拒绝分支） | t4 |
| I-7 | 文案单点（新建模块） | t5, t8 |
| I-8 | 工具回执（弹框侧接线） | t6 |
| I-9 | HTTP 回执（路由侧接线） | t7 |
| I-10 | 错误码（两枚） | t2, t4 |

## 依赖与理由

- 文件重叠的边（t2→t1、t4→t3、t6→t5、t7→t5/t6、t8→t5/t6）由重叠本身保证串行，无需额外理由。
- 零文件交集但存在强时序的边，逐条给语义理由：

| 边 | 语义理由 |
|---|---|
| t6 → t2 | t2 落的是域侧「原因值」，t6 只把它接进弹框回执；没有该取值就无从分派文案 |
| t8 → t1 | t1 立字段与两处镜像，t8 只断言镜像一致与「可选」属性（读源文字面量） |

t7 对「原因取值」的依赖是**传递的**（t7 → t6 → t2），故不单列一条边。

- **单写者约束**：`tests/accept-result-question-wording.test.ts` 被 t5 / t6 / t7 / t8 按依赖链依次追加断言（同一份文案单点只允许一个用例文件），故 t7 排在 t6 之后。

## 批次建议

| 批次 | 卡 | 说明 |
|---|---|---|
| B1 | t1, t3, t5 | 三个互不重叠的地基（域字段/判定、体检桶、文案单点） |
| B2 | t2, t4, t6 | 三条接线（依赖 B1） |
| B3 | t7, t8 | 收尾（HTTP 接线 + 契约钉死） |

## 边界（本计划不做）

- 不改 `src/client/**`（看板渲染新原因字段列入需求「边界」）。
- 不改 `hasResultAnchor` 的词表（判据松紧另立需求）。
- 不回填存量验收单（本计划不含任何数据迁移卡）。
