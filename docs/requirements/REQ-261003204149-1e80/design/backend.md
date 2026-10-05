---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
---

# 后端实现口径 · REQ-261003204149-1e80 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

> 一句话：**先补纯函数与守卫（可单测、零风险），再编排用例，最后接两侧入口**——
> 每一步都能独立跑测试，失败不往后传。

## TL;DR <!-- serves: FR-1 -->

改动集中在 6 个文件（3 改 3 新增）+ 2 个测试文件。顺序按"依赖向内、风险向外"：
domain 判定 → domain 状态机 → application 撤销/卡处置 → 用例编排 → 两侧入口 → 注入重算。

## 改动文件清单 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

| # | 文件 | 动作 | 内容 | FR |
|---|---|---|---|---|
| 1 | `src/domain/requirement/RollbackSpec.ts` | 新增 | `PIPELINE_ORDER` / `isRollback` / `stagesAfter`（纯函数，零 IO） | FR-1 |
| 2 | `src/domain/requirement/RequirementStatus.ts` | 改 | 转移表改生成式合成（`FORWARD_EDGES` + `BACKWARD_EDGES` + 终点原样）；移除 `implementing>design` 的人工门 | FR-1 |
| 3 | `src/application/internal/artifact-gates.ts` | 改 | `assertArtifactGates` 首部加 `isRollback` 豁免（与既有 `to==='canceled'` 同款） | FR-2 |
| 4 | `src/application/internal/rollback-revocation.ts` | 新增 | `applyRollbackRevocation`：撤章 / 撤批准 / `applyDocSync` / `rollback` 留痕 / 评论 | FR-3 |
| 5 | `src/application/internal/rollback-tasks.ts` | 新增 | `planRollbackTasks`：旧卡 canceled + 物化重做卡（照抄 verdicts 范式） | FR-4 |
| 6 | `src/domain/workflow/DecomposeSpec.ts` | 改 | `checkDecomposeIdempotency` 增 `ctx.rollbackTo`，回退态放行重建 | FR-4 |
| 7 | `src/application/internal/rollback.ts` | 新增 | `applyRequirementRollback`：编排 #4 + #5，供两侧共用 | FR-5 |
| 8 | `src/application/use-cases/MoveRequirement.ts` | 改 | 判定回退 → 调编排 → 回执带 `rollback`；断点与 armed 重算 | FR-1·5·6 |
| 9 | `src/application/use-cases/Decompose.ts` | 改 | 传 `ctx.rollbackTo`；落新卡前先取消未取消的重做卡 | FR-4 |
| 10 | `src/http/routers/requirements.ts` | 改 | `handleReqMove` 回退分支改调同一编排（删掉自有那段） | FR-5 |
| 11 | `src/tools/MoveTool/MoveTool.ts` | 改 | `output.schema` 声明 `rollback` 对象及其四键 | FR-1 |
| 12 | `src/shared/protocol.ts` | 改 | 新增可选字段 `RequirementRecord.rollback`、`TaskRecord.reworkOf` | FR-1·4 |
| 13 | `tests/move-rollback.test.ts` | 新增 | TC-1…TC-16（含 TC-13 双通道对拍） | 全部 |
| 14 | `tests/rollback-revocation.test.ts` | 新增 | 纯函数层：`isRollback` / `stagesAfter` / 撤章判据 | FR-2·3 |
| 15 | `tests/output-contract.test.ts` | 改 | 回退成功路径加入动态防线（`rollback` 嵌套键受递归校验） | FR-1 |

## 实施顺序与每批验证 <!-- serves: FR-1, FR-3 -->

| 批次 | 内容 | 验证命令（跑什么 → 看到什么算过） |
|---|---|---|
| B1 | #1 #2（domain 判定 + 状态机） | `npx vitest run tests/rollback-revocation.test.ts` → `isRollback` 真值表全过；既有 `tests/stage-boundary.test.ts`、`tests/status-*` 不回归 |
| B2 | #12（数据字段） | `npx tsc --noEmit` → 无新增错误 |
| B3 | #3 #4 #5 #6（豁免 + 撤销 + 卡 + 守卫） | `npx vitest run tests/artifact-gates.test.ts tests/rollback-revocation.test.ts` → 新增用例全绿，既有闸门用例不回归 |
| B4 | #7 #8 #9（编排 + 用例） | `npx vitest run tests/move-rollback.test.ts` → TC-1…TC-12、TC-16 全绿 |
| B5 | #10 #11 #15（两侧入口 + schema + 防线） | `npx vitest run tests/move-rollback.test.ts tests/output-contract.test.ts` → TC-13 对拍一致；回退用例绿，且**撤掉 schema 声明后必红** |
| B6 | #13 #14 收口 + 回归 | `npx vitest run` 失败数 ≤ 开工前基线；`pnpm build` → `[verify-client] OK` |

**顺序纪律**：B3 的豁免（#3）必须与撤销（#4）**同批落地**。只上豁免会让回退变成闸门缺口
（退了但不作废）——这是本设计里最危险的单点，不得拆成两批发布。

## 回滚路径 <!-- serves: FR-1 -->

- **代码回滚**：还原上述 15 个文件即可；新增的两个台账字段（`rollback` / `reworkOf`）被旧代码**忽略**，
  已写入的数据不会损坏台账。
- **单点可逆**：闸门豁免（#3）、守卫放宽（#6）、人工门移除（#2）三处各自都是一行级改动，
  任一处需要"先只放宽一半"时可单独还原，不影响其余。
- **行为回滚**：若发现回退过于宽松，最小止血 = 把 `implementing>design` 重新放回
  `HUMAN_ONLY_REQ_TRANSITIONS`（恢复"回退需人点"），其余撤销逻辑保留。

## 风险与对策 <!-- serves: FR-4, FR-5 -->

| 风险 | 对策 |
|---|---|
| 豁免产物门造成"退得出去但没作废" | 豁免与撤销**同批**发布；TC-6/TC-7 作为判别力证据 |
| 重做卡与旧卡语义混淆 | `reworkOf` 指向旧卡、旧卡一律 `canceled`；TC-9/TC-10 断言一一对应 |
| 放宽守卫引出幽灵任务（事故 B 重演） | 判据只认"回退态"（`rollback.to === status`）；TC-12 反向断言非回退态**仍拒绝** |
| 两侧实现分叉 | 回退编排只有一处（#7），两侧只做调用；TC-13 对拍 |
| 新增嵌套返回体触发 output schema 漂移 | #11 与 #15 同批；判别力 = 撤掉声明后测试必红（本仓当天已有两次同类事故） |
