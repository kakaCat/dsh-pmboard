# REQ-261006094052-1da2 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v2

**交付结论**：返工交付（针对未过项 v1-7「与裁定对照」）：新增 reviews/decision-mapping.md，D-1~D-7 逐条给出原话来源、落实点（文件:行）与可复核证据，并补记实施期派生裁定 D-2′（G2 后门封堵 + TC-9）。功能修复本身不变：已落章的确认门重发在闸门全过时真的推进、闸门不过时行为逐字不变、UI 需求缺原型不再制造注定失败的确认门；零 schema 变更，全量回归零真实新增失败（69 ≤ 70 基线），typecheck 零错误，文档自检缺口 0。

## 1. 验收列表

### v2-1 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令：npx vitest run tests/confirm-advance-deadlock.test.ts tests/design-gate-messages.test.ts tests/ask-confirm-pending.test.ts → 3 files / 29 tests passed

**验收状态**：✓ 通过

---

## 2. 测试报告

- 裁定对照（返工产物，逐条落实）：docs/requirements/REQ-261006094052-1da2/reviews/decision-mapping.md —— D-1~D-7 每条给「原话来源 / 落实点（文件:行）/ 可复核证据」
- D-2 落实点：src/application/internal/confirm-settle.ts:109（applyConfirmedAdvance 单点）+ src/application/use-cases/AskConfirm.ts:145（早退分支调用）；证据 TC-1/TC-2
- D-3 落实点：src/application/internal/auto-confirm.ts:64-67（只预判原型存在门）；证据 TC-5（UI 不弹）+ TC-7（非 UI 照弹，证明未越界）
- D-4 落实点：AskConfirm.ts:132-175（已落章 + 有下一阶段 + 闸门通过 ⇒ 一次调用内兑现推进）；证据 TC-1/TC-6/TC-6b + ask-confirm-pending TC-20 的 asked===1（未新增弹框）
- D-5 落实点：闸门失败回执带 gate_failure.how 与「未推进」note；自动确认早退 reason 进 submit 回执（SubmitArtifact.ts:203）
- D-1 / D-6 / D-7：独立立项并独占改动面、category=feature·difficulty=expert 差异留痕、来源需求 REQ-261006092213-4f5b 目录零写入
- 实施期派生裁定 D-2′（超出计划的必要防御）：AskConfirm.ts:132-134 把设计完整性门适用条件对齐为「kind=design 或 G2」，封住 kind=requirement 在 design 阶段绕过 G2 的后门；证据 TC-9
- 返工轮新鲜复跑：npx vitest run tests/confirm-advance-deadlock.test.ts tests/design-gate-messages.test.ts tests/ask-confirm-pending.test.ts → 3 files / 29 tests passed
- 返工轮新鲜复跑：npx tsc --noEmit → 退出码 0；npx tsx scripts/req-doc-validate.mts --req REQ-261006094052-1da2 → 缺口 0 / exit 0（rtm-accepting.yml 已由流程生成）
- 测试证据（含 covers 逐卡标注 18 张卡 + §6 返工轮记录）：docs/requirements/REQ-261006094052-1da2/tests/acceptance-evidence.md

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v2-1 | 需求级验收 | ✓ 通过 | human/session-9d5750ad-47dc-4178-b33e-b6531daea6a6 | 2026-10-06 09:58 |
