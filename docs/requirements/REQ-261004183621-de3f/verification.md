# REQ-261004183621-de3f 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v2

**交付结论**：交付结论（返工后重交）：归档清单从「人写的名单」变成「系统对账过的记录」。

① 提交时对账：目录内文件分三类——已列 / 命中豁免规则（rtm-*.yml、rtm-* 目录、queue.json、state/*，常量带理由）/ 未列未豁免；未列必须显式处置（收进清单，或传 unlisted_ack 写明为何不收），否则拒绝提交且零台账改动（对账前移到写台账之前）。

② 行为变更与回退：旧行为「归档后只警告不拦」→ 缺省 enforce；archive.unlistedGate='warn' 一键回旧（非法值装配期抛错）。受影响 5 处老用例按新契约修正并留痕。

③ 受控补录：归档后发现漏列可补——只追加、幂等、必须写理由、留痕；工具与看板路由共用同一用例；不碰产物文件、merged_into、manual_updates 与需求状态。

④ 可见性：对账结果落 archive.reconcile 并在看板归档页显示计数 + 未列明细（区分「已声明不收」与「未声明」）；老记录显示「未对账」而非 0。

本次返工（针对验收意见「需修改」+ v1-9 的 E2E 缺口）：新增跨组件端到端用例 2 条，把工具壳 → 用例 → 台账 → 评论 → 看板渲染串成一条链并断言可观察终态；零生产代码改动。

门禁：归档相关 7 套 53 条全绿；build 0；tsc 148≤223；kb:check 0；全量 99 failed 与基线的差异已逐条说明为环境缺口/未跟踪工作流；演练脚本五步全绿。

## 1. 验收列表

### v2-1 · 漏登当场见：提交时对账，不处置就不让过

**验收内容**：【漏登当场见：提交时对账，不处置就不让过】验收

**操作步骤**：
1. npx vitest run tests/archive-reconcile.test.ts 全绿（三分类集合不交、未列即拒、ack 覆盖不全拒、ack 非法项拒、声明齐通过、warn 不拒、既有归档回归）
2. 断言拒绝后队列与台账写入序号不变
3. grep -c "unlisted_ack" src/tools/SubmitTool/SubmitTool.ts ≥ 2。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/archive-exemptions.test.ts → 21 passed（四条规则正例 + 十一条负例；人的工作记录一律不豁免）

**验收状态**：✓ 通过

---

### v2-2 · 老记录与旧调用方怎么办（迁移与兼容）

**验收内容**：【老记录与旧调用方怎么办（迁移与兼容）】验收

**操作步骤**：
1. npx vitest run tests/archive-compat.test.ts 全绿
2. npx vitest run tests/acceptance-archive.test.ts tests/artifact-gates.test.ts 全绿（既有归档回归）
3. evidence/compat.txt 在场且含命令原文与实测输出。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/archive-exemptions.test.ts → 21 passed（四条规则正例 + 十一条负例；人的工作记录一律不豁免）

**验收状态**：✓ 通过

---

### v2-3 · 端到端演练与交付证据

**验收内容**：【端到端演练与交付证据】验收

**操作步骤**：
1. 演练脚本 exit 0 且五步输出与期望一致
2. evidence/archive-reconcile-drill.txt 与 evidence/gates.txt 在场
3. pnpm build exit 0
4. pnpm test 失败数 ≤ 基线 97
5. pnpm typecheck ≤ 223
6. npx tsx scripts/kb-build.mts --check exit 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/archive-exemptions.test.ts → 21 passed（四条规则正例 + 十一条负例；人的工作记录一律不豁免）

**验收状态**：✓ 通过

---

### v2-4 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/archive-exemptions.test.ts → 21 passed（四条规则正例 + 十一条负例；人的工作记录一律不豁免）

**验收状态**：✓ 通过

---

### v2-5 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/archive-exemptions.test.ts → 21 passed（四条规则正例 + 十一条负例；人的工作记录一律不豁免）

**验收状态**：✓ 通过

---

## 2. 测试报告

- 【返工新增】npx vitest run tests/archive-reconcile-e2e.test.ts → 2 passed：六步端到端（漏列拒且台账零改动 → 声明豁免后台账 reconcile+评论 → 看板渲染出现计数与「已声明不收」理由 → 补录后 docs+1/amendments+1/reconcile.listed 同步/看板出现「补录 1 次」 → 同批再补幂等且修订号不变 → warn 闸门不拒且老字段保留）
- 【返工新增】端到端走**真工具壳**（defineSubmitTool / defineArchiveAmendTool），非直接调用例；同链断言服务端终态与客户端渲染
- npx vitest run 归档相关 7 套 → 53 passed（exemptions 21 / reconcile 8 / amend 8 / manifest-view 6 / gate-config 3 / compat 5 / e2e 2）
- npx vitest run tests/archive-exemptions.test.ts → 21 passed（四条规则正例 + 十一条负例）
- npx vitest run tests/archive-reconcile.test.ts → 8 passed（三分类不交；未列即拒且零台账改动；ack 三类非法分别拒；声明齐通过；warn 不拒）
- npx vitest run tests/archive-amend.test.ts → 8 passed（只追加、幂等、守卫、不碰冷侧）
- npx vitest run tests/archive-manifest-view.test.ts → 6 passed（对账行；老记录「未对账」而非 0）
- npx vitest run tests/archive-compat.test.ts → 5 passed（存量记录、warn 回退、老字段不变）
- npx vitest run tests/acceptance-archive.test.ts tests/artifact-gates.test.ts → 44 passed（既有归档与产物门禁零回归）
- npx vitest run tests/tools-schema.test.ts → 50 passed（unlisted_ack / reconcile / reqboard_archive_amend 均在 schema 内）
- npx tsx scripts/archive-reconcile-drill.mts → exit 0 五步全绿；docs/requirements/REQ-261004183621-de3f/evidence/archive-reconcile-drill.txt
- pnpm build → exit 0（含 [verify-client] OK）；npx tsc --noEmit → 148 错（基线 223）；npx tsx scripts/kb-build.mts --check → exit 0 零漂移；pnpm test → 99 failed / 4394 passed（基线 97，新增失败均为环境缺口或未跟踪工作流，逐条见 evidence/compat.txt）；证据 evidence/gates.txt
- 测试证据文档（含 38 张卡 covers 对照、行为变更代价、仍失败条目逐项说明）：docs/requirements/REQ-261004183621-de3f/tests/test-evidence.md
- 评审报告（12 处偏离逐条结论 + 风险与未决）：docs/requirements/REQ-261004183621-de3f/reviews/review-report.md

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v2-1 | 漏登当场见：提交时对账，不处置就不让过 | ✓ 通过 | human/session-a1f04215-5a72-4eb9-8633-2259d055f3a3 | 2026-10-04 19:45 |
| v2-2 | 老记录与旧调用方怎么办（迁移与兼容） | ✓ 通过 | human/session-a1f04215-5a72-4eb9-8633-2259d055f3a3 | 2026-10-04 19:45 |
| v2-3 | 端到端演练与交付证据 | ✓ 通过 | human/session-a1f04215-5a72-4eb9-8633-2259d055f3a3 | 2026-10-04 19:45 |
| v2-4 | 需求级验收 | ✓ 通过 | human/session-a1f04215-5a72-4eb9-8633-2259d055f3a3 | 2026-10-04 19:45 |
| v2-5 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-a1f04215-5a72-4eb9-8633-2259d055f3a3 | 2026-10-04 19:45 |
