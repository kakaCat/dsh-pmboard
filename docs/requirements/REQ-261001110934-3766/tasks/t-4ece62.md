# t-4ece62 加看板「知识库」只读页·复核

> 需求：REQ-261001110934-3766 代码知识库能力调研：降 token + 快速理解项目

## 在做什么
加看板「知识库」只读页·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
npx vitest run tests/kb-client-page.test.ts → 4 passed；且注册两端 id 一致（main.key = sidebar.panellist.id = pmboard-knowledge）

---
## 汇报 1（2026-10-01T05:23:15.388Z，窗口 session-174b83ab-468d-4345-85b0-edf31c936604）

复核修正了「图标挂在哪儿」的断言口径，并确认两端 id 同源、缺 slots 时响亮失败、样式不动既有选择器。

### 完成项

- 复核 1（已改）：测试断言原把 Icon 当 options 字段 → 按真实契约改为 register 的占用者（第二参数）
- 复核 2（确认）：两端 id 同源（main.key = sidebar.panellist.id），label=知识库、order 紧跟看板
- 复核 3（确认）：缺 slots → 抛错（不静默降级成「页面不存在」）
- 复核 4（确认）：样式分片作为纯新增区段接入，不改既有选择器（verify-client 校验通过）

### 改动文件

- `tests/kb-client-page.test.ts`
- `src/client/styles.ts`

### 下一步

测试：注册单测 + 几何探针

---
