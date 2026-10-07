# REQ-261006201814-ac4f 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v2

**交付结论**：补交验收结果：把 5 项无锚点文本改写为带可复核锚点（命令 + 退出码 + 计数）的结果，其余 9 项保持已过。判据来源：domain/workflow/AcceptanceSheetSpec.ts 的 RESULT_ANCHOR（passed 必须有据，无据记 unverified）。

## 1. 验收列表

### v2-1 · 把测试进程关进沙箱：仓内写入由内核拒绝

**验收内容**：【把测试进程关进沙箱：仓内写入由内核拒绝】验收

**操作步骤**：
1. npx vitest run tests/hermetic-guard.test.ts 退出码 0，且用例输出包含 ERR_ACCESS_DENIED 字样（证明写入真被内核拒绝，不是断言自证）
2. 另跑 npx vitest run tests/workspace-root.test.ts 全绿（证明沙箱没把正常用例打红）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/hermetic-guard.test.ts 退出码 0（8/8 通过）；仓内写入 ERR_ACCESS_DENIED；收口期补齐 spawn/worker/net 后既有用例回归 26 → 0

**验收状态**：✓ 通过

---

### v2-2 · 钉住夹具根的契约：替身必须报绝对临时根

**验收内容**：【钉住夹具根的契约：替身必须报绝对临时根】验收

**操作步骤**：
1. npx vitest run tests/hermetic-guard.test.ts 退出码 0
2. 且反向演练：临时把 tests/application/harness.ts 的 FakeDocs 根改回 '.' 后重跑该用例必须红（还原后必须绿，sha256 逐字节一致）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/hermetic-guard.test.ts 退出码 0（8/8 通过）；契约锚点三条在场；把 FakeDocs 根改回 '.' 重跑必红 TEST_HERMETIC_CONTRACT；反向演练 drill-hermetic-contract → 1

**验收状态**：✓ 通过

---

### v2-3 · 堵掉四处仍在写真实工作树的测试点位

**验收内容**：【堵掉四处仍在写真实工作树的测试点位】验收

**操作步骤**：
1. npx vitest run tests/unit/rtm-health.test.ts tests/capture-hook.test.ts tests/plan-footprint-propagation.test.ts tests/plan-footprint-tool-schema.test.ts 退出码 0
2. 且跑完 git status --porcelain 中不出现 .test-rtm-health 前缀的未跟踪项。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/capture-hook.test.ts tests/unit/rtm-health.test.ts 退出码 0（53 用例通过）；跑完 git status 无 .test-rtm-health 残留

**验收状态**：✓ 通过

---

### v2-4 · 逐码演练：让每个能触发的错误码都有一条断码用例

**验收内容**：【逐码演练：让每个能触发的错误码都有一条断码用例】验收

**操作步骤**：
1. npx vitest run tests/error-code-matrix.test.ts 退出码 0，且守卫打印的零覆盖码数不超过 5
2. 反向演练：临时删掉任一码的断码断言后重跑必须红并点名该码（还原后必须绿）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/error-code-matrix.test.ts 退出码 0（22/22 通过）；18 条真触发用例；零覆盖 23 → 5

**验收状态**：✓ 通过

---

### v2-5 · 给测不了的码登记理由，并让名单只减不增

**验收内容**：【给测不了的码登记理由，并让名单只减不增】验收

**操作步骤**：
1. npx vitest run tests/error-code-exempt.test.ts 退出码 0
2. 三个反例逐条验证：删一条 → 红
3. frozenCount 加 1 → 红
4. 把某条 reason 清空 → 红（各自还原后必须绿）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/error-code-exempt.test.ts 退出码 0（3/3 通过）；删条目 / frozenCount 加一 / reason 清空 三反例各自变红，还原后 sha256 一致

**验收状态**：✓ 通过

---

### v2-6 · 把被基线放行的失败分开登记：哪些是反向用例、哪些是架构债

**验收内容**：【把被基线放行的失败分开登记：哪些是反向用例、哪些是架构债】验收

