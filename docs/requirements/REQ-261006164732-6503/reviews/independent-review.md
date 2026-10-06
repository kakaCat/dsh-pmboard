# 独立评审报告（REQ-261006164732-6503）

> **评审人**：独立子代理（只读评审，未改任何文件、未 git commit；由本窗口在验收阶段派出，
> 以满足「不复用提交者自述作复核依据」的要求）。
> **处置人**：实施窗口（本文档的第三节逐条记录处置与证据）。
> **评审对象**：12 张卡的实施结果（15 个改动源文件 + 8 个用例文件 + 1 个探针脚本）。
> **评审基准**：`requirement.md` 的 6 条 FR + 3 条 D-x 裁定 + `design/` 六份设计文档。

## 一、评审结论（评审人原文）

**不通过**——2 条阻断项，均为 FR-4「首写即事实」的可复现反例；修好约 10 行即可转「通过」。

评审人认可**真的兑现**的点：建门唯一入口收敛（`gate-request.ts` 是 src 内唯一 `port.register` 建门点）、
复用零副作用（不 settle / 不续期 / 不写台账）、`plan.approvedAt` / `approvedEvidence` 的会话弹框落地有首写守卫、
`suspendConfirm` 的「票已落定 ⇒ 中性留痕」、FR-3 恢复指引删掉「覆盖」、`findOpen` 纯读且键不含 windowKey。

## 二、发现清单（评审人原文，按级别）

### 阻断（2 条，均已复现）

1. **`confirm-settle.ts` 门合并块无首写守卫**（当时 441-448 行）：`plan.approvedAt` 受守卫保护，但同一次调用
   后面的门合并块**无条件** `art.confirmedAt = nowTs` + `confirmedEvidence = evidence` ⇒ 迟到作答覆写
   decomposition 产物的章与证据原文、重复写「用户确认（批准计划）」评论、可真的推进/开跑。
   评审人用自建只读脚本复现：`art.confirmedAt 9 → 999`、证据原文被换成迟到那次的题干。
2. **文字证据路径（`ConfirmArtifact.ts`）与看板路径（`http/routers/requirements.ts`）落章无前提、无首写不变**：
   评审人实测「同一份已落章产物再走文字证据 ⇒ `confirmedAt 9 → 1000`、`confirmedEvidence` 被换成迟到的第二次确认、
   回执 `success:true`」。FR-4 明文点名「看板重试」不得覆写。

### 重要（5 条）

3. **设计与实现不一致且设计文档未更新**：architecture A-4 / backend B-4 / interfaces I-6 写的两个前提
   （`gateOpen ∧ onSourceStage`）未按原文实现，`gateOpen` 计算后从不被读。
4. **`adopted_ticket` 可从工具面注入**：该键未在工具 `parameters` 声明，而绑定层不设 `additionalProperties:false`
   ⇒ 调用方可凭一个 ticket 绕过建门唯一入口直接弹第二个框，并跳过异门陈旧票清理。
5. **FR-3 判据 3 零用例覆盖**：回执 note 改对了，但没有任何用例断言它不含「下一步：调 reqboard_ask_confirm」。
6. **承重不足**：`verification-no-second-gate.test.ts` 标题称「只复用不开新框」，实际断言的是上游写路径守卫
   `REQBOARD_CONFIRM_PENDING`——G4 的 `reused` 分支无用例。
7. **第 6 条弹框通道未收敛**：`dive/gate-prompt.ts` 自己 `questions.ask` + 直接调 `applyConfirmDecision`，
   不经 `requestGate`、不登记 pc- 票，也不进 `pending_confirms[]` 三面同源投影。

### 次要（5 条）

8. 跨窗口复用的 ticket 在本窗口取不到回执（`ConfirmReceipt` 按窗口取），而 note 仍叫调用方去取。
9. 指南 3 处仍是无条件「用 reqboard_ask_confirm 交棒」（light / heavy / overrides 各一处）。
10. FR-6 探针是模型级复演（脚本自陈），「谁能答」是硬编码字符串。
11. `confirm-settle.ts` 无条件 `delete req.plan.rejectedAt/rejectedReason`；重复落章路径的评论无去重（已随阻断 1/2 修掉评论那半）。
12. 验收标准 7/8 在当前工作区不成立：`tsc` 1 条错误（未跟踪的 `src/client/views/panels/verify.ts`）、
    `baseline:check` 新增失败 6 条——评审人**未能**独立证明它们与本需求无关（只读纪律不允许回滚工作区）。

