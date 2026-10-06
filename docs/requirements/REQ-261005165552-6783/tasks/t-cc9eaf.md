# t-cc9eaf 在捕获段注册处声明字面量（interpolate 置 false）·复核

> 需求：REQ-261005165552-6783 修复 capture 段被注入文本里的双花括号占位符打挂整轮（注册 interpolate:false）

## 在做什么
在捕获段注册处声明字面量（interpolate 置 false）·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-05T09:02:39.863Z，窗口 session-e0d71427-d591-4f79-ba30-8dcf9ecf8dc4）

复核结论：实现与设计文档逐条一致（无偏离）——改动是纯新增，段契约与文本产能一行未动。

### 完成项

- 逐条对照 design/backend.md S-1：字段落在 order 之后、text 之前，位置一致
- 对照 S-5 边界不变量：git numstat = 14 增 / 0 删，name/order/text 三行未被触碰
- 段文本产能函数零改动：git diff 无删除行，capture 文本断言语义不变
- stage-prompts.test.ts 37 条全绿；capture.test.ts 与 apply-wiring.test.ts 的红为基线自带（改动前后同红），与本次改动无关
- 无偏离：实现与设计文档一致，未出现设计外改动

### 改动文件

- `src/gate-wiring.ts`

### 下一步

父卡收尾：确认子卡链全完成后关闭本卡

---
