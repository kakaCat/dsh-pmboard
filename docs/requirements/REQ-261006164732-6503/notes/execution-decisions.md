# 执行期裁决与偏差（REQ-261006164732-6503）

> 本文件是**执行期**（implementing / accepting）的裁决与偏差记录——设计文档与需求文档**已确认**，
> 本需求不为执行期的口径调整去改写它们（改写会作废旧确认、把需求打回上一节点），
> 故按仓规把偏差记在这里；把设计原文改准列为后续动作。

## 1. 偏差一：`gateOpen` 判据退居为"记账"，拦人只用 `beforeGateTransition`

- **设计原文**（architecture A-4 / backend B-4 / interfaces I-6）：落章前提 = `gateOpen（门仍 open）∧ onSourceStage（需求仍在该门来源阶段）`。
- **实际实现**：拦人只按「**这道门守的那次迁移是否已经发生过**」（`gateStaleReason`）；`gateOpen` 由**写入点的首写纪律**
  （`stampArtifactOnce` / `stampPlanOnce`）兜底，不再用于拒绝。
- **为什么**（两条实测依据，都不是推测）：
  1. 「章已落 + 迁移未发生」是本仓**刻意保留**的补推进路径（REQ-261006094052-1da2：已落章未推进时 agent 无路可走）；
     按 `gateOpen` 拦会把那条修复回退——全量基线差集当场点名了 `tests/ask-confirm.test.ts` 与
     `tests/dive-gate-prompt.test.ts`（TC-15）三例。
  2. 「迁移已发生但**尚无章**」时需要允许**补章**（历史用例 `confirm-group.test.ts::非 design kind 维持首份落章` 钉着它）；
     故证据/看板两条通道只吃首写纪律，不吃迁移判据。
- **后果**：`SettlePrecondition.gateOpen` 保留为契约形状但不再被构造（见该类型的实现说明）。
- **后续动作**：把 A-4 / B-4 / I-6 的判据改写为「迁移是否已发生 + 写入点首写纪律」，并补一条 D-x 裁定。

## 2. 偏差二：异门陈旧票清理的归属（AskConfirm → gate-request）

- **设计原文**（interfaces I-5）：清理写在 `AskConfirm`，同门跳过、异门 settle。
- **实际实现**：清理随**建门动作**落在 `gate-request.ts` 的 `opened` 分支。
- **为什么**：登记动作已收进 `requestGate`，清理留在 `AskConfirm` 会被「沿用已建好的门」（adopt）分支整个跳过
  ——实测 `ask-confirm-blocking.test.ts` 的 TC-10b 当场红（异门旧票永远钉在窗口上）。
- **后续动作**：随第一条一起改进设计文档。

## 3. 已知例外：Dive 人工门弹框是**第 6 条**弹框通道（未收敛）

- `src/application/dive/gate-prompt.ts` 自己 `questions.ask` + 直接调 `applyConfirmDecision`，
  **不经** `requestGate`、**不登记** `pc-` 票。
- 后果：同一道门在 Dive 下仍可能出现「pc- 票 + Dive 框」并存；它也不进
  `reqboard_status.pending_confirms[]` 的三面同源投影（那份投影按窗口取未作答票）。
- **本次不越界改**：该文件与 `round-driver.ts` / `session-driver.ts` 正被**另一个窗口**改动（mtime 17:55 与提交中的测试改动），
  在本需求窗口改它会把两边的验证互相污染。已登记为后续线。

## 4. 已知边界：跨窗口复用的 ticket 在本窗口取不到回执

- 复用判定键不含 `windowKey`（人只该被问一次），但 `ConfirmReceipt` 按窗口取票 ⇒ worker 窗口拿到
  `REQBOARD_UNKNOWN_TICKET`。
- 设计 B-6 已声明「回执归首建窗口」，但**回执文案没有区分**。已登记为文案后续项（不影响本次判据）。

## 5. 未覆盖项（如实登记，不声称已解决）

- **FR-3 判据 3 的回执文案断言**：`triggered=true` 时提交回执不再写「下一步：调 `reqboard_ask_confirm`」，
  该分支已在 t8 改动，并有**生成物级**断言（指南三处）与**代码级**改点；但**回执文案本身**没有用例
  （需驱动 `submit(kind=plan)` 的完整链路：计划文档 + 任务表 + 自动弹框通道 + 宽限），成本高于本次收益。
  独立评审把这条列为「重要」，此处如实保留为未覆盖项，供人在验收时决定是否返工。
- **FR-6 的宿主侧端到端**：G1~G4 只跑到单元/集成层；浏览器/宿主侧端到端未做（本需求 `sides: [backend]`，无界面变更）。
- **探针等级**：`scripts/gate-inflight-probe.mts` 是**模型级**复演（门表是进程内结构，跨进程读不到活宿主的门），
  脚本头已自陈；「谁能答」一列是硬编码说明文字，不是推导量。

## 6. 平台观察（不属本需求范围）

- 立项时会**模板播种** `prototypes/INDEX.md` + `prototypes/detail.html` 两份骨架（同仓多条需求目录都有），
  而 `sides: [backend]` 的需求根本不需要原型；那份 INDEX 还写着 `authoritative`，读者会误以为存在权威原型。
  本次未删除（属播种逻辑，非本需求改动面），仅在此登记。
- 工作区存在**并发写入**（另一窗口在改 `src/client/views/panels/verify.ts`、dive 驱动与若干测试文件），
  因此"验收标准 7/8 全绿"在当前工作区不成立；归属证据见 `tests/evidence.md` §4/§4b。
