# t-609dce 接线回归断言：本段字面量 + 每段显式声明插值开关

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
接线回归断言：本段字面量 + 每段显式声明插值开关

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
① npx vitest run tests/apply-wiring.test.ts 退出码 0，且两条新用例按名命中（-t 单跑）；② 可失败性自证：临时删掉注册处的 interpolate: false → 该用例必红，恢复后转绿（两次输出都要留）。

## 实施方案（implementation）
在 tests/apply-wiring.test.ts 的 capture section 用例里追加两条断言：① reqboard:capture 段的 interpolate === false；② ctx.sections 全部元素的 interpolate 是布尔值（不是 undefined），把「显式声明」钉成仓内纪律。

## 上游产出摘要（dependsSummary）
- 在捕获段注册处声明字面量（interpolate 置 false）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T09:03:57.589Z，窗口 session-e0d71427-d591-4f79-ba30-8dcf9ecf8dc4）

这一段做完，什么变了：以后谁把「本段是字面量」的声明删掉、或新增提示词段忘了声明插值开关，接线回归会立刻变红——同类事故不会第二次静默发生。

### 完成项

- 接线回归新增两条断言（本段字面量 / 每段显式声明），两条单跑均绿
- 证伪半留证：摘掉字段即红，恢复即绿
- diff 面 24 增 1 删（唯一删除是测试桩类型放宽）
- 复核段结论：与设计用例 TC-1 / TC-2 无偏离
- 整文件仅剩 1 条基线自带红（工具清单数量漂移），非本卡引入

### 改动文件

- `tests/apply-wiring.test.ts`

### 下一步

下一张卡：三组外来原文反例回归（t-f0bf3a）

---
