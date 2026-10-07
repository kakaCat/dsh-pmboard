---
reverse_count: 18
other_count: 50
unknown_count: 1
---

| 用例（文件 :: 用例全名） | 红因类别 | 红线内可达性 | 证据 |
|---|---|---|---|
| tests/create-doc-location.test.ts :: reqboard_create · 文档位置（FR-7 降级路径补第四问） TC-11 不传 doc_location → 显式回落默认值 + defaults_used 留痕，台账 docBasePath 同值 | assertion-shape | 可 | `npx vitest run tests/create-doc-location.test.ts` → 断言 defaults_used 深等于 [doc_location]，实得 [doc_location, workspace]：默认值多记一项，期望形状过期 |
| tests/decompose-tools.test.ts :: reqboard_decompose 边界 幂等守卫：implementing/accepting 状态一律拒绝重复拆分 | fixture-drift | 可 | `npx vitest run tests/decompose-tools.test.ts` → 期望抛 REQBOARD_ALREADY_DECOMPOSED，实得「设计未含任务表（W7 新语义）」（src/application/use-cases/Decompose.ts:113）；用例夹具把 plan.tasks 写成 []，不满足新语义 |
| tests/decompose-tools.test.ts :: reqboard_task_move 边界 越权/不存在/人工闸门一律拒绝 | assertion-shape | 可 | `npx vitest run tests/decompose-tools.test.ts` → 前三条拒绝断言通过；第四条（别的窗口）期望 REQBOARD_NOT_BOUND_TO_WINDOW，实得「本窗口没有绑定中的需求」（REQBOARD_NO_BOUND_REQ）：错误码改名 |
| tests/decompose-tools.test.ts :: rollup 阻塞 blockers 显式化（REQ-2e9473 t02） task_move：任务 a 完成但 b 仍 todo（幽灵场景）→ 返回 blockers + warning | assertion-shape | 可 | 同上 → out.blockers 为 undefined（实得 body 不再带该键）；blockers/warning 现只在 verify_submit 返回体（src/application/use-cases/SubmitVerification.ts:396），src/application/use-cases/MoveTask.ts 已 0 处命中 blockers |
| tests/dive-gate-prompt.test.ts :: TC-15 Dive 在人工门主动弹框（有边界重弹） 到顶 → 组合根写台账 comment 并停手（响亮不静默） | fixture-drift | 可 | 同上 → 弹框次数实得 0（期望 GATE_PROMPT_MAX_POPS=2）；用例传给装配函数的 deps 缺组合根必填端口 requirementStore（src/wiring/pm-capture-root.ts:98 / 173），组合根取不到 facts 即停摆 |
| tests/dive-gate-prompt.test.ts :: TC-15 Dive 在人工门主动弹框（有边界重弹） 弹框通道不可用 → 降级为提醒消息，绝不替代人推进 | assertion-shape | 可 | 同上 → 降级投递实得 0 条（期望 1 条含「人工门提醒」）；src 已刻意删掉该投递（src/application/dive/gate-prompt.ts:276-277「deliver已删除：Dive模式下降级时只记录日志，不投递」） |
| tests/dive-session-driver-wiring.test.ts :: REQ-260927100007-b8ba FR-11：采集半零投递 / 里程碑只登记 (3) 非 armed+active 的里程碑催办 → 只写台账 comment，不投递会话 | fixture-drift | 可 | `npx vitest run tests/dive-session-driver-wiring.test.ts` → 台账 comment 实得 0 条（期望 1 条）；同一 harness 的 deps 缺 requirementStore，组合根在 src/wiring/pm-capture-root.ts:217 处取不到需求即返回 |
| tests/dive-session-driver-wiring.test.ts :: REQ-260927100007-b8ba FR-11：采集半零投递 / 里程碑只登记 armed+active 但 round 半未装配 → 响亮 warn（不静默丢） | fixture-drift | 可 | 同上 → warns 里没有「round 半未装配」；同因（requirementStore 端口缺失）回调在取 facts 处中断，走不到 src/wiring/pm-capture-root.ts:226 的那条响亮 warn |
| tests/doc-sync.test.ts :: 文档演进留痕（t19） 有待同步标记时推进返回 doc_sync_warning | fixture-drift | 可 | `npx vitest run tests/doc-sync.test.ts` → reqboard_move 被新前置门拒绝：「docs/requirements/REQ-ds1234/requirement.md 不存在（无法核验『讨论与裁定记录（D-x）』节）」；夹具未落该文档 |
| tests/e2e-triad-gate.test.ts :: 全链路：需求文档 → 计划批准 → 拆分 → 出口门禁 卡被改坏（删掉一节）→ 出口门禁拦下 task_card_incomplete | assertion-shape | 可 | `npx vitest run tests/e2e-triad-gate.test.ts` → 期望抛 task_card_incomplete，实得 REQBOARD_HUMAN_GATE：decomposing → implementing 现为人工门，agent 调用到不了三要素门（须改用例走人的路径） |
| tests/failure-handling.test.ts :: 失败暂停与回退（5.1/5.2/5.5） 子卡失败 → 退回 todo + attempt+1 + revisions(rollback) + 失败评论；autoRun=false；高优告警发出 | unknown | 不可达 | 同上 → attempt 已 +1（回退确实发生），但同一张卡的 revisions 实得 []（期望 [rollback]）；修订写入器在场（src/application/internal/failure-handling.ts:80），字段在落盘或投影处丢失，方向本次未勘定 |
| tests/gate-aware-questions.test.ts :: 立项拒绝路径不进链（REQ-260924002956-f37c BUG-2） 肯定路径对照：两段合计 4 问，且 G0 恰好入队 1 次（防"修反"） | assertion-shape | 可 | `npx vitest run tests/gate-aware-questions.test.ts` → 问项实得 5（期望 4）：reqboard_capture 现为四问（名称／类型／难度／文档位置），两段合计随之为 5 |
| tests/move-rollback.test.ts :: 回退编排 · 双通道一致性（t9 验收：FR-5 单点） TC-7: 回程受门——设计章是落点（未改仍有效），但计划批准已收回，再进实施必须重新拿钥匙 | fixture-drift | 可 | `npx vitest run tests/move-rollback.test.ts` → reqboard_move 被新前置门拒绝：「design → decomposing 的设计文档集：requirement.md 不存在」；夹具未落设计文档集 |
| tests/t7-legacy-tolerance.test.ts :: T-7 legacy tolerance 阶段名相位（旧数据）不被驱动 | src-debt | 不可达 | `npx vitest run tests/t7-legacy-tolerance.test.ts` → isDrivableRequirement(legacy) 实得 true（期望 false）；src/application/dive/round-state.ts:314 仍按 dive.phase !== 'paused' 判定，旧相位数据照样被驱动，须改 src 另立需求 |
| tests/template-address-injection.test.ts :: TC-10 非肯定项不注入下一节点纪律（FR-10） H4 negative：只发作答摘要 + 用户意见，不含任何纪律块 | assertion-shape | 可 | `npx vitest run tests/template-address-injection.test.ts` → d.msgs[0] 实得空串；src/application/gate/handlers/h4-resume.ts 已恒定返回 skip(dive_handles_resume)（全面 Dive 化，续跑不再由 H4 投递） |
| tests/triad-gate.test.ts :: 端到端：门真的挂上了（reqboard_move / reqboard_task_move） 单卡结单：卡缺三要素 → 拒绝 task_card_incomplete | src-debt | 不可达 | `npx vitest run tests/triad-gate.test.ts` → 期望 rejects task_card_incomplete，实得 resolve success；src/tools/TaskMoveTool 与 src/tools/MoveTool 对 task_card_incomplete 0 处命中——单卡结单的三要素门未挂上，须改 src |
| tests/triad-gate.test.ts :: 端到端：门真的挂上了（reqboard_move / reqboard_task_move） 拆分出口：卡文件不存在 → 不判（放行） | assertion-shape | 可 | 同上 → 实得 REQBOARD_HUMAN_GATE（期望放行）；decomposing → implementing 现为人工门，用例的 agent 放行断言失效 |
| tests/triad-gate.test.ts :: 端到端：门真的挂上了（reqboard_move / reqboard_task_move） 拆分出口：卡缺三要素 → 拒绝 task_card_incomplete，且消息含卡 id 与节名 | assertion-shape | 可 | 同上 → 期望抛 task_card_incomplete，实得 REQBOARD_HUMAN_GATE：人工门先于三要素门触发，用例须改走人的路径 |
