# REQ-261003204149-1e80 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：需求级回退从「改一个状态字段」升级为有账可查的原子事务——退得动（回退方向对 agent 放行、可退任意更早节点）、退得干净（下游确认章与计划批准如实作废）、退得有归宿（旧卡 canceled + 物化重做卡，回退态可重新拆分）、退完不迷路（断点与自动链按新阶段重算）、两侧同源（工具侧与看板侧共用一处编排）。回程上五道人工门一道未动。13 张卡收口：全量失败数与现场基线持平（98=98）、tsc 150=150、构建 verify-client OK、代码回滚演练通过。已知残留 4 项（提示用词、两处设计表述精度、卡落库非原子但可自愈、hotfix 需重载插件）已在文档中逐条写明，无阻塞项。

## 1. 验收列表

### v1-1 · 回退判定与状态机：RollbackSpec + 生成式转移表

**验收内容**：【回退判定与状态机：RollbackSpec + 生成式转移表】验收

**操作步骤**：
1. 新增 tests/rollback-domain.test.ts 并跑 npx vitest run tests/rollback-domain.test.ts：① isRollback 真值表（同阶段=false、前进=false、archived→design=false）
2. ② implementing 出边含 design/brainstorming/draft
3. ③ archived 与 done 仍无出边
4. ④ 四类人工门仍在集合内。另跑 npx vitest run tests/stage-boundary.test.ts tests/layer-boundary.test.ts 不回归。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：全量回归：npx vitest run → 98 failed / 3418 passed ＝ 现场基线 98（双向差集为空；通过数 +62 全为本需求新增用例）

**验收状态**：✓ 通过

---

### v1-2 · 数据契约：rollback / reworkOf 可选字段

**验收内容**：【数据契约：rollback / reworkOf 可选字段】验收

**操作步骤**：
1. npx tsc --noEmit 错误数 ≤ 开工前基线 150
2. npx vitest run tests/queue tests/reqboard 不回归（旧台账与旧队列卡无这两个字段时读取行为与现状一致）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：全量回归：npx vitest run → 98 failed / 3418 passed ＝ 现场基线 98（双向差集为空；通过数 +62 全为本需求新增用例）

**验收状态**：✓ 通过

---

### v1-3 · 回退撤销语义：撤章 + 撤批准 + 标待同步

**验收内容**：【回退撤销语义：撤章 + 撤批准 + 标待同步】验收

**操作步骤**：
1. 新增 tests/rollback-revocation.test.ts 并跑全绿：① 目标 design 时 stage 晚于 design 的产物全部无章，且 design 自身不被误撤
2. ② plan.approvedAt===undefined
3. ③ 连续两次回退到同一目标，docSyncPending 无重复 source 条目。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：全量回归：npx vitest run → 98 failed / 3418 passed ＝ 现场基线 98（双向差集为空；通过数 +62 全为本需求新增用例）

**验收状态**：✓ 通过

---

### v1-4 · 旧任务卡处置：canceled + 物化重做卡

**验收内容**：【旧任务卡处置：canceled + 物化重做卡】验收

**操作步骤**：
1. 新增 tests/rollback-tasks.test.ts 并跑全绿：① 2 张旧卡（done + in_progress）全部 canceled
2. ② 重做卡数=2 且 reworkOf 一一指向旧卡、dependsOn 为空、status==='todo'
3. ③ 每张旧卡 revisions 含 1 条 kind='rollback'。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：全量回归：npx vitest run → 98 failed / 3418 passed ＝ 现场基线 98（双向差集为空；通过数 +62 全为本需求新增用例）

**验收状态**：✓ 通过

---

### v1-5 · 产物闸门方向性豁免（与撤销同批）

**验收内容**：【产物闸门方向性豁免（与撤销同批）】验收

**操作步骤**：
1. npx vitest run tests/artifact-gates.test.ts 全绿：① decomposing→design 且无 decomposition 产物时返回 undefined
2. ② 前进方向 decomposing→implementing 计划未确认时仍返回 artifact_not_confirmed
3. ③ →canceled 豁免不变。判别力：临时删除该豁免 → ① 必红。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：全量回归：npx vitest run → 98 failed / 3418 passed ＝ 现场基线 98（双向差集为空；通过数 +62 全为本需求新增用例）

**验收状态**：✓ 通过

---

### v1-6 · 拆分守卫：回退态可重建且不产双份卡

**验收内容**：【拆分守卫：回退态可重建且不产双份卡】验收

**操作步骤**：
1. npx vitest run tests/decompose-tools.test.ts 全绿：① 回退态重拆成功且未取消卡数=新计划卡数（无重复无幽灵卡）
2. ② 非回退态重复拆分仍返回 REQBOARD_ALREADY_DECOMPOSED（事故 B 防线未削弱）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：全量回归：npx vitest run → 98 failed / 3418 passed ＝ 现场基线 98（双向差集为空；通过数 +62 全为本需求新增用例）