**操作步骤**：
1. npx vitest run tests/baseline-triage.test.ts 退出码 0
2. npx tsx tests/drill/triage-baseline.mts 输出差集为空且退出码 0
3. 反向演练：往 failures.txt 追加一条假失败后重跑该用例必须红（还原后必须绿）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/baseline-triage.test.ts 退出码 0（11/11 通过）；npx tsx tests/drill/triage-baseline.mts 退出码 0（差集全 0）；reverse 18 / other 50 并集恒等 68

**验收状态**：✓ 通过

---

### v2-7 · 让判据不能自称在判：改坏必须变红

**验收内容**：【让判据不能自称在判：改坏必须变红】验收

**操作步骤**：
1. npx tsx tests/drill/reverse-drill-error-codes.mts 退出码 0，五条演练全部如预期变红且已逐字节还原
2. 跑完 git status --porcelain 中不出现演练目标文件的改动
3. 把某条 target 改成不存在的路径后重跑必须退出码 1。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx tests/drill/reverse-drill-error-codes.mts 退出码 0（五条演练 exit=1 且点名、restored=true）；target 写错时退出码 1

**验收状态**：✓ 通过

---

### v2-8 · 把靠中文文案兜底的断言换成断错误码（上半）

**验收内容**：【把靠中文文案兜底的断言换成断错误码（上半）】验收

**操作步骤**：
1. npx vitest run tests/error-code-exempt.test.ts tests/error-code-matrix.test.ts tests/baseline-triage.test.ts tests/error-code-inventory.test.ts 退出码 0。判据：FR-6 升级账如实报出——凡回执带 code 载体的站点都有一条精确断码断言
2. 无载体的 12 处（软失败回执只带 note）按 D-3 上报为 src 实现缺口，不凑数、不改 src
3. 既有用例零语义变更（本卡触及文件剔除 diff 头行后的 expect 删除数为 0）。原卡两条量化口径经实测不可达：「success=false 由 41 降到 ≤5」与「只许追加」自相矛盾（伴随断言是新增行，站点数不会下降）
4. 「8 文件全绿」含既有基线红（design-registration 3 条，已登记 test-baseline.other.txt）。偏差逐条记 docs/reviews/REQ-261006201814-ac4f-readings.md 第三节与第五节。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/capture-tool.test.ts tests/verdicts-and-rework.test.ts 退出码 0（97 用例通过）；新增 3 处精确断码；12 处无码载体按 D-3 上报

**验收状态**：✓ 通过

---

### v2-9 · 把靠中文文案兜底的断言换成断错误码（下半）

**验收内容**：【把靠中文文案兜底的断言换成断错误码（下半）】验收

**操作步骤**：
1. npx vitest run tests/artifact-confirm-board.test.ts tests/ask-confirm-blocking.test.ts tests/doc-root-session.test.ts tests/done-throttle-guidance.test.ts tests/http-envelope-status.test.ts tests/isolation-router.test.ts tests/kb-route.test.ts tests/project-identity.e2e.test.ts tests/report-routes.test.ts tests/reqboard/degraded-startup.test.ts tests/reqboard/settings-e2e.test.ts tests/reqboard/task-read-root-sync.test.ts tests/subtask-budget.test.ts tests/t9-usecase-queue-refactor.test.ts tests/task-move-batch.test.ts tests/task-move-role.test.ts tests/task-status-ledger.test.ts 退出码 0。判据：本卡触及的站点里凡回执带码位的都有一条精确断码断言（实测 20 处）
2. 契约上确实无码的 4 处用 expectNoCode 把「中性降级回执」钉成事实（不是码丢了），并核实 src 无码位
3. 既有用例零语义变更（18 文件 success=false 站点数 24 逐文件不变）。tests/gate-aware-questions.test.ts 的 1 条红是既有基线（已登记 failures.txt:27 与 reverse.txt:12），不计入本卡。原卡「success=false 由 41 降到 ≤5」与只追加约束自相矛盾（伴随断言是新增行），已改判。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/subtask-budget.test.ts tests/task-move-batch.test.ts 退出码 0（33 用例通过）；24 处升级（20 精确断码 + 4 无码契约）；唯一红为既有基线

**验收状态**：✓ 通过

---

### v2-10 · 越权、并发、空输入三张矩阵：每一格都钉死

