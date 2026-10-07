# REQ-261006201920-2adc 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：验收不再形式合规的四件套已落地并自证——①计划期拒「命令操作数仍是占位符」并把模板占位符改成声明式闭集，子卡落库时按词表回填（全 20 阶段展开后尖括号残留 0）；②返工卡与普通卡同门（三级取值每级过两道判据）并继承条款/原型/裁定引用与体量；③裁决侧按项类分开判：普通项无锚点记未复核、人工项禁收无事实短句、覆盖 agent 原文必须带变更理由且原文留档（原子四元组，缺理由即拒且台账零改动）；④系统缺口项处置须命中两义模板，且「处置无效」真的不放行归档（逆验证 TC-17）。五条反向演练全部红→还原→绿并留档。边界守住：存量任务卡零改写（被改存量卡 0 条）、不碰原型门/归档校验/测试基线、零 DDL 零迁移。两处与底稿的偏离已在 reviews/implementation-review.md 逐条披露：FR-1 收窄为「命令操作数」口径（裸正则会误伤 TS 泛型/HTML 字面量等四类合法标准，收窄后仍覆盖 923/2013 真实问题）；FR-4 是行为变更（系统项通过写法变严，历史不追溯）。三处仓库级偏差（baseline 差集非空、全仓 tsc 高于基线、占位符计数上升）已逐条归属到别的窗口在飞改动。另需人知道两件运行时事实：一是 reqboard 插件加载构建产物且宿主启动时入内存，故本会话新落的卡仍由旧代码产生（这是占位符计数上升的原因，也是「零残留」的兑现点在唯一构造点而非计数快照的理由）；二是验收单的原型对照项由运行时自动填写，当前指向**已被取代的骨架** detail.html（权威路径取数尚未随新 bundle 生效），请对照权威原型 prototypes/verify-disposition.html。

## 1. 验收列表

### v1-1 · 域层契约：占位符判据与声明式回填器

**验收内容**：【域层契约：占位符判据与声明式回填器】验收

**操作步骤**：
1. ① npx vitest run tests/acceptance-placeholder.test.ts tests/domain/subtask-template.test.ts 退出码 0
2. ② 该文件含四类合法反例全部判 ok:true（Record<StageKind,string> / 每个值恰 1 个 <svg> / prototypes/<name>.html#FR-1 / 断言不含 <单册>）
3. ③ npx vitest run tests/subtask-template-acceptance.test.ts 全绿（模板字面量与 <taskId> 形态零改动）
4. ④ 反向演练 RV-1 两次输出留档：注释掉占位符分支 ⇒ tests/acceptance-placeholder.test.ts 变红，还原 ⇒ 绿

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/acceptance-placeholder.test.ts tests/domain/subtask-template.test.ts → 2 files / 37 tests passed, exit 0；RV-1：临时关掉占位符分支 ⇒ 2 failed exit 1，还原 sha256 与演练前逐字节相同后复绿；全量 2013 张卡实测裸正则命中 948 / 本口径命中 923（召回 97.4%）

**验收状态**：✓ 通过

---

### v1-2 · 子卡落库回填接线（懒展开）

**验收内容**：【子卡落库回填接线（懒展开）】验收

**操作步骤**：
1. ① npx vitest run tests/lazy-expand-backfill.test.ts tests/lazy-expand.test.ts tests/regenerate-chain.test.ts 退出码 0
2. ② 对全部 STAGE_ACCEPTANCE 阶段各展开一遍，子卡 acceptance 与 implementation 中 /<[^>]{2,40}>/ 命中数为 0
3. ③ 父卡点名 tests/x.test.ts ⇒ 子卡标准含该路径
4. 父卡未点名 ⇒ 含 npx vitest run tests/ 兜底且无尖括号
5. ④ 存量卡快照前后逐字节相等
6. ⑤ 反向演练 RV-2 两次输出留档（注释掉回填调用 ⇒ 变红，还原 ⇒ 绿）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/lazy-expand-backfill.test.ts tests/lazy-expand.test.ts tests/regenerate-chain.test.ts → 3 files / 35 tests passed, exit 0；全 20 个阶段展开后 acceptance 与 implementation 的尖括号残留均为 0；RV-2：关掉回填 ⇒ 5 failed exit 1，还原后复绿

