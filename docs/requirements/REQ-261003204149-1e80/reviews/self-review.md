# 交付自评（REQ-261003204149-1e80）

> 交付前的自我评审：六条 FR 逐条对照落地与证据、判别力清单、**已知残留**（不藏）。

## 一、需求目标是否达成

| FR | 落地 | 证据 |
|---|---|---|
| FR-1 回退可退任意更早节点、agent 自行发起 | `RollbackSpec` + 生成式状态机 + 移除 `implementing>design` 人工门 | `tests/rollback-domain.test.ts` 19 例；`move-rollback` TC-1/16 |
| FR-2 回退不套用"出发节点已完成"的产物门 | `assertArtifactGates` 方向性豁免 | `tests/artifact-gates.test.ts` 5 条新增；TC-4 |
| FR-3 撤销下游章与计划批准 | `applyRollbackRevocation` | `tests/rollback-revocation.test.ts` 9 例；TC-6/7/8 |
| FR-4 旧卡 canceled + 物化重做卡，回退态可重拆 | `planRollbackTasks` + 守卫 `ctx.rollbackTo` | `tests/rollback-tasks.test.ts` 7 例；`decompose-tools` 2 例；TC-9/10/11 |
| FR-5 两侧共用一处编排 | `applyRequirementRollback` + 两入口接入 | TC-13/13b 双通道对拍；`grep -c` 两侧各 ≥1 |
| FR-6 回退后注入与断点按新阶段重算 | `resetInjectionAfterRollback` | TC-14/15 |

## 二、判别力清单（本仓纪律：只测"能跑"等于没测）

| 防线 | 撤掉后必红的用例 |
|---|---|
| 产物门豁免 | TC-4（`missing_artifact`） |
| 撤销语义 | TC-7 |
| 拆分守卫放行 | TC-11 |
| 编排顺序（先算后改） | 原子性用例 |
| 双通道同源 | TC-13 |
| 断点与自动链重算 | 注入用例 |
| 回执契约声明 | `output-contract -t 回退`（消息精确指向字段名） |

七处全部实测过"撤掉即红、恢复即绿"。

## 三、关键设计不变量（交付后仍需守住）

1. **回退放宽的只有方向**：五道人工门的数量与前进语义一字未动；回程必须重新过门（TC-7/TC-11 锁死）。
2. **事故 B 防线未削弱**：非回退态"已有未取消任务即拒绝重拆"仍成立（`decompose-tools` 的"判据窄"用例）。
3. **原子性靠顺序**：编排"先算卡计划、后改需求"——这行注释是契约，改动前请先读 `rollback.ts` 的文件头。

## 四、已知残留（如实列出，供验收判断）

| # | 残留 | 影响 | 建议 |
|---|---|---|---|
| 1 | `agentNextActions` 会把回退目标与推进目标并列（`reqboard_status` 的提示用词） | 信息正确、**用词**不精；不影响合法性判定 | 可另立小卡拆成「前进／可回退」两组（判据已有现成 `isRollback`） |
| 2 | 设计文档两处表述与实现精度不符（`isRollback` 的下标比较 → 成员判定；TC-7 把"回程的门"指错位置） | 外部行为与不变量未变 | 已留痕于 `notes/t1-known-impacts.md` 与 `notes/t11-discriminative-evidence.md`；是否回写设计文档由验收决定 |
| 3 | 卡处置的落库非原子（收敛重做卡与落新卡是两次队列写） | 中途失败会停在"已收旧、未落新" | **可自愈**：此时无活卡，守卫直接放行，重拆一次即恢复（`decompose-tools` 的"回退态可重建"用例覆盖该路径） |
| 4 | 范围外 hotfix 需宿主重载插件才生效 | 当前 GUI 进程仍持旧 `dist`，四问立项/计划提交会继续报 `invalid output` | 重载插件 |

## 五、结论

六条 FR 全部落地且每条都有可跑的判别力证据；全量回归、类型检查、构建、代码回滚演练四项收口全过。
**无阻塞项**；四项残留均为"已知、可解释、有出路"，不构成交付阻塞。
