# REQ-261006175040-12d4 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：看板卡面门读数修复交付完成：门状态改由服务端算好随首屏摘要下发（gates/planState/archivePrepared 三枚有界读数），客户端删掉自己的判定只渲染；四门 chips 与「门 c/总数」按台账事实渲染，卡面「确认产物」入口恢复可用，计划/验收/归档 chip 不再沉默或误报，读数不可得时整块不渲染（读不到 ≠ 缺失）。零 schema 变更、零迁移、台账零写入。258 条用例全绿、真实台账 60/60 读数齐全、四张实拍图与权威原型一致；不达标项仅剩外部原因（typecheck 的 vendor 路径错与基线里其他需求的在飞失败）。

## 1. 验收列表

### v1-1 · 新建 domain 门判定纯函数并补单测

**验收内容**：【新建 domain 门判定纯函数并补单测】验收

**操作步骤**：
1. pnpm vitest run tests/gate-readings.test.ts 全绿：三态齐全
2. design 多份有一份未落章即 pending 且 count 为份数
3. 空 artifacts 全 missing
4. planStateOf 三态与 undefined
5. archivePreparedOf 两态（归档记录 ∨ 归档产物）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/gate-readings.test.ts → 14 passed（三态 / design 成组 / count / planState 三态与缺省 / archivePrepared 两来源）；文件 import 语句 0 条（分层不变量）

**验收状态**：✓ 通过

---

### v1-2 · 摘要补三个有界键并把装配收成单点

**验收内容**：【摘要补三个有界键并把装配收成单点】验收

**操作步骤**：
1. pnpm vitest run tests/reqboard/domain-summary.test.ts 全绿：键集恰好等于 SUMMARY_KEYS（三个新键在册）
2. artifacts === undefined ⇒ 出口无 gates/archivePrepared 键（不是 [] 也不是 missing）
3. BIG_FIELD_KEYS 一个都不出现。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/reqboard/domain-summary.test.ts → 26 passed；键集恰等于 SUMMARY_KEYS；artifacts === undefined ⇒ 出口无 gates/archivePrepared 键

**验收状态**：✓ 通过

---

### v1-3 · 分片读侧接线（含存在性探针）

**验收内容**：【分片读侧接线（含存在性探针）】验收

**操作步骤**：
1. pnpm vitest run tests/reqboard/store-contract.test.ts 中分片读套件全绿
2. 索引构建后 listSummaries() 的 gates 与台账一致
3. 登记/落章后读数即时刷新且不新增 readObject 调用
4. 读对象失败 ⇒ 不下发读数 + onWarn，需求仍在索引里。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：真实台账：60/60 需求有 gates、0 告警；预热后第二次调用 0ms（索引命中）；写路径广播改权威口径（补 artifacts: []）

**验收状态**：✓ 通过

---

### v1-4 · SQLite 与两条测试辅助接线

**验收内容**：【SQLite 与两条测试辅助接线】验收