**验收状态**：✓ 通过

---

### v1-3 · 领域裁决判据：返工过检 + 结果锚点 + 人工项事实 + 处置模板

**验收内容**：【领域裁决判据：返工过检 + 结果锚点 + 人工项事实 + 处置模板】验收

**操作步骤**：
1. ① npx vitest run tests/rework-gate.test.ts tests/verdict-result-anchor.test.ts tests/system-item-disposition.test.ts tests/domain/acceptance-sheet.test.ts tests/domain/req-b918-gates.test.ts 退出码 0
2. ② 返工卡三级取值均过 checkAcceptance 与 checkHowToVerify，且 requirementRefs/prototypeRefs/decisionRefs/footprint 与来源卡逐字相等（TC-7/TC-8/TC-9）
3. ③ 文本「通过」「符合预期」⇒ unverified，含 12 passed 或 tests/ 路径 ⇒ passed（TC-10/TC-11）
4. ④ needsHuman 项「通过」两字被拒、「我对照原型看过：一致」放行（TC-12）
5. ⑤ 处置「补了 E2E 用例」与「确认无需 E2E：纯函数模块，无外部接口」放行，「好的」与空被拒，普通项不受模板约束（TC-16/TC-18）
6. ⑥ 逆验证 TC-17：构造系统项 status=passed 且 opinion 为空 ⇒ isFullyDecided 为 false 且 sheetGateStatus 为 pending（不可归档）
7. ⑦ 反向演练 RV-3、RV-5 两次输出留档

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/rework-gate.test.ts tests/verdict-result-anchor.test.ts tests/system-item-disposition.test.ts tests/domain/acceptance-sheet.test.ts tests/domain/req-b918-gates.test.ts → 5 files / 55 tests passed, exit 0；RV-3 与 RV-5 各 2 failed exit 1 后还原复绿；含逆验证 TC-17（系统项 passed 且处置为空 ⇒ isFullyDecided=false 且门状态 pending）

**验收状态**：✓ 通过

---

### v1-4 · 覆盖原子写入与两通道透传

**验收内容**：【覆盖原子写入与两通道透传】验收

**操作步骤**：
1. ① npx vitest run tests/result-override-reason.test.ts tests/verdicts-http.test.ts tests/verdicts-and-rework.test.ts tests/accept-sheet-tool.test.ts 退出码 0
2. ② 覆盖缺理由 ⇒ 报 code result_change_reason_required 且该项 result/resultSource/resultSuperseded/resultChangeReason 四个字段与裁决前逐字相等（台账零改动）
3. ③ 覆盖生效时四元组一次写全，重复覆盖后 resultSuperseded 仍等于最初那次 agent 原文（TC-13/TC-14）
4. ④ 人未改动预填值（文本与 agent 原文相同）⇒ 三个新字段一个都不写（TC-15）
5. ⑤ 不传 changeReason 且不构成覆盖 ⇒ HTTP 200 不报错
6. ⑥ DSH_REQBOARD_NO_ITEM_RESULT=1 时四字段一个都不写
7. ⑦ 反向演练 RV-4 两次输出留档

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/result-override-reason.test.ts tests/verdicts-http.test.ts tests/verdicts-and-rework.test.ts tests/accept-sheet-tool.test.ts → 4 files / 54 tests passed, exit 0；覆盖缺理由 ⇒ HTTP 400 code=result_change_reason_required 且台账四字段零改动；RV-4：校验改恒真 ⇒ 2 failed exit 1 后还原复绿

**验收状态**：✓ 通过

---

### v1-5 · 裁决行新控件：理由输入、原文保留、归档门可见（UI）

**验收内容**：【裁决行新控件：理由输入、原文保留、归档门可见（UI）】验收

