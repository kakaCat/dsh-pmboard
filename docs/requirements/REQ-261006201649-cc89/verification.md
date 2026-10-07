# REQ-261006201649-cc89 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付：原型面补齐被漏掉的两问——权威原型必须是填过的（非骨架判据），实现必须有可复核的对照（对照项硬判据 + 几何量读数绑截图 sha256）。三处改动：① 非骨架判据（占位标记 + 与模板行重合率 > 0.90；实测骨架 0.957 / 真稿 0.217–0.391 呈双峰）挂在锚点门第一问，新码 prototype_placeholder；② 对照项由可选改硬判据并改读 INDEX 权威行，取不到时退回台账并在项上标注降级；③ 对齐判据从某条需求专属靶子变成可参数化通用判据（既有靶子改造为调用方，it 15→24）。四条元判据实跑：反向演练 A 三向（骨架必红 / 真稿必绿 / 无基线不判）、演练 B 负向（退回旧取数让测试变红，还原后复绿）、tsc 对改动文件零错误、build:client 打印 verify-client OK。存量零回归：按 createdAt 整段豁免，新键加性可选、无迁移脚本。

## 1. 验收列表

### v1-1 · 实现非骨架判据纯函数并锁死阈值口径

**验收内容**：【实现非骨架判据纯函数并锁死阈值口径】验收

**操作步骤**：
1. 跑 npx vitest run tests/prototype-placeholder.test.ts 全绿，且必须含这四条可失败断言：① 渲染后的骨架原文对自身命中且 hits 含 marker
2. ② 本需求 prototypes/gate-feedback.html 不命中且 lineRatio < 0.90
3. ③ 只把占位符换词、结构不动 → 仍命中（similarity 分支独立生效）
4. ④ 空文件与空基线不抛错（lineRatio === 0 / 返回 undefined）。另跑 npx tsx scripts/req-doc-validate.mts --req REQ-261006201649-cc89 无新增缺口。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/prototype-placeholder.test.ts → 15 passed。四条必备断言逐条在位：骨架自命中含 marker；本需求原型不命中且 lineRatio 0.391 < 0.90；部分填后仍命中；空文件与空基线不抛错。tsx scripts/req-doc-validate.mts --req REQ-261006201649-cc89 → 缺口 0，exit 0。

**验收状态**：✓ 通过

---

### v1-2 · 把非骨架判据接进锚点门并在它之后接几何量证据校验

**验收内容**：【把非骨架判据接进锚点门并在它之后接几何量证据校验】验收

**操作步骤**：
1. 跑 npx vitest run tests/prototype-placeholder-gate.test.ts tests/prototype-geometry-evidence.test.ts 全绿，且必须含：① 反向演练 A——把 REQ-261006164732-6503 的真实三份文件喂给 checkPrototypeAnchorsGate → code === 'prototype_placeholder' 且 gaps 点名 prototypes/detail.html
2. 换成填过的原型 → undefined
3. 基线为空 → undefined（不判不假红）
4. ② 码唯一性——骨架报 prototype_placeholder、真稿缺锚点报 prototype_anchor_missing（两码必须不同）
5. ③ 早退不变——INDEX 两条 authoritative 时仍是 prototype_version_conflict
6. ④ 存量需求（旧 createdAt）+ 骨架仍放行
7. ⑤ 证据三态——两键齐且对 collected / 两键都缺 unverified 放行 / 给一键或坏 sha 或路径不存在 invalid 并点名。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/prototype-placeholder-gate.test.ts tests/prototype-geometry-evidence.test.ts → 14 + 29 passed。反向演练 A 三向：真实骨架 → prototype_placeholder 且点名 prototypes/detail.html；换真稿 → undefined；不注入基线 → undefined。码唯一性、早退三态、存量豁免、证据三态均有用例。

**验收状态**：✓ 通过

---

### v1-3 · 对照项由可选改硬判据并改读 INDEX 权威行

**验收内容**：【对照项由可选改硬判据并改读 INDEX 权威行】验收

