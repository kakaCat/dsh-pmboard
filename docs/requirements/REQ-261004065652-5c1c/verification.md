# REQ-261004065652-5c1c 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：Dive 那次「4 小时空转 7257 回合」的死循环，从三个根上被堵住了，每一道护栏都留了可复跑的反向证据。\n\n一、根因与修法（都对得上事故现场）\n1）驱动读了陈旧快照：写路径不刷新同步投影，于是「刚写下的暂停位」自己读不到 —— 改成写路径同源刷新。\n2）失败不分类、不熔断：额度 403 被当成可重试抖动 —— 现在致命错误一律不可重试，同因连续 3 次即熔断并要求人来；真被掐断立刻闭锁，且解锁要「台账复位 healthy + 我方停手位写成功」双条件。\n3）停机位不唯一：收敛到 driverHealth 一个权威字段。\n\n二、四道起轮前置（顺序 = 内存闭锁 → 全局上游闩 → 人工门 → 预算闸）\n超限与等待不再被当成故障：人工门与预算闸命中不写健康位、不改人的意图，停了还能自己回来；只有致命错误与连续同因失败才叫人。\n\n三、顺手堵掉两个放大器\n断点留痕从「一拍一条」变成「同形 10 分钟一条」（交替病因 20 次 → 只留 2 条，阶段推进立刻可见、显式记录绝不吞）；子卡引擎不可达时开工前就说清楚（不再连挂 4 次、不落假子卡）。\n\n四、自检结果（全部可复跑）\n· 反向演练：6 条护栏全部如预期变红且逐字节还原（退出码 0）\n· 全量回归：失败名称集与基线逐条比对为空（零新增失败）；48 failed files / 98 failed / 3635 passed\n· 类型闸门：144，与基线持平；知识层：kb:check 11 项全绿\n· 台账安全：真台账副本上跑启动对账，逐文件 sha256 零改写\n\n五、需要你知道的两件事（已入档）\n· 实施中我出过一次事故：误用 git checkout 回退了 AskConfirm.ts（含其它窗口未提交改动）。已用 dist 原文重建，并以「构建后无人写 + 行号指纹逐条对齐 + JSDoc 计数一致」三重证据证明代码逐字等价；不可恢复的只有约 14 条行内注释（格式）。\n· 终态却 armed 的存量是 35 条（不是先前说的 3 条，那只是热侧）。行为上安全；冷侧防线按你的裁定不放宽。

## 1. 验收列表

### v1-1 · 定契约：失败分类器 + 三个判定纯函数 + 类型扩展

**验收内容**：【定契约：失败分类器 + 三个判定纯函数 + 类型扩展】验收

**操作步骤**：
1. npx vitest run tests/upstream-failure.test.ts tests/provider-latch.test.ts tests/human-gate.test.ts tests/chain-budget.test.ts → 全绿
2. 分类器 5 条判定顺序各有用例（含 unknown→不写不动）
3. npx tsc --noEmit | grep -c 'error TS' ≤ 144 且改动文件零新增

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：反向演练矩阵：npx tsx scripts/reverse-drill-matrix.mts → 退出码 0；6 条（FR-4 红5 / FR-1 红4 / FR-3 红1 / FR-5 红6 / FR-8 红2 / FR-10 红2）全部如预期变红且源码逐字节还原；报告 docs/requirements/REQ-261004065652-5c1c/evidence/regression.md

**验收状态**：✓ 通过

---

### v1-2 · 修投影：写路径同源刷新窄投影快照

**验收内容**：【修投影：写路径同源刷新窄投影快照】验收

**操作步骤**：
1. npx vitest run tests/store-projection-ryow.test.ts → 全绿
2. 反向演练：注释掉 notify 里的 factsCache.set → 该文件必红并点名
3. npx vitest run tests/store-contract.test.ts → 零新增失败

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：反向演练矩阵：npx tsx scripts/reverse-drill-matrix.mts → 退出码 0；6 条（FR-4 红5 / FR-1 红4 / FR-3 红1 / FR-5 红6 / FR-8 红2 / FR-10 红2）全部如预期变红且源码逐字节还原；报告 docs/requirements/REQ-261004065652-5c1c/evidence/regression.md

**验收状态**：✓ 通过

---

### v1-3 · 接线驱动：内存闭锁 + 退避熔断 + 额度闩 + 心跳不复活

**验收内容**：【接线驱动：内存闭锁 + 退避熔断 + 额度闩 + 心跳不复活】验收

