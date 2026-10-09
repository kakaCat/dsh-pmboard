---
requirement_id: REQ-261008004324-81df
title: "逐文件定性台账与另案点名清单"
status: implementing
category: bug
serves: BUG-10
---

# 逐文件定性台账（REQ-261008004324-81df）

> 口径（design/fix-design.md「定性协议」）：每行 = 一个文件；定性三选一
> **夹具滞后**（改测试侧）/ **环境基线**（改环境或基线）/ **真缺陷**（移出本需求，另案）。
> 「依据」列必须是命令读数、需求 id 或 `文件:行` 之一——空依据即证据不足。
> 采集时点：2026-10-08；工作树 HEAD `c49fd5e` + 约 197 个在飞改动文件；
> 归属口径 = 干净 HEAD worktree 单跑（4 组取证逐文件复跑，无一条属「在飞引入」）。

## 一、台账（37 个文件）

| 文件 | 桶 | 首条读数 | 定性 | 依据 |
|---|---|---|---|---|
| tests/artifact-openable.test.ts | A | 产物登记被拒：文件不存在（docs/guides/x.md） | 夹具滞后（本需求内） | REQ-261006201841-944d FR-1；SubmitArchive.ts:142-153 |
| tests/move-rollback.test.ts | A | design→decomposing 设计文档集：requirement.md 不存在 | 夹具滞后（本需求内） | REQ-2d1c74 FR-2；MoveRequirement.ts:159-166 + design-gates.ts:138-167 |
| tests/design-registration.test.ts | A | 内容校验门禁拒绝：architecture.md 文档级 serves 缺失 | 夹具滞后（本需求内） | REQ-260929210741-30ae FR-2；SubmitDesignArtifacts.ts:100 |
| tests/triad-gate.test.ts | A | 期望 task_card_incomplete，实得 REQBOARD_HUMAN_GATE | 2 条放行=夹具滞后（本需求内）；2 条缺三要素=真缺陷（另案） | RequirementStatus.ts:118-120（REQ-31e11f 五门）；content-gate-triad.ts 零生产调用点 |
| tests/e2e-triad-gate.test.ts | A | 同上（骨架卡被 HUMAN_GATE 拦 / 期望 task_card_incomplete） | 1 条放行=夹具滞后（本需求内）；1 条卡被改坏=真缺陷（另案） | 同上 |
| tests/capture.test.ts | A | 期望消息含「不许沉默」 | 夹具滞后（本需求内） | 现行硬化语 volatile-notice.ts:354；静态引导 capture-section.ts:387 |
| tests/client-view.test.ts | A | 期望 HTML 含「计划待批」（3 条） | 夹具滞后（本需求内） | REQ-261006175040-12d4 FR-1/FR-2/FR-5；artifacts.ts:222-231、verification.ts:110-127 |
| tests/node-panel-styles.test.ts | A | 期望样式含 min(720px, calc(100vw - 130px)) | 夹具滞后（本需求内） | node-panel.ts:68 现值为 min(720px, calc(100% - 32px)) |
| tests/template-address-injection.test.ts | A | expected 0 to be greater than 0（4 条） | TC-10 两臂=夹具滞后（本需求内）；TC-9/TC-11=真缺陷（另案） | h4-resume.ts:13-29；gate-wiring.ts:124 的 address 是死参数 |
| tests/auto-chain-approval.test.ts | A | 期望 implementing 实得 accepting | 夹具滞后（本需求内） | confirm-settle.ts:700-706（REQ-4842fe t10：批准同一调用内已推进） |
| tests/confirm-settle-plan-persist.test.ts | A | 期望 r.autoRun 为 true 实得 false | 夹具滞后（本需求内） | 同上；harness.ts:858 无 jobs |
| tests/plan-mode.test.ts | A | 期望 decomposing 实得 undefined | 夹具滞后（本需求内） | MoveTask.ts:127-140 既有 11 键；legacy-compat-6749.test.ts:248,265 |
| tests/t17-queue-e2e.test.ts | A | 期望 design 实得 brainstorming | 夹具滞后（本需求内） | decision-gates.ts:226-251（REQ-261005105032-3b02 FR-8） |
| tests/decompose-tools.test.ts | A | 期望 ALREADY_DECOMPOSED 实得 TASKS_REQUIRED（共 5 条） | 夹具滞后（本需求内） | DecomposeSpec.ts:48-66（REQ-261003204149-1e80 FR-4）；SubmitVerification.ts:392-409 |
| tests/t11-decompose-queue-write.test.ts | A | 源码不含 landPlanTasks( | 夹具滞后（本需求内） | REQ-261002164800-d8f2 decomposition.md:69；approved-plan-landing.ts:169 |
| tests/dive-gate-prompt.test.ts | A | 期望 1 条消息实得 0 条（2 条） | 夹具滞后（两成因：通道已删 + 必填依赖缺传） | gate-prompt.ts:221,277；pm-capture-root.ts:98,122,173 |
| tests/dive-session-driver-wiring.test.ts | A | 期望 1 条消息实得 0 条（3 条） | 夹具滞后（同一机制） | session-driver.ts:487-492 把 TypeError 吞成 info |
| tests/handoff.test.ts | A | REQBOARD_DEPENDENCY_GATE（2 条） | 夹具滞后（门是新语义，夹具没把上游走完） | DependencyGateSpec.ts:1（REQ-260929210741-30ae FR-4） |
| tests/adapters/failure-alert.test.ts | A | 期望 logged 长度 1 实得 2（2 条） | 夹具滞后（双通道被有意改成两次 log） | FailureAlert.ts:21-38（f3c99c8 删 deliver 与指令壳） |
| tests/canceled-legacy-read.test.ts | A | 期望 false 实得 true | 夹具滞后（测试自身 await 漏洞，非污染） | 测试 :315 的 toThrow 不 await promise；--pool=threads 全绿、-t 畸形 JSON 恒绿 |
| tests/create-doc-location.test.ts | A | 期望 ['location'] 实得 ['location','workspace_root']（2 条） | 夹具滞后（本需求内） | CreateRequirement.ts:55 注释：workspace_root 是有意新增的回落 id |
| tests/application/repository.test.ts | A | 期望 /^REQ-[0-9a-f]{6}$/ 实得 REQ-<12位时间戳>-<4位hex> | 夹具滞后（本需求内） | CHANGELOG-req-id-timestamp.md；protocol.ts:1923、RandomIdFactory.ts:46、protocol.ts:2231 |
| tests/doc-sync.test.ts | A | D-x 节未就位（REQBOARD_DECISION_LOG_MISSING） | **真缺陷/断言面缺失（已移出另案）** | MoveRequirement 无 doc_sync_warning 出口（仅 SubmitVerification.ts:484）；brainstorming→design 是人工门 |
| tests/t7-legacy-tolerance.test.ts | A | 期望 true 实得 false | **真缺陷（已移出另案）** | round-state.ts:306-315 旧相位分支 vs protocol.ts:1429 现行枚举 |
| tests/failure-handling.test.ts | A | 期望 ['rollback'] 实得 [] | **真缺陷（已移出另案）** | ExecuteTask.ts:653-656 内联回退；AdvanceChain.ts:632 rollbackSubtask 因状态早退 |
| tests/interruption-checkpoint.test.ts | A | 期望非 undefined 实得 undefined（3 条） | **真缺陷（已移出另案）** | MoveRequirement.ts:237 丢 stampCheckpoint；唯一调用在 rollback.ts:76 |
| tests/isolate-node-context.test.ts | C | Failed to load url @deepseek-ai/dsh-session | 环境缺失（文件级 collect 失败） | tests/isolate-node-context.test.ts:11 模块级 import；全仓 node_modules 无该包 |
| tests/zero-arg-binding.test.ts | C | 向上未找到含 pnpm.patchedDependencies 的仓库根 | 环境漂移·守护对象已消失 | 根 package.json 无该字段；patches/ 不存在；现包 dsh-ptc-runtime@0.2.0-rc.1 无 lib/process.js |
| tests/kb-generate.test.ts | C | 期望 diverged 为 [] 实得 13 行 | 生成物陈旧（重生成即收） | pnpm kb:check 4 处漂移；符号 3394 vs 库 3200 行 |
| tests/kb-invalidation.test.ts | C | 不可判定 63 vs 条目 71 | 基线前提过期（新条目带锚点是进步） | 断言 :119-121 要求「全部不可判定」 |
| tests/kb-operations.test.ts | C | 长度 12 实得 14 | 基线数字过期 | operations.ts EXTRA_ENTRIES 实测 14（新增 report-style-snapshot / report-style-ownership） |
| tests/skills-assets.test.ts | C | 期望 [] 实得 3 个 __pycache__ | 环境产物（在飞新增红，修法非语义） | skills/ui-ux-pro-max/scripts/__pycache__/*.pyc；package.json 的 files:['skills'] 会打进包 |
| tests/layer-boundary.test.ts | B | application/ 出现越界 import | 真实技术债（范围外，N1） | triage-evidence.md §八 B1 |
| tests/live-tasks-single-source.test.ts | B | 基线之外的新手写活卡判定 | 真实技术债（范围外，N1） | triage-evidence.md §八 B5 |
| tests/message-hygiene.test.ts | B | domain 仍有拼接式消息 | 真实技术债（范围外，N1） | triage-evidence.md §八 B2 |
| tests/project-scope.test.ts | B | 写盘点未受守卫也未豁免 | 真实技术债（范围外，N1） | triage-evidence.md §八 B4 |
| tests/size-budget.test.ts | B | 超标文件未在白名单 | 真实技术债（范围外，N1） | triage-evidence.md §八 B3 |

**计数核对**：A 类 25（本需求内 21 + 另案 4）/ C 类 6 / B 类 5 / 待定 0（`canceled-legacy-read` 已定性为 A）＝ 37 个文件，
与 `requirement.md` 的目标文件清单逐行一致。

## 二、另案点名清单（7 文件 / 11 用例，**不落卡**）

| 文件 | 移出用例 | 定性 | 生产侧根因（要改哪里） |
|---|---|---|---|
| tests/triad-gate.test.ts | 「拆分出口：卡缺三要素→拒」「单卡结单：卡缺三要素→拒」 | 真缺陷·门禁零调用方 | `content-gate-triad.ts` 零生产调用点，须接进 `MoveTask` done 预检与人路径出口 |
| tests/e2e-triad-gate.test.ts | 「卡被改坏→拦下」 | 同上 | 同上 |
| tests/doc-sync.test.ts | 唯一用例 | 断言面缺失（语义搬迁需裁定） | `MoveRequirement` 无 `doc_sync_warning` 出口面 + `brainstorming→design` 人工门 |
| tests/template-address-injection.test.ts | TC-9（:75）、TC-11（:169） | 真缺陷·注入点未接线 | `CaptureGuidanceDeps.address`（gate-wiring.ts:124）是死参数：或折进 capture guidance 段，或正式退役该注入点 |
| tests/t7-legacy-tolerance.test.ts | 唯一用例 | 真缺陷 | `round-state.ts:306-315` 的相位判定须跟现行枚举 |
| tests/failure-handling.test.ts | 唯一用例 | 真缺陷 | `ExecuteTask.ts:653-656` 内联回退须改调 `rollbackSubtask` |
| tests/interruption-checkpoint.test.ts | 3 条 | 真缺陷 | `MoveRequirement.ts:237` 须补 `stampCheckpoint(...)` |

**顺带并入另案的两条次要技术债**：`session-driver.ts:491` 注释写「记 warn」实为 `logger?.info`
（logger 接口无 warn 能力，是静默的放大器）；`gate-prompt.ts:220-223` 通道不可用分支零投递**且零日志**，
与其注释及 `pm-capture-root.ts:208` 白名单第 4 条不符。

## 三、定向纪律（本台账的用法）

- 定性为「夹具滞后」的 21 个文件才允许在本需求内改测试侧；改动旁须注明依据（需求 id 或 `文件:行`）。
- 定性为「真缺陷」的 11 条用例**禁止**改断言转绿——它们留在失败清单里，作为另案的证据。
- 本台账与 `design/fix-design.md` 的「另案点名清单」同源；两者不一致时以本台账为准并回改设计文档。
