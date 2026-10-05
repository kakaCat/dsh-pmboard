# t11 判别力证据 + 两处 TC 语义澄清（REQ-261003204149-1e80）

> 本文是 t11《回退用例集》的验收证据：三条判别力 A/B 的原始结果，
> 以及实施中发现**设计 TC 表述与真实语义不符**的两处（已按真实语义落测，此处留痕）。

## 一、三条判别力 A/B（每条：撤掉一处修复 → 对应 TC 必红 → 恢复即绿）

| # | 撤掉什么 | 期望 | 实测 | 恢复后 |
|---|---|---|---|---|
| ① | 产物门的方向性豁免（`artifact-gates.ts`） | TC-4 红 | `Tests 1 failed \| 18 skipped` | 19 passed |
| ② | 撤销语义（`rollback.ts` 的 `applyRollbackRevocation` 调用） | TC-7 红 | `Tests 1 failed \| 18 skipped` | 19 passed |
| ③ | 拆分守卫的回退态放行（`DecomposeSpec.ts`） | TC-11 红 | `Tests 1 failed \| 18 skipped` | 19 passed |

复跑命令：`npx vitest run tests/move-rollback.test.ts` → **19 passed**。

## 二、澄清 1：TC-7 的期望原表述过严（设计 vs 实现）

**设计原文**（`design/test-cases.md` TC-7）："回程：直接 `design → decomposing` → 断言被
`artifact_not_confirmed` 拒（下一步必须人重新确认设计）。"

**实测**：该转移**被放行**。原因是撤销的作用域是 `stagesAfter(to)`——退回 `design` 时，
**design 自身的章不在"下游"里**，故被保留；设计文档没改写，凭它回到拆分阶段是**语义正确**的
（"人确认过的设计"这件事没有变化）。

**真正的门在哪**：回退撤销的是 `decomposition` 的章与 `plan.approvedAt`——所以被拦下的是
**再进实施**那一步（`decomposing → implementing`），必须重新交计划并获批。

**处置**：TC-7 按真实语义落测——断言"回到拆分可以，但再进实施被拦"。
**不改设计文档**：这是表述精度问题（原句把"回程的门"指错了位置），外部行为与不变量
（退过不等于免检）均未改变；回写已确认产物需走变更流程，收益不抵成本。

## 三、澄清 2：TC-11 不能跳过"重新批准计划"

**设计原文**（同文件 TC-11）："回退态下重走 `design → 批准计划 → reqboard_decompose` 落库成功"。

**实测首跑**：直接 `reqboard_decompose` → `REQBOARD_PLAN_NOT_APPROVED`。
**原因**：回退到 `design` 时 `plan.approvedAt` 已被**如实收回**（FR-3 的作用域含拆分阶段）——
这正是"退回去再上来必须重新过门"这条不变量的直接体现，**是设计意图而非缺陷**。

**处置**：TC-11 按真实路径落测——回退 → 重新批准计划 → 重拆成功，并断言重做卡被新计划收敛。

## 四、用例规模

`tests/move-rollback.test.ts` 共 **19 例**（验收要求 ≥16）：

- 编排原子性 2 例 · 双通道一致性 2 例 · 注入与断点重算 1 例
- TC 矩阵 14 例：TC-1/2/3/4/5/6/7/8/9/10/11/16/16b/13b

其中 TC-9/10 的纯函数层证据另见 `tests/rollback-tasks.test.ts`（7 例），
TC-6/7/8 的撤销层证据另见 `tests/rollback-revocation.test.ts`（9 例）。