评审人另有「我没能验证的部分」清单（adopted_ticket 端到端可达性、Dive 双框现场、反向演练记录、
宿主侧端到端），已如实列在其报告里，本文不转述为已证结论。

## 三、处置（实施窗口逐条回应）

| # | 处置 | 证据 |
|---|---|---|
| 1 | **已修**：门合并块改用共用单点 `stampArtifactOnce`，且「门合并」评论只在真的盖上时才写 | 新增用例「门合并块（章已落 + 迁移未发生）⇒ 产物不被覆写」；**反向演练**：恢复无条件赋值 ⇒ 该例红（`expected 999 to be 9`），逐字节还原后绿 |
| 2 | **已修**：两条路径改用共用单点 `stampArtifactOnce` / `stampPlanOnce`，评论只在真的盖上时才写 | 新增用例「已落章的产物再走文字证据 ⇒ 时间戳与证据原文逐字不变、不再多写评论」；**反向演练**：恢复无条件赋值 ⇒ 该例红（`expected '迟到的第二次文字确认' to be '第一次确认的原话'`），还原后绿 |
| 3 | **未改已确认文档**，改在 `notes/execution-decisions.md` 落执行期偏差（含"为什么不按 `gateOpen` 拦"的实测依据）；设计/需求原文的更新登记为后续动作 | `notes/execution-decisions.md` |
| 4 | **已修**：工具边界显式 `delete args.adopted_ticket`（内部调用方走 `askConfirm` 直调，不受影响） | 新增用例「工具面注入 adopted_ticket 无效」：`get('pc-forged')` 为 undefined |
| 5 | **部分**：回执 note 的分支已在 t8 改动并有三处生成物级断言；**回执文案本身仍无用例**（需驱动 plan/requirement 提交链，成本与收益见 `notes/execution-decisions.md`），如实登记为未覆盖项 | `notes/execution-decisions.md` §未覆盖 |
| 6 | **已补**：新增 G4 专用用例「kind=verification 首请求 opened、再请求 reused（同一张票、票表不新增、只投递一次）」 | `tests/gate-request-uniqueness.test.ts` |
| 7 | **如实登记为已知例外**：该通道属并发窗口改动面（`gate-prompt.ts` / `round-driver.ts` 正被另一窗口改动），本次不越界改；已写明它不进 `pending_confirms[]` 投影的后果 | `notes/execution-decisions.md` §已知例外 |
| 8 | **如实登记**（文案未区分窗口归属） | 同上 |
| 9 | **已修**：三处恢复规范「下一步」行（`STAGE_CHAIN` 逐字校验，不能改写），把条件式指导作为**附加句**紧随其后；并重生成产物与 P1 基线 | `node scripts/check-prompt-fragments.mjs` 退出码 0；`stage-prompts`（37）+ `prompt-baseline`（15）+ `prompt-conditional-gate`（3）全绿 |
| 10 | 脚本头已自陈「模型级」；「谁能答」改为从既有事实推导过重，如实登记 | 同上 |
| 11 | `rejectedAt` 的删除保留（它是"撤销拒绝"语义，不是落章字段）；评论去重已随 #1/#2 修掉 | 代码注释 + 上表 #1/#2 的用例 |
| 12 | 保留为**外部噪音**，并在交验材料里逐条归属（含 mtime 证据）；评审人未独立证明，本窗口同样**不声称已证明**，只给证据链 | `tests/evidence.md` §4/§4b |

## 四、结论（处置后）

- 两条**阻断项已修**，且都补了承重用例 + 反向演练（改坏即红、逐字节还原）。
- 重要项 4 / 6 / 9 已修；3 / 7 / 8 / 10 / 11 已如实登记（其中 7 属并发窗口改动面，本次不越界）。
- 未覆盖项（5 的回执文案断言）与外部噪音（12）**不作"已解决"声明**，留给人在验收时判定。
