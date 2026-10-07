# t-271dda 实现可参数化原型对齐判据并改造既有靶子为调用方

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
实现可参数化原型对齐判据并改造既有靶子为调用方

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：ui
- 端侧：frontend

## 得到什么结果
跑 npx vitest run tests/prototype-parity.test.ts 全绿，且必须含：① 三条契约各有正反例（少一个 class / data-* 属性名不符（复现 data-result-src vs data-result-source）/ DOM 顺序颠倒 → 各出违规）；② 每条违规 anchor 非空且形态 prototypes/<name>.html#FR-N；③ 断言只增不减——it(...) 条数 ≥ 改造前；④ 正向样本 REQ-261006175040-12d4 的 card-gates.html 配实现渲染 → 零违规；⑤ pnpm build:client 打印 [verify-client] OK。

## 实施方案（implementation）
新建 src/domain/prototype/ParityContracts.ts：ParityViolation {contract, expected, actual, anchor}、ParityContracts {classes, dataAttrs, order} 与纯函数 prototypeParityViolations(prototypeHtml, implHtml, contracts, prototypeRef)——classes 判子串命中、dataAttrs 带 = 时判属性名+取值域不带 = 只判存在、order 按数组顺序做单调递增定位；每条违规必须带非空 anchor。把 tests/prototype-parity.test.ts 改为「被检需求配置（prototype 路径 / render 渲染入口 / container 取屏 / contracts 三组）+ 通用断言」的调用方：把原 194 行里的文案与行为断言逐条保留为契约项，it 条数不得减少。配置放 tests/ 不进 src/（判据只许读原型量实现，禁止由实现反推原型，见 project-manual 机制备忘）。

## 上游产出摘要（dependsSummary）
- 把非骨架判据接进锚点门并在它之后接几何量证据校验

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T13:18:11.052Z，窗口 session-786f4cb7-43b2-4437-a439-d6d32b700eed）

测试段完成：205 条全绿；tsc 零错误；client 构建新鲜（verify-client OK）；断言只增不减已量化。

### 完成项

- 十个原型套件 205 条全绿
- tsc 对本次三个文件零错误
- build client 新鲜，打印 verify-client OK
- 断言只增不减已量化核对：it 由 15 增至 24
- 正向样本未误伤：判据对真实实现零违规
- 反向已验：改坏一个类名与颠倒顺序各出一违规

### 下一步

t4 收尾完成；剩 t5 错误码三处身份与 t6 契约文档

---