**操作步骤**：
1. 跑 npx vitest run tests/verification-prototype-compare-required.test.ts 全绿，且必须含：① 有权威原型 ⇒ 验收单必含 source.kind === 'prototype-compare' 且 prototypePath 等于 INDEX 权威行
2. ② 反向演练 B——把「有权威原型 ⇒ 组装对照项」退化成旧条件化分支后必须有测试变红（同一用例改动前后各跑一次：红 → 绿）
3. ③ 豁免生效需求仍渲染豁免说明行且不阻塞提交
4. ④ 存量需求（旧 createdAt）产出与改动前逐字一致
5. ⑤ 逐项 results 的 ref 键仍是 prototype:<path>，漏项仍被点名。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/verification-prototype-compare-required.test.ts → 9 passed。靶心：台账登记 zz-ledger.html、INDEX 权威行 aa-authoritative.html，断言验收单取到后者。演练 B 负向实跑：取数退回台账排序首项 → 2 failed（变红），还原后 9 passed。

**验收状态**：✓ 通过

---

### v1-4 · 实现可参数化原型对齐判据并改造既有靶子为调用方

**验收内容**：【实现可参数化原型对齐判据并改造既有靶子为调用方】验收

**操作步骤**：
1. 跑 npx vitest run tests/prototype-parity.test.ts 全绿，且必须含：① 三条契约各有正反例（少一个 class / data-* 属性名不符（复现 data-result-src vs data-result-source）/ DOM 顺序颠倒 → 各出违规）
2. ② 每条违规 anchor 非空且形态 prototypes/<name>.html#FR-N
3. ③ 断言只增不减——it(...) 条数 ≥ 改造前
4. ④ 正向样本 REQ-261006175040-12d4 的 card-gates.html 配实现渲染 → 零违规
5. ⑤ pnpm build:client 打印 [verify-client] OK。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/prototype-parity.test.ts tests/prototype-parity-contracts.test.ts → 24 + 19 passed。断言只增不减已量化：it 由 15 增至 24。三条契约各含正反例，dataAttrs 反例复现真实事故 data-result-src vs data-result-source。pnpm build:client → [verify-client] OK。

**验收状态**：✓ 通过

---

### v1-5 · 登记两个新错误码的三处身份

**验收内容**：【登记两个新错误码的三处身份】验收

**操作步骤**：
1. 跑 npx vitest run tests/prototype-new-codes.test.ts 全绿，且必须含：① statusForCode('prototype_placeholder') === 400 且 ('prototype_geometry_unverified') === 400（不是 500）
2. ② ERROR_CATEGORY 两键都在且值非空
3. ③ MoveRequirement 映射表两键成对（内部码 ↔ 传输码）
4. ④ 两个新码的 message 命中 GATE_HOW_ANCHOR 正则
5. ⑤ pnpm build:client 打印 [verify-client] OK。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/prototype-new-codes.test.ts → 13 passed。状态断言走真实 fail() 路径读真写出的状态码：两个新码 400、未登记码 500。传输码成对、中文类别名两键齐、信封 how 命中 GATE_HOW_ANCHOR（真实门产出文案）。既有信封与输出契约 60 条全绿。

**验收状态**：✓ 通过

---

### v1-6 · 把非骨架判据与对照纪律写进项目契约文档并挂进 wiki 索引

**验收内容**：【把非骨架判据与对照纪律写进项目契约文档并挂进 wiki 索引】验收

**操作步骤**：
1. ① 新页面有 front-matter 且被上层页链接（不是孤儿页）
2. ② 跑 python3 agent-dh/scripts/wiki_probe.py 无死链、无孤儿页，或如实报告读数并说明原因
3. ③ 文档写清三件事：非骨架判据两条命中口径与阈值依据、对照项为硬判据、几何量读数两键与 unverified 口径
4. ④ 引 prototype-gate-and-decision-log.md §2 三门表并注明新增判据挂在锚点门
5. ⑤ 反向演练 A/B 的命令与期望写在文档里可照抄。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：新页 docs/architecture/prototype-non-skeleton-and-parity-contract.md（八节）被 prototype-gate-and-decision-log.md 加续篇链接引用，非孤儿。照文档 §6 三条命令实跑：14 + 9 + 211 全绿。如实报告：本机无 agent-dh/scripts/wiki_probe.py，改做全库相对链接扫描 227 条，新页与改动页链接全部可达；全库存量死链 25 条均与本卡无关。

**验收状态**：✓ 通过

---

