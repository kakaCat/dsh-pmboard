# REQ-261004151652-d535 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v2

**交付结论**：交付结论（第二版，含验收反馈整改）：流程图里每个节点的 token 跟它自己的名字走——节点内上下两行（名字在上、数字在下），横向占用 358px→214px；「节点 token」阈值 1000→600 与「节点名」阈值相等，使「有名字就有该节点的数」成为结构性事实（600<容器≤780 只剩当前节点，但它带着自己的数）；累计总数徽章默认隐藏、只在明细全隐（≤600）时让位。验收反馈整改：上一版数字 10px 正文黑比名字（8px 状态色）还大还深，主次颠倒——现改为数字 8px 次要灰、与名字同号并退居辅助，计数与徽章同步收到 9px。自检：探针 6 档 + 降级全过、三条断言各自实测能红；单测 22 条 + 端到端 2 条全绿；全量失败集合与基线逐文件零差异；类型与基线持平；构建 [verify-client] OK。待人工项：三档截图与整改图均为标本页渲染（真 CSS + 真模型 + 真 Chrome），客户端样式刷新页面即可生效，后端侧无需变更。

## 1. 验收列表

### v2-1 · 流程图节点改上下两行，且让「有名字就有该节点的数」

**验收内容**：【流程图节点改上下两行，且让「有名字就有该节点的数」】验收

**操作步骤**：
1. ./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts 全绿：FLOW_TIERS 与三段 @container 阈值逐一相等（600/780/600）
2. FLOW_TIERS.token === FLOW_TIERS.label
3. TOKEN_CSS 含 .dsh-pm-flow-meta 的 flex-direction: column
4. 徽章默认 display:none 且 label 档块内有 display:inline-flex
5. BOARD_CSS 内不存在把节点级 token 与 label 拆到两个断点的规则。另 pnpm build:client 退出码 0（[verify-client] OK）
6. pnpm typecheck 本需求文件 0 个错误。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：./node_modules/.bin/tsx scripts/header-progress-probe.mts → 6 档 problems=NONE：容器 1232/976/852 为「7 名 + 2 数 + 6 线 + 无徽章」，720 为「1 名 + 1 数 + 0 线 + 无徽章」，592/452 为「0 名 + 0 数 + 0 线 + 徽章可见」；输出 docs/requirements/REQ-261004151652-d535/evidence/t2-probe-green.txt

**验收状态**：✓ 通过

---

### v2-2 · 探针改判据：可见集重写 + 三条新断言 + 红态自证

**验收内容**：【探针改判据：可见集重写 + 三条新断言 + 红态自证】验收

**操作步骤**：
1. ./node_modules/.bin/tsx scripts/header-progress-probe.mts 退出码 0，6 档 problems=NONE 且可见集与设计 test-cases.md TC-1 期望表逐档一致（1232/976/852：7名+2数+6线+无徽章
2. 720：1名+1数+0线+无徽章
3. 592/452：0名+0数+0线+徽章可见）
4. --fallback 模式 PASS（全明细可见+徽章隐藏）。红态自证：把 FLOW_TIERS.token 改回 1000 → 720 档变「1 名 0 数」→ 退出码 1
5. 把徽章改回常显 → 宽档报 TOTAL_DUPLICATED → 退出码 1
6. 红/绿两份 stdout 存入 evidence/。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：./node_modules/.bin/tsx scripts/header-progress-probe.mts → 6 档 problems=NONE：容器 1232/976/852 为「7 名 + 2 数 + 6 线 + 无徽章」，720 为「1 名 + 1 数 + 0 线 + 无徽章」，592/452 为「0 名 + 0 数 + 0 线 + 徽章可见」；输出 docs/requirements/REQ-261004151652-d535/evidence/t2-probe-green.txt

**验收状态**：✓ 通过

---

### v2-3 · 构建与基线回归 + 三档截图（收口）

**验收内容**：【构建与基线回归 + 三档截图（收口）】验收

**操作步骤**：
1. pnpm build 与 pnpm build:client 退出码 0 且输出含 [verify-client] OK、dist/index.mjs 与 lib/client.js 时间戳更新
2. 全量 pnpm test 的失败文件集合与改动前逐文件相同（贴 diff 输出）
3. pnpm typecheck 错误数 ≤ 146
4. 三档截图（视口 1280 / 700 / 560）落盘且 700 档图里当前节点名字下方能看到它自己的数、560 档图里只有圆点+计数+徽章
5. evidence/ 下有兼容与回滚说明。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：./node_modules/.bin/tsx scripts/header-progress-probe.mts → 6 档 problems=NONE：容器 1232/976/852 为「7 名 + 2 数 + 6 线 + 无徽章」，720 为「1 名 + 1 数 + 0 线 + 无徽章」，592/452 为「0 名 + 0 数 + 0 线 + 徽章可见」；输出 docs/requirements/REQ-261004151652-d535/evidence/t2-probe-green.txt

