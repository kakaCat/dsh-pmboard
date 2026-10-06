# 实施评审报告（REQ-261006094052-1da2）

> 角色：本需求实施窗口（owner）对五张卡的集中评审。
> 口径：只采信可复核产出（命令 + 原始输出 / 用例断言），不采信叙述。
> **独立性问题如实声明**：本报告是**提交者自评**（agent 侧），不构成独立复核；按本仓覆盖 4，独立复核由人在验收单上做。

## 1. 逐卡结论

| 卡 | 交付 | 结论 |
|---|---|---|
| t1（抽出推进单点） | `confirm-settle.ts` 新增 `applyConfirmedAdvance`；`applyConfirmDecision` 的迁移块改调它 | 通过：`grep` 命中 :109；`tsc --noEmit` 退出码 0；两个定向文件 2 失败 6 通过（与基线同名同因） |
| t2（早退分支兑现推进） | `AskConfirm.ts` 早退分支：闸门全过 ⇒ 调单点推进 + `confirm-advance` 复位 + 返回 `advanced/from/to` | 通过：TC-1/A1 读回台账 `status=design`；TC-2/A2 `gate_failure.code=decision_log_missing` 且状态不变 |
| t3（窄口径预判 + 两处 await） | `auto-confirm.ts` 改 async + 预判原型存在门；`SubmitArtifact.ts` 两处 await 与 note 带 reason | 通过：TC-5/TC-7；契约三文件 4 失败 56 通过（4 条与基线同名同因） |
| t4（回归用例 + 既有期望修正） | 新增 `tests/confirm-advance-deadlock.test.ts`（10 例）；改 `design-gate-messages` TC-4 第 2 例 | 通过：16 例全绿；四条反向验证必红后逐字节还原 |
| t5（全量回归与基线对账） | 差集对账 | 通过：69 failed / 38 files ≤ 基线 70 / 39；零真实新增失败；`tsc` 零错误；未改 schema |

## 2. 判据对照（需求 A1~A4）

| 判据 | 证据 | 结论 |
|---|---|---|
| A1 已落章 + 闸门通过 ⇒ `advanced:true` 且状态真前进 | TC-1（`store.peek(REQ).status === 'design'` + `statusHistory` 含 design + 评论含 `[自动推进] brainstorming → design`）；TC-6/TC-6b（UI 需求原型/豁免路径）；`design-gate-messages` TC-4 第 2 例（design→decomposing 真推进） | 过 |
| A2 闸门不过 ⇒ `gate_failure` 且状态不变 | TC-2（`decision_log_missing`，状态仍 `brainstorming`）、TC-3（无下一阶段：不报假缺口）、TC-9（design 阶段被 G2 拦下） | 过 |
| A3 UI 需求原型登记前首轮自动确认不再死锁 | TC-5（`triggered:false` + reason 含原型目录与 `reqboard_submit(kind=prototype)`）；TC-7（非 UI 照弹，窄口径不越界）；TC-6b（原型登记后重发即推进） | 过 |
| A4 回归不超基线 | `pnpm typecheck` 零错误；`pnpm test` 69 ≤ 70（38 ≤ 39 文件）；逐条差集零真实新增失败 | 过 |

## 3. 偏离与取舍（如实）

1. **实施期新发现并补了一道门（超出计划 t2 的字面范围）**：原计划的 t2 只写「早退分支兑现推进」。
   实测发现该分支的设计完整性门**只按 `kind=design` 判**，而主路径（`applyConfirmDecision`）按
   `gateForTransition(from,to)?.id === 'G2'` 判——两条口径不一致 ⇒ 在 design 阶段用
   `kind=requirement` 重发确认就能**绕过 G2 直接推进**（「某条路径漏门 = 后门」形态）。
   已把适用条件对齐为「kind=design **或** G2」，并加 **TC-9** 锁死。这不是新增需求，是同一处修复的
   必要防御；不接受它就意味着本次修复本身开了一条后门。
2. **`tests/ask-confirm-pending.test.ts` 一度被改，后**完整还原**（不算本次改动）**：补门前，
   该文件 TC-20 的 `advanced:false` 断言因多了一条推进而红；补门后它重新成立（拦住它的是
   `design_doc_incomplete`）。已 `git diff` 核对：该文件无本次改动残留。**如实记录**，避免"改了又删"
   在审计里看不见。
3. **窄口径预判**（只判原型存在门，不判裁定门/内容门）：与设计 D-3、architecture「为什么不宽口径」一致。
   宽口径会让新 feature 需求在写「讨论与裁定记录」之前永远不被请人确认——那是改 REQ-ce40 决议 #13。
4. **知识层重生成（`pnpm kb:build`）带出一条既有问题**：`design-tokens.md` 被重生成到 219 行，
   超 `K3` 的 200 行上限 ⇒ `pnpm kb:check` 5 项不过（另 4 项 K1/K5/K6/K10 与本次无关）。
   K3 与 K7（生成物与源码一致）在当前脏工作树上**不可同时为真**：K7 是 `tests/kb-generate.test.ts`
   机器校验的那条，故保 K7、披露 K3；根因是**既有未提交的样式改动**使 token 数超限，不在本需求改动面。
5. **t5 的「零 schema 变更」用 mtime 自证**：`git diff --stat src/shared/protocol.ts` 会显示 233 行插入
   ——那是**别的窗口的未提交改动**，不是本次。证据：`stat` 显示 protocol.ts mtime=`01:45:13`，
   而本次改动自 `09:45` 起；本次改动集只有 4 个源文件 + 2 个测试文件。

## 4. 未覆盖 / 遗留（不藏）

- **修复只在工具层生效，未做端到端真机复现**：来源需求 REQ-261006092213-4f5b 的现场（真窗口 + 真弹框）
  未重跑一遍；覆盖该路径的是 TC-6b（真磁盘标本：requirement.md + 原型 + INDEX 权威行 + geometry 块）。
- **`pnpm kb:check` 的 K3/K1/K5/K6/K10 遗留**：如 §3.4，非本需求改动面；若需要，可由对应窗口收口。
- **来源需求 REQ-261006092213-4f5b 自身的验收项改造未触碰**（交接底稿明确划定的边界，D-7）。