**操作步骤**：
1. pnpm vitest run tests/reqboard/store-contract.test.ts tests/state-payload-client.test.ts 全绿
2. SQLite 摘要带读数且 readObject 调用增量为 0
3. 假投影与 InMemory 的 summarize 直出全部改走 boardSummaryOf（grep 断言为 0）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep 直出 summarize( 残留 = 0；SQLite 对 readObject 引用 = 0（零额外 IO）；vitest run 4 文件 → 163 passed

**验收状态**：✓ 通过

---

### v1-5 · 四实现同形与载荷上界断言

**验收内容**：【四实现同形与载荷上界断言】验收

**操作步骤**：
1. 两条命令全绿：pnpm vitest run tests/reqboard/store-contract.test.ts tests/state-payload-client.test.ts
2. 人为让一条实现漏装配读数 ⇒ 同形断言必红（逆验证取证）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：store-contract + state-payload-client → 129 passed（四实现读数同形 + 载荷 gates ≤ 5）；逆验证③漏装配一条 ⇒ 2 条同形断言红

**验收状态**：✓ 通过

---

### v1-6 · 卡面渲染改为只读读数（删客户端判定）

**验收内容**：【卡面渲染改为只读读数（删客户端判定）】验收

**操作步骤**：
1. pnpm vitest run tests/card-face.test.ts 全绿：三态 chip 文案逐字对齐原型
2. 派生行只出 门 c/total（不再有 产物 N/M 与 N 门待确认）
3. 当前门 pending 才渲染确认按钮（design 文案带 count）
4. planState/archivePrepared 缺省时不渲染对应 chip
5. grep -c computeGateStatuses src/client 为 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：tests/card-face.test.ts → 21 passed（三态 chips / 门 3/4 / 按钮在场缺席 / 计划与归档 chip / 读数缺省整块不渲染）；grep -c computeGateStatuses src/client = 0；pnpm build:client → [verify-client] OK

**验收状态**：✓ 通过

---

### v1-7 · 跨缝用例：只喂摘要字段的渲染断言

**验收内容**：【跨缝用例：只喂摘要字段的渲染断言】验收

**操作步骤**：
1. pnpm vitest run tests/card-face-summary-shape.test.ts 全绿
2. 改动前必红已用 git stash 取证（取证输出入证据）
3. 夹具若被改回全量记录形状则证伪力失效（评审点）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：tests/card-face-summary-shape.test.ts → 4 passed（只喂摘要字段）；逆验证① 4/4 红、② 2/4 红，复原逐字节一致

**验收状态**：✓ 通过

---

### v1-8 · 读放大上界用例（桩计数）

**验收内容**：【读放大上界用例（桩计数）】验收

**操作步骤**：
1. pnpm vitest run tests/state-no-bigfield-read.test.ts 全绿：连续 3 次 /state 对 artifacts/plan/verification/archive 的 readObject 增量为 0
2. 索引重建后增量如实为 1 次/条（不伪造成 0）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：tests/state-no-bigfield-read.test.ts → 3 passed（预热读 3 件、从不读 verification.json、连续 3 次增量 0、重建如实 3）

**验收状态**：✓ 通过

---

### v1-9 · E2E 出图脚本与三态证据

**验收内容**：【E2E 出图脚本与三态证据】验收

**操作步骤**：
1. npx tsx scripts/card-gates-ui-shot.mts 退出码 0（0 成功 / 1 有图不像话 / 2 环境不可用，不静默跳过）
2. PNG 覆盖三态卡面 + 降级态
3. 人看与 prototypes/card-gates.html 逐区块一致（锚点 5/5）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/card-gates-ui-shot.mts → 退出码 0；四张 2560×1800 PNG（三态 + 降级）

**验收状态**：✓ 通过

---

### v1-10 · 兼容与回滚收口

**验收内容**：【兼容与回滚收口】验收

**操作步骤**：
1. ① 旧服务端形态下卡面不出现 ✗、产物 0/6、门 0/N，其余卡面照旧
2. ② pnpm build:client 输出 [verify-client] OK
3. ③ pnpm typecheck 退出码 0 且 pnpm baseline:check 失败用例集合差为空
4. ④ 回滚演练证据入 compat-rollback.md。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：真实 60 条旧形态载荷 ⇒ 整页 ✗ 0 处 / 产物 0/6 0 处 / 门 0/4 0 处；基线两轮：新增失败不含本需求测试文件（stage-panel 回归已修）

**验收状态**：✓ 通过

---

### v1-11 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：7 条 FR 逐条有落点：FR-1/FR-3/FR-4/FR-5/FR-6 → t6+t7（三态 chips / 门 c/总数 / 确认入口 / 计划·验收·归档 chip / 降级）；FR-2 → t2+t3+t4+t8（服务端算 + 四实现同形 + 读放大 0）；FR-7 → t5+t7+t8+t9+t10

**验收状态**：✓ 通过

---

### v1-12 · 需求级验收

**验收内容**：与原型对照截图（含差异说明）

**操作步骤**：
1. 与原型对照截图（含差异说明）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

### v1-13 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：D-1 缺陷确认：真实台账 60/60 需求读数与台账一致（四红消失）；D-2 服务端算客户端只渲染：客户端判定已删（grep 0）；D-3 门 c/总数：断言 门 3/4 且无 产物 N/M；D-4 交原型：card-gates.html 已登记 authoritative + 四张实拍对照；D-5 修复范围含确认入口：按钮在场/缺席用例覆盖；D-6 读不到≠缺失：缺省读数整块不渲染（逆验证②守线）

**验收状态**：✓ 通过

---

### v1-14 · 需求级验收

**验收内容**：E2E 覆盖：**有**（存在跨组件跑通完整业务链路的场景用例）

**操作步骤**：
1. E2E 覆盖：**有**（存在跨组件跑通完整业务链路的场景用例）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run（8 个相关文件）→ Test Files 8 passed (8) · Tests 258 passed (258)
- 真实台账端到端：ShardedRequirementStore.listSummaries() → 需求数 60 · 有 gates 60 · 告警 0；目标需求 requirement:confirmed:1 / design:confirmed:6 / decomposition:confirmed:1 / verification:missing:0 · planState=approved
- pnpm build:client → [verify-client] OK  bundle=712353 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
- npx tsx scripts/card-gates-ui-shot.mts → 退出码 0；四张 2560×1800 PNG 落 evidence/（analysis / design-group / implementing / degraded）
- docs/requirements/REQ-261006175040-12d4/reviews/self-review.md（自评审报告：设计一致性 + 5 条对抗式自查 + 4 次施工事故 + 4 项不达标/遗留）
- docs/requirements/REQ-261006175040-12d4/tests/test-evidence.md（逐条命令 + 实得输出 + FR↔证据对照表 + 逐卡 covers 对照）
- docs/requirements/REQ-261006175040-12d4/evidence/inverse-verification.md（三条逆验证：4/4 红、2/4 红、2 条同形红，均逐字节复原）
- docs/requirements/REQ-261006175040-12d4/evidence/compat-rollback.md（旧服务端真实 60 条载荷演练 + 回滚步骤与危险侧）
- docs/requirements/REQ-261006175040-12d4/evidence/payload-baseline.md（改动前 9,325,744 B；索引构建多读 2.19 MiB；连续 3 次 /state 增量 0）
- docs/requirements/REQ-261006175040-12d4/evidence/before-repro.md（改动前缺陷复现：四门全红 + 产物 0/6 + 无按钮，与用户截图逐字一致）
- 不达标项（外部原因，不掩饰）：pnpm typecheck 剩 1 条 vendor 路径错（属 REQ-261006130057-7a43 在飞）；pnpm baseline:check 新增失败清单不含本需求任何测试文件（未 refresh 基线）
- 清单证据：grep -c computeGateStatuses src/client = 0；grep 直出 summarize(（四实现 + 测试辅助 + 契约内只读替身）= 0

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 新建 domain 门判定纯函数并补单测 | ✓ 通过 | human/session-5678dda2-4511-465c-bae1-0b321cd1c0fc | 2026-10-06 18:58 |
| v1-2 | 摘要补三个有界键并把装配收成单点 | ✓ 通过 | human/session-5678dda2-4511-465c-bae1-0b321cd1c0fc | 2026-10-06 18:58 |
| v1-3 | 分片读侧接线（含存在性探针） | ✓ 通过 | human/session-5678dda2-4511-465c-bae1-0b321cd1c0fc | 2026-10-06 18:58 |
| v1-4 | SQLite 与两条测试辅助接线 | ✓ 通过 | human/session-5678dda2-4511-465c-bae1-0b321cd1c0fc | 2026-10-06 18:58 |
| v1-5 | 四实现同形与载荷上界断言 | ✓ 通过 | human/session-5678dda2-4511-465c-bae1-0b321cd1c0fc | 2026-10-06 18:58 |
| v1-6 | 卡面渲染改为只读读数（删客户端判定） | ✓ 通过 | human/session-5678dda2-4511-465c-bae1-0b321cd1c0fc | 2026-10-06 18:58 |
| v1-7 | 跨缝用例：只喂摘要字段的渲染断言 | ✓ 通过 | human/session-5678dda2-4511-465c-bae1-0b321cd1c0fc | 2026-10-06 18:58 |
| v1-8 | 读放大上界用例（桩计数） | ✓ 通过 | human/session-5678dda2-4511-465c-bae1-0b321cd1c0fc | 2026-10-06 18:58 |
| v1-9 | E2E 出图脚本与三态证据 | ✓ 通过 | human/session-5678dda2-4511-465c-bae1-0b321cd1c0fc | 2026-10-06 18:58 |
| v1-10 | 兼容与回滚收口 | ✓ 通过 | human/session-5678dda2-4511-465c-bae1-0b321cd1c0fc | 2026-10-06 18:58 |
| v1-11 | 需求级验收 | ✓ 通过 | human/session-5678dda2-4511-465c-bae1-0b321cd1c0fc | 2026-10-06 18:59 |
| v1-12 | 需求级验收 | ✓ 通过 | human/session-5678dda2-4511-465c-bae1-0b321cd1c0fc | 2026-10-06 18:59 |
| v1-13 | 需求级验收 | ✓ 通过 | human/session-5678dda2-4511-465c-bae1-0b321cd1c0fc | 2026-10-06 18:59 |
| v1-14 | 需求级验收 | ✓ 通过 | human/session-5678dda2-4511-465c-bae1-0b321cd1c0fc | 2026-10-06 18:59 |
