# t-ed72c5 补豁免四组合断言与逆验证·复核

> 需求：REQ-261006091755-1c9e 拆分覆盖门补豁免：prototype_exempt 生效时跳过 UI 卡原型锚点维

## 在做什么
补豁免四组合断言与逆验证·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-06T01:41:11.243Z，窗口 session-dd10c7bd-90d5-4256-8036-cbe2c0a49733）

复核段完成：抓出并补齐设计里的 TC-10（源码锚点），三条逆验证实测可证伪，29 项全绿

### 完成项

- 逐条对照 design/test-cases.md：TC-1～TC-9 与设计矩阵一致（豁免生效×有无已登记原型 / 未生效两态 / 非 UI / 存量）
- 复核抓出一处与设计的偏差：设计列有 TC-10（判据单点源码锚点），实现阶段只做了人工 grep，未落成断言
- 已补齐 TC-10：读 content-gate-wiring.ts、切出 assertUiCardPrototypeAnchors 函数体，断言两个既有函数各命中且无手写 prototype_exempt 判据
- TC-10 可证伪验证：临时在函数体塞一行 doc.frontmatter['prototype_exempt'] → 该用例必红；复原后 29 项全绿
- 断言可证伪复核：三条逆向（删前置红 TC-1/2、放宽条件红 TC-6、塞手写判据红 TC-10）均已实测
- 四文件相关回归 110 项全绿（含 category-doc-sets）
- 复核结论：设计矩阵已 100% 落成断言；唯一偏离（TC-10 缺失）已在复核段内闭环

### 改动文件

- `tests/plan-prototype-anchor-gate.test.ts`

### 下一步

测试段：跑本卡相关用例与全量基线，随后关父卡

---
