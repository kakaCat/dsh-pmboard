# t-ce9c5b 把实施阶段的 heavy 主档改写成本仓自写完整档·测试

> 需求：REQ-261008190515-5212 把 implementing 移出 vendor 镜像并改写自写实施档

## 在做什么
把实施阶段的 heavy 主档改写成本仓自写完整档·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-08T11:22:24.350Z，窗口 session-f893089d-5bac-45af-a1e7-f6363711848f）

测试段：四条验收判据逐条实测（6293 字符、四关键词在场、与 vendor 有差异、38 passed）

### 完成项

- 验收①：resolveStagePrompt({stage:'implementing',difficulty:'heavy'}).text.length = 6293 < 8000（改前 23852）
- 验收②：注入文本含 The Task Loop / Common Rationalizations / reqboard_task_move / reqboard_task_report 四个关键词
- 验收③：diff -q 两文件有差异（不再是镜像）；vendor 原文仍 20405 字节留档
- 验收④：npx vitest run tests/stage-prompts.test.ts 38 passed
- 附带读数：npx vitest run tests/prompt-tiers.test.ts 37 passed；node scripts/check-prompt-fragments.mjs 退出码 0
- 已知待办（不属本卡）：生成物已更新，P1 基线待 t6 重刷，prompt-baseline 在 t6 之前会红

### 下一步

父卡收口；t6 重刷 P1 基线后 prompt-baseline 复绿

---
