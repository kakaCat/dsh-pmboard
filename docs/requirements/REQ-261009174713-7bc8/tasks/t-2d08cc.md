# t-2d08cc 六个类型包规格落位·复核

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
六个类型包规格落位·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261009174713-7bc8/design/` 逐条核对；`npx vitest run tests/` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-09T11:41:07.047Z，窗口 session-36888e84-b366-4a86-ab5f-be3dfc7daef2）

复核结论：六类型规格与 t1 基线五类字段逐字一致，import 面只到 type-kit（type-only）、包内无函数无 I/O；无偏离。另报一处本卡发现并已修正的契约形状问题。

### 完成项

- 独立复跑：npx vitest run packages/pmboard-type-*/tests → 7 文件 34 例全绿
- 基线等价复跑：六类的 requiredSections 与 requiredDesignDocs 与 conditionalStageArtifacts 与 archive 与 templates 与 t1 基线逐项逐字一致
- 依赖面复核：六个规格文件只 import pmboard-type-kit 的**类型**（type-only），无 bare npm、无 node:、无 brother 包
- 数据纯度复核：六个规格文件里没有 function 与 require 与 readFile——类型包只装声明式数据（符合「不装 I/O 与不装读盘」）
- 修正项（本卡发现）：t7 契约原本把模板字段定成 {stage, path} 扁平形，与现网 NODE_TEMPLATES 的富形状不同形且会丢 designDocs 多份与 description，故按现网形状改为 StageTemplates 并复用 common 的 TemplateRef
- 口径说明：条件设计文档（feature 的 frontend 与 backend）与条件阶段产物（feature 与 refactor 的原型）都在所搬字段里，与 RF-25 规格表逐项对上

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/pmboard-type-kit/src/contract.ts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-type-kit/src/validate.ts`
- `.worktrees/req-261009174713-7bc8/packages/pmboard-type-kit/tests/type-kit.test.ts`

### 下一步

交测试子卡 t-12a9b2。

---