**验收状态**：✓ 通过

---

### v2-4 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：./node_modules/.bin/tsx scripts/header-progress-probe.mts → 6 档 problems=NONE：容器 1232/976/852 为「7 名 + 2 数 + 6 线 + 无徽章」，720 为「1 名 + 1 数 + 0 线 + 无徽章」，592/452 为「0 名 + 0 数 + 0 线 + 徽章可见」；输出 docs/requirements/REQ-261004151652-d535/evidence/t2-probe-green.txt

**验收状态**：✓ 通过

---

### v2-5 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：./node_modules/.bin/tsx scripts/header-progress-probe.mts → 6 档 problems=NONE：容器 1232/976/852 为「7 名 + 2 数 + 6 线 + 无徽章」，720 为「1 名 + 1 数 + 0 线 + 无徽章」，592/452 为「0 名 + 0 数 + 0 线 + 徽章可见」；输出 docs/requirements/REQ-261004151652-d535/evidence/t2-probe-green.txt

**验收状态**：✓ 通过

---

## 2. 测试报告

- ./node_modules/.bin/tsx scripts/header-progress-probe.mts → 6 档 problems=NONE：容器 1232/976/852 为「7 名 + 2 数 + 6 线 + 无徽章」，720 为「1 名 + 1 数 + 0 线 + 无徽章」，592/452 为「0 名 + 0 数 + 0 线 + 徽章可见」；输出 docs/requirements/REQ-261004151652-d535/evidence/t2-probe-green.txt
- 降级路径：tsx scripts/header-progress-probe.mts --fallback → PASS（全明细可见 + 徽章隐藏）；输出 docs/requirements/REQ-261004151652-d535/evidence/t2-probe-fallback-green.txt
- 红态自证 A（旧阈值 1000 的单藏 token 档）→ 720 档报 TOKENS_HIDDEN_BESIDE_LABELS，退出码 1（evidence/t2-probe-red-token1000.txt）；红态自证 B（徽章常显）→ 宽档报 TOTAL_DUPLICATED，退出码 1（evidence/t2-probe-red-badge-always.txt）
- 单测 24 条全绿（响应式 22 + 端到端 2），含 TC-2g 阈值等式、TC-2h 纵排、TC-2i 不许拆档、TC-2f 徽章显隐与特异性前缀
- 全量回归：失败文件集合与开工前基线逐文件零差异（46 文件 / 96 用例）；汇总 docs/requirements/REQ-261004151652-d535/evidence/full-suite-final.txt
- 类型检查 146 与基线持平，本需求文件 0 个错误；构建 pnpm build 退出码 0、[verify-client] OK
- 视觉证据三档（标本页：真 CSS + 真模型 + 真 Chrome）：evidence/header-node-tokens-1280.png、header-node-tokens-700.png（剩当前节点但它带着 12.7M）、header-node-tokens-560.png
- 验收反馈整改（字体与配色）：节点数 10px 正文黑 → 8px 次要灰（与名字同号、退居辅助），计数与徽章 10px → 9px；整改后图 evidence/font-after-fix.png，候选对照 font-A/B/C/D.png；说明见 docs/requirements/REQ-261004151652-d535/evidence/t3-evidence.md
- 兼容与回滚逐条：docs/requirements/REQ-261004151652-d535/evidence/t3-evidence.md
- 评审报告（内部自评，含 4 处问题披露）：docs/requirements/REQ-261004151652-d535/reviews/self-review.md
- 测试证据（含 covers 任务对应表、未跑项与真机复核命令）：docs/requirements/REQ-261004151652-d535/tests/test-evidence.md

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v2-1 | 流程图节点改上下两行，且让「有名字就有该节点的数」 | ✓ 通过 | human/session-65308960-767d-4e3a-852e-1b7a55660c3d | 2026-10-04 15:44 |
| v2-2 | 探针改判据：可见集重写 + 三条新断言 + 红态自证 | ✓ 通过 | human/session-65308960-767d-4e3a-852e-1b7a55660c3d | 2026-10-04 15:44 |
| v2-3 | 构建与基线回归 + 三档截图（收口） | ✓ 通过 | human/session-65308960-767d-4e3a-852e-1b7a55660c3d | 2026-10-04 15:44 |
| v2-4 | 需求级验收 | ✓ 通过 | human/session-65308960-767d-4e3a-852e-1b7a55660c3d | 2026-10-04 15:44 |
| v2-5 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-65308960-767d-4e3a-852e-1b7a55660c3d | 2026-10-04 15:44 |
