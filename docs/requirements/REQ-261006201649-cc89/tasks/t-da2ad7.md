# t-da2ad7 对照项由可选改硬判据并改读 INDEX 权威行

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
对照项由可选改硬判据并改读 INDEX 权威行

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
跑 npx vitest run tests/verification-prototype-compare-required.test.ts 全绿，且必须含：① 有权威原型 ⇒ 验收单必含 source.kind === 'prototype-compare' 且 prototypePath 等于 INDEX 权威行；② 反向演练 B——把「有权威原型 ⇒ 组装对照项」退化成旧条件化分支后必须有测试变红（同一用例改动前后各跑一次：红 → 绿）；③ 豁免生效需求仍渲染豁免说明行且不阻塞提交；④ 存量需求（旧 createdAt）产出与改动前逐字一致；⑤ 逐项 results 的 ref 键仍是 prototype:<path>，漏项仍被点名。

## 实施方案（implementation）
改 src/application/use-cases/SubmitVerification.ts 的 compareInputsOf / prototypeHtmlPathOf：只要 prototypes/INDEX.md 有唯一 authoritative 行（复用 parsePrototypeIndex，不自己再解析一遍表格）就组装 prototype-compare 项，不再以「台账里有已登记 .html 产物」为条件；INDEX 读不出但台账有产物时降级为既有「排序首项」并在验收材料注明降级（不新增码）；存量需求（createdAt < DOC_QUALITY_RULES_SINCE）原样早退；prototype_exempt 生效需求仍走豁免说明行且不阻塞；非 UI 需求不组装（出现条件不变）；CompareInputs 形状与 ResultBinding 的 ref 键一字不动。新建 tests/verification-prototype-compare-required.test.ts。

## 上游产出摘要（dependsSummary）
- 实现非骨架判据纯函数并锁死阈值口径

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T13:06:44.190Z，窗口 session-786f4cb7-43b2-4437-a439-d6d32b700eed）

t3 收尾：对照项由可选改硬判据并改读 INDEX 权威行，9 条新用例 + 既有 152 条通过。

### 完成项

- 对照项取数改读 INDEX 唯一 authoritative 行
- 台账无产物但 INDEX 有权威行时仍组装该项
- INDEX 取不到时退回台账并在项上标注降级
- 存量需求走原路、不标降级，零回归可核对
- 反向演练 B 以「台账路径不等于权威路径」为靶，退回旧取数必红
- 实施中被既有用例证伪出一处顺序错误并修正，已写进代码注释

### 改动文件

- `src/application/use-cases/SubmitVerification.ts`
- `src/domain/workflow/AcceptanceSheetSpec.ts`
- `tests/verification-prototype-compare-required.test.ts`

### 下一步

t4 判据参数化（依赖 t2 已满足），之后 t5 错误码身份、t6 契约文档

---