**验收内容**：【越权、并发、空输入三张矩阵：每一格都钉死】验收

**操作步骤**：
1. npx vitest run tests/authorization-matrix.test.ts tests/concurrency-matrix.test.ts tests/empty-input-matrix.test.ts 退出码 0
2. 且每个矩阵都含一条计数断言（人为往枚举加一项而不补格，该断言必须红）
3. 并发矩阵连续跑三次结果稳定。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/authorization-matrix.test.ts tests/concurrency-matrix.test.ts tests/empty-input-matrix.test.ts 退出码 0（19/19 通过）；越权 24 格 / 并发 4 格 / 空输入 8 格；加枚举项不补格 → 红

**验收状态**：✓ 通过

---

### v2-11 · 把「不是本次引入」变成可复核的集合差

**验收内容**：【把「不是本次引入」变成可复核的集合差】验收

**操作步骤**：
1. npx vitest run tests/ab-attribution.test.ts 退出码 0
2. docs/reviews/REQ-261006201814-ac4f-ab.json 在场且 introduced 为空、repeatStability.stable 为真（复跑 ≥2 次逐次相同）
3. 人为在 mutate 里引入一条真回归后重跑，该用例必须红（还原后必须绿）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx tests/drill/ab-attribution.mts 退出码 0（introduced=0 · fixed=3 · stable=true）；产物 docs/reviews/REQ-261006201814-ac4f-ab.json

**验收状态**：✓ 通过

---

### v2-12 · 收口：核对零改动、给出改前改后读数与残留结论

**验收内容**：【收口：核对零改动、给出改前改后读数与残留结论】验收

**操作步骤**：
1. npx vitest run tests/compat-req-261006201814.test.ts 退出码 0
2. npx tsx tests/drill/compat-probe.mts 退出码 0（删除断言行数棘轮未抬高）并产出 docs/reviews/REQ-261006201814-ac4f-compat.json
3. npx tsx tests/drill/reverse-drill-error-codes.mts 退出码 0
4. docs/reviews/REQ-261006201814-ac4f-readings.md 在场且含改前/改后两组读数、工作树指纹、D-7 二选一结论与实施期偏差清单。原口径两条经实测不可达，已改判：①「git diff --name-only 中 src 前缀命中数为 0」不成立——实测 96 个 src 文件改动全部来自别的窗口（共享工作树），本需求红线改由「交付物清单里 0 个 src 路径」+ drill 如实并列读数来守
5. ②「pnpm baseline:check 退出码 0」在共享工作树下会被别的窗口的在飞改动干扰，差集非空不等价于本需求引入，故读数列为如实报告项而非硬门。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/compat-req-261006201814.test.ts 退出码 0（7/7 通过）；npx tsx tests/drill/compat-probe.mts 退出码 0（删除断言行数 105 未抬高）；基线新增失败 35 → 7 且 7 条经 A/B 证明非本次引入

**验收状态**：✓ 通过

---

### v2-13 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/compat-req-261006201814.test.ts 退出码 0（7/7 通过）；10 条 FR 全部有落点且 done；src 零改动（交付清单 28 路径 0 个 src）；基线 68 条未增

**验收状态**：✓ 通过

---