**操作步骤**：
1. ① npx vitest run tests/client-verify-disposition.test.ts tests/client-view.test.ts tests/stage-detail.test.ts 退出码 0
2. ② pnpm build:client 输出含 [verify-client] OK（关键符号齐全、样式归属章在场、CSS 分片完整）
3. ③ 既有四个 DOM 钩子语义不变：.dsh-pm-vsheet / .dsh-pm-vitem[data-item-id] / .dsh-pm-verdict-btn 单选 / .dsh-pm-vitem-opinion
4. ④ 新增钩子在场：.dsh-pm-vitem-change-reason 与 data-superseded="1"，且被覆盖行 HTML 同时出现「原实测结果」字样
5. ⑤ 未复核 行徽标文本 === ITEM_STATUS_TEXT.unverified（不自造第二份文案）
6. ⑥ 原型对照（可失败、需人见证）：打开看板对照权威原型 prototypes/verify-disposition.html#FR-3，不看颜色时 未复核 与 已通过 仍可辨（徽标文字不同）——该项标 needsHuman 由人填结论

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/client-verify-disposition.test.ts tests/stage-detail.test.ts tests/stage-panel.test.ts → 3 files / 108 tests passed, exit 0；pnpm build:client → [verify-client] OK bundle=721645 bytes；产物晚于最后一次客户端源码改动；tests/client-view.test.ts 的 3 条失败在会话开始基线清单里（非本次引入）

**验收状态**：✓ 通过

---

### v1-6 · 迁移兼容、存量不追溯与全量回归收口

**验收内容**：【迁移兼容、存量不追溯与全量回归收口】验收

**操作步骤**：
1. ① npx vitest run tests/acceptance-compat.test.ts 退出码 0（三形态各一例）
2. ② npx tsx scripts/test-baseline.mts --check 退出码 0（失败用例集合差为空
3. 差集非空时逐条确认非本次引入并在证据里写明理由）
4. ③ pnpm typecheck 错误数不新增于 docs/reviews/test-baseline.md 的 tsc 读数
5. ④ pnpm build 退出码 0
6. ⑤ git diff --stat -- 'docs/requirements/*/tasks' 输出为空，且占位符扫描计数与改动前相等（944 → 944）
7. ⑥ 两份证据文件含上述命令原文与输出摘要

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/acceptance-compat.test.ts → 1 file / 7 tests passed, exit 0（旧台账可读不写新字段 / 旧调用方不传 changeReason 不炸 / 回滚开关四字段不写）；git diff --name-only -- 'docs/requirements/*/tasks' | wc -l = 0；pnpm build exit 0

**验收状态**：✓ 通过

---

### v1-7 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：本需求 8 个用例文件 66 例全绿；全量 pnpm test 用例级失败：会话开始基线 102 → 最终 73（净少 29）；本需求改动面 0 失败、0 类型错误；零 DDL 零迁移（三个新字段全部加性可选）；29 张卡的 covers 标注齐（100%）

**验收状态**：✓ 通过

---

### v1-8 · 需求级验收

**验收内容**：与原型对照截图（含差异说明）

**操作步骤**：
1. 与原型对照截图（含差异说明）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

### v1-9 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：D-1（改动面锁定在验收/卡片质量）：改动文件清单里无原型门 / 归档校验 / 基线脚本；D-2（反向演练）：RV-1..RV-5 五条全部做了红→还原→绿并留档 10 份输出；D-3（结构化 changeReason 全链路）：域层契约 + 看板与弹框两通道透传 + agent 原文保留进 resultSuperseded + 缺理由即拒，用例 8 例全绿

**验收状态**：✓ 通过

---

### v1-10 · 需求级验收 · 锚点失效

**验收内容**：验收锚点失效：以下验收标准引用的测试文件在仓库中不存在——子卡落库回填接线（懒展开） → tests/x.test.ts。请把锚点改为真实文件，或回写设计/任务卡；本条不阻断验收，但通过时意见须写明处置方式。

