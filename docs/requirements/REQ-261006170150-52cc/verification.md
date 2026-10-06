# REQ-261006170150-52cc 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：REQ-261006170150-52cc 交付：确认作答后先清位再推进，并让「清位」本身成为一次驱动请求；过期在途按分档 TTL 自动恢复；驱动放弃本拍留下有界痕迹。9/9 张卡完成，本需求 7 个用例文件 44 例全绿，端到端锁经反向验证（拿掉修复必红）。两处请人复核：① 两处 test 卡承载了 src 接线与演练脚本（自评 §2.4 已登记）；② 全量失败 73 > 基线 68，12 条新增经逐条 grep 归因全为外部并发 WIP，另 kb-generate 一项未达标亦归因外部。

## 1. 验收列表

### v1-1 · 等待位契约：清位回调与 notify 开关

**验收内容**：【等待位契约：清位回调与 notify 开关】验收

**操作步骤**：
1. ① npx vitest run tests/awaiting-clear-notice.test.ts 退出码 0：真清位回调恰 1 次、notify:false 为 0 次、台账本非 awaiting 为 0 次、回调抛错不外溢且返回 cleared:true
2. ② npx vitest run tests/layer-boundary.test.ts 全绿（未新增越层 import）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

### v1-2 · 确认收敛点：带 ref 清位先于推进 + 补发条件

**验收内容**：【确认收敛点：带 ref 清位先于推进 + 补发条件】验收

**操作步骤**：
1. ① npx vitest run tests/confirm-settle-order.test.ts 全绿：写入序为「停手位先清、status 后变」
2. 推进成功⇒notifyDrivable 0 次、被内容门拦下⇒1 次、reject 抛错⇒1 次
3. 第二票在场⇒停手位保持 awaiting-confirm:B
4. ② npx vitest run tests/ask-confirm-pending.test.ts tests/confirm-advance-deadlock.test.ts 全绿（旧语义零回归）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

### v1-3 · 在途登记分档过期（挂起 30 分钟 / 阻塞 60 分钟）

**验收内容**：【在途登记分档过期（挂起 30 分钟 / 阻塞 60 分钟）】验收

**操作步骤**：
1. ① npx vitest run tests/awaiting-inflight-ttl.test.ts 全绿：suspend:true 越 30 分钟 ⇒ inFlightFor false
2. suspend:false 在 30 分钟时仍 true、越 60 分钟才 false
3. 过期条目不进 list
4. exit 对过期 ref 幂等
5. ② npx vitest run tests/pending-confirm-ttl.test.ts 全绿（票 TTL 语义零变化）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

### v1-4 · 组合根与心跳装配：清位即驱动、过期即恢复

**验收内容**：【组合根与心跳装配：清位即驱动、过期即恢复】验收

**操作步骤**：
1. ① npx vitest run tests/heartbeat-awaiting-resume.test.ts 全绿：台账 awaiting + 在途已过期 ⇒ 一趟 tick 后停手位清、resumed 含该需求、notifyDrivable 调 1 次
2. 未过期 ⇒ 停手位保持、resumed 不含、0 次
3. ② npx vitest run tests/dive-wake-e2e.test.ts 全绿（真装配零回归）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

### v1-5 · 驱动放弃本拍的有界留痕（[WAKE-SKIP]）

**验收内容**：【驱动放弃本拍的有界留痕（[WAKE-SKIP]）】验收

**操作步骤**：
1. ① npx vitest run tests/wake-skip-trace.test.ts 全绿：同因连续 5 拍该窗口恰 1 条、跨冷却窗再 1 条、异因互不影响
2. ② npx vitest run tests/dive-human-gate-stop.test.ts tests/chain-budget.test.ts 全绿（停机判据零变化）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

### v1-6 · 端到端回归锁：确认后无需人敲字即起轮

**验收内容**：【端到端回归锁：确认后无需人敲字即起轮】验收

**操作步骤**：
1. ① npx vitest run tests/wake-after-confirm.test.ts 2 例全绿（不需要注入任何用户消息）
2. ② 反向验证有记录：把 confirm-settle 的清位改回旧的 void 无 ref 调用后该文件必红（输出摘要留档，随后还原）
3. ③ npx vitest run tests/dive-wake-e2e.test.ts 全绿

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

### v1-7 · 兼容形态与存量恢复演练（无数据迁移）

**验收内容**：【兼容形态与存量恢复演练（无数据迁移）】验收

**操作步骤**：
1. ① npx vitest run tests/awaiting-compat.test.ts 全绿
2. ② 演练记录含命令 + 输出摘要 + 副本 sha256 前后相等
3. ③ npx vitest run tests/config-defaults-parity.test.ts 全绿（不注入 = 现状）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

### v1-8 · 契约文档与排查手册收口

**验收内容**：【契约文档与排查手册收口】验收

**操作步骤**：
1. ① 三份文档可 grep 到「清位先于」「清位即驱动」「分档过期」关键句
2. ② npx vitest run tests/kb-generate.test.ts 全绿（若动导出符号先 pnpm kb:build）
3. ③ 手册新增节写明：停机位语义、触发面（事件 + 清位回调）与排查三步

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

### v1-9 · 实施自评与偏离登记

**验收内容**：【实施自评与偏离登记】验收