**验收状态**：✓ 通过

---

### v1-7 · 回退编排单点：applyRequirementRollback

**验收内容**：【回退编排单点：applyRequirementRollback】验收

**操作步骤**：
1. npx vitest run tests/move-rollback.test.ts -t 原子性 绿：注入卡处置抛错后，状态、章、计划批准、任务卡四项全部保持回退前原样（无中间态）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：全量回归：npx vitest run → 98 failed / 3418 passed ＝ 现场基线 98（双向差集为空；通过数 +62 全为本需求新增用例）

**验收状态**：✓ 通过

---

### v1-8 · 接口契约：reqboard_move 回执与 schema 声明

**验收内容**：【接口契约：reqboard_move 回执与 schema 声明】验收

**操作步骤**：
1. npx vitest run tests/tools-schema.test.ts tests/output-contract.test.ts 不回归
2. grep -n rollback src/tools/MoveTool/MoveTool.ts 可见 rollback 与四个子键的声明。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：全量回归：npx vitest run → 98 failed / 3418 passed ＝ 现场基线 98（双向差集为空；通过数 +62 全为本需求新增用例）

**验收状态**：✓ 通过

---

### v1-9 · 用例接入：工具侧与看板侧共用编排

**验收内容**：【用例接入：工具侧与看板侧共用编排】验收

**操作步骤**：
1. npx vitest run tests/move-rollback.test.ts -t 双通道 绿：同一 from→to 经工具与经 route 得到相同 status、错误码与回执结构
2. grep -c applyRequirementRollback 在 MoveRequirement.ts 与 requirements.ts 各 ≥1（回退逻辑无第二处实现）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：全量回归：npx vitest run → 98 failed / 3418 passed ＝ 现场基线 98（双向差集为空；通过数 +62 全为本需求新增用例）

**验收状态**：✓ 通过

---

### v1-10 · 注入与断点重算：pendingAction + dive armed

**验收内容**：【注入与断点重算：pendingAction + dive armed】验收

**操作步骤**：
1. npx vitest run tests/move-rollback.test.ts -t 注入 绿：① 回退到 design 后断点 pendingAction 为设计阶段动作且不含验收/实施指引
2. ② 回退后 dive.activation==='disarmed'。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：全量回归：npx vitest run → 98 failed / 3418 passed ＝ 现场基线 98（双向差集为空；通过数 +62 全为本需求新增用例）

**验收状态**：✓ 通过

---

### v1-11 · 回退用例集：TC-1…TC-16 + 双通道对拍

**验收内容**：【回退用例集：TC-1…TC-16 + 双通道对拍】验收

**操作步骤**：
1. npx vitest run tests/move-rollback.test.ts 全绿且用例数 ≥16
2. 判别力 A/B 三条各做一次并留证据到 notes/：撤豁免→TC-4 红、撤撤销→TC-7 红、撤守卫放宽→TC-11 红。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：全量回归：npx vitest run → 98 failed / 3418 passed ＝ 现场基线 98（双向差集为空；通过数 +62 全为本需求新增用例）

**验收状态**：✓ 通过

---

### v1-12 · 输出契约防线：回退回执加入动态校验

**验收内容**：【输出契约防线：回退回执加入动态校验】验收

**操作步骤**：
1. npx vitest run tests/output-contract.test.ts -t 回退 绿
2. 判别力：临时从 schema 删掉 tasks_reworked 声明 → 该用例必红且消息含 未在 output.schema 声明。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：全量回归：npx vitest run → 98 failed / 3418 passed ＝ 现场基线 98（双向差集为空；通过数 +62 全为本需求新增用例）

**验收状态**：✓ 通过

---

### v1-13 · 兼容与回归收口：旧数据 + 基线 + 构建

**验收内容**：【兼容与回归收口：旧数据 + 基线 + 构建】验收

**操作步骤**：
1. ① npx vitest run 失败数 ≤ 开工前基线（先在 HEAD 取数留档）
2. ② npx tsc --noEmit 无新增错误
3. ③ pnpm build 退出码 0 且输出含 [verify-client] OK
4. ④ 代码回滚演练：还原本轮改动后 npx vitest run tests/queue 不回归。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：全量回归：npx vitest run → 98 failed / 3418 passed ＝ 现场基线 98（双向差集为空；通过数 +62 全为本需求新增用例）

**验收状态**：✓ 通过

---

### v1-14 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：全量回归：npx vitest run → 98 failed / 3418 passed ＝ 现场基线 98（双向差集为空；通过数 +62 全为本需求新增用例）

