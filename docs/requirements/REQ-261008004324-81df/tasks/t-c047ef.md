# t-c047ef 补齐会话驱动组装的必填依赖夹具·复核

> 需求：REQ-261008004324-81df reqboard 红测试收口：A 类夹具跟进 + C 类环境基线

## 在做什么
补齐会话驱动组装的必填依赖夹具·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261008004324-81df/design/` 逐条核对；`npx vitest run tests/dive-gate-prompt.test.ts tests/dive-session-driver-wiring.test.ts` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T17:10:19.000Z，窗口 session-f7cb40a8-a3e9-4949-b879-361611987838）

复核段：改动只在测试侧、与设计逐条对齐，另留一条超范围观察未动。

### 完成项

- diff 只含两个测试文件，src/ 零改动（未碰 gate-prompt.ts / pm-capture-root.ts / session-driver.ts）
- 与 design/fix-design.md「BUG-5」前两行逐条对齐，无偏离
- 非阻塞观察：dive-gate-prompt.test.ts:254 用例名仍写「降级为提醒消息」，与零投递语义不符；超出本卡点名范围，未动

---