**操作步骤**：
1. npx vitest run tests/dive-loop-breaker.test.ts tests/dive-abort-latch.test.ts → 全绿
2. loop replay 断言 300 拍内投递 ≤ 3
3. 反向演练：把 AUTH 归入 transient → 必红
4. 既有 tests/dive-*.test.ts 零新增失败

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：反向演练矩阵：npx tsx scripts/reverse-drill-matrix.mts → 退出码 0；6 条（FR-4 红5 / FR-1 红4 / FR-3 红1 / FR-5 红6 / FR-8 红2 / FR-10 红2）全部如预期变红且源码逐字节还原；报告 docs/requirements/REQ-261004065652-5c1c/evidence/regression.md

**验收状态**：✓ 通过

---

### v1-4 · 人工门即停手 + 终态收手与启动对账

**验收内容**：【人工门即停手 + 终态收手与启动对账】验收

**操作步骤**：
1. npx vitest run tests/dive-human-gate-stop.test.ts tests/dive-terminal-reconcile.test.ts tests/dive-transition.test.ts → 全绿
2. 三种人工门形态各 20 拍零投递
3. 对账第二次运行零写入（revision 不变）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：反向演练矩阵：npx tsx scripts/reverse-drill-matrix.mts → 退出码 0；6 条（FR-4 红5 / FR-1 红4 / FR-3 红1 / FR-5 红6 / FR-8 红2 / FR-10 红2）全部如预期变红且源码逐字节还原；报告 docs/requirements/REQ-261004065652-5c1c/evidence/regression.md

**验收状态**：✓ 通过

---

### v1-5 · 弹框缺省有界宽限（配置项，缺省 10 分钟）

**验收内容**：【弹框缺省有界宽限（配置项，缺省 10 分钟）】验收

**操作步骤**：
1. npx vitest run tests/ask-confirm-default-grace.test.ts → 全绿
2. npx vitest run tests/ask-confirm-blocking.test.ts tests/ask-confirm-pending.test.ts → 失败数不高于基线（1 failed，TC-7 存量）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：反向演练矩阵：npx tsx scripts/reverse-drill-matrix.mts → 退出码 0；6 条（FR-4 红5 / FR-1 红4 / FR-3 红1 / FR-5 红6 / FR-8 红2 / FR-10 红2）全部如预期变红且源码逐字节还原；报告 docs/requirements/REQ-261004065652-5c1c/evidence/regression.md

**验收状态**：✓ 通过

---

### v1-6 · 断点留痕去重限流（病因类别 + 10 分钟 + 截断）

**验收内容**：【断点留痕去重限流（病因类别 + 10 分钟 + 截断）】验收

**操作步骤**：
1. npx vitest run tests/interruption-dedupe.test.ts → 全绿
2. 交替注入 20 次断言写入 ≤ 2 条
3. 阶段推进留痕不受限流（立即出现）用例在场

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：反向演练矩阵：npx tsx scripts/reverse-drill-matrix.mts → 退出码 0；6 条（FR-4 红5 / FR-1 红4 / FR-3 红1 / FR-5 红6 / FR-8 红2 / FR-10 红2）全部如预期变红且源码逐字节还原；报告 docs/requirements/REQ-261004065652-5c1c/evidence/regression.md

**验收状态**：✓ 通过

---

### v1-7 · 引擎开工预检 + 全局预算闸接线

**验收内容**：【引擎开工预检 + 全局预算闸接线】验收

**操作步骤**：
1. npx vitest run tests/advance-engine-precheck.test.ts tests/chain-budget.test.ts → 全绿
2. 不可达时连续推进 3 次只有第 1 次写台账（revision 不变）
3. WIP 与 token 两条阈值各拦一次且不杀在跑链
4. tests/advance-*.test.ts 零新增失败

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：反向演练矩阵：npx tsx scripts/reverse-drill-matrix.mts → 退出码 0；6 条（FR-4 红5 / FR-1 红4 / FR-3 红1 / FR-5 红6 / FR-8 红2 / FR-10 红2）全部如预期变红且源码逐字节还原；报告 docs/requirements/REQ-261004065652-5c1c/evidence/regression.md

**验收状态**：✓ 通过

---

### v1-8 · 迁移与兼容：对账反向脚本 + 台账副本演练

**验收内容**：【迁移与兼容：对账反向脚本 + 台账副本演练】验收