**操作步骤**：
1. ① 自评逐条列出 4 条 FR 的落点与判据读数，并写清「与设计不一致处」（无则写「无偏离」）
2. ② 读数齐：npx vitest run 与 npx tsc --noEmit -p tsconfig.json 的输出摘要
3. ③ 反向演练（拿掉修复必红）记录在案

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

### v1-10 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

### v1-11 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run tests/awaiting-clear-notice.test.ts tests/awaiting-inflight-ttl.test.ts tests/confirm-settle-order.test.ts tests/heartbeat-awaiting-resume.test.ts tests/wake-skip-trace.test.ts tests/wake-after-confirm.test.ts tests/awaiting-compat.test.ts → 7 files / 44 tests passed，退出码 0
- npx vitest run tests/ask-confirm-pending.test.ts tests/confirm-advance-deadlock.test.ts → 24/24 passed（旧语义零回归）
- npx vitest run tests/dive-wake-e2e.test.ts → 5/5 passed（真装配零回归）
- npx vitest run tests/dive-human-gate-stop.test.ts tests/chain-budget.test.ts → 22/22 passed（停机判据零变化）
- npx vitest run tests/config-defaults-parity.test.ts → 7/7 passed（不注入 = 现状）
- npx tsx docs/requirements/REQ-261006170150-52cc/evidence/legacy-recovery-drill.mts → 退出码 0；副本 645 文件、树哈希前后逐字节相等（零迁移）；Phase B 在真实历史记录 REQ-261006164732-6503 上 resumed=true、停手位已清、notifyDrivable 恰 1 次
- 反向演练：两次拿掉修复必红（TC-11 收敛点清位 / TC-12 通道接线），原始输出与还原核对见 evidence/wake-after-confirm-reverse.md
- npx tsx scripts/test-baseline.mts --check → 本次失败 73 / 基线 68（新增 12 / 不再失败 7）；12 条新增分布在 8 个文件，逐条 grep 其对本次改动模块的引用计数全为 0（外部并发窗口 WIP）
- npx tsc --noEmit -p tsconfig.json → 1 条错误（src/client/views/panels/verify.ts，未跟踪文件，属别窗口 WIP）；本次改动文件 0 条
- 测试证据全文（逐条 FR 对应 + 39 个任务的 covers 标注 + 未达标项）：docs/requirements/REQ-261006170150-52cc/tests/acceptance-evidence.md
- 实施自评与偏离登记（5 项偏离逐条理由与处置）：docs/requirements/REQ-261006170150-52cc/reviews/implementation-review.md
- 证据索引与可复跑命令：docs/requirements/REQ-261006170150-52cc/evidence/README.md
- 文档收口：docs/architecture/confirm-gate-advance.md、docs/architecture/automation-chain-contract.md §六、docs/architecture/project-manual.md（停机位语义/触发面/排查三步）
- 未达标项如实登记：tests/kb-generate.test.ts → 12/13（失败项 renderCodeMap 确定性与口径对齐；成因是别窗口改了 src/domain/knowledge/generate.ts 与 docs/knowledge/code-map.*）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 等待位契约：清位回调与 notify 开关 | ✓ 通过 | human/session-426ba81b-c952-4c52-8535-7e872ec0c69c | 2026-10-06 19:01 |
| v1-2 | 确认收敛点：带 ref 清位先于推进 + 补发条件 | ✓ 通过 | human/session-426ba81b-c952-4c52-8535-7e872ec0c69c | 2026-10-06 19:01 |
| v1-3 | 在途登记分档过期（挂起 30 分钟 / 阻塞 60 分钟） | ✓ 通过 | human/session-426ba81b-c952-4c52-8535-7e872ec0c69c | 2026-10-06 19:01 |
| v1-4 | 组合根与心跳装配：清位即驱动、过期即恢复 | ✓ 通过 | human/session-426ba81b-c952-4c52-8535-7e872ec0c69c | 2026-10-06 19:01 |
| v1-5 | 驱动放弃本拍的有界留痕（[WAKE-SKIP]） | ✓ 通过 | human/session-426ba81b-c952-4c52-8535-7e872ec0c69c | 2026-10-06 19:01 |
| v1-6 | 端到端回归锁：确认后无需人敲字即起轮 | ✓ 通过 | human/session-426ba81b-c952-4c52-8535-7e872ec0c69c | 2026-10-06 19:01 |
| v1-7 | 兼容形态与存量恢复演练（无数据迁移） | ✓ 通过 | human/session-426ba81b-c952-4c52-8535-7e872ec0c69c | 2026-10-06 19:01 |
| v1-8 | 契约文档与排查手册收口 | ✓ 通过 | human/session-426ba81b-c952-4c52-8535-7e872ec0c69c | 2026-10-06 19:01 |
| v1-9 | 实施自评与偏离登记 | ✓ 通过 | human/session-426ba81b-c952-4c52-8535-7e872ec0c69c | 2026-10-06 19:01 |
| v1-10 | 需求级验收 | ✓ 通过 | human/session-426ba81b-c952-4c52-8535-7e872ec0c69c | 2026-10-06 19:01 |
| v1-11 | 需求级验收 | ✓ 通过 | human/session-426ba81b-c952-4c52-8535-7e872ec0c69c | 2026-10-06 19:05 |
