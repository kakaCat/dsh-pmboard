# 评审报告（REQ-261008011118-defe · 2026-10-08）

> 范围：体检 §2.2 四条中危项（M1/M3/M4/M5）的实现评审。评审口径与设计对齐：
> 逐条对照 `design/fix-design.md` 的落点、取舍与「不改的东西」，结论必须带命令读数或 `文件:行` 依据。
> 评审人/执行窗口：session-9574f815（四张卡各有独立复核子卡，本文件是合并后的对外报告）。

## 评审结论总览 <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4, BUG-5 -->

| 条款 | 卡 | 对照结论 | 关键依据 |
|---|---|---|---|
| BUG-1 | t-f33d47 | **无偏离** | 六条落点全部核对：两生产死文件 + 一死测试文件已删；`RunStatus` 无两键、`runId` 直读 `advance?.runId`；StatusTool schema 删两键；`AdvanceState` 删三键；仓储三方法删净。保留边界：`AdvanceChain` 仍写/清 `advance.runId/lockAt`（17 处命中） |
| BUG-2 | t-20f5dc | **无偏离** | 判定点在 `gateOne` 的 done 凭证门**之后**（不合规项不占额度）；`role !== 'subtask'` 计数；上限单点常量；拒绝复用 `REQBOARD_BULK_CLOSE` + `throttleRemainingMs=60000`（顶层 guidance 由既有装配产出）；`DoneEvidenceSpec` 零改动 |
| BUG-3 | t-6969c5 | **无偏离** | 补偿两触发条件（抛错 / 漂移 no-op）都在；只恢复写面九字段（不整卡替换）；可选字段「本前缺省 ⇒ 删键」；事件与 `version` 与 `transitionTask` 同源；`rollback-revocation.ts` / `rollback.ts` 零改动（I-11 与撤销半边未动） |
| BUG-4 | t-869f61 | **无偏离** | 认领点（`:543`）先于团队分支（`:569`）与 `workflow.start`（`:599`）；并发拒绝码与文案含年龄/阈值/剩余等待；归还出口两处（`:650` 跨卡 / `:733` catch）统一 `rollbackSubtask`；孤儿阈值与凭证门基准未动 |
| BUG-5 | t-1bb2e9 | **无偏离（含 3 条已归属偏离）** | 知识层 K7/K9 零漂移；错误码清单幂等；文案与行为五组核对（当场修掉头注释旧口径一处）；契约/提示词 73 用例全绿 |

## 复现口径复核（先红读数是否可信） <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4 -->

- BUG-1 的红是**新增断言本身**：夹具故意把 `stepIndex:3` / `currentSubtaskId:'t-a'` 种进 `advance`
  （修前读的就是夹具自己写的值 ⇒ 这正是该缺陷长期躲过测试的原因），修后必须不出现在 run 节。
- BUG-3 / BUG-4 的实现与用例同批完成，红读数通过**临时还原 HEAD 版生产文件**取得，
  恢复后 `git diff --stat` 与还原前逐字一致（BUG-3：134 insertions / 3 deletions；BUG-4：120 insertions / 50 deletions）。
- BUG-2 的红是三段：20 张全落（`expected length 3 but got 20`）、4 张全落、以及既有 9 条仍绿。

## 契约与基线面复核 <!-- serves: BUG-5 -->

| 面 | 读数 | 结论 |
|---|---|---|
| 工具输出契约 | `tests/output-contract.test.ts` 36 用例绿 | 补偿 helper 抽件后无内部 return 误收；`results[]` 键集未变 |
| 错误码 | registry / inventory / matrix / exempt / prompt-error-codes 全绿 | 新码 2 条已注册 + 清单 tier 勘定；零覆盖维持 5（未放宽阈值） |
| 提示词字数 | `prompt-cost` / `prompt-baseline` 绿 | 批量口径文案改动未破基线，无需刷新 |
| 类型 | `npx tsc --noEmit` → error TS 0 | 删字段后无残留引用 |
| 尺寸门 | `size-budget` 仍红，但超标清单 11+ 条全是既存大文件；本需求新增件 163 行、改动件 `MoveRequirement.ts` 357 行 | 非本需求引入（偏离 D-2 已由抽件消除本需求引入的那一条） |
| 知识层 | K7/K9 ✅ | 符号增删已重生成 |

## 归属澄清（防误记） <!-- serves: BUG-5 -->

- `src/application/internal/support.ts`（mtime 10-07 22:34）与 `src/domain/limits.ts`（10-07 23:59）
  在工作树有改动，**均非本需求**（别窗/前批的文案与 `askSafetyMarginMs` 改动，早于本卡 `ExecuteTask.ts` 10-08 01:51）。
- `src/domain/workflow/DoneEvidenceSpec.ts` 的工作树 diff 是前批 M6 clamp 在飞改动（mtime 10-07 20:05）。
- `docs/knowledge/INDEX.md` 的 +5 行索引来自别窗新增条目（`kb-build` 本次输出为 `[skip] …（内容一致）`）。

## 遗留与建议 <!-- serves: BUG-5 -->

| # | 遗留 | 建议 |
|---|---|---|
| L-1 | `pnpm kb:check` 余 K1（INDEX 超限）/ K3（conventions 222 行）/ K14（kb-0064/0065 待刷基线） | 由知识层维护方处置：INDEX 收敛或调阈值、conventions 拆分、确认历史豁免后 `kb-probe --refresh-unverifiable` |
| L-2 | 全量集合差新增 7 条全在 `tests/kb-ensure.test.ts`（顺序相关） | 由引入方定性后决定是否 `--refresh`；本需求不代刷 |
| L-3 | M5 认领前置后崩溃会留 `in_progress` 卡直到 3min 孤儿回收 | 已接受的对价（设计 §风险 R2）；若实测摩擦大，可评估缩短 `LIMITS.orphanTimeoutMs` |
| L-4 | BUG-2 的 N=3 对"一次关 8 张"的合法窗口有等待摩擦 | 已接受的对价（设计 §风险 R1）；回退路径 = 调大 `MOVE_BATCH_DONE_MAX` 单点常量 |

## 修订记录 <!-- serves: BUG-5 -->

| 日期 | 修改内容 | 修改人 |
|---|---|---|
| 2026-10-08 | 初稿：四卡合并评审（结论/复现口径/契约基线/归属澄清/遗留） | session-9574f815 |