### v1-7 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：需求级六条验收标准逐条有读数（见 tests/test-evidence.md §6 对照表）：① 演练 A 14 passed（负向 4 failed）；② 演练 B 9 passed（负向 2 failed）；③ 12 files / 220 passed；④ Build complete + verify-client OK；⑤ 存量零回归（失败集合逐条一致）；⑥ 本需求原型过 FR-1 判据（lineRatio 0.391）。

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

**实际结果**：D-1（立项需直接人工回合）：三次失败原文与代码判据均已追至 SessionProbeAdapter.requireDirectHuman，未改该判据；D-2（页面实现与原型不一致）：9 条骨架实测 + 反向演练 A 已落地为新判据；D-3（用占位标记+行重合率而非文件哈希）：prototype-placeholder.ts 无任何 hash 逻辑（grep 零命中），阈值 0.90 有双峰读数；D-4（缺两键记 unverified 而非一律拒）：observationEvidenceOf 判定表逐行有用例；D-5（本需求自交原型）：gate-feedback.html 过自己立的判据。

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run tests/prototype-*.test.ts tests/plan-prototype-anchor-gate.test.ts tests/verification-prototype-compare-required.test.ts → Test Files 12 passed / Tests 220 passed
- docs/requirements/REQ-261006201649-cc89/tests/test-evidence.md（逐条读数：12 套件条数、两条演练负向实测、类型与构建、覆盖标注）
- docs/requirements/REQ-261006201649-cc89/tests/prototype-suites.txt（当次命令原始输出）
- docs/requirements/REQ-261006201649-cc89/reviews/review-1.md（独立复核清单与三处优先看的事）
- npx tsc --noEmit 对本需求改动的九个文件 → 无输出（零类型错误）
- pnpm build:client → [verify-client] OK bundle=721645 bytes
- pnpm build → Build complete
- 反向演练 A 负向实跑：摘掉非骨架判据 → tests/prototype-placeholder-gate.test.ts 4 failed / 10 passed；还原后 14 passed
- 反向演练 B 负向实跑：取数退回台账排序首项 → tests/verification-prototype-compare-required.test.ts 2 failed / 7 passed；还原后 9 passed
- diff -q 两个被演练改动的文件与备份 → 逐字节一致（演练改动已完全还原）
- docs/requirements/REQ-261006201649-cc89/prototypes/gate-feedback.html（权威原型；也是非骨架判据的自洽性样本）
- docs/requirements/REQ-261006201649-cc89/evidence/gate-feedback-1280.png（几何量读数截图，sha256 9d9ba17c95dfa8c843e8aab3a8aafecf732004b63cde1355512d9001959c91a9）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 实现非骨架判据纯函数并锁死阈值口径 | ✓ 通过 | human/session-786f4cb7-43b2-4437-a439-d6d32b700eed | 2026-10-06 21:28 |
| v1-2 | 把非骨架判据接进锚点门并在它之后接几何量证据校验 | ✓ 通过 | human/session-786f4cb7-43b2-4437-a439-d6d32b700eed | 2026-10-06 21:28 |
| v1-3 | 对照项由可选改硬判据并改读 INDEX 权威行 | ✓ 通过 | human/session-786f4cb7-43b2-4437-a439-d6d32b700eed | 2026-10-06 21:28 |
| v1-4 | 实现可参数化原型对齐判据并改造既有靶子为调用方 | ✓ 通过 | human/session-786f4cb7-43b2-4437-a439-d6d32b700eed | 2026-10-06 21:28 |
| v1-5 | 登记两个新错误码的三处身份 | ✓ 通过 | human/session-786f4cb7-43b2-4437-a439-d6d32b700eed | 2026-10-06 21:28 |
| v1-6 | 把非骨架判据与对照纪律写进项目契约文档并挂进 wiki 索引 | ✓ 通过 | human/session-786f4cb7-43b2-4437-a439-d6d32b700eed | 2026-10-06 21:29 |
| v1-7 | 需求级验收 | ✓ 通过 | human/session-786f4cb7-43b2-4437-a439-d6d32b700eed | 2026-10-06 21:29 |
| v1-8 | 需求级验收 | ✓ 通过 | human/session-786f4cb7-43b2-4437-a439-d6d32b700eed | 2026-10-06 21:29 |
| v1-9 | 需求级验收 | ✓ 通过 | human/session-786f4cb7-43b2-4437-a439-d6d32b700eed | 2026-10-06 21:29 |