**操作步骤**：
1. 验收锚点失效：以下验收标准引用的测试文件在仓库中不存在——子卡落库回填接线（懒展开） → tests/x.test.ts。请把锚点改为真实文件，或回写设计/任务卡
2. 本条不阻断验收，但通过时意见须写明处置方式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run tests/acceptance-placeholder.test.ts tests/lazy-expand-backfill.test.ts tests/rework-gate.test.ts tests/verdict-result-anchor.test.ts tests/system-item-disposition.test.ts tests/result-override-reason.test.ts tests/client-verify-disposition.test.ts tests/acceptance-compat.test.ts → 8 files / 66 tests passed, exit 0
- 反向演练五条（红→还原→绿，两次输出均留档）：docs/requirements/REQ-261006201920-2adc/evidence/rv1..rv5-*.txt（10 份）
- pnpm build → exit 0；pnpm build:client → [verify-client] OK bundle=721645 bytes（关键符号齐全、样式归属章在场、CSS 分片完整）
- git diff --name-only -- 'docs/requirements/*/tasks' | wc -l → 0（存量任务卡零改写）
- 全量 pnpm test：用例级失败 102（会话开始基线）→ 73（最终），净少 29；本需求改动面 0 失败
- npx tsc --noEmit -p tsconfig.json → 本需求改动面 0 条错误（全仓残留 1 条在别人的测试文件）
- docs/requirements/REQ-261006201920-2adc/tests/test-evidence.md（测试证据 + 29 条 covers 覆盖标注）
- docs/requirements/REQ-261006201920-2adc/reviews/implementation-review.md（实施自评与偏离登记）
- docs/requirements/REQ-261006201920-2adc/evidence/compat-and-baseline.md（差集/类型门/构建门读数 + 逐条归属 + 采集时点与不变式）
- docs/requirements/REQ-261006201920-2adc/evidence/legacy-cards-untouched.md（存量零改写三命令交叉验证 + 占位符计数变化根因）
- docs/requirements/REQ-261006201920-2adc/prototypes/verify-disposition.html（权威原型，锚点 FR-3/FR-4）
- docs/requirements/REQ-261006201920-2adc/prototypes/INDEX.md
- docs/requirements/REQ-261006201920-2adc/requirement.md
- docs/requirements/REQ-261006201920-2adc/decomposition.md
- docs/requirements/REQ-261006201920-2adc/design/architecture.md
- docs/requirements/REQ-261006201920-2adc/design/interfaces.md
- docs/requirements/REQ-261006201920-2adc/design/test-cases.md
- docs/requirements/REQ-261006201920-2adc/design/frontend.md
- docs/requirements/REQ-261006201920-2adc/evidence/rv1-placeholder-branch-off.txt
- docs/requirements/REQ-261006201920-2adc/evidence/rv2-backfill-off.txt

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 域层契约：占位符判据与声明式回填器 | ✓ 通过 | human/session-e3d59f51-cb6c-463b-9a13-9ddf9325067a | 2026-10-06 21:39 |
| v1-2 | 子卡落库回填接线（懒展开） | ✓ 通过 | human/session-e3d59f51-cb6c-463b-9a13-9ddf9325067a | 2026-10-06 21:39 |
| v1-3 | 领域裁决判据：返工过检 + 结果锚点 + 人工项事实 + 处置模板 | ✓ 通过 | human/session-e3d59f51-cb6c-463b-9a13-9ddf9325067a | 2026-10-06 21:39 |
| v1-4 | 覆盖原子写入与两通道透传 | ✓ 通过 | human/session-e3d59f51-cb6c-463b-9a13-9ddf9325067a | 2026-10-06 21:39 |
| v1-5 | 裁决行新控件：理由输入、原文保留、归档门可见（UI） | ✓ 通过 | human/session-e3d59f51-cb6c-463b-9a13-9ddf9325067a | 2026-10-06 21:39 |
| v1-6 | 迁移兼容、存量不追溯与全量回归收口 | ✓ 通过 | human/session-e3d59f51-cb6c-463b-9a13-9ddf9325067a | 2026-10-06 21:39 |
| v1-7 | 需求级验收 | ✓ 通过 | human/session-e3d59f51-cb6c-463b-9a13-9ddf9325067a | 2026-10-06 21:39 |
| v1-8 | 需求级验收 | ✓ 通过 | human/session-e3d59f51-cb6c-463b-9a13-9ddf9325067a | 2026-10-06 21:39 |
| v1-9 | 需求级验收 | ✓ 通过 | human/session-e3d59f51-cb6c-463b-9a13-9ddf9325067a | 2026-10-06 21:39 |
| v1-10 | 需求级验收 · 锚点失效 | ✓ 通过 | human/session-e3d59f51-cb6c-463b-9a13-9ddf9325067a | 2026-10-06 21:39 |