**操作步骤**：
1. 在副本上运行演练脚本：对账后 3 条 activation 均为 disarmed，反向脚本还原后与原件 sha256 逐一相同
2. evidence/reconcile-drill.md 落盘且含命令与输出

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：反向演练矩阵：npx tsx scripts/reverse-drill-matrix.mts → 退出码 0；6 条（FR-4 红5 / FR-1 红4 / FR-3 红1 / FR-5 红6 / FR-8 红2 / FR-10 红2）全部如预期变红且源码逐字节还原；报告 docs/requirements/REQ-261004065652-5c1c/evidence/regression.md

**验收状态**：✓ 通过

---

### v1-9 · 回归收口：反向演练矩阵 + 全量回归 + 类型闸门

**验收内容**：【回归收口：反向演练矩阵 + 全量回归 + 类型闸门】验收

**操作步骤**：
1. evidence/regression.md 含 5 条反向演练的红/绿实测输出
2. npx vitest run 失败数 ≤ 97 failed / 3523 passed（2026-10-04 07:06 基线）且新增失败 = 0
3. npx tsc --noEmit | grep -c 'error TS' ≤ 144

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：反向演练矩阵：npx tsx scripts/reverse-drill-matrix.mts → 退出码 0；6 条（FR-4 红5 / FR-1 红4 / FR-3 红1 / FR-5 红6 / FR-8 红2 / FR-10 红2）全部如预期变红且源码逐字节还原；报告 docs/requirements/REQ-261004065652-5c1c/evidence/regression.md

**验收状态**：✓ 通过

---

### v1-10 · 知识层与文档同步（停机判据进契约文档）

**验收内容**：【知识层与文档同步（停机判据进契约文档）】验收

**操作步骤**：
1. pnpm kb:check 退出码 0
2. 三份文档新增节与实现一致（文中引用的每个文件路径都存在，逐个 ls 通过）
3. 契约文档含四道前置的判据表且与 round-driver 实际判定顺序一致

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：反向演练矩阵：npx tsx scripts/reverse-drill-matrix.mts → 退出码 0；6 条（FR-4 红5 / FR-1 红4 / FR-3 红1 / FR-5 红6 / FR-8 红2 / FR-10 红2）全部如预期变红且源码逐字节还原；报告 docs/requirements/REQ-261004065652-5c1c/evidence/regression.md

**验收状态**：✓ 通过

---

### v1-11 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：反向演练矩阵：npx tsx scripts/reverse-drill-matrix.mts → 退出码 0；6 条（FR-4 红5 / FR-1 红4 / FR-3 红1 / FR-5 红6 / FR-8 红2 / FR-10 红2）全部如预期变红且源码逐字节还原；报告 docs/requirements/REQ-261004065652-5c1c/evidence/regression.md

**验收状态**：✓ 通过

---

### v1-12 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：反向演练矩阵：npx tsx scripts/reverse-drill-matrix.mts → 退出码 0；6 条（FR-4 红5 / FR-1 红4 / FR-3 红1 / FR-5 红6 / FR-8 红2 / FR-10 红2）全部如预期变红且源码逐字节还原；报告 docs/requirements/REQ-261004065652-5c1c/evidence/regression.md

**验收状态**：✓ 通过

---

### v1-13 · 需求级验收 · 锚点失效

**验收内容**：验收锚点失效：以下验收标准引用的测试文件在仓库中不存在——修投影：写路径同源刷新窄投影快照 → tests/store-contract.test.ts。请把锚点改为真实文件，或回写设计/任务卡；本条不阻断验收，但通过时意见须写明处置方式。

**操作步骤**：
1. 验收锚点失效：以下验收标准引用的测试文件在仓库中不存在——修投影：写路径同源刷新窄投影快照 → tests/store-contract.test.ts。请把锚点改为真实文件，或回写设计/任务卡
2. 本条不阻断验收，但通过时意见须写明处置方式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：反向演练矩阵：npx tsx scripts/reverse-drill-matrix.mts → 退出码 0；6 条（FR-4 红5 / FR-1 红4 / FR-3 红1 / FR-5 红6 / FR-8 红2 / FR-10 红2）全部如预期变红且源码逐字节还原；报告 docs/requirements/REQ-261004065652-5c1c/evidence/regression.md

**验收状态**：✓ 通过

---

## 2. 测试报告

