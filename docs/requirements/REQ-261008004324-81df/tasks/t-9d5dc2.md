# t-9d5dc2 补齐会话驱动组装的必填依赖夹具·复现

> 需求：REQ-261008004324-81df reqboard 红测试收口：A 类夹具跟进 + C 类环境基线

## 在做什么
补齐会话驱动组装的必填依赖夹具·复现

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/dive-gate-prompt.test.ts tests/dive-session-driver-wiring.test.ts` → 修复前失败、修复后通过（贴两次输出）

---
## 汇报 1（2026-10-07T17:10:17.453Z，窗口 session-f7cb40a8-a3e9-4949-b879-361611987838）

复现段：两文件 5 条红复现成功，并拿到「必填依赖缺传 → 整拍静默」的原文证据。

### 完成项

- 红读数：Test Files 2 failed / Tests 5 failed | 12 passed (17)，即卡上所说 2 / 3
- 机制证据：缺 taskStore 时 session-driver.ts:248 首步抛 TypeError，被 :487-492 吞成 info 级，整拍零动作（与三条空数组/0 弹框吻合）
- 用仓外 /tmp 一次性探针复现同形装配拿到原始信息（仓内零写入，探针已删）

---
## 汇报 2（2026-10-07T17:10:28.545Z，窗口 session-f7cb40a8-a3e9-4949-b879-361611987838）

复现段补文件证据：被复现的两个测试文件（本段未编辑）。

### 完成项

- 补文件证据：本段只读不写（未编辑任何文件）；下面列出的是被复现的两个测试文件，作为写入族阶段的文件凭据
- 红读数：Test Files 2 failed / Tests 5 failed | 12 passed (17)，即 2 / 3
- 机制证据：缺 taskStore 时 session-driver.ts:248 首步抛 TypeError，被 :487-492 吞成 info，整拍零动作

### 改动文件

- `tests/dive-gate-prompt.test.ts`
- `tests/dive-session-driver-wiring.test.ts`

---
