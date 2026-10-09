# t-62c5ea 把人工门放行断言改走人路径

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
把人工门放行断言改走人路径

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/triad-gate.test.ts tests/e2e-triad-gate.test.ts → 3 条「放行」类用例转绿；3 条「缺三要素」类仍红且与设计另案清单逐条对应（不得改断言转绿）。

## 实施方案（implementation）
按 design/fix-design.md「BUG-2」：tests/triad-gate.test.ts 的两条「放行」断言与 tests/e2e-triad-gate.test.ts:117 改走看板人路径（post('/req/move', { id, to: 'implementing', actor: 'human' })，参照 tests/artifact-gates.test.ts:417 的既有写法）；缺三要素类的 3 条断言保持原样、继续红，作为另案证据。只改 tests/，不动 src/。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T17:11:18.738Z，窗口 session-f7cb40a8-a3e9-4949-b879-361611987838）

人工门放行断言改走人路径：3 条放行转绿，3 条缺三要素留作另案证据。

### 完成项

- 父卡收尾汇报：四段子卡（复现/修复/复核/回归）全部完成
- 结果：3 条「放行」类断言转绿（三节齐备放行 / 卡文件不存在不判 / 骨架卡直接过出口）
- 3 条「缺三要素」类按设计原样仍红，作为门禁零调用方的另案证据
- 改动只在两个测试文件：补 handler 替身与 post 助手、两条放行断言改走 actor=human 路径

### 改动文件

- `tests/triad-gate.test.ts`
- `tests/e2e-triad-gate.test.ts`

---