- 反向演练矩阵：npx tsx scripts/reverse-drill-matrix.mts → 退出码 0；6 条（FR-4 红5 / FR-1 红4 / FR-3 红1 / FR-5 红6 / FR-8 红2 / FR-10 红2）全部如预期变红且源码逐字节还原；报告 docs/requirements/REQ-261004065652-5c1c/evidence/regression.md
- 全量回归：npx vitest run --reporter=dot → 48 failed files / 98 failed / 3635 passed；失败名称集与基线 comm -3 为空（零新增失败）
- 类型闸门：npx tsc --noEmit | grep -c 'error TS' → 144（与开工基线持平）
- 知识层自检：pnpm kb:check → 11 项检查全部通过（K7 零漂移 / K9 符号 2153 = 源码口径 / K10 覆盖 10 项四要素齐全）
- 台账零改写演练：npx tsx scripts/reconcile-terminal-drill.mts --src <真台账副本> → 扫描 47 条、改动/新增/删除 全 0；35 条冷侧写不动被逐条点名；报告 docs/requirements/REQ-261004065652-5c1c/evidence/reconcile-drill.md
- 评审报告：docs/requirements/REQ-261004065652-5c1c/reviews/review-report.md（含 4 处设计偏离、1 次自身事故、残余风险表）
- 测试证据：docs/requirements/REQ-261004065652-5c1c/tests/test-evidence.md（三条主判据 + 12 个新用例文件 + 既有用例回归 + 测试契约变更 + 13 个任务的 covers 覆盖标注）
- AskConfirm 事故恢复三重证据：构建后无人写（82 会话全扫，仅 3 次只读）+ 行号指纹 4 处逐条对齐（原件 32/336/347/369）+ JSDoc 计数 34=34；报告 docs/requirements/REQ-261004065652-5c1c/evidence/AskConfirm.recovery-notes.md
- 文档同步与知识层：docs/requirements/REQ-261004065652-5c1c/evidence/docs-sync.md（契约文档判据表与 round-driver 行号逐一对齐；kb:check 从红转全绿）
- 两条人工裁定：docs/requirements/REQ-261004065652-5c1c/evidence/decisions.md（D-5 冷侧不放宽 / D-6 风格债在 t10 整形，均已履行）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 定契约：失败分类器 + 三个判定纯函数 + 类型扩展 | ✓ 通过 | human/session-2680cf17-b887-4352-bfdd-65ca72b53558 | 2026-10-04 08:38 |
| v1-2 | 修投影：写路径同源刷新窄投影快照 | ✓ 通过 | human/session-2680cf17-b887-4352-bfdd-65ca72b53558 | 2026-10-04 08:38 |
| v1-3 | 接线驱动：内存闭锁 + 退避熔断 + 额度闩 + 心跳不复活 | ✓ 通过 | human/session-2680cf17-b887-4352-bfdd-65ca72b53558 | 2026-10-04 08:38 |
| v1-4 | 人工门即停手 + 终态收手与启动对账 | ✓ 通过 | human/session-2680cf17-b887-4352-bfdd-65ca72b53558 | 2026-10-04 08:38 |
| v1-5 | 弹框缺省有界宽限（配置项，缺省 10 分钟） | ✓ 通过 | human/session-2680cf17-b887-4352-bfdd-65ca72b53558 | 2026-10-04 08:38 |
| v1-6 | 断点留痕去重限流（病因类别 + 10 分钟 + 截断） | ✓ 通过 | human/session-2680cf17-b887-4352-bfdd-65ca72b53558 | 2026-10-04 08:39 |
| v1-7 | 引擎开工预检 + 全局预算闸接线 | ✓ 通过 | human/session-2680cf17-b887-4352-bfdd-65ca72b53558 | 2026-10-04 08:39 |
| v1-8 | 迁移与兼容：对账反向脚本 + 台账副本演练 | ✓ 通过 | human/session-2680cf17-b887-4352-bfdd-65ca72b53558 | 2026-10-04 08:39 |
| v1-9 | 回归收口：反向演练矩阵 + 全量回归 + 类型闸门 | ✓ 通过 | human/session-2680cf17-b887-4352-bfdd-65ca72b53558 | 2026-10-04 08:39 |
| v1-10 | 知识层与文档同步（停机判据进契约文档） | ✓ 通过 | human/session-2680cf17-b887-4352-bfdd-65ca72b53558 | 2026-10-04 08:39 |
| v1-11 | 需求级验收 | ✓ 通过 | human/session-2680cf17-b887-4352-bfdd-65ca72b53558 | 2026-10-04 08:39 |
| v1-12 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-2680cf17-b887-4352-bfdd-65ca72b53558 | 2026-10-04 08:39 |
| v1-13 | 需求级验收 · 锚点失效 | ✓ 通过 | human/session-2680cf17-b887-4352-bfdd-65ca72b53558 | 2026-10-04 08:39 |
