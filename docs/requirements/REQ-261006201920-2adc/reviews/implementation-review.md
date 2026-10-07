# 实施自评与偏离登记（REQ-261006201920-2adc）

> 作者=实施窗口；用途=供复核与验收对照。**凡与设计不一致处一律列出**，不做"无偏离"式省略。

## 一、四条需求条款的落点与判据读数

| 条款 | 落点（唯一） | 判据读数 |
|---|---|---|
| FR-1 未替换占位符不得进验收标准 | `src/domain/task/Acceptability.ts`（判据）+ `src/domain/task/SubtaskTemplate.ts`（词表与回填器）+ `src/application/internal/lazy-expand.ts`（落库接线） | `npx vitest run tests/acceptance-placeholder.test.ts tests/lazy-expand-backfill.test.ts tests/domain/subtask-template.test.ts` → 全绿；全 20 阶段展开后尖括号残留 0 |
| FR-2 返工卡与其它卡同门 | `src/domain/workflow/AcceptanceSheetSpec.ts`（`reworkSpecFor` 三级取值 + 继承）+ `src/application/internal/verdicts.ts`（搬到卡上） | `npx vitest run tests/rework-gate.test.ts` → 全绿；三级取值每级都过 `checkAcceptance` + `checkHowToVerify` |
| FR-3 裁决结果必须可复核 | `AcceptanceSheetSpec.ts`（三条词表与判据）+ `verdicts.ts`（覆盖原子四元组）+ `src/http/routers/verdicts.ts`、`src/application/use-cases/AcceptSheet.ts`（两通道）+ 客户端 `verify.ts` / `stage-panel.ts` / `board-mount.ts` | `tests/verdict-result-anchor.test.ts`、`tests/result-override-reason.test.ts`、`tests/client-verify-disposition.test.ts` → 全绿 |
| FR-4 系统缺口项通过必须写处置 | `AcceptanceSheetSpec.ts`（处置模板 + `dispositionMissingItems` 接入放行判据） | `tests/system-item-disposition.test.ts` → 全绿（含逆验证 TC-17） |

## 二、与设计/卡面的不一致处（逐条列，含理由与方向）

| # | 卡面/设计的原话 | 实现 | 方向 | 理由 |
|---|---|---|---|---|
| A1 | 卡面 t3：「覆盖判定…且 `resultSource==='agent'`」 | 覆盖判定只看「该项**已有非空实测结果**且与人的文本不同」，不看来源标注 | **更严** | 存量/旧账本里 `result` 有值而 `resultSource` 缺省是常见形态；按字面写会把这些静默改写放行——正是本需求要堵的形态 |
| A2 | 设计 frontend：「理由输入**编辑预填值时才**展开必填」 | 展开时机是**提交时就地展开并拦下** | 更松（体验） | 渲染是纯字符串函数、挂不了 `input` 监听；核心要求（覆盖必填理由）由前端守卫 + 服务端权威校验双保险，判定权仍在服务端 |
| A3 | 原计划描述「needsHuman 项与 gapKind 项的就地拒收提示复用同一文案源」 | **未新增**这两类就地提示（既有实现里没有该控件） | 未做 | 勾选项验收①~⑥只点名两个新钩子与徽标文案；凭空造一个新提示控件属于计划外扩张。判定与拒绝仍在服务端与 `board-mount` 的既有三条守卫里，未静默 |

> A1 是**收紧**、A2/A3 是**范围上的如实交代**；三者都不放宽任何既有判据（`VERIFIABLE_ANCHOR` / `HOW_TO_VERIFY` / 四道人工门逐字未动）。

## 三、实施期被自己的用例抓出并修掉的缺陷（4 个）

| # | 现象 | 根因 | 修法 |
|---|---|---|---|
| B1 | 覆盖写入把「人首次填写实测结果」这条写路径一并收窄 | 重构时把两条写路径混为一谈 | 拆成「首次填写」与「覆盖」两条，判据分开 |
| B2 | 域层拒绝落 500（看板显示"服务器坏了"） | `result_change_reason_required` 与既有 `system_item_disposition_required` 都没登记进 `statusForCode` | 两个码补登记为 400（后者是**既有缺口**） |
| B3 | 回滚开关开着时弹框仍在补问变更理由 | 补问没以 `itemResultBindingEnabled` 为门 | 补问以开关为门，守住"一行配置退回今天行为" |
| B4 | 补问未作答时把整项降级为未复核 | 处置过严（人点的是通过、文本也有锚点） | 改为「不采纳这次修改」：`opinion` 收回 agent 原文 ⇒ 不写覆盖、原文不丢、裁决照常 |

## 四、反向演练汇总（每条都做红→还原→绿，两次输出留档）

| 演练 | 关掉的判据 | 红 | 还原后 |
|---|---|---|---|
| RV-1 | 计划期占位符分支 | 2 failed / exit 1 | sha256 逐字节相同 → 复绿 |
| RV-2 | 子卡落库回填调用 | 5 failed / exit 1 | 同上 |
| RV-3 | 裁决结果锚点分支 | 2 failed / exit 1 | 同上 |
| RV-4 | 覆盖理由校验（改恒真） | 2 failed / exit 1 | 同上 |
| RV-5 | 处置模板（退回非空即可） | 2 failed / exit 1 | 同上 |

留档：`evidence/rv1-*.txt` … `rv5-*.txt`（共 10 份）。

## 五、边界守住的自查

| 红线 | 自查 |
|---|---|
| 不碰原型门 | `src/application/internal/prototype-gates.ts` 未在我的改动清单里；仅**真跑**两道原型门确认我的文档不被拒 |
| 不碰归档校验 | `SubmitArchive.ts` / 归档材料判据未改；只在 HTTP 回执文案里改读权威的 `isFullyDecided`（那是放行判据同源，不是归档校验本体） |
| 不碰测试基线 | **刻意不跑** `baseline --refresh`；差集如实留在证据文件里 |
| 存量卡不追溯 | `git diff --name-only -- 'docs/requirements/*/tasks' \| wc -l` = 0 |
| 不提交他窗口在飞文件 | 改动清单只含本需求的 12 个源文件与 8 个用例文件 + 文档；他窗口的文件（`MoveRequirement.ts` / `content-gate-wiring.ts` / `category-doc-sets.ts` / `report-band.ts` 等）一律未动 |