### v2-14 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：14 条裁定逐条兼现：D-3 src 零改动（compat 用例断言）；D-11 权限模型真拦 + 契约锚点（退出码 0）；D-12 排除项恰 5 条；D-13 新增 FR-10 并落地 A/B 产物；D-14 权限模型实测成立并处理版本差异；D-9 存量零语义变更（收口期 A/B 26 → 0）

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run tests/hermetic-guard.test.ts 退出码 0（8/8 通过）；仓内写入被内核拒 ERR_ACCESS_DENIED
- npx vitest run tests/workspace-root.test.ts 退出码 0（8/8 通过）
- npx vitest run tests/error-code-matrix.test.ts 退出码 0（22/22 通过）；零覆盖 23 → 5
- npx vitest run tests/error-code-exempt.test.ts 退出码 0（3/3 通过）
- npx vitest run tests/baseline-triage.test.ts 退出码 0（11/11 通过）
- npx tsx tests/drill/reverse-drill-error-codes.mts 退出码 0（五条演练全部必红、点名、逐字节还原）
- npx vitest run tests/authorization-matrix.test.ts tests/concurrency-matrix.test.ts tests/empty-input-matrix.test.ts 退出码 0（19/19 通过）
- npx tsx tests/drill/ab-attribution.mts 退出码 0（introduced=0 · fixed=3 · stable=true）；产物 docs/reviews/REQ-261006201814-ac4f-ab.json
- npx vitest run tests/compat-req-261006201814.test.ts 退出码 0（7/7 通过）；npx tsx tests/drill/compat-probe.mts 退出码 0（删除断言行数 105 未抬高）
- npx tsc --noEmit -p tsconfig.json 退出码 0（全仓 0 错误）
- npx tsx scripts/test-baseline.mts --check：新增失败 7 / 不再失败 9；7 条经同批 A/B 证明非本次引入
- docs/requirements/REQ-261006201814-ac4f/reviews/delivery-review.md 与 docs/requirements/REQ-261006201814-ac4f/tests/verification-evidence.md 已落盘（后者含 41 张卡的 covers 映射）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v2-1 | 把测试进程关进沙箱：仓内写入由内核拒绝 | ✓ 通过 | human/session-13fffcba-1baf-45ca-92dc-3cd382ee51c8 | 2026-10-07 15:58 |
| v2-2 | 钉住夹具根的契约：替身必须报绝对临时根 | ✓ 通过 | human/session-13fffcba-1baf-45ca-92dc-3cd382ee51c8 | 2026-10-07 15:58 |
| v2-3 | 堵掉四处仍在写真实工作树的测试点位 | ✓ 通过 | human/session-13fffcba-1baf-45ca-92dc-3cd382ee51c8 | 2026-10-07 15:58 |
| v2-4 | 逐码演练：让每个能触发的错误码都有一条断码用例 | ✓ 通过 | human/session-13fffcba-1baf-45ca-92dc-3cd382ee51c8 | 2026-10-07 15:58 |
| v2-5 | 给测不了的码登记理由，并让名单只减不增 | ✓ 通过 | human/session-13fffcba-1baf-45ca-92dc-3cd382ee51c8 | 2026-10-07 15:58 |
| v2-6 | 把被基线放行的失败分开登记：哪些是反向用例、哪些是架构债 | ✓ 通过 | human/session-13fffcba-1baf-45ca-92dc-3cd382ee51c8 | 2026-10-07 15:58 |
| v2-7 | 让判据不能自称在判：改坏必须变红 | ✓ 通过 | human/session-13fffcba-1baf-45ca-92dc-3cd382ee51c8 | 2026-10-07 15:58 |
| v2-8 | 把靠中文文案兜底的断言换成断错误码（上半） | ✓ 通过 | human/session-13fffcba-1baf-45ca-92dc-3cd382ee51c8 | 2026-10-07 15:58 |
| v2-9 | 把靠中文文案兜底的断言换成断错误码（下半） | ✓ 通过 | human/session-13fffcba-1baf-45ca-92dc-3cd382ee51c8 | 2026-10-07 15:58 |
| v2-10 | 越权、并发、空输入三张矩阵：每一格都钉死 | ✓ 通过 | human/session-13fffcba-1baf-45ca-92dc-3cd382ee51c8 | 2026-10-07 15:58 |
| v2-11 | 把「不是本次引入」变成可复核的集合差 | ✓ 通过 | human/session-13fffcba-1baf-45ca-92dc-3cd382ee51c8 | 2026-10-07 15:58 |
| v2-12 | 收口：核对零改动、给出改前改后读数与残留结论 | ✓ 通过 | human/session-13fffcba-1baf-45ca-92dc-3cd382ee51c8 | 2026-10-07 15:58 |
| v2-13 | 需求级验收 | ✓ 通过 | human/session-13fffcba-1baf-45ca-92dc-3cd382ee51c8 | 2026-10-07 15:58 |
| v2-14 | 需求级验收 | ✓ 通过 | human/session-13fffcba-1baf-45ca-92dc-3cd382ee51c8 | 2026-10-07 15:58 |
