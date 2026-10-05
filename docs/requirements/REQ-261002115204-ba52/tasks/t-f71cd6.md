# t-f71cd6 实施片段加「汇报自检」并按 C-16/C-17 重生成校验·研发

> 需求：REQ-261002115204-ba52 长文本工具参数写法约定：防整轮失败的入参约束

## 在做什么
实施片段加「汇报自检」并按 C-16/C-17 重生成校验·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T03:57:21.090Z，窗口 session-06ef20c5-9734-4ee9-b9b2-348ed3a652a5）

这一步做完，实施阶段的提示词自己会提醒「写汇报前先自检」——轻档一行、重档带理由，模型在动手写之前就看到纪律，而不是等报错。产物一致性已校验通过（片段与生成物一致、heavy 正文与 vendor 逐字节一致），并且实测证明产物被单独改过时校验会响亮报错。

### 完成项

- 两处片段源各加一条「汇报自检」：implementing/light/overrides.md 覆盖 4（精简版）、implementing/heavy/overrides.md 覆盖 8（完整版含「防整轮报废」理由）；受 C-17 保护的 heavy 正文与 vendor 原文未动
- C-16 重生成：node scripts/inline-prompt-fragments.mjs → exit 0（128 fragments / 72574 bytes）
- C-17 校验：node scripts/check-prompt-fragments.mjs → exit 0（片段与产物一致、heavy.md ↔ vendor 逐字节一致）
- 反向演练：改一处生成产物 → C-17 非零退出（首个差异偏移 68603，expected 72574 / actual 72576），还原后 exit 0
- 轻档预算：npx vitest run tests/prompt-tiers.test.ts → 40 passed（light 档未超 2500 字符硬预算，本卡只加一行精简条目）
- 口径澄清（如实记录偏差）：验收标准写「grep -c 汇报自检 generated/fragments.ts = 3」，实测为 2（重档 overrides 与轻档 overrides 各一处）；字节数按本次 C-16 实测 72574（旧记录 72702 系上一版文本长度）。「≥1」的实质要求满足，数字口径按实测记录

### 改动文件

- `src/domain/prompt/fragments/implementing/light/overrides.md`
- `src/domain/prompt/fragments/implementing/heavy/overrides.md`
- `src/domain/prompt/generated/fragments.ts`

### 下一步

交复核段核对「轻档只加一行、重档带理由」与 C-17 约束未被破坏，然后收 t4 父卡。

---
