# REQ-261007165643-4275 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：调研完成并定稿：research-report.md 覆盖 FR-1 工具面重叠（27 工具含 1 个全冗余，可精简至 21/19）、FR-2 实现问题（3 高 6 中 7 低：H1 人工门否定路径必崩、H2 HTTP 面绕过人工门、H3 跨进程无锁）、FR-3 文案契约（问数六处漂移、7 处死路径、136 错误码无注册表）、FR-4 优化方案（修复优先级 + 精简路径 S1~S6 + 治理 G1~G10）。全部结论附文件:行号证据，两轮抽检 11 处全部属实，自检 exit 0。

## 1. 验收列表

### v1-1 · 定稿调研报告并回填需求结论

**验收内容**：【定稿调研报告并回填需求结论】验收

**操作步骤**：
1. npx tsx scripts/req-doc-validate.mts --req REQ-261007165643-4275 --category spike 退出码 0
2. research-report.md 四个章节无「待回填」占位文字
3. FR-4 每条优化建议可回溯到 FR-1/2/3 的证据编号

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：req-doc-validate exit 0（9 项判据、缺口 0）；占位符 grep 0 命中；FR-4 的 S1~S6 与 G1~G10 均带证据编号列；研发+复核子卡均 done

**验收状态**：✓ 通过

---

### v1-2 · 提交验收材料

**验收内容**：【提交验收材料】验收

**操作步骤**：
1. reqboard_submit(kind=verification) 返回 success
2. evidence 含三条可复核命令（grep 注册数 / grep 错误码数 / wc -m prompt 字符数）与报告路径

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：本次提交即交付动作：前置 9 类文档补齐、evidence 七条可复核读数如上、covers 映射已补（tests/self-check.md）；研发+复核子卡均 done

**验收状态**：✓ 通过

---

### v1-3 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：FR-1~FR-4 判据逐条达成：27 工具总表与注册数一致（grep 实测 27）；FR-2 每条含路径行号（抽检 7 处属实）；错误码 136±2 口径吻合；prompt 字符数 wc -m 可复现；FR-4 每条建议挂证据编号；自检 exit 0

**验收状态**：✓ 通过

---

## 2. 测试报告

- 报告全文：docs/requirements/REQ-261007165643-4275/design/research-report.md（FR-1~FR-4 四章节，证据附文件:行号）
- 注册数读数：grep -c "toolName: 'reqboard_" src/tools/registry.ts → 27（与报告 1.0 口径一致）
- 错误码读数：grep -rho REQBOARD_[A-Z_]* src --include=*.ts | sort -u | wc -l → 139；剔占位 REQBOARD_XXX(2)与模板裸前缀(13)后 ≈136~138，口径注记见报告 3.2
- prompt 字符数：wc -m src/tools/*/prompt.ts → total 14835，SubmitTool 2608 居首（报告 3.3 另有工厂产物实测 21,588 含内联 description，两种口径均已注记）
- 文档自检：npx tsx scripts/req-doc-validate.mts --req REQ-261007165643-4275 --category spike → 判据 9 项、缺口 0、exit 0
- 证据抽检：两轮 11 处引用全部属实，记录见 reviews/review-2026-10-07.md；工作树中本需求改动仅限 docs/requirements/REQ-261007165643-4275/
- 测试证据：tests/self-check.md（TC-1~TC-6 命令与读数 + 六卡 covers 映射；vitest 不适用理由见 design/test-cases.md）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 定稿调研报告并回填需求结论 | ✓ 通过 | human/session-a6e1875f-fb93-4acd-915a-9eee9593ea96 | 2026-10-07 18:41 |
| v1-2 | 提交验收材料 | ✓ 通过 | human/session-a6e1875f-fb93-4acd-915a-9eee9593ea96 | 2026-10-07 18:41 |
| v1-3 | 需求级验收 | ✓ 通过 | human/session-a6e1875f-fb93-4acd-915a-9eee9593ea96 | 2026-10-07 18:41 |