**验收状态**：✓ 通过

---

### v1-15 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：全量回归：npx vitest run → 98 failed / 3418 passed ＝ 现场基线 98（双向差集为空；通过数 +62 全为本需求新增用例）

**验收状态**：✓ 通过

---

## 2. 测试报告

- 全量回归：npx vitest run → 98 failed / 3418 passed ＝ 现场基线 98（双向差集为空；通过数 +62 全为本需求新增用例）
- 类型检查：npx tsc --noEmit → 150 = 开工前基线 150，无新增错误
- 构建：pnpm build → 退出码 0，[verify-client] OK（bundle=337856 bytes）
- 代码回滚演练：暂存本需求全部改动 → tests/queue 122 passed → stash pop 恢复（新增文件均在位，复跑 38 passed）
- 回退专项：tests/move-rollback.test.ts 19 passed（含原子性/双通道/注入/TC 矩阵）＋ rollback-domain 19 ＋ rollback-revocation 9 ＋ rollback-tasks 7 ＋ artifact-gates 32 ＋ decompose-tools 25（5 条红与基线逐字相同）
- 判别力 A/B：七处防线各自实测「撤掉即红、恢复即绿」（豁免/撤销/守卫/编排顺序/双通道/断点重算/回执声明）
- 详细证据与覆盖标注：docs/requirements/REQ-261003204149-1e80/tests/evidence.md（含 59 条 covers 标注）
- 交付自评与已知残留：docs/requirements/REQ-261003204149-1e80/reviews/self-review.md
- 过程留痕：notes/t1-known-impacts.md、notes/t11-discriminative-evidence.md、notes/t13-compat-evidence.md

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 回退判定与状态机：RollbackSpec + 生成式转移表 | ✓ 通过 | human/session-a3e5e82b-b588-4c77-b458-9c2065eb0e87 | 2026-10-03 21:31 |
| v1-2 | 数据契约：rollback / reworkOf 可选字段 | ✓ 通过 | human/session-a3e5e82b-b588-4c77-b458-9c2065eb0e87 | 2026-10-03 21:31 |
| v1-3 | 回退撤销语义：撤章 + 撤批准 + 标待同步 | ✓ 通过 | human/session-a3e5e82b-b588-4c77-b458-9c2065eb0e87 | 2026-10-03 21:31 |
| v1-4 | 旧任务卡处置：canceled + 物化重做卡 | ✓ 通过 | human/session-a3e5e82b-b588-4c77-b458-9c2065eb0e87 | 2026-10-03 21:31 |
| v1-5 | 产物闸门方向性豁免（与撤销同批） | ✓ 通过 | human/session-a3e5e82b-b588-4c77-b458-9c2065eb0e87 | 2026-10-03 21:31 |
| v1-6 | 拆分守卫：回退态可重建且不产双份卡 | ✓ 通过 | human/session-a3e5e82b-b588-4c77-b458-9c2065eb0e87 | 2026-10-03 21:31 |
| v1-7 | 回退编排单点：applyRequirementRollback | ✓ 通过 | human/session-a3e5e82b-b588-4c77-b458-9c2065eb0e87 | 2026-10-03 21:31 |
| v1-8 | 接口契约：reqboard_move 回执与 schema 声明 | ✓ 通过 | human/session-a3e5e82b-b588-4c77-b458-9c2065eb0e87 | 2026-10-03 21:31 |
| v1-9 | 用例接入：工具侧与看板侧共用编排 | ✓ 通过 | human/session-a3e5e82b-b588-4c77-b458-9c2065eb0e87 | 2026-10-03 21:31 |
| v1-10 | 注入与断点重算：pendingAction + dive armed | ✓ 通过 | human/session-a3e5e82b-b588-4c77-b458-9c2065eb0e87 | 2026-10-03 21:31 |
| v1-11 | 回退用例集：TC-1…TC-16 + 双通道对拍 | ✓ 通过 | human/session-a3e5e82b-b588-4c77-b458-9c2065eb0e87 | 2026-10-03 21:32 |
| v1-12 | 输出契约防线：回退回执加入动态校验 | ✓ 通过 | human/session-a3e5e82b-b588-4c77-b458-9c2065eb0e87 | 2026-10-03 21:32 |
| v1-13 | 兼容与回归收口：旧数据 + 基线 + 构建 | ✓ 通过 | human/session-a3e5e82b-b588-4c77-b458-9c2065eb0e87 | 2026-10-03 21:32 |
| v1-14 | 需求级验收 | ✓ 通过 | human/session-a3e5e82b-b588-4c77-b458-9c2065eb0e87 | 2026-10-03 21:32 |
| v1-15 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-a3e5e82b-b588-4c77-b458-9c2065eb0e87 | 2026-10-03 21:32 |
